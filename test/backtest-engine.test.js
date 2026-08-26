// Real tests for the MTF Decision System's historical backtest (Task #112,
// 2026-08-20): src/backtest-regime.js, src/backtest-trend-template.js,
// src/backtest-engine.js. All synthetic-bar, zero-network — same discipline
// as test/mtf-engine.test.js and test/atr-risk-engine.test.js (pure-function
// unit tests; runBacktest/runBacktestUniverse themselves hit real Yahoo/
// Alpaca fetches and are exercised via live verification, not this file).
// Run: node test/backtest-engine.test.js (or npm test).
const assert = require("node:assert");
const { classifyRegimeSeries, regimeAt } = require("../src/backtest-regime");
const { computeTrendTemplateAt } = require("../src/backtest-trend-template");
const { buildSniperRow, computeOutcome, aggregate, buildReport } = require("../src/backtest-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

function bar(time, close, high, low, open, volume) {
  return { time, open: open ?? close, high: high ?? close, low: low ?? close, close, volume: volume ?? 1_000_000 };
}

// A genuine zigzag (real local swing highs/lows, not a monotonic series —
// swing-point detection needs actual 3-bar-window local extrema, the exact
// bug this session already caught once in the live phase's own test).
function zigzagBars(n, { start = 100, driftPerBar = 0.15, wave = 3, startTime = 1_700_000_000_000 } = {}) {
  const bars = [];
  for (let i = 0; i < n; i += 1) {
    const trend = start + i * driftPerBar;
    const close = trend + Math.sin(i / 3) * wave;
    const high = close + Math.abs(Math.sin(i / 3)) * 0.5 + 0.3;
    const low = close - Math.abs(Math.sin(i / 3)) * 0.5 - 0.3;
    bars.push(bar(startTime + i * 86_400_000, close, high, low, close, 1_000_000));
  }
  return bars;
}

console.log("Checking classifyRegimeSeries…");
ok("classifyRegimeSeries: not enough history yields null entries", () => {
  const bars = zigzagBars(50);
  const series = classifyRegimeSeries(bars);
  assert.ok(series.slice(0, 50).every((e) => e === null));
});
ok("classifyRegimeSeries: a real sustained uptrend classifies as BULL", () => {
  const bars = zigzagBars(260, { start: 100, driftPerBar: 0.5, wave: 2 });
  const series = classifyRegimeSeries(bars);
  const last = series[series.length - 1];
  assert.ok(last, "expected a classified entry once 220+ bars of real history exist");
  assert.strictEqual(last.regime, "BULL");
});
ok("classifyRegimeSeries: a real sustained downtrend classifies as BEAR", () => {
  const bars = zigzagBars(260, { start: 300, driftPerBar: -0.5, wave: 2 });
  const series = classifyRegimeSeries(bars);
  const last = series[series.length - 1];
  assert.strictEqual(last.regime, "BEAR");
});
ok("classifyRegimeSeries: a flat, driftless series classifies as SIDEWAYS", () => {
  const bars = zigzagBars(260, { start: 200, driftPerBar: 0, wave: 1 });
  const series = classifyRegimeSeries(bars);
  const last = series[series.length - 1];
  assert.strictEqual(last.regime, "SIDEWAYS");
});

console.log("Checking regimeAt…");
ok("regimeAt: returns the most recent classified regime at or before a given time", () => {
  const bars = zigzagBars(260, { start: 100, driftPerBar: 0.5, wave: 2 });
  const series = classifyRegimeSeries(bars);
  const lastBar = bars[bars.length - 1];
  assert.strictEqual(regimeAt(series, lastBar.time), "BULL");
  assert.strictEqual(regimeAt(series, lastBar.time + 999), "BULL", "a slightly later time should fall back to the most recent known regime");
});
ok("regimeAt: null before any real classified entry exists", () => {
  const bars = zigzagBars(50);
  const series = classifyRegimeSeries(bars);
  assert.strictEqual(regimeAt(series, bars[10].time), null);
});

console.log("Checking computeTrendTemplateAt…");
ok("computeTrendTemplateAt: null with fewer than 200 real bars of history", () => {
  const bars = zigzagBars(150, { start: 100, driftPerBar: 0.5 });
  assert.strictEqual(computeTrendTemplateAt(bars, 149, { spyMom: 0.05 }), null);
});
ok("computeTrendTemplateAt: a real strong uptrend produces a high pass count and sane entry/stop/target math", () => {
  const bars = zigzagBars(260, { start: 100, driftPerBar: 0.6, wave: 2 });
  const tt = computeTrendTemplateAt(bars, bars.length - 1, { spyMom: 0.02 });
  assert.ok(tt, "expected a real trend-template result with 260 bars of history");
  assert.ok(tt.passCount >= 6, `expected a strong real uptrend to pass most Minervini criteria, got ${tt.passCount}/8`);
  assert.ok(tt.entry > tt.stop, "entry must sit above stop");
  assert.ok(tt.target2 > tt.entry, "target2 must sit above entry");
  assert.strictEqual(tt.stage.includes("Stage 2"), true);
});
ok("computeTrendTemplateAt: a real downtrend never reports GO", () => {
  const bars = zigzagBars(260, { start: 300, driftPerBar: -0.6, wave: 2 });
  const tt = computeTrendTemplateAt(bars, bars.length - 1, { spyMom: 0.02 });
  assert.ok(tt);
  assert.notStrictEqual(tt.verdict, "GO");
});
ok("computeTrendTemplateAt: breakoutConfirmed requires both a real close above pivot AND real volume ≥1.4x", () => {
  const bars = zigzagBars(260, { start: 100, driftPerBar: 0.5, wave: 2 });
  // Force the final bar to a fresh high on a real volume surge.
  const last = bars[bars.length - 1];
  bars[bars.length - 1] = { ...last, close: last.close + 10, high: last.close + 11, volume: 3_000_000 };
  const tt = computeTrendTemplateAt(bars, bars.length - 1, { spyMom: 0.02 });
  assert.ok(tt.volSurge >= 1.4, `expected the forced volume spike to register, got volSurge=${tt.volSurge}`);
});

console.log("Checking buildSniperRow…");
ok("buildSniperRow: real, well-formed technicals off the historical slice", () => {
  const bars = zigzagBars(260, { start: 100, driftPerBar: 0.5, wave: 2 });
  const tt = computeTrendTemplateAt(bars, bars.length - 1, { spyMom: 0.02 });
  const row = buildSniperRow(bars, bars.length - 1, tt);
  assert.ok(row.rsi >= 0 && row.rsi <= 100, `RSI must be a real 0-100 value, got ${row.rsi}`);
  assert.ok(Number.isFinite(row.technicals.vwap20), "vwap20 must be a real finite number");
  assert.strictEqual(typeof row.breakoutConfirmed, "boolean");
});

console.log("Checking computeOutcome…");
ok("computeOutcome: null when there isn't enough real future data yet", () => {
  const bars = zigzagBars(20, { start: 100 });
  assert.strictEqual(computeOutcome(bars, 15, 100, 90, 110, 10), null);
});
ok("computeOutcome: real return/MFE/MAE/stop/target math off known future bars", () => {
  const bars = [
    bar(0, 100), // fillIdx = 0, entry filled here
    bar(1, 102, 103, 99),
    bar(2, 108, 112, 101), // touches target1 (110)? no — high 112 >= target1 110 -> hit
    bar(3, 95, 106, 88),   // low 88 <= stop (90)? no, 88 < 90 -> stop hit
    bar(4, 100, 101, 96),
  ];
  const out = computeOutcome(bars, 0, 100, 90, 110, 4);
  assert.ok(out, "expected a real completed outcome");
  assert.strictEqual(out.returnPct, 0, `exit close 100 vs entry 100 -> 0%, got ${out.returnPct}`);
  assert.strictEqual(out.mfePct, 12, `max high 112 vs entry 100 -> +12%, got ${out.mfePct}`);
  assert.strictEqual(out.maePct, -12, `min low 88 vs entry 100 -> -12%, got ${out.maePct}`);
  assert.strictEqual(out.stopHit, true);
  assert.strictEqual(out.target1Hit, true);
});
ok("computeOutcome: honest false when neither stop nor target is ever touched", () => {
  const bars = [bar(0, 100), bar(1, 100.5, 101, 100), bar(2, 101, 101.5, 100.5)];
  const out = computeOutcome(bars, 0, 100, 90, 110, 2);
  assert.strictEqual(out.stopHit, false);
  assert.strictEqual(out.target1Hit, false);
});

console.log("Checking aggregate…");
ok("aggregate: null with zero real completed outcomes for a horizon", () => {
  assert.strictEqual(aggregate([{ outcomes: { d5: null } }], "d5"), null);
});
ok("aggregate: real avg return/win rate/stop-target-hit rate off completed outcomes", () => {
  const events = [
    { outcomes: { d5: { returnPct: 10, mfePct: 12, maePct: -2, stopHit: false, target1Hit: true } } },
    { outcomes: { d5: { returnPct: -6, mfePct: 1, maePct: -8, stopHit: true, target1Hit: false } } },
  ];
  const a = aggregate(events, "d5");
  assert.strictEqual(a.count, 2);
  assert.strictEqual(a.avgReturnPct, 2, `expected (10 + -6)/2 = 2, got ${a.avgReturnPct}`);
  assert.strictEqual(a.winRate, 50);
  assert.strictEqual(a.stopHitRate, 50);
  assert.strictEqual(a.target1HitRate, 50);
});
ok("aggregate: real expectancy/profitFactor/avgWin/avgLoss off a mixed win/loss sample", () => {
  const events = [
    { outcomes: { d5: { returnPct: 10, mfePct: 12, maePct: -2, stopHit: false, target1Hit: true } } },
    { outcomes: { d5: { returnPct: 20, mfePct: 22, maePct: -1, stopHit: false, target1Hit: true } } },
    { outcomes: { d5: { returnPct: -6, mfePct: 1, maePct: -8, stopHit: true, target1Hit: false } } },
  ];
  const a = aggregate(events, "d5");
  assert.strictEqual(a.avgWin, 15, "avg of the two real +10/+20 winners");
  assert.strictEqual(a.avgLoss, 6, "the one real -6 loser, as a positive magnitude");
  assert.strictEqual(a.expectancy, a.avgReturnPct, "expectancy is the same real number as avgReturnPct by construction");
  assert.strictEqual(a.profitFactor, 5, "gross profit 30 / gross loss 6 = 5");
  assert.strictEqual(a.profitFactorNote, null);
});
ok("aggregate: zero real losing trades -> profitFactor is honestly null, never Infinity", () => {
  const events = [
    { outcomes: { d5: { returnPct: 10, mfePct: 10, maePct: -1, stopHit: false, target1Hit: true } } },
    { outcomes: { d5: { returnPct: 5, mfePct: 5, maePct: -1, stopHit: false, target1Hit: false } } },
  ];
  const a = aggregate(events, "d5");
  assert.strictEqual(a.profitFactor, null);
  assert.strictEqual(a.avgLoss, null);
  assert.ok(a.profitFactorNote && /undefined/i.test(a.profitFactorNote));
});

console.log("Checking buildReport…");
ok("buildReport: regimes are aggregated completely separately, never mixed with overall", () => {
  const events = [
    { regime: "BULL", outcomes: { d5: { returnPct: 10, mfePct: 10, maePct: -1, stopHit: false, target1Hit: true } } },
    { regime: "BEAR", outcomes: { d5: { returnPct: -10, mfePct: 1, maePct: -10, stopHit: true, target1Hit: false } } },
  ];
  const report = buildReport(events, [5]);
  assert.strictEqual(report.totalEvents, 2);
  assert.strictEqual(report.byRegime.BULL.d5.avgReturnPct, 10);
  assert.strictEqual(report.byRegime.BEAR.d5.avgReturnPct, -10);
  assert.strictEqual(report.overall.d5.avgReturnPct, 0, `expected overall (10 + -10)/2 = 0, got ${report.overall.d5.avgReturnPct}`);
});
ok("buildReport: a regime with zero events is simply absent, not a fabricated empty bucket", () => {
  const events = [{ regime: "BULL", outcomes: { d5: { returnPct: 1, mfePct: 1, maePct: -1, stopHit: false, target1Hit: false } } }];
  const report = buildReport(events, [5]);
  assert.strictEqual(report.byRegime.BEAR, undefined);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("BACKTEST-ENGINE TEST FAILED"); else console.log("BACKTEST-ENGINE TEST OK");
