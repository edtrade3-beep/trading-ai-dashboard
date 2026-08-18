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
const { startMarketScanner, sendMacroReport } = require("./src/market-scanner");
const { startTelegramBot }    = require("./src/telegram-bot");
const { checkDealWatches }   = require("./src/routes/deals");
const { startCOTScheduler }  = require("./src/cot/scheduler");
const { startPreMarketAlerts } = require("./src/premarket-alerts");
const { runMarketRecap }       = require("./src/market-recap");
const { runMorningGamePlan, runTradeCoach, runWeeklyReview, runMonthlyDeepReview, runApexBriefing } = require("./src/ai-coach");
const { runCeoRecommendation } = require("./src/ceo-ai");
const { buildCommandCenter } = require("./src/command-center-ai");
const { runPredictionTracker } = require("./src/prediction-tracker");
const { revertMisgradedXIntelShorts } = require("./src/predictions-store");
const { runAutopilotRecap } = require("./src/alpaca-recap");
const { runServerAutopilot } = require("./src/server-autopilot");
const { runTrailingStops } = require("./src/trailing-stops");
const { runMeanrevPaper, sendMeanrevSummary } = require("./src/meanrev-paper");
const { pollGmailLeads } = require("./src/gmail-leads");
const { runAdol22, handleAdol22Api } = require("./src/adol22-scanner");
const { updateCOTData, isDataFresh } = require("./src/cot/cotService");
const { registerJob } = require("./src/job-heartbeat");

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
const { initFutureWalletStore } = require("./src/future-wallet-store");

// Sequenced, not parallel (2026-08-16): initPhotoStore() now reuses
// initPgStore()'s shared pool (see atomic-write.js's getPool()) instead of
// creating its own — a real, previously-unnoticed second Postgres pool
// against the same DATABASE_URL. It needs initPgStore's pool to already
// exist before it runs. initFutureWalletStore() (2026-08-17, Future
// Wallet 100 Phase 1) reuses the same shared pool for the same reason.
initPgStore()
  .then(() => initPhotoStore())
  .then(() => initFutureWalletStore())
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

  // Retired 2026-08-14 (watchlist store unification): this job scanned a
  // hardcoded DEFAULT_WATCHLIST merged with settings.watchlistSymbols — a
  // separate legacy store found to have silently diverged from the real
  // primary watchlist (data/watchlist.json) the modern alert jobs use.
  // Its "Bull BOS + high score" / "price entering buy zones" signals are
  // already covered by watchlist-turn-alerts.js and watchlist-greenlight-
  // alerts.js/watchlist-setup-alerts.js on the real watchlist, now feeding
  // the morning digest. DEFAULT_WATCHLIST's 2 symbols not already in the
  // real watchlist (CORZ, HUT) were folded in before this was removed —
  // nothing dropped, just no more duplicate scan of a stale list.

  // One-time data correction: prediction-tracker.js's SHORT grading logic
  // was written only for Command Center's borrowed-bullish-scan semantics
  // and mis-graded every X Intel SHORT prediction as "hit" almost
  // immediately (confirmed live: 20 real records). Reverts exactly that
  // bad-grade signature back to "open" so the fixed tracker logic below
  // can re-grade them correctly. Idempotent — a no-op once none remain.
  try {
    const reverted = revertMisgradedXIntelShorts();
    if (reverted) console.log(`[Predictions] Reverted ${reverted} mis-graded X Intel SHORT prediction(s) for re-grading`);
  } catch {}

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
  let _gpSent = null, _coachSent = null, _recapAP = null, _weeklySent = null, _monthlyReview = null, _mrvPaper = null, _mrvSummary = null, _apexSent = null, _ceoSent = null, _aplusSnapshot = null, _cmdCenterSent = null, _ivSnapshot = null;
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
    // Real IV history snapshot — options platform redesign Phase 5. Same
    // pure-forward-log pattern as the A+ Score snapshot above (fires
    // right after close settles, ~4:45 PM ET). When a Polygon key is
    // configured this runs strictly sequential with a real ~13s gap per
    // symbol to honor Polygon's free-tier 5 req/min limit — a full run
    // can honestly take 20-40 minutes, which is fine for a once-daily
    // background job.
    if (h === 16 && m >= 45 && m < 51 && _ivSnapshot !== today) {
      _ivSnapshot = today;
      require("./src/iv-history-store").logDailySnapshot().catch((e) => console.error("[IV history] snapshot failed:", e.message));
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
  // Real primary watchlist (data/watchlist.json) — not settings.watchlistSymbols,
  // a separate legacy store found to have silently diverged (2026-08-14 unify).
  // This periodic trigger was missed in that sweep (found in a follow-up audit).
  setInterval(() => {
    try {
      const wl = require("./src/routes/watchlist").loadWatchlist().symbols || [];
      runAdol22(wl).catch(() => {});
    } catch {}
  }, 15 * 60_000);
  console.log("[ADOL22] Market scanner active — every 15 min, market hours only");

  // Watchlist turn alerts — real Telegram ping when a Watchlist symbol's
  // chart verdict (GO/WAIT/AVOID) flips, i.e. a real buy or sell/exit signal
  // (2026-07-26, explicit user request, scoped to Watchlist only via an
  // AskUserQuestion). Read-only (never places/modifies a trade), so this
  // runs unconditionally — not gated behind SERVER_AUTOPILOT like the
  // stop-ratcheting/trade-mutating automation above.
  registerJob("Watchlist Turn", 15 * 60_000, () => require("./src/watchlist-turn-alerts").checkWatchlistTurns());
  console.log("[Watchlist turns] Buy/sell verdict-change detection active — every 15 min, feeds the morning digest");

  // Watchlist setup alerts — Phase 4 of the Institutional Scanner work
  // (2026-07-28): real Trade Setup Score tradeable-tier crossing (≥70) and
  // real buy-zone entry (atBuyPoint false→true), same persisted-diff
  // pattern as the verdict-turn alert above, read-only.
  registerJob("Watchlist Setup", 15 * 60_000, () => require("./src/watchlist-setup-alerts").checkWatchlistSetupAlerts());
  console.log("[Watchlist setup] Trade Setup Score + buy-zone detection active — every 15 min, feeds the morning digest");

  // Watchlist Green Light entry alerts (explicit user request, 2026-08-03,
  // annotated screenshot: "alert me when it goes to buy" on a real
  // "wait for pullback $X" row) — real Telegram ping when a Watchlist
  // symbol's real Green Light entryNote flips from "wait for pullback" to
  // "at support" (price reaches its real EMA21/MA50/pivot entry level).
  // Same persisted-diff pattern as the alert jobs above, read-only.
  registerJob("Watchlist Green Light", 15 * 60_000, () => require("./src/watchlist-greenlight-alerts").checkWatchlistGreenLightAlerts());
  console.log("[Watchlist Green Light] Real entry-price-reached detection active — every 15 min, feeds the morning digest");

  // Watchlist AI Sniper alerts (explicit user request, 2026-08-10/11: "wire
  // AI Sniper Scanner Pro in Telegram... when to get out before stock goes
  // down and get in before stock goes up"). Real Telegram ping when a
  // Watchlist symbol's hard-gated Sniper verdict (src/sniper-decision.js)
  // newly becomes ENTER_LONG, or drops from ENTER_LONG into NO_CHASE/AVOID.
  // Same persisted-diff pattern as the alerts above, read-only. Each message
  // carries a deep-link button straight to that symbol's Sniper screen.
  registerJob("Watchlist AI Sniper", 15 * 60_000, () => require("./src/watchlist-sniper-alerts").checkWatchlistSniperTurns());
  console.log("[Watchlist AI Sniper] Enter-long / get-out detection active — every 15 min, feeds the morning digest");

  // Position reversal alerts (explicit user request, 2026-08-11: "I DONT
  // WANT TO THINK TOO MUCH I WANT PLATFORM TO WORK ME" / "THE SYSTEM TELL
  // ME EARLY OR ON TIME BUY SELL EARLY OR ON TIME") — real Telegram ping
  // when an actual HELD Alpaca paper position newly shows the Sniper's
  // early get-out signs (near 52w high, overbought RSI, climax volume, a
  // parabolic run cooling off) — structurally earlier than
  // runTrailingStops' own invalidation check below, which only fires once
  // the trend has already broken (price below the 50-day MA/21-day EMA).
  // Read-only (never places/modifies an order), so — like the Watchlist
  // Turn/Sniper alerts above — this runs unconditionally, not gated behind
  // SERVER_AUTOPILOT like the trade-mutating automation below. 5-min
  // cadence (not 15) since actual held positions warrant closer watching
  // than a scan of names you don't yet own.
  registerJob("Position Reversal", 5 * 60_000, () => require("./src/position-reversal-alerts").checkPositionReversals());
  console.log("[Position Reversal] Early get-out alerts for held positions active — every 5 min, market hours only");

  // Trade autopsy (explicit user request, 2026-08-14: "which one do I need
  // most" -> the automatic post-trade grade, over a live R-multiple
  // readout, specifically because it needs no attention while a trade is
  // open). Real Telegram receipt the moment a real round-trip trade closes
  // (getClosedTrades()'s FIFO fill-matching over real Alpaca paper
  // activities) — real entry slippage, real R-multiple, and whether the
  // exit landed near the real planned stop/target. Read-only, sent
  // immediately per trade (not routed through the morning digest — a
  // one-off receipt, not a recurring opportunity scan).
  registerJob("Trade Autopsy", 15 * 60_000, () => require("./src/trade-autopsy").checkTradeAutopsy());
  console.log("[Trade Autopsy] Post-trade plan-vs-actual grading active — every 15 min, market hours only");

  // Best Opportunities "new GO" alerts (explicit user request, 2026-08-03:
  // "alert me on go not working" — the existing button is a browser
  // Notification, which silently fails once permission is denied or the tab
  // is closed). This is the durable Telegram equivalent, scoped to the same
  // ~100-symbol scan universe Best Opportunities uses (not just Watchlist),
  // so it can surface names the user isn't watching yet.
  registerJob("Best Opportunities", 15 * 60_000, () => require("./src/best-opportunities-alerts").checkBestOpportunitiesAlerts());
  console.log("[Best Opportunities] Real new-GO-setup detection active — every 15 min, feeds the morning digest");

  // Bearish setups alerts (explicit user request, 2026-08-03: "when market
  // is down what stocks to short") — the real bearish counterpart to the
  // job above. Puts, not equity shorts (long-only guardrail stays intact).
  registerJob("Bearish Setups", 15 * 60_000, () => require("./src/bearish-setups-alerts").checkBearishSetupsAlerts());
  console.log("[Bearish Setups] Real new-put-candidate detection active — every 15 min, feeds the morning digest");

  // Watchlist institutional alerts — Phase 5 of the Institutional Research
  // Upgrade (2026-07-29): 5 more real, previously-missing alert categories
  // (smart-money BOS, dark-pool spike, unusual options flow, earnings
  // released, sentiment shift), same persisted-diff pattern + Watchlist-only
  // scope as the two alert files above, read-only.
  registerJob("Watchlist Institutional", 15 * 60_000, () => require("./src/watchlist-institutional-alerts").checkWatchlistInstitutionalAlerts());
  console.log("[Watchlist institutional] Smart money / dark pool / options flow / earnings / sentiment detection active — every 15 min, feeds the morning digest");

  // VCP engine alerts — Phase 4 of the VCP integration spec (explicit user
  // approval, 2026-08-14). Real Telegram ping on a real vcpBreakoutEngine
  // state-machine transition (WATCH -> SETUP_READY, -> BREAKOUT_ACTIVE/
  // CONFIRMED, or a confirmed breakout -> FAILED) for Watchlist symbols.
  // Same persisted-diff pattern as the alert jobs above, read-only.
  registerJob("VCP Alerts", 15 * 60_000, () => require("./src/vcp-alerts").checkVcpAlerts());
  console.log("[VCP] Setup-ready / breakout / failed-breakout detection active — every 15 min, feeds the morning digest");

  // Watchlist Day Trade Mode alerts (2026-08-06) — real Telegram ping the
  // moment a Watchlist symbol's real Day Trade Mode signal (VWAP/opening-
  // range breakout/RVOL/9-21 EMA stack) crosses into GREEN. This was built
  // earlier in the session alongside a pure extraction of the real scan
  // logic into src/routes/market.js's fetchDayTradeScanRows(), which sat
  // uncommitted until now — found + finished 2026-08-14 while checking on
  // stale untracked files. Same persisted-diff pattern as the alert jobs
  // above, feeds the morning digest below rather than sending immediately.
  registerJob("Watchlist Day Trade", 15 * 60_000, () => require("./src/watchlist-daytrade-alerts").checkWatchlistDayTradeAlerts());
  console.log("[Watchlist Day Trade] GREEN-signal detection active — every 15 min, feeds the morning digest");

  // Live Trade Light Box (2026-08-16, explicit user request) — background
  // confirmation tick for the full-card BUY/WAIT/SELL grid. Reuses the same
  // real fetchDayTradeScanRows/computeDayTradeSignal engine as the alert job
  // above, adding multi-tick confirmation (src/lightbox-engine.js) so the
  // UI doesn't flicker on noise.
  //
  // Real incident, 2026-08-17: originally 60s. At 60s against a (then) 180-
  // symbol real watchlist, this burst ~360 real Alpaca requests every
  // single minute and tripped Alpaca's rate limit (confirmed via a raw 429
  // "too many requests" from data.alpaca.markets), which silently broke
  // Day Trade Mode / Light Box app-wide since every caller of
  // fetchDayTradeScanRows shares the same rate-limited API key. Fixed on
  // two axes: this interval (5 min, matching every other job's convention)
  // AND a per-tick symbol cap (MAX_SCAN_SYMBOLS in lightbox-state-store.js)
  // — the interval alone wasn't enough, since each individual tick still
  // bursts its full request count regardless of how often it fires.
  registerJob("Light Box Confirm", 5 * 60_000, () => require("./src/lightbox-state-store").tickLightBox());
  console.log("[Light Box] Confirmation tick active — every 5 min (top 50 watchlist symbols), market hours only");

  // Trend Quality cache — real Minervini Trend Template + VCP, precomputed
  // on a slow cadence (daily-timeframe data that doesn't meaningfully
  // change tick-to-tick) so the day-trade weighted engine can read a
  // cached {trendScore, trendLabel, vcpScore, vcpVerdict} per symbol
  // without calling the ~200-daily-bar Trend Template scan inline on
  // every fast Light Box tick. "AM Trading — Final Trading Logic Redesign"
  // spec, explicit user request 2026-08-19.
  registerJob("Trend Quality Cache", 25 * 60_000, () => require("./src/trend-quality-store").tickTrendQuality());
  console.log("[Trend Quality] Minervini/VCP cache tick active — every 25 min (top 60 watchlist symbols), market hours only");

  // Premarket Engine cache — real gap%/volume/catalyst score per watchlist
  // symbol before the 9:30 open (spec §4-6, explicit user request
  // 2026-08-19). Shorter cadence than Trend Quality — premarket moves
  // faster and the real window (7:00-9:35 ET) is short. No-ops outside
  // that window via isPremarketHoursET(), same gated-tick pattern as
  // every other job here.
  registerJob("Premarket Engine", 7 * 60_000, () => require("./src/premarket-store").tickPremarket());
  console.log("[Premarket] Score cache tick active — every 7 min (real watchlist), 7:00-9:35 ET weekdays only");

  // Day-Trade Autopilot — ALERT mode only, zero order execution (spec's
  // "AM TRADING — LIGHT BOX + AUTOPILOT", explicit user request
  // 2026-08-19; Phase 7, deliberately conservative first slice). A
  // separate, third system from server-autopilot.js (swing, already live)
  // — reads lightbox-state-store.js's already-computed state, never
  // fetches/scores anything itself. Real Telegram alert only when mode
  // != OFF (default OFF, changed only by explicit user action via
  // /api/autopilot/mode).
  registerJob("Day-Trade Autopilot", 90_000, () => require("./src/autopilot-tick").tickAutopilot());
  console.log("[Autopilot] Day-trade tick active — every 90s (ALERT mode only, no order execution), market hours only");

  // Morning digest — once-daily consolidated Telegram summary of the 9
  // "opportunity" detection jobs above (explicit user request, 2026-08-14:
  // "consolidate the alerts into one morning digest" for a professional
  // 15-second morning read, over an explicit AskUserQuestion). Checked
  // every 5 min (cheap — it no-ops once already sent today or outside
  // market hours) so it fires promptly after the open rather than waiting
  // up to 15 min; does the real 9-scan work itself only on the one tick
  // per day the gate actually passes. Does not affect position-reversal-
  // alerts.js or paper-positions.js's reprice job — those stay real-time.
  registerJob("Morning Digest", 5 * 60_000, () => require("./src/morning-digest").checkMorningDigest());
  console.log("[Morning Digest] Once-daily consolidated summary active — checked every 5 min, market hours only");

  // Paper Position Manager — AI Exit Engine, options platform redesign
  // Phase 11. Repricess every real open paper position off a fresh real
  // chain fetch every 15 min during market hours, same standalone-interval
  // + market-hours-gate pattern as the watchlist alert jobs above (not the
  // once-daily _sent!==today loop, since positions need continuous
  // intraday repricing). Sends a real Telegram alert only on a genuine
  // Exit Now transition.
  registerJob("Paper Positions Reprice", 15 * 60_000, () => require("./src/routes/paper-positions").repriceAllOpenPositions());
  console.log("[Paper Positions] AI Exit Engine reprice active — every 15 min, market hours only");

  // Market auto-watchlist — real, continuous scan of a curated ~96-symbol
  // universe that auto-adds any GO (ready to pop) or WATCH (actionable,
  // building) setup to the Watchlist (2026-07-26, explicit user request:
  // "scan whole us market ... add all watch stocks ready to pop or in watch
  // status in watch list automaticaly and make sure keep doing it" — full
  // US market scoped down to this curated universe per a confirmed
  // AskUserQuestion, free-tier data stack). Additive-only, read-only against
  // the account — no SERVER_AUTOPILOT gate needed. Runs every 30 min
  // (heavier scan than the 15-min Watchlist-only check above) during market
  // hours only.
  registerJob("Market Auto-Watchlist", 30 * 60_000, () => require("./src/market-auto-watchlist").runMarketAutoWatchlist());
  console.log("[Market auto-watchlist] Continuous GO/WATCH scan active — every 30 min, market hours only");

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
