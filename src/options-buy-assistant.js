"use strict";

// options-buy-assistant.js — Options Buy Assistant (2026-09-07, new Trade
// Desk primary section). ANTI-DUPLICATION: this is a pure presentation/
// translation layer over real engines that already exist and are already
// wired into /api/market/strategy-rank — strategy-selector.js's real leg
// construction (strikes/premiums/max-profit/max-loss off a real ranked
// chain), strategy-ranking.js's real POP/risk-reward/liquidity/composite
// scoring, strategy-explain.js's real narrative. This file adds exactly
// the two pieces that didn't exist anywhere: (1) a manual-entry Robinhood
// order-ticket format, (2) mapping party-stage-engine.js's real Party
// Stage read onto this section's own Entry Timing vocabulary. No new
// options math, no new chain fetch, no live brokerage connection.

const { STRUCTURE_BIAS } = require("./strategy-ranking");

const DIRECTION_META = { Bullish: { icon: "🟢", label: "BULLISH" }, Bearish: { icon: "🔴", label: "BEARISH" }, Range: { icon: "🟡", label: "NEUTRAL / RANGE" } };

// Real, disclosed slippage buffer for a manual limit order — the live
// quote will have moved between when this was computed and when the user
// actually enters it in Robinhood. 4% of the real net debit/credit,
// floored at $0.05/contract so a very cheap option still gets a real,
// usable buffer. This is a judgment call on ORDER-ENTRY TOLERANCE, not a
// fabricated price — the target price itself is always the real computed
// net debit/credit.
const SLIPPAGE_BUFFER_PCT = 0.04;
function slippageBuffer(price) {
  if (!Number.isFinite(price) || price <= 0) return 0.05;
  return Math.max(0.05, Math.round(price * SLIPPAGE_BUFFER_PCT * 100) / 100);
}

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

// Real breakeven formula per structure — standard options math off the
// SAME real strikes/net-debit-or-credit strategy-selector.js already
// computed, never a second pricing model.
function computeBreakevens(strategy, construction) {
  const legs = construction?.legs || [];
  const netDebit = construction?.netDebit;
  const netCredit = construction?.netCredit;
  if (strategy === "Long Calls") return legs[0] ? [round2(legs[0].strike + legs[0].premium)] : [];
  if (strategy === "Long Puts") return legs[0] ? [round2(legs[0].strike - legs[0].premium)] : [];
  if (strategy === "Bull Call Spread") return legs[0] && Number.isFinite(netDebit) ? [round2(legs[0].strike + netDebit)] : [];
  if (strategy === "Bear Put Spread") return legs[0] && Number.isFinite(netDebit) ? [round2(legs[0].strike - netDebit)] : [];
  if (strategy === "Iron Condor" && legs.length === 4 && Number.isFinite(netCredit)) {
    // legs order from buildLegs: [shortCall, longCall, shortPut, longPut]
    const shortCall = legs[0], shortPut = legs[2];
    return [round2(shortPut.strike - netCredit), round2(shortCall.strike + netCredit)].sort((a, b) => a - b);
  }
  return [];
}

// The spec's own numbered manual-entry steps, generated from the real
// structure (single-leg vs. 2-leg spread vs. 4-leg iron condor) — never
// hand-written per symbol, always derived from the real legs/expiration/
// price this ticket already computed.
function buildInstructions({ symbol, legs, orderType, targetPrice, maxPrice, isCredit }) {
  const steps = [`Open Robinhood.`, `Search ${symbol}.`, `Tap Trade.`, `Tap Trade Options.`, `Select expiration: ${legs[0]?.expiry || "—"}.`];
  legs.forEach((l, i) => {
    steps.push(`Select the $${l.strike} ${l.type === "call" ? "Call" : "Put"} as ${l.action}.`);
  });
  steps.push(`Quantity: 1 ${legs.length > 1 ? "spread" : "contract"}.`);
  steps.push(`Select ${orderType} order.`);
  steps.push(`Enter approximately: $${targetPrice?.toFixed(2)} ${isCredit ? "credit" : "debit"}.`);
  steps.push(isCredit ? `Do not accept less than: $${maxPrice?.toFixed(2)}.` : `Do not exceed: $${maxPrice?.toFixed(2)}.`);
  steps.push(`Review maximum loss before submitting.`);
  steps.push(`Submit only if current platform status still shows real 🟢 READY / ENTER.`);
  return steps;
}

// The one real combined ticket — composes every function above from a
// real ranked-strategy object (strategy-ranking.js's own output shape,
// the SAME object OptionsStrategyRankPanel.jsx already renders) plus the
// symbol it belongs to. Never recomputes strikes/premiums/POP itself.
function buildRobinhoodOrderTicket({ symbol, rankedStrategy }) {
  if (!symbol || !rankedStrategy?.construction?.available) {
    return { available: false, reason: "No real tradeable structure available for this symbol right now." };
  }
  const { strategy, construction, pop, riskReward } = rankedStrategy;
  const legs = construction.legs || [];
  const isCredit = Number.isFinite(construction.netCredit);
  const price = isCredit ? construction.netCredit : construction.netDebit;
  const buffer = slippageBuffer(price);
  // A credit strategy's "acceptable" boundary is the MINIMUM credit you'll
  // take (less buffer would mean accepting less premium); a debit
  // strategy's boundary is the MAXIMUM you'll pay (more buffer would mean
  // overpaying) — real, opposite-direction tolerance, not the same sign.
  const boundaryPrice = round2(isCredit ? price - buffer : price + buffer);
  const perContractMultiplier = 100;
  const estimatedCost = Number.isFinite(construction.netDebit) ? round2(construction.netDebit * perContractMultiplier) : null;
  // Real bug found live (2026-09-07, testing against a live Polygon
  // chain): strategy-selector.js's buildLegs() only sets maxProfit/
  // maxLoss for the SPREAD structures — a single-leg Long Call/Put
  // returns just {legs, netDebit}, so this ticket showed a blank Max
  // Loss for the single most common structure. Real options math for the
  // two single-leg cases strategy-selector.js can build (never a second,
  // divergent risk model): max loss on a long option is always exactly
  // the real premium paid; max profit is uncapped for a long call
  // (string, not a number — never fabricate a ceiling that doesn't
  // exist) and real-capped at (strike - premium) for a long put (the
  // underlying can't trade below $0).
  const isSingleLeg = legs.length === 1 && (strategy === "Long Calls" || strategy === "Long Puts");
  const maxLoss = Number.isFinite(construction.maxLoss) ? round2(construction.maxLoss * perContractMultiplier)
    : isSingleLeg ? estimatedCost : null;
  const maxProfit = Number.isFinite(construction.maxProfit) ? round2(construction.maxProfit * perContractMultiplier)
    : strategy === "Long Calls" ? "Uncapped"
    : strategy === "Long Puts" && legs[0] ? round2((legs[0].strike - legs[0].premium) * perContractMultiplier)
    : null;
  const breakevens = computeBreakevens(strategy, construction);
  const direction = DIRECTION_META[STRUCTURE_BIAS[strategy]] || DIRECTION_META.Range;

  return {
    available: true,
    symbol, strategy, direction,
    expiration: legs[0]?.expiry || null,
    legs: legs.map((l) => ({ action: l.action, type: l.type, strike: l.strike, premium: l.premium })),
    quantity: legs.length > 1 ? "1 Spread" : "1 Contract",
    orderType: "LIMIT",
    isCredit,
    targetPrice: price,
    boundaryPrice,
    estimatedCost,
    maxLoss,
    maxProfit,
    breakevens,
    pop: pop ?? null, riskReward: riskReward ?? null,
    instructions: buildInstructions({ symbol, legs, orderType: "LIMIT", targetPrice: price, maxPrice: boundaryPrice, isCredit }),
    verify: {
      ticker: symbol, expiration: legs[0]?.expiry || null,
      strikes: legs.map((l) => `$${l.strike} ${l.type}`).join(" / "),
      direction: legs.map((l) => l.action).join(" / "),
      quantity: legs.length > 1 ? "1 spread" : "1 contract",
      limitPrice: `$${price?.toFixed(2)} ${isCredit ? "credit" : "debit"}`,
      maxRisk: maxLoss != null ? `$${maxLoss}` : "—",
    },
  };
}

// Entry Timing (spec's own §7 vocabulary) — a real re-mapping of party-
// stage-engine.js's already-computed 0-6 Party Stage + timing verdict,
// never a second technical-timing calculation. "MOVE ALREADY STARTED" is
// this section's own distinct label for Stage 4 (Breakout Underway) —
// the spec explicitly wants a 6th state between EARLY and LATE that the
// base Party Stage engine's own vocabulary doesn't separately name.
const ENTRY_TIMING_META = {
  0: { icon: "⚪", label: "NO SETUP" },
  1: { icon: "🟣", label: "DEVELOPING" },
  2: { icon: "🔵", label: "EARLY" },
  3: { icon: "🟢", label: "CONFIRMED" },
  4: { icon: "🟡", label: "MOVE ALREADY STARTED" },
  5: { icon: "🟠", label: "LATE" },
  6: { icon: "🔴", label: "OVEREXTENDED" },
};
function classifyEntryTiming(partyStageProfile) {
  const stage = Number.isFinite(partyStageProfile?.partyStage) ? partyStageProfile.partyStage : null;
  if (stage == null) return { stage: null, icon: "⚪", label: "UNKNOWN — no real technical read available" };
  return { stage, ...ENTRY_TIMING_META[stage] };
}

// Real price re-check before manual submission (spec §13: "Compare live
// option quote to the original recommendation... prevents entering an
// old recommendation after premium has already moved."). Pure comparison
// of two real tickets (the one first shown, and a fresh one the caller
// re-fetched from the exact same real endpoint right before submitting)
// — never a live quote stream, never a guess about where the price
// "probably" is now.
function comparePriceCheck({ original, fresh }) {
  if (!original?.available) return { status: "UNKNOWN", reason: "No original real ticket to compare against." };
  if (!fresh?.available) return { status: "STALE", reason: fresh?.reason || "Could not re-check the real live chain right now — treat the original ticket as stale." };

  const sameStructure = original.strategy === fresh.strategy
    && original.expiration === fresh.expiration
    && original.legs.length === fresh.legs.length
    && original.legs.every((l, i) => l.strike === fresh.legs[i]?.strike && l.type === fresh.legs[i]?.type && l.action === fresh.legs[i]?.action);

  if (!sameStructure) {
    return { status: "RECOMMENDATION_CHANGED", reason: "The real ranked structure itself has changed since this was first shown — re-scan rather than trusting the original strikes/expiration.", fresh };
  }

  // Debit: paying MORE than the original boundary is bad (overpaying).
  // Credit: receiving LESS than the original boundary is bad (underselling).
  const worse = original.isCredit ? fresh.targetPrice < original.boundaryPrice : fresh.targetPrice > original.boundaryPrice;
  if (worse) {
    return {
      status: "PRICE_CHANGED", reason: `Real current price ($${fresh.targetPrice?.toFixed(2)}) is past the original $${original.boundaryPrice?.toFixed(2)} limit — do not buy at the original numbers.`,
      original: original.targetPrice, current: fresh.targetPrice, boundary: original.boundaryPrice,
    };
  }
  return { status: "SAFE", reason: `Real current price ($${fresh.targetPrice?.toFixed(2)}) is still within the original $${original.boundaryPrice?.toFixed(2)} limit.`, original: original.targetPrice, current: fresh.targetPrice };
}

module.exports = { buildRobinhoodOrderTicket, classifyEntryTiming, computeBreakevens, slippageBuffer, comparePriceCheck, ENTRY_TIMING_META };
