// Real tests for src/ignored-alert-tracker.js — Trade Navigator's "which
// alerts you ignored that later succeeded" (Trade Replay Brain part 2).
// Snapshot-reset-restore over BOTH real stores this file touches
// (trade-gps-audit.json + its own ignored-alert-last-state.json), same
// discipline as test/trade-gps-audit-store.test.js. Run:
// node test/ignored-alert-tracker.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const fs = require("fs");
const { writeJsonAtomic, readJsonSafe } = require("../src/atomic-write");
const { STORE_PATH, getRecordsByQualifyReason } = require("../src/trade-gps-audit-store");
const {
  checkForIgnoredSignal, runIgnoredAlertFollowUps, gradeIgnoredOutcome, QUALIFY_REASON, STATE_PATH,
} = require("../src/ignored-alert-tracker");

let passed = 0;
async function ok(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

const originalStore = readJsonSafe(STORE_PATH, { records: [] });
const originalStateExists = fs.existsSync(STATE_PATH);
const originalState = originalStateExists ? readJsonSafe(STATE_PATH, {}) : null;

(async () => {
  try {
    console.log("Checking gradeIgnoredOutcome — real, honest grading…");

    await ok("real price reaching the real target -> 'would have hit target'", () => {
      assert.strictEqual(gradeIgnoredOutcome({ entry: 100, stop: 95, targets: [110], currentPrice: 112, windowElapsed: true }), "would have hit target");
    });
    await ok("real price breaching the real stop -> 'would have hit stop'", () => {
      assert.strictEqual(gradeIgnoredOutcome({ entry: 100, stop: 95, targets: [110], currentPrice: 93, windowElapsed: true }), "would have hit stop");
    });
    await ok("neither level hit yet and the real follow-up window hasn't elapsed -> honest 'pending', never forced to a verdict early", () => {
      assert.strictEqual(gradeIgnoredOutcome({ entry: 100, stop: 95, targets: [110], currentPrice: 102, windowElapsed: false }), "pending");
    });
    await ok("neither level hit and the real window HAS elapsed -> graded on real price direction", () => {
      assert.strictEqual(gradeIgnoredOutcome({ entry: 100, stop: 95, targets: [110], currentPrice: 103, windowElapsed: true }), "moved favorably, neither level hit");
      assert.strictEqual(gradeIgnoredOutcome({ entry: 100, stop: 95, targets: [110], currentPrice: 98, windowElapsed: true }), "moved unfavorably, neither level hit");
    });
    await ok("a real short setup (target below entry) is graded on the correct real side", () => {
      assert.strictEqual(gradeIgnoredOutcome({ entry: 100, stop: 105, targets: [90], currentPrice: 88, windowElapsed: true }), "would have hit target");
      assert.strictEqual(gradeIgnoredOutcome({ entry: 100, stop: 105, targets: [90], currentPrice: 107, windowElapsed: true }), "would have hit stop");
    });
    await ok("missing real entry/stop/price -> honest 'insufficient real data', never a guessed grade", () => {
      assert.strictEqual(gradeIgnoredOutcome({}), "insufficient real data");
    });

    console.log("\nChecking checkForIgnoredSignal — real transition detection, persisted dedup…");

    await ok("a real ARMED->CANCELLED(expired) transition records a real ignored-alert", () => {
      writeJsonAtomic(STORE_PATH, { records: [] });
      writeJsonAtomic(STATE_PATH, {});
      checkForIgnoredSignal({ symbol: "AAPL", signalState: "ARMED", signalStateReason: "setup qualified — waiting for the real entry trigger", decision: { entry: 100, stop: 95, targets: [110] } });
      const r = checkForIgnoredSignal({ symbol: "AAPL", signalState: "CANCELLED", signalStateReason: "signal expired — TTL elapsed with no confirmed entry", decision: { entry: 100, stop: 95, targets: [110] } });
      assert.ok(r, "the real transition must produce a real recorded event");
      assert.strictEqual(r.qualifyReason, QUALIFY_REASON);
      assert.strictEqual(r.riskDecision.entry, 100);
      assert.strictEqual(r.followUp.checked, false);
    });

    await ok("an ARMED->CANCELLED(invalidated, NOT expired) transition is never recorded as ignored — the thesis genuinely broke", () => {
      writeJsonAtomic(STORE_PATH, { records: [] });
      writeJsonAtomic(STATE_PATH, {});
      checkForIgnoredSignal({ symbol: "TSLA", signalState: "ARMED", signalStateReason: "setup qualified — waiting for the real entry trigger" });
      const r = checkForIgnoredSignal({ symbol: "TSLA", signalState: "CANCELLED", signalStateReason: "opportunity tier/entry-stage invalidated the setup" });
      assert.strictEqual(r, null);
    });

    await ok("a real SCANNING->CANCELLED transition (never actionable) is never recorded — only a real ARMED/ENTER_NOW setup counts as 'ignored'", () => {
      writeJsonAtomic(STORE_PATH, { records: [] });
      writeJsonAtomic(STATE_PATH, {});
      checkForIgnoredSignal({ symbol: "MSFT", signalState: "SCANNING", signalStateReason: "no real qualifying setup yet" });
      const r = checkForIgnoredSignal({ symbol: "MSFT", signalState: "CANCELLED", signalStateReason: "signal expired — TTL elapsed with no confirmed entry" });
      assert.strictEqual(r, null);
    });

    await ok("the same real expiry never double-records — persisted dedup", () => {
      writeJsonAtomic(STORE_PATH, { records: [] });
      writeJsonAtomic(STATE_PATH, {});
      checkForIgnoredSignal({ symbol: "NVDA", signalState: "ENTER_NOW" });
      checkForIgnoredSignal({ symbol: "NVDA", signalState: "CANCELLED", signalStateReason: "signal expired — TTL elapsed with no confirmed entry" });
      const again = checkForIgnoredSignal({ symbol: "NVDA", signalState: "CANCELLED", signalStateReason: "signal expired — TTL elapsed with no confirmed entry" });
      assert.strictEqual(again, null, "the second real CANCELLED observation must not fire again — prev state is already CANCELLED, not ARMED/ENTER_NOW");
    });

    await ok("no real symbol or signalState -> honest no-op", () => {
      assert.strictEqual(checkForIgnoredSignal({}), null);
    });

    console.log("\nChecking runIgnoredAlertFollowUps — real sweep over due records…");

    await ok("no real pending follow-ups due -> honest zero-checked sweep, never a fabricated result", async () => {
      writeJsonAtomic(STORE_PATH, { records: [] });
      const r = await runIgnoredAlertFollowUps({ nowMs: Date.now() });
      assert.strictEqual(r.checked, 0);
    });

    await ok("a real record whose follow-up window hasn't arrived yet is left untouched this sweep", async () => {
      writeJsonAtomic(STORE_PATH, { records: [] });
      writeJsonAtomic(STATE_PATH, {});
      checkForIgnoredSignal({ symbol: "AMD", signalState: "ARMED" });
      checkForIgnoredSignal({ symbol: "AMD", signalState: "CANCELLED", signalStateReason: "signal expired — TTL elapsed with no confirmed entry", decision: { entry: 100, stop: 95, targets: [110] } });
      const r = await runIgnoredAlertFollowUps({ nowMs: Date.now() }); // real checkAtMs is hours in the future
      assert.strictEqual(r.checked, 0);
      const stored = getRecordsByQualifyReason(QUALIFY_REASON);
      assert.strictEqual(stored[0].followUp.checked, false, "must stay honestly pending, not silently marked done");
    });
  } finally {
    writeJsonAtomic(STORE_PATH, originalStore);
    if (originalStateExists) writeJsonAtomic(STATE_PATH, originalState);
    else if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
  }

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("IGNORED-ALERT-TRACKER TEST FAILED"); else console.log("IGNORED-ALERT-TRACKER TEST OK");
})();
