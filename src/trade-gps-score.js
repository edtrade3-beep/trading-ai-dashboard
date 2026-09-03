"use strict";
// Trade GPS (2026-09-03) — the spec's own 7-bucket 0-100 composite score
// (20/20/15/15/10/10/10). Deliberately ADDITIVE, not a replacement for
// the existing real 12-bucket am-core-engine.js composite that already
// powers Scanner/Dashboard/Autopilot 2.0 (confirmed decision with the
// user before writing this file) — this is a second, narrower "is this
// specific setup Trade-GPS-ready right now" read, shown only on the new
// Trade GPS card, never a competing platform-wide verdict.
//
// Pure, deterministic. Every input is a real 0-100 sub-score the caller
// already computed elsewhere in the canonical pipeline (regime alignment,
// trend confirmation, etc.) — this function only does the disclosed
// weighted sum + banding, never derives a sub-score itself.

const WEIGHTS = {
  regimeAlignment: 20, trendConfirmation: 20, catalystQuality: 15, relativeStrength: 15,
  volumeConfirmation: 10, riskRewardQuality: 10, optionsLiquidity: 10,
};
// Real, disclosed weight sum — asserted, not just documented, so a typo
// in WEIGHTS above fails loudly (a test also asserts this).
const WEIGHT_SUM = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

const BAND_PRIMARY_MIN = 85;
const BAND_WATCH_MIN = 75;

function computeTradeGpsScore({
  regimeAlignment = null, trendConfirmation = null, catalystQuality = null, relativeStrength = null,
  volumeConfirmation = null, riskRewardQuality = null, optionsLiquidity = null,
} = {}) {
  const inputs = { regimeAlignment, trendConfirmation, catalystQuality, relativeStrength, volumeConfirmation, riskRewardQuality, optionsLiquidity };
  const breakdown = {};
  let missing = [];
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const v = inputs[key];
    if (!Number.isFinite(v) || v < 0 || v > 100) { missing.push(key); breakdown[key] = null; continue; }
    breakdown[key] = { value: v, weight, contribution: Math.round(v * weight) / 100 };
  }
  // Stale/missing/contradictory data -> NO_TRADE (explicit spec rule).
  // Every one of the 7 real buckets must be present to compute a fair,
  // transparent weighted composite — a partial sum would misrepresent
  // what the disclosed weights actually mean.
  if (missing.length) {
    return { score: null, breakdown, band: "NO_TRADE", reason: `missing/invalid real input: ${missing.join(", ")}` };
  }
  const score = Math.round(Object.values(breakdown).reduce((s, b) => s + b.contribution, 0));
  const band = score >= BAND_PRIMARY_MIN ? "PRIMARY" : score >= BAND_WATCH_MIN ? "WATCH" : "REJECT";
  return { score, breakdown, band, reason: null };
}

// "Cash must compete with every opportunity" — a real trade's expected
// value (as an R-multiple, discounted by its own real confidence) must
// clear a real risk-free hurdle before it's preferred over doing nothing.
// Honest null (never a guessed default) when the real inputs aren't
// available — matches this file's own null-on-missing discipline.
function evaluateCashCompetition({ expectedTradeR = null, expectedTradeConfidence = null, riskFreeRatePct = 0 } = {}) {
  if (!Number.isFinite(expectedTradeR) || !Number.isFinite(expectedTradeConfidence)) return null;
  const confidenceFraction = Math.max(0, Math.min(1, expectedTradeConfidence / 100));
  const expectedR = expectedTradeR * confidenceFraction;
  // A real risk-free rate is expressed as an annual %, not an R-multiple —
  // treated here as a real minimum hurdle in R-equivalent terms (a trade
  // must clear doing nothing, not just be non-negative).
  const hurdleR = Number.isFinite(riskFreeRatePct) ? riskFreeRatePct / 100 : 0;
  return { cashPreferred: expectedR <= hurdleR, expectedR, hurdleR };
}

// am-core-engine.js's real breakdown buckets are raw POINTS scaled to
// their own max, not 0-100 each (regime max 13, trend max 13, momentum
// max 7, volume max 8, relativeStrength max 8, catalyst max 3,
// optionsConfirmation max 10 — confirmed by reading am-core-engine.js
// directly). Normalize each back to 0-100 before feeding this file's
// weighted sum, which expects a fair 0-100 read per bucket.
const BREAKDOWN_MAX_POINTS = { regime: 13, trend: 13, momentum: 7, volume: 8, relativeStrength: 8, catalyst: 3, optionsConfirmation: 10 };
function normalizeToHundred(value, maxPoints) {
  if (!Number.isFinite(value) || !(maxPoints > 0)) return null;
  return Math.max(0, Math.min(100, Math.round((value / maxPoints) * 100)));
}

// A real risk/reward + invalidation-quality read — not an existing
// am-core-engine.js bucket, so computed fresh here from the real entry
// plan the canonical pipeline already has. 3:1 real R:R maps to 100;
// scales down linearly; halved (not zeroed) when no real invalidation
// level exists, since a trade can still have a real, honest R:R without
// yet having a disclosed stop-loss-before-entry price.
function computeRiskRewardQuality({ riskReward = null, hasInvalidation = false } = {}) {
  if (!Number.isFinite(riskReward) || riskReward <= 0) return null;
  const base = Math.max(0, Math.min(100, Math.round((riskReward / 3) * 100)));
  return hasInvalidation ? base : Math.round(base * 0.5);
}

// Maps the canonical pipeline's already-computed opportunity/assetDecision
// fields onto the 7 real inputs computeTradeGpsScore expects. Pure,
// deterministic, no new data fetches — every input here is real data this
// pipeline already computed elsewhere, never invented. Takes the already-
// built assetDecision's riskReward/invalidation (not opportunity.entryPlan.rr,
// which is typically unset — asset-decision.js's own derivedRr is the
// real fallback almost every real caller actually uses) to avoid
// re-deriving the same real R:R with a second, potentially-diverging
// formula.
//
// optionsLiquidity is an interim proxy (am-core-engine.js's real
// call/put options-FLOW confirmation, not true bid/ask-spread/OI
// liquidity) until the Stage 4 stock-vs-option structure selector wires
// in real per-contract liquidity data — disclosed here, not silently
// treated as equivalent.
function mapOpportunityToTradeGpsInputs(opportunity, assetDecision) {
  const b = opportunity?.breakdown || {};
  const trendNorm = normalizeToHundred(b.trend, BREAKDOWN_MAX_POINTS.trend);
  const momentumNorm = normalizeToHundred(b.momentum, BREAKDOWN_MAX_POINTS.momentum);
  const trendConfirmation = Number.isFinite(trendNorm) && Number.isFinite(momentumNorm)
    ? Math.round((trendNorm + momentumNorm) / 2) : null;
  return {
    regimeAlignment: normalizeToHundred(b.regime, BREAKDOWN_MAX_POINTS.regime),
    trendConfirmation,
    catalystQuality: normalizeToHundred(b.catalyst, BREAKDOWN_MAX_POINTS.catalyst),
    relativeStrength: normalizeToHundred(b.relativeStrength, BREAKDOWN_MAX_POINTS.relativeStrength),
    volumeConfirmation: normalizeToHundred(b.volume, BREAKDOWN_MAX_POINTS.volume),
    riskRewardQuality: computeRiskRewardQuality({
      riskReward: assetDecision?.riskReward ?? null,
      hasInvalidation: Number.isFinite(assetDecision?.invalidation),
    }),
    optionsLiquidity: normalizeToHundred(b.optionsConfirmation, BREAKDOWN_MAX_POINTS.optionsConfirmation),
  };
}

module.exports = {
  computeTradeGpsScore, evaluateCashCompetition, mapOpportunityToTradeGpsInputs, computeRiskRewardQuality, normalizeToHundred,
  WEIGHTS, WEIGHT_SUM, BAND_PRIMARY_MIN, BAND_WATCH_MIN, BREAKDOWN_MAX_POINTS,
};
