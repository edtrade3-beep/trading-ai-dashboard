const { writeJson, readRequestBody } = require("../utils");
const { TV_WEBHOOK_SECRET, TV_WEBHOOK_MAX_ROWS } = require("../config");
const { sendTelegramAlert, isConfigured: telegramConfigured } = require("../telegram");
const { loadAlerts, saveAlerts, prependAlert } = require("../alert-store");

// In-memory ring buffer seeded from disk on first load
let TV_WEBHOOK_ALERTS = loadAlerts();

function isTradingViewWebhookAuthorized(requestUrl, req) {
  if (!TV_WEBHOOK_SECRET) return true;
  const queryToken = String(requestUrl.searchParams.get("token") || "").trim();
  const headerToken = String(req.headers["x-axiom-token"] || req.headers["x-webhook-token"] || "").trim();
  const authHeader = String(req.headers.authorization || "").trim();
  let bearer = "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    bearer = authHeader.slice(7).trim();
  }
  const provided = queryToken || headerToken || bearer;
  return provided === TV_WEBHOOK_SECRET;
}

function scoreTradingViewPayload(text) {
  const msg = String(text || "").toLowerCase();
  let score = 72;
  if (msg.includes("breakout")) score += 10;
  if (msg.includes("reclaim")) score += 8;
  if (msg.includes("sweep")) score += 8;
  if (msg.includes("unusual")) score += 8;
  if (msg.includes("bearish") || msg.includes("breakdown")) score += 6;
  if (msg.includes("risk") || msg.includes("invalid")) score += 6;
  return Math.max(55, Math.min(99, score));
}

function inferTradingViewSide(rawSide, message) {
  const side = String(rawSide || "").toUpperCase();
  if (["BUY", "LONG", "CALL"].includes(side)) return "BUY";
  if (["SELL", "SHORT", "PUT"].includes(side)) return "SELL";
  const msg = String(message || "").toLowerCase();
  if (msg.includes("buy") || msg.includes("long") || msg.includes("bull")) return "BUY";
  if (msg.includes("sell") || msg.includes("short") || msg.includes("bear")) return "SELL";
  return "INFO";
}

function parseTradingViewPayload(bodyText) {
  const raw = String(bodyText || "").trim();
  if (!raw) return null;
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { message: raw };
  }
  if (!data || typeof data !== "object") return null;
  const message = String(
    data.message || data.text || data.alert_message || data.alertName || data.note || ""
  ).trim();
  const explicitSymbol = String(data.symbol || data.ticker || data.instrument || data.s || "")
    .trim()
    .toUpperCase();
  const tvSymbolMatch = message.match(/(?:NASDAQ|NYSE|AMEX|CBOE|BINANCE|COINBASE):([A-Z0-9.\-]+)/i);
  const rawSymbolMatch = message.match(/\b([A-Z]{1,6}(?:\-[A-Z]{2,5})?)\b/);
  const symbol = explicitSymbol
    || (tvSymbolMatch ? String(tvSymbolMatch[1] || "").toUpperCase() : "")
    || (rawSymbolMatch ? String(rawSymbolMatch[1] || "").toUpperCase() : "");
  if (!symbol) return null;
  const side = inferTradingViewSide(data.side || data.action || data.signal, message);
  const priceNum = Number(data.price || data.close || data.last || 0);
  const timeframe = String(data.timeframe || data.tf || "").toUpperCase();
  const exchange = String(data.exchange || data.market || "").toUpperCase();
  const score = scoreTradingViewPayload(message);
  const type = side === "SELL" ? "risk" : "opportunity";
  return {
    id: `tv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: "tradingview",
    symbol, side, type, score,
    message: message || `${symbol} TradingView alert`,
    exchange: exchange || null,
    timeframe: timeframe || null,
    price: Number.isFinite(priceNum) && priceNum > 0 ? Number(priceNum.toFixed(4)) : null,
    at: new Date().toISOString(),
    raw: data
  };
}

async function handleWebhooks(req, res, requestUrl) {
  const { pathname } = requestUrl;

  if (pathname === "/api/market/tv-alerts") {
    if (!isTradingViewWebhookAuthorized(requestUrl, req)) {
      return writeJson(res, 401, { error: "Unauthorized." });
    }
    const limit = Math.max(1, Math.min(100, Number(requestUrl.searchParams.get("limit") || 30)));
    const symbol = String(requestUrl.searchParams.get("symbol") || "").trim().toUpperCase();
    const rows = TV_WEBHOOK_ALERTS
      .filter((row) => (symbol ? row.symbol === symbol : true))
      .slice(0, limit);
    return writeJson(res, 200, {
      source: "tradingview-webhook",
      secured: Boolean(TV_WEBHOOK_SECRET),
      telegram: telegramConfigured(),
      total: TV_WEBHOOK_ALERTS.length,
      rows
    });
  }

  if (req.method === "GET") {
    return writeJson(res, 200, {
      ok: true,
      endpoint: "/api/webhooks/tradingview",
      method: "POST",
      secured: Boolean(TV_WEBHOOK_SECRET),
      telegram: telegramConfigured(),
      auth: TV_WEBHOOK_SECRET ? "query token (?token=...)" : "none",
      note: 'Send JSON from TradingView alerts. Example: {"symbol":"NVDA","side":"BUY","message":"Breakout above range"}'
    });
  }

  if (req.method !== "POST") {
    return writeJson(res, 405, { error: "Method not allowed. Use POST." });
  }

  if (!isTradingViewWebhookAuthorized(requestUrl, req)) {
    return writeJson(res, 401, {
      error: "Unauthorized webhook token.",
      hint: "Set ?token=YOUR_SECRET in TradingView webhook URL and TV_WEBHOOK_SECRET on server."
    });
  }

  const body = await readRequestBody(req);
  const payload = parseTradingViewPayload(body);
  if (!payload) {
    return writeJson(res, 400, { error: "Invalid TradingView payload." });
  }

  // Store in memory + persist to disk
  TV_WEBHOOK_ALERTS = prependAlert(TV_WEBHOOK_ALERTS, payload);
  if (TV_WEBHOOK_ALERTS.length > TV_WEBHOOK_MAX_ROWS) {
    TV_WEBHOOK_ALERTS.length = TV_WEBHOOK_MAX_ROWS;
  }
  saveAlerts(TV_WEBHOOK_ALERTS);

  // Fire Telegram notification (non-blocking, errors suppressed)
  sendTelegramAlert(payload);

  return writeJson(res, 200, { ok: true, received: payload, total: TV_WEBHOOK_ALERTS.length });
}

module.exports = handleWebhooks;
