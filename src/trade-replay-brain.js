"use strict";
// Trade Navigator Stage 5 (2026-09-03) — "Trade Replay Brain": learns from
// the user's own completed real Autopilot 2.0 paper trades
// (trade-gps-audit-store.js's own records — NOT the older/separate
// server-autopilot.js swing system's autopilot-journal.js, a different
// real candidate pool learning-engine.js already gates independently).
//
// Same gate-only discipline learning-engine.js already established for
// that other system: this NEVER touches the underlying scoring math
// (am-core-engine.js, trade-gps-score.js) and NEVER boosts size/risk off
// a good streak — real money (paper or not) never gets sized up chasing
// a hot streak, same reasoning applied everywhere else in this codebase.
// It only pauses (never boosts) a real structure type or real hour-of-day
// bucket with a clear, real losing edge, and only above a real sample
// floor — below that, honest-open (allowed: true, "building sample").
//
// Reuses journal-analytics.js's own real winRateByHour math for the
// per-hour view (same real function, fed real {openedAt, pnl} objects
// adapted from trade-gps-audit-store.js's own real records) — never a
// second hour-bucketing formula.
const { getClosedRecordsForAnalysis, getPerformanceViews } = require("./trade-gps-audit-store");
const { winRateByHour } = require("./journal-analytics");

const MIN_SAMPLE_STRUCTURE = 8;  // real closed trades before a structure's edge is trusted enough to gate live entries
const MIN_SAMPLE_HOUR = 10;      // matches journal-analytics.js's own MIN_SAMPLE_HOUR floor
const CUT_WIN_RATE = 35;         // pause only on a clearly losing win rate, same threshold learning-engine.js already uses

// Real closed-outcome records -> {n, wins, avgHoldWin, avgHoldLoss} split
// by real win/loss — journal-analytics.js's own avgHoldTime only gives one
// overall average; "do I hold losers too long" needs the real split.
function holdTimeByOutcome(records) {
  const wins = records.filter((r) => r.pnl > 0 && Number.isFinite(r.holdingDays));
  const losses = records.filter((r) => r.pnl < 0 && Number.isFinite(r.holdingDays));
  const avg = (arr) => arr.length ? Math.round((arr.reduce((s, r) => s + r.holdingDays, 0) / arr.length) * 10) / 10 : null;
  return {
    winCount: wins.length, lossCount: losses.length,
    avgHoldDaysWin: avg(wins), avgHoldDaysLoss: avg(losses),
    // A real, disclosed read — never a claim below a real minimum sample
    // on both sides.
    holdsLosersLonger: wins.length >= 3 && losses.length >= 3 && avg(losses) != null && avg(wins) != null
      ? avg(losses) > avg(wins) * 1.5 : null,
  };
}

function analyzeUserPerformance({ window = 100 } = {}) {
  const records = getClosedRecordsForAnalysis({ window });
  const byStructure = getPerformanceViews({ window, groupBy: "structure" });
  const byHour = winRateByHour(records.filter((r) => r.openedAt).map((r) => ({ openedAt: r.openedAt, pnl: r.pnl })));
  const holdTime = holdTimeByOutcome(records);
  return { sampleSize: records.length, byStructure: byStructure.groups, byHour, holdTime };
}

// Same real shape learning-engine.js's computeLearningGates already
// established (allowed/n/winRate/reason) — a real caller checking either
// system's gates uses the identical pattern.
function computePersonalizedGates(analysis) {
  const structureGates = {};
  for (const [structure, s] of Object.entries(analysis?.byStructure || {})) {
    const enoughSample = s.count >= MIN_SAMPLE_STRUCTURE;
    const paused = enoughSample && s.winRate != null && s.winRate < CUT_WIN_RATE;
    structureGates[structure] = {
      allowed: !paused, n: s.count, winRate: s.winRate,
      reason: paused
        ? `${structure} paused — ${s.count} real closed trades at ${s.winRate}% win rate, a real losing edge for this user`
        : enoughSample
          ? `${structure} clear — ${s.count} real trades, ${s.winRate}% win rate`
          : `${structure} — building sample (${s.count}/${MIN_SAMPLE_STRUCTURE} real trades)`,
    };
  }

  const hourGates = {};
  for (const [hour, s] of Object.entries(analysis?.byHour || {})) {
    if (!s) continue; // winRateByHour already nulls buckets below its own MIN_SAMPLE_HOUR floor
    const paused = s.n >= MIN_SAMPLE_HOUR && s.winRate < CUT_WIN_RATE;
    hourGates[hour] = {
      allowed: !paused, n: s.n, winRate: s.winRate,
      reason: paused
        ? `${hour}:00 ET paused — ${s.n} real closed trades at ${s.winRate}% win rate, a real losing edge for this user`
        : `${hour}:00 ET clear — ${s.n} real trades, ${s.winRate}% win rate`,
    };
  }

  return { structureGates, hourGates };
}

function isAllowed(gate) {
  return !gate || gate.allowed !== false;
}

module.exports = {
  analyzeUserPerformance, computePersonalizedGates, isAllowed,
  MIN_SAMPLE_STRUCTURE, MIN_SAMPLE_HOUR, CUT_WIN_RATE,
};
