"use strict";

// red-flag-engine.js — Red Flag Engine (Master Build Spec §8-9, 2026-08-22,
// "extremely important... do NOT treat every red flag equally"). Named,
// counted, tiered risk flags. Two real taxonomies, per spec's own split:
// computeRedFlags (ENTRY, pre-position) — CRITICAL flags override a high
// score at the final decision (wired into simple-decision.js's
// computeSimpleDecision's pre-entry branch, the one real "final decision"
// surface). computeExitRedFlags (EXIT, an open position) — informational
// context alongside position-decision-engine.js's own real weighted state
// machine (HOLD/WARNING/TRAIL/TAKE_PARTIAL/EXIT/HARD_EXIT), not a second,
// competing hard gate — that engine is already the one real decision
// surface for open positions (spec §1's core rule: ONE decision engine).
//
// Every flag here is derived from real, already-computed data —
// entry-engine.js's own qualifying-conditions inputs (dailyBias,
// swing4hState, rsRating, volTrend1h, vwap20, marketRegime, rr,
// priceAction, antiChase, higherLows) plus two real fields available
// elsewhere but not previously part of entry-engine.js's inputs: riskPct
// (real ATR-based stop distance, already classified Low/Medium/High at
// 5%/8% in MarketTerminalTab.jsx) and dollarVolume (real, already computed
// server-side in routes/market.js). No new fetches, no fabricated data —
// an input the caller doesn't have is simply excluded, never guessed.
//
// Honest, disclosed omissions (spec-named flags with no real data source
// anywhere in this codebase today, not approximated): "buying into major
// resistance" (no clean distance-to-resistance signal), "sector weakness"
// (no sector-RS pipeline wired into entry-engine's inputs), "bearish 15M
// structure" as its own flag (15M data exists in simple-decision.js's
// entry15mStatus but isn't part of this function's real inputs), "RS
// collapse"/"distribution" for exits (no point-in-time RS-slope or
// distribution-volume tracking anywhere in this codebase).
//
// Reuses, never recomputes: entry-engine.js's own minRR/rsStrength
// thresholds (1.5 R:R, RS >= 60), MarketTerminalTab.jsx's existing
// riskPct Low/Medium/High convention (<=5/<=8/>8).
//
// Hand-ported twin: axiom-runner/components/red-flag-engine.js. Keep in
// sync — pure math, zero server-only dependencies.

const THRESHOLDS = {
  minRR: 1.5,          // matches entry-engine.js's GATE_DEFAULTS.minRR
  maxStopDistancePct: 8,   // matches MarketTerminalTab.jsx's "High" riskPct band
  minDollarVolume: 5_000_000, // $5M/day — a disclosed, configurable liquidity floor
  minRsRating: 60,      // matches entry-engine.js's own rsStrength check
};

// Every underlying real condition, computed once — {present, reason}
// pairs, present === null meaning honest omission (no real data). Both
// taxonomies below select from this same set rather than each
// recomputing the same real checks independently (spec §14: "one
// calculation per metric").
function rawChecks(ev, t) {
  return {
    failedBreakout: {
      present: ev.priceAction?.failedBreakout === true,
      reason: "A prior breakout attempt failed — real price action, not a soft signal.",
    },
    structureBroken: {
      present: ev.swing4hState != null ? ev.swing4hState === "BROKEN" : null,
      reason: "4H structure is broken — the higher-timeframe trend has failed.",
    },
    dailyTrendBreakdown: {
      present: ev.dailyBias != null ? ev.dailyBias === "BEARISH" : null,
      reason: "Daily trend has turned bearish.",
    },
    regimeDeterioration: {
      present: ev.marketRegime != null ? ev.marketRegime === "RISK_OFF" : null,
      reason: "Market regime is risk-off — broad conditions are unfavorable.",
    },
    extremeExtension: {
      present: ev.antiChase?.band != null ? ev.antiChase.band === "DO_NOT_CHASE" : null,
      reason: ev.antiChase?.label || "Price is materially extended above the ideal entry zone.",
    },
    unacceptableRR: {
      present: Number.isFinite(ev.rr) ? ev.rr < t.minRR : null,
      reason: Number.isFinite(ev.rr) ? `Real R:R is ${ev.rr.toFixed(1)}:1, below the ${t.minRR}:1 floor.` : null,
    },
    unacceptableStopDistance: {
      present: Number.isFinite(ev.riskPct) ? ev.riskPct > t.maxStopDistancePct : null,
      reason: Number.isFinite(ev.riskPct) ? `Real stop distance is ${ev.riskPct.toFixed(1)}%, above the ${t.maxStopDistancePct}% floor.` : null,
    },
    poorLiquidity: {
      present: Number.isFinite(ev.dollarVolume) ? ev.dollarVolume < t.minDollarVolume : null,
      reason: Number.isFinite(ev.dollarVolume) ? `Real dollar volume is $${(ev.dollarVolume / 1e6).toFixed(1)}M/day, below the $${(t.minDollarVolume / 1e6).toFixed(0)}M floor.` : null,
    },
    weakVolume: {
      present: ev.volTrend1h?.direction != null ? ev.volTrend1h.direction === "down" : null,
      reason: "1H volume participation is declining.",
    },
    fallingRS: {
      present: Number.isFinite(ev.rsRating) ? ev.rsRating < t.minRsRating : null,
      reason: Number.isFinite(ev.rsRating) ? `RS Rating ${ev.rsRating} is below the ${t.minRsRating} leader threshold.` : null,
    },
    belowVwap: {
      present: (Number.isFinite(ev.vwap20) && Number.isFinite(ev.price)) ? ev.price < ev.vwap20 : null,
      reason: "Price is below the 20-day VWAP.",
    },
    lossOfSupport: {
      present: ev.higherLows != null ? ev.higherLows === false : null,
      reason: "Real higher lows are no longer holding — support has broken down.",
    },
    thesisInvalidation: {
      present: ev.thesisInvalidated != null ? ev.thesisInvalidated === true : null,
      reason: "The real weighted verdict for this position has flipped — thesis invalidated.",
    },
    // Early Reversal Risk (Master Build Spec phase 6, 2026-08-23) — real,
    // caller-supplied (never recomputed here, same pattern as
    // thesisInvalidation): sniper-decision.js's computeReversalDetector,
    // a real weighted read of near-52w-high proximity, RSI overbought,
    // climax volume, and a parabolic run cooling off. EXIT-only — this is
    // a post-entry "are you about to give back gains" question, not an
    // entry-timing one.
    reversalTopRisk: {
      present: ev.reversalTopRisk != null ? ev.reversalTopRisk === true : null,
      reason: ev.reversalReason || "Real early get-out signs — near-top reversal read (52w-high proximity, RSI, volume, or a parabolic run cooling off).",
    },
  };
}

// defs entries: [rawCheckKey, outputKey, label, critical]. outputKey lets
// EXIT relabel a shared raw signal (e.g. weakVolume -> "volumeReversal")
// without disturbing ENTRY's own external key contract (used by
// simple-decision.js's REGULAR_FLAG_PRIORITY lookup and this module's own
// tests).
function buildFlags(ev, opts, defs) {
  const t = { ...THRESHOLDS, ...opts };
  const raw = rawChecks(ev, t);
  const flags = [];
  for (const [rawKey, outputKey, label, critical] of defs) {
    const check = raw[rawKey];
    if (!check || check.present == null) continue; // honest omission — no real data, never fabricated
    if (check.present) flags.push({ key: outputKey, label, critical, reason: check.reason });
  }
  const criticalFlags = flags.filter((f) => f.critical);
  return { flags, count: flags.length, criticalCount: criticalFlags.length, criticalFlags };
}

// ENTRY taxonomy (spec §8-9's ENTRY RED FLAGS list) — ev fields: dailyBias,
// swing4hState, rsRating, volTrend1h, vwap20, price, marketRegime, rr,
// priceAction, antiChase, riskPct, dollarVolume.
const ENTRY_DEFS = [
  ["failedBreakout", "failedBreakout", "Failed Breakout", true],
  ["structureBroken", "structureBroken", "Structure Broken (4H)", true],
  ["dailyTrendBreakdown", "dailyTrendBreakdown", "Daily Trend Breakdown", true],
  ["regimeDeterioration", "regimeDeterioration", "Market Regime Deterioration", true],
  ["extremeExtension", "extremeExtension", "Extreme Extension (Do Not Chase)", true],
  ["unacceptableRR", "unacceptableRR", "Risk/Reward Unacceptable", true],
  ["unacceptableStopDistance", "unacceptableStopDistance", "Stop Distance Unacceptable", true],
  ["poorLiquidity", "poorLiquidity", "Poor Liquidity", true],
  ["weakVolume", "weakVolume", "Weak Volume", false],
  ["fallingRS", "fallingRS", "Falling Relative Strength", false],
  ["belowVwap", "belowVwap", "Below VWAP", false],
];

// EXIT taxonomy (spec §8-9's EXIT RED FLAGS list) — same real underlying
// signals as ENTRY where they apply, relabeled for exit context, plus two
// exit-only real signals: lossOfSupport (higherLows) and
// thesisInvalidation (the caller's own already-computed
// position-decision-engine.js state — real, never recomputed here; pass
// ev.thesisInvalidated = dayTradeState === "EXIT" || dayTradeState ===
// "HARD_EXIT"). Informational alongside that engine's own real decision,
// not a second hard gate — see this file's header for why.
const EXIT_DEFS = [
  ["failedBreakout", "failedBreakout", "Failed Breakout", true],
  ["lossOfSupport", "lossOfSupport", "Loss of Key Support", true],
  ["structureBroken", "bearishStructureChange", "Bearish Structure Change", true],
  ["regimeDeterioration", "regimeDeterioration", "Market Regime Deterioration", true],
  ["extremeExtension", "extremeExtension", "Extreme Extension", true],
  ["thesisInvalidation", "thesisInvalidation", "Thesis Invalidation", true],
  ["reversalTopRisk", "reversalTopRisk", "Early Reversal Risk (Near-Top)", true],
  ["belowVwap", "lossOfVwap", "Loss of VWAP", false],
  ["weakVolume", "volumeReversal", "Volume Reversal", false],
];

function computeRedFlags(ev = {}, opts = {}) {
  return buildFlags(ev, opts, ENTRY_DEFS);
}

function computeExitRedFlags(ev = {}, opts = {}) {
  return buildFlags(ev, opts, EXIT_DEFS);
}

module.exports = { computeRedFlags, computeExitRedFlags, THRESHOLDS };
