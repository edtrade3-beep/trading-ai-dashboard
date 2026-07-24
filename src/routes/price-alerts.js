const { writeJson, readRequestBody } = require("../utils");
const { loadPriceAlerts, savePriceAlerts } = require("../price-alert-store");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("../telegram");

async function handlePriceAlerts(req, res, requestUrl) {
  const { pathname } = requestUrl;

  // GET /api/price-alerts
  if (pathname === "/api/price-alerts" && req.method === "GET") {
    return writeJson(res, 200, { alerts: loadPriceAlerts() });
  }

  // POST /api/price-alerts
  if (pathname === "/api/price-alerts" && req.method === "POST") {
    let body;
    try {
      const raw = await readRequestBody(req);
      body = JSON.parse(raw);
    } catch {
      return writeJson(res, 400, { error: "Invalid JSON body" });
    }

    const symbol = String(body.symbol || "").trim().toUpperCase();
    const targetPrice = Number(body.targetPrice);
    const direction = String(body.direction || "").toLowerCase();

    if (!symbol || !/^[A-Z.\-]{1,10}$/.test(symbol)) {
      return writeJson(res, 400, { error: "Valid symbol is required" });
    }
    if (!targetPrice || targetPrice <= 0) {
      return writeJson(res, 400, { error: "targetPrice must be > 0" });
    }
    if (!["above", "below"].includes(direction)) {
      return writeJson(res, 400, { error: "direction must be 'above' or 'below'" });
    }

    const alerts = loadPriceAlerts();

    // Real dedup — this endpoint used to create a brand-new alert on every
    // call with no idempotency check, which is fine for a one-off manual
    // click but breaks the moment a caller auto-arms an alert every time a
    // panel renders/remounts (confirmed real bug found wiring TrendSetup-
    // Panel.jsx's pivot alert to auto-arm instead of requiring a click —
    // it would have silently created a new duplicate alert, and Telegram
    // message, on every mount). Same symbol+direction+price within a $0.01
    // tolerance (float rounding) and still active → return the existing
    // alert instead of creating a duplicate.
    const existing = alerts.find(a => a.status === "active" && a.symbol === symbol &&
      a.direction === direction && Math.abs(a.targetPrice - targetPrice) < 0.01);
    if (existing) return writeJson(res, 200, { ok: true, alert: existing, deduped: true });

    const alert = {
      id: `pa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      symbol,
      targetPrice,
      direction,
      note: String(body.note || "").slice(0, 200).trim(),
      requireVolume: body.requireVolume === true,  // only fire on a volume-confirmed breakout
      status: "active",
      createdAt: new Date().toISOString(),
      triggeredAt: null,
    };

    // Cap at 50 alerts
    if (alerts.filter(a => a.status === "active").length >= 50) {
      return writeJson(res, 422, { error: "Maximum 50 active price alerts allowed" });
    }
    alerts.unshift(alert);
    savePriceAlerts(alerts);

    if (telegramConfigured()) {
      const dirEmoji = direction === "above" ? "📈" : "📉";
      const noteStr = alert.note ? ` — ${alert.note}` : "";
      sendTelegramMessage(`${dirEmoji} *Price Alert Set*: ${symbol} ${direction} $${targetPrice}${noteStr}`).catch(() => {});
    }

    return writeJson(res, 200, { ok: true, alert });
  }

  // DELETE /api/price-alerts/:id
  const deleteMatch = pathname.match(/^\/api\/price-alerts\/([^/]+)$/);
  if (deleteMatch && req.method === "DELETE") {
    const id = deleteMatch[1];
    const alerts = loadPriceAlerts();
    const idx = alerts.findIndex(a => a.id === id);
    if (idx === -1) return writeJson(res, 404, { error: "Alert not found" });
    alerts.splice(idx, 1);
    savePriceAlerts(alerts);
    return writeJson(res, 200, { ok: true });
  }

  // PATCH /api/price-alerts/:id/cancel
  const cancelMatch = pathname.match(/^\/api\/price-alerts\/([^/]+)\/cancel$/);
  if (cancelMatch && req.method === "PATCH") {
    const id = cancelMatch[1];
    const alerts = loadPriceAlerts();
    const alert = alerts.find(a => a.id === id);
    if (!alert) return writeJson(res, 404, { error: "Alert not found" });
    alert.status = "cancelled";
    savePriceAlerts(alerts);
    return writeJson(res, 200, { ok: true });
  }

  // DELETE /api/price-alerts/clear-history — remove all triggered and cancelled alerts
  if (pathname === "/api/price-alerts/clear-history" && req.method === "DELETE") {
    const alerts = loadPriceAlerts();
    const kept = alerts.filter(a => a.status === "active");
    savePriceAlerts(kept);
    return writeJson(res, 200, { ok: true, removed: alerts.length - kept.length });
  }

  return writeJson(res, 404, { error: "Unknown price-alerts endpoint" });
}

module.exports = handlePriceAlerts;
