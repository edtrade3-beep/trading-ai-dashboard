const { loadPriceAlerts, savePriceAlerts } = require("./price-alert-store");
const { sendTelegramAlert, isConfigured } = require("./telegram");
const { fetchJsonSafe, withTimeout } = require("./utils");

const CHECK_INTERVAL_MS = 90_000; // every 90 seconds

// Returns { price, volRatio } — volRatio = today's volume vs the prior ~50-day average.
async function fetchQuote(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`;
    const data = await withTimeout(fetchJsonSafe(url), 8000, null);
    const r = data?.chart?.result?.[0];
    const price = r?.meta?.regularMarketPrice;
    const vols = (r?.indicators?.quote?.[0]?.volume || []).filter((v) => Number.isFinite(v) && v > 0);
    const today = vols.length ? vols[vols.length - 1] : 0;
    const prior = vols.slice(0, -1).slice(-50);
    const avg = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : 0;
    const volRatio = avg > 0 && today ? today / avg : 0;
    return { price: Number.isFinite(price) ? price : null, volRatio };
  } catch {
    return { price: null, volRatio: 0 };
  }
}

const VOL_CONFIRM = 1.4; // today's volume must be ≥1.4× the 50-day average to confirm a breakout

async function checkPriceAlerts() {
  const alerts = loadPriceAlerts();
  const active = alerts.filter(a => a.status === "active");
  if (!active.length) return;

  const symbols = [...new Set(active.map(a => a.symbol))];
  const quotes = {};
  for (const sym of symbols) {
    quotes[sym] = await fetchQuote(sym);
  }

  let changed = false;
  for (const alert of alerts) {
    if (alert.status !== "active") continue;
    const q = quotes[alert.symbol];
    const price = q?.price;
    if (!price) continue;

    const priceCross =
      (alert.direction === "above" && price >= alert.targetPrice) ||
      (alert.direction === "below" && price <= alert.targetPrice);
    // Volume gate: if the alert requires confirmation, hold off until volume is heavy.
    // The alert stays active and re-checks next cycle until both conditions co-occur.
    const volOk = !alert.requireVolume || (q.volRatio || 0) >= VOL_CONFIRM;
    const triggered = priceCross && volOk;

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
          message: `Price Alert: ${alert.symbol} ${alert.direction} $${alert.targetPrice} — now $${price.toFixed(2)}${alert.requireVolume ? ` · vol ${q.volRatio.toFixed(1)}× avg ✅` : ""}${alert.note ? " · " + alert.note : ""}`,
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
    // fetchLivePrice doesn't exist — was never defined anywhere in this file
    // or the codebase, so every call here threw a ReferenceError, silently
    // swallowed by this function's own try/catch. Net effect: this whole
    // T1/target-hit Telegram alert has never fired once since it was
    // written. fetchQuote (above) is this same file's real quote fetcher.
    for (const sym of symbols) prices[sym] = (await fetchQuote(sym)).price;

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
