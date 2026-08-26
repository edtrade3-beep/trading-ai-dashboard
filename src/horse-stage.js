// horse-stage.js — Horse Hunter upgrade (2026-08-26): maps Future Wallet's
// already-real synthesized scores to the spec's 8-stage lifecycle (STAGE 0
// UNKNOWN through STAGE 7 MATURE). Pure, disclosed, deterministic — same
// "first-match-wins ordered rule list" pattern src/news/classifier.js and
// src/lightbox-engine.js's classifyLifecycle already use.
//
// Every input traces to a real, already-computed number:
//   futureWealthScore  — fw_scores.future_wealth_score (future-wallet-synthesis.js)
//   marketCap          — fw_universe.market_cap (real, from FMP)
//   breakoutStatus     — fw_technical_scores.breakout_status, the real
//                        vcpBreakoutEngine state enum: WATCH/SETUP_READY/
//                        BREAKOUT_ACTIVE/CONFIRMED/FAILED (routes/market.js)
//   revenueGrowth/epsGrowth — fw_quant_metrics (real, decimal, e.g. 0.22 = 22%)
//   institutionScore   — optional, src/institution-score.js's real 0-100
//                        read (top-slice only — expensive per-symbol fetch,
//                        never run over the full universe)
//   priorWealthScore   — optional, the last real fw_thesis_history/fw_scores
//                        entry for this symbol — without it, INFLECTION
//                        (which is inherently about CHANGE) can't be
//                        detected and is honestly skipped, never guessed.
"use strict";

const STAGE_LABELS = [
  "UNKNOWN", "INTERESTING", "EMERGING", "INFLECTION",
  "EARLY_LEADER", "INSTITUTIONAL_RECOGNITION", "MARKET_LEADER", "MATURE",
];

const THRESHOLDS = {
  megaCapUsd: 50_000_000_000,       // disclosed "market leader scale" bar
  accelGrowth: 0.20,                 // 20%+ real revenue growth
  decelGrowth: 0.10,                 // <10% real revenue AND EPS growth
  strongWealth: 60,
  emergingWealth: 55,
  institutionalRecognition: 70,
  inflectionDelta: 8,                // real Wealth Score points vs. prior real entry
};

function fmtPct(v) { return v == null ? "unknown" : `${(Number(v) * 100).toFixed(1)}%`; }

function classifyHorseStage({
  futureWealthScore = null, marketCap = null, breakoutStatus = null,
  revenueGrowth = null, epsGrowth = null, institutionScore = null, priorWealthScore = null,
} = {}) {
  if (futureWealthScore == null) {
    return { stage: 0, label: "UNKNOWN", reasons: ["No real Future Wealth Score yet — insufficient data to classify."] };
  }

  const accelerating = revenueGrowth != null && Number(revenueGrowth) >= THRESHOLDS.accelGrowth;
  const decelerating = revenueGrowth != null && Number(revenueGrowth) < THRESHOLDS.decelGrowth
    && epsGrowth != null && Number(epsGrowth) < THRESHOLDS.decelGrowth;
  const realBreakoutConfirmed = breakoutStatus === "CONFIRMED";
  const realBreakoutBuilding = breakoutStatus === "BREAKOUT_ACTIVE" || breakoutStatus === "SETUP_READY";
  const scoreDelta = priorWealthScore != null ? Math.round(futureWealthScore - priorWealthScore) : null;
  const megaCap = marketCap != null && Number(marketCap) >= THRESHOLDS.megaCapUsd;

  if (megaCap && decelerating) {
    return { stage: 7, label: "MATURE", reasons: [
      `Market cap $${(marketCap / 1e9).toFixed(1)}B (mega-cap scale), real growth decelerating (revenue ${fmtPct(revenueGrowth)}, EPS ${fmtPct(epsGrowth)})`,
    ] };
  }
  if (megaCap && futureWealthScore >= THRESHOLDS.strongWealth) {
    return { stage: 6, label: "MARKET_LEADER", reasons: [
      `Market cap $${(marketCap / 1e9).toFixed(1)}B with a sustained real Wealth Score of ${futureWealthScore}`,
    ] };
  }
  if (institutionScore != null && institutionScore >= THRESHOLDS.institutionalRecognition && futureWealthScore >= THRESHOLDS.strongWealth) {
    return { stage: 5, label: "INSTITUTIONAL_RECOGNITION", reasons: [
      `Real institution score ${institutionScore} (accumulation) alongside a Wealth Score of ${futureWealthScore}`,
    ] };
  }
  if (realBreakoutConfirmed && futureWealthScore >= THRESHOLDS.strongWealth) {
    return { stage: 4, label: "EARLY_LEADER", reasons: [
      `Real confirmed technical breakout with a Wealth Score of ${futureWealthScore}`,
    ] };
  }
  if (scoreDelta != null && scoreDelta >= THRESHOLDS.inflectionDelta) {
    return { stage: 3, label: "INFLECTION", reasons: [
      `Real Wealth Score improved +${scoreDelta} vs. the last real journal entry (${priorWealthScore} → ${futureWealthScore})`,
    ] };
  }
  if (accelerating && (realBreakoutBuilding || futureWealthScore >= THRESHOLDS.emergingWealth)) {
    return { stage: 2, label: "EMERGING", reasons: [
      `Real revenue growth ${fmtPct(revenueGrowth)}${realBreakoutBuilding ? ", real technical base building" : ""}`,
    ] };
  }
  return { stage: 1, label: "INTERESTING", reasons: [
    `Real Wealth Score ${futureWealthScore} — some real signal on file, not yet a clear emerging/inflection setup`,
  ] };
}

module.exports = { STAGE_LABELS, THRESHOLDS, classifyHorseStage };
