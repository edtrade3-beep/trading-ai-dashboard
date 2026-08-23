"use strict";

const { sortByPriority } = require("./decision-priority");

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

// Regular (non-critical) Red Flag Engine flags -> decision-priority.js key,
// so they sort correctly alongside the existing missing-factor reasons
// (Master Build Spec §8-9/§23, 2026-08-22). See red-flag-engine.js.
const REGULAR_FLAG_PRIORITY = {
  weakVolume: { key: "MOMENTUM_VOLUME", label: "1H volume to strengthen" },
  fallingRS: { key: "RELATIVE_STRENGTH", label: "relative strength to improve" },
  belowVwap: { key: "MOMENTUM_VOLUME", label: "price to reclaim VWAP" },
};

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

  // Red Flag Engine (Master Build Spec §8-9, 2026-08-22) — ev.redFlags is
  // the caller's own already-computed computeRedFlags(...).flags array
  // (red-flag-engine.js), reused here, never recomputed. Entry-taxonomy
  // only this phase — absent (e.g. the hasPosition/post-entry branch below,
  // which doesn't pass it) is an honest "not evaluated," not a fabricated
  // zero.
  const redFlags = Array.isArray(ev.redFlags) ? ev.redFlags : [];
  const criticalRedFlags = redFlags.filter((f) => f.critical);
  const regularRedFlags = redFlags.filter((f) => !f.critical);

  const base = (decision, why, next, entryZone) => ({
    decision, ...DECISION_META[decision], why, next, entryZone, pivot, stop, target, ...reads,
    redFlagCount: redFlags.length, criticalFlagCount: criticalRedFlags.length, redFlags,
  });

  if (ev.hasPosition) {
    // Reuse the existing position-decision-engine.js state, never
    // recomputed — this simplification layer only relabels it into the
    // 6-state vocabulary (TRAIL folds into HOLD, TAKE_PARTIAL into REDUCE).
    // HARD_EXIT/WARNING (Master Build Spec §18, 2026-08-22) are two new
    // real states position-decision-engine.js can now return — mapped
    // explicitly here (HARD_EXIT->EXIT, WARNING->HOLD) rather than left to
    // fall through to the generic no-real-data fallback below, which would
    // have silently shown a real stop breach as a bare "HOLD."
    if (ev.dayTradeState === "EXIT") return base("EXIT", ev.dayTradeReason || "Thesis invalidated.", "Exit the position.", null);
    if (ev.dayTradeState === "HARD_EXIT") return base("EXIT", ev.dayTradeReason || "Stop breached — risk limit reached.", "Exit immediately — the planned stop was hit.", null);
    if (ev.dayTradeState === "TAKE_PARTIAL") return base("REDUCE", ev.dayTradeReason || "Target reached or momentum fading.", "Take partial profit.", null);
    if (ev.dayTradeState === "WARNING") return base("HOLD", ev.dayTradeReason || "Evidence has turned mixed — watch closely.", "Hold, but watch closely.", null);
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
  // Critical Red Flags (spec §8-9/§23's core example: "Technical score=92,
  // Critical failed-breakout=TRUE -> AVOID" — a critical flag overrides a
  // high score, never hidden). Mirrors the exact same hard-gate pattern as
  // the two checks above; structureBroken/extremeExtension are ALSO real
  // red flags, but those two already return first when they fire, so this
  // mainly catches failed breakout, daily trend breakdown, regime
  // deterioration, unacceptable R:R, unacceptable stop distance, and poor
  // liquidity — none of which had a hard gate here before this phase.
  if (criticalRedFlags.length) {
    const names = criticalRedFlags.map((f) => f.label).join(", ");
    return base("WAIT", `Critical red flag: ${names}.`, `Resolve: ${names}.`, "BLOCKED");
  }

  const rrOk = Number.isFinite(ev.rr) ? ev.rr >= 1.5 : null;
  const setupOk = setup === "READY" || setup === "IMPROVING";
  const timingOk = timing === "READY";
  const trendOk = trend !== "BEARISH";
  const structureOk = structure === "HEALTHY" || structure === "REPAIRING";
  // Market Regime (spec §13's #1 priority factor) — real when the caller
  // has one (MarketTerminalTab.jsx's marketRegimeDW, the same real
  // RISK_ON/RISK_OFF/NEUTRAL read entry-engine.js's own qualifying
  // conditions already use); honestly ignored (never blocks) when absent,
  // same graceful-degradation discipline as every other real-but-optional
  // input here. Previously this decision never named regime at all — a
  // RISK_OFF tape was silently just one of entry-engine's 12 anonymous
  // qualifying conditions, never surfaced in this "why" text.
  const regimeOk = ev.marketRegime == null ? true : ev.marketRegime !== "RISK_OFF";

  if (entryPlan.entryPrice != null && regimeOk && trendOk && structureOk && setupOk && timingOk && rrOk !== false) {
    const zone = zoneString(
      entryPlan.stage === "EARLY" ? entryPlan.earlyEntryZone
        : entryPlan.stage === "CONFIRMATION" ? entryPlan.confirmationEntryZone
        : entryPlan.stage === "RETEST" ? entryPlan.retestZone
        : [entryPlan.entryPrice, entryPlan.entryPrice]
    );
    return base("START_SMALL", "Trend, structure, setup, and entry timing all confirm.", "START SMALL.", zone);
  }

  // WAIT — always says exactly what's missing, never a bare "wait." Real
  // factors are tagged with their spec §13 priority key and sorted via
  // decision-priority.js before being joined into text — the ONE
  // canonical order, not an ad-hoc push order that can silently drift
  // (this list used to name Trend before Market Structure; the spec's
  // real priority is the reverse).
  const missingFactors = [];
  if (!regimeOk) missingFactors.push({ key: "MARKET_REGIME", label: "market regime to turn risk-on" });
  if (rrOk === false) missingFactors.push({ key: "RISK_INVALIDATION", label: "a better risk/reward" });
  if (!structureOk) missingFactors.push({ key: "MARKET_STRUCTURE", label: "4H structure to repair" });
  if (!trendOk) missingFactors.push({ key: "TREND", label: "daily trend to turn constructive" });
  if (!setupOk) missingFactors.push({ key: "ENTRY_QUALITY", label: "1H setup to improve" });
  if (!timingOk) missingFactors.push({ key: "ENTRY_QUALITY", label: "15M confirmation" });
  for (const f of regularRedFlags) {
    const mapped = REGULAR_FLAG_PRIORITY[f.key];
    if (mapped) missingFactors.push(mapped);
  }
  const missing = sortByPriority(missingFactors).map((f) => f.label);
  if (!missing.length) missing.push("more real evidence");
  const zone = zoneString(entryPlan.earlyEntryZone);
  return base("WAIT", `Need: ${missing.join(", ")}.`, `Wait for ${missing.join(" + ")}.`, zone || "BLOCKED");
}

module.exports = { computeSimpleDecision, classifyStructure4h, classifySetup1h, classifyTiming15m, DECISION_META };
