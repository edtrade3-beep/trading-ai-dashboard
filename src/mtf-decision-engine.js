"use strict";

// mtf-decision-engine.js — pure decision-state math for the MTF Decision
// System's Phase 3 state machine (2026-08-20). Zero I/O, same purity
// discipline as lightbox-engine.js's stepSymbol (directly unit-testable
// with hand-built inputs) — the stateful orchestration (fetching real
// evidence, persisting, scheduling) lives in mtf-state-store.js, mirroring
// the existing lightbox-engine.js (pure) / lightbox-state-store.js
// (orchestration) split exactly.
//
// stepMtfState below is a genuine EXTENSION of stepSymbol's debounce
// primitive, not a rewrite: same "gate on distinct generatedAt, count
// consecutive agreements, flip only past confirmBars" core. What's new:
// (1) an 8-state vocabulary instead of 3, (2) an `everStarted` sticky
// flag so ADD/HOLD/WARNING/REDUCE/EXIT are only reachable once a real
// START has actually been confirmed in this lifecycle — matching the
// spec's own ladder (you can't ADD to a position you never STARTed), and
// (3) EXIT bypasses the debounce entirely (confirms in 1 tick) — the
// spec's own "hard risk rules cannot be overridden" instruction means a
// real climactic-danger read shouldn't sit in a 2-3-tick confirmation
// window while a real reversal happens; every other transition still
// requires genuine sustained agreement, same noise-control reasoning
// Light Box already established.

const STATES = ["WATCH", "EARLY", "START", "ADD", "HOLD", "EXIT_WARNING", "REDUCE", "EXIT"];
const IN_POSITION_STATES = new Set(["ADD", "HOLD", "EXIT_WARNING", "REDUCE"]);

// ── A+ Quality Gate — mandatory before START, per the spec's own explicit
// instruction: "If the gate fails, DO NOT allow normal START. The UI must
// explain exactly which gate failed." Every input here is an ALREADY-
// COMPUTED real value from Phase 1/2's engines (A+ Score, Sniper Decision,
// Cortex/Heat Risk, 4H SWING_SETUP, Daily bias) — no new scoring math,
// just a real pass/fail gate over existing evidence. Thresholds are
// centralized here (not scattered) so Phase 7's backtesting can tune them
// against real results instead of guessing. ──
const GATE_DEFAULTS = {
  minQuality: 60,
  minRs: 60,
  minRR: 1.5,
};

function computeAPlusGate(ev, thresholds = GATE_DEFAULTS) {
  const checks = [
    { key: "quality", label: `Quality ≥ ${thresholds.minQuality}`, pass: Number.isFinite(ev.quality) && ev.quality >= thresholds.minQuality, detail: Number.isFinite(ev.quality) ? `${ev.quality}/100` : "unknown" },
    { key: "setup", label: "4H setup not broken", pass: ev.swingState !== "BROKEN" && ev.swingState != null, detail: ev.swingState || "unknown" },
    { key: "rs", label: `RS Rating ≥ ${thresholds.minRs}`, pass: Number.isFinite(ev.rsRating) && ev.rsRating >= thresholds.minRs, detail: Number.isFinite(ev.rsRating) ? String(ev.rsRating) : "unknown" },
    { key: "daily", label: "Daily bias not bearish", pass: ev.dailyBias !== "BEARISH", detail: ev.dailyBias || "unknown" },
    { key: "antiChase", label: "Not overextended / not chasing", pass: ev.exitRiskState !== "OVEREXTENDED_DO_NOT_CHASE" && ev.exitRiskState !== "CLIMACTIC_DANGER", detail: ev.exitRiskState || "unknown" },
    { key: "rr", label: `R:R ≥ ${thresholds.minRR}:1`, pass: Number.isFinite(ev.rr) ? ev.rr >= thresholds.minRR : true, detail: Number.isFinite(ev.rr) ? `${ev.rr}:1` : "not applicable" },
  ];
  const failed = checks.filter((c) => !c.pass);
  return { pass: failed.length === 0, checks, failed };
}

// ── Candidate state derivation — evidence -> suggested state, NOT yet
// debounced. ev fields, all real, all already computed elsewhere:
//   quality: 0-100 (A+ Score)
//   swingState: "STRONG"|"DEVELOPING"|"WEAK"|"BROKEN"|null (4H)
//   earlyScore: 0-100|null (1H)
//   entryAction: "ENTER_LONG"|"WAIT"|"NO_CHASE"|"AVOID"|null (Sniper Decision)
//   exitRiskState: Heat Risk's state string|null
//   dailyBias: "BULLISH"|"NEUTRAL"|"BEARISH"|null
//   rsRating, rr: numbers|null
//   everStarted: bool — sticky, true once this lifecycle has confirmed START ──
function deriveCandidateState(ev, thresholds = GATE_DEFAULTS) {
  const gate = computeAPlusGate(ev, thresholds);

  if (ev.everStarted) {
    // Post-entry: count independent, real deterioration signals rather
    // than reacting to any single one — the spec's own explicit rule
    // ("one weak signal should generally not cause EXIT").
    if (ev.exitRiskState === "CLIMACTIC_DANGER") return { state: "EXIT", gate };
    const warningFlags = [
      ev.swingState === "BROKEN",
      ev.exitRiskState === "OVEREXTENDED_DO_NOT_CHASE",
      ev.entryAction === "AVOID",
      Number.isFinite(ev.earlyScore) && ev.earlyScore < 25,
      ev.dailyBias === "BEARISH",
    ].filter(Boolean).length;
    if (warningFlags >= 3) return { state: "EXIT", gate };
    if (warningFlags === 2) return { state: "REDUCE", gate };
    if (warningFlags === 1) return { state: "EXIT_WARNING", gate };
    if (ev.entryAction === "ENTER_LONG" && gate.pass) return { state: "ADD", gate };
    return { state: "HOLD", gate };
  }

  // Pre-entry ladder.
  if (ev.entryAction === "ENTER_LONG" && gate.pass) return { state: "START", gate };
  const buildingEarly = Number.isFinite(ev.quality) && ev.quality >= 45
    && (ev.swingState === "STRONG" || ev.swingState === "DEVELOPING")
    && (ev.earlyScore == null || ev.earlyScore >= 40);
  if (buildingEarly) return { state: "EARLY", gate };
  return { state: "WATCH", gate };
}

// prevEntry: { confirmed, pendingSignal, pendingCount, everStarted, lastGeneratedAt, history } | undefined
function stepMtfState(prevEntry, candidate, generatedAt, confirmBars) {
  if (prevEntry && prevEntry.lastGeneratedAt === generatedAt) return prevEntry; // same underlying data fetch — no-op

  const confirmed = prevEntry?.confirmed ?? "WATCH"; // always seed cold, unlike Light Box's 3-state seed — an 8-state ladder that includes ADD/EXIT shouldn't guess a starting position on first sight
  const everStarted = !!(prevEntry?.everStarted || IN_POSITION_STATES.has(confirmed) || confirmed === "START");

  // EXIT is never debounced — hard risk rules aren't subject to the "wait
  // for sustained agreement" noise filter every other transition gets.
  // Must be checked BEFORE the pendingCandidate-match dance below: a
  // brand-new EXIT candidate always differs from whatever was pending
  // before it, so folding this into that branch (checked once real bug
  // was caught by this file's own test) would still make even EXIT wait
  // for a second consecutive tick — defeating the whole point.
  if (candidate === "EXIT") {
    return { confirmed: "EXIT", pendingSignal: "EXIT", pendingCount: 1, everStarted, lastGeneratedAt: generatedAt };
  }

  const pendingCandidate = prevEntry?.pendingSignal ?? confirmed;
  let pendingCount, nextConfirmed = confirmed;
  if (candidate === pendingCandidate) {
    pendingCount = (prevEntry?.pendingCount ?? 0) + 1;
    if (pendingCount >= confirmBars && candidate !== confirmed) nextConfirmed = candidate;
  } else {
    pendingCount = 1;
  }

  return {
    confirmed: nextConfirmed,
    pendingSignal: candidate,
    pendingCount,
    everStarted: everStarted || nextConfirmed === "START",
    lastGeneratedAt: generatedAt,
  };
}

module.exports = { STATES, IN_POSITION_STATES, GATE_DEFAULTS, computeAPlusGate, deriveCandidateState, stepMtfState };
