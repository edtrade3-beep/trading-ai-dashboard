// Real tests for src/autopilot2-backtest.js's pure aggregation functions
// (explicit user request, 2026-08-31: "you tell me i want to make money
// trading" -> a real backtest of Autopilot 2.0's exact engine). Pure-
// function, synthetic-input, zero-network — the orchestration function
// itself (runAutopilot2Backtest) does real historical fetches + reuses
// computeOpportunity/isBullishCandidate/sizeEntry, and is untested here
// by the same precedent as every other AI/fetch-orchestration layer in
// this codebase (e.g. market-wrap-ai.js, curbline-intel-ai.js).
"use strict";
const assert = require("node:assert");
const { buildStats, maxDrawdownPct } = require("../src/autopilot2-backtest");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking maxDrawdownPct — real peak-to-trough read, never fabricated…");
ok("a real monotonic uptrend has zero drawdown", () => {
  const curve = [{ equity: 100 }, { equity: 110 }, { equity: 120 }];
  assert.strictEqual(maxDrawdownPct(curve), 0);
});
ok("a real peak-then-drop computes the correct real % drawdown", () => {
  const curve = [{ equity: 100 }, { equity: 200 }, { equity: 150 }];
  assert.strictEqual(maxDrawdownPct(curve), -25); // (150-200)/200
});
ok("real recovery-then-new-low still reports the WORST real drawdown seen, not the latest", () => {
  const curve = [{ equity: 100 }, { equity: 200 }, { equity: 190 }, { equity: 195 }, { equity: 100 }];
  assert.strictEqual(maxDrawdownPct(curve), -50); // (100-200)/200
});
ok("an empty real equity curve returns an honest 0, never a crash", () => {
  assert.strictEqual(maxDrawdownPct([]), 0);
});

console.log("\nChecking buildStats — real win rate/profit factor/return, honest on empty…");
ok("zero real trades returns an honest empty/null stats object, never fabricated", () => {
  const s = buildStats([], [{ equity: 100000 }], 100000);
  assert.strictEqual(s.count, 0);
  assert.strictEqual(s.winRate, null);
  assert.strictEqual(s.totalPnl, 0);
});
ok("a real mixed win/loss sample computes the real win rate and P&L", () => {
  const trades = [
    { pnl: 500, pnlPct: 5, holdingDays: 10 },
    { pnl: -200, pnlPct: -2, holdingDays: 5 },
    { pnl: 300, pnlPct: 3, holdingDays: 8 },
  ];
  const s = buildStats(trades, [{ equity: 100000 }, { equity: 100600 }], 100000);
  assert.strictEqual(s.count, 3);
  assert.strictEqual(s.winRate, 66.67);
  assert.strictEqual(s.totalPnl, 600);
  assert.strictEqual(s.avgWinPct, 4); // avg of 5 and 3
  assert.strictEqual(s.avgLossPct, -2);
  assert.strictEqual(s.profitFactor, 4); // 800 gross profit / 200 gross loss
});
ok("real zero losing trades honestly reports profit factor as null with a real note, never Infinity", () => {
  const trades = [{ pnl: 100, pnlPct: 1, holdingDays: 3 }, { pnl: 200, pnlPct: 2, holdingDays: 4 }];
  const s = buildStats(trades, [{ equity: 100000 }, { equity: 100300 }], 100000);
  assert.strictEqual(s.profitFactor, null);
  assert.ok(s.profitFactorNote && s.profitFactorNote.includes("undefined"));
});
ok("real totalReturnPct is computed off the real final equity curve point, not trade PnL sum", () => {
  const trades = [{ pnl: 500, pnlPct: 5, holdingDays: 10 }];
  const s = buildStats(trades, [{ equity: 100000 }, { equity: 105000 }], 100000);
  assert.strictEqual(s.totalReturnPct, 5);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("AUTOPILOT2-BACKTEST TEST FAILED"); else console.log("AUTOPILOT2-BACKTEST TEST OK");
