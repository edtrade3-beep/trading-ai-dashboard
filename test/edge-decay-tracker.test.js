// Real tests for src/edge-decay-tracker.js — "is this signal still
// working?" (2026-08-27). Covers the pure logic only (diffSnapshots,
// findSnapshotNearDaysAgo, getEdgeDecayFor) — logEdgeSnapshot/
// getEdgeDecayReport do real file I/O and call the real (network-backed)
// buildForwardReturnReport, same "test the pure helpers, not the
// file/network-wrapped orchestration" convention already used for
// aplus-score-history.js's own forwardReturnsCore. Pure-function,
// synthetic-input, zero-network.
// Run: node test/edge-decay-tracker.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { DECAY_THRESHOLD_PTS, diffSnapshots, findSnapshotNearDaysAgo, getEdgeDecayFor } = require("../src/edge-decay-tracker");
const { MIN_WIN_SAMPLE } = require("../src/institutional-scoring");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

function bucket(winRate, count) { return { winRate, count }; }

console.log("Checking diffSnapshots — real recent-vs-reference win-rate drift, honest sample gating…");
ok(`a real drop of exactly the ${DECAY_THRESHOLD_PTS}-point threshold classifies WEAKENING`, () => {
  const recent = { buckets: { "80-100": bucket(60, MIN_WIN_SAMPLE) } };
  const reference = { buckets: { "80-100": bucket(60 + DECAY_THRESHOLD_PTS, MIN_WIN_SAMPLE) } };
  const d = diffSnapshots(recent, reference)["80-100"];
  assert.strictEqual(d.status, "WEAKENING");
  assert.strictEqual(d.deltaPts, -DECAY_THRESHOLD_PTS);
});
ok(`a real rise of exactly the ${DECAY_THRESHOLD_PTS}-point threshold classifies STRENGTHENING`, () => {
  const recent = { buckets: { "80-100": bucket(70, MIN_WIN_SAMPLE) } };
  const reference = { buckets: { "80-100": bucket(70 - DECAY_THRESHOLD_PTS, MIN_WIN_SAMPLE) } };
  const d = diffSnapshots(recent, reference)["80-100"];
  assert.strictEqual(d.status, "STRENGTHENING");
  assert.strictEqual(d.deltaPts, DECAY_THRESHOLD_PTS);
});
ok("a real drift smaller than the threshold classifies STABLE", () => {
  const recent = { buckets: { "60-79": bucket(65, MIN_WIN_SAMPLE) } };
  const reference = { buckets: { "60-79": bucket(68, MIN_WIN_SAMPLE) } };
  const d = diffSnapshots(recent, reference)["60-79"];
  assert.strictEqual(d.status, "STABLE");
});
ok("a real sample below MIN_WIN_SAMPLE on the RECENT side is honestly null, never a fabricated trend", () => {
  const recent = { buckets: { "40-59": bucket(40, MIN_WIN_SAMPLE - 1) } };
  const reference = { buckets: { "40-59": bucket(70, MIN_WIN_SAMPLE) } };
  assert.strictEqual(diffSnapshots(recent, reference)["40-59"], null);
});
ok("a real sample below MIN_WIN_SAMPLE on the REFERENCE side is honestly null too", () => {
  const recent = { buckets: { "0-39": bucket(40, MIN_WIN_SAMPLE) } };
  const reference = { buckets: { "0-39": bucket(70, MIN_WIN_SAMPLE - 1) } };
  assert.strictEqual(diffSnapshots(recent, reference)["0-39"], null);
});
ok("a bucket missing entirely from either real snapshot is honestly null, never guessed", () => {
  const recent = { buckets: {} };
  const reference = { buckets: { "80-100": bucket(70, MIN_WIN_SAMPLE) } };
  assert.strictEqual(diffSnapshots(recent, reference)["80-100"], null);
});
ok("every one of the 4 real score buckets is covered, not just the ones present in the input", () => {
  const recent = { buckets: {} }, reference = { buckets: {} };
  const d = diffSnapshots(recent, reference);
  assert.deepStrictEqual(Object.keys(d).sort(), ["0-39", "40-59", "60-79", "80-100"]);
});

console.log("Checking findSnapshotNearDaysAgo — same real closest-at-or-before pattern as aplus-score-history.js…");
ok("finds the closest real snapshot at or before the target date, not an exact-match-only lookup", () => {
  const today = new Date();
  const mkDate = (daysAgo) => { const d = new Date(today); d.setDate(d.getDate() - daysAgo); return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d); };
  const snapshots = [
    { date: mkDate(95), buckets: { "80-100": bucket(50, 20) } },
    { date: mkDate(88), buckets: { "80-100": bucket(55, 20) } },
    { date: mkDate(10), buckets: { "80-100": bucket(65, 20) } },
  ];
  const found = findSnapshotNearDaysAgo(snapshots, 90);
  assert.strictEqual(found.date, mkDate(95), "expected the closest real snapshot AT OR BEFORE 90 days back (95d), not the 88d one (after the target)");
});
ok("returns null honestly when no real snapshot is old enough yet", () => {
  const snapshots = [{ date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()), buckets: {} }];
  assert.strictEqual(findSnapshotNearDaysAgo(snapshots, 90), null);
});

console.log("Checking getEdgeDecayFor — real score-to-bucket mapping, honest null when unavailable…");
ok("maps a real score to its real bucket's decay entry", () => {
  const report = { available: true, buckets: { "80-100": { deltaPts: -8, status: "WEAKENING", recent: bucket(60, 20), reference: bucket(68, 20) } } };
  const d = getEdgeDecayFor(85, report);
  assert.strictEqual(d.status, "WEAKENING");
});
ok("report unavailable (still building history) returns honest null, never a guess", () => {
  assert.strictEqual(getEdgeDecayFor(85, { available: false, reason: "not enough history" }), null);
});
ok("no real score to bucket returns honest null", () => {
  assert.strictEqual(getEdgeDecayFor(undefined, { available: true, buckets: {} }), null);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("EDGE-DECAY-TRACKER TEST FAILED"); else console.log("EDGE-DECAY-TRACKER TEST OK");
