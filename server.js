const http = require("node:http");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");

// Load .env file if present (no dotenv dependency needed)
(function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
})();

const { PORT, HOST } = require("./src/config");
const handleRequest = require("./src/router");
const { startPriceAlertMonitor } = require("./src/price-alert-monitor");
const { startFbScheduler } = require("./src/fb-scheduler");
const { startMarketScanner, sendMacroReport, scanWatchlistAlerts } = require("./src/market-scanner");
const { startTelegramBot }    = require("./src/telegram-bot");
const { checkDealWatches }   = require("./src/routes/deals");
const { startCOTScheduler }  = require("./src/cot/scheduler");
const { startPreMarketAlerts } = require("./src/premarket-alerts");
const { updateCOTData, isDataFresh } = require("./src/cot/cotService");

const server = http.createServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.log(`Institutional Trading Analyst running at http://localhost:${PORT}`);
  const ifaces = os.networkInterfaces();
  const lanIps = Object.values(ifaces)
    .flat()
    .filter((x) => x && x.family === "IPv4" && !x.internal)
    .map((x) => x.address);
  for (const ip of lanIps) {
    console.log(`LAN access: http://${ip}:${PORT}`);
  }
  startPriceAlertMonitor();
  startFbScheduler();
  startMarketScanner();   // 15-min stock scan → grouped BUY/SELL alerts
  startTelegramBot();
  startCOTScheduler();    // COT bias reports at 7 scheduled ET times M-F
  startPreMarketAlerts(); // Gap scan Telegram alerts at 7:00 AM and 9:00 AM ET

  // Watchlist-specific alerts — scan user's saved watchlist every 15 min
  setInterval(() => {
    try {
      const { loadSettings } = require("./src/settings-store");
      const settings = loadSettings() || {};
      const wl = Array.isArray(settings.watchlistSymbols) ? settings.watchlistSymbols :
                 Array.isArray(settings.watchlists?.[0]?.symbols) ? settings.watchlists[0].symbols : [];
      if (wl.length > 0) scanWatchlistAlerts(wl).catch(() => {});
    } catch {}
  }, 15 * 60_000);
  console.log("[WL Alerts] Watchlist scanner active — checks every 15 min");

  // Auto-download CFTC data on startup if not already fresh
  setTimeout(() => {
    if (!isDataFresh()) {
      console.log("[COT] No fresh data found — downloading CFTC reports now...");
      updateCOTData()
        .then(r => console.log(`[COT] Startup download complete: ${r.marketsUpdated} markets updated`))
        .catch(e => console.error("[COT] Startup download failed:", e.message));
    } else {
      console.log("[COT] Data already fresh — skipping startup download");
    }
  }, 10_000); // wait 10s for server to fully stabilize

  // ── 30-min macro report: Risk On/Off, SPY QQQ IWM, macro instruments ────
  setInterval(() => { sendMacroReport().catch(e => console.error("[Macro]", e.message)); }, 30 * 60 * 1000);
  setTimeout(() => { sendMacroReport().catch(() => {}); }, 3 * 60 * 1000); // first report 3 min after boot
  console.log("[Macro] 30-min macro report scheduler started");

  // Deal watch scanner — check every 30 min, send Telegram alerts for new deals
  setInterval(checkDealWatches, 30 * 60 * 1000);
  setTimeout(checkDealWatches, 90 * 1000); // first check 90s after boot
  console.log("[Deals] Background watch scanner started (every 30 min)");

  // Keep-alive: ping own health endpoint every 10 min so Render free tier never idles out
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
  if (RENDER_URL) {
    const pingUrl = `${RENDER_URL}/api/health`;
    setInterval(() => {
      fetch(pingUrl).catch(() => {});
    }, 10 * 60 * 1000);
    console.log(`[Keep-alive] Pinging ${pingUrl} every 10 min`);
  }
});
