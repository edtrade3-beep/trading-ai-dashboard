"use strict";

// red-flag-engine.js — Red Flag Engine (Master Build Spec §8-9, 2026-08-22,
// "extremely important... do NOT treat every red flag equally"). Named,
// counted, tiered risk flags — CRITICAL flags can override a high score at
// the final decision (wired into simple-decision.js's computeSimpleDecision,
// the one real "final decision" surface), regular flags are informational,
// feeding the "why" reasoning via decision-priority.js.
//
// Every flag here is derived from real, already-computed data —
// entry-engine.js's own qualifying-conditions inputs (dailyBias,
// swing4hState, rsRating, volTrend1h, vwap20, marketRegime, rr,
// priceAction, antiChase) plus two real fields available elsewhere but not
// previously part of entry-engine.js's inputs: riskPct (real ATR-based stop
// distance, already classified Low/Medium/High at 5%/8% in
// MarketTerminalTab.jsx) and dollarVolume (real, already computed
// server-side in routes/market.js). No new fetches, no fabricated data —
// an input the caller doesn't have is simply excluded, never guessed.
//
// Honest, disclosed omissions (spec-named flags with no real data source
// anywhere in this codebase today, not approximated): "buying into major
// resistance" (no clean distance-to-resistance signal), "sector weakness"
// (no sector-RS pipeline wired into entry-engine's inputs), "bearish 15M
// structure" as its own flag (15M data exists in simple-decision.js's
// entry15mStatus but isn't part of this function's real inputs).
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

// ev fields, all real, all already computed elsewhere (see entry-engine.js
// for where most of these come from): dailyBias, swing4hState, rsRating,
// volTrend1h, vwap20, price, marketRegime, rr, priceAction, antiChase
// (doNotChaseZone-shaped: {band}), riskPct, dollarVolume.
function computeRedFlags(ev = {}, opts = {}) {
  const t = { ...THRESHOLDS, ...opts };
  const flags = [];
  const add = (key, label, critical, present, reason) => {
    if (present == null) return; // honest omission — no real data, never fabricated
    if (present) flags.push({ key, label, critical, reason });
  };

  add(
    "failedBreakout", "Failed Breakout", true,
    ev.priceAction?.failedBreakout === true,
    "A prior breakout attempt failed — real price action, not a soft signal."
  );
  add(
    "structureBroken", "Structure Broken (4H)", true,
    ev.swing4hState != null ? ev.swing4hState === "BROKEN" : null,
    "4H structure is broken — the higher-timeframe trend has failed."
  );
  add(
    "dailyTrendBreakdown", "Daily Trend Breakdown", true,
    ev.dailyBias != null ? ev.dailyBias === "BEARISH" : null,
    "Daily trend has turned bearish."
  );
  add(
    "regimeDeterioration", "Market Regime Deterioration", true,
    ev.marketRegime != null ? ev.marketRegime === "RISK_OFF" : null,
    "Market regime is risk-off — broad conditions are unfavorable for new longs."
  );
  add(
    "extremeExtension", "Extreme Extension (Do Not Chase)", true,
    ev.antiChase?.band != null ? ev.antiChase.band === "DO_NOT_CHASE" : null,
    ev.antiChase?.label || "Price is materially extended above the ideal entry zone."
  );
  add(
    "unacceptableRR", "Risk/Reward Unacceptable", true,
    Number.isFinite(ev.rr) ? ev.rr < t.minRR : null,
    Number.isFinite(ev.rr) ? `Real R:R is ${ev.rr.toFixed(1)}:1, below the ${t.minRR}:1 floor.` : null
  );
  add(
    "unacceptableStopDistance", "Stop Distance Unacceptable", true,
    Number.isFinite(ev.riskPct) ? ev.riskPct > t.maxStopDistancePct : null,
    Number.isFinite(ev.riskPct) ? `Real stop distance is ${ev.riskPct.toFixed(1)}%, above the ${t.maxStopDistancePct}% floor.` : null
  );
  add(
    "poorLiquidity", "Poor Liquidity", true,
    Number.isFinite(ev.dollarVolume) ? ev.dollarVolume < t.minDollarVolume : null,
    Number.isFinite(ev.dollarVolume) ? `Real dollar volume is $${(ev.dollarVolume / 1e6).toFixed(1)}M/day, below the $${(t.minDollarVolume / 1e6).toFixed(0)}M floor.` : null
  );

  add(
    "weakVolume", "Weak Volume", false,
    ev.volTrend1h?.direction != null ? ev.volTrend1h.direction === "down" : null,
    "1H volume participation is declining."
  );
  add(
    "fallingRS", "Falling Relative Strength", false,
    Number.isFinite(ev.rsRating) ? ev.rsRating < t.minRsRating : null,
    Number.isFinite(ev.rsRating) ? `RS Rating ${ev.rsRating} is below the ${t.minRsRating} leader threshold.` : null
  );
  add(
    "belowVwap", "Below VWAP", false,
    (Number.isFinite(ev.vwap20) && Number.isFinite(ev.price)) ? ev.price < ev.vwap20 : null,
    "Price is below the 20-day VWAP."
  );

  const criticalFlags = flags.filter((f) => f.critical);
  return {
    flags,
    count: flags.length,
    criticalCount: criticalFlags.length,
    criticalFlags,
  };
}

module.exports = { computeRedFlags, THRESHOLDS };
