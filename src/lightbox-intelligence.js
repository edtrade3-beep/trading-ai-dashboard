"use strict";

// lightbox-intelligence.js — the real "EV Engine / Chase Engine /
// Opportunity Gap / Attention Score / WHY NOW-NOT" layer for Light Box
// (Market Opportunity Intelligence Engine upgrade, 2026-08-26). Every
// function here composes ALREADY-REAL, already-proven engines built
// elsewhere in this codebase — nothing here reinvents a scoring formula
// that exists somewhere else. See each function's own comment for the
// exact real function it wraps/reuses.
const { computeExpectedValue } = require("./opportunity-engine");
const { computeAntiChase } = require("./atr-risk-engine");
const { computeRedFlags } = require("./red-flag-engine");

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

// EV (#3) — reuses opportunity-engine.js's real computeExpectedValue
// UNCHANGED. That function's gain/loss math hardcodes a long shape
// (target above entry, stop below entry) — for a real BEARISH day-trade
// signal (day-trade-calc.js's own direction-aware short setups), stop/
// target are correctly mirrored the OTHER way (stop above price, target
// below). Rather than duplicating computeExpectedValue with a second,
// bearish-shaped formula, this reflects stop/target across entry
// (stop' = 2*entry-stop, target' = 2*entry-target) before calling the
// SAME real function — the reflected values produce the exact correct
// real gain%/loss% magnitudes through the identical unmodified formula.
function computeDayTradeEV({ winRate, entry, stop, target, direction, spreadPct }) {
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(target)) return null;
  const isBearish = direction === "BEARISH";
  const mirroredStop = isBearish ? round2(2 * entry - stop) : stop;
  const mirroredTarget = isBearish ? round2(2 * entry - target) : target;
  return computeExpectedValue({ winRate, entry, stop: mirroredStop, target: mirroredTarget, spreadPct });
}

// Chase Engine (#6) — reuses atr-risk-engine.js's real computeAntiChase
// UNCHANGED (it already takes a plain real extensionPct and returns the
// spec's own NORMAL/CAUTION/EXTENDED/DO_NOT_CHASE bands — no new
// classification logic needed). extensionPct here is real and direction-
// aware: how far real price has moved past the real opening-range level
// that would define "at entry" for this direction (orHigh for BULLISH,
// orLow for BEARISH) — the same real orHigh/orLow fields
// computeDayTradeSignal already returns.
function computeDayTradeChase(dt) {
  const isBearish = dt.direction === "BEARISH";
  const level = isBearish ? dt.orLow : dt.orHigh;
  if (!Number.isFinite(level) || level <= 0 || !Number.isFinite(dt.px)) return { band: null, label: null, extensionPct: null };
  const extensionPct = isBearish ? ((level - dt.px) / level) * 100 : ((dt.px - level) / level) * 100;
  return computeAntiChase(extensionPct);
}

// Opportunity Gap (#7) — mirrors opportunity-engine.js's already-shipped
// computeCounterfactualEv pattern exactly: real EV at the current real
// price vs. real EV at the row's own real bestEntry (the level Light Box
// itself already computes as "the" ideal entry — orHigh/orLow at
// breakout/breakdown). Honest null when winRate is unavailable — same
// propagation as computeDayTradeEV itself.
function computeOpportunityGap({ winRate, dt, spreadPct }) {
  if (winRate == null) return null;
  const currentEv = computeDayTradeEV({ winRate, entry: dt.px, stop: dt.stop, target: dt.target, direction: dt.direction, spreadPct });
  const potentialEv = computeDayTradeEV({ winRate, entry: dt.bestEntry, stop: dt.stop, target: dt.target, direction: dt.direction, spreadPct });
  if (currentEv == null || potentialEv == null) return null;
  return { currentEv, potentialEv, gap: round2(potentialEv - currentEv) };
}

// WHY NOW / WHY NOT (#5) — feeds red-flag-engine.js's real, generic
// computeRedFlags with day-trade fields wherever the check is genuinely
// timeframe-agnostic (RR, stop distance, chase/extension — reusing the
// SAME real chase band from computeDayTradeChase above so this never
// disagrees with it), and the real intraday VWAP for the existing
// generic "belowVwap" check (that check's own label is just "Below
// VWAP" — no "20-day" wording baked in, so an intraday VWAP is a
// legitimate, honest reuse of the exact same real comparison, not a
// stretch). Two real day-trade-specific flags with no equivalent in the
// shared engine's fixed vocabulary (weak RVOL, not above/below the real
// opening range) are added separately in the SAME real {key, label,
// critical, reason} shape, then merged — never forcing a semantically
// different signal into an existing key just to reuse it.
function computeDayTradeRedFlags(dt) {
  const stopDistPct = Number.isFinite(dt.px) && dt.px > 0 && Number.isFinite(dt.stop) ? (Math.abs(dt.px - dt.stop) / dt.px) * 100 : null;
  const chase = computeDayTradeChase(dt);
  const ev = {
    rr: dt.rr, riskPct: stopDistPct, antiChase: chase,
    vwap20: dt.vwap, price: dt.px, // real intraday VWAP fed into the generic "belowVwap" check
  };
  const generic = computeRedFlags(ev);

  const extra = [];
  if (Number.isFinite(dt.rvol) && dt.rvol < 1.0) {
    extra.push({ key: "weakRvolIntraday", label: "Weak Volume (RVOL < 1.0x)", critical: false, reason: `RVOL ${dt.rvol.toFixed(1)}x — below-average real participation today.` });
  }
  const isBearish = dt.direction === "BEARISH";
  if (isBearish ? !dt.orBreakout && !dt.priceAction?.breakdown : !dt.orBreakout) {
    const level = isBearish ? dt.orLow : dt.orHigh;
    extra.push({
      key: "notAtOpeningRangeLevel",
      label: isBearish ? "Not Below Opening Range" : "Not Above Opening Range",
      critical: false,
      reason: Number.isFinite(level) ? `Price hasn't ${isBearish ? "broken below" : "broken above"} the real opening-range ${isBearish ? "low" : "high"} $${level.toFixed(2)} yet.` : "Real opening range not available yet.",
    });
  }

  const flags = [...generic.flags, ...extra];
  const criticalFlags = flags.filter((f) => f.critical);
  return { flags, count: flags.length, criticalCount: criticalFlags.length, criticalFlags };
}

// Attention Score (#8) — real, disclosed weighted combination (not a
// black box): starts from the real direction-corrected quality score
// (0-100, already computed by computeDayTradeSignal), then real
// adjustments for entry timing, chase risk, same-day edge velocity, real
// EV (only when the outcome tracker has enough real samples to supply
// one — honestly skipped otherwise, never a fabricated contribution),
// and a real portfolio-correlation penalty (spec's own explicit
// instruction: annotate, don't hide). Every weight below is named and
// reasoned, not tuned to hit a target number.
const ATTENTION_WEIGHTS = {
  entryTriggerConfirmed: 10, entryTriggerApproaching: 3, entryTriggerNotReady: -5, entryTriggerInvalidated: -30,
  chaseExtended: -8, chaseDoNotChase: -20,
  edgeAccelerating: 8, edgeDecaying: -12,
  evScalePerPct: 5, evCap: 15, // real EV%, scaled and capped so one extreme EV reading can't dominate the whole score
  portfolioCorrelationPenalty: -10,
};
function computeAttentionScore({ quality, entryTriggerStatus, chaseBand, edgeVelocityStatus, ev, highCorrelation }) {
  const w = ATTENTION_WEIGHTS;
  let score = Number.isFinite(quality) ? quality : 50;
  if (entryTriggerStatus === "CONFIRMED") score += w.entryTriggerConfirmed;
  else if (entryTriggerStatus === "APPROACHING") score += w.entryTriggerApproaching;
  else if (entryTriggerStatus === "NOT_READY") score += w.entryTriggerNotReady;
  else if (entryTriggerStatus === "INVALIDATED") score += w.entryTriggerInvalidated;
  if (chaseBand === "EXTENDED") score += w.chaseExtended;
  else if (chaseBand === "DO_NOT_CHASE") score += w.chaseDoNotChase;
  if (edgeVelocityStatus === "ACCELERATING") score += w.edgeAccelerating;
  else if (edgeVelocityStatus === "DECAYING") score += w.edgeDecaying;
  if (Number.isFinite(ev)) score += Math.max(-w.evCap, Math.min(w.evCap, ev * w.evScalePerPct));
  if (highCorrelation) score += w.portfolioCorrelationPenalty;
  return Math.max(0, Math.min(100, Math.round(score)));
}

module.exports = {
  computeDayTradeEV, computeDayTradeChase, computeOpportunityGap, computeDayTradeRedFlags, computeAttentionScore,
  ATTENTION_WEIGHTS,
};
