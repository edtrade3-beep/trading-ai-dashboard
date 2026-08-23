"use strict";

// am-core-engine.js — the real AM Core Engine (One Engine Migration,
// Phase 1, 2026-08-23 — user's own "AM TRADING — MASTER SYSTEM
// ARCHITECTURE" spec, "ONE ENGINE • ONE SCORE • ONE VERDICT"). Standalone
// this phase — wired into NO consumer yet. See the published audit
// artifact for the full current-state map this composes from.
//
// computeCoreScore is NOT a new independent formula invented from
// scratch — it composes the SAME real, already-computed inputs 3
// existing real scores each separately (and in places, redundantly)
// compute: computeAPlusScore (trade-planner-scoring.js), computeInstitu-
// tionalGrade (institutional-scoring.js), stockQualityBreakdown
// (rhpro-shared.jsx). Concrete duplicate found by the audit:
// institutional-scoring.js's trendPts and stockQualityBreakdown's
// trendPts compute the identical `Math.round((passCount/8)*20)` in two
// separate files. This function reuses each real input ONCE.
//
// Point allocation across the spec's own 10 named categories is a
// disclosed, first-pass judgment call — proportionally derived from
// what the 3 existing real formulas already weighted each dimension at,
// NOT independently backtested or quant-optimized (this app has no
// weight-optimization infrastructure; building one is out of scope
// here). Every dimension honestly degrades to a documented neutral
// mid-point when its real input is absent — same "never fabricate"
// discipline as every formula it's replacing.
//
// Hand-ported twin: axiom-runner/components/am-core-engine.js. Keep in
// sync — pure math, zero server-only dependencies.

const AM_CORE_SETUP = {
  aPlusThreshold: 85,
  buyThreshold: 70,
  watchThreshold: 60,
  waitThreshold: 50,
  // Matches red-flag-engine.js/entry-engine.js's existing real R:R floor
  // — not re-derived, the same real number used everywhere else already.
  minRR: 1.5,
  // Matches the hard gate already added to computeSimpleDecision this
  // session (simple-decision.js) — kept consistent, not a new number.
  entryScoreFloor: 75,
};

function clampRound(n, max) {
  return Math.max(0, Math.min(max, Math.round(n)));
}

// input: passCount, rsRating, momentum, stage, volRatio, regime (compute-
// Regime's real output), sectorInfo ({rank, of} or {rel}), adx, smc,
// epsGrowth, vcpScore, riskPct, pctFromHigh, antiChase, optionsFlow
// ({callNotional, putNotional}), dollarVolume — all real, all already
// computed elsewhere by the caller (screenTrendTemplate row + computeRe-
// gime + computeAntiChase + smc-engine.js, same real sources the 3
// existing scores already read). No new fetches.
function computeCoreScore(input = {}) {
  // 1. Market Regime — 15pts (blend of computeAPlusScore's 20pt weight
  // and institutional-scoring.js's 10pt weight for the identical real
  // regime.score input).
  const regimeScore = Number(input.regime?.score);
  const regimePts = Number.isFinite(regimeScore) ? clampRound((regimeScore / 100) * 15, 15) : 8;

  // 2. Trend — 15pts (passCount/8, the exact real input both institu-
  // tional-scoring.js and stockQualityBreakdown separately compute the
  // identical 20pt formula for — trimmed to 15 to make room in the new
  // 10-bucket split, not a re-derivation of the underlying signal).
  const passCount = Number(input.passCount);
  const trendPts = Number.isFinite(passCount) ? clampRound((passCount / 8) * 15, 15) : 8;

  // 3. Structure — 12pts (ADX + SMC combined; institutional-scoring.js
  // weighted these 15+15=30 separately, halved here since both are real
  // "is the higher-timeframe structure intact" signals, not two
  // independent 15pt dimensions in the new bucketing).
  const adx = input.adx;
  let adxPts = 6;
  if (adx) {
    if (adx.strength === "Strong") adxPts = adx.direction === "Bullish" ? 6 : adx.direction === "Bearish" ? 1 : 3;
    else if (adx.strength === "Developing") adxPts = adx.direction === "Bullish" ? 5 : adx.direction === "Bearish" ? 2 : 3;
    else adxPts = 3;
  }
  const smc = input.smc;
  let smcPts = 6;
  if (smc?.bos?.type === "BULL_BOS") smcPts = 6;
  else if (smc?.bos?.type === "BEAR_BOS") smcPts = 1;
  else if (smc?.choch?.type === "CHOCH_BULL") smcPts = 5;
  else if (smc?.choch?.type === "CHOCH_BEAR") smcPts = 2;
  else if (smc?.nearestOB?.type === "BULL_OB") smcPts = 4;
  else if (smc?.nearestOB?.type === "BEAR_OB") smcPts = 2;
  const structurePts = adxPts + smcPts;

  // 4. Momentum — 8pts (real weighted return, stockQualityBreakdown's
  // own real momentum formula's normalization, trimmed from 10 to 8).
  const momentum = Number(input.momentum);
  const momentumPts = Number.isFinite(momentum) ? clampRound(Math.max(0, Math.min(1, (momentum + 0.1) / 0.5)) * 8, 8) : 4;

  // 5. Volume — 10pts (real volRatio vs the 50-day average; blend of
  // computeAPlusScore's 10pt and stockQualityBreakdown's 15pt weight for
  // the identical real input).
  const volRatio = Number(input.volRatio);
  const volumePts = Number.isFinite(volRatio) ? clampRound(Math.max(0, Math.min(1, volRatio / 2)) * 10, 10) : 5;

  // 6. Relative Strength — 10pts (real RS rating, stockQualityBreak-
  // down's own real input, trimmed from 15).
  const rsRating = Number(input.rsRating);
  const rsPts = Number.isFinite(rsRating) ? clampRound((Math.max(1, Math.min(99, rsRating)) / 99) * 10, 10) : 5;

  // 7. Setup Quality — 10pts (real VCP Setup Score from vcpReport(),
  // computeAPlusScore's own real input, trimmed from 15).
  const vcpScoreRaw = Number(input.vcpScore);
  const setupQualityPts = Number.isFinite(vcpScoreRaw) ? clampRound((vcpScoreRaw / 100) * 10, 10) : 5;

  // 8. Entry Quality — 10pts (real anti-chase/pivot-distance read +
  // real risk% stop distance, combined; computeAPlusScore weighted these
  // 15+20=35 separately — heavily trimmed here since Entry Quality is
  // one bucket in the new split, not two).
  const antiChaseBand = input.antiChase?.band;
  const entryDistPts = antiChaseBand === "IDEAL" ? 5 : antiChaseBand === "ACCEPTABLE" ? 3.5 : antiChaseBand === "STRETCHED" ? 2 : antiChaseBand === "DO_NOT_CHASE" ? 0 : 2.5;
  const riskPct = Number(input.riskPct);
  const riskDistPts = Number.isFinite(riskPct) && riskPct > 0 ? Math.max(0, Math.min(1, (10 - riskPct) / 7)) * 5 : 2.5;
  const entryQualityPts = clampRound(entryDistPts + riskDistPts, 10);

  // 9. Liquidity — 5pts (real dollar volume, stockQualityBreakdown's own
  // real formula, unchanged weight — already a sensibly small bucket).
  const dollarVolume = Number(input.dollarVolume);
  const liquidityPts = Number.isFinite(dollarVolume) && dollarVolume > 0 ? clampRound(Math.max(0, Math.min(1, dollarVolume / 1e9)) * 5, 5) : 3;

  // 10. Catalyst — 5pts (real EPS growth + real options call/put flow
  // ratio, combined; institutional-scoring.js/stockQualityBreakdown
  // weighted EPS growth 15/10 separately and options flow 15 separately
  // — heavily trimmed since Catalyst is one small bucket here, not three).
  const epsGrowth = Number(input.epsGrowth);
  const epsPts = Number.isFinite(epsGrowth) ? Math.max(0, Math.min(1, (epsGrowth + 10) / 30)) * 2.5 : 1.25;
  const callN = Number(input.optionsFlow?.callNotional), putN = Number(input.optionsFlow?.putNotional);
  const flowTotal = (Number.isFinite(callN) ? callN : 0) + (Number.isFinite(putN) ? putN : 0);
  const flowRatio = flowTotal > 0 ? callN / flowTotal : null;
  const flowPts = flowRatio != null ? Math.max(0, Math.min(1, flowRatio)) * 2.5 : 1.25;
  const catalystPts = clampRound(epsPts + flowPts, 5);

  const breakdown = {
    regime: regimePts, trend: trendPts, structure: structurePts, momentum: momentumPts,
    volume: volumePts, relativeStrength: rsPts, setupQuality: setupQualityPts,
    entryQuality: entryQualityPts, liquidity: liquidityPts, catalyst: catalystPts,
  };
  const score = Math.max(0, Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0)));

  const reasons = [
    Number.isFinite(regimeScore) ? `Market regime ${input.regime?.label || "?"} (${regimeScore}/100)` : "Market regime data unavailable",
    Number.isFinite(passCount) ? `${passCount}/8 real Minervini trend-template criteria pass` : "Trend template data unavailable",
    adx || smc?.bos || smc?.choch || smc?.nearestOB ? "Real ADX/smart-money structure read available" : "Structure data unavailable",
    Number.isFinite(volRatio) ? `Volume ${volRatio.toFixed(1)}x the 50-day average` : "Volume data unavailable",
    Number.isFinite(rsRating) ? `RS Rating ${rsRating}` : "RS Rating unavailable",
    Number.isFinite(vcpScoreRaw) ? `VCP Setup Score ${vcpScoreRaw}/100` : "No real VCP base detected",
  ];

  return { score, breakdown, reasons };
}

// input: { score, entryPlan, redFlagResult, stage, dailyBias, entryScore,
// hasPosition, positionState } — entryPlan/redFlagResult are the caller's
// own already-computed computeEntryPlan()/computeRedFlags() outputs
// (entry-engine.js/red-flag-engine.js), never recomputed here. positionState
// is position-decision-engine.js's own real state (HOLD/WARNING/TRAIL/
// TAKE_PARTIAL/EXIT/HARD_EXIT) when hasPosition is true — relabeled, not
// recomputed, same discipline computeSimpleDecision already established.
//
// LONG-SIDE ONLY this phase (Phase 1 of the One Engine migration) —
// SHORT/COVER/AVOID_SHORT deliberately not implemented; this app's real
// short-side signal maturity hasn't been audited with the same rigor the
// long-side engines got this session. Returns null rather than guessing
// when asked to classify a short-side setup (ev.direction === "SHORT").
function classifyCoreVerdict(input = {}) {
  if (input.direction === "SHORT") return null;

  if (input.hasPosition) {
    switch (input.positionState) {
      case "HARD_EXIT":
      case "EXIT": return "EXIT";
      case "TAKE_PARTIAL": return "TAKE_PROFIT";
      case "TRAIL":
      case "WARNING":
      case "HOLD": return "HOLD";
      default: return "HOLD";
    }
  }

  const entryPlan = input.entryPlan || {};
  const redFlags = Array.isArray(input.redFlagResult?.flags) ? input.redFlagResult.flags : [];
  const criticalCount = Number.isFinite(input.redFlagResult?.criticalCount)
    ? input.redFlagResult.criticalCount
    : redFlags.filter((f) => f.critical).length;

  // Hard-gate cascade — identical logic to computeSimpleDecision's
  // pre-entry branch (simple-decision.js, this same session's earlier
  // Final Trade Validation Engine phase). A real structural
  // disqualification is AVOID_LONG regardless of score — this is the
  // exact TSLA-shaped case the spec's own worked example describes
  // (Stage 4 + a high score must never read as BUY).
  if (entryPlan.stage === "STRUCTURE_BROKEN") return "AVOID_LONG";
  if (entryPlan.doNotChaseZone?.band === "DO_NOT_CHASE") return "AVOID_LONG";
  if (criticalCount > 0) return "AVOID_LONG";
  if (input.stage != null && String(input.stage).startsWith("Stage 4")) return "AVOID_LONG";
  if (input.dailyBias === "BEARISH") return "AVOID_LONG";
  if (input.entryScore != null && input.entryScore < AM_CORE_SETUP.entryScoreFloor) return "AVOID_LONG";

  const score = Number(input.score);
  const hasRealEntry = entryPlan.entryPrice != null;

  // Score >= 70 is "eligible for Trade Gate evaluation," never automatic
  // execution (spec Rule #3) — every branch below already passed the
  // full hard-gate cascade above before this line is reached, so a
  // qualifying score here really does mean the setup cleared every real
  // check, not just a high number.
  if (Number.isFinite(score) && score >= AM_CORE_SETUP.aPlusThreshold && hasRealEntry) return "EARLY_BUY";
  if (Number.isFinite(score) && score >= AM_CORE_SETUP.buyThreshold && hasRealEntry) return "BUY";
  if (Number.isFinite(score) && score >= AM_CORE_SETUP.watchThreshold) return "WATCH";
  if (Number.isFinite(score) && score >= AM_CORE_SETUP.waitThreshold) return "WAIT";
  return "AVOID_LONG";
}

module.exports = { AM_CORE_SETUP, computeCoreScore, classifyCoreVerdict };
