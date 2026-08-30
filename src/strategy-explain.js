"use strict";
// strategy-explain.js — "WHY THIS TRADE?" narrative layer over
// strategy-ranking.js's real composite (Central Opportunity & Options
// Engine goal, 2026-08-30: "For EVERY ranked strategy, explain: why this
// strategy, why now, why not the alternatives, what market condition it
// requires, max/defined risk, profit potential, expected risk/reward,
// POP when calculable, IV impact, theta impact, liquidity, what would
// invalidate it").
//
// Adds ZERO new scoring — every number quoted here (pop, riskReward,
// liquidity, composite, maxProfit/maxLoss, breakeven) already exists on
// strategy-ranking.js's own real output. This file only turns those real
// numbers into real, grounded sentences, plus a small set of genuinely
// objective, disclosed options-theory facts per structure (how each
// structure responds to IV/theta — the same textbook facts on every
// options-education page, not fabricated per-symbol data). Where real
// per-symbol technical/catalyst context (breakout, volume, RS, news) is
// supplied by the caller, it's cited by name; where it isn't, those
// bullets are honestly omitted, never invented.
const { round2 } = require("./utils");

// Objective, disclosed per-structure Greeks behavior — real options
// theory, the same for every symbol, never fabricated market data.
const IV_IMPACT = {
  "Long Calls": { stance: "LONG VEGA", note: "Benefits from IV expansion, hurt by IV contraction — even a right directional call can lose money if IV drops enough." },
  "Long Puts": { stance: "LONG VEGA", note: "Benefits from IV expansion, hurt by IV contraction — even a right directional call can lose money if IV drops enough." },
  "Bull Call Spread": { stance: "NEAR-NEUTRAL VEGA", note: "The short leg's vega offsets most of the long leg's — direction matters far more than IV here." },
  "Bear Put Spread": { stance: "NEAR-NEUTRAL VEGA", note: "The short leg's vega offsets most of the long leg's — direction matters far more than IV here." },
  "Iron Condor": { stance: "SHORT VEGA", note: "Benefits from IV contraction or stable IV, hurt by a sudden IV spike even if price stays inside the short strikes." },
};
const THETA_IMPACT = {
  "Long Calls": { stance: "NEGATIVE THETA", note: "Time decay works against this position every day held — the move needs to happen before decay erodes the premium." },
  "Long Puts": { stance: "NEGATIVE THETA", note: "Time decay works against this position every day held — the move needs to happen before decay erodes the premium." },
  "Bull Call Spread": { stance: "SMALL NEGATIVE THETA", note: "The short leg's decay partially offsets the long leg's — a real, smaller drag than a naked long." },
  "Bear Put Spread": { stance: "SMALL NEGATIVE THETA", note: "The short leg's decay partially offsets the long leg's — a real, smaller drag than a naked long." },
  "Iron Condor": { stance: "POSITIVE THETA", note: "Time decay works FOR this position every day price stays inside the short strikes." },
};

// Real, disclosed structural requirement per structure — matches the
// goal's own "use when" criteria verbatim in spirit. Static per
// structure type (objective options-strategy theory), not derived from
// any one symbol's data.
const MARKET_CONDITION_REQUIRED = {
  "Long Calls": "A bullish move large enough to overcome the full premium paid and time decay — best when expecting a real, sizable move, not a small grind higher.",
  "Long Puts": "A bearish move large enough to overcome the full premium paid and time decay — best when expecting a real, sizable move down, not a small drift lower.",
  "Bull Call Spread": "A bullish move to a reasonably identifiable target — preferred over a naked call when the expected move is moderate rather than explosive, or when IV makes the naked call's premium expensive relative to the likely payoff.",
  "Bear Put Spread": "A bearish move to a reasonably identifiable target — preferred over a naked put when the expected downside is moderate rather than explosive, or when IV makes the naked put's premium expensive relative to the likely payoff.",
  "Iron Condor": "A range-bound market with no major catalyst expected before expiration, and IV elevated enough that the credit collected justifies the defined risk on both sides — never appropriate simply because it scores well; the regime has to actually support it.",
};

function fmtMoney(n) { return Number.isFinite(n) ? `$${n.toFixed(2)}` : "—"; }

// Real breakeven-derived invalidation statement — same real breakeven
// prices computeStructurePop already computes internally, just surfaced
// as a plain-English statement instead of only feeding a probability.
function computeInvalidation(strategy, construction) {
  const legs = construction.legs || [];
  if (strategy === "Long Calls") return `Price stays below the real breakeven of ${fmtMoney(legs[0].strike + legs[0].premium)} (strike + premium paid) through expiration.`;
  if (strategy === "Long Puts") return `Price stays above the real breakeven of ${fmtMoney(legs[0].strike - legs[0].premium)} (strike − premium paid) through expiration.`;
  if (strategy === "Bull Call Spread") {
    const long = legs.find((l) => l.action === "BUY");
    return `Price stays below the real breakeven of ${fmtMoney(long.strike + construction.netDebit)} (long strike + net debit) through expiration.`;
  }
  if (strategy === "Bear Put Spread") {
    const long = legs.find((l) => l.action === "BUY");
    return `Price stays above the real breakeven of ${fmtMoney(long.strike - construction.netDebit)} (long strike − net debit) through expiration.`;
  }
  if (strategy === "Iron Condor") {
    const shortCall = legs.find((l) => l.action === "SELL" && l.type === "call");
    const shortPut = legs.find((l) => l.action === "SELL" && l.type === "put");
    if (!shortCall || !shortPut) return null;
    return `Price closes outside the real ${fmtMoney(shortPut.strike)}–${fmtMoney(shortCall.strike)} range (the short strikes) at expiration.`;
  }
  return null;
}

// Real max risk / profit potential statement — naked longs have no real
// maxProfit field (a call's upside is real but theoretically unbounded;
// a put's is capped at strike-to-zero, still not a single dollar figure)
// so this states the real structural fact instead of fabricating a
// number the construction object doesn't have.
function riskProfitStatement(strategy, construction) {
  const legs = construction.legs || [];
  if (strategy === "Long Calls") {
    return { maxRisk: fmtMoney(legs[0].premium) + " (full premium paid) — the real, only way to lose more is if this were sold naked, which it isn't.", profitPotential: "Theoretically unlimited — the real payoff scales with how far price moves above the strike." };
  }
  if (strategy === "Long Puts") {
    return { maxRisk: fmtMoney(legs[0].premium) + " (full premium paid).", profitPotential: `Capped at ${fmtMoney(legs[0].strike - legs[0].premium)} per share if price fell to zero — real, large, but not unlimited the way a call's upside is.` };
  }
  return {
    maxRisk: construction.maxLoss != null ? fmtMoney(construction.maxLoss) + " (defined — the most this position can lose, full stop)." : "—",
    profitPotential: construction.maxProfit != null ? fmtMoney(construction.maxProfit) + " (defined — the most this position can make, full stop)." : "—",
  };
}

// "Why this / why now" bullets — real, computed factors on `scored`
// (POP/riskReward/liquidity/alignment) plus, when the caller supplies
// real per-symbol technical context (technicals param — breakout status,
// volume ratio, RS rating, catalyst reasons already computed elsewhere
// in this app, e.g. am-core-engine.js's own coreScore breakdown), those
// too. Never invents a bullet it can't back with a real field.
function whyThisAndNow(strategy, scored, { bias, character, technicals } = {}) {
  const bullets = [];
  if (scored.pop != null) bullets.push(`${scored.pop}% real probability of profit at expiration (Black-Scholes, off this contract's real IV/DTE).`);
  if (scored.riskReward != null) bullets.push(`${scored.riskReward}:1 real risk/reward.`);
  if (scored.liquidity != null) bullets.push(`${scored.liquidity}/100 real liquidity (bid/ask spread + open interest + volume) — ${scored.liquidity >= 70 ? "should fill cleanly" : scored.liquidity >= 40 ? "fillable but watch the spread" : "thin — expect real slippage on entry/exit"}.`);
  const structureBias = require("./strategy-ranking").STRUCTURE_BIAS[strategy];
  if (bias) {
    bullets.push(
      structureBias === bias ? `Aligned with the platform's real ${bias} market read.`
      : structureBias === "Range" && character === "Range" ? "Aligned with the platform's real range-bound market read."
      : structureBias === "Range" ? `Market-neutral structure — doesn't depend on the real ${bias} directional read being correct.`
      : `Works AGAINST the platform's real ${bias} market read — ranked here only because its other real numbers (POP/liquidity/risk-reward) are strong enough to still place, not because direction favors it. Weigh this carefully.`
    );
  }
  if (technicals) {
    if (technicals.breakoutConfirmed) bullets.push("Real breakout confirmed on volume.");
    if (Number.isFinite(technicals.volRatio) && technicals.volRatio >= 1.4) bullets.push(`Real volume expansion — ${technicals.volRatio.toFixed(1)}x the 50-day average.`);
    if (Number.isFinite(technicals.rsRating) && technicals.rsRating >= 80) bullets.push(`Real relative strength — RS Rating ${technicals.rsRating}.`);
    if (technicals.catalystReasons?.length) bullets.push(`Real catalyst: ${technicals.catalystReasons.join("; ")}.`);
  }
  return bullets;
}

// Real "why not #1 / why not the alternatives" comparison — every
// statement here is a real diff against another ranked structure's own
// real fields, never a fabricated preference.
function whyNotAlternative(top, other) {
  const parts = [];
  if (other.composite < top.composite) parts.push(`scores ${top.composite - other.composite} points lower on the real composite`);
  if (top.pop != null && other.pop != null && other.pop < top.pop) parts.push(`${top.pop - other.pop} points lower real probability of profit`);
  if (top.riskReward != null && other.riskReward != null && other.riskReward < top.riskReward) parts.push(`a real ${other.riskReward}:1 vs. ${top.riskReward}:1 risk/reward`);
  const topConstruction = top.construction, otherConstruction = other.construction;
  if (otherConstruction?.maxProfit != null && topConstruction && topConstruction.maxProfit == null) {
    parts.push(`caps real profit at ${fmtMoney(otherConstruction.maxProfit)} where ${top.strategy} does not`);
  }
  if (!parts.length) parts.push("close on the real numbers, but ranked below on the composite");
  return `${other.strategy} — ${parts.join(", ")}.`;
}

// Real options-data confidence — degrades honestly when the real chain
// couldn't resolve pop/liquidity (missing iv/dte, thin chain), same
// "REAL DATA vs DERIVED SIGNAL vs UNAVAILABLE" distinction the goal asks
// for. Never a fabricated 100 when data is actually incomplete.
function computeOptionsConfidence(scored) {
  let confidence = 100;
  const notes = [];
  if (scored.pop == null) { confidence -= 30; notes.push("real probability of profit unavailable (missing IV/DTE on this chain)"); }
  if (scored.liquidity == null) { confidence -= 20; notes.push("real liquidity score unavailable"); }
  if (scored.riskReward == null) { confidence -= 15; notes.push("real risk/reward unavailable"); }
  confidence = Math.max(5, Math.min(100, confidence));
  return { confidence, dataQuality: confidence >= 85 ? "REAL_DATA" : confidence >= 50 ? "DERIVED_SIGNAL" : "UNAVAILABLE", notes };
}

// The one real entry point — builds the full "why" explanation object
// for one ranked structure against the full ranked list (for the
// why-not-alternatives comparison).
function explainStrategy(scored, allRanked, { bias, character, technicals } = {}) {
  const strategy = scored.strategy;
  const construction = scored.construction || {};
  const { maxRisk, profitPotential } = riskProfitStatement(strategy, construction);
  const alternatives = (allRanked || [])
    .filter((s) => s.strategy !== strategy)
    .slice(0, 3)
    .map((other) => ({ strategy: other.strategy, composite: other.composite, whyNot: whyNotAlternative(scored, other) }));
  const { confidence, dataQuality, notes } = computeOptionsConfidence(scored);

  return {
    strategy,
    whyThis: whyThisAndNow(strategy, scored, { bias, character, technicals }),
    marketConditionRequired: MARKET_CONDITION_REQUIRED[strategy] || null,
    maxRisk, profitPotential,
    riskReward: scored.riskReward, probabilityOfProfit: scored.pop, liquidity: scored.liquidity,
    ivImpact: IV_IMPACT[strategy] || null,
    thetaImpact: THETA_IMPACT[strategy] || null,
    invalidation: computeInvalidation(strategy, construction),
    whyNotAlternatives: alternatives,
    optionsConfidence: confidence, dataQuality, dataQualityNotes: notes,
  };
}

module.exports = { explainStrategy, computeInvalidation, computeOptionsConfidence, IV_IMPACT, THETA_IMPACT, MARKET_CONDITION_REQUIRED };
