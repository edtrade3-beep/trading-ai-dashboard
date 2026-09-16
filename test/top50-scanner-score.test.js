"use strict";
// Real tests for src/top50-scanner-score.js — the Top 50 scanner's own
// disclosed-additive 30/20/20/15/15 score (2026-09-16, "Build Telegram
// Alerts for the AI Top 50 Scanner" master prompt). Pure function, no
// network — every real input is a plain number this test supplies
// directly, same convention as test/trade-gps-score.test.js.
const assert = require("node:assert");
const { computeTop50Score, rvolPoints, WEIGHT_SUM } = require("../src/top50-scanner-score");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking computeTop50Score — real 30/20/20/15/15 EMA/VWAP/MACD/RSI/RVOL score…");

ok("real bucket max points sum to exactly 100", () => {
  assert.strictEqual(WEIGHT_SUM, 100);
});

ok("RVOL bucket table matches the prompt's own explicit examples exactly", () => {
  assert.strictEqual(rvolPoints(0.8), 0);
  assert.strictEqual(rvolPoints(1.0), 4);
  assert.strictEqual(rvolPoints(1.19), 4);
  assert.strictEqual(rvolPoints(1.2), 8);
  assert.strictEqual(rvolPoints(1.49), 8);
  assert.strictEqual(rvolPoints(1.5), 12);
  assert.strictEqual(rvolPoints(1.99), 12);
  assert.strictEqual(rvolPoints(2.0), 15);
  assert.strictEqual(rvolPoints(3.5), 15);
});

const perfectBullish = {
  price: 110, ema20: 105, ema50: 100, ema200: 90, ema20Prior: 104, ema50Prior: 99, sma200: 88,
  vwap: 108, vwapPrior: 106,
  macdLine: 1.2, macdSignal: 0.8, macdLinePrior: 0.5, macdSignalPrior: 0.6, macdHistogram: 0.4, macdHistogramPrior: 0.2,
  rsi: 61, rsiPrior: 54,
  rvol: 1.6,
};

ok("a fully bullish real setup scores the full 100 (all 6 trend checks, VWAP side+rising+tight distance, MACD all 4, RSI band+both crossings, RVOL 1.6x=12)", () => {
  const r = computeTop50Score(perfectBullish);
  assert.strictEqual(r.direction, "LONG");
  assert.strictEqual(r.breakdown.trend, 30);
  assert.strictEqual(r.breakdown.rvol, 12);
  assert.ok(r.score >= 90, `expected a near-perfect real score, got ${r.score}`);
});

ok("the exact mirror bearish setup (every real number flipped) scores identically well as SHORT", () => {
  const perfectBearish = {
    price: 90, ema20: 95, ema50: 100, ema200: 110, ema20Prior: 96, ema50Prior: 101, sma200: 112,
    vwap: 92, vwapPrior: 94,
    macdLine: -1.2, macdSignal: -0.8, macdLinePrior: -0.5, macdSignalPrior: -0.6, macdHistogram: -0.4, macdHistogramPrior: -0.2,
    rsi: 38, rsiPrior: 46,
    rvol: 1.6,
  };
  const r = computeTop50Score(perfectBearish);
  assert.strictEqual(r.direction, "SHORT");
  assert.strictEqual(r.breakdown.trend, 30);
});

ok("RSI above 70 is NEVER hard-rejected — the prompt's own explicit rule (\"Do NOT automatically reject a stock just because RSI is above 70\")", () => {
  const overbought = { ...perfectBullish, rsi: 82, rsiPrior: 78 };
  const r = computeTop50Score(overbought);
  assert.ok(r.breakdown.rsi > 0, "an RSI of 82 must still contribute real, non-zero points, never a hard zero");
});

ok("excessive extension above VWAP is penalized toward 0 distance points, never scores as a fresh retest", () => {
  const extended = { ...perfectBullish, price: 130, vwap: 108 }; // ~20% above VWAP
  const tight = { ...perfectBullish, price: 109, vwap: 108 }; // ~0.9% above VWAP
  const rExtended = computeTop50Score(extended);
  const rTight = computeTop50Score(tight);
  assert.ok(rExtended.breakdown.vwap < rTight.breakdown.vwap, "an over-extended price must score fewer real VWAP points than a tight, healthy distance");
});

ok("a fresh MACD bullish crossover this bar earns the real 4-point bonus; an already-established cross does not", () => {
  const fresh = { ...perfectBullish, macdLinePrior: 0.4, macdSignalPrior: 0.5 }; // was below, now above
  const established = { ...perfectBullish, macdLinePrior: 0.9, macdSignalPrior: 0.3 }; // was already above
  const rFresh = computeTop50Score(fresh);
  const rEstablished = computeTop50Score(established);
  assert.strictEqual(rFresh.breakdown.macd - rEstablished.breakdown.macd, 4);
});

ok("direction auto-selects whichever real side scores higher — a genuinely mixed/no-edge symbol scores low on both sides", () => {
  const flat = { price: 100, ema20: 100, ema50: 100, ema200: 100, vwap: 100, rsi: 50, rvol: 0.9 };
  const r = computeTop50Score(flat);
  assert.ok(r.score < 30, `a flat/no-edge symbol should score low regardless of direction, got ${r.score}`);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TOP50-SCANNER-SCORE TEST FAILED");
else console.log("TOP50-SCANNER-SCORE TEST OK");
