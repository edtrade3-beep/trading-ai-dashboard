// Real tests for the MTF Decision System's Phase 2 engines — src/mtf-swing-
// engine.js (4H SWING_SETUP), src/mtf-early-engine.js (1H EARLY_DEVELOPMENT
// slope/acceleration tracker), src/mtf-combiner.js (MTF_ALIGNMENT_SCORE).
// Same minimal style as test/smoke.js — no framework, calls the real
// exported functions against synthetic-but-realistic bar data.
// Run: node test/mtf-engine.test.js (or npm test).
const assert = require("node:assert");
const { computeSwingSetup } = require("../src/mtf-swing-engine");
const { computeSeriesTrend, computeEarlyDevelopment } = require("../src/mtf-early-engine");
const { computeMtfAlignment } = require("../src/mtf-combiner");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

// ── Synthetic 4H bar builder — a real uptrend with higher lows and
// contracting range near the end, the exact shape computeSwingSetup
// should read as STRONG/DEVELOPING. ──
function makeBars(count, { startPrice = 100, trendPerBar = 0.3, rangeSizePct = 3, contractFrom = null, breakdown = false } = {}) {
  const bars = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const rangePct = (contractFrom != null && i >= contractFrom) ? rangeSizePct * 0.3 : rangeSizePct;
    price += trendPerBar;
    const range = price * (rangePct / 100);
    const open = price - range / 2;
    const close = breakdown && i === count - 1 ? price - range * 3 : price + (i % 2 === 0 ? range * 0.1 : -range * 0.1);
    const high = Math.max(open, close) + range * 0.2;
    const low = Math.min(open, close) - range * 0.2;
    bars.push({ time: 1700000000000 + i * 14400000, open, high, low, close, volume: 1_000_000 * (1 + (i % 3) * 0.1) });
  }
  return bars;
}

console.log("Checking mtf-swing-engine.js (4H SWING_SETUP)…");
ok("computeSwingSetup: honest insufficient-data for too-short history", () => {
  const r = computeSwingSetup(makeBars(5));
  assert.strictEqual(r.dataInsufficient, true);
  assert.strictEqual(r.state, null);
});
ok("computeSwingSetup: real uptrend + contracting range/volume reads STRONG or DEVELOPING, never BROKEN/WEAK", () => {
  const bars = makeBars(40, { trendPerBar: 0.4, rangeSizePct: 3, contractFrom: 30 });
  const r = computeSwingSetup(bars);
  assert.ok(["STRONG", "DEVELOPING"].includes(r.state), `expected STRONG/DEVELOPING, got ${r.state}`);
  assert.ok(r.reasons.length > 0, "must always explain the read");
});
ok("computeSwingSetup: a real breakdown below a real swing-point support reads BROKEN", () => {
  // detectPriceAction's swing-point detector needs genuine local highs/
  // lows (a 5-bar window extremum) to establish real support — a
  // monotonic decline has none, so this needs an actual zigzag base
  // (real swing structure) before the crash, not just a downward trend.
  const bars = [];
  for (let i = 0; i < 30; i++) {
    const price = 100 + Math.sin(i / 3) * 5;
    const open = price - 0.5, close = price + 0.5;
    bars.push({ time: 1700000000000 + i * 14400000, open, high: Math.max(open, close) + 0.75, low: Math.min(open, close) - 0.75, close, volume: 1_000_000 });
  }
  const last = bars[bars.length - 1];
  bars[bars.length - 1] = { ...last, close: last.close - 15, low: last.low - 15 };
  const r = computeSwingSetup(bars);
  assert.strictEqual(r.state, "BROKEN");
});

console.log("Checking mtf-early-engine.js (1H EARLY_DEVELOPMENT)…");
ok("computeSeriesTrend: honest null for too few samples", () => {
  const r = computeSeriesTrend([1, 2]);
  assert.strictEqual(r.direction, null);
});
ok("computeSeriesTrend: real accelerating uptrend (0.2, 0.5, 0.9, 1.5) detected as up + accelerating", () => {
  const r = computeSeriesTrend([0.2, 0.5, 0.9, 1.5]);
  assert.strictEqual(r.direction, "up");
  assert.strictEqual(r.accelerating, true);
});
ok("computeSeriesTrend: real deteriorating momentum (3.0, 2.0, 1.0, 0.2) detected as down", () => {
  const r = computeSeriesTrend([3.0, 2.0, 1.0, 0.2]);
  assert.strictEqual(r.direction, "down");
});
ok("computeSeriesTrend: flat series (RS 90, 90.2, 89.9, 90.1) reads flat, not a fabricated trend", () => {
  const r = computeSeriesTrend([90, 90.2, 89.9, 90.1]);
  assert.strictEqual(r.direction, "flat");
});
ok("computeEarlyDevelopment: honest insufficient-data with no bars/indicators", () => {
  const r = computeEarlyDevelopment({ bars: [], indicators: null });
  assert.strictEqual(r.dataInsufficient, true);
  assert.strictEqual(r.score, null);
});
ok("computeEarlyDevelopment: real improving RSI/volume/EMA-stack series scores meaningfully above 50", () => {
  const bars = makeBars(30, { trendPerBar: 0.5 }).map((b, i) => ({ ...b, volume: 500_000 + i * 60_000 }));
  const rsi = [40, 45, 50, 55, 60].map((v, i) => ({ time: bars[bars.length - 5 + i].time, value: v }));
  const ema9 = bars.slice(-5).map((b, i) => ({ time: b.time, value: b.close + i * 0.3 }));
  const ema21 = bars.slice(-5).map((b) => ({ time: b.time, value: b.close - 1 }));
  const r = computeEarlyDevelopment({ bars, indicators: { rsi, ema9, ema21 } });
  assert.ok(r.score > 50, `expected score > 50 for improving series, got ${r.score}`);
  assert.ok(r.reasons.some((x) => /improving|increasing|widening/i.test(x)), "must explain what's improving");
});

console.log("Checking mtf-combiner.js (MTF_ALIGNMENT_SCORE)…");
ok("computeMtfAlignment: honest null score when nothing is known", () => {
  const r = computeMtfAlignment({});
  assert.strictEqual(r.score, null);
  assert.strictEqual(r.knownCount, 0);
});
ok("computeMtfAlignment: unavailable timeframes renormalize weight, don't drag score toward neutral", () => {
  const r = computeMtfAlignment({ "1D": "BULLISH" });
  assert.strictEqual(r.score, 100, "single known bullish timeframe should read fully bullish, not diluted by unknowns");
});
ok("computeMtfAlignment: all-bullish alignment (1D/4H/1H bullish, 15M not confirmed yet) is NOT flagged as a conflict — this is the spec's own 'wait for 15M confirmation' example, a normal in-progress state", () => {
  const r = computeMtfAlignment({ "1D": "BULLISH", "4H": "STRONG", "1H": 80, "15M": "NOT_READY" });
  assert.strictEqual(r.conflicts.length, 0, "NOT_READY 15M under a bullish higher-TF stack must not read as a conflict");
});
ok("computeMtfAlignment: real higher-vs-lower timeframe disagreement (1D/4H bearish, 1H/15M bullish) IS flagged, higher timeframe named as authoritative", () => {
  const r = computeMtfAlignment({ "1D": "BEARISH", "4H": "BROKEN", "1H": 90, "15M": "CONFIRMED" });
  assert.ok(r.conflicts.length > 0, "must detect the real conflict");
  assert.strictEqual(r.conflictNote.includes("1D"), true, "must name the higher-authority timeframe in the explanation");
});
ok("computeMtfAlignment: a fully confirmed bullish stack across all 5 timeframes scores high with zero conflicts", () => {
  const r = computeMtfAlignment({ "1D": "BULLISH", "4H": "STRONG", "1H": 90, "15M": "CONFIRMED", "5M": true });
  assert.ok(r.score >= 85, `expected a high alignment score, got ${r.score}`);
  assert.strictEqual(r.conflicts.length, 0);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("MTF-ENGINE TEST FAILED"); else console.log("MTF-ENGINE TEST OK");
