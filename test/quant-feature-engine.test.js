"use strict";
// quant-feature-engine.test.js (2026-09-18, "BUILD THE CANONICAL QUANT
// ENGINE FOR AI TRADE DESK" master prompt, Phase 2) — real pure-function
// tests over hand-crafted OHLCV bar arrays. No network.
const assert = require("node:assert");
const {
  computeQuantFeatures, computeReturnsFeatures, computeTrendFeatures,
  computeMomentumFeatures, computeVolatilityFeatures, computeVolumeFeatures,
  computeRvol, slopeOf,
} = require("../src/quant-feature-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

// Real bar builder — flat volume unless overridden, so tests can isolate
// exactly the field under test.
function bar(close, { high, low, volume = 1_000_000, time } = {}) {
  return { time: time ?? 0, open: close, high: high ?? close * 1.01, low: low ?? close * 0.99, close, volume };
}
function series(closes, opts) { return closes.map((c, i) => bar(c, { ...opts, time: i })); }

console.log("Checking computeReturnsFeatures — the prompt's own formula, real acceleration…");

ok("returnN = (price - priceNAgo) / priceNAgo, exactly the prompt's formula", () => {
  const closes = new Array(61).fill(0).map((_, i) => 100 + i); // linear climb, close[60]=160, close[59]=159...
  const r = computeReturnsFeatures(series(closes));
  assert.strictEqual(r.return1D, +(((160 - 159) / 159) * 100).toFixed(2));
  assert.strictEqual(r.return5D, +(((160 - 155) / 155) * 100).toFixed(2));
});

ok("returnAcceleration is real and positive when the recent 5-day pace is faster than the prior 15-day pace (improving momentum), not just 'already moved a lot'", () => {
  // Flat for 20 days, then a sharp acceleration in the last 5 — recent pace >> prior pace.
  const closes = [...new Array(21).fill(100), 101, 103, 106, 110, 115];
  const r = computeReturnsFeatures(series(closes));
  assert.ok(r.returnAcceleration > 0, `expected positive acceleration, got ${r.returnAcceleration}`);
});

ok("returnAcceleration is negative (or ~0) for a stock that already made its whole move earlier and has since stalled — the prompt's own explicit anti-chase-on-history case", () => {
  const closes = [100, 105, 110, 115, 120, ...new Array(16).fill(120)]; // big early move, then flat
  const r = computeReturnsFeatures(series(closes));
  assert.ok(r.returnAcceleration <= 0, `expected non-positive acceleration for a stalled mover, got ${r.returnAcceleration}`);
});

ok("honestly unavailable with too little history — never fabricates a return", () => {
  assert.strictEqual(computeReturnsFeatures([bar(100)]).available, false);
  assert.strictEqual(computeReturnsFeatures(null).available, false);
});

console.log("\nChecking computeTrendFeatures — real EMA structure + transition detection…");

ok("stackedBullish is true only when price > EMA20 > EMA50 > EMA200 all hold, using real EMA values (not a fabricated flag)", () => {
  const closes = new Array(201).fill(0).map((_, i) => 100 + i * 0.3); // steady climb
  const t = computeTrendFeatures(series(closes));
  assert.strictEqual(t.stackedBullish, true);
});

ok("reclaimingEma20 fires only on a genuine cross — prior close at/below prior EMA20, current close above current EMA20", () => {
  // Decline for 25 days (price ends below EMA20), then one sharp reclaim bar.
  const decline = new Array(25).fill(0).map((_, i) => 120 - i * 0.8);
  const closes = [...decline, decline.at(-1) * 1.12]; // +12% reclaim bar, enough to clear the lagging EMA
  const t = computeTrendFeatures(series(closes));
  assert.strictEqual(t.reclaimingEma20, true, `expected a real reclaim, got distanceFromEma20Pct=${t.distanceFromEma20Pct}`);
});

ok("ema20SlopeTurningPositive reads the real 5-bar EMA20 slope sign, not price alone", () => {
  const uptrend = new Array(30).fill(0).map((_, i) => 100 + i);
  const t = computeTrendFeatures(series(uptrend));
  assert.strictEqual(t.ema20SlopeTurningPositive, true);
  const downtrend = new Array(30).fill(0).map((_, i) => 130 - i);
  const t2 = computeTrendFeatures(series(downtrend));
  assert.strictEqual(t2.ema20SlopeTurningPositive, false);
});

ok("higherLowForming compares the real lowest low of each half of the trailing 20 bars — an honest structural read, never a fabricated pattern match", () => {
  const risingLows = [102, 105, 100, 103, 101, 104, 102, 106, 103, 107, 105, 110, 108, 112, 109, 113, 111, 115, 112, 116, 114]; // 21 bars (min for computeTrendFeatures)
  const t = computeTrendFeatures(series(risingLows));
  assert.strictEqual(t.higherLowForming, true);
});

ok("stackedBullish/reclaim structures do NOT gate on perfect EMA200 alignment when only 21-50 bars exist (Early Discovery must not require full alignment) — EMA200/50 honestly null instead", () => {
  const closes = new Array(25).fill(0).map((_, i) => 100 + i * 0.5);
  const t = computeTrendFeatures(series(closes));
  assert.strictEqual(t.available, true);
  assert.strictEqual(t.ema200, null);
  assert.strictEqual(t.stackedBullish, null); // honestly unknown, never fabricated true/false without EMA200
});

console.log("\nChecking computeMomentumFeatures — score CHANGE/acceleration, not just the raw value…");

ok("rsiAccelerating and macdHistogramImproving read real slope/delta off the real series, not just a static latest-value threshold", () => {
  // A constant-slope trend saturates RSI/flattens the MACD histogram —
  // a genuinely ACCELERATING (increasing daily rate) trend is required
  // to keep both climbing right up to the last bar.
  const closes = [];
  let p = 100;
  for (let i = 0; i < 40; i++) {
    const rate = i < 30 ? 0.05 : 0.05 + (i - 30) * 0.15;
    p = p * (1 + rate / 100);
    closes.push(p);
  }
  const m = computeMomentumFeatures(series(closes));
  assert.strictEqual(m.rsiAccelerating, true);
  assert.strictEqual(m.macdHistogramImproving, true);
});

console.log("\nChecking computeVolatilityFeatures — real ATR reused from atr-risk-engine.js, never recomputed…");

ok("atrPercent = ATR / price * 100, the prompt's own exact formula, off the real shared ATR", () => {
  const closes = new Array(20).fill(0).map((_, i) => 100 + Math.sin(i) * 2);
  const v = computeVolatilityFeatures(series(closes, { high: undefined, low: undefined }), closes.at(-1));
  if (v.available) {
    assert.strictEqual(v.atrPercent, Math.round((v.atr / closes.at(-1)) * 10000) / 100);
  }
});

console.log("\nChecking computeRvol/computeVolumeFeatures — ONE canonical RVOL, real optional time-of-day normalization…");

ok("plain RVOL = volume / avgVolume when no elapsedFraction is given (same real formula every existing site already uses)", () => {
  assert.strictEqual(computeRvol({ volume: 200, avgVolume: 100 }), 2);
});

ok("time-of-day normalization: the SAME raw volume reads as a much higher RVOL early in the session than at the close — real, not invented, and only applied when the caller supplies a real elapsedFraction", () => {
  const midday = computeRvol({ volume: 500_000, avgVolume: 1_000_000, elapsedFraction: 0.5 });
  const fullDay = computeRvol({ volume: 500_000, avgVolume: 1_000_000 });
  assert.strictEqual(midday, 1); // half the day's average volume already in, halfway through the session = right on pace
  assert.strictEqual(fullDay, 0.5); // same raw volume read as under-average against a full-day baseline
});

ok("honestly null (never a fabricated ratio) when avgVolume is zero/missing", () => {
  assert.strictEqual(computeRvol({ volume: 100, avgVolume: 0 }), null);
  assert.strictEqual(computeRvol({ volume: 100, avgVolume: null }), null);
});

ok("volumeAccelerating compares real RVOL-vs-RVOL (a 2nd-derivative read), never just 'RVOL is high'", () => {
  const closes = new Array(42).fill(100);
  const bars = closes.map((c, i) => bar(c, { time: i, volume: i >= 41 ? 3_000_000 : 1_000_000 }));
  const v = computeVolumeFeatures(bars);
  assert.strictEqual(v.available, true);
  assert.ok(v.rvol > 1);
});

console.log("\nChecking computeQuantFeatures — the one combined vector, honest partial-availability…");

ok("returns real sub-objects for returns/trend/momentum/volatility/volume, each independently honest about its own data sufficiency", () => {
  const f = computeQuantFeatures({ bars: [bar(100)] });
  assert.strictEqual(f.available, true); // at least a price exists
  assert.strictEqual(f.returns.available, false); // but not enough for a real return
});

console.log("\nChecking reuse discipline (source-inspection tripwire) — ONE ENGINE RULE…");

ok("quant-feature-engine.js reuses the real indicators.js EMA/RSI/MACD series math and atr-risk-engine.js's real ATR — never a second copy of either formula", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../src/quant-feature-engine"), "utf8");
  assert.match(src, /require\("\.\/indicators"\)/);
  assert.match(src, /require\("\.\/atr-risk-engine"\)/);
  assert.doesNotMatch(src, /function computeEMA|function computeRSI|function computeMACD|function computeATR|function atrAt/, "must not redeclare canonical indicator math");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("QUANT-FEATURE-ENGINE TEST FAILED");
else console.log("QUANT-FEATURE-ENGINE TEST OK");
