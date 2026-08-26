// Real tests for src/opportunity-timeline-store.js's computeEdgeVelocity
// (Phase 3, 2026-08-26, "measure how quickly the opportunity is
// changing"). Pure-function, synthetic-input, zero-network.
// Run: node test/opportunity-edge-velocity.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { computeEdgeVelocity, MIN_SAMPLES_FOR_VELOCITY, MEANINGFUL_VELOCITY } = require("../src/opportunity-timeline-store");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const T0 = 1_000_000_000_000;
const min = (n) => n * 60_000;
const s = (score, tMin) => ({ ts: T0 + min(tMin), score, tier: "WAIT", expectedValue: 0 });

console.log("Checking computeEdgeVelocity — real rate-of-change over same-session samples…");

ok("fewer than MIN_SAMPLES_FOR_VELOCITY samples -> honest INSUFFICIENT_DATA, never a guessed velocity", () => {
  const r0 = computeEdgeVelocity([]);
  assert.strictEqual(r0.status, "INSUFFICIENT_DATA");
  assert.strictEqual(r0.velocity, null);
  const r2 = computeEdgeVelocity([s(60, 0), s(65, 10)]);
  assert.strictEqual(r2.status, "INSUFFICIENT_DATA");
  assert.strictEqual(MIN_SAMPLES_FOR_VELOCITY, 3);
});

ok("a real consistent rise of the spec's own example (61->65->68->73->81) reads ACCELERATING with velocity +20", () => {
  const r = computeEdgeVelocity([s(61, 0), s(65, 10), s(68, 20), s(73, 30), s(81, 40)]);
  assert.strictEqual(r.status, "ACCELERATING");
  assert.strictEqual(r.velocity, 20);
  assert.strictEqual(r.sampleCount, 5);
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
