// Real tests for src/position-edge-store.js's classifyEdgeChange (Phase 3
// Tier B, 2026-08-26, "is the original thesis still working?"). Pure-
// function, synthetic-input, zero-network. Run:
// node test/position-edge-store.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { classifyEdgeChange } = require("../src/position-edge-store");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking classifyEdgeChange — real post-entry edge diff…");

ok("a real score rise of +10 since entry reads STRENGTHENING", () => {
  const r = classifyEdgeChange({ entryScore: 78, entryTier: "ACTIONABLE", currentScore: 88, currentTier: "ACTIONABLE" });
  assert.strictEqual(r.status, "STRENGTHENING");
  assert.strictEqual(r.delta, 10);
});

ok("a small real move (+3) reads STABLE, not over-called", () => {
  const r = classifyEdgeChange({ entryScore: 78, entryTier: "ACTIONABLE", currentScore: 81, currentTier: "ACTIONABLE" });
  assert.strictEqual(r.status, "STABLE");
});

ok("a real drop of -12 since entry reads WEAKENING", () => {
  const r = classifyEdgeChange({ entryScore: 80, entryTier: "ACTIONABLE", currentScore: 68, currentTier: "DEVELOPING" });
  assert.strictEqual(r.status, "WEAKENING");
  assert.strictEqual(r.delta, -12);
});

ok("a real drop of -25 since entry reads UNDER_PRESSURE (more severe than WEAKENING)", () => {
  const r = classifyEdgeChange({ entryScore: 85, entryTier: "ACTIONABLE", currentScore: 60, currentTier: "WAIT" });
  assert.strictEqual(r.status, "UNDER_PRESSURE");
});

ok("currentTier INVALIDATED is a hard override to INVALIDATED regardless of score delta", () => {
  const r = classifyEdgeChange({ entryScore: 82, entryTier: "ACTIONABLE", currentScore: 79, currentTier: "INVALIDATED" });
  assert.strictEqual(r.status, "INVALIDATED");
});

ok("missing real entry or current score -> honest UNKNOWN, never fabricated", () => {
  const r1 = classifyEdgeChange({ entryScore: null, entryTier: "ACTIONABLE", currentScore: 80, currentTier: "ACTIONABLE" });
  assert.strictEqual(r1.status, "UNKNOWN");
  assert.strictEqual(r1.delta, null);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("POSITION-EDGE-STORE TEST FAILED"); else console.log("POSITION-EDGE-STORE TEST OK");
