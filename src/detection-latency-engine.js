"use strict";
// detection-latency-engine.js — real "missed opportunity" detection-
// latency report (Central Opportunity & Options Engine goal, 2026-08-30,
// section 12: "identify what moved, when the move started, whether the
// platform detected it, how early it detected it, why it failed if it
// missed").
//
// Real, honest v1 scope, deliberately narrower than the goal's own
// illustrative example (which cites minute-precise "breakout at 10:18
// AM" timestamps and a specific named cause like "volume confirmation
// threshold too strict"). That level of precision would require either
// reconstructing exact intraday breakout candles per symbol (a new,
// expensive per-symbol intraday-bar analysis this file does NOT do) or
// guessing a cause — both real fabrication risks this codebase's whole
// "never invent data" discipline exists to prevent. Instead, this reuses
// ONLY real, already-recorded data: opportunity-timeline-store.js's real
// same-session score/tier/price samples (same-session-only by that
// store's own design, resets each real trading day). What this DOES
// answer honestly: for a symbol that moved meaningfully today, when did
// the platform start tracking it, when (if ever) did its own real tier
// first call it ACTIONABLE, how many real minutes that took, and how
// much of today's real move had already happened by then. A real,
// narrower, but 100% honest slice of the same question.
const { loadStore } = require("./opportunity-timeline-store");

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

// Real per-symbol detection-latency read off one symbol's own real
// recorded samples (oldest first). Returns null when there isn't enough
// real data to say anything honest (fewer than 2 real price-bearing
// samples, or the real move so far doesn't clear `minMoveAbsPct`).
function detectionLatencyFor(symbol, samples, { minMoveAbsPct = 5 } = {}) {
  const priced = (samples || []).filter((s) => Number.isFinite(s.price) && s.price > 0);
  if (priced.length < 2) return null;
  const first = priced[0], last = priced[priced.length - 1];
  const moveSoFarPct = ((last.price - first.price) / first.price) * 100;
  if (Math.abs(moveSoFarPct) < minMoveAbsPct) return null;

  const firstActionable = samples.find((s) => s.tier === "ACTIONABLE");
  if (!firstActionable) {
    const maxScore = Math.max(...samples.map((s) => Number(s.score) || 0));
    return {
      symbol, moveSoFarPct: round2(moveSoFarPct), detected: false,
      firstTrackedAt: new Date(first.ts).toISOString(), maxScoreToday: round2(maxScore),
      reason: `Never reached the real ACTIONABLE tier today despite a real ${round2(moveSoFarPct)}% move — the highest real score reached was ${round2(maxScore)}/100.`,
    };
  }

  const detectionLagMinutes = Math.max(0, Math.round((firstActionable.ts - first.ts) / 60_000));
  const moveAtDetectionPct = Number.isFinite(firstActionable.price) && first.price > 0
    ? ((firstActionable.price - first.price) / first.price) * 100 : null;
  const moveMissedPct = moveAtDetectionPct != null ? round2(moveSoFarPct - moveAtDetectionPct) : null;

  return {
    symbol, moveSoFarPct: round2(moveSoFarPct), detected: true,
    firstTrackedAt: new Date(first.ts).toISOString(), detectedAt: new Date(firstActionable.ts).toISOString(),
    detectionLagMinutes,
    moveAtDetectionPct: moveAtDetectionPct != null ? round2(moveAtDetectionPct) : null,
    moveMissedPct, // honest null if the detection sample itself has no real price (pre-dates the price field)
  };
}

// Real, full report across every real symbol with same-session samples.
// Sorted by the size of the real move (biggest movers first) — the
// user's own stated question is "what's the biggest thing we might have
// missed," not an alphabetical dump.
function buildDetectionLatencyReport({ minMoveAbsPct = 5 } = {}) {
  const store = loadStore();
  const symbols = Object.keys(store.bySymbol || {});
  if (!symbols.length) return { available: false, reason: "No real same-session opportunity samples recorded yet today." };

  const results = symbols
    .map((symbol) => detectionLatencyFor(symbol, store.bySymbol[symbol], { minMoveAbsPct }))
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.moveSoFarPct) - Math.abs(a.moveSoFarPct));

  if (!results.length) return { available: false, reason: `No real symbol has moved ${minMoveAbsPct}%+ today with enough same-session samples to analyze yet.` };
  return { available: true, generatedAt: new Date().toISOString(), minMoveAbsPct, results };
}

module.exports = { detectionLatencyFor, buildDetectionLatencyReport };
