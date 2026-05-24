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
const { startMarketScanner, sendMacroReport } = require("./src/market-scanner");
const { startTelegramBot }    = require("./src/telegram-bot");
const { checkDealWatches }   = require("./src/routes/deals");
const { startCOTScheduler }  = require("./src/cot/scheduler");

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
