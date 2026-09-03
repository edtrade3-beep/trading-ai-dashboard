// Real tests for src/trade-gps-score.js — the spec's own 7-bucket
// 20/20/15/15/10/10/10 composite score, additive on top of the existing
// canonical pipeline (2026-09-03). Pure-function, synthetic-input,
// zero-network. Run: node test/trade-gps-score.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { computeTradeGpsScore, evaluateCashCompetition, WEIGHTS, WEIGHT_SUM, BAND_PRIMARY_MIN, BAND_WATCH_MIN } = require("../src/trade-gps-score");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

function allInputs(overrides = {}) {
  return {
    regimeAlignment: 80, trendConfirmation: 80, catalystQuality: 80, relativeStrength: 80,
    volumeConfirmation: 80, riskRewardQuality: 80, optionsLiquidity: 80,
    ...overrides,
  };
}

console.log("Checking the disclosed weight scheme itself…");
ok("real weights match the spec exactly: 20/20/15/15/10/10/10", () => {
  assert.deepStrictEqual(WEIGHTS, {
    regimeAlignment: 20, trendConfirmation: 20, catalystQuality: 15, relativeStrength: 15,
    volumeConfirmation: 10, riskRewardQuality: 10, optionsLiquidity: 10,
  });
});
ok("weights sum to exactly 100 — a typo here would silently misrepresent every real score", () => {
  assert.strictEqual(WEIGHT_SUM, 100);
});

console.log("\nChecking computeTradeGpsScore — real weighted sum + band thresholds…");
ok("all-80 real inputs -> score exactly 80 (weighted average of equal inputs is the input itself)", () => {
  const r = computeTradeGpsScore(allInputs());
  assert.strictEqual(r.score, 80);
});
ok("all-100 real inputs -> score exactly 100", () => {
  const r = computeTradeGpsScore(allInputs({ regimeAlignment: 100, trendConfirmation: 100, catalystQuality: 100, relativeStrength: 100, volumeConfirmation: 100, riskRewardQuality: 100, optionsLiquidity: 100 }));
  assert.strictEqual(r.score, 100);
});
ok("all-0 real inputs -> score exactly 0", () => {
  const r = computeTradeGpsScore(allInputs({ regimeAlignment: 0, trendConfirmation: 0, catalystQuality: 0, relativeStrength: 0, volumeConfirmation: 0, riskRewardQuality: 0, optionsLiquidity: 0 }));
  assert.strictEqual(r.score, 0);
});
ok("a real 100 only in the two 20-weight buckets, 0 elsewhere -> score exactly 40 (proves weights are actually applied, not just averaged)", () => {
  const r = computeTradeGpsScore(allInputs({ regimeAlignment: 100, trendConfirmation: 100, catalystQuality: 0, relativeStrength: 0, volumeConfirmation: 0, riskRewardQuality: 0, optionsLiquidity: 0 }));
  assert.strictEqual(r.score, 40);
});

console.log("\nChecking band boundaries (85-100 PRIMARY, 75-84 WATCH, <75 REJECT)…");
ok("score 84 -> WATCH, not PRIMARY (boundary just below 85)", () => {
  const r = computeTradeGpsScore(allInputs({ regimeAlignment: 84, trendConfirmation: 84, catalystQuality: 84, relativeStrength: 84, volumeConfirmation: 84, riskRewardQuality: 84, optionsLiquidity: 84 }));
  assert.strictEqual(r.score, 84);
  assert.strictEqual(r.band, "WATCH");
});
ok("score 85 -> PRIMARY (exact boundary)", () => {
  const r = computeTradeGpsScore(allInputs({ regimeAlignment: 85, trendConfirmation: 85, catalystQuality: 85, relativeStrength: 85, volumeConfirmation: 85, riskRewardQuality: 85, optionsLiquidity: 85 }));
  assert.strictEqual(r.score, 85);
  assert.strictEqual(r.band, "PRIMARY");
});
ok("score 74 -> REJECT, not WATCH (boundary just below 75)", () => {
  const r = computeTradeGpsScore(allInputs({ regimeAlignment: 74, trendConfirmation: 74, catalystQuality: 74, relativeStrength: 74, volumeConfirmation: 74, riskRewardQuality: 74, optionsLiquidity: 74 }));
  assert.strictEqual(r.score, 74);
  assert.strictEqual(r.band, "REJECT");
});
ok("score 75 -> WATCH (exact boundary)", () => {
  const r = computeTradeGpsScore(allInputs({ regimeAlignment: 75, trendConfirmation: 75, catalystQuality: 75, relativeStrength: 75, volumeConfirmation: 75, riskRewardQuality: 75, optionsLiquidity: 75 }));
  assert.strictEqual(r.score, 75);
  assert.strictEqual(r.band, "WATCH");
});
ok("real BAND_PRIMARY_MIN/BAND_WATCH_MIN constants match the spec exactly", () => {
  assert.strictEqual(BAND_PRIMARY_MIN, 85);
  assert.strictEqual(BAND_WATCH_MIN, 75);
});

console.log("\nChecking honest NO_TRADE on missing/invalid/contradictory data (explicit spec rule)…");
ok("any single missing real bucket -> NO_TRADE, never a partial/guessed sum", () => {
  const r = computeTradeGpsScore(allInputs({ catalystQuality: null }));
  assert.strictEqual(r.score, null);
  assert.strictEqual(r.band, "NO_TRADE");
  assert.match(r.reason, /catalystQuality/);
});
ok("all inputs missing -> NO_TRADE", () => {
  const r = computeTradeGpsScore({});
  assert.strictEqual(r.band, "NO_TRADE");
});
ok("an out-of-range real input (>100) is treated as invalid, not clamped or silently accepted", () => {
  const r = computeTradeGpsScore(allInputs({ regimeAlignment: 150 }));
  assert.strictEqual(r.band, "NO_TRADE");
});
ok("a negative real input is treated as invalid", () => {
  const r = computeTradeGpsScore(allInputs({ trendConfirmation: -5 }));
  assert.strictEqual(r.band, "NO_TRADE");
});

console.log("\nChecking evaluateCashCompetition — cash must compete with every real opportunity…");
ok("a real negative-expectancy trade never clears even a 0% hurdle -> cash preferred", () => {
  const r = evaluateCashCompetition({ expectedTradeR: -0.5, expectedTradeConfidence: 60, riskFreeRatePct: 0 });
  assert.strictEqual(r.cashPreferred, true);
});
ok("a real strong trade (high R, high confidence) clears the hurdle -> cash not preferred", () => {
  const r = evaluateCashCompetition({ expectedTradeR: 2, expectedTradeConfidence: 80, riskFreeRatePct: 0 });
  assert.strictEqual(r.cashPreferred, false);
});
ok("a real positive-but-thin edge can still lose to a real nonzero risk-free hurdle", () => {
  const r = evaluateCashCompetition({ expectedTradeR: 0.5, expectedTradeConfidence: 50, riskFreeRatePct: 30 });
  // expectedR = 0.5 * 0.5 = 0.25; hurdleR = 30/100 = 0.30 -> cash wins
  assert.strictEqual(r.cashPreferred, true);
});
ok("missing real inputs -> honest null, never a fabricated true/false", () => {
  assert.strictEqual(evaluateCashCompetition({ expectedTradeR: null, expectedTradeConfidence: 50 }), null);
  assert.strictEqual(evaluateCashCompetition({}), null);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TRADE-GPS-SCORE TEST FAILED"); else console.log("TRADE-GPS-SCORE TEST OK");
