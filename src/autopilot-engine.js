// autopilot-engine.js — "AM TRADING — LIGHT BOX + AUTOPILOT" spec, Phase 7.
// Pure decision layer, zero I/O — same purity convention as daytrade-
// console-engine.js/position-decision-engine.js. Implements the spec's
// stale-signal + chase protection (§22/§23): a real fresh signal is only
// ENTRY_READY while price is still within a real, tight entry zone around
// the price at detection. If price has already run past it before
// Autopilot gets to act, that's ENTRY_MISSED — never chased.
"use strict";

// Real, tight, direction-symmetric tolerance — how far price may move from
// the real bestEntry before a detected signal is considered chased. 0.5%
// is deliberately tight, matching this app's own day-trade tick sizes.
const ENTRY_ZONE_TOLERANCE_PCT = 0.5;

function computeEntryZone(direction, bestEntry) {
  if (!(bestEntry > 0)) return null;
  const tol = bestEntry * (ENTRY_ZONE_TOLERANCE_PCT / 100);
  return direction === "SHORT"
    ? { low: bestEntry - tol, high: bestEntry }
    : { low: bestEntry, high: bestEntry + tol };
}

// direction: "LONG" | "SHORT"
// bestEntry: real detected entry price at the moment the fresh signal fired
// currentPrice: real latest price (same tick or a later one)
// Returns { state: "ENTRY_READY" | "ENTRY_MISSED" | null, zone, reason }
// state=null means "still developing, real evidence not yet resolved" —
// re-checked next tick, never silently entered.
function evaluateEntry({ direction, bestEntry, currentPrice }) {
  const zone = computeEntryZone(direction, bestEntry);
  if (!zone || !(currentPrice > 0)) {
    return { state: null, zone: null, reason: "no real price data" };
  }
  if (currentPrice >= zone.low && currentPrice <= zone.high) {
    return {
      state: "ENTRY_READY", zone,
      reason: `Real ${direction === "SHORT" ? "breakdown" : "breakout"} signal, price still within the real entry zone ($${zone.low.toFixed(2)}–$${zone.high.toFixed(2)}).`,
    };
  }
  const chased = direction === "SHORT" ? currentPrice < zone.low : currentPrice > zone.high;
  if (chased) {
    return {
      state: "ENTRY_MISSED", zone,
      reason: `Entry zone exceeded — price moved to $${currentPrice.toFixed(2)}, beyond the real $${zone.low.toFixed(2)}–$${zone.high.toFixed(2)} zone, before Autopilot could act.`,
    };
  }
  // Price pulled back below the real trigger level (a real LONG breakout
  // or SHORT breakdown that hasn't actually happened at this price, or has
  // since failed) — genuinely ambiguous, not a chase. Stays undecided
  // rather than guessing either way.
  return { state: null, zone, reason: "price has not reached the real entry zone" };
}

module.exports = { ENTRY_ZONE_TOLERANCE_PCT, computeEntryZone, evaluateEntry };
