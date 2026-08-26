// Real tests for src/data-freshness.js's computeDataFreshness (Phase 3,
// 2026-08-26, spec Part 2: "DATA QUALITY WARNING"). Pure-function,
// synthetic-input, zero-network. Run: node test/data-freshness.test.js
// (or npm test).
"use strict";
const assert = require("node:assert");
const { computeDataFreshness, DEFAULT_STALE_AFTER_MINUTES } = require("../src/data-freshness");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const NOW_MS = 1_800_000_000_000;
const secAgo = (min) => Math.round(NOW_MS / 1000) - min * 60;

console.log("Checking computeDataFreshness — real quote-age check, market-hours gated…");

ok("no quotes carry a real regularMarketTime -> honestly unchecked, never assumed fresh or stale", () => {
  const r = computeDataFreshness({ quotes: [{ symbol: "SPY" }], nowMs: NOW_MS, isMarketHours: true });
  assert.strictEqual(r.checked, false);
  assert.strictEqual(r.stale, false);
  assert.strictEqual(r.ageMinutes, null);
});

ok("a real quote 3 real minutes old during market hours is not stale", () => {
  const r = computeDataFreshness({ quotes: [{ symbol: "SPY", regularMarketTime: secAgo(3) }], nowMs: NOW_MS, isMarketHours: true });
  assert.strictEqual(r.checked, true);
  assert.strictEqual(r.ageMinutes, 3);
  assert.strictEqual(r.stale, false);
});

ok("a real quote 30 real minutes old during market hours IS stale", () => {
  const r = computeDataFreshness({ quotes: [{ symbol: "SPY", regularMarketTime: secAgo(30) }], nowMs: NOW_MS, isMarketHours: true });
  assert.strictEqual(r.ageMinutes, 30);
  assert.strictEqual(r.stale, true);
});

ok("the SAME 30-real-minute-old quote outside market hours is honestly NOT flagged stale (market being closed isn't a data problem)", () => {
  const r = computeDataFreshness({ quotes: [{ symbol: "SPY", regularMarketTime: secAgo(30) }], nowMs: NOW_MS, isMarketHours: false });
  assert.strictEqual(r.stale, false);
});

ok("the newest real timestamp across the batch is used, not an arbitrary one", () => {
  const r = computeDataFreshness({
    quotes: [{ symbol: "SPY", regularMarketTime: secAgo(30) }, { symbol: "QQQ", regularMarketTime: secAgo(2) }],
    nowMs: NOW_MS, isMarketHours: true,
  });
  assert.strictEqual(r.ageMinutes, 2);
  assert.strictEqual(r.stale, false);
});

ok("default staleness threshold is 15 real minutes", () => {
  assert.strictEqual(DEFAULT_STALE_AFTER_MINUTES, 15);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("DATA-FRESHNESS TEST FAILED"); else console.log("DATA-FRESHNESS TEST OK");
