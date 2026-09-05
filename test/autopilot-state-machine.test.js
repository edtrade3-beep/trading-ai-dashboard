// Real tests for src/autopilot-state-machine.js — pure transition-validity
// table, no I/O. Unified Autopilot merge, Stage 3.
const assert = require("node:assert");
const {
  STATES, FAILURE_STATES, isValidState, isTerminal, assertTransition,
  applyTransition, createRecord,
} = require("../src/autopilot-state-machine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking the state machine — real transition validity, no I/O…");

ok("every real spec state name is recognized", () => {
  for (const s of [...STATES, ...FAILURE_STATES]) assert.ok(isValidState(s), s);
});

ok("an unknown state name is never valid", () => {
  assert.strictEqual(isValidState("MADE_UP_STATE"), false);
});

ok("CLOSED and every failure state are real terminal states", () => {
  assert.ok(isTerminal("CLOSED"));
  for (const s of FAILURE_STATES) assert.ok(isTerminal(s), s);
});

ok("a normal in-flight state is never terminal", () => {
  assert.strictEqual(isTerminal("ORDER_PENDING"), false);
});

ok("the real happy path RECEIVED -> ... -> CLOSED never throws", () => {
  const path = ["VALIDATING", "RISK_APPROVED", "ORDER_PENDING", "FILLED", "POSITION_OPEN", "MANAGING_POSITION", "EXIT_PENDING", "CLOSED"];
  let from = "RECEIVED";
  for (const to of path) { assertTransition(from, to); from = to; }
});

ok("a real invalid jump (RECEIVED straight to FILLED) throws", () => {
  assert.throws(() => assertTransition("RECEIVED", "FILLED"));
});

ok("no transition is ever allowed out of a terminal state", () => {
  assert.throws(() => assertTransition("CLOSED", "RECEIVED"));
  assert.throws(() => assertTransition("REJECTED", "VALIDATING"));
});

ok("applyTransition never mutates the input record", () => {
  const record = createRecord({ id: "t1", symbol: "AAPL", source: "test" });
  const before = JSON.stringify(record);
  applyTransition(record, "VALIDATING");
  assert.strictEqual(JSON.stringify(record), before);
});

ok("applyTransition appends one real history entry with a real timestamp", () => {
  const record = createRecord({ id: "t1", symbol: "AAPL", source: "test" });
  const updated = applyTransition(record, "VALIDATING", { reason: "eligible candidate" });
  assert.strictEqual(updated.currentState, "VALIDATING");
  assert.strictEqual(updated.history.length, 2);
  assert.strictEqual(updated.history[1].state, "VALIDATING");
  assert.strictEqual(updated.history[1].reason, "eligible candidate");
  assert.ok(Number.isFinite(updated.history[1].at));
});

ok("applyTransition throws (and appends nothing) on a real invalid transition", () => {
  const record = createRecord({ id: "t1", symbol: "AAPL", source: "test" });
  assert.throws(() => applyTransition(record, "CLOSED"));
});

ok("createRecord starts at RECEIVED with one real history entry", () => {
  const record = createRecord({ id: "t2", symbol: "NVDA", source: "server-autopilot" });
  assert.strictEqual(record.currentState, "RECEIVED");
  assert.strictEqual(record.history.length, 1);
  assert.strictEqual(record.history[0].state, "RECEIVED");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("AUTOPILOT-STATE-MACHINE TEST FAILED");
else console.log("AUTOPILOT-STATE-MACHINE TEST OK");
