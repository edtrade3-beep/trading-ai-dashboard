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

// Safety net: without this, ANY uncaught error anywhere (a background scanner
// tick, an unawaited route promise, a bad API response) kills the whole
// process and takes every user down. Log and keep serving instead of dying.
//
// console.error alone is invisible unless someone is tailing Render logs —
// alertOnce also pages Telegram, debounced per label (max 1 per 10 min) so a
// crash-loop or a repeatedly-failing 5-min interval doesn't spam.
const { sendTelegramMessage } = require("./src/telegram");
const ALERT_DEBOUNCE_MS = 10 * 60_000;
const _lastAlertAt = {};
function alertOnce(label, message) {
  const now = Date.now();
  if (_lastAlertAt[label] && now - _lastAlertAt[label] < ALERT_DEBOUNCE_MS) return;
  _lastAlertAt[label] = now;
  sendTelegramMessage(message);
}

process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err && err.stack || err);
  alertOnce("unhandledRejection", `⚠️ unhandledRejection: ${(err && err.message) || err}`);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err && err.stack || err);
  alertOnce("uncaughtException", `⚠️ uncaughtException: ${(err && err.message) || err}`);
});

const { PORT, HOST } = require("./src/config");
const handleRequest = require("./src/router");
const { startPriceAlertMonitor } = require("./src/price-alert-monitor");
const { startMarketScanner, sendMacroReport, scanWatchlistAlerts, scanEntryZoneAlerts } = require("./src/market-scanner");
const { startTelegramBot }    = require("./src/telegram-bot");
const { checkDealWatches }   = require("./src/routes/deals");
const { startCOTScheduler }  = require("./src/cot/scheduler");
const { startPreMarketAlerts } = require("./src/premarket-alerts");
const { runMarketRecap }       = require("./src/market-recap");
const { runMorningGamePlan, runTradeCoach, runWeeklyReview, runMonthlyDeepReview, runApexBriefing } = require("./src/ai-coach");
const { runCeoRecommendation } = require("./src/ceo-ai");
const { buildCommandCenter } = require("./src/command-center-ai");
const { runPredictionTracker } = require("./src/prediction-tracker");
const { runAutopilotRecap } = require("./src/alpaca-recap");
const { runServerAutopilot } = require("./src/server-autopilot");
const { runTrailingStops } = require("./src/trailing-stops");
const { runMeanrevPaper, sendMeanrevSummary } = require("./src/meanrev-paper");
const { pollGmailLeads } = require("./src/gmail-leads");
const { runAdol22, handleAdol22Api } = require("./src/adol22-scanner");
const { updateCOTData, isDataFresh } = require("./src/cot/cotService");

const server = http.createServer(handleRequest);

// If DATABASE_URL is set, every data/*.json store (journal, portfolio,
// dealer inventory, ~25 total — see src/atomic-write.js) is backed by
// Postgres instead of the app's own ephemeral disk, which was discovered
// this session to silently wipe on every deploy/restart despite showing a
// persistent disk as "attached". Bootstrap MUST complete before the server
// accepts any requests (a route reading/writing before the cache is warm
// would see stale/empty data) — and if DATABASE_URL is set but the
// connection fails, refuse to start rather than silently falling back to
// the ephemeral-disk behavior this exists to replace.
const { initPgStore } = require("./src/atomic-write");
const { initPhotoStore } = require("./src/dealership/photo-store");

Promise.all([initPgStore(), initPhotoStore()])
  .then(() => startServer())
  .catch((err) => {
    console.error("[startup] DATABASE_URL is set but Postgres bootstrap failed — refusing to start:", err.message);
    process.exit(1);
  });

function startServer() {
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
  // startFbScheduler();  // disabled
  startMarketScanner();   // 15-min stock scan → grouped BUY/SELL alerts (batched, quiet hours respected)
  startTelegramBot();
  // startCOTScheduler(); // disabled — COT reports were firing 7x/day (too much noise)
  startPreMarketAlerts(); // ONE gap scan alert at 9:00 AM ET only
  try { require("./src/dealership/fb-hub").startCrmScheduler(); } catch (e) { console.error("CRM scheduler failed:", e.message); }

  // Persistent default watchlist — baked into code so buy-point ALERTS survive
  // Render free-tier restarts (which wipe the settings file). Merged with whatever
  // the app has saved in settings.
  const DEFAULT_WATCHLIST = [
    "MU","TSM","VRT","NEE","WMB","CCJ","CEG","DELL","AVGO","SMCI",       // AI infrastructure
    "MARA","RIOT","CLSK","CIFR","WULF","IREN","CORZ","HUT",              // Bitcoin miners
  ];
  // Watchlist alerts — scan every 15 min for Bull BOS + high score
  // Entry zone alerts — scan every 15 min for price entering buy zones
  setInterval(() => {
    try {
      const { loadSettings } = require("./src/settings-store");
      const settings = loadSettings() || {};
      const saved = Array.isArray(settings.watchlistSymbols) ? settings.watchlistSymbols :
                 Array.isArray(settings.watchlists?.[0]?.symbols) ? settings.watchlists[0].symbols : [];
      const wl = [...new Set([...saved, ...DEFAULT_WATCHLIST])];   // always includes the defaults
      if (wl.length > 0) {
        scanWatchlistAlerts(wl).catch(() => {});
        scanEntryZoneAlerts(wl, {}).catch(() => {}); // {} = no 5X ref, uses 52w range
      }
    } catch {}
  }, 15 * 60_000);
  console.log("[WL Alerts] Watchlist + Entry Zone scanner active — checks every 15 min");

  // Prediction tracker — grades Command Center's open trade ideas against
  // real current prices. Real price checks only (no AI cost), so this runs
  // far more often than Command Center's own once-daily generation —
  // hourly catches a hit/stop soon after it happens instead of waiting a
  // full day, with no cost trade-off since nothing here calls the AI.
  setInterval(() => { runPredictionTracker().catch(() => {}); }, 60 * 60_000);
  console.log("[Predictions] Tracker active — grades open ideas every hour");

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

  // Macro reports: 10 AM (market check-in) + 3:30 PM (power hour alert)
  let _macroSent = { "10": null, "15": null };
  const _sendScheduledMacro = () => {
    const et  = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const h   = et.getHours(), m = et.getMinutes(), day = et.getDay();
    const today = `${et.getFullYear()}-${et.getMonth()}-${et.getDate()}`;
    if (day < 1 || day > 5) return;
    // 10:00 AM — morning market check-in
    if (h === 10 && m < 5 && _macroSent["10"] !== today) {
      _macroSent["10"] = today;
      sendMacroReport().catch(() => {});
    }
      // 3:30 PM macro disabled — one daily report is enough
  };
  setInterval(_sendScheduledMacro, 5 * 60_000);
  console.log("[Macro] Scheduled macro report: 10:00 AM ET weekdays only");

  // 3:45 PM — Daily Market Recap (video script + Telegram)
  let _recapSent = null;
  setInterval(() => {
    const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const h = et.getHours(), m = et.getMinutes(), day = et.getDay();
    const today = `${et.getFullYear()}-${et.getMonth()}-${et.getDate()}`;
    if (day < 1 || day > 5) return;
    if (h === 15 && m >= 44 && m < 50 && _recapSent !== today) {
      _recapSent = today;
      runMarketRecap().catch(() => {});
    }
  }, 60_000);
  console.log("[Recap] 3:45 PM market recap scheduled — weekdays only");

  // AI Morning Game Plan (~9:40 AM ET) + AI Trade Coach (~4:15 PM ET) — weekdays, server-side.
  // Autopilot recap (~4:05 PM ET) — what the Alpaca paper autopilot did today.
  let _gpSent = null, _coachSent = null, _recapAP = null, _weeklySent = null, _monthlyReview = null, _mrvPaper = null, _mrvSummary = null, _apexSent = null, _ceoSent = null, _aplusSnapshot = null, _cmdCenterSent = null;
  setInterval(() => {
    const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const h = et.getHours(), m = et.getMinutes(), day = et.getDay();
    const today = `${et.getFullYear()}-${et.getMonth()}-${et.getDate()}`;
    if (day < 1 || day > 5) return;
    // Morning Brief 8:00 ET / CEO AI 8:10 ET — moved earlier from 9:15/9:25 at
    // the user's request so there's real pre-market reading time (80 min
    // before the 9:30 open) instead of a 5-minute-before-the-bell fire.
    // Kept as a pair with the same ~10 min gap so CEO AI still reads that
    // morning's actual persisted Morning Brief, not yesterday's.
    if (h === 8 && m >= 0 && m < 6 && _apexSent !== today) { _apexSent = today; runApexBriefing().catch(() => {}); }
    if (h === 8 && m >= 10 && m < 16 && _ceoSent !== today) { _ceoSent = today; runCeoRecommendation().catch(() => {}); }
    // Command Center 8:20 ET — after Apex/CEO AI have run, using whatever
    // real ADVISOR AI brief already exists (however recently generated —
    // ADVISOR itself is on-demand only, no daily auto-run, so this doesn't
    // force a same-day dependency; buildCommandCenter() safely no-ops if no
    // ADVISOR brief exists at all yet).
    if (h === 8 && m >= 20 && m < 26 && _cmdCenterSent !== today) { _cmdCenterSent = today; buildCommandCenter().catch(() => {}); }
    if (h === 9 && m >= 40 && m < 46 && _gpSent !== today) { _gpSent = today; runMorningGamePlan().catch(() => {}); }
    if (h === 16 && m >= 5 && m < 11 && _recapAP !== today) { _recapAP = today; runAutopilotRecap().catch(() => {}); }
    if (h === 16 && m >= 15 && m < 21 && _coachSent !== today) { _coachSent = today; runTradeCoach().catch(() => {}); }
    // Weekly review — Friday (day 5) ~4:30 PM ET
    if (day === 5 && h === 16 && m >= 30 && m < 36 && _weeklySent !== today) { _weeklySent = today; runWeeklyReview().catch(() => {}); }
    // Monthly Deep Review (Fable) — 1st of the month ~4:35 PM ET
    if (et.getDate() === 1 && h === 16 && m >= 35 && m < 41 && _monthlyReview !== today) { _monthlyReview = today; runMonthlyDeepReview().catch(() => {}); }
    // Mean-rev paper tracker — update after close (~4:20 PM ET), weekly summary Friday (~4:25)
    if (h === 16 && m >= 20 && m < 26 && _mrvPaper !== today) { _mrvPaper = today; runMeanrevPaper().catch(() => {}); }
    if (day === 5 && h === 16 && m >= 25 && m < 31 && _mrvSummary !== today) { _mrvSummary = today; sendMeanrevSummary().catch(() => {}); }
    // A+ Score forward-tracking snapshot — logs today's real score + real
    // price for every scanned symbol, ~4:40 PM ET after close settles.
    // Pure forward log (no historical backfill/reconstruction) so later
    // runs can honestly check whether higher-scored names actually moved
    // more, using only real data recorded from today onward.
    if (h === 16 && m >= 40 && m < 46 && _aplusSnapshot !== today) {
      _aplusSnapshot = today;
      require("./src/aplus-score-history").logDailySnapshot().catch((e) => console.error("[A+ Score history] snapshot failed:", e.message));
    }
  }, 60_000);
  console.log("[AI] Morning Brief 8:00 · CEO AI 8:10 · Game plan 9:40 · autopilot recap 4:05 · trade coach 4:15 PM — weekdays only");

  // Email lead auto-reply (CarGurus + direct customer emails + dealer
  // website contact form — no longer CarGurus-only) — poll Gmail every 3
  // min (only if GMAIL_USER/APP_PASSWORD set).
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    pollGmailLeads().catch(() => {});
    setInterval(() => pollGmailLeads().catch(() => {}), 3 * 60_000);
    console.log("[Leads] Email auto-reply active — polling every 3 min");
  }

  // Server-side autopilot — trades A+ buy-points on Alpaca paper with NO browser
  // open. Only runs when SERVER_AUTOPILOT="on". Every 5 min (market-hours gated inside).
  if (require("./src/utils").isOn(process.env.SERVER_AUTOPILOT)) {
    setInterval(() => runServerAutopilot().catch((err) => {
      console.error("[Server autopilot] tick failed:", (err && err.stack) || err);
      alertOnce("autopilot", `⚠️ Server autopilot tick failed: ${(err && err.message) || err}`);
    }), 5 * 60_000);
    setInterval(() => runTrailingStops().catch(() => {}), 5 * 60_000);   // ratchet stops up on winners
    console.log("[Server autopilot] ACTIVE — trades + trailing stops on Alpaca paper, no browser needed");
  }

  // ADOL22 — scan every 15 min during market hours (9:30 AM – 4:00 PM ET)
  setInterval(() => {
    try {
      const { loadSettings } = require("./src/settings-store");
      const s  = loadSettings() || {};
      const wl = Array.isArray(s.watchlistSymbols) ? s.watchlistSymbols : [];
      runAdol22(wl).catch(() => {});
    } catch {}
  }, 15 * 60_000);
  console.log("[ADOL22] Market scanner active — every 15 min, market hours only");

  // Deal watches: disabled from Telegram (not trading-related)
  // setInterval(checkDealWatches, 30 * 60 * 1000);

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
}
