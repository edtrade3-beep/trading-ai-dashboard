// am-core-engine.js — client-side twin of src/am-core-engine.js. Pure,
// dependency-free math, hand-ported here rather than fetched — same
// "small, stable, kept in sync via this header comment" discipline as
// entry-engine.js / simple-decision.js's own client twins. KEEP IN SYNC:
// any formula change goes in both files. See src/am-core-engine.js for
// the full design rationale (One Engine Migration Phase 1-2 — why each
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
  const regimePts = Number.isFinite(regimeScore) ? clampRound((regimeScore / 100) * 14, 14) : 7;

  const passCount = Number(input.passCount);
  const trendPts = Number.isFinite(passCount) ? clampRound((passCount / 8) * 14, 14) : 7;

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
  const structurePts = clampRound(adxPts + smcPts, 11);

  const momentum = Number(input.momentum);
  const momentumPts = Number.isFinite(momentum) ? clampRound(Math.max(0, Math.min(1, (momentum + 0.1) / 0.5)) * 7, 7) : 3.5;

  const volRatio = Number(input.volRatio);
  const volumePts = Number.isFinite(volRatio) ? clampRound(Math.max(0, Math.min(1, volRatio / 2)) * 9, 9) : 4.5;

  const rsRating = Number(input.rsRating);
  const rsPts = Number.isFinite(rsRating) ? clampRound((Math.max(1, Math.min(99, rsRating)) / 99) * 9, 9) : 4.5;

  const vcpScoreRaw = Number(input.vcpScore);
  const setupQualityPts = Number.isFinite(vcpScoreRaw) ? clampRound((vcpScoreRaw / 100) * 9, 9) : 4.5;

  // Real bug fix (2026-08-26, "unify the swing/entry-decision verdict"):
  // this used to check band names "IDEAL"/"ACCEPTABLE"/"STRETCHED" — names
  // computeAntiChase (anti-chase.js) never actually produces. Its real
  // bands are NOT_YET_BROKEN_OUT/NORMAL/CAUTION/EXTENDED/DO_NOT_CHASE, so
  // every real antiChase read except the exact terminal DO_NOT_CHASE
  // silently fell through to the generic 2.25 "unavailable" default.
  const antiChaseBand = input.antiChase?.band;
  const entryDistPts = antiChaseBand === "NOT_YET_BROKEN_OUT" || antiChaseBand === "NORMAL" ? 4.5
    : antiChaseBand === "CAUTION" ? 3
    : antiChaseBand === "EXTENDED" ? 1.5
    : antiChaseBand === "DO_NOT_CHASE" ? 0
    : 2.25;
  const riskPct = Number(input.riskPct);
  const riskDistPts = Number.isFinite(riskPct) && riskPct > 0 ? Math.max(0, Math.min(1, (10 - riskPct) / 7)) * 4.5 : 2.25;
  const entryQualityPts = clampRound(entryDistPts + riskDistPts, 9);

  const sectorRank = Number(input.sectorInfo?.rank);
  const sectorOf = Number(input.sectorInfo?.of) || 11;
  const sectorPts = Number.isFinite(sectorRank) && sectorRank > 0 ? clampRound(((sectorOf - sectorRank + 1) / sectorOf) * 8, 8) : 4;

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
  ];

  return { score, breakdown, reasons };
}

// computeBearishScore — short-side sibling of computeCoreScore, added
// 2026-08-31 (explicit user request: "trade up and down options and
// stocks and crypto"). Mirrors THIS file's own 11-bucket weights exactly
// (not the server's 12-bucket set — the two files are already out of
// sync per src/am-core-engine.js's own header comment; this addition
// deliberately does not fix that pre-existing drift, just stays
// internally consistent with whichever bucket set each file already
// has). Same "never fabricate — neutral default when data is missing"
// discipline; polarity flipped per-bucket where the signal is
// directional. See src/am-core-engine.js's computeBearishScore for the
// full per-bucket rationale (Setup Quality deliberately left flat —
// no real distribution/breakdown-quality metric exists in this codebase
// to invert; Volume/Liquidity deliberately NOT flipped — directionless).
export function computeBearishScore(input = {}) {
  const regimeScore = Number(input.regime?.score);
  const bRegimePts = Number.isFinite(regimeScore) ? clampRound(((100 - regimeScore) / 100) * 14, 14) : 7;

  const passCount = Number(input.passCount);
  const bTrendPts = Number.isFinite(passCount) ? clampRound(((8 - passCount) / 8) * 14, 14) : 7;

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
  const bStructurePts = clampRound(bAdxPts + bSmcPts, 11);

  const momentum = Number(input.momentum);
  const bMomentumPts = Number.isFinite(momentum) ? clampRound(Math.max(0, Math.min(1, (-momentum + 0.1) / 0.5)) * 7, 7) : 3.5;

  const volRatio = Number(input.volRatio);
  const bVolumePts = Number.isFinite(volRatio) ? clampRound(Math.max(0, Math.min(1, volRatio / 2)) * 9, 9) : 4.5;

  const rsRating = Number(input.rsRating);
  const bRsPts = Number.isFinite(rsRating) ? clampRound(((99 - Math.max(1, Math.min(99, rsRating))) / 99) * 9, 9) : 4.5;

  // Deliberately flat/neutral — see file-level comment above.
  const bSetupQualityPts = 4.5;

  const bExtBand = input.bearishExtension?.band;
  const bEntryDistPts = bExtBand === "NOT_YET_BROKEN_DOWN" || bExtBand === "NORMAL" ? 4.5
    : bExtBand === "CAUTION" ? 3
    : bExtBand === "EXTENDED" ? 1.5
    : bExtBand === "DO_NOT_CHASE" ? 0
    : 2.25;
  const riskPct = Number(input.riskPct);
  const bRiskDistPts = Number.isFinite(riskPct) && riskPct > 0 ? Math.max(0, Math.min(1, (10 - riskPct) / 7)) * 4.5 : 2.25;
  const bEntryQualityPts = clampRound(bEntryDistPts + bRiskDistPts, 9);

  const sectorRank = Number(input.sectorInfo?.rank);
  const sectorOf = Number(input.sectorInfo?.of) || 11;
  const bSectorPts = Number.isFinite(sectorRank) && sectorRank > 0 ? clampRound((sectorRank / sectorOf) * 8, 8) : 4;

  const dollarVolume = Number(input.dollarVolume);
  const bLiquidityPts = Number.isFinite(dollarVolume) && dollarVolume > 0 ? clampRound(Math.max(0, Math.min(1, dollarVolume / 1e9)) * 5, 5) : 3;

  const epsGrowth = Number(input.epsGrowth);
  const bEpsPts = Number.isFinite(epsGrowth) ? Math.max(0, Math.min(1, (-epsGrowth + 10) / 30)) * 2.5 : 1.25;
  const callN = Number(input.optionsFlow?.callNotional), putN = Number(input.optionsFlow?.putNotional);
  const flowTotal = (Number.isFinite(callN) ? callN : 0) + (Number.isFinite(putN) ? putN : 0);
  const putRatio = flowTotal > 0 ? putN / flowTotal : null;
  const bFlowPts = putRatio != null ? Math.max(0, Math.min(1, putRatio)) * 2.5 : 1.25;
  const bCatalystPts = clampRound(bEpsPts + bFlowPts, 5);

  const breakdown = {
    regime: bRegimePts, trend: bTrendPts, structure: bStructurePts, momentum: bMomentumPts,
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

export const CORE_VERDICT_META = {
  EARLY_BUY: { icon: "🟢", label: "EARLY BUY", color: "#0d9465" },
  BUY: { icon: "🟢", label: "BUY", color: "#0d9465" },
  WATCH: { icon: "🟡", label: "WATCH", color: "#d6a312" },
  WAIT: { icon: "🟡", label: "WAIT", color: "#d6a312" },
  AVOID_LONG: { icon: "🔴", label: "AVOID", color: "#c8282a" },
  HOLD: { icon: "🔵", label: "HOLD", color: "#2563eb" },
  TAKE_PROFIT: { icon: "🟠", label: "TAKE PROFIT", color: "#e08a1e" },
  EXIT: { icon: "🟣", label: "EXIT", color: "#6d5dd3" },
};

// Short-side display meta — see src/am-core-engine.js's BEARISH_VERDICT_META
// for the color/icon rationale (down-triangle red for actionable
// EARLY_SHORT/SHORT, neutral grey for AVOID_SHORT — never confused with
// AVOID_LONG's alarm-red circle).
export const BEARISH_VERDICT_META = {
  EARLY_SHORT: { icon: "🔻", label: "EARLY SHORT", color: "#c8282a" },
  SHORT: { icon: "🔻", label: "SHORT", color: "#c8282a" },
  WATCH_SHORT: { icon: "🟡", label: "WATCH SHORT", color: "#d6a312" },
  WAIT_SHORT: { icon: "🟡", label: "WAIT SHORT", color: "#d6a312" },
  AVOID_SHORT: { icon: "⚪", label: "AVOID SHORT", color: "#8a94a6" },
};

export function classifyCoreVerdict(input = {}) {
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

  if (entryPlan.stage === "STRUCTURE_BROKEN") return { verdict: "AVOID_LONG", reason: "4H structure is broken." };
  // Real bug fix (2026-08-26): reuses entry-engine.js's own already-
  // correct rule verbatim (isAntiChaseBlocking) so this hard gate can
  // never again let an EXTENDED (real, stretched) entry through as a BUY.
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

// classifyBearishVerdict — short-side sibling of classifyCoreVerdict. See
// src/am-core-engine.js's classifyBearishVerdict for the full v1-gap
// disclosure (no dedicated bearish red-flag set; input.hasRealEntry
// replaces the long side's entryPlan.entryPrice check since there is no
// real bearish entryPlan object in this codebase).
export function classifyBearishVerdict(input = {}) {
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
