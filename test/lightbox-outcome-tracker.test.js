// Real tests for src/lightbox-outcome-tracker.js (Market Opportunity
// Intelligence Engine upgrade, 2026-08-26) — same real "log now, compare
// later, never fabricate" pattern as mtf-outcome-tracker.js, adapted for
// direction-aware bar-count horizons. Snapshot-reset-restore discipline,
// same as test/mtf-outcome-tracker.test.js. trackOutcomes() itself needs
// a real network fetch and isn't exercised here — recordEvent/winRateFor/
// buildOutcomeReport are pure over the store's own real persisted data.
// Run: node test/lightbox-outcome-tracker.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { recordEvent, winRateFor, buildOutcomeReport, loadEvents, saveEvents, MIN_WIN_SAMPLE } = require("../src/lightbox-outcome-tracker");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const originalEvents = loadEvents();
saveEvents([]);

try {
  console.log("Checking recordEvent…");
  ok("only logs real BUY/SELL transitions, silently ignores others", () => {
    recordEvent({ symbol: "ZZZLBX", toState: "WAIT", price: 100, direction: "BULLISH" });
    assert.strictEqual(loadEvents().length, 0);
  });
  ok("logs a real BUY event with its real evidence snapshot", () => {
    recordEvent({ symbol: "ZZZLBX", toState: "BUY", price: 100.5, stop: 98, target: 106, quality: 78, grade: "A+", direction: "BULLISH", rr: 2.1, entryTriggerStatus: "CONFIRMED" });
    const events = loadEvents();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].symbol, "ZZZLBX");
    assert.strictEqual(events[0].direction, "BULLISH");
    assert.strictEqual(events[0].quality, 78);
    assert.deepStrictEqual(events[0].outcomes, {}, "honestly empty until trackOutcomes() runs — never backfilled");
  });
  ok("rejects an invalid entry price rather than logging garbage", () => {
    recordEvent({ symbol: "ZZZLBX2", toState: "BUY", price: -5, direction: "BULLISH" });
    recordEvent({ symbol: "ZZZLBX2", toState: "BUY", price: null, direction: "BULLISH" });
    assert.strictEqual(loadEvents().filter((e) => e.symbol === "ZZZLBX2").length, 0);
  });
  ok("a real SELL (BEARISH) transition logs separately", () => {
    recordEvent({ symbol: "ZZZLBX3", toState: "SELL", price: 50, stop: 51.5, target: 46, quality: 70, direction: "BEARISH", rr: 2.0, entryTriggerStatus: "CONFIRMED" });
    assert.strictEqual(loadEvents().filter((e) => e.symbol === "ZZZLBX3").length, 1);
  });

  console.log("Checking winRateFor — real sample-size-gated win rate…");
  ok("honest INSUFFICIENT DATA (null winRate) below MIN_WIN_SAMPLE real completed outcomes", () => {
    const r = winRateFor(4);
    assert.strictEqual(r.winRate, null);
    assert.strictEqual(r.insufficientData, true);
  });
  ok("a real win rate is computed once MIN_WIN_SAMPLE+ real completed outcomes exist", () => {
    const events = Array.from({ length: MIN_WIN_SAMPLE }, (_, i) => ({
      symbol: `W${i}`, toState: "BUY", direction: "BULLISH", ts: new Date().toISOString(), entryPrice: 100,
      outcomes: { b4: { returnPct: i < 7 ? 2 : -1, mfePct: 3, maePct: -1, stopHit: false, targetHit: false } },
    }));
    saveEvents(events);
    const r = winRateFor(4);
    assert.strictEqual(r.insufficientData, false);
    assert.strictEqual(r.sampleCount, MIN_WIN_SAMPLE);
    assert.strictEqual(r.winRate, 70, `expected 7/${MIN_WIN_SAMPLE} = 70%, got ${r.winRate}`);
  });

  console.log("Checking buildOutcomeReport — real aggregation, direction-aware…");
  ok("real avg return / win rate computed correctly per horizon", () => {
    saveEvents([
      { symbol: "A", toState: "BUY", direction: "BULLISH", ts: new Date().toISOString(), entryPrice: 100, outcomes: { b4: { returnPct: 5, mfePct: 6, maePct: -1 } } },
      { symbol: "B", toState: "SELL", direction: "BEARISH", ts: new Date().toISOString(), entryPrice: 100, outcomes: { b4: { returnPct: -3, mfePct: 1, maePct: -4 } } },
    ]);
    const report = buildOutcomeReport();
    const b4 = report.report.b4;
    assert.strictEqual(b4.count, 2);
    assert.strictEqual(b4.avgReturnPct, 1, `expected avg (5 + -3)/2 = 1, got ${b4.avgReturnPct}`);
    assert.strictEqual(b4.winRate, 50);
  });
  ok("honest null for a horizon with zero real completed outcomes", () => {
    saveEvents([{ symbol: "A", toState: "BUY", direction: "BULLISH", ts: new Date().toISOString(), entryPrice: 100, outcomes: {} }]);
    assert.strictEqual(buildOutcomeReport().report.b26, null);
  });
} finally {
  saveEvents(originalEvents);
}

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("LIGHTBOX-OUTCOME-TRACKER TEST FAILED"); else console.log("LIGHTBOX-OUTCOME-TRACKER TEST OK");
