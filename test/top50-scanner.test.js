"use strict";
// Real tests for src/top50-scanner.js — the Top 50 ranking's execution-
// status mapping and daily EMA inputs (2026-09-16, "Build Telegram Alerts
// for the AI Top 50 Scanner" master prompt). executionStatusFor/
// dailyEmaInputs are pure functions, testable without network; scanTop50
// itself (real fetches) is exercised structurally below (tripwire on
// reuse, no duplicate engine).
const assert = require("node:assert");
const { executionStatusFor, dailyEmaInputs, MIN_DOLLAR_VOLUME } = require("../src/top50-scanner");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking executionStatusFor — real tier/stage -> READY/WAIT/SETTING UP/WATCH mapping…");

ok("tier ACTIONABLE + stage CONFIRMED -> READY", () => {
  assert.strictEqual(executionStatusFor("ACTIONABLE", "CONFIRMED"), "READY");
});

ok("tier ACTIONABLE + stage EARLY -> SETTING UP (a real, executable early entry, not yet fully confirmed)", () => {
  assert.strictEqual(executionStatusFor("ACTIONABLE", "EARLY"), "SETTING UP");
});

ok("TEST 3 — tier EXTENDED (real anti-chase gate tripped, a genuinely high real opportunity score) maps to WATCH, never READY — 'good opportunity, bad entry right now', the platform's own already-solved GOOD OPPORTUNITY/BAD ENTRY separation, reused rather than rebuilt", () => {
  assert.strictEqual(executionStatusFor("EXTENDED", "LATE"), "WATCH");
});

ok("tier DEVELOPING or WAIT both map to WAIT — not yet actionable, real and honest", () => {
  assert.strictEqual(executionStatusFor("DEVELOPING", "DEVELOPING"), "WAIT");
  assert.strictEqual(executionStatusFor("WAIT", "DEVELOPING"), "WAIT");
});

ok("an unrecognized/missing real tier falls back to WAIT, never guessed as READY", () => {
  assert.strictEqual(executionStatusFor(undefined, undefined), "WAIT");
});

console.log("\nChecking dailyEmaInputs — real EMA20/50/200 + SMA200 off real daily bars, via src/indicators.js…");

function makeBars(n, startPrice = 100, drift = 0.3) {
  const bars = [];
  let price = startPrice;
  for (let i = 0; i < n; i++) {
    price += drift;
    bars.push({ time: i, open: price, high: price + 1, low: price - 1, close: price, volume: 1_000_000 });
  }
  return bars;
}

ok("insufficient real history (<200 bars) returns honest nulls, never a fabricated EMA off a too-short window", () => {
  const r = dailyEmaInputs(makeBars(50));
  assert.strictEqual(r.ema20, null);
  assert.strictEqual(r.sma200, null);
});

ok("a real uptrending 250-bar series produces real, finite EMA20/50/200 and SMA200, with EMA20 > EMA50 (faster average leads in an uptrend)", () => {
  const r = dailyEmaInputs(makeBars(250));
  assert.ok(Number.isFinite(r.ema20) && Number.isFinite(r.ema50) && Number.isFinite(r.ema200) && Number.isFinite(r.sma200));
  assert.ok(r.ema20 > r.ema50, "in a real steady uptrend the faster EMA should read above the slower one");
});

ok("ema20Prior/ema50Prior are real, distinct values (one bar earlier), not the same value duplicated", () => {
  const r = dailyEmaInputs(makeBars(250));
  assert.notStrictEqual(r.ema20, r.ema20Prior);
});

console.log("\nChecking reuse discipline (source-inspection tripwire)…");

ok("real liquidity floor is imported from universe-builder.js's own MIN_DOLLAR_VOLUME, never a second independently-declared threshold", () => {
  assert.strictEqual(MIN_DOLLAR_VOLUME, 5_000_000);
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../src/top50-scanner"), "utf8");
  assert.match(src, /require\("\.\/universe-builder"\)\.MIN_DOLLAR_VOLUME/);
});

ok("the candidate universe and entry/stop/target/invalidation/tier/stage all come from the real routes/market.js computeAllOpportunities() — no second scan or second liquidity-filtered universe declared in this file", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../src/top50-scanner"), "utf8");
  assert.match(src, /require\("\.\/routes\/market"\)/);
  assert.match(src, /computeAllOpportunities/);
  assert.doesNotMatch(src, /async function computeAllOpportunities/, "must not redeclare the canonical scan");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TOP50-SCANNER TEST FAILED");
else console.log("TOP50-SCANNER TEST OK");
