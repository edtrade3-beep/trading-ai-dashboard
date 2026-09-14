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

  // UPDATE (2026-09-14, deployment-incident root-cause fix): this
  // assertion predates the "Provisional Edge Velocity" feature
  // (opportunity-timeline-store.js's own MIN_SAMPLES_FOR_PROVISIONAL=2)
  // and was never updated when that feature shipped — it asserted the
  // OLD pre-provisional "3 samples for any real read" contract, which is
  // no longer true and was never re-verified against the real shared
  // classifier. The real, current, already-tested contract (see
  // test/opportunity-edge-velocity.test.js TEST 1/2) is: INSUFFICIENT_DATA
  // only below 2 samples; 2 real samples (this test's own real 62->81
  // fixture above) produce a real PROVISIONAL read, not INSUFFICIENT_DATA.
  // This test's actual job — per its own file header — is only to prove
  // getEdgeVelocityFor genuinely delegates to that shared classifier
  // rather than reimplementing it, so it now asserts the real, current,
  // correct output for its own real 2-sample fixture instead of a stale
  // expectation.
  ok("getEdgeVelocityFor reuses the real shared classifier — 2 real same-day samples produce a real provisional (not INSUFFICIENT_DATA) read, matching opportunity-timeline-store.js's own real MIN_SAMPLES_FOR_PROVISIONAL contract", () => {
    const r = getEdgeVelocityFor("ZZZLBX");
    assert.strictEqual(r.sampleCount, 2, "this test's own fixture recorded exactly 2 real samples (62, then 81)");
    assert.strictEqual(r.status, "ACCELERATING", "a real 62->81 rise over 2 samples is a real provisional ACCELERATING read");
    assert.strictEqual(r.isProvisional, true, "2 real samples is below MIN_SAMPLES_FOR_VELOCITY(3) — a real provisional read, not yet confirmed");
  });
} finally {
  saveStore(originalStore);
}

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("LIGHTBOX-TIMELINE-STORE TEST FAILED"); else console.log("LIGHTBOX-TIMELINE-STORE TEST OK");
