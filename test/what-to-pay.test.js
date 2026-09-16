"use strict";
// Real tests for src/what-to-pay.js — "AI Trade Desk — Add 'What Price
// to Pay' to Every Stock" (2026-09-16). Pure function, no network; ATR
// comes from a real synthetic bars array (same computeAtrRiskLevels this
// codebase already uses elsewhere), everything else is a plain real
// input the caller supplies directly.
const assert = require("node:assert");
const { computeWhatToPay, computeConfirmation, MIN_CONFIRMATIONS } = require("../src/what-to-pay");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

// Real, stable synthetic bars — enough real history for a real ATR(14) read.
function makeBars(n, base = 500) {
  const bars = [];
  for (let i = 0; i < n; i++) {
    const c = base + Math.sin(i / 3) * 5;
    bars.push({ time: i, open: c, high: c + 4, low: c - 4, close: c, volume: 1_000_000 });
  }
  return bars;
}
const bars = makeBars(60, 500);

console.log("Checking computeWhatToPay — real zone/status derivation, no fabricated prices…");

ok("insufficient real bar history returns an honest unavailable result, never a fabricated zone", () => {
  const r = computeWhatToPay({ price: 500, pivot: 520, ema20: 490, ema50: 470, bars: [] });
  assert.strictEqual(r.available, false);
});

ok("WHAT TO PAY centers on a real EMA20 below price, widened by real ATR — never centered on an EMA that's ABOVE price (that wouldn't be a real discount)", () => {
  const r = computeWhatToPay({ price: 504, pivot: 525, ema20: 485, ema50: 460, contractionLow: 452, bars, tier: "ACTIONABLE", signalState: "ENTER_NOW" });
  assert.ok(r.whatToPay, "expected a real WHAT TO PAY zone");
  assert.ok(r.whatToPay.low < 485 && r.whatToPay.high > 485, "zone should straddle the real EMA20 center");
  assert.ok(r.whatToPay.high < 504, "the zone must be a real discount below current price");
});

ok("an EMA20 that's ABOVE current price (already extended) produces no real WHAT TO PAY zone rather than a fabricated one above price", () => {
  const r = computeWhatToPay({ price: 400, pivot: 420, ema20: 410, ema50: 380, bars, tier: "WAIT" });
  assert.strictEqual(r.whatToPay, null);
});

ok("STRONG BUY ZONE centers on the deeper of real EMA50/contractionLow, and sits at or below WHAT TO PAY, never overlapping it", () => {
  const r = computeWhatToPay({ price: 504, pivot: 525, ema20: 485, ema50: 460, contractionLow: 452, bars, tier: "ACTIONABLE" });
  assert.ok(r.strongBuyZone, "expected a real STRONG BUY ZONE");
  assert.ok(r.strongBuyZone.high <= r.whatToPay.low, "STRONG BUY ZONE must never overlap/exceed WHAT TO PAY");
});

ok("DON'T CHASE ABOVE is derived from the real pivot × atr-risk-engine.js's own ANTI_CHASE_DEFAULTS.extendedMax (8%) — same real threshold, not a second number", () => {
  const r = computeWhatToPay({ price: 504, pivot: 500, ema20: 485, ema50: 460, bars, tier: "ACTIONABLE" });
  assert.strictEqual(r.dontChaseAbove, Math.round(500 * 1.08 * 100) / 100);
});

ok("price above DON'T CHASE ABOVE always reads EXTENDED — DON'T CHASE, regardless of confirmation or tier", () => {
  const r = computeWhatToPay({
    price: 560, pivot: 500, ema20: 485, ema50: 460, bars, tier: "ACTIONABLE", signalState: "ENTER_NOW",
    higherLows: true, supportHolding: true, rsi: 60, rsiPrior: 50, macdHistogram: 1, macdHistogramPrior: 0.5, aboveVwap: true, rvol: 2,
  });
  assert.strictEqual(r.priceStatus, "EXTENDED — DON'T CHASE");
});

ok("price in the real WHAT TO PAY zone with real confirmation AND execution-ready tier reads ENTRY CONFIRMED", () => {
  const r = computeWhatToPay({
    price: 485, pivot: 525, ema20: 485, ema50: 460, contractionLow: 452, bars, tier: "ACTIONABLE", signalState: "ENTER_NOW",
    higherLows: true, supportHolding: true, rsi: 55, rsiPrior: 48, macdHistogram: 0.5, macdHistogramPrior: 0.2, aboveVwap: true, rvol: 1.5,
  });
  assert.strictEqual(r.priceStatus, "ENTRY CONFIRMED");
});

ok("SIGNAL LIFECYCLE SAFETY — the exact same attractive, confirmed price NEVER reads ENTRY CONFIRMED when the real canonical tier is WAIT, even though every price/confirmation signal is identical", () => {
  const r = computeWhatToPay({
    price: 485, pivot: 525, ema20: 485, ema50: 460, contractionLow: 452, bars, tier: "WAIT", signalState: "SCANNING",
    higherLows: true, supportHolding: true, rsi: 55, rsiPrior: 48, macdHistogram: 0.5, macdHistogramPrior: 0.2, aboveVwap: true, rvol: 1.5,
  });
  assert.notStrictEqual(r.priceStatus, "ENTRY CONFIRMED");
  assert.strictEqual(r.priceStatus, "IN BUY ZONE");
});

ok("SIGNAL LIFECYCLE SAFETY — tier EXTENDED (real anti-chase gate) also blocks ENTRY CONFIRMED even with an attractive real price and full confirmation", () => {
  const r = computeWhatToPay({
    price: 452, pivot: 525, ema20: 485, ema50: 460, contractionLow: 452, bars, tier: "EXTENDED", signalState: "SCANNING",
    higherLows: true, supportHolding: true, rsi: 55, rsiPrior: 48, macdHistogram: 0.5, macdHistogramPrior: 0.2, aboveVwap: true, rvol: 1.5,
  });
  assert.strictEqual(r.priceStatus, "STRONG BUY ZONE");
});

ok("price in the zone WITHOUT enough real confirmation signals reads the unconfirmed status, not ENTRY CONFIRMED", () => {
  const r = computeWhatToPay({
    price: 485, pivot: 525, ema20: 485, ema50: 460, contractionLow: 452, bars, tier: "ACTIONABLE", signalState: "ENTER_NOW",
    higherLows: false, supportHolding: false, rsi: 45, rsiPrior: 48, macdHistogram: -0.5, macdHistogramPrior: 0.2, aboveVwap: false, rvol: 0.8,
  });
  assert.strictEqual(r.priceStatus, "IN BUY ZONE");
});

ok("price just above the zone (within 3%) reads APPROACHING BUY ZONE; further away reads WAIT FOR PRICE", () => {
  const near = computeWhatToPay({ price: 495, pivot: 525, ema20: 485, ema50: 460, contractionLow: 452, bars, tier: "ACTIONABLE" });
  const far = computeWhatToPay({ price: 550, pivot: 610, ema20: 485, ema50: 460, contractionLow: 452, bars, tier: "ACTIONABLE" });
  assert.strictEqual(near.priceStatus, "APPROACHING BUY ZONE");
  assert.strictEqual(far.priceStatus, "WAIT FOR PRICE");
});

ok("distancePct is 0 once price is inside the zone, and a real positive number above it", () => {
  const inZone = computeWhatToPay({ price: 485, pivot: 525, ema20: 485, ema50: 460, contractionLow: 452, bars, tier: "ACTIONABLE" });
  const above = computeWhatToPay({ price: 504, pivot: 525, ema20: 485, ema50: 460, contractionLow: 452, bars, tier: "ACTIONABLE" });
  assert.strictEqual(inZone.distancePct, 0);
  assert.ok(above.distancePct > 0);
});

ok("SIGNAL LIFECYCLE SAFETY — fail-closed: an unknown/missing real tier (e.g. a symbol outside the canonical scan's universe) never defaults to execution-ready — only the real ACTIONABLE tier allows ENTRY CONFIRMED", () => {
  const r = computeWhatToPay({
    price: 485, pivot: 525, ema20: 485, ema50: 460, contractionLow: 452, bars, tier: undefined,
    higherLows: true, supportHolding: true, rsi: 55, rsiPrior: 48, macdHistogram: 0.5, macdHistogramPrior: 0.2, aboveVwap: true, rvol: 1.5,
  });
  assert.notStrictEqual(r.priceStatus, "ENTRY CONFIRMED");
});

console.log("\nChecking computeConfirmation — real, disclosed multi-signal threshold, never a single indicator deciding alone…");

ok(`requires at least ${MIN_CONFIRMATIONS} of the 7 real checks — a single bullish signal alone is not enough`, () => {
  const r = computeConfirmation({ higherLows: true, rsi: 60, rsiPrior: 50 }); // only 2 real checks true
  assert.strictEqual(r.count, 2);
  assert.strictEqual(r.passed, false);
});

ok("no real decision engine duplicated — this file never recomputes entry/stop/target/riskReward, only reads real ATR for zone width", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../src/what-to-pay"), "utf8");
  assert.doesNotMatch(src, /riskReward:\s*Number/, "must not compute a second riskReward");
  assert.match(src, /deliberately NOT recomputed here/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("WHAT-TO-PAY TEST FAILED");
else console.log("WHAT-TO-PAY TEST OK");
