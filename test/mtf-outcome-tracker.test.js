// Real tests for src/mtf-outcome-tracker.js — MTF Decision System Phase 7
// (2026-08-20). Uses the module's own real store (data/mtf-outcomes.json)
// via its own exported loadEvents/saveEvents — same discipline as this
// session's earlier day-trade-signal-store.js verification (real
// read/write, not a mock), with an explicit reset before/after so this
// test never leaves real production event data behind or reads stale
// data from a previous run. Run: node test/mtf-outcome-tracker.test.js
// (or npm test).
const assert = require("node:assert");
const { recordEvent, buildOutcomeReport, loadEvents, saveEvents } = require("../src/mtf-outcome-tracker");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

// Snapshot the real store, reset to empty for a clean test run, restore afterward.
const originalEvents = loadEvents();
saveEvents([]);

try {
  console.log("Checking recordEvent…");
  ok("recordEvent: only logs EARLY/START, silently ignores other states", () => {
    recordEvent({ symbol: "ZZZTEST", toState: "HOLD", price: 100, ev: {}, gate: {}, atrLevels: {}, antiChase: {} });
    recordEvent({ symbol: "ZZZTEST", toState: "WATCH", price: 100, ev: {}, gate: {}, atrLevels: {}, antiChase: {} });
    assert.strictEqual(loadEvents().length, 0);
  });
  ok("recordEvent: logs a real EARLY event with the real evidence snapshot", () => {
    recordEvent({
      symbol: "ZZZTEST", toState: "EARLY", price: 100.5,
      ev: { quality: 72, swingState: "DEVELOPING", earlyScore: 60, entryAction: "WAIT", rsRating: 80 },
      gate: { pass: false }, atrLevels: { stop: 95, target1: 110 }, antiChase: { band: "NORMAL" },
    });
    const events = loadEvents();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].symbol, "ZZZTEST");
    assert.strictEqual(events[0].toState, "EARLY");
    assert.strictEqual(events[0].quality, 72);
    assert.strictEqual(events[0].stop, 95);
  });
  ok("recordEvent: does not duplicate the same (symbol, toState) logged the same real day", () => {
    recordEvent({ symbol: "ZZZTEST", toState: "EARLY", price: 101, ev: { quality: 75 }, gate: {}, atrLevels: {}, antiChase: {} });
    assert.strictEqual(loadEvents().length, 1, "second EARLY for the same symbol/day must not create a duplicate entry");
  });
  ok("recordEvent: a different toState for the same symbol the same day DOES log separately", () => {
    recordEvent({ symbol: "ZZZTEST", toState: "START", price: 102, ev: { quality: 80 }, gate: { pass: true }, atrLevels: {}, antiChase: {} });
    assert.strictEqual(loadEvents().length, 2);
  });
  ok("recordEvent: rejects an invalid entry price rather than logging garbage", () => {
    recordEvent({ symbol: "ZZZTEST2", toState: "EARLY", price: -5, ev: {}, gate: {}, atrLevels: {}, antiChase: {} });
    recordEvent({ symbol: "ZZZTEST2", toState: "EARLY", price: null, ev: {}, gate: {}, atrLevels: {}, antiChase: {} });
    assert.strictEqual(loadEvents().filter((e) => e.symbol === "ZZZTEST2").length, 0);
  });

  console.log("Checking buildOutcomeReport…");
  ok("buildOutcomeReport: honest null for every horizon with zero real completed outcomes yet", () => {
    const report = buildOutcomeReport();
    assert.strictEqual(report.report.EARLY.d1, null);
    assert.strictEqual(report.report.START.d10, null);
  });
  ok("buildOutcomeReport: real aggregation once outcomes exist — avg return, win rate, stop/target-hit rate all computed correctly", () => {
    saveEvents([
      { symbol: "A", toState: "START", ts: new Date().toISOString(), entryPrice: 100, outcomes: { d1: { returnPct: 5, mfePct: 6, maePct: -1, stopHit: false, target1Hit: true } } },
      { symbol: "B", toState: "START", ts: new Date().toISOString(), entryPrice: 100, outcomes: { d1: { returnPct: -3, mfePct: 1, maePct: -4, stopHit: true, target1Hit: false } } },
    ]);
    const report = buildOutcomeReport();
    const d1 = report.report.START.d1;
    assert.strictEqual(d1.count, 2);
    assert.strictEqual(d1.avgReturnPct, 1, `expected avg (5 + -3)/2 = 1, got ${d1.avgReturnPct}`);
    assert.strictEqual(d1.winRate, 50);
    assert.strictEqual(d1.stopHitRate, 50);
    assert.strictEqual(d1.target1HitRate, 50);
  });
  ok("buildOutcomeReport: EARLY and START are aggregated completely separately, never mixed", () => {
    saveEvents([
      { symbol: "A", toState: "EARLY", ts: new Date().toISOString(), entryPrice: 100, outcomes: { d1: { returnPct: 10, stopHit: false, target1Hit: false } } },
      { symbol: "B", toState: "START", ts: new Date().toISOString(), entryPrice: 100, outcomes: { d1: { returnPct: -10, stopHit: true, target1Hit: false } } },
    ]);
    const report = buildOutcomeReport();
    assert.strictEqual(report.report.EARLY.d1.avgReturnPct, 10);
    assert.strictEqual(report.report.START.d1.avgReturnPct, -10);
  });
} finally {
  // Always restore the real store, even if an assertion above threw.
  saveEvents(originalEvents);
}

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("MTF-OUTCOME-TRACKER TEST FAILED"); else console.log("MTF-OUTCOME-TRACKER TEST OK");
