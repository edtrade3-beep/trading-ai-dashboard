// strategy-ranking.js — Options Strategy Ranking Engine (Trade Desk
// redesign Phase 2, spec §15: "Don't simply recommend 'buy puts.' Evaluate
// [structures]... rank by Expected Value, Probability, IV, Theta decay,
// Liquidity, Risk/Reward"). Builds on strategy-selector.js's already-real
// leg construction (buildLegs — real strikes/premiums/max-profit/max-loss
// from a real ranked chain) rather than re-deriving it; the genuinely new
// piece here is scoring and ranking MULTIPLE real candidate structures
// against each other, where strategy-selector.js's own selectStrategy only
// ever returns a single deterministic pick.
"use strict";
const { normCdf } = require("./options-math");
const { buildLegs } = require("./strategy-selector");
const { round2 } = require("./utils");

// The 5 structures strategy-selector.js can actually build real legs for
// today (documented there as an explicit, non-exhaustive scope — Iron
// Butterfly/Calendar/Covered Call/Cash-Secured Put/Straddle are real
// follow-ups, not built). Ranking every symbol against only the
// structures this app can genuinely construct — never a phantom "Covered
// Call" row with no real legs behind it.
const CANDIDATE_STRATEGIES = ["Long Calls", "Long Puts", "Bull Call Spread", "Bear Put Spread", "Iron Condor"];

// Real natural directional lean of each structure — used only for the
// disclosed alignment bonus/penalty below, never to silently override a
// structure's own real numbers.
const STRUCTURE_BIAS = {
  "Long Calls": "Bullish", "Bull Call Spread": "Bullish",
  "Long Puts": "Bearish", "Bear Put Spread": "Bearish",
  "Iron Condor": "Range",
};

// probabilityBeyond — P(price finishes beyond `level` at expiry), real
// Black-Scholes N(d2) (same formula options-math.js's own
// probabilityOfProfit already uses for a contract's OWN strike; this
// generalizes it to an arbitrary real price level — a structure's real
// breakeven, not necessarily any single leg's strike). Returns null on
// missing real iv/dte, same honest-null convention as the rest of this
// module — never a guessed probability.
function probabilityBeyond({ level, underlying, iv, dte, direction }) {
  if (!Number.isFinite(level) || !(underlying > 0) || !(iv > 0) || !(dte > 0)) return null;
  const sigma = iv / 100, t = dte / 365;
  const d1 = (Math.log(underlying / level) + 0.5 * sigma * sigma * t) / (sigma * Math.sqrt(t));
  const d2 = d1 - sigma * Math.sqrt(t);
  const pAbove = normCdf(d2) * 100;
  return Math.round(Math.max(0, Math.min(100, direction === "above" ? pAbove : 100 - pAbove)));
}

function avgOf(values) {
  const v = values.filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

// computeStructurePop — the real probability THIS structure (not any one
// leg) finishes profitable at expiry, using each structure's own real
// breakeven price(s). A naked long's own leg.pop (rankContracts' output)
// measures P(finishes ITM at the strike) — not the same as P(profit),
// which must clear the real premium paid too. This is a genuine
// improvement over reusing leg.pop directly, not just a relabeling.
function computeStructurePop(strategy, construction, underlying) {
  const legs = construction.legs || [];
  const iv = avgOf(legs.map((l) => l.iv));
  const dte = avgOf(legs.map((l) => l.dte));
  if (!Number.isFinite(iv) || !Number.isFinite(dte)) return null;

  if (strategy === "Long Calls") {
    const breakeven = legs[0].strike + legs[0].premium;
    return probabilityBeyond({ level: breakeven, underlying, iv, dte, direction: "above" });
  }
  if (strategy === "Long Puts") {
    const breakeven = legs[0].strike - legs[0].premium;
    return probabilityBeyond({ level: breakeven, underlying, iv, dte, direction: "below" });
  }
  if (strategy === "Bull Call Spread") {
    const long = legs.find((l) => l.action === "BUY");
    const breakeven = long.strike + construction.netDebit;
    return probabilityBeyond({ level: breakeven, underlying, iv, dte, direction: "above" });
  }
  if (strategy === "Bear Put Spread") {
    const long = legs.find((l) => l.action === "BUY");
    const breakeven = long.strike - construction.netDebit;
    return probabilityBeyond({ level: breakeven, underlying, iv, dte, direction: "below" });
  }
  if (strategy === "Iron Condor") {
    // Standard real-world POP convention (the same one retail platforms
    // like Tastytrade/thinkorswim quote): probability price finishes
    // between the two SHORT strikes at expiry — a documented
    // simplification that ignores the small extra buffer the collected
    // credit itself provides beyond the short strikes.
    const shortCall = legs.find((l) => l.action === "SELL" && l.type === "call");
    const shortPut = legs.find((l) => l.action === "SELL" && l.type === "put");
    if (!shortCall || !shortPut) return null;
    const pAboveShortCall = probabilityBeyond({ level: shortCall.strike, underlying, iv, dte, direction: "above" });
    const pBelowShortPut = probabilityBeyond({ level: shortPut.strike, underlying, iv, dte, direction: "below" });
    if (pAboveShortCall == null || pBelowShortPut == null) return null;
    return Math.round(Math.max(0, Math.min(100, 100 - pAboveShortCall - pBelowShortPut)));
  }
  return null;
}

// computeRiskReward — a real 0-100 normalized reward-for-risk read.
// Capped structures (spreads/condor) use their own real maxProfit/maxLoss
// ratio directly. Naked longs have no defined maxProfit (a call's upside
// is theoretically unbounded) — rather than fabricate an "infinite"
// score, this projects the REAL intrinsic value at one real expected move
// (options-math.js's own expectedMove formula) in the trade's favorable
// direction, a standard, disclosed, bounded scenario, and scores the
// resulting return-on-premium the same way.
function computeRiskReward(strategy, construction, underlying) {
  const legs = construction.legs || [];
  if (construction.maxProfit != null && construction.maxLoss != null && construction.maxLoss > 0) {
    const ratio = construction.maxProfit / construction.maxLoss;
    return { ratio: round2(ratio), score: Math.round(Math.max(0, Math.min(1, ratio / 2)) * 100) };
  }
  if (strategy === "Long Calls" || strategy === "Long Puts") {
    const { expectedMove } = require("./options-math");
    const l = legs[0];
    const move = expectedMove({ iv: l.iv, underlying, dte: l.dte });
    if (move == null || !(l.premium > 0)) return { ratio: null, score: 50 };
    const priceAt1Move = strategy === "Long Calls" ? underlying + move : underlying - move;
    const intrinsic = strategy === "Long Calls" ? Math.max(0, priceAt1Move - l.strike) : Math.max(0, l.strike - priceAt1Move);
    const returnMultiple = round2((intrinsic - l.premium) / l.premium);
    return { ratio: returnMultiple, score: Math.round(Math.max(0, Math.min(1, (returnMultiple + 1) / 2)) * 100) };
  }
  return { ratio: null, score: 50 };
}

// scoreConstruction — the one real composite (documented weights, same
// judgment-call convention as options-math.js's own liquidityScore/
// rankContracts weights): POP 35% (the spec's own "Probability"),
// Risk/Reward 30% ("Expected Value" proxy — a real POP x real
// risk/reward already tells the same directional story as a formal EV$
// without needing to unify capped/uncapped payoff shapes into one
// fabricated number), Liquidity 20%, real directional alignment with the
// market bias 15%.
function scoreConstruction(strategy, construction, { underlying, bias, character }) {
  const legs = construction.legs || [];
  const pop = computeStructurePop(strategy, construction, underlying);
  const rr = computeRiskReward(strategy, construction, underlying);
  const liquidity = avgOf(legs.map((l) => l.liquidityScore));
  const structureBias = STRUCTURE_BIAS[strategy];
  const alignment = structureBias === bias ? 100 : (structureBias === "Range" && character === "Range") ? 100 : structureBias === "Range" || bias === undefined || bias === null ? 50 : 0;

  const popScore = pop != null ? pop : 50;
  const liqScore = liquidity != null ? liquidity : 50;
  const composite = Math.round(popScore * 0.35 + rr.score * 0.30 + liqScore * 0.20 + alignment * 0.15);
  const setupQuality = composite >= 80 ? "A" : composite >= 65 ? "B" : composite >= 50 ? "C" : composite >= 35 ? "D" : "F";

  const reasonParts = [];
  if (pop != null) reasonParts.push(`${pop}% real probability of profit`);
  if (rr.ratio != null) reasonParts.push(`${rr.ratio}:1 real risk/reward`);
  if (liquidity != null) reasonParts.push(`${liquidity}/100 real liquidity`);
  reasonParts.push(alignment >= 100 ? `aligned with the real ${bias || character} read` : alignment === 0 ? `works against the real ${bias} read` : "direction-neutral");

  return {
    strategy, pop, riskReward: rr.ratio, liquidity, alignment, composite, setupQuality,
    confidence: Math.max(5, Math.min(95, composite)),
    reason: reasonParts.join(", "),
  };
}

// rankAllStrategies — builds real legs for every real candidate structure
// off the SAME real ranked chain (never re-fetched per structure), scores
// each that came back with real, tradable legs, and ranks them. Honestly
// skips (not zero-scores) any structure the real chain can't support
// right now (e.g. no real OTM strike to sell above a long call) — a
// missing structure is disclosed via `unavailable`, never silently
// dropped without explanation.
function rankAllStrategies({ calls, puts, underlying, bias, character }) {
  const ranked = [];
  const unavailable = [];
  for (const strategy of CANDIDATE_STRATEGIES) {
    const construction = buildLegs(strategy, { calls, puts, underlying });
    if (!construction.available) { unavailable.push({ strategy, reason: construction.reason }); continue; }
    const scored = scoreConstruction(strategy, construction, { underlying, bias, character });
    ranked.push({ ...scored, construction });
  }
  ranked.sort((a, b) => b.composite - a.composite);
  return { ranked, unavailable, best: ranked[0] || null };
}

module.exports = { CANDIDATE_STRATEGIES, STRUCTURE_BIAS, probabilityBeyond, computeStructurePop, computeRiskReward, scoreConstruction, rankAllStrategies };
