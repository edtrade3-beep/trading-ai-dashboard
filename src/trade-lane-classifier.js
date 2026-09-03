"use strict";
// Trade Navigator Stage 4 (2026-09-03) — the spec's own three lanes:
// A-Trades (highest conviction, normal size), Quick Trades (shorter
// momentum, smaller size), Developing Trades (alerts only, no entry
// yet). A thin relabeling function, never a new decision — reuses the
// exact real tier/band/state vocabulary this session's own Trade GPS
// work already produces.
//
// A-Trade and Developing are fully real today: opportunity-engine.js's
// ACTIONABLE tier + trade-gps-score.js's PRIMARY band + signal-lifecycle.js's
// ENTER_NOW/ARMED states are the existing swing pipeline's own real
// conviction read; DEVELOPING tier / SETUP_FORMING state / WATCH band are
// its own real "not yet, but forming" read.
//
// Quick Trade is the one genuinely new lane (day-trade-calc.js's
// GREEN/qualifiesAPlus signal exists but was never packaged as a labeled,
// smaller-sized lane) — honestly null here until a caller supplies a real
// dayTradeSignal, same future-ready-slot pattern this session already
// used for tradeStructure's option-chain wiring and why-now-engine.js's
// news/sector/institutional slots. day-trade-calc.js's own scan runs
// against different real fields (vwap/rvol/orBreakout/bull15) than this
// pipeline's swing-oriented row shape carries — wiring that per-symbol
// fetch in is a real, separate follow-up, not fabricated here.
const A_TRADE_TIERS = new Set(["ACTIONABLE"]);
const A_TRADE_BANDS = new Set(["PRIMARY"]);
const A_TRADE_STATES = new Set(["ENTER_NOW", "ARMED"]);
const DEVELOPING_TIERS = new Set(["DEVELOPING"]);
const DEVELOPING_STATES = new Set(["SETUP_FORMING", "SCANNING"]);
const DEVELOPING_BANDS = new Set(["WATCH"]);

// A real, disclosed judgment call, not a standard formula — quick trades
// are meant to be smaller/faster than the swing pipeline's own defaults.
const QUICK_TRADE_SIZE_MULTIPLIER = 0.5;

function classifyTradeLane({ tier = null, band = null, signalState = null, dayTradeSignal = null } = {}) {
  // Quick Trade takes priority when a real day-trade signal is both
  // present and genuinely qualifying — a real, separate, faster-cadence
  // read that shouldn't be silently absorbed into the swing lanes below.
  if (dayTradeSignal && dayTradeSignal.qualifiesAPlus === true) {
    return { lane: "QUICK_TRADE", sizeMultiplier: QUICK_TRADE_SIZE_MULTIPLIER, reason: "real day-trade signal qualifies (GREEN)" };
  }
  if (A_TRADE_TIERS.has(tier) && A_TRADE_BANDS.has(band) && A_TRADE_STATES.has(signalState)) {
    return { lane: "A_TRADE", sizeMultiplier: 1, reason: "real ACTIONABLE tier + PRIMARY band + ENTER_NOW/ARMED state" };
  }
  if (DEVELOPING_TIERS.has(tier) || DEVELOPING_STATES.has(signalState) || DEVELOPING_BANDS.has(band)) {
    return { lane: "DEVELOPING", sizeMultiplier: 0, reason: "real setup forming — alert only, no entry yet" };
  }
  return { lane: null, sizeMultiplier: null, reason: null };
}

module.exports = { classifyTradeLane, QUICK_TRADE_SIZE_MULTIPLIER };
