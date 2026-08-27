// Real tests for src/aplus-score-history.js's getPredictionRates —
// previously ZERO test coverage (confirmed before writing this). Covers
// the 2026-08-26 real weekly/monthly/yearly prediction-rate addition:
// honestly null below institutional-scoring.js's own MIN_WIN_SAMPLE floor
// (reused, not a newly invented threshold), a real rate once the sample
// clears it, and the brand-new yearly (d252) horizon honestly null until
// the forward log has actually run that long. Pure-function,
// synthetic-report input, zero-network.
// Run: node test/aplus-score-history-prediction-rates.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { getPredictionRates, bucketOf } = require("../src/aplus-score-history");
const { MIN_WIN_SAMPLE } = require("../src/institutional-scoring");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

function bucketReport({ d5, d20, d252 } = {}) {
  return {
    horizons: {
      d5: d5 ? { buckets: d5 } : null,
      d20: d20 ? { buckets: d20 } : null,
      d252: d252 ? { buckets: d252 } : null,
    },
  };
}

console.log("Checking getPredictionRates — honest null below MIN_WIN_SAMPLE, real rate above it…");
ok("bucketOf(85) is the real 80-100 band getPredictionRates looks up", () => {
  assert.strictEqual(bucketOf(85), "80-100");
});
ok("a real weekly sample at/above MIN_WIN_SAMPLE returns a real rate", () => {
  const report = bucketReport({
    d5: { "80-100": { count: MIN_WIN_SAMPLE, avgReturnPct: 2.4, winRate: 70 } },
  });
  const rates = getPredictionRates(85, report);
  assert.deepStrictEqual(rates.weekly, { count: MIN_WIN_SAMPLE, avgReturnPct: 2.4, winRate: 70 });
});
ok("a real sample one below MIN_WIN_SAMPLE is honestly null, never a fabricated rate", () => {
  const report = bucketReport({
    d5: { "80-100": { count: MIN_WIN_SAMPLE - 1, avgReturnPct: 2.4, winRate: 70 } },
  });
  const rates = getPredictionRates(85, report);
  assert.strictEqual(rates.weekly, null);
});
ok("the brand-new yearly (d252) horizon is honestly null until 252+ real days of history exist", () => {
  const report = bucketReport({
    d5: { "80-100": { count: MIN_WIN_SAMPLE, avgReturnPct: 2.4, winRate: 70 } },
    d252: null,
  });
  const rates = getPredictionRates(85, report);
  assert.strictEqual(rates.yearly, null);
});
ok("weekly/monthly/yearly are looked up independently — a real weekly rate doesn't leak into monthly", () => {
  const report = bucketReport({
    d5: { "80-100": { count: MIN_WIN_SAMPLE, avgReturnPct: 2.4, winRate: 70 } },
    d20: { "80-100": { count: MIN_WIN_SAMPLE, avgReturnPct: 5.1, winRate: 62 } },
  });
  const rates = getPredictionRates(85, report);
  assert.strictEqual(rates.weekly.winRate, 70);
  assert.strictEqual(rates.monthly.winRate, 62);
});
ok("no real report at all (score never logged / store not ready) returns all-null, never a guess", () => {
  const rates = getPredictionRates(85, null);
  assert.deepStrictEqual(rates, { weekly: null, monthly: null, yearly: null });
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("APLUS-SCORE-HISTORY-PREDICTION-RATES TEST FAILED"); else console.log("APLUS-SCORE-HISTORY-PREDICTION-RATES TEST OK");
