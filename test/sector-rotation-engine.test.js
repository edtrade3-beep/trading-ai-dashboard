// Real tests for sector-rotation-engine.js (Institutional Intelligence
// Phase 4, 2026-08-23). Pure-function, synthetic-input, zero-network —
// same discipline as the prior 3 Institutional Intelligence engines' test
// files. Run: node test/sector-rotation-engine.test.js (or npm test).
const assert = require("node:assert");
const { rankSectors, computeBreadthScore } = require("../src/sector-rotation-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const sector = (over = {}) => ({ sym: "XLK", name: "Technology", change: 0, ma50: 100, ma200: 95, above50: true, above200: true, pos52w: 60, status: "Bullish", ...over });

console.log("Checking rankSectors — real ranking off structural + momentum data…");
ok("a sector with real strong structure (above50/200, near 52w high, positive change) ranks above a weak one", () => {
  const strong = sector({ sym: "XLK", change: 2, pos52w: 90 });
  const weak = sector({ sym: "XLU", change: -1, above50: false, above200: false, pos52w: 20 });
  const { ranked } = rankSectors([weak, strong]);
  assert.strictEqual(ranked[0].sym, "XLK");
  assert.strictEqual(ranked[1].sym, "XLU");
});
ok("topSector/weakestSector are the real first/last of the ranked list", () => {
  const a = sector({ sym: "XLK", change: 3, pos52w: 95 });
  const b = sector({ sym: "XLE", change: -2, above50: false, pos52w: 10 });
  const { topSector, weakestSector } = rankSectors([a, b]);
  assert.strictEqual(topSector.sym, "XLK");
  assert.strictEqual(weakestSector.sym, "XLE");
});
ok("N/A (failed-fetch) sectors are excluded from ranking, never fabricated a score", () => {
  const good = sector({ sym: "XLK" });
  const failed = { sym: "XLV", name: "Health Care", status: "N/A", above50: null, above200: null, pos52w: 50, change: 0 };
  const { ranked } = rankSectors([good, failed]);
  assert.strictEqual(ranked.length, 1);
  assert.strictEqual(ranked[0].sym, "XLK");
});
ok("empty/no sectors -> honest null topSector/weakestSector/rotationBias, no crash", () => {
  const r = rankSectors([]);
  assert.strictEqual(r.topSector, null);
  assert.strictEqual(r.rotationBias, null);
  assert.deepStrictEqual(r.ranked, []);
});

console.log("Checking rotationBias — real offensive/defensive read off the top-3 ranked sectors…");
ok("top 3 dominated by real offensive sectors (Tech/Discretionary/Industrials) -> OFFENSIVE", () => {
  const sectors = [
    sector({ sym: "XLK", change: 3, pos52w: 95 }),
    sector({ sym: "XLY", change: 2.5, pos52w: 90 }),
    sector({ sym: "XLI", change: 2, pos52w: 85 }),
    sector({ sym: "XLU", change: -1, above50: false, pos52w: 20 }),
  ];
  const { rotationBias } = rankSectors(sectors);
  assert.strictEqual(rotationBias, "OFFENSIVE");
});
ok("top 3 dominated by real defensive sectors (Staples/Utilities/Health Care) -> DEFENSIVE", () => {
  const sectors = [
    sector({ sym: "XLP", change: 1.5, pos52w: 80 }),
    sector({ sym: "XLU", change: 1.2, pos52w: 75 }),
    sector({ sym: "XLV", change: 1, pos52w: 70 }),
    sector({ sym: "XLK", change: -2, above50: false, pos52w: 15 }),
  ];
  const { rotationBias } = rankSectors(sectors);
  assert.strictEqual(rotationBias, "DEFENSIVE");
});
ok("a genuine mix of offensive/defensive/commodity sectors at the top -> MIXED", () => {
  const sectors = [
    sector({ sym: "XLK", change: 2, pos52w: 85 }),
    sector({ sym: "XLU", change: 1.8, pos52w: 82 }),
    sector({ sym: "XLE", change: 1.5, pos52w: 78 }),
  ];
  const { rotationBias } = rankSectors(sectors);
  assert.strictEqual(rotationBias, "MIXED");
});

console.log("Checking computeBreadthScore…");
ok("real strong breadth (most sectors above 50/200 MA, healthy advance/decline) -> a high score", () => {
  const r = computeBreadthScore({ summary: { above50Pct: 90, above200Pct: 85, adRatio: 3 } });
  assert.ok(r.score >= 85, `expected a high score, got ${r.score}`);
});
ok("real weak breadth (most sectors below MAs, declining outnumber advancing) -> a low score", () => {
  const r = computeBreadthScore({ summary: { above50Pct: 10, above200Pct: 15, adRatio: 0.2 } });
  assert.ok(r.score <= 15, `expected a low score, got ${r.score}`);
});
ok("completely empty input -> honest neutral-ish score, no crash, factors all null", () => {
  const r = computeBreadthScore({});
  assert.ok(r.score > 30 && r.score < 70);
  assert.strictEqual(r.factors.above50Pct, null);
});
ok("score always clamped 0-100", () => {
  const r = computeBreadthScore({ summary: { above50Pct: 150, above200Pct: -50, adRatio: 100 } });
  assert.ok(r.score >= 0 && r.score <= 100);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("SECTOR-ROTATION-ENGINE TEST FAILED"); else console.log("SECTOR-ROTATION-ENGINE TEST OK");
