const { loadPriceAlerts, savePriceAlerts } = require("./price-alert-store");
const { sendTelegramAlert, isConfigured } = require("./telegram");
const { fetchJsonSafe, withTimeout } = require("./utils");

const CHECK_INTERVAL_MS = 90_000; // every 90 seconds

async function fetchLivePrice(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
    const data = await withTimeout(fetchJsonSafe(url), 8000, null);
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

async function checkPriceAlerts() {
  const alerts = loadPriceAlerts();
  const active = alerts.filter(a => a.status === "active");
  if (!active.length) return;

  const symbols = [...new Set(active.map(a => a.symbol))];
  const prices = {};
  for (const sym of symbols) {
    prices[sym] = await fetchLivePrice(sym);
  }

  let changed = false;
  for (const alert of alerts) {
    if (alert.status !== "active") continue;
    const price = prices[alert.symbol];
    if (!price) continue;

    const triggered =
      (alert.direction === "above" && price >= alert.targetPrice) ||
      (alert.direction === "below" && price <= alert.targetPrice);

    if (triggered) {
      alert.status = "triggered";
      alert.triggeredAt = new Date().toISOString();
      changed = true;

      if (isConfigured()) {
        sendTelegramAlert({
          symbol: alert.symbol,
          side: alert.direction === "above" ? "BUY" : "SELL",
          price,
          score: 85,
          message: `Price Alert: ${alert.symbol} ${alert.direction} $${alert.targetPrice} — now $${price.toFixed(2)}${alert.note ? " · " + alert.note : ""}`,
          at: alert.triggeredAt,
        });
      }
    }
  }

  if (changed) savePriceAlerts(alerts);
}

// ── T1 / Target Hit alerts from open journal trades ──────────────────────────
const T1_COOLDOWN = new Map(); // ticker → last alert timestamp

async function checkT1Alerts() {
  if (!isConfigured()) return;
  try {
    const fs   = require("fs");
    const path = require("path");
    const file = path.join(__dirname, "../data/journal.json");
    if (!fs.existsSync(file)) return;
    const entries = JSON.parse(fs.readFileSync(file, "utf8") || "[]");
    const open    = entries.filter(e => e.status === "open" && e.target && e.ticker);
    if (!open.length) return;

    const symbols = [...new Set(open.map(e => e.ticker))];
    const prices  = {};
    for (const sym of symbols) prices[sym] = await fetchLivePrice(sym);

    const now = Date.now();
    for (const trade of open) {
      const price  = prices[trade.ticker];
      if (!price) continue;
      const target = Number(trade.target);
      const entry  = Number(trade.entry || 0);
      const side   = (trade.side || "BUY").toUpperCase();
      if (!target || !entry) continue;

      const hit = side === "BUY"  ? price >= target :
                  side === "SELL" ? price <= target : false;
      if (!hit) continue;

      const cooldownKey = `${trade.id || trade.ticker}_t1`;
      const last        = T1_COOLDOWN.get(cooldownKey) || 0;
      if (now - last < 24 * 60 * 60 * 1000) continue; // 24h cooldown — once per trade only

      T1_COOLDOWN.set(cooldownKey, now);
      const rr = entry > 0 ? Math.abs((target - entry) / (entry - Number(trade.stopLoss || entry))).toFixed(1) : "—";
      const pnl = trade.size ? Math.round(Math.abs(price - entry) * Number(trade.size)) : null;

      sendTelegramAlert({
        symbol: trade.ticker,
        side,
        price,
        score: 90,
        message: [
          `🎯 TARGET HIT — ${trade.ticker}`,
          `Entry: $${entry} → Now: $${price.toFixed(2)}`,
          pnl ? `P&L: +$${pnl}` : "",
          `R:R ${rr}R · GET OUT EARLY`,
          `Move stop to breakeven. Take 50-100% off.`,
        ].filter(Boolean).join("\n"),
        at: new Date().toISOString(),
      });
    }
  } catch {}
}

function startPriceAlertMonitor() {
  const interval = setInterval(() => {
    checkPriceAlerts().catch(() => {});
    checkT1Alerts().catch(() => {});
  }, CHECK_INTERVAL_MS);

  if (interval.unref) interval.unref();
}

module.exports = { startPriceAlertMonitor };
