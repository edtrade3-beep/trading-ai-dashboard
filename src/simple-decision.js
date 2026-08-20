"use strict";

// simple-decision.js — the "5-Second Rule" simplified decision layer
// (2026-08-20, explicit user directive: "FIX AND SIMPLIFY THE AM TRADING
// ENTRY/EXIT SYSTEM... too complicated and sometimes gives conflicting
// messages"). This is NOT a new scoring system — it creates zero new
// numbers. It's a thin combiner that reduces the already-computed,
// already-sophisticated engines (entry-engine.js's staged plan,
// position-decision-engine.js's post-entry state, mtf-swing-engine.js's
// 4H read, mtf-early-engine.js's 1H read, day-trade-calc.js's 15M entry
// trigger) down to exactly what the spec asks for: ONE decision, ONE
// short reason, ONE next action, plus 4 simple timeframe reads. The
// internal engines stay exactly as sophisticated as before — only the
// user-facing OUTPUT is simplified.
//
// Vocabulary, fixed to 6 states per the spec: START_SMALL, ADD, HOLD,
// WAIT, REDUCE, EXIT. "BREAKOUT CONFIRMED"/"RETEST"/anti-chase are real
// internal reasons for landing on START_SMALL/ADD/WAIT, not separate
// user-facing states — the trader sees the conclusion, not the mechanism.

const DECISION_META = {
  START_SMALL: { icon: "🟢", label: "START SMALL", color: "#0d9465" },
  ADD: { icon: "🟢", label: "ADD", color: "#0d9465" },
  HOLD: { icon: "🟢", label: "HOLD", color: "#0d9465" },
  WAIT: { icon: "🟡", label: "WAIT", color: "#d6a312" },
  REDUCE: { icon: "🟠", label: "REDUCE", color: "#e08a1e" },
  EXIT: { icon: "🔴", label: "EXIT", color: "#c8282a" },
};

// 1D -> BULLISH/NEUTRAL/BEARISH is already exactly this vocabulary
// (dwDailyBias) — passed through unchanged, no reclassification needed.

// 4H: swing4hState (STRONG/DEVELOPING/WEAK/BROKEN, mtf-swing-engine.js)
// -> HEALTHY/REPAIRING/BROKEN. STRONG or DEVELOPING both read as a real,
// intact structure (HEALTHY); WEAK is attempting to hold, not gone
// (REPAIRING); BROKEN is unchanged.
function classifyStructure4h(swing4hState) {
  if (swing4hState === "STRONG" || swing4hState === "DEVELOPING") return "HEALTHY";
  if (swing4hState === "WEAK") return "REPAIRING";
  if (swing4hState === "BROKEN") return "BROKEN";
  return null;
}

// 1H: early1h (mtf-early-engine.js's computeEarlyDevelopment — score +
// rsiTrend direction/acceleration) -> READY/IMPROVING/WEAK.
function classifySetup1h(early1h) {
  if (!early1h || early1h.dataInsufficient || early1h.score == null) return null;
  const trend = early1h.rsiTrend || {};
  if (early1h.score >= 60 || (trend.direction === "up" && trend.accelerating === true)) return "READY";
  if (trend.direction === "up" || early1h.score >= 30) return "IMPROVING";
  return "WEAK";
}

// 15M: entry15mStatus (day-trade-calc.js's classifyEntryTrigger output —
// CONFIRMED/APPROACHING/NOT_READY/INVALIDATED) -> the spec's own strict
// binary READY/NOT_READY (only a real CONFIRMED counts as READY).
function classifyTiming15m(entry15mStatus) {
  if (entry15mStatus == null) return null;
  return entry15mStatus === "CONFIRMED" ? "READY" : "NOT_READY";
}

function zoneString(zone) {
  if (!Array.isArray(zone) || zone.some((v) => !Number.isFinite(v))) return null;
  return zone[0] === zone[1] ? `$${zone[0].toFixed(2)}` : `$${zone[0].toFixed(2)}–$${zone[1].toFixed(2)}`;
}

// ev fields — all real, all already computed elsewhere:
//   dailyBias, swing4hState, early1h, entry15mStatus, rr — same inputs
//   entry-engine.js's computeQualifyingConditions already reads.
//   entryPlan — the real, already-computed output of computeEntryPlan
//   (entry-engine.js): entryPrice, stage, pivot, stop, target1,
//   earlyEntryZone/confirmationEntryZone/retestZone, doNotChaseZone.
//   hasPosition, dayTradeState, dayTradeReason — real, already-computed
//   by position-decision-engine.js (via routes/alpaca.js's positions
//   overlay), read here, never recomputed.
function computeSimpleDecision(ev = {}) {
  const trend = ev.dailyBias || null;
  const structure = classifyStructure4h(ev.swing4hState);
  const setup = classifySetup1h(ev.early1h);
  const timing = classifyTiming15m(ev.entry15mStatus);
  const entryPlan = ev.entryPlan || {};
  const pivot = entryPlan.pivot ?? null;
  const stop = entryPlan.stop ?? null;
  const target = entryPlan.target1 ?? null;
  const reads = { trend, structure, setup, timing };

  const base = (decision, why, next, entryZone) => ({
    decision, ...DECISION_META[decision], why, next, entryZone, pivot, stop, target, ...reads,
  });

  if (ev.hasPosition) {
    // Reuse the existing position-decision-engine.js state, never
    // recomputed — this simplification layer only relabels it into the
    // 6-state vocabulary (TRAIL folds into HOLD, TAKE_PARTIAL into REDUCE).
    if (ev.dayTradeState === "EXIT") return base("EXIT", ev.dayTradeReason || "Thesis invalidated.", "Exit the position.", null);
    if (ev.dayTradeState === "TAKE_PARTIAL") return base("REDUCE", ev.dayTradeReason || "Target reached or momentum fading.", "Take partial profit.", null);
    if (ev.dayTradeState === "TRAIL" || ev.dayTradeState === "HOLD") return base("HOLD", ev.dayTradeReason || "Structure intact, thesis still confirmed.", "Hold.", null);
    // No real day-trade data for this position (illiquid symbol, etc.) —
    // fall back to the spec's own simple structural rules rather than
    // guessing at a day-trade-specific reason.
    if (structure === "BROKEN") return base("EXIT", "4H structure broken.", "Exit — thesis invalidated.", null);
    if (entryPlan.doNotChaseZone?.band === "DO_NOT_CHASE") return base("REDUCE", "Price extended.", "Take partial profit, protect gains.", null);
    return base("HOLD", "Trend and structure intact.", "Hold.", null);
  }

  // Pre-entry. Hard gates first — no combination of other real evidence
  // can override these (same discipline as entry-engine.js's own
  // STRUCTURE_BROKEN gate; this layer reuses that same real signal).
  if (structure === "BROKEN") {
    return base("WAIT", "4H structure is broken.", "Wait for 4H repair + 15M confirmation.", "BLOCKED");
  }
  if (entryPlan.doNotChaseZone?.band === "DO_NOT_CHASE") {
    return base("WAIT", "Price is extended — do not chase.", "Wait for a pullback or retest.", "BLOCKED");
  }

  const rrOk = Number.isFinite(ev.rr) ? ev.rr >= 1.5 : null;
  const setupOk = setup === "READY" || setup === "IMPROVING";
  const timingOk = timing === "READY";
  const trendOk = trend !== "BEARISH";
  const structureOk = structure === "HEALTHY" || structure === "REPAIRING";

  if (entryPlan.entryPrice != null && trendOk && structureOk && setupOk && timingOk && rrOk !== false) {
    const zone = zoneString(
      entryPlan.stage === "EARLY" ? entryPlan.earlyEntryZone
        : entryPlan.stage === "CONFIRMATION" ? entryPlan.confirmationEntryZone
        : entryPlan.stage === "RETEST" ? entryPlan.retestZone
        : [entryPlan.entryPrice, entryPlan.entryPrice]
    );
    return base("START_SMALL", "Trend, structure, setup, and entry timing all confirm.", "START SMALL.", zone);
  }

  // WAIT — always says exactly what's missing, never a bare "wait."
  const missing = [];
  if (!trendOk) missing.push("daily trend to turn constructive");
  if (!structureOk) missing.push("4H structure to repair");
  if (!setupOk) missing.push("1H setup to improve");
  if (!timingOk) missing.push("15M confirmation");
  if (rrOk === false) missing.push("a better risk/reward");
  if (!missing.length) missing.push("more real evidence");
  const zone = zoneString(entryPlan.earlyEntryZone);
  return base("WAIT", `Need: ${missing.join(", ")}.`, `Wait for ${missing.join(" + ")}.`, zone || "BLOCKED");
}

module.exports = { computeSimpleDecision, classifyStructure4h, classifySetup1h, classifyTiming15m, DECISION_META };
