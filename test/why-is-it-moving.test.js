// Real tests for src/why-is-it-moving.js — A+ Market Intelligence,
// spec §7 (see .claude/plans/proud-yawning-unicorn.md). Confidence
// values must be real derived numbers (a news item's own impact score,
// or a real ratio of how much of the move a benchmark could explain) —
// these tests confirm the ranking/threshold logic, never a fabricated
// percentage, and the mandatory honest "unexplained" fallback.
"use strict";
const assert = require("node:assert");
const { rankMoveDrivers, explanatoryRatio } = require("../src/why-is-it-moving");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking explanatoryRatio — real, disclosed benchmark-explains-the-move ratio…");

ok("a real same-direction benchmark move gets a real ratio, not an invented one", () => {
  assert.strictEqual(explanatoryRatio(4, 2), 50); // benchmark explains half the magnitude
});
ok("an opposite-direction benchmark never 'explains' the move — ratio is honestly 0", () => {
  assert.strictEqual(explanatoryRatio(4, -2), 0);
});
ok("the ratio is capped at 95 — never claims one factor fully explains a move", () => {
  assert.strictEqual(explanatoryRatio(1, 5), 95);
});
ok("a zero or missing ticker move is an honest 0, never a divide-by-zero fabrication", () => {
  assert.strictEqual(explanatoryRatio(0, 2), 0);
  assert.strictEqual(explanatoryRatio(NaN, 2), 0);
  assert.strictEqual(explanatoryRatio(4, null), 0);
});

console.log("\nChecking rankMoveDrivers — real ranking, real thresholds, honest unexplained fallback…");

ok("a real high-impact news item becomes a driver with confidence = its own real impact score", () => {
  const { drivers, unexplained } = rankMoveDrivers({
    tickerChg: 4.8, sectorName: null, sectorChg: null, marketChg: null,
    newsItems: [{ headline: "Guidance raised", impact_score: 91, category: "GUIDANCE" }],
  });
  assert.strictEqual(unexplained, false);
  assert.strictEqual(drivers[0].confidence, 91);
  assert.strictEqual(drivers[0].type, "NEWS");
});

ok("a news item below the real impact threshold never becomes a driver", () => {
  const { drivers, unexplained } = rankMoveDrivers({
    tickerChg: 4.8, sectorName: null, sectorChg: null, marketChg: null,
    newsItems: [{ headline: "Minor mention", impact_score: 45, category: "OTHER" }],
  });
  assert.strictEqual(drivers.length, 0);
  assert.strictEqual(unexplained, true);
});

ok("a real same-direction sector move above the ratio threshold becomes a driver", () => {
  const { drivers } = rankMoveDrivers({ tickerChg: 5, sectorName: "Technology", sectorChg: 2, marketChg: null, newsItems: [] });
  assert.strictEqual(drivers.length, 1);
  assert.strictEqual(drivers[0].type, "SECTOR");
  assert.strictEqual(drivers[0].confidence, 40); // 2/5 = 40%
});

ok("a sector move below the real 20% threshold is not a credible driver, never forced in", () => {
  const { drivers } = rankMoveDrivers({ tickerChg: 5, sectorName: "Technology", sectorChg: 0.5, marketChg: null, newsItems: [] });
  assert.strictEqual(drivers.length, 0);
});

ok("multiple real candidates are ranked by confidence, highest first", () => {
  const { drivers } = rankMoveDrivers({
    tickerChg: 5, sectorName: "Technology", sectorChg: 2, marketChg: 4,
    newsItems: [{ headline: "X", impact_score: 65, category: "OTHER" }],
  });
  assert.deepStrictEqual(drivers.map((d) => d.type), ["MARKET", "NEWS", "SECTOR"]); // 80, 65, 40
});

ok("zero real qualifying candidates -> honest unexplained:true, never a forced weak guess", () => {
  const { drivers, unexplained } = rankMoveDrivers({ tickerChg: 6, sectorName: null, sectorChg: null, marketChg: 0.1, newsItems: [] });
  assert.strictEqual(drivers.length, 0);
  assert.strictEqual(unexplained, true);
});

ok("results are capped to the top 4 real candidates", () => {
  const newsItems = [90, 85, 80, 75, 70].map((impact_score, i) => ({ headline: `Item ${i}`, impact_score, category: "OTHER" }));
  const { drivers } = rankMoveDrivers({ tickerChg: 5, sectorName: null, sectorChg: null, marketChg: null, newsItems });
  assert.strictEqual(drivers.length, 4);
  assert.strictEqual(drivers[0].confidence, 90);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("WHY-IS-IT-MOVING TEST FAILED");
else console.log("WHY-IS-IT-MOVING TEST OK");
