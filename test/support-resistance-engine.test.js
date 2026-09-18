"use strict";
// support-resistance-engine.test.js (2026-09-18, "BUILD THE CANONICAL
// QUANT ENGINE FOR AI TRADE DESK" master prompt, "SUPPORT / RESISTANCE
// ENGINE") — real pure-function tests over hand-crafted OHLCV bars and
// synthetic candidate lists. No network.
const assert = require("node:assert");
const {
  computeSupportResistanceZones, clusterLevels, findSwingPoints, findGapLevels, confidenceFor,
} = require("../src/support-resistance-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

function bar(close, { high, low, volume = 1_000_000, time = 0 } = {}) {
  return { time, open: close, high: high ?? close * 1.01, low: low ?? close * 0.99, close, volume };
}

console.log("Checking clusterLevels — real multi-source grouping, evidence-count confidence…");

ok("independent real candidates within tolerance merge into one zone; the more DISTINCT sources agree, the higher the evidence count", () => {
  const candidates = [
    { price: 95.10, source: "EMA50" },
    { price: 95.60, source: "BREAKOUT_PIVOT" },
    { price: 96.00, source: "ANCHORED_VWAP" },
    { price: 95.80, source: "SWING_LOW" },
  ];
  const clusters = clusterLevels(candidates, 1.5);
  assert.strictEqual(clusters.length, 1, "the prompt's own $95-96 example — 4 close candidates should cluster into one real zone");
  assert.strictEqual(clusters[0].evidenceCount, 4);
  assert.ok(clusters[0].low <= 95.10 && clusters[0].high >= 96.00);
});

ok("candidates far apart do NOT merge — never fabricates agreement between unrelated levels", () => {
  const candidates = [{ price: 50, source: "EMA20" }, { price: 150, source: "EMA50" }];
  const clusters = clusterLevels(candidates, 1.5);
  assert.strictEqual(clusters.length, 2);
});

ok("two DIFFERENT swing lows landing near each other count as ONE real technical fact (deduped by source label), not double-counted evidence — matches the prompt's own 'independent evidence' framing (evidence TYPES, not raw point count)", () => {
  const candidates = [{ price: 100, source: "SWING_LOW" }, { price: 100.3, source: "SWING_LOW" }, { price: 100.1, source: "EMA20" }];
  const clusters = clusterLevels(candidates, 2);
  assert.strictEqual(clusters.length, 1);
  assert.strictEqual(clusters[0].evidenceCount, 2, "SWING_LOW counted once even though 2 raw points landed here, EMA20 counted once");
});

console.log("\nChecking confidenceFor — real, disclosed banding off evidence count…");

ok("1 source = WEAK, 2 = MODERATE, 3+ = STRONG — never a fabricated precision score", () => {
  assert.strictEqual(confidenceFor(1), "WEAK");
  assert.strictEqual(confidenceFor(2), "MODERATE");
  assert.strictEqual(confidenceFor(3), "STRONG");
  assert.strictEqual(confidenceFor(5), "STRONG");
});

console.log("\nChecking findSwingPoints — real local-extrema structure, not a fabricated pattern…");

ok("finds a real swing low only when it's the lowest point within the real trailing/leading window on both sides", () => {
  const bars = [bar(100), bar(98), bar(95), bar(97), bar(99), bar(101), bar(103)];
  const lows = findSwingPoints(bars, 2, "low");
  assert.ok(lows.some((l) => l.index === 2 && l.price === bars[2].low), "the real lowest bar.low (index 2) must be detected as a swing low");
});

console.log("\nChecking findGapLevels — real gap boundaries, never invented ones…");

ok("detects a real gap up (today's low above yesterday's high) and reports the real boundary price", () => {
  const bars = [bar(100, { high: 101, low: 99, time: 0 }), bar(110, { high: 111, low: 105, time: 1 })];
  const gaps = findGapLevels(bars);
  assert.strictEqual(gaps.length, 1);
  assert.strictEqual(gaps[0].type, "GAP_UP");
  assert.strictEqual(gaps[0].price, 105); // the real gap boundary — today's low, not an invented midpoint
});

ok("no gap reported when today's range genuinely overlaps yesterday's — never a fabricated gap", () => {
  const bars = [bar(100, { high: 101, low: 99 }), bar(100.5, { high: 102, low: 99.5 })];
  assert.strictEqual(findGapLevels(bars).length, 0);
});

console.log("\nChecking computeSupportResistanceZones — the one real combined entry point…");

function makeTrendBars(n, startPrice = 100, dailyPct = 0.3) {
  const bars = [];
  let price = startPrice;
  for (let i = 0; i < n; i += 1) {
    price = price * (1 + dailyPct / 100) + Math.sin(i / 5) * 0.3;
    bars.push(bar(price, { high: price + 1, low: price - 1, time: i, volume: 1_000_000 + (i % 15 === 0 ? 1_500_000 : 0) }));
  }
  return bars;
}

ok("honestly unavailable with too little real history — never a fabricated zone", () => {
  const r = computeSupportResistanceZones({ bars: [bar(100)], price: 100 });
  assert.strictEqual(r.available, false);
});

ok("real zones split correctly around the real current price — support strictly below, resistance strictly above", () => {
  const bars = makeTrendBars(220, 100, 0.3);
  const price = bars.at(-1).close;
  const r = computeSupportResistanceZones({ bars, price, pivot: price * 0.98, contractionLow: price * 0.9 });
  assert.strictEqual(r.available, true);
  for (const z of r.supportZones) assert.ok(z.high < price, `support zone ${z.high} must sit below price ${price}`);
  for (const z of r.resistanceZones) assert.ok(z.low > price, `resistance zone ${z.low} must sit above price ${price}`);
});

ok("a real breakout pivot/contraction low passed in by the caller is reused as a candidate, never recomputed independently", () => {
  const bars = makeTrendBars(220, 100, 0.3);
  const price = bars.at(-1).close;
  const withPivot = computeSupportResistanceZones({ bars, price, pivot: price * 0.95, contractionLow: price * 0.85 });
  const allZones = [...withPivot.supportZones, ...withPivot.resistanceZones];
  assert.ok(allZones.some((z) => z.sources.includes("BREAKOUT_PIVOT")), "the real passed-in pivot must appear as a real candidate source");
});

ok("tolerancePct scales with real ATR%, never one fixed percentage for every stock", () => {
  const quiet = makeTrendBars(220, 100, 0.05); // low daily drift -> low ATR
  const volatile = makeTrendBars(220, 100, 0.05).map((b, i) => ({ ...b, high: b.close + (i % 3 === 0 ? 6 : 1), low: b.close - (i % 3 === 0 ? 6 : 1) }));
  const rQuiet = computeSupportResistanceZones({ bars: quiet, price: quiet.at(-1).close });
  const rVolatile = computeSupportResistanceZones({ bars: volatile, price: volatile.at(-1).close });
  assert.ok(rVolatile.tolerancePct > rQuiet.tolerancePct, `expected a wider real tolerance for the more volatile stock, got quiet=${rQuiet.tolerancePct} volatile=${rVolatile.tolerancePct}`);
});

ok("nearestSupport/nearestResistance are the real closest zones to current price on each side, not just the first/last in an arbitrary order", () => {
  const bars = makeTrendBars(220, 100, 0.3);
  const price = bars.at(-1).close;
  const r = computeSupportResistanceZones({ bars, price, pivot: price * 0.98, contractionLow: price * 0.9 });
  if (r.nearestSupport) assert.ok(r.supportZones.every((z) => z.mid <= r.nearestSupport.mid), "nearestSupport must be the highest (closest-to-price) real support zone");
  if (r.nearestResistance) assert.ok(r.resistanceZones.every((z) => z.mid >= r.nearestResistance.mid), "nearestResistance must be the lowest (closest-to-price) real resistance zone");
});

console.log("\nChecking reuse discipline (source-inspection tripwire) — ONE ENGINE RULE…");

ok("support-resistance-engine.js reuses the real indicators.js EMA/VWAP/Donchian and atr-risk-engine.js's real ATR — never a second copy of any of them", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../src/support-resistance-engine"), "utf8");
  assert.match(src, /require\("\.\/indicators"\)/);
  assert.match(src, /require\("\.\/atr-risk-engine"\)/);
  assert.doesNotMatch(src, /function computeEMA|function computeVWAP|function computeDonchian|function computeATR|function atrAt/, "must not redeclare canonical indicator math");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("SUPPORT-RESISTANCE-ENGINE TEST FAILED");
else console.log("SUPPORT-RESISTANCE-ENGINE TEST OK");
