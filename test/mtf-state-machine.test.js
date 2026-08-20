// Real tests for src/mtf-decision-engine.js — the MTF Decision System's
// Phase 3 pure state-machine math (A+ Quality Gate, candidate derivation,
// stepMtfState debounce). Same minimal style as test/smoke.js. No
// framework — calls the real exported functions, hand-built evidence.
// Run: node test/mtf-state-machine.test.js (or npm test).
const assert = require("node:assert");
const { GATE_DEFAULTS, computeAPlusGate, deriveCandidateState, stepMtfState } = require("../src/mtf-decision-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const strongEv = { quality: 80, swingState: "STRONG", earlyScore: 75, entryAction: "ENTER_LONG", exitRiskState: "HEALTHY_STRENGTH", dailyBias: "BULLISH", rsRating: 85, rr: 2.2, everStarted: false };

console.log("Checking computeAPlusGate…");
ok("computeAPlusGate: a real strong setup passes every check", () => {
  const g = computeAPlusGate(strongEv);
  assert.strictEqual(g.pass, true);
  assert.strictEqual(g.failed.length, 0);
});
ok("computeAPlusGate: low RS alone fails the gate and names exactly that check", () => {
  const g = computeAPlusGate({ ...strongEv, rsRating: 40 });
  assert.strictEqual(g.pass, false);
  assert.deepStrictEqual(g.failed.map((f) => f.key), ["rs"]);
});
ok("computeAPlusGate: a broken 4H setup fails the gate even with everything else strong", () => {
  const g = computeAPlusGate({ ...strongEv, swingState: "BROKEN" });
  assert.strictEqual(g.pass, false);
  assert.ok(g.failed.some((f) => f.key === "setup"));
});
ok("computeAPlusGate: overextended (anti-chase) fails the gate", () => {
  const g = computeAPlusGate({ ...strongEv, exitRiskState: "OVEREXTENDED_DO_NOT_CHASE" });
  assert.strictEqual(g.pass, false);
  assert.ok(g.failed.some((f) => f.key === "antiChase"));
});

console.log("Checking deriveCandidateState — pre-entry ladder…");
ok("deriveCandidateState: no real evidence at all reads WATCH", () => {
  const r = deriveCandidateState({ everStarted: false });
  assert.strictEqual(r.state, "WATCH");
});
ok("deriveCandidateState: building quality/setup/early (not yet confirmed) reads EARLY, not START", () => {
  const r = deriveCandidateState({ quality: 65, swingState: "DEVELOPING", earlyScore: 55, entryAction: "WAIT", exitRiskState: "NEUTRAL_WAIT", dailyBias: "BULLISH", rsRating: 75, everStarted: false });
  assert.strictEqual(r.state, "EARLY");
});
ok("deriveCandidateState: real confirmed entry + a passing A+ gate reads START — QUALITY=95/SETUP=88/EARLY=82/ENTRY=confirmed example from the spec", () => {
  const r = deriveCandidateState(strongEv);
  assert.strictEqual(r.state, "START");
  assert.strictEqual(r.gate.pass, true);
});
ok("deriveCandidateState: a confirmed breakout (ENTER_LONG) with a FAILING gate does NOT auto-START — the spec's own explicit 'A+ gate failing blocks START' rule, high score alone must never override it", () => {
  const r = deriveCandidateState({ ...strongEv, rsRating: 30 }); // ENTER_LONG but RS gate fails
  assert.notStrictEqual(r.state, "START");
  assert.strictEqual(r.gate.pass, false);
});

console.log("Checking deriveCandidateState — post-entry ladder (everStarted=true)…");
ok("deriveCandidateState: healthy evidence post-entry reads HOLD", () => {
  const r = deriveCandidateState({ ...strongEv, entryAction: "WAIT", everStarted: true });
  assert.strictEqual(r.state, "HOLD");
});
ok("deriveCandidateState: continued confirmation post-entry reads ADD, not a repeat of START", () => {
  const r = deriveCandidateState({ ...strongEv, everStarted: true });
  assert.strictEqual(r.state, "ADD");
});
ok("deriveCandidateState: exactly one real deterioration signal reads EXIT_WARNING, not REDUCE/EXIT — spec's own 'one weak signal shouldn't cause exit' rule", () => {
  const r = deriveCandidateState({ ...strongEv, entryAction: "WAIT", everStarted: true, swingState: "BROKEN" });
  assert.strictEqual(r.state, "EXIT_WARNING");
});
ok("deriveCandidateState: two independent real deterioration signals reads REDUCE", () => {
  const r = deriveCandidateState({ ...strongEv, entryAction: "AVOID", everStarted: true, swingState: "BROKEN" });
  assert.strictEqual(r.state, "REDUCE");
});
ok("deriveCandidateState: three+ independent real deterioration signals reads EXIT", () => {
  const r = deriveCandidateState({ ...strongEv, entryAction: "AVOID", everStarted: true, swingState: "BROKEN", dailyBias: "BEARISH" });
  assert.strictEqual(r.state, "EXIT");
});
ok("deriveCandidateState: a real climactic-danger read is an immediate EXIT regardless of everything else being strong", () => {
  const r = deriveCandidateState({ ...strongEv, everStarted: true, exitRiskState: "CLIMACTIC_DANGER" });
  assert.strictEqual(r.state, "EXIT");
});

console.log("Checking stepMtfState (persistence/debounce)…");
ok("stepMtfState: fresh symbol seeds cold at WATCH, never guesses a starting position", () => {
  const r = stepMtfState(undefined, "START", "2026-08-20T10:00:00Z", 2);
  assert.strictEqual(r.confirmed, "WATCH");
  assert.strictEqual(r.pendingSignal, "START");
  assert.strictEqual(r.pendingCount, 1);
});
ok("stepMtfState: same generatedAt is a real no-op (doesn't advance the counter)", () => {
  const first = stepMtfState(undefined, "EARLY", "t1", 2);
  const second = stepMtfState(first, "EARLY", "t1", 2);
  assert.strictEqual(second, first);
});
ok("stepMtfState: confirms only after confirmBars consecutive genuinely-new agreements", () => {
  let entry = stepMtfState(undefined, "EARLY", "t1", 3);
  entry = stepMtfState(entry, "EARLY", "t2", 3);
  assert.strictEqual(entry.confirmed, "WATCH", "should not flip before confirmBars is reached");
  entry = stepMtfState(entry, "EARLY", "t3", 3);
  assert.strictEqual(entry.confirmed, "EARLY", "should flip exactly at confirmBars");
});
ok("stepMtfState: a disagreeing candidate mid-window resets the pending count against the new candidate", () => {
  let entry = stepMtfState(undefined, "EARLY", "t1", 3);
  entry = stepMtfState(entry, "EARLY", "t2", 3);
  entry = stepMtfState(entry, "WATCH", "t3", 3); // flickers back
  assert.strictEqual(entry.pendingSignal, "WATCH");
  assert.strictEqual(entry.pendingCount, 1);
});
ok("stepMtfState: EXIT confirms in exactly 1 tick, bypassing confirmBars — hard risk rules aren't debounced", () => {
  let entry = stepMtfState(undefined, "ADD", "t1", 5);
  entry = stepMtfState(entry, "ADD", "t2", 5);
  entry = stepMtfState(entry, "ADD", "t3", 5);
  entry = stepMtfState(entry, "ADD", "t4", 5);
  entry = stepMtfState(entry, "ADD", "t5", 5);
  assert.strictEqual(entry.confirmed, "ADD");
  entry = stepMtfState(entry, "EXIT", "t6", 5); // single tick, real confirmBars is 5
  assert.strictEqual(entry.confirmed, "EXIT", "EXIT must not wait for the normal confirmBars window");
});
ok("stepMtfState: everStarted stays sticky once START confirms, even if evidence later reverts toward WATCH-shaped candidates", () => {
  let entry = stepMtfState(undefined, "START", "t1", 2);
  entry = stepMtfState(entry, "START", "t2", 2);
  assert.strictEqual(entry.confirmed, "START");
  assert.strictEqual(entry.everStarted, true);
  entry = stepMtfState(entry, "WATCH", "t3", 2);
  entry = stepMtfState(entry, "WATCH", "t4", 2);
  assert.strictEqual(entry.everStarted, true, "everStarted must not un-stick just because a later candidate looks WATCH-shaped");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("MTF-STATE-MACHINE TEST FAILED"); else console.log("MTF-STATE-MACHINE TEST OK");
