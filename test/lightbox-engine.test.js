// Real tests for src/lightbox-engine.js — stepSymbol (pre-existing) plus
// classifyLifecycle/applyWeakeningOverride (Market Opportunity
// Intelligence Engine upgrade, 2026-08-26). Pure-function, synthetic-
// input, zero-network. Run: node test/lightbox-engine.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { stepSymbol, classifyLifecycle, applyWeakeningOverride } = require("../src/lightbox-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking stepSymbol — real confirmation debounce…");
ok("first-seen-per-symbol seeds confirmed immediately, pendingCount 1", () => {
  const r = stepSymbol(undefined, "GREEN", "t1", 2);
  assert.strictEqual(r.confirmed, "GREEN");
  assert.strictEqual(r.pendingCount, 1);
});
ok("same generatedAt is a real no-op — does not advance the counter", () => {
  const r1 = stepSymbol(undefined, "GREEN", "t1", 2);
  const r2 = stepSymbol(r1, "GREEN", "t1", 2);
  assert.deepStrictEqual(r2, r1);
});
ok("confirmBars consecutive real agreements flips confirmed", () => {
  let s = stepSymbol({ confirmed: "YELLOW", pendingSignal: "YELLOW", pendingCount: 0, lastGeneratedAt: "t0" }, "GREEN", "t1", 2);
  assert.strictEqual(s.confirmed, "YELLOW", "1 real tick isn't enough yet");
  s = stepSymbol(s, "GREEN", "t2", 2);
  assert.strictEqual(s.confirmed, "GREEN", "2nd real consecutive tick flips it");
});
ok("a real signal change mid-window restarts the pending counter at 1", () => {
  let s = stepSymbol({ confirmed: "YELLOW", pendingSignal: "YELLOW", pendingCount: 0, lastGeneratedAt: "t0" }, "GREEN", "t1", 3);
  s = stepSymbol(s, "RED", "t2", 3);
  assert.strictEqual(s.pendingSignal, "RED");
  assert.strictEqual(s.pendingCount, 1);
  assert.strictEqual(s.confirmed, "YELLOW", "confirmed never moved — RED never got 3 real consecutive agreements");
});

console.log("Checking classifyLifecycle — real EARLY->DEVELOPING->QUALIFIED->ACTIONABLE->A+->INVALIDATED…");
ok("confirmed RED -> INVALIDATED regardless of anything else", () => {
  assert.strictEqual(classifyLifecycle({ confirmed: "RED", entryTriggerStatus: "CONFIRMED", qualifiesAPlus: true }), "INVALIDATED");
});
ok("entryTriggerStatus INVALIDATED -> INVALIDATED even if confirmed isn't RED yet", () => {
  assert.strictEqual(classifyLifecycle({ confirmed: "YELLOW", entryTriggerStatus: "INVALIDATED" }), "INVALIDATED");
});
ok("confirmed GREEN + real qualifiesAPlus -> A+", () => {
  assert.strictEqual(classifyLifecycle({ confirmed: "GREEN", qualifiesAPlus: true }), "A+");
});
ok("confirmed GREEN without qualifiesAPlus -> ACTIONABLE", () => {
  assert.strictEqual(classifyLifecycle({ confirmed: "GREEN", qualifiesAPlus: false }), "ACTIONABLE");
});
ok("confirmed YELLOW + entryTriggerStatus APPROACHING -> QUALIFIED", () => {
  assert.strictEqual(classifyLifecycle({ confirmed: "YELLOW", entryTriggerStatus: "APPROACHING" }), "QUALIFIED");
});
ok("confirmed YELLOW + entryTriggerStatus CONFIRMED (held back by RR/market gate) -> QUALIFIED", () => {
  assert.strictEqual(classifyLifecycle({ confirmed: "YELLOW", entryTriggerStatus: "CONFIRMED" }), "QUALIFIED");
});
ok("confirmed YELLOW + real pending signal building toward GREEN -> DEVELOPING", () => {
  assert.strictEqual(classifyLifecycle({ confirmed: "YELLOW", pendingSignal: "GREEN", pendingCount: 1, entryTriggerStatus: "NOT_READY" }), "DEVELOPING");
});
ok("confirmed YELLOW with no real developing signal yet -> EARLY", () => {
  assert.strictEqual(classifyLifecycle({ confirmed: "YELLOW", pendingSignal: "YELLOW", pendingCount: 1, entryTriggerStatus: "NOT_READY" }), "EARLY");
});

console.log("Checking applyWeakeningOverride — real edge-decay downgrade…");
ok("ACTIONABLE + real DECAYING edge -> WEAKENING", () => {
  assert.strictEqual(applyWeakeningOverride("ACTIONABLE", "DECAYING"), "WEAKENING");
});
ok("A+ + real DECAYING edge -> WEAKENING", () => {
  assert.strictEqual(applyWeakeningOverride("A+", "DECAYING"), "WEAKENING");
});
ok("ACTIONABLE + STABLE/ACCELERATING/INSUFFICIENT_DATA edge is never downgraded", () => {
  assert.strictEqual(applyWeakeningOverride("ACTIONABLE", "STABLE"), "ACTIONABLE");
  assert.strictEqual(applyWeakeningOverride("ACTIONABLE", "ACCELERATING"), "ACTIONABLE");
  assert.strictEqual(applyWeakeningOverride("ACTIONABLE", "INSUFFICIENT_DATA"), "ACTIONABLE");
});
ok("QUALIFIED/DEVELOPING/EARLY are never touched by the weakening override, even with DECAYING edge", () => {
  assert.strictEqual(applyWeakeningOverride("QUALIFIED", "DECAYING"), "QUALIFIED");
  assert.strictEqual(applyWeakeningOverride("DEVELOPING", "DECAYING"), "DEVELOPING");
  assert.strictEqual(applyWeakeningOverride("EARLY", "DECAYING"), "EARLY");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("LIGHTBOX-ENGINE TEST FAILED"); else console.log("LIGHTBOX-ENGINE TEST OK");
