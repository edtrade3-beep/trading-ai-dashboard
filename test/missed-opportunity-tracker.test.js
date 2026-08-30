// Real tests for src/missed-opportunity-tracker.js (Autopilot goal spec,
// 2026-08-30 — "record why they were missed and what happened
// afterward"). Same "log now, compare later, never fabricate" pattern as
// mtf-outcome-tracker.js/lightbox-outcome-tracker.js. buildMissedOpportunityReport
// itself needs a real network fetch (fetchMarketQuotes) and isn't
// exercised here — categorizeRejectReason/recordMissed/recordsAtLeastDaysOld
// are pure/file-local over the store's own real persisted data.
// Snapshot-reset-restore discipline, same as test/lightbox-outcome-tracker.test.js.
// Run: node test/missed-opportunity-tracker.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { recordMissed, categorizeRejectReason, loadLog, recordsAtLeastDaysOld } = require("../src/missed-opportunity-tracker");
const { writeJsonAtomic, readJsonSafe } = require("../src/atomic-write");
const path = require("node:path");
const { ROOT } = require("../src/config");

const LOG_PATH = path.join(ROOT, "data", "missed-opportunity-log.json");
function saveLog(records) { writeJsonAtomic(LOG_PATH, { records }); }

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const originalLog = readJsonSafe(LOG_PATH, { records: [] });
saveLog([]);

try {
  console.log("Checking categorizeRejectReason — real classification of tryEnter()'s own reject-reason strings…");
  ok("already held", () => { assert.strictEqual(categorizeRejectReason("already held"), "ALREADY_HELD"); });
  ok("max open positions", () => { assert.strictEqual(categorizeRejectReason("max open positions (5) reached"), "MAX_POSITIONS"); });
  ok("sector concentration cap", () => { assert.strictEqual(categorizeRejectReason("sector concentration cap (3) reached for this symbol's sector"), "SECTOR_CAP"); });
  ok("portfolio open-risk ceiling", () => { assert.strictEqual(categorizeRejectReason("portfolio open-risk ceiling (6%) reached (currently 7.1%)"), "RISK_CEILING"); });
  ok("sized to 0 shares/contracts", () => {
    assert.strictEqual(categorizeRejectReason("sized to 0 shares under current real risk limits"), "SIZING_ZERO");
    assert.strictEqual(categorizeRejectReason("real reason — but sized to 0 contracts under current real risk limits"), "SIZING_ZERO");
  });
  ok("an unrecognized reason honestly falls to OTHER, never force-fit or dropped", () => {
    assert.strictEqual(categorizeRejectReason("some brand new reason string that doesn't exist yet"), "OTHER");
    assert.strictEqual(categorizeRejectReason(""), "OTHER");
    assert.strictEqual(categorizeRejectReason(undefined), "OTHER");
  });

  console.log("\nChecking recordMissed — real, honest logging, no fabricated price…");
  ok("a real record with a real price gets logged", () => {
    saveLog([]);
    const entry = recordMissed({ symbol: "ZZZMISS", reason: "already held", price: 123.45, verdict: "BUY", score: 82, tier: "ACTIONABLE", expectedValue: 3.2 });
    assert.ok(entry, "expected a real logged entry");
    assert.strictEqual(entry.symbol, "ZZZMISS");
    assert.strictEqual(entry.category, "ALREADY_HELD");
    const log = loadLog();
    assert.strictEqual(log.length, 1);
  });
  ok("no real price -> honest no-op, never logs a record it can never resolve", () => {
    saveLog([]);
    const entry = recordMissed({ symbol: "ZZZMISS", reason: "already held", price: null });
    assert.strictEqual(entry, null);
    assert.strictEqual(loadLog().length, 0);
  });
  ok("a real missing symbol -> honest no-op", () => {
    saveLog([]);
    assert.strictEqual(recordMissed({ symbol: null, reason: "x", price: 100 }), null);
  });

  console.log("\nChecking recordsAtLeastDaysOld — honest age gating…");
  ok("a record younger than daysAgo is excluded", () => {
    const now = Date.now();
    const records = [{ symbol: "A", loggedAt: now }];
    assert.strictEqual(recordsAtLeastDaysOld(records, 5).length, 0);
  });
  ok("a record at least daysAgo old is included", () => {
    const sixDaysAgo = Date.now() - 6 * 86400_000;
    const records = [{ symbol: "A", loggedAt: sixDaysAgo }];
    assert.strictEqual(recordsAtLeastDaysOld(records, 5).length, 1);
  });
} finally {
  saveLog(originalLog.records || []);
}

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("MISSED-OPPORTUNITY-TRACKER TEST FAILED"); else console.log("MISSED-OPPORTUNITY-TRACKER TEST OK");
