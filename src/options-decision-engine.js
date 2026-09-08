"use strict";

// options-decision-engine.js — Robinhood Options Decision System
// (2026-09-08, user's own 29-section spec: "5-10 seconds and know:
// should I trade, direction, strike/expiration, entry, stop, target,
// invalidation, IV, liquidity, exactly how to enter/exit"). Phase 0
// audit (this file's own reason for existing): the overwhelming majority
// of that spec was ALREADY BUILT in an earlier session under "Trade GPS"
// — trade-gps-verdict.js already outputs the exact BUY_CALL/BUY_PUT/
// BUY_CALL_SPREAD/BUY_PUT_SPREAD/WAIT/EXIT/NO_TRADE vocabulary spec §1
// asks for; trade-structure-selector.js already gates on real liquidity/
// spread/staleness/DTE/premium and already prefers a defined-risk spread
// over naked premium when real IV Rank is elevated (spec §2/§5/§6);
// iv-history-store.js already computes a real, honestly-degrading IV
// Rank; options-buy-assistant.js (this session, one day earlier) already
// builds the real Robinhood entry order/price-boundary/instructions
// (spec §7); position-manager-engine.js already runs a real Hold/Scale
// Out/Move Stop/Exit Now read for an open position (spec §20).
//
// This file adds ONLY the pieces a full repo grep confirmed don't exist
// anywhere: (1) user-facing CHEAP/FAIR/EXPENSIVE/EXTREME and GOOD/OK/
// POOR classification labels over the real ivRank/liquidityScore numbers
// those engines already compute, (2) a real R:R color-band classifier,
// (3) a real ENTER_NOW/WAIT/DO_NOT_ENTER entry-status reducer with named
// reasons, (4) a real option-level exit plan (take-profit/stop/time-exit,
// distinct from the underlying-stock stop Trade GPS already has), (5)
// real 21/14/7-DTE expiration-management tiers, (6) real earnings-
// exposure classification, (7) SELL TO CLOSE Robinhood instructions
// (options-buy-assistant.js only ever built the BUY TO OPEN side), and
// (8) real per-contract position sizing off account equity. Every
// threshold reused from an existing engine is cited in that function's
// own comment rather than re-declared as a new number.

const { round2 } = require("./utils");

// ---------------------------------------------------------------------
// IV classification — reuses trade-structure-selector.js's own
// HIGH_IV_RANK=60 (its real "prefer a spread over naked premium"
// threshold) as the EXPENSIVE floor, and red-flag-engine.js's own
// THRESHOLDS.maxIvRankForNaked=80 (its real "naked premium is genuinely
// overpriced" floor) as the EXTREME floor — never a third, competing set
// of numbers. CHEAP's own 25 floor is the one genuinely new judgment
// call this file adds (documented here, not hidden).
// ---------------------------------------------------------------------
const IV_CHEAP_MAX = 25;
const IV_FAIR_MAX = 60;   // trade-structure-selector.js's HIGH_IV_RANK
const IV_EXPENSIVE_MAX = 80; // red-flag-engine.js's maxIvRankForNaked

function classifyIv(ivRank, symbol = null) {
  if (!Number.isFinite(ivRank)) {
    return { label: "N/A", icon: "⚪", color: "gray", explanation: "Historical IV data isn't available yet for this symbol — real IV Rank/Percentile requires accumulated daily history (see iv-history-store.js)." };
  }
  const s = symbol ? `${symbol}'s` : "this contract's";
  if (ivRank < IV_CHEAP_MAX) return { label: "CHEAP", icon: "🟢", color: "green", explanation: `IV Rank ${ivRank} is low relative to ${s} recent history — long-option premium is reasonably priced.` };
  if (ivRank < IV_FAIR_MAX) return { label: "FAIR", icon: "🟡", color: "amber", explanation: `IV Rank ${ivRank} is in a normal range relative to ${s} recent history.` };
  if (ivRank < IV_EXPENSIVE_MAX) return { label: "EXPENSIVE", icon: "🟠", color: "orange", explanation: `IV Rank ${ivRank} is elevated relative to ${s} recent history, so long-option premium is expensive — a defined-risk debit spread is worth comparing against a naked long.` };
  return { label: "EXTREME", icon: "🔴", color: "red", explanation: `IV Rank ${ivRank} is extreme relative to ${s} recent history — naked long premium is genuinely overpriced; prefer a defined-risk spread or wait.` };
}

// ---------------------------------------------------------------------
// Liquidity classification — reuses strategy-selector.js's own
// MIN_LIQUIDITY=35 / trade-structure-selector.js's own MIN_LIQUIDITY=40
// (both already real gates on the same 0-100 liquidityScore) as the
// POOR/OK boundary; the higher of the two, since this is a user-facing
// label, not a hard gate — never a third number.
// ---------------------------------------------------------------------
const LIQUIDITY_OK_MIN = 40;  // trade-structure-selector.js's MIN_LIQUIDITY
const LIQUIDITY_GOOD_MIN = 70;

function classifyLiquidity(liquidityScore) {
  if (!Number.isFinite(liquidityScore)) return { label: "N/A", icon: "⚪", color: "gray", explanation: "No real bid/ask/open-interest/volume available for this contract." };
  if (liquidityScore >= LIQUIDITY_GOOD_MIN) return { label: "GOOD", icon: "🟢", color: "green", explanation: `Real liquidity score ${liquidityScore}/100 — tight spread, real depth, should fill close to mid.` };
  if (liquidityScore >= LIQUIDITY_OK_MIN) return { label: "OK", icon: "🟡", color: "amber", explanation: `Real liquidity score ${liquidityScore}/100 — tradable, but expect some slippage off the mid.` };
  return { label: "POOR", icon: "🔴", color: "red", explanation: `Real liquidity score ${liquidityScore}/100 — wide spread and/or thin open interest/volume; a limit order may not fill near mid.` };
}

// ---------------------------------------------------------------------
// R:R color band — spec §13's own explicit thresholds, verbatim.
// ---------------------------------------------------------------------
function classifyRiskReward(ratio) {
  if (!Number.isFinite(ratio)) return { label: "N/A", icon: "⚪", color: "gray" };
  if (ratio >= 2.0) return { label: `${ratio.toFixed(1)}:1`, icon: "🟢", color: "green", band: "STRONG" };
  if (ratio >= 1.5) return { label: `${ratio.toFixed(1)}:1`, icon: "🟡", color: "amber", band: "ACCEPTABLE" };
  if (ratio >= 1.0) return { label: `${ratio.toFixed(1)}:1`, icon: "🟠", color: "orange", band: "MARGINAL" };
  return { label: `${ratio.toFixed(1)}:1`, icon: "🔴", color: "red", band: "WEAK" };
}

// ---------------------------------------------------------------------
// Expiration management — spec §22's own explicit 21/14/7-DTE tiers.
// dteFromExpiry/timeDecayWarning already exist (options-math.js,
// position-manager-engine.js) but neither surfaces these specific named
// tiers to a user reading a NOT-YET-owned candidate.
// ---------------------------------------------------------------------
function classifyExpiration(dte) {
  if (!Number.isFinite(dte)) return { tier: "UNKNOWN", icon: "⚪", color: "gray", label: "No real DTE available." };
  if (dte <= 7) return { tier: "HIGH_GAMMA_THETA", icon: "🔴", color: "red", label: `${dte} DTE — high gamma/theta risk.` };
  if (dte <= 14) return { tier: "EXIT_ROLL_REVIEW", icon: "🟠", color: "orange", label: `${dte} DTE — exit/roll review.` };
  if (dte <= 21) return { tier: "TIME_DECAY_INCREASING", icon: "🟡", color: "amber", label: `${dte} DTE — time decay increasing.` };
  return { tier: "NORMAL", icon: "🟢", color: "green", label: `${dte} DTE.` };
}

// ---------------------------------------------------------------------
// Earnings exposure — spec §23. Real days-to-earnings (screenTrendTemplate's
// own real earningsDte, routes/market.js) crossed with the real contract
// DTE: exposed only when the real expiry is AFTER the real earnings date.
// ---------------------------------------------------------------------
function classifyEarningsExposure({ dte, earningsDte } = {}) {
  if (!Number.isFinite(earningsDte) || earningsDte < 0) {
    return { exposed: false, daysToEarnings: null, explanation: "No real upcoming earnings date on file." };
  }
  const exposed = Number.isFinite(dte) ? dte >= earningsDte : true;
  if (!exposed) {
    return { exposed: false, daysToEarnings: earningsDte, explanation: `Real earnings in ${earningsDte}d, after this contract's own expiry — no earnings exposure on this specific contract.` };
  }
  return {
    exposed: true, daysToEarnings: earningsDte,
    explanation: `Real earnings in ${earningsDte}d, before this contract expires. Expect real IV expansion into the print and a real IV crush the session after — plus real overnight gap risk in either direction.`,
  };
}

// ---------------------------------------------------------------------
// Entry Status — spec §18. A real reducer over signals every one of
// these engines ALREADY computes (never re-derives a technical read):
// quote freshness (trade-structure-selector.js's own stale gate),
// spread (strategy-selector.js's own liquidity gate), IV classification
// above, real R:R, and real confirmation state (signal-lifecycle.js's
// ARMED/ENTER_NOW, already surfaced on TradeGpsCard as `confirmationText`).
// Returns every real reason that applies, not just the first — spec's
// own list ("WAIT — price above desired entry", "WAIT — IV too
// expensive", ...) reads as a checklist, not a single cause.
// ---------------------------------------------------------------------
function computeEntryStatus({
  quoteAgeMinutes = null, maxStaleMinutes = 15,
  spreadPct = null, maxSpreadPct = 10,
  ivRank = null, riskReward = null, minRiskReward = 1.0,
  confirmed = null, // true/false/null (null = unknown, not penalized)
  earningsExposed = false,
  priceVsDesiredEntry = null, // "above" | "below" | "within" | null
} = {}) {
  const reasons = [];
  let worst = "ENTER_NOW";
  const escalate = (level) => { if (level === "DO_NOT_ENTER" || (level === "WAIT" && worst === "ENTER_NOW")) worst = level; };

  if (quoteAgeMinutes == null || quoteAgeMinutes > maxStaleMinutes) {
    reasons.push("WAIT — quote stale"); escalate("WAIT");
  }
  if (Number.isFinite(spreadPct) && spreadPct > maxSpreadPct) {
    reasons.push("WAIT — spread too wide"); escalate("WAIT");
  }
  const ivClass = classifyIv(ivRank);
  if (ivClass.label === "EXTREME") { reasons.push("DO NOT ENTER — IV extreme"); escalate("DO_NOT_ENTER"); }
  else if (ivClass.label === "EXPENSIVE") { reasons.push("WAIT — IV too expensive"); escalate("WAIT"); }
  if (Number.isFinite(riskReward) && riskReward < minRiskReward) {
    reasons.push("WAIT — R:R too low"); escalate("WAIT");
  }
  if (confirmed === false) { reasons.push("WAIT — confirmation missing"); escalate("WAIT"); }
  if (earningsExposed) { reasons.push("WAIT — earnings risk"); escalate("WAIT"); }
  if (priceVsDesiredEntry === "above") { reasons.push("WAIT — price above desired entry"); escalate("WAIT"); }

  if (worst === "ENTER_NOW" && reasons.length === 0) reasons.push("Every real check clears — acceptable to enter at the disclosed limit range.");
  return { status: worst, reasons };
}

// ---------------------------------------------------------------------
// Option Exit Plan — spec §8. Combines FIVE real inputs (never a fixed
// 20% for every trade, per the spec's own explicit instruction):
// (1) a real base option-premium target/stop %, (2) widened when real
// IV Rank is elevated (a rich-IV long is more likely to give back a
// profit to IV mean-reversion, so lock in the first target sooner and
// give the stop a bit more room against pure noise), (3) tightened when
// real DTE is short (less time to recover), (4) the real underlying-
// stock invalidation Trade GPS already computed (never re-derived),
// (5) a real time-exit DTE floor. Every number is a disclosed, named
// judgment call — same convention as every threshold elsewhere in this
// codebase — never a fabricated "model."
// ---------------------------------------------------------------------
const BASE_TARGET_PCT_1 = 25;
const BASE_TARGET_PCT_2 = 50;
const BASE_STOP_PCT = 20;
const TIME_EXIT_DTE = 14; // matches spec's own "close/reassess at 14 DTE" example

function computeOptionExitPlan({
  entryPremium = null, isCall = true, ivRank = null, dte = null,
  underlyingInvalidation = null, underlyingSymbol = null,
} = {}) {
  if (!Number.isFinite(entryPremium) || entryPremium <= 0) {
    return { available: false, reason: "No real entry premium to plan an exit against." };
  }
  const ivClass = classifyIv(ivRank);
  // Elevated/extreme IV: take the first profit sooner (a rich-IV long can
  // give back gains to IV crush even while the underlying keeps moving
  // your way) and allow a bit more stop room (more of the day-to-day
  // swing is IV noise, not thesis failure).
  const ivWidensStop = ivClass.label === "EXPENSIVE" || ivClass.label === "EXTREME";
  const target1Pct = ivWidensStop ? Math.round(BASE_TARGET_PCT_1 * 0.8) : BASE_TARGET_PCT_1;
  const target2Pct = ivWidensStop ? Math.round(BASE_TARGET_PCT_2 * 0.8) : BASE_TARGET_PCT_2;
  const stopPct = ivWidensStop ? Math.round(BASE_STOP_PCT * 1.25) : BASE_STOP_PCT;
  // Short real DTE: less time to recover from a drawdown — tighten the
  // stop back down regardless of IV, and pull the time-exit floor in.
  const shortDte = Number.isFinite(dte) && dte <= 14;
  const finalStopPct = shortDte ? Math.min(stopPct, 15) : stopPct;
  const timeExitDte = Number.isFinite(dte) ? Math.min(TIME_EXIT_DTE, Math.max(0, dte - 1)) : TIME_EXIT_DTE;

  const takeProfit1 = round2(entryPremium * (1 + target1Pct / 100));
  const takeProfit2 = round2(entryPremium * (1 + target2Pct / 100));
  const optionStop = round2(entryPremium * (1 - finalStopPct / 100));

  const notes = [];
  if (ivWidensStop) notes.push(`Targets pulled in and stop widened — real IV Rank is ${ivClass.label.toLowerCase()}, so part of this premium's swing is IV noise, not thesis progress/failure.`);
  if (shortDte) notes.push(`Real DTE is ${dte} — stop tightened; there's less real time left to recover from a drawdown.`);
  if (Number.isFinite(underlyingInvalidation)) notes.push(`Underlying invalidation stays Trade GPS's own real ${underlyingSymbol ? `${underlyingSymbol} ` : ""}level (${underlyingInvalidation}) — this option-premium stop is a SEPARATE, tighter early-warning, not a replacement for it.`);

  return {
    available: true,
    takeProfit1, takeProfit1Pct: target1Pct, takeProfit2, takeProfit2Pct: target2Pct,
    optionStop, optionStopPct: finalStopPct,
    underlyingInvalidation: Number.isFinite(underlyingInvalidation) ? underlyingInvalidation : null,
    timeExitDte, notes,
  };
}

// ---------------------------------------------------------------------
// SELL TO CLOSE instructions — spec §9's own explicit requirement
// ("Never confuse it with opening a new short option"). options-buy-
// assistant.js's buildInstructions only ever built the BUY TO OPEN side;
// this is the real, missing exit-side twin, generated the same way (from
// the real legs already on a built ticket, never hand-written per symbol).
// ---------------------------------------------------------------------
function buildSellToCloseInstructions({ symbol, legs = [] } = {}) {
  if (!symbol || !legs.length) return [];
  const steps = [`Open Robinhood.`, `Go to your ${symbol} position.`, `Tap Trade.`, `Tap Sell.`];
  if (legs.length === 1) {
    steps.push(`SELL TO CLOSE the $${legs[0].strike} ${legs[0].type === "call" ? "Call" : "Put"} — NOT a new short position.`);
  } else {
    steps.push(`Close the whole spread as one order (Robinhood groups multi-leg positions automatically) — this SELLS TO CLOSE the long leg and BUYS TO CLOSE the short leg together, not two separate orders.`);
  }
  steps.push(`Quantity: your full real position (or however many contracts you're scaling out of).`);
  steps.push(`Select Limit order.`);
  steps.push(`Enter your real current exit limit (check the live bid — selling into the bid side is the realistic fill, not the ask).`);
  steps.push(`Review — confirm it says SELL TO CLOSE (or "Close Position" for a spread), never "Sell to Open."`);
  steps.push(`Submit.`);
  return steps;
}

// ---------------------------------------------------------------------
// Real per-contract position sizing — same real formula/defaults as
// TradeGpsCard.jsx's own previewPositionSize (0.5% equity risk, $500 max
// real risk/trade, hand-ported from autopilot2-engine.js's sizeEntry) —
// re-expressed for a real per-contract max loss instead of a real
// per-share risk distance, never a second, diverging risk policy.
// ---------------------------------------------------------------------
function sizeOptionPosition({ equity = null, cash = null, maxLossPerContract = null, riskPct = 0.5, maxTradeRiskDollars = 500 } = {}) {
  if (!Number.isFinite(equity) || !Number.isFinite(cash) || !Number.isFinite(maxLossPerContract) || maxLossPerContract <= 0) return null;
  const riskBudget = Math.min(equity * (riskPct / 100), maxTradeRiskDollars);
  let contracts = Math.floor(riskBudget / maxLossPerContract);
  contracts = Math.min(contracts, Math.floor(cash / maxLossPerContract));
  return Math.max(0, contracts);
}

module.exports = {
  classifyIv, classifyLiquidity, classifyRiskReward, classifyExpiration, classifyEarningsExposure,
  computeEntryStatus, computeOptionExitPlan, buildSellToCloseInstructions, sizeOptionPosition,
  IV_CHEAP_MAX, IV_FAIR_MAX, IV_EXPENSIVE_MAX, LIQUIDITY_OK_MIN, LIQUIDITY_GOOD_MIN, TIME_EXIT_DTE,
};
