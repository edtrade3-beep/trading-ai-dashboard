"use strict";
// autopilot-state-machine.js — Unified Autopilot merge, Stage 3 (see
// .claude/plans/proud-yawning-unicorn.md). Pure functions, no I/O — same
// "directly unit-testable, no side effects" discipline asset-decision.js's
// own enum validation already establishes. Persistence lives in the
// separate autopilot-order-store.js.
//
// State names are the platform owner's own explicit spec, used verbatim:
// RECEIVED -> VALIDATING -> RISK_APPROVED -> WAITING_FOR_ENTRY ->
// ORDER_PENDING -> PARTIALLY_FILLED -> FILLED -> POSITION_OPEN ->
// MANAGING_POSITION -> EXIT_PENDING -> CLOSED, with failure states
// REJECTED/EXPIRED/CANCELLED/FAILED/KILLED_BY_RISK/KILLED_BY_THESIS
// reachable from most non-terminal states (a real order can be rejected,
// killed, expired, cancelled, or fail at nearly any stage of its real
// life — a fixed adjacency map keeps that honest and explicit rather than
// allowing an arbitrary jump).
const STATES = [
  "RECEIVED", "VALIDATING", "RISK_APPROVED", "WAITING_FOR_ENTRY",
  "ORDER_PENDING", "PARTIALLY_FILLED", "FILLED", "POSITION_OPEN",
  "MANAGING_POSITION", "EXIT_PENDING", "CLOSED",
];
const FAILURE_STATES = ["REJECTED", "EXPIRED", "CANCELLED", "FAILED", "KILLED_BY_RISK", "KILLED_BY_THESIS"];
const ALL_STATES = [...STATES, ...FAILURE_STATES];

const TRANSITIONS = {
  RECEIVED: ["VALIDATING", "REJECTED", "EXPIRED"],
  VALIDATING: ["RISK_APPROVED", "REJECTED", "KILLED_BY_RISK", "EXPIRED"],
  RISK_APPROVED: ["WAITING_FOR_ENTRY", "ORDER_PENDING", "KILLED_BY_RISK", "EXPIRED", "CANCELLED"],
  WAITING_FOR_ENTRY: ["ORDER_PENDING", "EXPIRED", "CANCELLED", "KILLED_BY_THESIS"],
  ORDER_PENDING: ["PARTIALLY_FILLED", "FILLED", "CANCELLED", "FAILED", "REJECTED"],
  PARTIALLY_FILLED: ["FILLED", "CANCELLED", "FAILED"],
  FILLED: ["POSITION_OPEN"],
  POSITION_OPEN: ["MANAGING_POSITION"],
  MANAGING_POSITION: ["EXIT_PENDING", "KILLED_BY_THESIS", "KILLED_BY_RISK"],
  EXIT_PENDING: ["CLOSED", "FAILED"],
  // Terminal — no real order/position has a further transition once here.
  CLOSED: [], REJECTED: [], EXPIRED: [], CANCELLED: [], FAILED: [], KILLED_BY_RISK: [], KILLED_BY_THESIS: [],
};

function isValidState(state) { return ALL_STATES.includes(state); }
function isTerminal(state) { return state === "CLOSED" || FAILURE_STATES.includes(state); }

function assertTransition(from, to) {
  if (!isValidState(from)) throw new Error(`Invalid from-state: ${from}`);
  if (!isValidState(to)) throw new Error(`Invalid to-state: ${to}`);
  const allowed = TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid transition: ${from} -> ${to}. Allowed from ${from}: ${allowed.join(", ") || "(none — terminal)"}`);
  }
}

// Returns a NEW record (never mutates the input) with the transition
// appended to history and currentState updated. Throws on an invalid
// transition — same fail-loud discipline asset-decision.js's own verdict
// enum already uses, rather than silently accepting a bad state.
function applyTransition(record, to, { reason = null, meta = null } = {}) {
  assertTransition(record.currentState, to);
  const entry = { state: to, at: Date.now(), reason, meta };
  return { ...record, currentState: to, history: [...(record.history || []), entry] };
}

function createRecord({ id, symbol, decisionCorrelationId = null, source, meta = null }) {
  const now = Date.now();
  return {
    id, symbol, decisionCorrelationId, source,
    currentState: "RECEIVED",
    createdAt: now,
    history: [{ state: "RECEIVED", at: now, reason: null, meta }],
  };
}

module.exports = {
  STATES, FAILURE_STATES, ALL_STATES, TRANSITIONS,
  isValidState, isTerminal, assertTransition, applyTransition, createRecord,
};
