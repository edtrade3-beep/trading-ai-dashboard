// Real tests for src/opportunity-timeline-store.js — Market Opportunity
// Engine Phase 2 (2026-08-26). Uses the module's own real store
// (data/opportunity-timeline.json) via its own exported loadStore/
// saveStore, same snapshot-reset-restore discipline as
// test/mtf-outcome-tracker.test.js — real read/write, not a mock, but
// never leaves real data behind or reads stale data from a prior run.
// Run: node test/opportunity-timeline-store.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { recordOpportunitySnapshots, getTodayTimeline, MIN_GAP_MS, loadStore, saveStore } = require("../src/opportunity-timeline-store");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const originalStore = loadStore();
saveStore({ date: originalStore.date, bySymbol: {} });

try {
  console.log("Checking recordOpportunitySnapshots — real batch record, throttled, capped, honest empty read…");

  ok("no real samples yet -> getTodayTimeline returns an honest empty array, never fabricated", () => {
    assert.deepStrictEqual(getTodayTimeline("ZZZTEST"), []);
  });

  ok("a real Opportunity Object batch records one real sample per symbol", () => {
    recordOpportunitySnapshots([
      { symbol: "ZZZTEST", score: 74, tier: "WAIT", expectedValue: -1.2 },
      { symbol: "ZZZTEST2", score: 88, tier: "ACTIONABLE", expectedValue: 3.4 },
    ]);
    const t1 = getTodayTimeline("ZZZTEST");
    assert.strictEqual(t1.length, 1);
    assert.strictEqual(t1[0].score, 74);
    assert.strictEqual(t1[0].tier, "WAIT");
    assert.strictEqual(t1[0].expectedValue, -1.2);
    assert.ok(Number.isFinite(t1[0].ts));
    assert.strictEqual(getTodayTimeline("ZZZTEST2").length, 1);
  });

  ok("an entry missing symbol or score is honestly skipped, never a garbage point", () => {
    recordOpportunitySnapshots([{ symbol: null, score: 50 }, { symbol: "ZZZTEST3", score: null }]);
    assert.deepStrictEqual(getTodayTimeline("ZZZTEST3"), []);
  });

  ok("a second call within MIN_GAP_MS is throttled — no new real sample recorded", () => {
    const before = getTodayTimeline("ZZZTEST").length;
    recordOpportunitySnapshots([{ symbol: "ZZZTEST", score: 80, tier: "WAIT", expectedValue: 0 }]);
    assert.strictEqual(getTodayTimeline("ZZZTEST").length, before, "a call inside the throttle window must not add a point");
  });

  ok("once real time has genuinely passed (simulated via a backdated stored ts), a new real sample IS recorded", () => {
    const store = loadStore();
    store.bySymbol.ZZZTEST[store.bySymbol.ZZZTEST.length - 1].ts = Date.now() - (MIN_GAP_MS + 1000);
    saveStore(store);
    const before = getTodayTimeline("ZZZTEST").length;
    recordOpportunitySnapshots([{ symbol: "ZZZTEST", score: 91, tier: "ACTIONABLE", expectedValue: 2.1 }]);
    const after = getTodayTimeline("ZZZTEST");
    assert.strictEqual(after.length, before + 1);
    assert.strictEqual(after[after.length - 1].score, 91);
  });

  ok("samples are capped at MAX_SAMPLES_PER_SYMBOL — oldest real samples roll off, never unbounded growth", () => {
    const { MAX_SAMPLES_PER_SYMBOL } = require("../src/opportunity-timeline-store");
    const store = loadStore();
    store.bySymbol.ZZZCAP = Array.from({ length: MAX_SAMPLES_PER_SYMBOL }, (_, i) => ({ ts: Date.now() - (MAX_SAMPLES_PER_SYMBOL - i) * (MIN_GAP_MS + 1000), score: i, tier: "WAIT", expectedValue: 0 }));
    saveStore(store);
    recordOpportunitySnapshots([{ symbol: "ZZZCAP", score: 999, tier: "ACTIONABLE", expectedValue: 5 }]);
    const t = getTodayTimeline("ZZZCAP");
    assert.strictEqual(t.length, MAX_SAMPLES_PER_SYMBOL, "must stay capped, not grow past the real safety limit");
    assert.strictEqual(t[t.length - 1].score, 999, "the newest real sample must be kept");
    assert.strictEqual(t[0].score, 1, "the single oldest real sample must roll off to make room");
  });

  ok("a real day rollover discards yesterday's samples — this store answers 'how has TODAY gone,' not a running multi-day series", () => {
    const store = loadStore();
    saveStore({ date: "2020-01-01", bySymbol: { ZZZTEST: store.bySymbol.ZZZTEST } });
    assert.deepStrictEqual(getTodayTimeline("ZZZTEST"), [], "yesterday's real samples must not bleed into today's honest read");
  });
} finally {
  // Always restore the real store, even if an assertion above threw.
  saveStore(originalStore);
}

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("OPPORTUNITY-TIMELINE-STORE TEST FAILED"); else console.log("OPPORTUNITY-TIMELINE-STORE TEST OK");
