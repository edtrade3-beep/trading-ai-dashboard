"use strict";
/**
 * scheduler.js  (COT module)
 * Runs COT Telegram reports on a fixed M-F ET schedule using setInterval
 * (same pattern as market-scanner.js — no external cron dependency).
 *
 * Intraday schedule (ET):
 *   07:00 — Pre-Market
 *   09:45 — Open + 15 min
 *   10:30 — Trend Confirmation
 *   12:30 — Midday
 *   14:45 — Late Session
 *   15:45 — Power Hour
 *   16:15 — Post-Market
 *
 * Weekly COT update schedule (ET):
 *   Fri 15:40 — Download + parse + store latest CFTC report, send notification
 *
 * The Friday 16:15 Post-Market report automatically uses the freshly-loaded data.
 */

const { sendCOTReport, sendCOTUpdateNotification } = require("./telegramService");
const { updateCOTData, getLatestReportDate }        = require("./cotService");
const { loadWatchlistSymbols }                      = require("./watchlistHelper");
const { isConfigured: telegramConfigured }          = require("../telegram");

// ── ET time helpers ───────────────────────────────────────────────────────────

function getEtNow() {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date());
  // e.g. "Mon, 09:45"
  const [wd, time] = fmt.split(", ");
  return { wd, time };
}

// ── Session schedule ──────────────────────────────────────────────────────────

const SESSIONS = [
  { time: "07:00", label: "Pre-Market" },
  { time: "09:45", label: "Open +15min" },
  { time: "10:30", label: "Trend Confirmation" },
  { time: "12:30", label: "Midday" },
  { time: "14:45", label: "Late Session" },
  { time: "15:45", label: "Power Hour" },
  { time: "16:15", label: "Post-Market" },
];

const FRIDAY_COT_UPDATE_TIME = "15:40";

// Track fired times to prevent double-firing within the same minute
const _fired = new Set();

function firedKey(wd, time) { return `${wd}:${time}`; }

function cleanFiredKeys() {
  // Clear keys that are from previous minutes
  const { time } = getEtNow();
  for (const k of _fired) {
    if (!k.endsWith(`:${time}`)) _fired.delete(k);
  }
}

// ── Main ticker ───────────────────────────────────────────────────────────────

function startCOTScheduler() {
  if (!telegramConfigured()) {
    console.warn("[COT Scheduler] Telegram not configured — reports will be skipped");
  }

  const iv = setInterval(async () => {
    const { wd, time } = getEtNow();
    cleanFiredKeys();

    // Skip weekends
    if (wd === "Sat" || wd === "Sun") return;

    const key = firedKey(wd, time);
    if (_fired.has(key)) return;

    // ── Friday 15:40: download latest CFTC data ───────────────────────────
    if (wd === "Fri" && time === FRIDAY_COT_UPDATE_TIME) {
      _fired.add(key);
      console.log("[COT Scheduler] Fetching CFTC weekly COT update...");
      try {
        const result = await updateCOTData();
        if (telegramConfigured()) {
          await sendCOTUpdateNotification(
            result.marketsUpdated,
            getLatestReportDate()
          );
        }
      } catch (err) {
        console.error("[COT Scheduler] Weekly update failed:", err.message);
      }
      return;
    }

    // ── Intraday session reports ──────────────────────────────────────────
    const session = SESSIONS.find(s => s.time === time);
    if (!session) return;

    _fired.add(key);
    console.log(`[COT Scheduler] Sending ${session.label} report...`);

    if (!telegramConfigured()) return;

    const watchlist = loadWatchlistSymbols();
    sendCOTReport(session.label, watchlist).catch(err =>
      console.error(`[COT Scheduler] ${session.label} report error:`, err.message)
    );
  }, 30_000); // check every 30 seconds — never miss a minute

  if (iv.unref) iv.unref();

  const sessionList = SESSIONS.map(s => s.time).join(", ");
  console.log(`[COT Scheduler] Started — sessions: ${sessionList} ET (M-F) + Friday 15:40 COT update`);
}

module.exports = { startCOTScheduler };
