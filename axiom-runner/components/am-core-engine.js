// am-core-engine.js — client-side twin of src/am-core-engine.js. Pure,
// dependency-free math, hand-ported here rather than fetched — same
// "small, stable, kept in sync via this header comment" discipline as
// entry-engine.js / simple-decision.js's own client twins. KEEP IN SYNC:
// any formula change goes in both files. See src/am-core-engine.js for
// the full design rationale (One Engine Migration Phase 1 — why each
// weight/gate maps the way it does).

export const AM_CORE_SETUP = {
  aPlusThreshold: 85,
  buyThreshold: 70,
  watchThreshold: 60,
  waitThreshold: 50,
  minRR: 1.5,
  entryScoreFloor: 75,
};

function clampRound(n, max) {
  return Math.max(0, Math.min(max, Math.round(n)));
}

export function computeCoreScore(input = {}) {
  const regimeScore = Number(input.regime?.score);
  const regimePts = Number.isFinite(regimeScore) ? clampRound((regimeScore / 100) * 15, 15) : 8;

  const passCount = Number(input.passCount);
  const trendPts = Number.isFinite(passCount) ? clampRound((passCount / 8) * 15, 15) : 8;

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

  const momentum = Number(input.momentum);
  const momentumPts = Number.isFinite(momentum) ? clampRound(Math.max(0, Math.min(1, (momentum + 0.1) / 0.5)) * 8, 8) : 4;

  const volRatio = Number(input.volRatio);
  const volumePts = Number.isFinite(volRatio) ? clampRound(Math.max(0, Math.min(1, volRatio / 2)) * 10, 10) : 5;

  const rsRating = Number(input.rsRating);
  const rsPts = Number.isFinite(rsRating) ? clampRound((Math.max(1, Math.min(99, rsRating)) / 99) * 10, 10) : 5;

  const vcpScoreRaw = Number(input.vcpScore);
  const setupQualityPts = Number.isFinite(vcpScoreRaw) ? clampRound((vcpScoreRaw / 100) * 10, 10) : 5;

  const antiChaseBand = input.antiChase?.band;
  const entryDistPts = antiChaseBand === "IDEAL" ? 5 : antiChaseBand === "ACCEPTABLE" ? 3.5 : antiChaseBand === "STRETCHED" ? 2 : antiChaseBand === "DO_NOT_CHASE" ? 0 : 2.5;
  const riskPct = Number(input.riskPct);
  const riskDistPts = Number.isFinite(riskPct) && riskPct > 0 ? Math.max(0, Math.min(1, (10 - riskPct) / 7)) * 5 : 2.5;
  const entryQualityPts = clampRound(entryDistPts + riskDistPts, 10);

  const dollarVolume = Number(input.dollarVolume);
  const liquidityPts = Number.isFinite(dollarVolume) && dollarVolume > 0 ? clampRound(Math.max(0, Math.min(1, dollarVolume / 1e9)) * 5, 5) : 3;

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

export function classifyCoreVerdict(input = {}) {
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

  if (entryPlan.stage === "STRUCTURE_BROKEN") return "AVOID_LONG";
  if (entryPlan.doNotChaseZone?.band === "DO_NOT_CHASE") return "AVOID_LONG";
  if (criticalCount > 0) return "AVOID_LONG";
  if (input.stage != null && String(input.stage).startsWith("Stage 4")) return "AVOID_LONG";
  if (input.dailyBias === "BEARISH") return "AVOID_LONG";
  if (input.entryScore != null && input.entryScore < AM_CORE_SETUP.entryScoreFloor) return "AVOID_LONG";

  const score = Number(input.score);
  const hasRealEntry = entryPlan.entryPrice != null;

  if (Number.isFinite(score) && score >= AM_CORE_SETUP.aPlusThreshold && hasRealEntry) return "EARLY_BUY";
  if (Number.isFinite(score) && score >= AM_CORE_SETUP.buyThreshold && hasRealEntry) return "BUY";
  if (Number.isFinite(score) && score >= AM_CORE_SETUP.watchThreshold) return "WATCH";
  if (Number.isFinite(score) && score >= AM_CORE_SETUP.waitThreshold) return "WAIT";
  return "AVOID_LONG";
}
