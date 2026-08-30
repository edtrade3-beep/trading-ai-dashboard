// Real tests for src/detection-latency-engine.js — the "missed
// opportunity" detection-latency report (Central Opportunity & Options
// Engine goal, 2026-08-30, section 12). detectionLatencyFor is pure over
// synthetic same-shape samples (zero network/file I/O); buildDetectionLatencyReport
// reads the real, gitignored opportunity-timeline.json — snapshot-reset-
// restore discipline, same as test/lightbox-outcome-tracker.test.js.
// Run: node test/detection-latency-engine.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { detectionLatencyFor, buildDetectionLatencyReport } = require("../src/detection-latency-engine");
const { loadStore, saveStore } = require("../src/opportunity-timeline-store");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

function sample(ts, { score, tier, price }) { return { ts, score, tier, expectedValue: null, price }; }

console.log("Checking detectionLatencyFor — real per-symbol detection-latency read, honest gating…");

ok("a real move too small to clear minMoveAbsPct -> honest null, not a forced report", () => {
  const samples = [sample(0, { score: 50, tier: "WAIT", price: 100 }), sample(60_000, { score: 55, tier: "WAIT", price: 101 })];
  assert.strictEqual(detectionLatencyFor("TEST", samples, { minMoveAbsPct: 5 }), null);
});

ok("fewer than 2 real priced samples -> honest null", () => {
  assert.strictEqual(detectionLatencyFor("TEST", [sample(0, { score: 50, tier: "WAIT", price: 100 })]), null);
  assert.strictEqual(detectionLatencyFor("TEST", []), null);
});

ok("a real big move that reached ACTIONABLE reports real detection lag + real move-missed %", () => {
  const t0 = Date.now();
  const samples = [
    sample(t0, { score: 55, tier: "WAIT", price: 100 }),
    sample(t0 + 10 * 60_000, { score: 65, tier: "DEVELOPING", price: 104 }),
    sample(t0 + 20 * 60_000, { score: 78, tier: "ACTIONABLE", price: 108 }),
    sample(t0 + 30 * 60_000, { score: 80, tier: "ACTIONABLE", price: 112 }),
  ];
  const r = detectionLatencyFor("TEST", samples, { minMoveAbsPct: 5 });
  assert.ok(r, "expected a real report for an 12% move");
  assert.strictEqual(r.detected, true);
  assert.strictEqual(r.detectionLagMinutes, 20);
  assert.strictEqual(r.moveSoFarPct, 12);
  assert.strictEqual(r.moveAtDetectionPct, 8);
  assert.strictEqual(r.moveMissedPct, 4, "the real % of the move that happened AFTER detection but before the last sample");
});

ok("a real big move that NEVER reached ACTIONABLE reports detected:false with the real max score reached, never a fabricated cause", () => {
  const t0 = Date.now();
  const samples = [
    sample(t0, { score: 40, tier: "WAIT", price: 100 }),
    sample(t0 + 15 * 60_000, { score: 58, tier: "DEVELOPING", price: 106 }),
    sample(t0 + 30 * 60_000, { score: 62, tier: "DEVELOPING", price: 109 }),
  ];
  const r = detectionLatencyFor("TEST", samples, { minMoveAbsPct: 5 });
  assert.ok(r);
  assert.strictEqual(r.detected, false);
  assert.strictEqual(r.maxScoreToday, 62);
  assert.ok(r.reason.includes("Never reached"));
});

ok("a real detection lag of 0 minutes (actionable on the very first real sample) is honestly reported as 0, not null or negative", () => {
  const t0 = Date.now();
  const samples = [
    sample(t0, { score: 85, tier: "ACTIONABLE", price: 100 }),
    sample(t0 + 10 * 60_000, { score: 88, tier: "ACTIONABLE", price: 106 }),
  ];
  const r = detectionLatencyFor("TEST", samples, { minMoveAbsPct: 5 });
  assert.strictEqual(r.detectionLagMinutes, 0);
});

console.log("\nChecking buildDetectionLatencyReport — real aggregate across every real same-session symbol, biggest real movers first…");
const originalStore = loadStore();
try {
  ok("no real samples recorded at all today -> honest available:false", () => {
    saveStore({ date: originalStore.date, bySymbol: {} });
    const r = buildDetectionLatencyReport();
    assert.strictEqual(r.available, false);
  });

  ok("real symbols are sorted by the size of the real move, biggest first, and honestly filtered to only those clearing the real threshold", () => {
    const t0 = Date.now();
    saveStore({
      date: originalStore.date,
      bySymbol: {
        BIGMOVE: [sample(t0, { score: 50, tier: "WAIT", price: 100 }), sample(t0 + 60_000, { score: 82, tier: "ACTIONABLE", price: 120 })], // +20%
        SMALLMOVE: [sample(t0, { score: 50, tier: "WAIT", price: 100 }), sample(t0 + 60_000, { score: 60, tier: "WAIT", price: 108 })], // +8%
        FLAT: [sample(t0, { score: 50, tier: "WAIT", price: 100 }), sample(t0 + 60_000, { score: 52, tier: "WAIT", price: 100.5 })], // honestly excluded, <5% real move
      },
    });
    const r = buildDetectionLatencyReport({ minMoveAbsPct: 5 });
    assert.strictEqual(r.available, true);
    assert.strictEqual(r.results.length, 2, "FLAT must be honestly excluded, never force-included");
    assert.strictEqual(r.results[0].symbol, "BIGMOVE", "the real biggest mover must sort first");
    assert.strictEqual(r.results[1].symbol, "SMALLMOVE");
  });
} finally {
  saveStore(originalStore);
}

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("DETECTION-LATENCY-ENGINE TEST FAILED"); else console.log("DETECTION-LATENCY-ENGINE TEST OK");
