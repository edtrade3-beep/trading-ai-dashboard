// src/strategy-selector.js — AI Strategy Selector, options platform
// redesign Phase 9. The biggest net-new engine in this plan: recommends a
// strategy off real Market Bias (Phase 1) + real IV Rank (Phase 8), then
// constructs REAL multi-leg strikes/expiries/premiums from the real ranked
// chain (Phase 5's rankContracts) — never a named strategy without real
// legs behind it.
//
// Scope, documented rather than silently narrowed: this ships the 5 most
// common structures end-to-end (Long Calls, Long Puts, Bull Call Spread,
// Bear Put Spread, Iron Condor). The plan's longer strategy list (Iron
// Butterfly, Calendar/Diagonal Spread, Covered Call, Cash Secured Put,
// Straddle/Strangle, Ratio Spread, Broken Wing Butterfly) is a real,
// explicit follow-up — not built here.
const { round2 } = require("./utils");

// Deterministic decision tree — mirrors market-helpers.js's
// regimeStrategyHint / volatility-lab.js's volRecommendation pattern
// (plain ordered thresholds, no model). `ivRank` may be null (Phase 8's
// honest "building" state) — the tree degrades to a directional-only
// pick rather than guessing an IV regime.
function selectStrategy({ bias, character, ivRank } = {}) {
  const rank = Number.isFinite(Number(ivRank)) ? Number(ivRank) : null;

  if (character === "Trending" && bias === "Bullish") {
    if (rank != null && rank >= 60) return { strategy: "Bull Call Spread", reason: `Trending bullish market with IV Rank ${rank} (elevated) — a defined-risk debit spread avoids overpaying for rich premium.` };
    return { strategy: "Long Calls", reason: rank != null ? `Trending bullish market with IV Rank ${rank} (not elevated) — real premium is reasonably priced for a directional long.` : "Trending bullish market — IV Rank unavailable, defaulting to a straightforward directional long." };
  }
  if (character === "Trending" && bias === "Bearish") {
    if (rank != null && rank >= 60) return { strategy: "Bear Put Spread", reason: `Trending bearish market with IV Rank ${rank} (elevated) — a defined-risk debit spread avoids overpaying for rich premium.` };
    return { strategy: "Long Puts", reason: rank != null ? `Trending bearish market with IV Rank ${rank} (not elevated) — real premium is reasonably priced for a directional long.` : "Trending bearish market — IV Rank unavailable, defaulting to a straightforward directional long." };
  }
  if (character === "Range") {
    if (rank != null && rank >= 50) return { strategy: "Iron Condor", reason: `Range-bound market with IV Rank ${rank} — a defined-risk premium-selling structure fits a non-trending, richer-vol environment.` };
    return { strategy: "Avoid / Wait", reason: rank != null ? `Range-bound market with IV Rank ${rank} (too low to sell premium attractively) — no strong directional or premium edge right now.` : "Range-bound market with IV Rank unavailable — no strong directional or premium edge to act on." };
  }
  return { strategy: "Wait for Confirmation", reason: character ? `Market character is real but reads "${character}" — no strategy rule covers this regime yet (only Trending/Range are).` : "No real market character available yet to select a strategy." };
}

const MIN_LIQUIDITY = 35; // options-math.js's liquidityScore is 0-100; below this a real leg is too illiquid to reasonably fill.

function bestByRank(pool) {
  return (pool || []).filter(c => Number.isFinite(c.rankScore)).sort((a, b) => b.rankScore - a.rankScore)[0] || null;
}

// Picks the real contract whose real delta is closest to `deltaTarget`
// (signed — negative for puts) among `pool`, restricted to strikes on the
// OTM side of `refStrike` (`beyond` is "gt" for calls above a long call,
// "lt" for puts below a long put). Falls back to picking by real POP
// closest to `popFallbackTarget` when delta isn't available (Yahoo's
// chain has none) — still a real, documented selection, never invented.
function pickByDeltaOrPop(pool, { refStrike, beyond, deltaTarget, popFallbackTarget }) {
  const side = (pool || []).filter(c => beyond === "gt" ? c.strike > refStrike : c.strike < refStrike);
  if (side.length === 0) return null;
  const withDelta = side.filter(c => c.delta != null);
  if (withDelta.length > 0) {
    return withDelta.reduce((best, c) => Math.abs(c.delta - deltaTarget) < Math.abs(best.delta - deltaTarget) ? c : best);
  }
  const withPop = side.filter(c => c.pop != null);
  if (withPop.length > 0) {
    return withPop.reduce((best, c) => Math.abs(c.pop - popFallbackTarget) < Math.abs(best.pop - popFallbackTarget) ? c : best);
  }
  return null;
}

function nextStrikeBeyond(pool, strike, direction) {
  const candidates = (pool || []).filter(c => direction === "gt" ? c.strike > strike : c.strike < strike);
  if (candidates.length === 0) return null;
  return direction === "gt"
    ? candidates.reduce((best, c) => c.strike < best.strike ? c : best)
    : candidates.reduce((best, c) => c.strike > best.strike ? c : best);
}

function midPremium(c) {
  const b = Number(c.bid), a = Number(c.ask);
  if (b > 0 && a > 0 && a >= b) return round2((a + b) / 2);
  return Number(c.lastPrice) || 0;
}

function leg(action, type, c) {
  return {
    action, type, strike: c.strike, expiry: c.expiry, contractSymbol: c.contractSymbol,
    premium: midPremium(c), delta: c.delta ?? null, pop: c.pop ?? null, liquidityScore: c.liquidityScore ?? null,
    // iv/dte — real fields already computed by rankContracts (options-math.js)
    // on every ranked contract `c`; previously dropped here. Added for
    // strategy-ranking.js's own real breakeven-based POP calc (Trade Desk
    // redesign Phase 2, options strategy ranking engine) — additive only,
    // every existing consumer of leg() ignores unknown fields.
    iv: c.iv ?? null, dte: c.dte ?? null,
  };
}

function liquidityGate(legs) {
  const illiquid = legs.filter(l => l.liquidityScore != null && l.liquidityScore < MIN_LIQUIDITY);
  if (illiquid.length > 0) {
    return { available: false, reason: `Real liquidity too low to fill reasonably on ${illiquid.length} leg(s) (liquidity score below ${MIN_LIQUIDITY}/100) — this chain isn't tradable as constructed.` };
  }
  return null;
}

// `calls`/`puts` — real ranked contracts for ONE expiry (rankContracts'
// output, routes/market.js). `underlying` — real spot price.
function buildLegs(strategy, { calls, puts, underlying } = {}) {
  const u = Number(underlying);
  if (!(u > 0)) return { available: false, reason: "No real underlying price." };

  if (strategy === "Long Calls" || strategy === "Long Puts") {
    const pool = strategy === "Long Calls" ? calls : puts;
    const best = bestByRank(pool);
    if (!best) return { available: false, reason: "No real ranked contracts available for this expiry." };
    const legs = [leg("BUY", strategy === "Long Calls" ? "call" : "put", best)];
    const gate = liquidityGate(legs);
    if (gate) return gate;
    return { available: true, legs, netDebit: legs[0].premium };
  }

  if (strategy === "Bull Call Spread") {
    const long = bestByRank(calls);
    if (!long) return { available: false, reason: "No real ranked calls available for this expiry." };
    const short = pickByDeltaOrPop(calls, { refStrike: long.strike, beyond: "gt", deltaTarget: 0.30, popFallbackTarget: 30 });
    if (!short) return { available: false, reason: "No real OTM call available to sell above the long strike on this chain." };
    const legs = [leg("BUY", "call", long), leg("SELL", "call", short)];
    const gate = liquidityGate(legs);
    if (gate) return gate;
    const netDebit = round2(legs[0].premium - legs[1].premium);
    return { available: true, legs, netDebit, maxProfit: round2(short.strike - long.strike - netDebit), maxLoss: netDebit };
  }

  if (strategy === "Bear Put Spread") {
    const long = bestByRank(puts);
    if (!long) return { available: false, reason: "No real ranked puts available for this expiry." };
    const short = pickByDeltaOrPop(puts, { refStrike: long.strike, beyond: "lt", deltaTarget: -0.30, popFallbackTarget: 30 });
    if (!short) return { available: false, reason: "No real OTM put available to sell below the long strike on this chain." };
    const legs = [leg("BUY", "put", long), leg("SELL", "put", short)];
    const gate = liquidityGate(legs);
    if (gate) return gate;
    const netDebit = round2(legs[0].premium - legs[1].premium);
    return { available: true, legs, netDebit, maxProfit: round2(long.strike - short.strike - netDebit), maxLoss: netDebit };
  }

  if (strategy === "Iron Condor") {
    const shortCall = pickByDeltaOrPop(calls, { refStrike: u, beyond: "gt", deltaTarget: 0.20, popFallbackTarget: 20 });
    const shortPut = pickByDeltaOrPop(puts, { refStrike: u, beyond: "lt", deltaTarget: -0.20, popFallbackTarget: 20 });
    if (!shortCall || !shortPut) return { available: false, reason: "No real OTM call/put pair available near a 20-delta target on this chain." };
    const longCallC = nextStrikeBeyond(calls, shortCall.strike, "gt");
    const longPutC = nextStrikeBeyond(puts, shortPut.strike, "lt");
    if (!longCallC || !longPutC) return { available: false, reason: "No real further-OTM strikes available to buy as protective wings on this chain." };
    const legs = [leg("SELL", "call", shortCall), leg("BUY", "call", longCallC), leg("SELL", "put", shortPut), leg("BUY", "put", longPutC)];
    const gate = liquidityGate(legs);
    if (gate) return gate;
    // Real bug fix (2026-08-30, found via strategy-explain.js's new "why"
    // narrative surfacing a live "$—" maxProfit on a real Iron Condor):
    // this used shortCall/longCallC/shortPut/longPutC — the RAW pre-leg()
    // contract objects, which never had a `.premium` field (only leg()
    // adds it via midPremium) — so `.premium` was always undefined here,
    // netCredit/maxProfit/maxLoss silently round2()'d to null on every
    // real Iron Condor ever constructed, even though `available: true`
    // was still returned. Fixed to read the real premium off the
    // already-built `legs` array (same real objects the caller receives).
    const [legShortCall, legLongCall, legShortPut, legLongPut] = legs;
    const netCredit = round2((legShortCall.premium - legLongCall.premium) + (legShortPut.premium - legLongPut.premium));
    const callWidth = round2(longCallC.strike - shortCall.strike);
    const putWidth = round2(shortPut.strike - longPutC.strike);
    const maxLoss = round2(Math.max(callWidth, putWidth) - netCredit);
    return { available: true, legs, netCredit, maxProfit: netCredit, maxLoss };
  }

  return { available: false, reason: `"${strategy}" has no real leg-construction rule yet — not built in this phase.` };
}

module.exports = { selectStrategy, buildLegs, MIN_LIQUIDITY };
