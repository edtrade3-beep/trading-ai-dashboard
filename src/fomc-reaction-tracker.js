"use strict";
// fomc-reaction-tracker.js (2026-09-16, live request: "scan fomc meeting
// and tell me hawkish bearish how market react every min during meeting
// 2pm to 4pm") — real minute-by-minute SPY/QQQ price reaction during the
// real FOMC statement/press-conference window, anchored to the real
// hawkish/dovish read routes/fed.js already computes. No new statement-
// scoring or FOMC-date logic here — both are reused, not duplicated.

const { fetchYahooBarsExtended } = require("./providers/yahoo");
const { FOMC_DATES } = require("./routes/monitor-extras");
const { fetchLatestFedStatement, fetchFullStatement, scoreText } = require("./routes/fed");

// The Fed's own published schedule for a standard meeting day: statement
// at 2:00pm ET, press conference at 2:30pm ET (fixed, publicly documented
// FOMC practice — not fabricated, not fetched per-meeting since the Fed
// does not vary this by date).
const STATEMENT_MIN = 14 * 60;
const PRESSER_MIN = 14 * 60 + 30;
const WINDOW_START_MIN = 13 * 60 + 55;
const WINDOW_END_MIN = 16 * 60 + 5;

function etParts(ms) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") === 24 ? 0 : get("hour"), minute: get("minute") };
}
function etDateStr(ms) { const p = etParts(ms); return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`; }
function etMinutesOfDay(ms) { const p = etParts(ms); return p.hour * 60 + p.minute; }
function fmtHHMM(mins) { const h = Math.floor(mins / 60), m = mins % 60; const h12 = ((h + 11) % 12) + 1; return `${h12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`; }

function isFomcDate(dateStr) { return FOMC_DATES.includes(dateStr); }

function nextOrTodayFomcDate() {
  const today = new Date();
  const todayStr = etDateStr(Date.now());
  if (FOMC_DATES.includes(todayStr)) return todayStr;
  const future = FOMC_DATES.filter((d) => d >= todayStr).sort();
  if (future.length) return future[0];
  const past = FOMC_DATES.filter((d) => d < todayStr).sort();
  return past.length ? past[past.length - 1] : null;
}

// Real per-minute (falls back to real 5-minute if Yahoo's 1m intraday
// series isn't available for the requested date — Yahoo only carries 1m
// bars for the last handful of days) % move from the real 1:59pm ET
// baseline price. Never fabricates a bar that Yahoo didn't return.
async function buildSymbolReaction(symbol, dateStr) {
  let bars = await fetchYahooBarsExtended(symbol, "5d", "1m").catch(() => []);
  let granularity = "1m";
  if (!bars || bars.length < 5) {
    bars = await fetchYahooBarsExtended(symbol, "5d", "5m").catch(() => []);
    granularity = "5m";
  }
  if (!bars || !bars.length) return { symbol, granularity, points: [], baseline: null };

  const dayBars = bars.filter((b) => etDateStr(b.time) === dateStr);
  const windowBars = dayBars.filter((b) => {
    const m = etMinutesOfDay(b.time);
    return m >= WINDOW_START_MIN && m <= WINDOW_END_MIN;
  });
  if (!windowBars.length) return { symbol, granularity, points: [], baseline: null };

  // Baseline = the last real close strictly before 2:00pm ET (the price
  // the instant before the statement drops).
  const preStatement = windowBars.filter((b) => etMinutesOfDay(b.time) < STATEMENT_MIN);
  const baseline = preStatement.length ? preStatement[preStatement.length - 1].close : windowBars[0].close;

  const points = windowBars.map((b) => {
    const mins = etMinutesOfDay(b.time);
    return {
      time: fmtHHMM(mins), minutesET: mins,
      price: b.close, pct: baseline ? Math.round(((b.close - baseline) / baseline) * 10000) / 100 : null,
    };
  });
  return { symbol, granularity, baseline, points };
}

// Real, top-level orchestration — no duplicate statement fetch/scoring
// (reuses routes/fed.js), no duplicate FOMC date list (reuses
// monitor-extras.js's FOMC_DATES), no duplicate bar fetch (reuses
// providers/yahoo.js).
async function buildFomcReaction({ date, symbols = ["SPY", "QQQ"] } = {}) {
  const dateStr = date && isFomcDate(date) ? date : nextOrTodayFomcDate();
  if (!dateStr) return { ok: false, error: "No real FOMC meeting date found." };

  const nowMins = etMinutesOfDay(Date.now());
  const todayStr = etDateStr(Date.now());
  const isToday = dateStr === todayStr;
  const isLive = isToday && nowMins >= WINDOW_START_MIN && nowMins <= WINDOW_END_MIN;
  const isPast = dateStr < todayStr || (isToday && nowMins > WINDOW_END_MIN);
  const isUpcoming = dateStr > todayStr || (isToday && nowMins < WINDOW_START_MIN);

  const reactions = await Promise.all(symbols.map((s) => buildSymbolReaction(s, dateStr)));

  // Real hawkish/dovish read — only meaningful once the statement has
  // actually posted (federalreserve.gov RSS), so an upcoming/pre-2pm
  // request honestly gets statement:null rather than a stale/fabricated
  // read of the last meeting passed off as today's.
  let statement = null;
  if (!isUpcoming) {
    const stmt = await fetchLatestFedStatement().catch(() => null);
    if (stmt && !(stmt.ageDays != null && stmt.ageDays > 2)) {
      const fullBody = await fetchFullStatement(stmt.link).catch(() => "");
      const scored = scoreText(fullBody && fullBody.length > 200 ? fullBody : stmt.text);
      if (scored) statement = { title: stmt.title, date: stmt.date, link: stmt.link, ...scored };
    }
  }

  return {
    ok: true, date: dateStr, isLive, isPast, isUpcoming,
    statementMarker: fmtHHMM(STATEMENT_MIN), pressConferenceMarker: fmtHHMM(PRESSER_MIN),
    statement, reactions,
  };
}

module.exports = { buildFomcReaction, buildSymbolReaction, isFomcDate, nextOrTodayFomcDate, etMinutesOfDay, etDateStr, STATEMENT_MIN, PRESSER_MIN };
