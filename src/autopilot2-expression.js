// autopilot2-expression.js — ADOL22 Autopilot 2.0 Phase 2a: the
// Expression Engine (spec §11/§14) — for a real bullish opportunity,
// decide whether to express it as the stock or a real long call. Nothing
// else in this codebase makes this specific comparison: strategy-
// selector.js only picks among options STRUCTURES (spreads/condor/etc),
// never against the stock alternative.
//
// v1 scope, deliberate: long calls only (no spreads), gated on real
// liquidity + real bid/ask spread% only (no IV-rank/earnings-crush check
// yet — that needs a real earnings-calendar lookup not wired in here).
// See the plan for the full scoping rationale.
"use strict";
const { fetchOptionsChain } = require("./autopilot2-account");
const { rankContracts, spreadPct, estimateDelta, dteFromExpiry } = require("./options-math");
const { MIN_LIQUIDITY } = require("./strategy-selector");

// Real, disclosed, deliberate defaults — not derived, adjustable later.
const TARGET_DTE_MIN = 20;
const TARGET_DTE_MAX = 45;
const DELTA_MIN = 0.60; // "in-the-money-ish, still real leverage" swing convention
const DELTA_MAX = 0.85;
const MAX_SPREAD_PCT = 8; // real bid/ask spread ceiling — wider than this isn't reasonably fillable

// Picks the real expiry closest to the middle of the target DTE window
// from a real list of available expiry date strings.
function pickExpiry(expiryDates) {
  if (!Array.isArray(expiryDates) || !expiryDates.length) return null;
  const { dteFromExpiry } = require("./options-math");
  const targetMid = (TARGET_DTE_MIN + TARGET_DTE_MAX) / 2;
  let best = null, bestDelta = Infinity;
  for (const exp of expiryDates) {
    const dte = dteFromExpiry(exp);
    if (dte == null) continue;
    const delta = Math.abs(dte - targetMid);
    if (dte >= TARGET_DTE_MIN - 5 && dte <= TARGET_DTE_MAX + 15 && delta < bestDelta) { best = exp; bestDelta = delta; }
  }
  return best || expiryDates[0]; // honest fallback to the nearest real expiry if nothing lands in-window
}

// Pure decision core, extracted for direct unit testing with synthetic
// chain data (no network) — given an already-fetched real chain (or
// null), decide STOCK/CALL/NO_TRADE. chooseExpression below is the thin
// impure wrapper that fetches the real chain and calls this.
function decideFromChain(opportunity, chain, expiry) {
  const symbol = opportunity?.symbol;
  if (!chain || !Array.isArray(chain.calls)) {
    return { expression: "STOCK", reason: "no real option chain available for this symbol — expressing as stock" };
  }

  const underlying = Number(chain.underlying) || Number(opportunity.price) || null;

  // Real delta estimation fallback (2026-08-30 fix) — without a
  // POLYGON_API_KEY, GET /api/market/options falls back to Yahoo's free
  // chain, which always returns delta:null (no greeks in Yahoo's v7 chain
  // — see providers/yahoo.js). That silently meant CALL could never be
  // selected in that deployment: every real bullish opportunity fell back
  // to STOCK regardless of how good the real option looked, with no
  // visible error — Autopilot 2.0's options leg was dead code in
  // production. A provider-real delta is always preferred; only contracts
  // with delta:null but real iv/strike get an ESTIMATED delta
  // (options-math.js's estimateDelta, real Black-Scholes N(d1) off real
  // iv/strike/underlying/dte) — explicitly tagged deltaSource so this is
  // never confused with a provider-real greek downstream (position
  // records, UI).
  const withDelta = chain.calls.map((c) => {
    if (Number.isFinite(c.delta)) return { ...c, deltaSource: "provider" };
    const dte = c.dte != null ? c.dte : dteFromExpiry(c.expiry);
    const est = estimateDelta({ iv: c.iv, strike: c.strike, underlying, dte, isCall: true });
    return est != null ? { ...c, delta: est, deltaSource: "estimated" } : { ...c, deltaSource: null };
  });

  const realCalls = withDelta.filter((c) => Number.isFinite(c.delta) && c.delta >= DELTA_MIN && c.delta <= DELTA_MAX);
  if (!realCalls.length) {
    return { expression: "STOCK", reason: `no real call in the ${DELTA_MIN}-${DELTA_MAX} delta band for this expiry — expressing as stock` };
  }

  const ranked = rankContracts(realCalls, { underlying, isCall: true, aiTradeScore: opportunity.score });
  const top = ranked[0];
  if (!top) return { expression: "STOCK", reason: "real contract ranking produced nothing — expressing as stock" };

  const realSpreadPct = spreadPct({ bid: top.bid, ask: top.ask });
  if (top.liquidityScore < MIN_LIQUIDITY) {
    return { expression: "STOCK", reason: `Good Stock / Bad Option: top real contract liquidity ${top.liquidityScore}/100 is below the real ${MIN_LIQUIDITY} floor — expressing as stock instead` };
  }
  if (realSpreadPct != null && realSpreadPct > MAX_SPREAD_PCT) {
    return { expression: "STOCK", reason: `Good Stock / Bad Option: real bid/ask spread ${realSpreadPct}% exceeds the ${MAX_SPREAD_PCT}% ceiling — expressing as stock instead` };
  }
  if (!(top.ask > 0)) {
    return { expression: "STOCK", reason: "no real ask price on the top contract — refusing to fabricate an entry premium" };
  }

  return {
    expression: "CALL",
    reason: `real call selected: strike $${top.strike}, ${top.dte}d to ${expiry}, POP ${top.pop ?? "n/a"}%, liquidity ${top.liquidityScore}/100${top.deltaSource === "estimated" ? ` (delta ${top.delta} estimated via Black-Scholes — no provider greeks available)` : ""}`,
    contract: { ...top, symbol, expiry, underlyingAtEntry: underlying },
  };
}

// The one real decision: STOCK, CALL, or NO_TRADE — always with a real
// disclosed reason, never a silent default.
async function chooseExpression(opportunity) {
  const symbol = opportunity?.symbol;
  if (!symbol) return { expression: "NO_TRADE", reason: "no real symbol on this opportunity" };

  const firstChain = await fetchOptionsChain(symbol).catch(() => null);
  if (!firstChain || !Array.isArray(firstChain.expiryDates) || !firstChain.expiryDates.length) {
    return { expression: "STOCK", reason: "no real option chain available for this symbol — expressing as stock" };
  }

  const expiry = pickExpiry(firstChain.expiryDates);
  const chain = expiry === firstChain.expiry || !expiry
    ? firstChain
    : (await fetchOptionsChain(symbol, expiry).catch(() => null)) || firstChain;

  return decideFromChain(opportunity, chain, expiry);
}

module.exports = { chooseExpression, decideFromChain, pickExpiry, TARGET_DTE_MIN, TARGET_DTE_MAX, DELTA_MIN, DELTA_MAX, MAX_SPREAD_PCT };
