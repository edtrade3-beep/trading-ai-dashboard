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
const handlePlan = require("./routes/plan");
const handleWatchlist = require("./routes/watchlist");
const handleFinviz = require("./routes/finviz");
const handleScanner = require("./routes/scanner");
const handleDeals   = require("./routes/deals");
const handleCOT     = require("./routes/cot");
const { handleAutoExec } = require("./routes/autoexec");
const { handleLiquidations } = require("./routes/liquidations");
const { handleMonitorExtras } = require("./routes/monitor-extras");
const { handleRecapApi }      = require("./market-recap");
const { handleAdol22Api }     = require("./adol22-scanner");
const { handleUnder10 }       = require("./routes/under10");
const { handleSqueeze }       = require("./routes/squeeze");
const { handleCompression }   = require("./routes/compression");
const { handleInsider }       = require("./routes/insider");
const { handleGapFill }       = require("./routes/gapfill");
const { handleAlpaca }        = require("./routes/alpaca");
const { handleHoldings }      = require("./routes/holdings");
const { handleFed }           = require("./routes/fed");
const { sendTelegramAlert, sendTelegramMessage, sendTelegramVoice, isConfigured: telegramConfigured } = require("./telegram");

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

    if (pathname.startsWith("/api/finviz/")) {
      return handleFinviz(req, res, requestUrl);
    }

    if (pathname === "/api/scanner/under10")      return handleUnder10(req, res, requestUrl);
    if (pathname === "/api/scanner/squeeze")      return handleSqueeze(req, res);
    if (pathname === "/api/scanner/compression")  return handleCompression(req, res, requestUrl);
    if (pathname === "/api/scanner/insider")      return handleInsider(req, res);
    if (pathname === "/api/scanner/gapfill")      return handleGapFill(req, res, requestUrl);

    if (pathname.startsWith("/api/scanner/")) {
      return handleScanner(req, res, requestUrl);
    }

    if (pathname.startsWith("/api/deals/") || pathname === "/api/deals") {
      return handleDeals(req, res, requestUrl);
    }

    if (pathname.startsWith("/api/cot/") || pathname === "/api/cot") {
      return handleCOT(req, res, requestUrl);
    }

    if (pathname.startsWith("/api/autoexec")) {
      return handleAutoExec(req, res, requestUrl);
    }

    if (pathname.startsWith("/api/alpaca/")) {
      return handleAlpaca(req, res, requestUrl);
    }

    if (pathname === "/api/holdings") {
      return handleHoldings(req, res, requestUrl);
    }

    if (pathname === "/api/market/fed-interpret") {
      return handleFed(req, res, requestUrl);
    }

    if (pathname === "/api/crypto/liquidations") {
      return handleLiquidations(req, res, requestUrl);
    }

    if (pathname.startsWith("/api/adol22/")) {
      const handled = await handleAdol22Api(req, res, requestUrl);
      if (handled !== null) return;
    }

    if (pathname.startsWith("/api/recap/")) {
      const handled = await handleRecapApi(req, res, requestUrl);
      if (handled !== null) return;
    }

    if (pathname === "/api/market/futures" ||
        pathname === "/api/market/premarket-movers" ||
        pathname === "/api/market/event-countdowns") {
      return handleMonitorExtras(req, res, pathname);
    }

    if (pathname.startsWith("/api/market/") || pathname === "/api/live") {
      // Chart endpoint is exempt — scanners (Dip Buy, Green Light) batch 60+ calls at once
      if (pathname !== "/api/market/chart" && !checkRateLimit(req)) {
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

    if (pathname === "/api/agent" || pathname.startsWith("/api/agent/")) {
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

    if (pathname === "/api/plan") {
      return handlePlan(req, res);
    }

    if (pathname === "/api/watchlist") {
      return handleWatchlist(req, res);
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

    // POST /api/notify-voice — sends a SPOKEN voice message to Telegram { speak, caption }
    if (pathname === "/api/notify-voice" && req.method === "POST") {
      if (!telegramConfigured()) {
        return writeJson(res, 503, { ok: false, error: "Telegram not configured." });
      }
      let body = "";
      for await (const chunk of req) body += chunk;
      const { speak, caption } = JSON.parse(body || "{}");
      if (!speak) return writeJson(res, 400, { ok: false, error: "Missing speak" });
      await sendTelegramVoice(speak, caption);
      return writeJson(res, 200, { ok: true });
    }

    // GET /api/telegram/getchatid — call getUpdates to find who messaged the bot recently
    if (pathname === "/api/telegram/getchatid" && req.method === "GET") {
      const token = process.env.TELEGRAM_BOT_TOKEN || "";
      if (!token) return writeJson(res, 200, { ok: false, error: "TELEGRAM_BOT_TOKEN not set" });
      try {
        const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=20&offset=-20`);
        const d = await r.json().catch(() => ({}));
        if (!d.ok) return writeJson(res, 200, { ok: false, error: d.description || "getUpdates failed" });
        const chats = [];
        const seen  = new Set();
        for (const upd of (d.result || [])) {
          const chat = upd.message?.chat || upd.channel_post?.chat || upd.my_chat_member?.chat;
          if (chat && !seen.has(chat.id)) {
            seen.add(chat.id);
            chats.push({ id: String(chat.id), type: chat.type, title: chat.title || null, username: chat.username || null, firstName: chat.first_name || null });
          }
        }
        return writeJson(res, 200, { ok: true, chats, hint: chats.length === 0 ? "No recent messages found. Send /start or any message to your bot first, then click GET CHAT ID again." : null });
      } catch (err) {
        return writeJson(res, 200, { ok: false, error: err.message });
      }
    }

    // GET /api/telegram/status — diagnose token + chat ID without sending
    if (pathname === "/api/telegram/status" && req.method === "GET") {
      const token  = process.env.TELEGRAM_BOT_TOKEN || "";
      const chatId = process.env.TELEGRAM_CHAT_ID   || "";
      const configured = Boolean(token && chatId);
      if (!configured) {
        return writeJson(res, 200, { ok: false, configured: false,
          error: "TELEGRAM_BOT_TOKEN and/or TELEGRAM_CHAT_ID not set in environment variables." });
      }
      // Verify token is valid with Telegram
      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const tgJson = await tgRes.json().catch(() => ({}));
        return writeJson(res, 200, {
          ok: tgJson.ok,
          configured: true,
          tokenSet: true,
          chatIdSet: true,
          tokenMasked: token.slice(0, 6) + "..." + token.slice(-4),
          chatId: chatId,
          botName: tgJson.result?.first_name || null,
          botUsername: tgJson.result?.username || null,
          telegramError: tgJson.ok ? null : (tgJson.description || "Invalid token"),
        });
      } catch (err) {
        return writeJson(res, 200, { ok: false, configured: true, error: err.message });
      }
    }

    // POST /api/telegram/test — sends a test message using env-var credentials only
    if (pathname === "/api/telegram/test" && req.method === "POST") {
      if (!telegramConfigured()) {
        return writeJson(res, 503, { ok: false, error: "Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars on Render." });
      }
      try {
        const token  = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        const tgRes  = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "✅ AM Trading Platform — Test alert. Telegram is working! Scan alerts will appear here.",
          }),
        });
        const tgJson = await tgRes.json().catch(() => ({}));
        if (!tgJson.ok) {
          return writeJson(res, 500, { ok: false, error: tgJson.description || "Telegram rejected message", code: tgJson.error_code });
        }
        return writeJson(res, 200, { ok: true, message: "Test message delivered to Telegram." });
      } catch (err) {
        return writeJson(res, 500, { ok: false, error: err.message });
      }
    }

    // GET /api/cloud/load  — load saved platform data from server disk
    // POST /api/cloud/save — save platform data to server disk
    if (pathname === "/api/cloud/load" && req.method === "GET") {
      const fs = require("node:fs");
      const path = require("node:path");
      const file = path.join(__dirname, "../data/cloud-save.json");
      try {
        const raw = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
        const data = raw ? JSON.parse(raw) : null;
        return writeJson(res, 200, { ok: true, data, savedAt: data?.savedAt || null });
      } catch (e) {
        return writeJson(res, 200, { ok: false, error: e.message });
      }
    }
    if (pathname === "/api/cloud/save" && req.method === "POST") {
      const fs = require("node:fs");
      const path = require("node:path");
      let body = "";
      for await (const chunk of req) body += chunk;
      try {
        const payload = JSON.parse(body || "{}");
        const dir = path.join(__dirname, "../data");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const toSave = { ...payload, savedAt: new Date().toISOString() };
        fs.writeFileSync(path.join(dir, "cloud-save.json"), JSON.stringify(toSave, null, 2), "utf8");
        return writeJson(res, 200, { ok: true, savedAt: toSave.savedAt });
      } catch (e) {
        return writeJson(res, 500, { ok: false, error: e.message });
      }
    }

    // Clean URL aliases
    if (pathname === "/dealer" || pathname === "/dealer/") {
      res.writeHead(302, { Location: "/client/dealer/index.html" });
      res.end();
      return;
    }
    if (pathname === "/crm" || pathname === "/crm/") {
      res.writeHead(302, { Location: "/client/dealer/crm.html" });
      res.end();
      return;
    }
    if (pathname === "/workstation" || pathname === "/workstation/") {
      // Workstation replaced by Smart Scanner deep dive — redirect to main platform
      res.writeHead(302, { Location: "/" });
      res.end();
      return;
    }
    if (pathname === "/quran" || pathname === "/quran/") {
      res.writeHead(302, { Location: "/client/quran.html" });
      res.end();
      return;
    }

    return serveStatic(pathname, res, req);
  } catch (error) {
    return writeJson(res, 500, {
      error: "Server error",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

module.exports = handleRequest;
