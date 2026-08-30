// Real tests for opportunity-snapshot-store.js's pure diff logic —
// diffAgainstStore/diffBreakdown take a plain in-memory map + synthetic
// readings, no real file I/O, same "test the pure core, not the impure
// read/write wrapper" convention as this session's other stores.
// Run: node test/opportunity-snapshot-store.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { diffAgainstStore, diffBreakdown, MIN_AGE_MS } = require("../src/opportunity-snapshot-store");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking diffAgainstStore — real prior-reading diff, honest gating on age (spec §20)…");

ok("no real prior reading at all -> honest null diff, but still records the new one", () => {
  const { diff, updated } = diffAgainstStore({}, "NVDA", { score: 70, verdict: "BUY", breakdown: { trend: 10 } }, 1_000_000);
  assert.strictEqual(diff, null);
  assert.strictEqual(updated.NVDA.score, 70);
  assert.strictEqual(updated.NVDA.ts, 1_000_000);
});

ok("a real prior reading younger than MIN_AGE_MS is honestly ignored — never a fabricated near-zero diff", () => {
  const store = { NVDA: { score: 70, verdict: "BUY", ts: 1_000_000 } };
  const { diff } = diffAgainstStore(store, "NVDA", { score: 71, verdict: "BUY" }, 1_000_000 + MIN_AGE_MS - 1);
  assert.strictEqual(diff, null);
});

ok("a real prior reading at least MIN_AGE_MS old produces a real scoreChange and ageMinutes", () => {
  const store = { NVDA: { score: 56, verdict: "HOLD", ts: 1_000_000 } };
  const now = 1_000_000 + MIN_AGE_MS;
  const { diff } = diffAgainstStore(store, "NVDA", { score: 42, verdict: "AVOID_LONG" }, now);
  assert.ok(diff);
  assert.strictEqual(diff.scoreChange, -14);
  assert.strictEqual(diff.previousScore, 56);
  assert.strictEqual(diff.verdictChanged, true);
  assert.strictEqual(diff.ageMinutes, Math.round(MIN_AGE_MS / 60000));
});

ok("an unchanged real verdict reports verdictChanged: false, not a guess", () => {
  const store = { NVDA: { score: 70, verdict: "BUY", ts: 0 } };
  const { diff } = diffAgainstStore(store, "NVDA", { score: 72, verdict: "BUY" }, MIN_AGE_MS);
  assert.strictEqual(diff.verdictChanged, false);
});

ok("a different symbol's own prior reading is untouched by another symbol's update", () => {
  const store = { NVDA: { score: 70, verdict: "BUY", ts: 0 } };
  const { updated } = diffAgainstStore(store, "AMD", { score: 40, verdict: "WAIT" }, MIN_AGE_MS);
  assert.strictEqual(updated.NVDA.score, 70);
  assert.strictEqual(updated.AMD.score, 40);
});

console.log("Checking diffBreakdown — the one real bucket that moved the most…");

ok("finds the real bucket with the largest real point delta", () => {
  const r = diffBreakdown({ trend: 10, structure: 8, volume: 5 }, { trend: 10.2, structure: 2, volume: 5.1 });
  assert.strictEqual(r.bucket, "structure");
  assert.strictEqual(r.delta, -6);
});

ok("every bucket's real movement negligible (<0.05) -> honest null, never forced", () => {
  const r = diffBreakdown({ trend: 10, structure: 8 }, { trend: 10.01, structure: 8.02 });
  assert.strictEqual(r, null);
});

ok("missing either real breakdown -> honest null", () => {
  assert.strictEqual(diffBreakdown(null, { trend: 10 }), null);
  assert.strictEqual(diffBreakdown({ trend: 10 }, null), null);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("OPPORTUNITY-SNAPSHOT-STORE TEST FAILED"); else console.log("OPPORTUNITY-SNAPSHOT-STORE TEST OK");
