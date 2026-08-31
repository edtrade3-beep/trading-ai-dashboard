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
  // Central Opportunity & Options Engine goal (2026-08-30) — options
  // confirmation was previously folded into a shared 5pt Catalyst bucket
  // alongside EPS growth (worth at most ~2.5pts of 100 in practice), far
  // below what real options-flow data (this platform already computes
  // real call/put notional skew, confirmed live in the Options Strategy
  // Ranking work) deserves. Given a dedicated 10pt bucket below —
  // matching the goal's own suggested weight — funded by trimming 1pt
  // each off Regime/Trend/Structure/Volume/RelativeStrength/
  // SetupQuality/EntryQuality/Sector and 2pts off Catalyst (EPS-only
  // now that options flow has its own real bucket). Direction and
  // Timing/Earliness are deliberately NOT separate scored buckets here
  // (validated, not blindly matched to any suggested weighting) — wrong
  // direction and overextended entries are real HARD GATES in
  // classifyCoreVerdict below (force AVOID_LONG regardless of score),
  // stricter than a soft scoring weight a strong score elsewhere could
  // outweigh.
  //
  // 1. Market Regime — 13pts (blend of computeAPlusScore's 20pt weight
  // and institutional-scoring.js's 10pt weight for the identical real
  // regime.score input; trimmed from 15 to make room for the new sector
  // bucket added an earlier phase, then 14->13 this phase for Options
  // Confirmation).
  const regimeScore = Number(input.regime?.score);
  const regimePts = Number.isFinite(regimeScore) ? clampRound((regimeScore / 100) * 13, 13) : 6.5;

  // 2. Trend — 13pts (passCount/8, the exact real input both institu-
  // tional-scoring.js and stockQualityBreakdown separately compute the
  // identical 20pt formula for — trimmed to 14 to make room in the
  // 11-bucket split, then 14->13 this phase for Options Confirmation).
  const passCount = Number(input.passCount);
  const trendPts = Number.isFinite(passCount) ? clampRound((passCount / 8) * 13, 13) : 6.5;

  // 3. Structure — 10pts (ADX + SMC combined; institutional-scoring.js
  // weighted these 15+15=30 separately, roughly-halved-and-trimmed here
  // since both are real "is the higher-timeframe structure intact"
  // signals, not two independent dimensions in the new bucketing; then
  // 11->10 this phase for Options Confirmation).
  const adx = input.adx;
  let adxPts = 5.5;
  if (adx) {
    if (adx.strength === "Strong") adxPts = adx.direction === "Bullish" ? 5.5 : adx.direction === "Bearish" ? 1 : 3;
    else if (adx.strength === "Developing") adxPts = adx.direction === "Bullish" ? 4.5 : adx.direction === "Bearish" ? 2 : 3;
    else adxPts = 3;
  }
  const smc = input.smc;
  let smcPts = 5.5;
  if (smc?.bos?.type === "BULL_BOS") smcPts = 5.5;
  else if (smc?.bos?.type === "BEAR_BOS") smcPts = 1;
  else if (smc?.choch?.type === "CHOCH_BULL") smcPts = 4.5;
  else if (smc?.choch?.type === "CHOCH_BEAR") smcPts = 2;
  else if (smc?.nearestOB?.type === "BULL_OB") smcPts = 3.5;
  else if (smc?.nearestOB?.type === "BEAR_OB") smcPts = 2;
  // Scaled 11pts -> 10pts (proportional, same relative ADX/SMC weighting
  // preserved, not a re-derivation of either sub-signal).
  const structurePts = clampRound((adxPts + smcPts) * (10 / 11), 10);

  // 4. Momentum — 7pts (real weighted return, stockQualityBreakdown's
  // own real momentum formula's normalization, trimmed from 10).
  const momentum = Number(input.momentum);
  const momentumPts = Number.isFinite(momentum) ? clampRound(Math.max(0, Math.min(1, (momentum + 0.1) / 0.5)) * 7, 7) : 3.5;

  // 5. Volume — 8pts (real volRatio vs the 50-day average; blend of
  // computeAPlusScore's 10pt and stockQualityBreakdown's 15pt weight for
  // the identical real input; 9->8 this phase for Options Confirmation).
  const volRatio = Number(input.volRatio);
  const volumePts = Number.isFinite(volRatio) ? clampRound(Math.max(0, Math.min(1, volRatio / 2)) * 8, 8) : 4;

  // 6. Relative Strength — 8pts (real RS rating, stockQualityBreak-
  // down's own real input, trimmed from 15, then 9->8 this phase).
  const rsRating = Number(input.rsRating);
  const rsPts = Number.isFinite(rsRating) ? clampRound((Math.max(1, Math.min(99, rsRating)) / 99) * 8, 8) : 4;

  // 7. Setup Quality — 8pts (real VCP Setup Score from vcpReport(),
  // computeAPlusScore's own real input, trimmed from 15, then 9->8 this
  // phase).
  const vcpScoreRaw = Number(input.vcpScore);
  const setupQualityPts = Number.isFinite(vcpScoreRaw) ? clampRound((vcpScoreRaw / 100) * 8, 8) : 4;

  // 8. Entry Quality — 8pts (real anti-chase/pivot-distance read + real
  // risk% stop distance, combined; computeAPlusScore weighted these
  // 15+20=35 separately — heavily trimmed here since Entry Quality is
  // one bucket in the new split, not two; then 9->8 this phase).
  //
  // Real bug fix (2026-08-26, "unify the swing/entry-decision verdict"):
  // this used to check band names "IDEAL"/"ACCEPTABLE"/"STRETCHED" — names
  // computeAntiChase (src/atr-risk-engine.js) never actually produces. Its
  // real bands are NOT_YET_BROKEN_OUT/NORMAL/CAUTION/EXTENDED/DO_NOT_CHASE,
  // so every real antiChase read except the exact terminal DO_NOT_CHASE
  // silently fell through to the generic 2.25 "unavailable" default —
  // chase risk was barely being scored at all.
  const antiChaseBand = input.antiChase?.band;
  const entryDistPts = antiChaseBand === "NOT_YET_BROKEN_OUT" || antiChaseBand === "NORMAL" ? 4
    : antiChaseBand === "CAUTION" ? 2.67
    : antiChaseBand === "EXTENDED" ? 1.33
    : antiChaseBand === "DO_NOT_CHASE" ? 0
    : 2;
  const riskPct = Number(input.riskPct);
  const riskDistPts = Number.isFinite(riskPct) && riskPct > 0 ? Math.max(0, Math.min(1, (10 - riskPct) / 7)) * 4 : 2;
  const entryQualityPts = clampRound(entryDistPts + riskDistPts, 8);

  // 9. Sector — 7pts (real sector-ETF rank, institutional-scoring.js's
  // own real formula for the identical real input — was entirely
  // MISSING from Phase 1 despite both consumer pages already having real
  // sectorInfo on hand; added an earlier phase, then 8->7 this phase).
  const sectorRank = Number(input.sectorInfo?.rank);
  const sectorOf = Number(input.sectorInfo?.of) || 11;
  const sectorPts = Number.isFinite(sectorRank) && sectorRank > 0 ? clampRound(((sectorOf - sectorRank + 1) / sectorOf) * 7, 7) : 3.5;

  // 10. Liquidity — 5pts (real dollar volume, stockQualityBreakdown's
  // own real formula, unchanged weight — already a sensibly small bucket).
  const dollarVolume = Number(input.dollarVolume);
  const liquidityPts = Number.isFinite(dollarVolume) && dollarVolume > 0 ? clampRound(Math.max(0, Math.min(1, dollarVolume / 1e9)) * 5, 5) : 3;

  // 11. Catalyst — 3pts, EPS growth ONLY now (real options call/put flow
  // moved to its own dedicated bucket below — it was previously folded
  // in here at effectively half of a 5pt bucket, worth at most ~2.5pts
  // of 100, which badly undersold how much real signal this platform's
  // options-flow data actually carries).
  const epsGrowth = Number(input.epsGrowth);
  const catalystPts = Number.isFinite(epsGrowth) ? clampRound(Math.max(0, Math.min(1, (epsGrowth + 10) / 30)) * 3, 3) : 1.5;

  // 12. Options Confirmation — 10pts (NEW, Central Opportunity & Options
  // Engine goal, 2026-08-30 — "Options confirmation: 10%"). Same real
  // call/put notional skew formula this bucket used to share a fraction
  // of Catalyst with (zero new signal, just its own proper weight now).
  // Honestly degrades to the neutral midpoint when no real options flow
  // data is available, same discipline as every other bucket here —
  // never fabricated confirmation from missing data.
  const callN = Number(input.optionsFlow?.callNotional), putN = Number(input.optionsFlow?.putNotional);
  const flowTotal = (Number.isFinite(callN) ? callN : 0) + (Number.isFinite(putN) ? putN : 0);
  const flowRatio = flowTotal > 0 ? callN / flowTotal : null;
  const optionsConfirmationPts = flowRatio != null ? clampRound(Math.max(0, Math.min(1, flowRatio)) * 10, 10) : 5;

  const breakdown = {
    regime: regimePts, trend: trendPts, structure: structurePts, momentum: momentumPts,
    optionsConfirmation: optionsConfirmationPts,
    volume: volumePts, relativeStrength: rsPts, setupQuality: setupQualityPts,
    entryQuality: entryQualityPts, sector: sectorPts, liquidity: liquidityPts, catalyst: catalystPts,
  };
  const score = Math.max(0, Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0)));

  const reasons = [
    Number.isFinite(regimeScore) ? `Market regime ${input.regime?.label || "?"} (${regimeScore}/100)` : "Market regime data unavailable",
    Number.isFinite(passCount) ? `${passCount}/8 real Minervini trend-template criteria pass` : "Trend template data unavailable",
    adx || smc?.bos || smc?.choch || smc?.nearestOB ? "Real ADX/smart-money structure read available" : "Structure data unavailable",
    Number.isFinite(volRatio) ? `Volume ${volRatio.toFixed(1)}x the 50-day average` : "Volume data unavailable",
    Number.isFinite(rsRating) ? `RS Rating ${rsRating}` : "RS Rating unavailable",
    Number.isFinite(vcpScoreRaw) ? `VCP Setup Score ${vcpScoreRaw}/100` : "No real VCP base detected",
    Number.isFinite(sectorRank) ? `Sector rank #${sectorRank}/${sectorOf} today` : "Sector rank unavailable",
    flowRatio != null ? `Real options flow ${Math.round(flowRatio * 100)}% call-weighted` : "Options flow data unavailable",
  ];

  return { score, breakdown, reasons };
}

// computeBearishScore — the short-side sibling of computeCoreScore, added
// 2026-08-31 (explicit user request: "trade up and down options and
// stocks and crypto," full scope approved). Same 12-bucket shape, same
// point totals, same "never fabricate — degrade to a disclosed neutral
// midpoint" discipline — but each bucket's polarity is flipped where the
// underlying signal is directional (a bearish structure break scores
// HIGH here, not low). Two buckets are deliberately NOT flipped because
// they aren't directional at all (Volume, Liquidity — a real breakdown
// needs real volume confirmation exactly like a real breakout does), and
// one bucket (Setup Quality) is deliberately left at a flat neutral
// default rather than inverting vcpScore — VCP measures base-BUILDING
// (contraction) quality, which is not the inverse of a real distribution/
// breakdown pattern; this codebase has no real distribution-quality
// metric computed anywhere yet, and inventing one by just flipping an
// unrelated number would be a fabrication, not a mirror. Disclosed real
// gap, not silently missing.
//
// input: same real fields as computeCoreScore (regime, passCount, adx,
// smc, momentum, volRatio, rsRating, sectorInfo, dollarVolume, epsGrowth,
// optionsFlow) plus an optional caller-supplied `bearishExtension` band
// (mirrors antiChase.band but for "how far below a real breakdown level
// is price right now" — NOT_YET_BROKEN_DOWN/NORMAL/CAUTION/EXTENDED/
// DO_NOT_CHASE) and `riskPct`. No new fetches — every real input here is
// already computed by the same real caller that feeds computeCoreScore.
function computeBearishScore(input = {}) {
  // 1. Regime — 13pts. A short wants a REAL bad/deteriorating regime —
  // mirror of the long bucket, same weight.
  const regimeScore = Number(input.regime?.score);
  const bRegimePts = Number.isFinite(regimeScore) ? clampRound(((100 - regimeScore) / 100) * 13, 13) : 6.5;

  // 2. Trend — 13pts. A short wants FEW real Minervini long-trend
  // criteria passing (a broken uptrend), not many.
  const passCount = Number(input.passCount);
  const bTrendPts = Number.isFinite(passCount) ? clampRound(((8 - passCount) / 8) * 13, 13) : 6.5;

  // 3. Structure — 10pts. Bearish ADX/SMC reads score HIGH here (mirror
  // image of the long bucket's own point assignment).
  const adx = input.adx;
  let bAdxPts = 5.5;
  if (adx) {
    if (adx.strength === "Strong") bAdxPts = adx.direction === "Bearish" ? 5.5 : adx.direction === "Bullish" ? 1 : 3;
    else if (adx.strength === "Developing") bAdxPts = adx.direction === "Bearish" ? 4.5 : adx.direction === "Bullish" ? 2 : 3;
    else bAdxPts = 3;
  }
  const smc = input.smc;
  let bSmcPts = 5.5;
  if (smc?.bos?.type === "BEAR_BOS") bSmcPts = 5.5;
  else if (smc?.bos?.type === "BULL_BOS") bSmcPts = 1;
  else if (smc?.choch?.type === "CHOCH_BEAR") bSmcPts = 4.5;
  else if (smc?.choch?.type === "CHOCH_BULL") bSmcPts = 2;
  else if (smc?.nearestOB?.type === "BEAR_OB") bSmcPts = 3.5;
  else if (smc?.nearestOB?.type === "BULL_OB") bSmcPts = 2;
  const bStructurePts = clampRound((bAdxPts + bSmcPts) * (10 / 11), 10);

  // 4. Momentum — 7pts. A short wants strongly NEGATIVE real momentum —
  // same formula shape as the long side, sign flipped.
  const momentum = Number(input.momentum);
  const bMomentumPts = Number.isFinite(momentum) ? clampRound(Math.max(0, Math.min(1, (-momentum + 0.1) / 0.5)) * 7, 7) : 3.5;

  // 5. Volume — 8pts. NOT flipped — a real breakdown needs real volume
  // confirmation exactly like a real breakout does; this is a
  // directionless "is this move real" signal.
  const volRatio = Number(input.volRatio);
  const bVolumePts = Number.isFinite(volRatio) ? clampRound(Math.max(0, Math.min(1, volRatio / 2)) * 8, 8) : 4;

  // 6. Relative Strength — 8pts. A short wants real LOW relative
  // strength (a weak stock), not high — inverted rank formula.
  const rsRating = Number(input.rsRating);
  const bRsPts = Number.isFinite(rsRating) ? clampRound(((99 - Math.max(1, Math.min(99, rsRating))) / 99) * 8, 8) : 4;

  // 7. Setup Quality — 8pts. Deliberately flat/neutral — see file-level
  // comment above: no real distribution/breakdown pattern-quality metric
  // exists in this codebase yet; inverting vcpScore (a base-BUILDING
  // quality measure) would misrepresent an unrelated signal as its own
  // opposite, not honestly mirror it.
  const bSetupQualityPts = 4;

  // 8. Entry Quality — 8pts. `bearishExtension.band` mirrors
  // antiChase.band but for distance below a real breakdown level (the
  // caller computes this the same way antiChase.band is computed for
  // longs — see atr-risk-engine.js's direction param). riskPct portion
  // is unchanged (a tight stop is a tight stop regardless of direction).
  const bExtBand = input.bearishExtension?.band;
  const bEntryDistPts = bExtBand === "NOT_YET_BROKEN_DOWN" || bExtBand === "NORMAL" ? 4
    : bExtBand === "CAUTION" ? 2.67
    : bExtBand === "EXTENDED" ? 1.33
    : bExtBand === "DO_NOT_CHASE" ? 0
    : 2;
  const riskPct = Number(input.riskPct);
  const bRiskDistPts = Number.isFinite(riskPct) && riskPct > 0 ? Math.max(0, Math.min(1, (10 - riskPct) / 7)) * 4 : 2;
  const bEntryQualityPts = clampRound(bEntryDistPts + bRiskDistPts, 8);

  // 9. Sector — 7pts. A short wants the WEAKEST real sector (worst rank),
  // not the strongest — inverted rank formula.
  const sectorRank = Number(input.sectorInfo?.rank);
  const sectorOf = Number(input.sectorInfo?.of) || 11;
  const bSectorPts = Number.isFinite(sectorRank) && sectorRank > 0 ? clampRound((sectorRank / sectorOf) * 7, 7) : 3.5;

  // 10. Liquidity — 5pts. NOT flipped — liquidity is directionless.
  const dollarVolume = Number(input.dollarVolume);
  const bLiquidityPts = Number.isFinite(dollarVolume) && dollarVolume > 0 ? clampRound(Math.max(0, Math.min(1, dollarVolume / 1e9)) * 5, 5) : 3;

  // 11. Catalyst — 3pts. A short wants real NEGATIVE/deteriorating EPS
  // growth, not positive — sign flipped.
  const epsGrowth = Number(input.epsGrowth);
  const bCatalystPts = Number.isFinite(epsGrowth) ? clampRound(Math.max(0, Math.min(1, (-epsGrowth + 10) / 30)) * 3, 3) : 1.5;

  // 12. Options Confirmation — 10pts. A short wants real PUT-weighted
  // flow, not call-weighted — inverted ratio.
  const callN = Number(input.optionsFlow?.callNotional), putN = Number(input.optionsFlow?.putNotional);
  const flowTotal = (Number.isFinite(callN) ? callN : 0) + (Number.isFinite(putN) ? putN : 0);
  const putRatio = flowTotal > 0 ? putN / flowTotal : null;
  const bOptionsConfirmationPts = putRatio != null ? clampRound(Math.max(0, Math.min(1, putRatio)) * 10, 10) : 5;

  const breakdown = {
    regime: bRegimePts, trend: bTrendPts, structure: bStructurePts, momentum: bMomentumPts,
    optionsConfirmation: bOptionsConfirmationPts,
    volume: bVolumePts, relativeStrength: bRsPts, setupQuality: bSetupQualityPts,
    entryQuality: bEntryQualityPts, sector: bSectorPts, liquidity: bLiquidityPts, catalyst: bCatalystPts,
  };
  const score = Math.max(0, Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0)));

  const reasons = [
    Number.isFinite(regimeScore) ? `Market regime ${input.regime?.label || "?"} (${regimeScore}/100 — bearish-favorable at low readings)` : "Market regime data unavailable",
    Number.isFinite(passCount) ? `Only ${passCount}/8 real long trend-template criteria pass` : "Trend template data unavailable",
    adx || smc?.bos || smc?.choch || smc?.nearestOB ? "Real ADX/smart-money structure read available" : "Structure data unavailable",
    Number.isFinite(volRatio) ? `Volume ${volRatio.toFixed(1)}x the 50-day average` : "Volume data unavailable",
    Number.isFinite(rsRating) ? `RS Rating ${rsRating} (bearish-favorable when low)` : "RS Rating unavailable",
    Number.isFinite(sectorRank) ? `Sector rank #${sectorRank}/${sectorOf} today (bearish-favorable when weak)` : "Sector rank unavailable",
    putRatio != null ? `Real options flow ${Math.round(putRatio * 100)}% put-weighted` : "Options flow data unavailable",
  ];

  return { score, breakdown, reasons };
}

// The one real display meta per verdict (One Engine Migration Phase 2,
// 2026-08-23) — supersedes final-trade-gate.js's FINAL_GATE_META, which
// is retired this phase now that this engine speaks the spec's own
// verdict vocabulary natively instead of needing a second remapping layer.
const CORE_VERDICT_META = {
  EARLY_BUY: { icon: "🟢", label: "EARLY BUY", color: "#0d9465" },
  BUY: { icon: "🟢", label: "BUY", color: "#0d9465" },
  WATCH: { icon: "🟡", label: "WATCH", color: "#d6a312" },
  WAIT: { icon: "🟡", label: "WAIT", color: "#d6a312" },
  AVOID_LONG: { icon: "🔴", label: "AVOID", color: "#c8282a" },
  HOLD: { icon: "🔵", label: "HOLD", color: "#2563eb" },
  TAKE_PROFIT: { icon: "🟠", label: "TAKE PROFIT", color: "#e08a1e" },
  EXIT: { icon: "🟣", label: "EXIT", color: "#6d5dd3" },
};

// Short-side display meta, added alongside CORE_VERDICT_META. Color/icon
// choices are deliberate, not arbitrary: EARLY_SHORT/SHORT reuse
// AVOID_LONG's red hex (universal finance convention: red = bearish
// direction) but pair it with a down-triangle icon instead of a circle so
// it never visually reads the same as a blocked/AVOID state at a glance.
// AVOID_SHORT is neutral grey, not red — "no valid short here" isn't an
// alarm the way a real AVOID_LONG risk flag is; it's just "nothing to do."
const BEARISH_VERDICT_META = {
  EARLY_SHORT: { icon: "🔻", label: "EARLY SHORT", color: "#c8282a" },
  SHORT: { icon: "🔻", label: "SHORT", color: "#c8282a" },
  WATCH_SHORT: { icon: "🟡", label: "WATCH SHORT", color: "#d6a312" },
  WAIT_SHORT: { icon: "🟡", label: "WAIT SHORT", color: "#d6a312" },
  AVOID_SHORT: { icon: "⚪", label: "AVOID SHORT", color: "#8a94a6" },
};

// input: { score, entryPlan, redFlagResult, stage, dailyBias, entryScore,
// hasPosition, positionState, positionReason } — entryPlan/redFlagResult
// are the caller's own already-computed computeEntryPlan()/
// computeRedFlags() outputs (entry-engine.js/red-flag-engine.js), never
// recomputed here. positionState/positionReason are position-decision-
// engine.js's own real state + reason (HOLD/WARNING/TRAIL/TAKE_PARTIAL/
// EXIT/HARD_EXIT) when hasPosition is true — relabeled, not recomputed,
// same discipline computeSimpleDecision already established.
//
// Returns { verdict, reason } (changed from a bare string in Phase 1,
// this same phase — nothing else depended on the old shape yet) so a
// caller never has to stitch this engine's verdict together with a
// DIFFERENT engine's own reason text, which risks the two telling a
// visibly different story for the same symbol (Phase 2's own reason for
// this change).
//
// LONG-SIDE ONLY this phase — SHORT/COVER/AVOID_SHORT deliberately not
// implemented; this app's real short-side signal maturity hasn't been
// audited with the same rigor the long-side engines got this session.
// Returns null rather than guessing when asked to classify a short-side
// setup (input.direction === "SHORT").
function classifyCoreVerdict(input = {}) {
  if (input.direction === "SHORT") return null;

  if (input.hasPosition) {
    switch (input.positionState) {
      case "HARD_EXIT":
        return { verdict: "EXIT", reason: input.positionReason || "Stop breached — risk limit reached." };
      case "EXIT":
        return { verdict: "EXIT", reason: input.positionReason || "Thesis invalidated." };
      case "TAKE_PARTIAL":
        return { verdict: "TAKE_PROFIT", reason: input.positionReason || "Target reached or momentum fading." };
      case "TRAIL":
      case "WARNING":
      case "HOLD":
      default:
        return { verdict: "HOLD", reason: input.positionReason || "Structure and thesis intact." };
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
  if (entryPlan.stage === "STRUCTURE_BROKEN") return { verdict: "AVOID_LONG", reason: "4H structure is broken." };
  // Real bug fix (2026-08-26, "unify the swing/entry-decision verdict"):
  // this only blocked on the terminal DO_NOT_CHASE band, missing EXTENDED
  // — reusing entry-engine.js's own already-correct rule verbatim
  // (isAntiChaseBlocking, entry-engine.js:152-156) so this hard gate can
  // never again let an EXTENDED (real, stretched, not-yet-terminal) entry
  // through as a BUY the way the reported live case did.
  if (entryPlan.doNotChaseZone?.band === "DO_NOT_CHASE") return { verdict: "AVOID_LONG", reason: "Price is extended — too far above the breakout to chase now." };
  if (entryPlan.doNotChaseZone?.band === "EXTENDED") return { verdict: "AVOID_LONG", reason: "Price is stretched above the breakout — wait for a pullback before entering." };
  if (criticalCount > 0) {
    const names = redFlags.filter((f) => f.critical).map((f) => f.label).join(", ");
    return { verdict: "AVOID_LONG", reason: names ? `Critical red flag: ${names}.` : "A critical red flag is active." };
  }
  if (input.stage != null && String(input.stage).startsWith("Stage 4")) return { verdict: "AVOID_LONG", reason: "Stage 4 downtrend — not a valid long setup." };
  if (input.dailyBias === "BEARISH") return { verdict: "AVOID_LONG", reason: "Daily trend is bearish — long bias invalid." };
  if (input.entryScore != null && input.entryScore < AM_CORE_SETUP.entryScoreFloor) {
    return { verdict: "AVOID_LONG", reason: `Entry Score ${input.entryScore}/100 — below the ${AM_CORE_SETUP.entryScoreFloor} floor for a new long.` };
  }

  const score = Number(input.score);
  const hasRealEntry = entryPlan.entryPrice != null;

  // Score >= 70 is "eligible for Trade Gate evaluation," never automatic
  // execution (spec Rule #3) — every branch below already passed the
  // full hard-gate cascade above before this line is reached, so a
  // qualifying score here really does mean the setup cleared every real
  // check, not just a high number.
  if (Number.isFinite(score) && score >= AM_CORE_SETUP.aPlusThreshold && hasRealEntry) {
    return { verdict: "EARLY_BUY", reason: `Real score ${score}/100 — clears the ${AM_CORE_SETUP.aPlusThreshold} A+ threshold with a real executable entry.` };
  }
  if (Number.isFinite(score) && score >= AM_CORE_SETUP.buyThreshold && hasRealEntry) {
    return { verdict: "BUY", reason: `Real score ${score}/100 — clears the ${AM_CORE_SETUP.buyThreshold} BUY threshold with a real executable entry.` };
  }
  if (!hasRealEntry && Number.isFinite(score) && score >= AM_CORE_SETUP.buyThreshold) {
    return { verdict: "WATCH", reason: `Real score ${score}/100 qualifies, but no real executable entry yet.` };
  }
  if (Number.isFinite(score) && score >= AM_CORE_SETUP.watchThreshold) {
    return { verdict: "WATCH", reason: `Real score ${score}/100 — below the ${AM_CORE_SETUP.buyThreshold} BUY threshold, still developing.` };
  }
  if (Number.isFinite(score) && score >= AM_CORE_SETUP.waitThreshold) {
    return { verdict: "WAIT", reason: `Real score ${score}/100 — below the ${AM_CORE_SETUP.watchThreshold} WATCH threshold.` };
  }
  return { verdict: "AVOID_LONG", reason: Number.isFinite(score) ? `Real score ${score}/100 — below the ${AM_CORE_SETUP.waitThreshold} floor.` : "Insufficient real data to score this setup." };
}

// classifyBearishVerdict — the short-side sibling of classifyCoreVerdict,
// added 2026-08-31 (explicit user request: "trade up and down options and
// stocks and crypto"). Same gate-cascade-then-score-ladder shape, gates
// inverted where the underlying signal is directional. SHORT-SIDE ONLY —
// returns null for input.direction === "LONG" (mirrors the long
// function's own null-on-wrong-direction discipline).
//
// One real, disclosed v1 simplification: no dedicated bearish red-flag
// set exists yet (red-flag-engine.js's checks are long-oriented — e.g. it
// flags "Daily trend is bearish" as BAD for a long, which is backwards to
// gate a short out on). Rather than misapply a long-oriented flag set
// here, this cascade omits a red-flag gate entirely for v1 — a real,
// disclosed gap, not a fabricated bearish flag set.
//
// input.hasRealEntry (boolean, caller-supplied) replaces the long side's
// `entryPlan.entryPrice != null` check — there is no real bearish
// entryPlan object in this codebase yet (entry-engine.js is long-only),
// so the caller signals directly whether it has a real executable
// short/put entry price rather than this function assuming a specific
// bearish entryPlan shape that doesn't exist.
function classifyBearishVerdict(input = {}) {
  if (input.direction === "LONG") return null;

  if (input.hasPosition) {
    switch (input.positionState) {
      case "HARD_EXIT":
        return { verdict: "EXIT", reason: input.positionReason || "Stop breached — risk limit reached." };
      case "EXIT":
        return { verdict: "EXIT", reason: input.positionReason || "Thesis invalidated." };
      case "TAKE_PARTIAL":
        return { verdict: "TAKE_PROFIT", reason: input.positionReason || "Target reached or momentum fading." };
      case "TRAIL":
      case "WARNING":
      case "HOLD":
      default:
        return { verdict: "HOLD", reason: input.positionReason || "Structure and thesis intact." };
    }
  }

  const smc = input.smc || {};
  if (smc.bos?.type === "BULL_BOS" || smc.choch?.type === "CHOCH_BULL") {
    return { verdict: "AVOID_SHORT", reason: "Bullish structural break invalidates the short — a real BULL_BOS/CHOCH_BULL just printed." };
  }
  const bExtBand = input.bearishExtension?.band;
  if (bExtBand === "DO_NOT_CHASE") return { verdict: "AVOID_SHORT", reason: "Price is extended — too far below the breakdown to chase now." };
  if (bExtBand === "EXTENDED") return { verdict: "AVOID_SHORT", reason: "Price is stretched below the breakdown — wait for a bounce before entering." };
  if (input.stage == null) {
    return { verdict: "AVOID_SHORT", reason: "No real stage data — cannot confirm a real downtrend/breakdown." };
  }
  if (!(String(input.stage).startsWith("Stage 3") || String(input.stage).startsWith("Stage 4"))) {
    return { verdict: "AVOID_SHORT", reason: `${input.stage} — not a valid downtrend/breakdown stage for a short (Stage 3 or 4 required).` };
  }
  if (input.dailyBias === "BULLISH") return { verdict: "AVOID_SHORT", reason: "Daily trend is bullish — short bias invalid." };
  if (input.entryScore != null && input.entryScore < AM_CORE_SETUP.entryScoreFloor) {
    return { verdict: "AVOID_SHORT", reason: `Entry Score ${input.entryScore}/100 — below the ${AM_CORE_SETUP.entryScoreFloor} floor for a new short.` };
  }

  const score = Number(input.score);
  const hasRealEntry = input.hasRealEntry === true;

  if (Number.isFinite(score) && score >= AM_CORE_SETUP.aPlusThreshold && hasRealEntry) {
    return { verdict: "EARLY_SHORT", reason: `Real bearish score ${score}/100 — clears the ${AM_CORE_SETUP.aPlusThreshold} A+ threshold with a real executable entry.` };
  }
  if (Number.isFinite(score) && score >= AM_CORE_SETUP.buyThreshold && hasRealEntry) {
    return { verdict: "SHORT", reason: `Real bearish score ${score}/100 — clears the ${AM_CORE_SETUP.buyThreshold} SHORT threshold with a real executable entry.` };
  }
  if (!hasRealEntry && Number.isFinite(score) && score >= AM_CORE_SETUP.buyThreshold) {
    return { verdict: "WATCH_SHORT", reason: `Real bearish score ${score}/100 qualifies, but no real executable entry yet.` };
  }
  if (Number.isFinite(score) && score >= AM_CORE_SETUP.watchThreshold) {
    return { verdict: "WATCH_SHORT", reason: `Real bearish score ${score}/100 — below the ${AM_CORE_SETUP.buyThreshold} SHORT threshold, still developing.` };
  }
  if (Number.isFinite(score) && score >= AM_CORE_SETUP.waitThreshold) {
    return { verdict: "WAIT_SHORT", reason: `Real bearish score ${score}/100 — below the ${AM_CORE_SETUP.watchThreshold} WATCH threshold.` };
  }
  return { verdict: "AVOID_SHORT", reason: Number.isFinite(score) ? `Real bearish score ${score}/100 — below the ${AM_CORE_SETUP.waitThreshold} floor.` : "Insufficient real data to score this setup." };
}

module.exports = {
  AM_CORE_SETUP, CORE_VERDICT_META, computeCoreScore, classifyCoreVerdict,
  BEARISH_VERDICT_META, computeBearishScore, classifyBearishVerdict,
};
