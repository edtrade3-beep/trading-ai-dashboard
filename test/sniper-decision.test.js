// Real tests for rankSniperScan (src/sniper-decision.js) — Sniper AI, a
// real, separate tab from Discover (2026-08-23). Extracted verbatim from
// telegram-bot.js's cmdSniper so the Telegram /sniper command and the new
// /api/market/sniper-scan route can never quietly drift apart — this test
// locks in the real tiering (ENTER_LONG > WAIT > NO_CHASE > AVOID, then
// Minervini passCount, then breakout confidence) directly against the
// real computeSniperDecision, not a hand-copied approximation of it.
"use strict";
const assert = require("node:assert");
const { rankSniperScan, computeSniperDecision, computeReversalTopRisk } = require("../src/sniper-decision");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const enterLongRow = {
  symbol: "AAA", passCount: 7, stage: "Stage 2", price: 105, pivot: 100, entry: 100, stop: 95, target2: 115,
  volRatio: 1.8, rsRating: 85, technicals: { vwap20: 98 }, breakoutConfirmed: true, volConfirmed: true, extended: false, confidence: 90,
};
const waitRow = {
  symbol: "BBB", passCount: 7, stage: "Stage 2", price: 105, pivot: 100, entry: 100, stop: 95, target2: 115,
  volRatio: 1.8, rsRating: 85, technicals: { vwap20: 98 }, breakoutConfirmed: false, volConfirmed: false, extended: false, confidence: 60,
};
const avoidRow = {
  symbol: "CCC", passCount: 2, stage: "Stage 4", price: 40, technicals: { vwap20: 42 }, confidence: 10,
};
const errorRow = { symbol: "ZZZ", error: "No real data" };

console.log("Checking rankSniperScan — real tiering off the real computeSniperDecision…");

ok("real ENTER_LONG/WAIT/AVOID rows sort into the exact real tier order", () => {
  const { ranked } = rankSniperScan([waitRow, avoidRow, enterLongRow]);
  assert.deepStrictEqual(ranked.map((x) => x.row.symbol), ["AAA", "BBB", "CCC"]);
  assert.strictEqual(ranked[0].d.action, "ENTER_LONG");
  assert.strictEqual(ranked[1].d.action, "WAIT");
  assert.strictEqual(ranked[2].d.action, "AVOID");
});

ok("counts tally real actions per row, matching a direct computeSniperDecision call", () => {
  const { counts } = rankSniperScan([waitRow, avoidRow, enterLongRow]);
  assert.strictEqual(counts.ENTER_LONG, 1);
  assert.strictEqual(counts.WAIT, 1);
  assert.strictEqual(counts.AVOID, 1);
  assert.strictEqual(counts.NO_CHASE, 0);
  assert.strictEqual(computeSniperDecision(enterLongRow).action, "ENTER_LONG");
});

ok("real error rows (no data) are excluded, never fabricated into a fake verdict", () => {
  const { ranked, counts } = rankSniperScan([enterLongRow, errorRow]);
  assert.strictEqual(ranked.length, 1);
  assert.strictEqual(ranked[0].row.symbol, "AAA");
  const total = counts.ENTER_LONG + counts.WAIT + counts.NO_CHASE + counts.AVOID;
  assert.strictEqual(total, 1);
});

ok("within the same real tier, higher Minervini passCount ranks first", () => {
  const weakerWait = { ...waitRow, symbol: "DDD", passCount: 5 };
  const { ranked } = rankSniperScan([weakerWait, waitRow]);
  assert.strictEqual(ranked[0].row.symbol, "BBB"); // passCount 7 beats 5, both WAIT
});

ok("empty/all-error input returns an empty ranked list, not a crash", () => {
  const { ranked, counts } = rankSniperScan([errorRow]);
  assert.strictEqual(ranked.length, 0);
  assert.strictEqual(counts.ENTER_LONG + counts.WAIT + counts.NO_CHASE + counts.AVOID, 0);
});

ok("shared reversalTopRisk row adapter flags a real near-top row and honestly clears a neutral row", () => {
  assert.strictEqual(computeReversalTopRisk({ price: 99, hi52: 100, lo52: 50, rsi: 74 }), true);
  assert.strictEqual(computeReversalTopRisk({ price: 75, hi52: 100, lo52: 50, rsi: 50 }), false);
});

console.log(`\n${passed} checks passed.`);
console.log("SNIPER-DECISION TEST OK");
