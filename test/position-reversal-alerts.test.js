// Real tests for position-reversal-alerts.js's checkReversalRisk (2026-08-23,
// Master Build Spec phase 6) — migrated off computeSniperDecision's
// gates.reversalTopRisk (the old pre-unification verdict engine) onto a
// direct call to computeReversalDetector (src/sniper-decision.js), the
// same real, separate detector that gate was always just a thin
// pass-through of. Pure-function, synthetic-input, zero-network — same
// discipline as test/entry-engine.test.js. No test file existed for this
// module before this phase. Run: node test/position-reversal-alerts.test.js
// (or npm test).
const assert = require("node:assert");
const { checkReversalRisk } = require("../src/position-reversal-alerts");
const { computeSniperDecision, computeReversalDetector } = require("../src/sniper-decision");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const TOP_ROW = { price: 195, hi52: 200, lo52: 100, rsi: 75, volRatio: 1.2, dayChangePct: -0.5, weekChangePct: 5, ma50: 180 };
const CLEAN_ROW = { price: 150, hi52: 200, lo52: 100, rsi: 50, volRatio: 1.0, dayChangePct: 0.1, weekChangePct: 1, ma50: 145 };

console.log("Checking checkReversalRisk — the migrated real trigger…");
ok("a genuine near-top reversal read (near 52w high + RSI overbought) -> isRisk true", () => {
  const r = checkReversalRisk(TOP_ROW, false);
  assert.strictEqual(r.isRisk, true);
  assert.strictEqual(r.reversal.isTop, true);
});
ok("newly risky (wasRisk false) -> shouldWarn true", () => {
  assert.strictEqual(checkReversalRisk(TOP_ROW, false).shouldWarn, true);
});
ok("already risky (wasRisk true) -> shouldWarn false, no duplicate spam", () => {
  assert.strictEqual(checkReversalRisk(TOP_ROW, true).shouldWarn, false);
});
ok("a clean, unremarkable row -> isRisk false, shouldWarn false regardless of wasRisk", () => {
  assert.strictEqual(checkReversalRisk(CLEAN_ROW, false).isRisk, false);
  assert.strictEqual(checkReversalRisk(CLEAN_ROW, false).shouldWarn, false);
  assert.strictEqual(checkReversalRisk(CLEAN_ROW, true).shouldWarn, false);
});
ok("the real reversal object carries verdict/sigs/hi52/lo52 for the alert message", () => {
  const r = checkReversalRisk(TOP_ROW, false);
  assert.match(r.reversal.verdict, /TOP/);
  assert.ok(Array.isArray(r.reversal.sigs) && r.reversal.sigs.length > 0);
  assert.strictEqual(r.reversal.hi52, 200);
  assert.strictEqual(r.reversal.lo52, 100);
});

console.log("Checking the migration preserves computeSniperDecision's own real result (regression guard)…");
ok("checkReversalRisk's isRisk matches computeSniperDecision(row).gates.reversalTopRisk exactly, for both a risky and a clean row", () => {
  const oldTop = computeSniperDecision(TOP_ROW);
  const newTop = checkReversalRisk(TOP_ROW, false);
  assert.strictEqual(newTop.isRisk, oldTop.gates.reversalTopRisk, "the migrated path must produce the identical real result the old computeSniperDecision-routed path did");

  const oldClean = computeSniperDecision(CLEAN_ROW);
  const newClean = checkReversalRisk(CLEAN_ROW, false);
  assert.strictEqual(newClean.isRisk, oldClean.gates.reversalTopRisk);
});
ok("computeReversalDetector itself is unchanged — direct call matches computeSniperDecision's own internal call", () => {
  const direct = computeReversalDetector({
    price: TOP_ROW.price, hi52: TOP_ROW.hi52, lo52: TOP_ROW.lo52, rsi: TOP_ROW.rsi,
    rvol: TOP_ROW.volRatio, dayChangePct: TOP_ROW.dayChangePct, weekChangePct: TOP_ROW.weekChangePct, ma50: TOP_ROW.ma50,
  });
  const viaCheck = checkReversalRisk(TOP_ROW, false).reversal;
  assert.deepStrictEqual(direct, viaCheck);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("POSITION-REVERSAL-ALERTS TEST FAILED"); else console.log("POSITION-REVERSAL-ALERTS TEST OK");
