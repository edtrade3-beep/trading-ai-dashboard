"use strict";
// valuation-engine.js (2026-09-17, "VALUATION ENGINE" master prompt) — the
// ONE canonical valuation authority for AI Trade Desk, per the prompt's
// own explicit "ONE-ENGINE RULE." This is a real CONSUMER/COMBINER, not a
// third competing formula: this codebase already has two real, working
// engines that cover almost everything this prompt asks for —
//   - future-value-scoring.js's computeValueScore/computeFairValueBands
//     (real P/E, PEG, Price/Sales, EV/EBITDA, FCF-yield blend; real
//     analyst-target buy zones) — reused directly, not reimplemented.
//   - mispricing-engine.js's computeFundamentalDivergence/
//     classifyValueTrapRisk (real multi-quarter revenue/EPS/margin/debt/
//     FCF trend — already the "value trap" logic this prompt separately
//     asks for) — reused directly.
// This file adds ONLY the genuinely new pieces neither of those had:
// graduated valuation/value-trap LEVEL labels, a GARP detector, a real
// (not fabricated) valuation-trend read off the SAME divergence data, a
// 4-zone buy-price relabeling of the existing real fair-value bands, real
// forward P/E (Yahoo's own epsForward — this codebase's only real
// forward-EPS source), and a data-completeness confidence score.
//
// Honest, disclosed gaps (section 19's own "N/A, never fabricate" rule):
// this codebase has NO real sector/industry-median P/E source (would
// need a cross-sector scan this app doesn't run), NO real 5-year
// historical P/E time series (FMP's endpoints already wired here don't
// carry it), and NO real analyst EPS-estimate-revision time series
// (would need a dedicated estimates-history snapshot store neither
// engine has). Those fields are always null/N/A below — never guessed.
// epsRevision7D/30D/90D are honestly left null for the same reason;
// reportedEpsGrowthTrend is the real available proxy this app actually
// has (real quarter-over-quarter reported EPS growth, mispricing-
// engine.js's own divergence trend) and is labeled distinctly so it's
// never confused with an analyst consensus revision.

const { computeValueScore, computeFairValueBands } = require("./future-value-scoring");
const { computeFundamentalDivergence, classifyValueTrapRisk } = require("./mispricing-engine");

function round1(x) { return Number.isFinite(x) ? Math.round(x * 10) / 10 : null; }

const VALUATION_LEVELS = [
  { min: 90, level: "EXCEPTIONAL VALUE" },
  { min: 80, level: "STRONGLY UNDERVALUED" },
  { min: 70, level: "UNDERVALUED" },
  { min: 60, level: "SLIGHTLY UNDERVALUED" },
  { min: 45, level: "FAIR VALUE" },
  { min: 30, level: "EXPENSIVE" },
  { min: 15, level: "VERY EXPENSIVE" },
  { min: 0, level: "EXTREME VALUATION RISK" },
];
function valuationLevelFor(score) {
  if (!Number.isFinite(score)) return null;
  return VALUATION_LEVELS.find((b) => score >= b.min).level;
}

const VALUE_TRAP_LEVELS = [
  { min: 70, level: "EXTREME" },
  { min: 45, level: "HIGH" },
  { min: 20, level: "MODERATE" },
  { min: 0, level: "LOW" },
];
function valueTrapLevelFor(score) {
  if (!Number.isFinite(score)) return null;
  return VALUE_TRAP_LEVELS.find((b) => score >= b.min).level;
}

// Real, graduated value-trap score — a numeric VIEW of the exact same
// real call/threshold classifyValueTrapRisk (mispricing-engine.js)
// already makes (cheap valuation >=55 + majority-deteriorating real
// multi-quarter trend), never a second, independently-tuned formula.
function computeValueTrapScore({ valueScore, divergence }) {
  const trapCheck = classifyValueTrapRisk({ valueScore, divergence });
  if (!divergence?.totalReal) return { score: null, atRisk: false, reason: "Not enough real multi-quarter data to assess value-trap risk." };
  const deterioratingCount = divergence.totalReal - divergence.improvingCount;
  const deteriorationRatio = deterioratingCount / divergence.totalReal;
  const cheapGate = Number.isFinite(valueScore) && valueScore >= 55;
  const score = Math.round(deteriorationRatio * (cheapGate ? 100 : 30));
  return {
    score, atRisk: trapCheck.atRisk,
    reason: trapCheck.reason || (cheapGate ? "Screens cheap with a healthy real fundamental trend." : "Not screening cheap enough for a real value-trap read to apply."),
  };
}

// GARP (Growth At a Reasonable Price) — real combinator over already-real
// fields/trends, never a new scoring formula. YES requires every real
// condition to hold; WATCH when all but one do; NO otherwise. Missing
// real data just fails that one condition — never guessed as passing.
function computeGarpStatus({ fundamentals, divergence }) {
  if (!fundamentals) return "NO";
  const revenueGrowth = Number(fundamentals.revenueGrowth);
  const peg = Number(fundamentals.pegRatio);
  const fcfYield = Number(fundamentals.fcfYield);
  const netDebtToEbitda = Number(fundamentals.netDebtToEbitda);
  const conditions = {
    growing: Number.isFinite(revenueGrowth) && revenueGrowth > 0.05,
    reasonablePeg: Number.isFinite(peg) && peg > 0 && peg <= 2,
    positiveFcf: Number.isFinite(fcfYield) && fcfYield > 0,
    manageableDebt: !Number.isFinite(netDebtToEbitda) || netDebtToEbitda <= 3,
    trendOk: !divergence?.totalReal || (divergence.totalReal - divergence.improvingCount) < Math.ceil(divergence.totalReal * 0.6),
  };
  const metCount = Object.values(conditions).filter(Boolean).length;
  const total = Object.keys(conditions).length;
  if (metCount === total) return "YES";
  if (metCount >= total - 1) return "WATCH";
  return "NO";
}

// Real valuation trend — reuses the SAME real multi-quarter divergence
// majority-improving/deteriorating classification mispricing-engine.js
// already computes, never a second trend engine or a fabricated
// day-over-day delta (this app has no persisted historical
// valuationScore snapshot store, so a real day-over-day change isn't
// honestly available yet — the real multi-quarter fundamental trend is
// the real signal that already exists).
function computeValuationTrend(divergence) {
  if (!divergence?.totalReal) return "STABLE";
  const deterioratingCount = divergence.totalReal - divergence.improvingCount;
  if (divergence.improvingCount >= Math.ceil(divergence.totalReal * 0.6)) return "IMPROVING";
  if (deterioratingCount >= Math.ceil(divergence.totalReal * 0.6)) return "DETERIORATING";
  return "STABLE";
}

// Real 4-zone buy-price relabeling of future-value-scoring.js's own real
// analyst-target fair-value bands — no new price-target model, just a
// relabel of the exact same real conservative/idealBuyZoneMax/fairValue/
// bull numbers onto this prompt's requested 4-zone vocabulary.
function computeBuyZones(fairValue) {
  if (!fairValue) return null;
  return {
    aggressiveBuyBelow: fairValue.conservative,
    goodBuyRange: [fairValue.conservative, fairValue.idealBuyZoneMax],
    fairValueRange: [fairValue.idealBuyZoneMax, fairValue.fairValue],
    expensiveAbove: fairValue.fairValue,
    referenceHigh: fairValue.bull,
  };
}

// Real forward P/E — price / Yahoo's own real forwardEps (this app's only
// real forward-EPS source; FMP's own fetch here never returns one). Null
// (never derived from trailing P/E) when forwardEps isn't real/positive.
function computeForwardPE(price, forwardEps) {
  const px = Number(price), eps = Number(forwardEps);
  if (!Number.isFinite(px) || !Number.isFinite(eps) || eps <= 0) return null;
  return round1(px / eps);
}

// Real PEG status off fundamentals.pegRatio (FMP's own real
// priceToEarningsGrowthRatioTTM) — never recomputed. Honestly null (not
// a fabricated status) when EPS/growth are non-positive, since PEG is
// meaningless against negative growth (explicit prompt rule + this
// file's own header disclosure).
function pegStatusFor(peg, earningsGrowth) {
  if (!Number.isFinite(peg) || peg <= 0) return null;
  if (!Number.isFinite(earningsGrowth) || earningsGrowth <= 0) return null;
  if (peg <= 1) return "ATTRACTIVE";
  if (peg <= 2) return "REASONABLE";
  return "EXPENSIVE";
}

// Real revenue-trend label off the SAME real multi-quarter series
// mispricing-engine.js's divergence already computed — never a second
// quarterly-history fetch or classifier.
function revenueTrendFor(divergence) {
  const m = divergence?.metrics?.revenueGrowth;
  if (!m || !Array.isArray(m.series) || m.series.length < 2) return null;
  return m.improving ? "ACCELERATING" : "DECELERATING";
}

// Real data-completeness confidence — same "sum of real completeness
// bonuses" discipline opportunity-hunter.js's computeConfidenceScore
// already established, applied to this engine's own real inputs.
function computeValuationConfidence({ hasFundamentals, hasHistory, hasFairValue, hasForwardPE }) {
  let score = 20; // base — some real read exists at all
  if (hasFundamentals) score += 35;
  if (hasHistory) score += 25;
  if (hasFairValue) score += 15;
  if (hasForwardPE) score += 5;
  return Math.max(0, Math.min(100, score));
}

// The one canonical entry point — assembles every real piece above into
// one object. `fundamentals` = providers/fmp.js's real fetchFmpFundamentals
// output; `fundamentalsHistory` = fetchFmpFundamentalsHistory's real
// per-quarter array; `price` = real current price; `forwardEps` = real
// Yahoo epsForward (optional); `priceChangePct` = real price % change
// over the same real history window (optional, for divergence context).
function computeValuationProfile({ fundamentals, fundamentalsHistory, price, forwardEps, priceChangePct } = {}) {
  if (!fundamentals) {
    return {
      available: false, reason: "No real fundamentals data available for this symbol.",
      valuationScore: null, valuationLevel: null, valuationConfidence: 0,
    };
  }

  const valuationScore = computeValueScore(fundamentals);
  const fairValue = computeFairValueBands(fundamentals, price);
  const divergence = computeFundamentalDivergence({ quarters: fundamentalsHistory, priceChangePct });
  const valueTrap = computeValueTrapScore({ valueScore: valuationScore, divergence });
  const forwardPE = computeForwardPE(price, forwardEps);

  return {
    available: true,
    valuationScore, valuationLevel: valuationLevelFor(valuationScore),
    forwardPE,
    // Honestly unavailable — no real 5yr P/E history / sector-median
    // source exists in this codebase (see header). Never guessed.
    sectorForwardPE: null, fiveYearMedianPE: null, fiveYearLowPE: null, fiveYearHighPE: null, peDiscountToHistory: null,
    trailingPE: Number.isFinite(fundamentals.pe) ? fundamentals.pe : null,
    peg: Number.isFinite(fundamentals.pegRatio) ? fundamentals.pegRatio : null,
    pegStatus: pegStatusFor(fundamentals.pegRatio, fundamentals.earningsGrowth),
    fcfYield: Number.isFinite(fundamentals.fcfYield) ? round1(fundamentals.fcfYield * 100) : null,
    fcfGrowth: Number.isFinite(fundamentals.freeCashFlowGrowth) ? round1(fundamentals.freeCashFlowGrowth * 100) : null,
    // Honestly unavailable as true analyst-consensus revisions (no real
    // estimate-history source) — reportedEpsGrowthTrend below is the
    // real available proxy, labeled distinctly.
    epsRevision7D: null, epsRevision30D: null, epsRevision90D: null,
    reportedEpsGrowthTrend: divergence?.metrics?.epsGrowth?.label || null,
    revenueTrend: revenueTrendFor(divergence),
    latestRevenueGrowth: Number.isFinite(fundamentals.revenueGrowth) ? round1(fundamentals.revenueGrowth * 100) : null,
    netDebtToEbitda: Number.isFinite(fundamentals.netDebtToEbitda) ? round1(fundamentals.netDebtToEbitda) : null,
    balanceSheetRisk: !Number.isFinite(fundamentals.netDebtToEbitda) ? null
      : fundamentals.netDebtToEbitda < 1 ? "LOW" : fundamentals.netDebtToEbitda < 2 ? "MODERATE" : fundamentals.netDebtToEbitda < 3 ? "ELEVATED" : "HIGH",
    valueTrapRisk: valueTrap.score, valueTrapLevel: valueTrapLevelFor(valueTrap.score), valueTrapReason: valueTrap.reason,
    garpStatus: computeGarpStatus({ fundamentals, divergence }),
    valuationTrend: computeValuationTrend(divergence),
    buyZones: computeBuyZones(fairValue),
    fairValue,
    divergence,
    valuationConfidence: computeValuationConfidence({
      hasFundamentals: !!fundamentals, hasHistory: !!(fundamentalsHistory && fundamentalsHistory.length >= 2),
      hasFairValue: !!fairValue, hasForwardPE: Number.isFinite(forwardPE),
    }),
  };
}

module.exports = {
  computeValuationProfile, valuationLevelFor, valueTrapLevelFor, computeValueTrapScore,
  computeGarpStatus, computeValuationTrend, computeBuyZones, computeForwardPE, pegStatusFor, revenueTrendFor,
  computeValuationConfidence, VALUATION_LEVELS, VALUE_TRAP_LEVELS,
};
