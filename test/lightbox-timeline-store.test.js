// Real tests for src/lightbox-timeline-store.js (Market Opportunity
// Intelligence Engine upgrade, 2026-08-26) — real, same-day intraday
// quality-score history feeding the reused computeEdgeVelocity classifier.
// Real read/write against the module's own store, snapshot-reset-restore
// discipline, same as test/opportunity-timeline-store.test.js.
// Run: node test/lightbox-timeline-store.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { recordQualitySnapshots, getTodayTimeline, getEdgeVelocityFor, MIN_GAP_MS, loadStore, saveStore } = require("../src/lightbox-timeline-store");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const originalStore = loadStore();
saveStore({ date: originalStore.date, bySymbol: {} });

try {
  console.log("Checking recordQualitySnapshots — real batch record, throttled, honest empty read…");

  ok("no real samples yet -> getTodayTimeline returns an honest empty array", () => {
    assert.deepStrictEqual(getTodayTimeline("ZZZLBX"), []);
  });

  ok("a real batch records one real sample per symbol", () => {
    recordQualitySnapshots([{ symbol: "ZZZLBX", quality: 62 }, { symbol: "ZZZLBX2", quality: 88 }]);
    const t1 = getTodayTimeline("ZZZLBX");
    assert.strictEqual(t1.length, 1);
    assert.strictEqual(t1[0].score, 62);
    assert.ok(Number.isFinite(t1[0].ts));
  });

  ok("an entry missing symbol or quality is honestly skipped", () => {
    recordQualitySnapshots([{ symbol: null, quality: 50 }, { symbol: "ZZZLBX3", quality: null }]);
    assert.deepStrictEqual(getTodayTimeline("ZZZLBX3"), []);
  });

  ok("a second real call inside the throttle window does not add a point", () => {
    const before = getTodayTimeline("ZZZLBX").length;
    recordQualitySnapshots([{ symbol: "ZZZLBX", quality: 70 }]);
    assert.strictEqual(getTodayTimeline("ZZZLBX").length, before);
  });

  ok("once real time has genuinely passed (backdated stored ts), a new real sample IS recorded", () => {
    const store = loadStore();
    store.bySymbol.ZZZLBX[store.bySymbol.ZZZLBX.length - 1].ts = Date.now() - (MIN_GAP_MS + 1000);
    saveStore(store);
    recordQualitySnapshots([{ symbol: "ZZZLBX", quality: 81 }]);
    const after = getTodayTimeline("ZZZLBX");
    assert.strictEqual(after.length, 2);
    assert.strictEqual(after[after.length - 1].score, 81);
  });

  ok("getEdgeVelocityFor reuses the real shared classifier — honest INSUFFICIENT_DATA under its sample floor", () => {
    const r = getEdgeVelocityFor("ZZZLBX");
    assert.strictEqual(r.status, "INSUFFICIENT_DATA", "only 2 real samples recorded — below the shared 3-sample floor");
  });
} finally {
  saveStore(originalStore);
}

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("LIGHTBOX-TIMELINE-STORE TEST FAILED"); else console.log("LIGHTBOX-TIMELINE-STORE TEST OK");
