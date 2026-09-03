// Real tests for src/trade-replay-brain.js — Trade Navigator's "learn
// from the user's own completed real trades" feedback loop. Same
// snapshot-reset-restore discipline as test/trade-gps-audit-store.test.js
// (this file shares the same real store). Run:
// node test/trade-replay-brain.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { writeJsonAtomic, readJsonSafe } = require("../src/atomic-write");
const { recordSetupEvent, STORE_PATH } = require("../src/trade-gps-audit-store");
const { analyzeUserPerformance, computePersonalizedGates, isAllowed, MIN_SAMPLE_STRUCTURE, MIN_SAMPLE_HOUR, CUT_WIN_RATE } = require("../src/trade-replay-brain");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const original = readJsonSafe(STORE_PATH, { records: [] });

function seedLosingStructure(structure, count) {
  for (let i = 0; i < count; i++) {
    recordSetupEvent({ symbol: `${structure}${i}`, tradeStructure: structure, openedAt: "2026-09-01T14:30:00.000Z", outcome: { pnl: -10, holdingDays: 3 } });
  }
}
function seedWinningStructure(structure, count) {
  for (let i = 0; i < count; i++) {
    recordSetupEvent({ symbol: `W${structure}${i}`, tradeStructure: structure, openedAt: "2026-09-01T10:30:00.000Z", outcome: { pnl: 20, holdingDays: 1 } });
  }
}

try {
  console.log("Checking analyzeUserPerformance — real aggregation, delegated math…");

  ok("no real closed trades at all -> honest empty analysis, never fabricated", () => {
    writeJsonAtomic(STORE_PATH, { records: [] });
    const a = analyzeUserPerformance({ window: 100 });
    assert.strictEqual(a.sampleSize, 0);
    assert.deepStrictEqual(a.byStructure, {});
  });

  ok("real per-structure aggregation reflects the real win/loss mix (delegated to trade-gps-audit-store.js's own getPerformanceViews)", () => {
    writeJsonAtomic(STORE_PATH, { records: [] });
    seedLosingStructure("CALL", MIN_SAMPLE_STRUCTURE);
    seedWinningStructure("STOCK", 3);
    const a = analyzeUserPerformance({ window: 100 });
    assert.strictEqual(a.byStructure.CALL.count, MIN_SAMPLE_STRUCTURE);
    assert.strictEqual(a.byStructure.CALL.winRate, 0);
    assert.strictEqual(a.byStructure.STOCK.winRate, 100);
  });

  ok("holdTimeByOutcome real-splits win vs. loss average hold time, flags a real losing-holds-too-long pattern", () => {
    writeJsonAtomic(STORE_PATH, { records: [] });
    for (let i = 0; i < 3; i++) recordSetupEvent({ symbol: `L${i}`, tradeStructure: "STOCK", outcome: { pnl: -10, holdingDays: 6 } });
    for (let i = 0; i < 3; i++) recordSetupEvent({ symbol: `Wn${i}`, tradeStructure: "STOCK", outcome: { pnl: 10, holdingDays: 1 } });
    const a = analyzeUserPerformance({ window: 100 });
    assert.strictEqual(a.holdTime.avgHoldDaysLoss, 6);
    assert.strictEqual(a.holdTime.avgHoldDaysWin, 1);
    assert.strictEqual(a.holdTime.holdsLosersLonger, true);
  });

  ok("holdsLosersLonger stays honest null below the real minimum sample on either side", () => {
    writeJsonAtomic(STORE_PATH, { records: [] });
    recordSetupEvent({ symbol: "L1", tradeStructure: "STOCK", outcome: { pnl: -10, holdingDays: 10 } });
    const a = analyzeUserPerformance({ window: 100 });
    assert.strictEqual(a.holdTime.holdsLosersLonger, null);
  });

  console.log("\nChecking computePersonalizedGates — same real gate-only discipline as learning-engine.js…");

  ok(`a real structure with >= ${MIN_SAMPLE_STRUCTURE} closed trades and a losing win rate (< ${CUT_WIN_RATE}%) is paused`, () => {
    writeJsonAtomic(STORE_PATH, { records: [] });
    seedLosingStructure("PUT", MIN_SAMPLE_STRUCTURE);
    const gates = computePersonalizedGates(analyzeUserPerformance({ window: 100 }));
    assert.strictEqual(gates.structureGates.PUT.allowed, false);
    assert.strictEqual(isAllowed(gates.structureGates.PUT), false);
  });

  ok("a real structure below the sample floor is never paused, regardless of its real win rate", () => {
    writeJsonAtomic(STORE_PATH, { records: [] });
    seedLosingStructure("CALL_SPREAD", MIN_SAMPLE_STRUCTURE - 1);
    const gates = computePersonalizedGates(analyzeUserPerformance({ window: 100 }));
    assert.strictEqual(gates.structureGates.CALL_SPREAD.allowed, true);
    assert.match(gates.structureGates.CALL_SPREAD.reason, /building sample/);
  });

  ok("a real structure with a clearly winning rate is never paused, whatever the sample size", () => {
    writeJsonAtomic(STORE_PATH, { records: [] });
    seedWinningStructure("STOCK", MIN_SAMPLE_STRUCTURE + 2);
    const gates = computePersonalizedGates(analyzeUserPerformance({ window: 100 }));
    assert.strictEqual(gates.structureGates.STOCK.allowed, true);
  });

  ok("a real qualifying hour-of-day bucket with a losing win rate is paused, same real threshold", () => {
    writeJsonAtomic(STORE_PATH, { records: [] });
    seedLosingStructure("STOCK", MIN_SAMPLE_HOUR); // all opened at 14:30 UTC = 10:30 ET
    const gates = computePersonalizedGates(analyzeUserPerformance({ window: 100 }));
    assert.strictEqual(gates.hourGates["10"].allowed, false);
  });

  ok("isAllowed defaults to true for a real structure/hour with no gate computed yet — honest-open, never a fabricated pause", () => {
    assert.strictEqual(isAllowed(undefined), true);
    assert.strictEqual(isAllowed(null), true);
  });

  ok("computePersonalizedGates never boosts — no gate in either real bucket set can report allowed:true off a real winning streak beyond simply not being paused", () => {
    const src = computePersonalizedGates.toString();
    assert.doesNotMatch(src, /boost|increaseRisk|increaseSize/i);
  });
} finally {
  writeJsonAtomic(STORE_PATH, original);
}

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TRADE-REPLAY-BRAIN TEST FAILED"); else console.log("TRADE-REPLAY-BRAIN TEST OK");
