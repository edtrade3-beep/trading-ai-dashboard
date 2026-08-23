// Real tests for treasury-credit-engine.js (Institutional Intelligence
// Phase 2, 2026-08-23). Pure-function, synthetic-input, zero-network —
// same discipline as test/macro-engine.test.js. Run:
// node test/treasury-credit-engine.test.js (or npm test).
const assert = require("node:assert");
const { computeTreasuryScore, computeCreditScore, computeCreditMomentum } = require("../src/treasury-credit-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking computeTreasuryScore…");
ok("real steep curve + low real yield + falling 10Y -> a high score", () => {
  const r = computeTreasuryScore({ fred: { yieldCurve: { value: 0.8 }, realYield10y: { value: 1.2 }, us10y: { windowChangePct: -2 } } });
  assert.ok(r.score >= 85, `expected a high score, got ${r.score}`);
});
ok("real inverted curve + high real yield + sharply rising 10Y -> a low score", () => {
  const r = computeTreasuryScore({ fred: { yieldCurve: { value: -1 }, realYield10y: { value: 3 }, us10y: { windowChangePct: 10 } } });
  assert.ok(r.score <= 15, `expected a low score, got ${r.score}`);
});
ok("completely empty input -> honest neutral-ish score, no crash, factors all null", () => {
  const r = computeTreasuryScore({});
  assert.ok(r.score > 0 && r.score < 100);
  assert.strictEqual(r.factors.yieldCurve, null);
  assert.strictEqual(r.factors.realYield10y, null);
});
ok("score always clamped 0-100", () => {
  const r = computeTreasuryScore({ fred: { yieldCurve: { value: 5 }, realYield10y: { value: -5 }, us10y: { windowChangePct: -50 } } });
  assert.ok(r.score >= 0 && r.score <= 100);
});

console.log("Checking computeCreditScore…");
ok("real tight HY/IG spreads + no lending tightening -> a high score", () => {
  const r = computeCreditScore({ fred: { hySpread: { value: 2.75 }, igSpread: { value: 0.82 }, lendingStandards: { value: 0 } } });
  assert.ok(r.score >= 85, `expected a high score, got ${r.score}`);
});
ok("real wide (crisis-level) HY/IG spreads + severe lending tightening -> a low score", () => {
  const r = computeCreditScore({ fred: { hySpread: { value: 12 }, igSpread: { value: 4 }, lendingStandards: { value: 60 } } });
  assert.ok(r.score <= 15, `expected a low score, got ${r.score}`);
});
ok("HY OAS thresholds — real boundary at 3.5 (healthy) vs 3.6 (moderate)", () => {
  const healthy = computeCreditScore({ fred: { hySpread: { value: 3.4 } } });
  const moderate = computeCreditScore({ fred: { hySpread: { value: 3.6 } } });
  assert.ok(healthy.score > moderate.score);
});
ok("completely empty input -> honest neutral-ish score, no crash, factors all null", () => {
  const r = computeCreditScore({});
  assert.ok(r.score > 0 && r.score < 100);
  assert.strictEqual(r.factors.hySpread, null);
});
ok("score always clamped 0-100", () => {
  const r = computeCreditScore({ fred: { hySpread: { value: 0 }, igSpread: { value: 0 }, lendingStandards: { value: -100 } } });
  assert.ok(r.score >= 0 && r.score <= 100);
});

console.log("Checking computeCreditMomentum — real HY spread 30D change…");
ok("HY spread widened over the window -> DETERIORATING with a real positive changePts", () => {
  // value=3.0 now, windowChangePct=+20% means windowStart ≈ 2.5 -> +0.5pt real widening
  const r = computeCreditMomentum({ fred: { hySpread: { value: 3.0, windowChangePct: 20 } } });
  assert.strictEqual(r.status, "DETERIORATING");
  assert.ok(r.changePts > 0);
});
ok("HY spread narrowed over the window -> IMPROVING with a real negative changePts", () => {
  // value=2.5 now, windowChangePct=-20% means windowStart ≈ 3.125 -> real narrowing
  const r = computeCreditMomentum({ fred: { hySpread: { value: 2.5, windowChangePct: -20 } } });
  assert.strictEqual(r.status, "IMPROVING");
  assert.ok(r.changePts < 0);
});
ok("HY spread roughly flat -> STABLE", () => {
  const r = computeCreditMomentum({ fred: { hySpread: { value: 2.75, windowChangePct: 1 } } });
  assert.strictEqual(r.status, "STABLE");
});
ok("no real HY spread data -> honest null status, never fabricated", () => {
  const r = computeCreditMomentum({});
  assert.strictEqual(r.status, null);
  assert.strictEqual(r.changePts, null);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TREASURY-CREDIT-ENGINE TEST FAILED"); else console.log("TREASURY-CREDIT-ENGINE TEST OK");
