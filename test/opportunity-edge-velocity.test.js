// Real tests for src/opportunity-timeline-store.js's computeEdgeVelocity
// (Phase 3, 2026-08-26, "measure how quickly the opportunity is
// changing"). Pure-function, synthetic-input, zero-network.
// Run: node test/opportunity-edge-velocity.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { computeEdgeVelocity, MIN_SAMPLES_FOR_VELOCITY, MIN_SAMPLES_FOR_PROVISIONAL, MEANINGFUL_VELOCITY } = require("../src/opportunity-timeline-store");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const T0 = 1_000_000_000_000;
const min = (n) => n * 60_000;
const s = (score, tMin) => ({ ts: T0 + min(tMin), score, tier: "WAIT", expectedValue: 0 });

console.log("Checking computeEdgeVelocity — real rate-of-change over same-session samples…");

ok("TEST 1 — ONE SAMPLE (fewer than MIN_SAMPLES_FOR_PROVISIONAL): honest INSUFFICIENT_DATA, never a guessed velocity", () => {
  const r0 = computeEdgeVelocity([]);
  assert.strictEqual(r0.status, "INSUFFICIENT_DATA");
  assert.strictEqual(r0.velocity, null);
  assert.strictEqual(r0.isProvisional, false);
  const r1 = computeEdgeVelocity([s(60, 0)]);
  assert.strictEqual(r1.status, "INSUFFICIENT_DATA");
  assert.strictEqual(r1.isProvisional, false);
  assert.strictEqual(MIN_SAMPLES_FOR_PROVISIONAL, 2);
  assert.strictEqual(MIN_SAMPLES_FOR_VELOCITY, 3);
});

ok("TEST 2 — TWO SAMPLES POSITIVE DELTA (60 -> 67): a real provisional result, not INSUFFICIENT_DATA", () => {
  const r = computeEdgeVelocity([s(60, 0), s(67, 10)]);
  assert.strictEqual(r.sampleCount, 2);
  assert.strictEqual(r.isProvisional, true);
  assert.strictEqual(r.velocity, 7);
  assert.strictEqual(r.status, "ACCELERATING", "a +7 delta clears the same real MEANINGFUL_VELOCITY threshold confirmed reads use");
});

ok("TEST 3 — TWO SAMPLES NEGATIVE DELTA (67 -> 60): provisional DECAYING", () => {
  const r = computeEdgeVelocity([s(67, 0), s(60, 10)]);
  assert.strictEqual(r.isProvisional, true);
  assert.strictEqual(r.velocity, -7);
  assert.strictEqual(r.status, "DECAYING");
});

ok("TEST 4 — TWO SAMPLES FLAT (65 -> 65): provisional STABLE, no invented threshold", () => {
  const r = computeEdgeVelocity([s(65, 0), s(65, 10)]);
  assert.strictEqual(r.isProvisional, true);
  assert.strictEqual(r.velocity, 0);
  assert.strictEqual(r.status, "STABLE");
});

ok("TEST 5 — THREE SAMPLES: existing confirmed behavior is byte-for-byte unchanged except the new isProvisional:false field — a real consistent rise of the spec's own example (61->65->68->73->81) still reads ACCELERATING with velocity +20", () => {
  const r = computeEdgeVelocity([s(61, 0), s(65, 10), s(68, 20), s(73, 30), s(81, 40)]);
  assert.strictEqual(r.status, "ACCELERATING");
  assert.strictEqual(r.velocity, 20);
  assert.strictEqual(r.sampleCount, 5);
  assert.strictEqual(r.isProvisional, false, "3+ real samples must read as CONFIRMED, not provisional");
});

ok("TEST 6 — CHOPPY THREE-SAMPLE (60 -> 68 -> 61): the existing consistency/noise guard is fully intact, not weakened by the provisional addition", () => {
  const r = computeEdgeVelocity([s(60, 0), s(68, 10), s(61, 20)]);
  assert.notStrictEqual(r.status, "ACCELERATING");
  assert.strictEqual(r.isProvisional, false);
});

ok("a real consistent fall (89->87->85->82) reads DECAYING with velocity -7", () => {
  const r = computeEdgeVelocity([s(89, 0), s(87, 10), s(85, 20), s(82, 30)]);
  assert.strictEqual(r.status, "DECAYING");
  assert.strictEqual(r.velocity, -7);
});

ok("a small real move under MEANINGFUL_VELOCITY reads STABLE, not over-called as a trend", () => {
  const r = computeEdgeVelocity([s(70, 0), s(71, 10), s(72, 20)]);
  assert.strictEqual(r.status, "STABLE");
  assert.ok(Math.abs(r.velocity) < MEANINGFUL_VELOCITY);
});

ok("a large first-vs-last delta driven by a single noisy zigzag (not a real consistent direction) does not get called ACCELERATING", () => {
  // net +20 (60->80) but the path is mostly down moves (60->40->35->80) —
  // majority of real consecutive moves disagree with the net direction.
  const r = computeEdgeVelocity([s(60, 0), s(40, 10), s(35, 20), s(80, 30)]);
  assert.strictEqual(r.velocity, 20);
  assert.notStrictEqual(r.status, "ACCELERATING");
});

ok("real elapsed minutes is computed from actual timestamps, never fabricated", () => {
  const r = computeEdgeVelocity([s(60, 0), s(65, 15), s(70, 45)]);
  assert.strictEqual(r.elapsedMinutes, 45);
});

ok("zero elapsed time (two samples at the same real timestamp) never divides by zero or crashes", () => {
  const r = computeEdgeVelocity([s(60, 0), s(61, 0), s(62, 0)]);
  assert.strictEqual(r.elapsedMinutes, 1, "floors to a real minimum of 1 minute rather than 0");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("OPPORTUNITY-EDGE-VELOCITY TEST FAILED"); else console.log("OPPORTUNITY-EDGE-VELOCITY TEST OK");
