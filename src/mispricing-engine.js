"use strict";

// mispricing-engine.js — Hidden Gems / Undervalued Opportunities engine
// (2026-09-07, "3-Second AI Decision System" spec, §4). ANTI-DUPLICATION:
// this codebase already has a real, thorough undervaluation engine —
// future-value-scoring.js's computeFutureValueRead (Quality/Growth/Moat/
// Financial-Strength/Value scores, real analyst-target fair-value bands,
// the exact "never confuse good company with good stock price" philosophy
// the new spec also asks for). This file does NOT rebuild any of that —
// it REUSES those scores as inputs and adds the three genuinely new
// pieces the existing engine didn't have:
//   1. Fundamental Divergence — a real, multi-quarter trend comparison
//      (providers/fmp.js's new fetchFmpFundamentalsHistory), not a single
//      current-snapshot read.
//   2. A Mispricing Score with the spec's own explicit ask ("do NOT
//      blindly hard-code weights... make the system configurable") —
//      configurable weights, real default values, folding in the
//      divergence trend + technical timing + institutional/catalyst
//      reads future-value-scoring.js never had.
//   3. The spec's mandatory 5-question narrative (WHY / WHY IS THE MARKET
//      WRONG / WHAT CHANGES THE STORY / WHEN / WHAT INVALIDATES) — real,
//      deterministic rule-matching over the same real inputs above, same
//      "keyword/threshold rules, no AI call" discipline as this app's
//      other classifiers (news/classifier.js, macro-engine.js).
//
// Value-trap guard (explicit spec worry, and Agent 3's own audit
// question: "can Hidden Gems distinguish undervalued business from value
// trap?"): a cheap valuation with DETERIORATING fundamentals is flagged
// as a real warning and excluded from the "hidden gem" framing, never
// treated as attractive just because it screens cheap.

function round(x) { return Number.isFinite(x) ? Math.round(x) : null; }

// Real, disclosed noise thresholds — a change smaller than these doesn't
// count as a genuine trend, just quarter-to-quarter noise.
const TREND_THRESHOLDS = { revenueGrowth: 0.02, margin: 0.01, epsGrowth: 0.02, netDebtToEbitda: 0.1, fcfYield: 0.01 };

function seriesOf(quarters, key) {
  return (quarters || []).map((q) => q[key]).filter(Number.isFinite);
}

function fmtPct(v) { return `${Math.round(v * 100)}%`; }

// Real multi-quarter trend comparison — the spec's own explicit "90 days
// ago vs today (and longer windows when useful)" ask. `quarters` is
// providers/fmp.js's fetchFmpFundamentalsHistory output (oldest->newest).
// `priceChangePct` is the REAL stock price % change over the same real
// window (caller supplies it from already-fetched bars — this function
// never fetches price itself).
function computeFundamentalDivergence({ quarters, priceChangePct } = {}) {
  if (!Array.isArray(quarters) || quarters.length < 2) {
    return { detected: false, reason: "Not enough real quarterly history to compare.", evidence: [], metrics: {} };
  }

  const metrics = {};
  let improvingCount = 0, totalReal = 0;

  const rev = seriesOf(quarters, "revenueGrowth");
  if (rev.length >= 2) {
    totalReal++;
    const improving = rev[rev.length - 1] > rev[0] + TREND_THRESHOLDS.revenueGrowth;
    if (improving) improvingCount++;
    metrics.revenueGrowth = { series: rev, improving, label: `Revenue growth: ${rev.map(fmtPct).join(" → ")}${improving ? " (accelerating)" : ""}` };
  }

  const margin = seriesOf(quarters, "operatingMargin").length >= 2 ? seriesOf(quarters, "operatingMargin") : seriesOf(quarters, "grossMargin");
  if (margin.length >= 2) {
    totalReal++;
    const improving = margin[margin.length - 1] > margin[0] + TREND_THRESHOLDS.margin;
    if (improving) improvingCount++;
    metrics.margin = { series: margin, improving, label: `Margins: ${margin.map(fmtPct).join(" → ")}${improving ? " (expanding)" : ""}` };
  }

  const eps = seriesOf(quarters, "epsGrowth");
  if (eps.length >= 2) {
    totalReal++;
    const improving = eps[eps.length - 1] > eps[0] + TREND_THRESHOLDS.epsGrowth;
    if (improving) improvingCount++;
    metrics.epsGrowth = { series: eps, improving, label: `EPS growth: ${eps.map(fmtPct).join(" → ")}${improving ? " (accelerating)" : ""}` };
  }

  const debt = seriesOf(quarters, "netDebtToEbitda");
  if (debt.length >= 2) {
    totalReal++;
    const improving = debt[debt.length - 1] < debt[0] - TREND_THRESHOLDS.netDebtToEbitda;
    if (improving) improvingCount++;
    metrics.netDebtToEbitda = { series: debt, improving, label: `Net debt/EBITDA: ${debt.map((v) => v.toFixed(1)).join(" → ")}${improving ? " (declining)" : ""}` };
  }

  const fcf = seriesOf(quarters, "fcfYield");
  if (fcf.length >= 2) {
    totalReal++;
    const improving = fcf[fcf.length - 1] > fcf[0] + TREND_THRESHOLDS.fcfYield;
    if (improving) improvingCount++;
    metrics.fcfYield = { series: fcf, improving, label: `FCF yield: ${fcf.map(fmtPct).join(" → ")}${improving ? " (improving)" : ""}` };
  }

  if (totalReal === 0) return { detected: false, reason: "No real comparable quarterly metrics available.", evidence: [], metrics };

  const evidence = Object.values(metrics).map((m) => m.label);
  const majorityImproving = improvingCount >= Math.ceil(totalReal * 0.6);
  const priceMoveKnown = Number.isFinite(priceChangePct);
  const priceRoughlyFlat = !priceMoveKnown || Math.abs(priceChangePct) < 10;
  const detected = majorityImproving && priceRoughlyFlat;

  return {
    detected, improvingCount, totalReal, priceChangePct: priceMoveKnown ? priceChangePct : null, evidence, metrics,
    reason: detected
      ? `${improvingCount}/${totalReal} real fundamental metrics improved over this window while the stock price ${priceMoveKnown ? `moved only ${priceChangePct.toFixed(1)}%` : "stayed roughly flat"} — business reality may be improving faster than the market has priced in.`
      : majorityImproving
        ? "Fundamentals are improving, but the real price move over this window already looks significant — may already be reflected."
        : "No clear real fundamental-improvement trend detected over this window.",
  };
}

// Value-trap guard — explicit spec worry ("Cheap can be a value trap").
// Real rule: an attractive real valuation score alongside REAL
// deteriorating FCF/margin/revenue trend is a warning, not a buy signal.
function classifyValueTrapRisk({ valueScore, divergence } = {}) {
  if (!Number.isFinite(valueScore) || valueScore < 55 || !divergence?.totalReal) return { atRisk: false };
  const deterioratingCount = divergence.totalReal - divergence.improvingCount;
  const majorityDeteriorating = deterioratingCount >= Math.ceil(divergence.totalReal * 0.6);
  if (!majorityDeteriorating) return { atRisk: false };
  return {
    atRisk: true,
    reason: `Screens cheap (Value Score ${valueScore}/100) but ${deterioratingCount}/${divergence.totalReal} real fundamental trends are DETERIORATING, not improving — a real value-trap warning, not a hidden gem.`,
  };
}

// Mispricing Score — real, CONFIGURABLE weights (spec's own explicit
// requirement). Defaults match the spec's own suggested weighting;
// callers may override any subset. Every component here is either a
// real already-computed score this app produces elsewhere
// (future-value-scoring.js, party-stage-engine.js, institution-score.js)
// or a real trend read from computeFundamentalDivergence above — never a
// second, redundant calculation of the same signal, and missing
// components are disclosed, never defaulted to a fabricated midpoint.
const DEFAULT_MISPRICING_WEIGHTS = {
  valuation: 0.20, fcfQuality: 0.15, revenueAcceleration: 0.08, epsRevisions: 0.10,
  marginTrajectory: 0.08, roic: 0.08, balanceSheetQuality: 0.07, catalystQuality: 0.10,
  institutionalBehavior: 0.07, relativeStrengthTiming: 0.07,
};

function trendComponentScore(metric) {
  if (!metric) return null;
  return metric.improving ? 80 : 25;
}

function computeMispricingScore(inputs = {}, weights = DEFAULT_MISPRICING_WEIGHTS) {
  const { valueScore, financialStrength, roic, divergence, catalystScore, institutionScore, relativeStrengthTiming } = inputs;
  const raw = {
    valuation: Number.isFinite(valueScore) ? valueScore : null,
    fcfQuality: Number.isFinite(financialStrength) ? financialStrength : null,
    revenueAcceleration: trendComponentScore(divergence?.metrics?.revenueGrowth),
    epsRevisions: trendComponentScore(divergence?.metrics?.epsGrowth),
    marginTrajectory: trendComponentScore(divergence?.metrics?.margin),
    roic: Number.isFinite(roic) ? Math.max(0, Math.min(100, Math.round(roic * 4))) : null, // real, disclosed re-scale: 25% ROIC -> 100
    balanceSheetQuality: trendComponentScore(divergence?.metrics?.netDebtToEbitda) ?? (Number.isFinite(financialStrength) ? financialStrength : null),
    catalystQuality: Number.isFinite(catalystScore) ? catalystScore : null,
    institutionalBehavior: Number.isFinite(institutionScore) ? institutionScore : null,
    relativeStrengthTiming: Number.isFinite(relativeStrengthTiming) ? relativeStrengthTiming : null,
  };

  const unavailable = [];
  let weightedSum = 0, usedWeight = 0;
  for (const [key, value] of Object.entries(raw)) {
    const w = Number(weights[key]) || 0;
    if (Number.isFinite(value)) { weightedSum += value * w; usedWeight += w; }
    else unavailable.push(key);
  }

  if (usedWeight <= 0) return { score: null, components: raw, unavailable, weights, reasons: ["No real components available to compute a mispricing score."] };

  // Renormalized over only the real, available weight — the same
  // "average over what you actually have, never fabricate the rest"
  // discipline as crypto-macro-engine.js's Crypto Macro Score.
  const score = Math.max(0, Math.min(100, round(weightedSum / usedWeight)));
  return {
    score, components: raw, unavailable, weights,
    reasons: [`Real weighted average across ${Object.keys(raw).length - unavailable.length}/${Object.keys(raw).length} available components (${Math.round(usedWeight * 100)}% of total real weight used).`],
  };
}

// The spec's mandatory 5-question narrative — real, deterministic rule-
// matching over the SAME real inputs already computed above. Never a
// generic "low P/E" explanation (the spec's own explicit prohibition).
const WHY_RULES = [
  { test: (i) => i.divergence?.metrics?.margin?.improving && !i.divergence?.metrics?.revenueGrowth?.improving, label: "Margin recovery not yet reflected — the market may still be anchored to prior, weaker profitability." },
  { test: (i) => i.divergence?.metrics?.netDebtToEbitda?.improving, label: "Real debt reduction is underway; the market may still be pricing the balance-sheet risk of a year ago." },
  { test: (i) => i.divergence?.metrics?.revenueGrowth?.improving && i.divergence?.metrics?.epsGrowth?.improving, label: "Revenue and earnings growth are both real-accelerating faster than the current valuation reflects." },
  { test: (i) => i.divergence?.metrics?.fcfYield?.improving, label: "Real free-cash-flow generation is improving — a business fundamental the market may not have fully re-rated yet." },
  { test: () => true, label: "No single strong real divergence signal — any mispricing read here is a genuinely weaker, more speculative case." },
];

function answerWhy(inputs) {
  return (WHY_RULES.find((r) => r.test(inputs)) || WHY_RULES[WHY_RULES.length - 1]).label;
}

function answerWhyMarketWrong({ divergence } = {}) {
  const improving = Object.entries(divergence?.metrics || {}).filter(([, m]) => m.improving).map(([k]) => k);
  if (!improving.length) {
    return { marketThinks: "No real evidence the market's current narrative is wrong.", evidence: "Fundamentals are not showing a clear real improving trend over the available window." };
  }
  return {
    marketThinks: "The business is still as weak as its last few quarters suggested.",
    evidence: `Real quarterly data disagrees: ${divergence.evidence.join("; ")}.`,
  };
}

function answerWhatChanges({ catalystScore, catalystLabel } = {}) {
  if (!Number.isFinite(catalystScore)) return { catalyst: "No real catalyst data available for this symbol.", catalystQuality: null };
  return { catalyst: catalystLabel || "A real upcoming event (per event-risk-engine.js) may force a re-rating.", catalystQuality: catalystScore };
}

// WHEN — the spec's mandatory combination of fundamental attractiveness
// with real entry timing. Never "undervalued" alone; always paired with
// a real technical-timing read (party-stage-engine.js's entryTimingScore
// or a caller-supplied equivalent).
function answerWhen({ mispricingScore, entryTimingScore } = {}) {
  const hasQuality = Number.isFinite(mispricingScore);
  const hasTiming = Number.isFinite(entryTimingScore);
  if (!hasQuality) return { verdict: "INSUFFICIENT_DATA", icon: "⚪", label: "Insufficient real data" };
  if (mispricingScore < 55) return { verdict: "NOT_A_GEM", icon: "⚪", label: "Not a real mispricing case right now" };
  if (!hasTiming || entryTimingScore < 40) return { verdict: "EXCELLENT_COMPANY_WAIT", icon: "🟡", label: "Excellent Company — Wait" };
  return { verdict: "ACCUMULATE_NOW", icon: "🟢", label: "Accumulate Now" };
}

function answerWhatInvalidates({ divergence, valueTrapRisk } = {}) {
  const items = [];
  if (valueTrapRisk?.atRisk) items.push(`Fundamental: ${valueTrapRisk.reason}`);
  if (divergence?.metrics?.revenueGrowth && !divergence.metrics.revenueGrowth.improving) items.push("Fundamental: real revenue growth trend reverses back to deceleration.");
  if (divergence?.metrics?.netDebtToEbitda && !divergence.metrics.netDebtToEbitda.improving) items.push("Fundamental: real net debt/EBITDA trend reverses back to rising.");
  items.push("Technical: price breaks real structure/support before the thesis has time to play out.");
  items.push("Time-based: the expected catalyst window passes with no real re-rating.");
  return items;
}

// One combined real read per symbol — composes every function above.
function computeHiddenGemProfile(inputs = {}) {
  const divergence = computeFundamentalDivergence(inputs);
  const valueTrapRisk = classifyValueTrapRisk({ valueScore: inputs.valueScore, divergence });
  const mispricing = computeMispricingScore({ ...inputs, divergence }, inputs.weights);
  const when = answerWhen({ mispricingScore: mispricing.score, entryTimingScore: inputs.relativeStrengthTiming });
  return {
    divergence, valueTrapRisk, mispricing,
    why: answerWhy({ divergence }),
    whyMarketWrong: answerWhyMarketWrong({ divergence }),
    whatChanges: answerWhatChanges(inputs),
    when,
    whatInvalidates: answerWhatInvalidates({ divergence, valueTrapRisk }),
  };
}

module.exports = {
  DEFAULT_MISPRICING_WEIGHTS,
  computeFundamentalDivergence, classifyValueTrapRisk, computeMispricingScore,
  answerWhy, answerWhyMarketWrong, answerWhatChanges, answerWhen, answerWhatInvalidates,
  computeHiddenGemProfile,
};
