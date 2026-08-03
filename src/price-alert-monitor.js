const { loadPriceAlerts, savePriceAlerts } = require("./price-alert-store");
const { sendTelegramAlert, sendTelegramMessage, isConfigured } = require("./telegram");
const { fetchJsonSafe, withTimeout } = require("./utils");
const { shouldSendAlert } = require("./telegram-bot");

// Tightened 90s -> 30s (2026-08-03, real user complaint: "sometimes i get
// notification late" — a stock crossing right after a check previously
// waited up to 90s for the next poll, on top of Telegram delivery time.
// Still light: one Yahoo chart fetch per unique *active* alert symbol,
// typically a handful at once, not the whole scan universe.
const CHECK_INTERVAL_MS = 30_000;

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

  // Real bug fixed 2026-08-03 (user report: "sometimes i get notification
  // late" — investigating this found something worse than late: a
  // price-crossed alert used to be marked status="triggered" (permanently
  // done, never re-checked) the instant its price/volume conditions were
  // met, *before* knowing whether shouldSendAlert()'s shared cooldown/daily
  // cap would actually let the Telegram send through. If it didn't, the
  // message was silently dropped and the alert was already "used up" —
  // no retry, ever. Now status is only flipped once the send has actually
  // been attempted; a gated alert stays "active" and gets retried on the
  // very next 30s cycle instead of being lost.
  let changed = false;
  const crossed = [];
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
    if (priceCross && volOk) crossed.push({ alert, price, volRatio: q.volRatio });
  }

  // Batch same-cycle triggers into ONE Telegram message instead of N
  // (2026-07-29, "too many alerts in telegram") — a broad market move can
  // flip several price alerts in the same cycle, which used to fire one
  // separate message per alert. Single-trigger case keeps the original
  // per-alert message format unchanged.
  //
  // Telegram never configured at all is a permanent condition, not a
  // transient gate — mark these triggered anyway (matches the original
  // behavior: the alert's own "triggered" status in the UI is still real
  // and correct even with nothing to send it to; there's nothing to retry
  // toward). Only the shouldSendAlert cooldown/cap gate below is transient
  // and worth retrying.
  if (crossed.length && !isConfigured()) {
    const now = new Date().toISOString();
    for (const { alert } of crossed) { alert.status = "triggered"; alert.triggeredAt = now; }
    changed = true;
  } else if (crossed.length && isConfigured() && shouldSendAlert({ category: "target-hit" })) {
    const now = new Date().toISOString();
    for (const { alert } of crossed) { alert.status = "triggered"; alert.triggeredAt = now; }
    changed = true;
    if (crossed.length === 1) {
      const { alert, price, volRatio } = crossed[0];
      sendTelegramAlert({
        symbol: alert.symbol,
        side: alert.direction === "above" ? "BUY" : "SELL",
        price,
        score: 85,
        message: `Price Alert: ${alert.symbol} ${alert.direction} $${alert.targetPrice} — now $${price.toFixed(2)}${alert.requireVolume ? ` · vol ${volRatio.toFixed(1)}× avg ✅` : ""}${alert.note ? " · " + alert.note : ""}`,
        at: alert.triggeredAt,
      });
    } else {
      const lines = crossed.map(({ alert, price, volRatio }) =>
        `${alert.symbol} ${alert.direction} $${alert.targetPrice} — now $${price.toFixed(2)}${alert.requireVolume ? ` · vol ${volRatio.toFixed(1)}× avg ✅` : ""}${alert.note ? " · " + alert.note : ""}`
      );
      sendTelegramMessage(`🎯 ${crossed.length} PRICE ALERTS TRIGGERED\n\n${lines.join("\n")}`).catch(() => {});
    }
  }
  // else: crossed but gated (cooldown/daily cap/not configured) — every
  // alert in `crossed` is intentionally left "active" so checkPriceAlerts
  // retries it next cycle instead of silently losing the notification.

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
      if (!shouldSendAlert({ category: "target-hit" })) continue;
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
