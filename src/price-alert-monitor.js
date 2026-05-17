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

function startPriceAlertMonitor() {
  const interval = setInterval(() => {
    checkPriceAlerts().catch(() => {});
  }, CHECK_INTERVAL_MS);

  // Unref so the monitor doesn't prevent clean shutdown
  if (interval.unref) interval.unref();
}

module.exports = { startPriceAlertMonitor };
