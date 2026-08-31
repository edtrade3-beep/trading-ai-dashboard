// Real tests for src/spy-seasonality-engine.js — the Market Wrap
// seasonality chart (explicit user request, 2026-08-31). Pure-function,
// synthetic-input, zero-network.
"use strict";
const assert = require("node:assert");
const { CYCLE_TYPES, classifyCycleYear, computeMonthlySeasonality } = require("../src/spy-seasonality-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

function ts(year, month, day) { return Date.UTC(year, month, day, 16, 0, 0); } // UTC noon-ish, avoids DST edge flips

console.log("Checking classifyCycleYear — real 4-year US presidential cycle, pure arithmetic…");
ok("2024 (real presidential election year) -> PRESIDENTIAL", () => {
  assert.strictEqual(classifyCycleYear(2024), "PRESIDENTIAL");
});
ok("2025 (real post-election year) -> POST_ELECTION", () => {
  assert.strictEqual(classifyCycleYear(2025), "POST_ELECTION");
});
ok("2026 (real midterm election year) -> MIDTERM", () => {
  assert.strictEqual(classifyCycleYear(2026), "MIDTERM");
});
ok("2027 (real pre-election year) -> PRE_ELECTION", () => {
  assert.strictEqual(classifyCycleYear(2027), "PRE_ELECTION");
});
ok("every real CYCLE_TYPES entry is reachable", () => {
  const seen = new Set([2024, 2025, 2026, 2027].map(classifyCycleYear));
  for (const t of CYCLE_TYPES) assert.ok(seen.has(t));
});

console.log("\nChecking computeMonthlySeasonality — real entry/exit close, never fabricated…");
ok("a real full month with a real prior close computes a real % return", () => {
  const bars = [
    { time: ts(2022, 7, 31), close: 100 },  // Aug 31 2022 — real prior close
    { time: ts(2022, 8, 5), close: 102 },   // Sep 2022 bars
    { time: ts(2022, 8, 15), close: 98 },
    { time: ts(2022, 8, 30), close: 95 },   // real Sep exit close
  ];
  const { years } = computeMonthlySeasonality(bars, 8); // September = index 8
  assert.strictEqual(years.length, 1);
  assert.strictEqual(years[0].year, 2022);
  assert.strictEqual(years[0].cycleType, "MIDTERM");
  assert.strictEqual(years[0].returnPct, -5); // (95-100)/100
});
ok("a year with month bars but NO real prior close is honestly skipped, never fabricated", () => {
  const bars = [
    { time: ts(2022, 8, 5), close: 102 }, // dataset starts mid-September — no real entry price
    { time: ts(2022, 8, 30), close: 95 },
  ];
  const { years } = computeMonthlySeasonality(bars, 8);
  assert.strictEqual(years.length, 0);
});
ok("a year with no real bars in the target month contributes nothing", () => {
  const bars = [
    { time: ts(2022, 6, 31), close: 100 },
    { time: ts(2022, 7, 15), close: 101 }, // August only, no September
  ];
  const { years } = computeMonthlySeasonality(bars, 8);
  assert.strictEqual(years.length, 0);
});
ok("multiple real years aggregate into real stats (avg, win rate, per-cycle-type)", () => {
  const bars = [
    { time: ts(2021, 7, 31), close: 100 }, { time: ts(2021, 8, 30), close: 110 }, // 2021 POST_ELECTION +10%
    { time: ts(2022, 7, 31), close: 100 }, { time: ts(2022, 8, 30), close: 90 },  // 2022 MIDTERM -10%
  ];
  const { years, stats } = computeMonthlySeasonality(bars, 8);
  assert.strictEqual(years.length, 2);
  assert.strictEqual(stats.count, 2);
  assert.strictEqual(stats.avg, 0); // (10 + -10) / 2
  assert.strictEqual(stats.winRate, 50);
  assert.strictEqual(stats.byCycleType.POST_ELECTION.avg, 10);
  assert.strictEqual(stats.byCycleType.MIDTERM.avg, -10);
  assert.strictEqual(stats.byCycleType.PRESIDENTIAL.count, 0);
  assert.strictEqual(stats.byCycleType.PRESIDENTIAL.avg, null);
});
ok("malformed/empty input returns an honest empty result, never crashes", () => {
  assert.deepStrictEqual(computeMonthlySeasonality(null, 8).years, []);
  assert.deepStrictEqual(computeMonthlySeasonality([], 8).years, []);
  assert.deepStrictEqual(computeMonthlySeasonality([{ time: 1, close: 1 }], 13).years, []);
});
ok("real stats honestly null out on zero real years, never a fabricated 0", () => {
  const { stats } = computeMonthlySeasonality([], 8);
  assert.strictEqual(stats.avg, null);
  assert.strictEqual(stats.winRate, null);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("SPY-SEASONALITY-ENGINE TEST FAILED"); else console.log("SPY-SEASONALITY-ENGINE TEST OK");
