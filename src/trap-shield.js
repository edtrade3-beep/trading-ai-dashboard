"use strict";
// Trade GPS Stage 5 (2026-09-03) — the "Trap Shield" the spec asks for is
// a thin aggregator over signals this codebase already computes for real,
// not a second flag system: red-flag-engine.js's own computeRedFlags
// (chase risk via extremeExtension, false breakouts via failedBreakout,
// weak volume, wide option spreads, excessive IV, macro events — all
// already real ENTRY_DEFS entries as of this stage), plus
// axiom-runner/components/anti-chase.js's own real band, plus a real
// market-agreement count. This module only decides BLOCK vs WARN vs CLEAR
// from those already-computed real inputs — it never recomputes a flag
// itself.
function evaluateTrapShield({
  redFlags = null, antiChaseBand = null,
  marketAgreementCount = null, marketAgreementTotal = null,
  // Real options-pricing warnings (2026-09-03) — passed directly rather
  // than routed through redFlags/computeRedFlags, because that call
  // happens inside computeOpportunity, BEFORE tradeStructure's own real
  // contract pick exists anywhere in the pipeline. Same real thresholds
  // red-flag-engine.js's own wideOptionSpread/excessiveIv checks use
  // (MAX_SPREAD_PCT / maxIvRankForNaked=80) — the caller computes the
  // boolean, this module only reads it.
  wideOptionSpread = null, excessiveIv = null,
} = {}) {
  const criticalCount = Number.isFinite(redFlags?.criticalCount) ? redFlags.criticalCount : null;
  const flagCount = Number.isFinite(redFlags?.count) ? redFlags.count : null;

  const chaseBlocked = antiChaseBand === "DO_NOT_CHASE";
  const chaseWarning = antiChaseBand === "EXTENDED" || antiChaseBand === "CAUTION";

  const weakAgreement = Number.isFinite(marketAgreementCount) && Number.isFinite(marketAgreementTotal) && marketAgreementTotal > 0
    ? marketAgreementCount / marketAgreementTotal < 0.5
    : null;

  const optionPricingWarning = wideOptionSpread === true || excessiveIv === true;

  const blocked = (criticalCount != null && criticalCount > 0) || chaseBlocked;
  let warningLevel = "NONE";
  if (blocked) warningLevel = "HIGH";
  else if ((flagCount != null && flagCount > 0) || chaseWarning || weakAgreement === true || optionPricingWarning) warningLevel = "CAUTION";

  const reasons = [];
  if (criticalCount) reasons.push(`${criticalCount} critical red flag${criticalCount === 1 ? "" : "s"}`);
  if (chaseBlocked) reasons.push("do-not-chase extension");
  if (!blocked) {
    if (flagCount) reasons.push(`${flagCount} non-critical red flag${flagCount === 1 ? "" : "s"}`);
    if (chaseWarning) reasons.push("extended entry zone");
    if (weakAgreement === true) reasons.push("weak market agreement");
    if (wideOptionSpread === true) reasons.push("wide option spread");
    if (excessiveIv === true) reasons.push("excessive IV");
  }

  return {
    blocked,
    warningLevel,
    message: reasons.length ? reasons.join("; ") : (blocked ? null : "no trap conditions detected"),
  };
}

// "7 of 8 factors bullish" style count — every input is real and
// caller-supplied (never recomputed here); a genuinely unknown factor is
// null and simply excluded from the denominator, never counted as
// bearish/false.
function computeMarketAgreement({
  regimeAligned = null, trendAligned = null, sectorAligned = null, volumeAligned = null,
  relativeStrengthAligned = null, catalystAligned = null, optionsAligned = null, riskRewardAligned = null,
} = {}) {
  const factors = [regimeAligned, trendAligned, sectorAligned, volumeAligned, relativeStrengthAligned, catalystAligned, optionsAligned, riskRewardAligned];
  let count = 0, total = 0;
  for (const v of factors) {
    if (v === null || v === undefined) continue; // honest omission — no real data, never fabricated
    total++;
    if (v === true) count++;
  }
  return { count, total };
}

module.exports = { evaluateTrapShield, computeMarketAgreement };
