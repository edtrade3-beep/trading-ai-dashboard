const { URL } = require("node:url");
const { writeJson } = require("./utils");
const { serveStatic } = require("./static");
const { checkRateLimit } = require("./rate-limit");
const handleAuth = require("./routes/auth");
const handleHealth = require("./routes/health");
const handleWebhooks = require("./routes/webhooks");
const handleProxy = require("./routes/proxy");
const handleYahoo = require("./routes/yahoo");
const handleMarket = require("./routes/market");
const handleInventory = require("./routes/inventory");
const handleJournal = require("./routes/journal");
const handleAgent = require("./routes/agent");
const handlePortfolio = require("./routes/portfolio");
const handleDealership = require("./dealership/routes");
const handlePriceAlerts = require("./routes/price-alerts");
const handleSettings = require("./routes/settings");
const { sendTelegramAlert, sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");

async function handleRequest(req, res) {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = requestUrl;

    if (pathname === "/api/auth/check") {
      return handleAuth(req, res, requestUrl);
    }

    if (pathname === "/api/health") {
      return handleHealth(req, res, requestUrl);
    }

    if (pathname === "/api/webhooks/tradingview" || pathname === "/api/market/tv-alerts") {
      return handleWebhooks(req, res, requestUrl);
    }

    if (pathname.startsWith("/api/fmp/") || pathname.startsWith("/api/td/")) {
      return handleProxy(req, res, requestUrl);
    }

    if (pathname.startsWith("/api/yahoo/")) {
      return handleYahoo(req, res, requestUrl);
    }

    if (pathname.startsWith("/api/market/") || pathname === "/api/live") {
      if (!checkRateLimit(req)) {
        return writeJson(res, 429, { error: "Too many requests. Please slow down." });
      }
      return handleMarket(req, res, requestUrl);
    }

    if (pathname === "/api/inventory" || pathname.startsWith("/api/inventory/")) {
      return handleInventory(req, res, requestUrl);
    }

    if (pathname === "/api/journal" || pathname.startsWith("/api/journal/")) {
      return handleJournal(req, res, requestUrl);
    }

    if (pathname === "/api/agent") {
      return handleAgent(req, res, requestUrl);
    }

    if (pathname === "/api/portfolio" || pathname.startsWith("/api/portfolio/")) {
      return handlePortfolio(req, res, requestUrl);
    }

    if (pathname.startsWith("/api/dealer/")) {
      return handleDealership(req, res, requestUrl);
    }

    if (pathname === "/api/price-alerts" || pathname.startsWith("/api/price-alerts/")) {
      return handlePriceAlerts(req, res, requestUrl);
    }

    if (pathname === "/api/settings") {
      return handleSettings(req, res, requestUrl);
    }

    // POST /api/notify — sends a freeform Telegram message from the platform UI
    if (pathname === "/api/notify" && req.method === "POST") {
      if (!telegramConfigured()) {
        return writeJson(res, 503, { ok: false, error: "Telegram not configured." });
      }
      let body = "";
      for await (const chunk of req) body += chunk;
      const { text } = JSON.parse(body || "{}");
      if (!text) return writeJson(res, 400, { ok: false, error: "Missing text" });
      await sendTelegramMessage(text);
      return writeJson(res, 200, { ok: true });
    }

    // POST /api/telegram/test — sends a test message using env-var credentials only
    if (pathname === "/api/telegram/test" && req.method === "POST") {
      if (!telegramConfigured()) {
        return writeJson(res, 503, { ok: false, error: "Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars." });
      }
      try {
        await sendTelegramAlert({
          symbol: "AXIOM",
          side: "BUY",
          price: null,
          score: 100,
          message: "✅ Dixie AM Trading Platform — Telegram connection confirmed. Alerts are live.",
          at: new Date().toISOString(),
        });
        return writeJson(res, 200, { ok: true, message: "Test message sent to Telegram." });
      } catch (err) {
        return writeJson(res, 500, { ok: false, error: String(err.message || err) });
      }
    }

    // Clean URL aliases
    if (pathname === "/dealer" || pathname === "/dealer/") {
      res.writeHead(302, { Location: "/client/dealer/index.html" });
      res.end();
      return;
    }
    if (pathname === "/workstation" || pathname === "/workstation/") {
      res.writeHead(302, { Location: "/client/trading/workstation.html" });
      res.end();
      return;
    }

    return serveStatic(pathname, res);
  } catch (error) {
    return writeJson(res, 500, {
      error: "Server error",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

module.exports = handleRequest;
