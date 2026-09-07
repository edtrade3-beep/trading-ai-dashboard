"use strict";
const assert = require("node:assert");
const {
  pearson, alignByDate, toDailySeries, computeMacroCorrelation, sensitivityLabel,
  classifyRateRegime, impliedDirection, explainPauseFlavor, explainCutFlavor,
  computeRateRelationship, computeCryptoMacroScore, computeMomentumScore,
  MIN_ALIGNED_OBSERVATIONS,
} = require("../src/crypto-macro-engine");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

ok("pearson: perfect positive correlation", () => {
  assert.strictEqual(pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1);
});
ok("pearson: perfect negative correlation", () => {
  assert.strictEqual(pearson([1, 2, 3, 4], [8, 6, 4, 2]), -1);
});
ok("pearson: zero variance side returns 0, never NaN", () => {
  assert.strictEqual(pearson([1, 1, 1, 1], [1, 2, 3, 4]), 0);
});

ok("alignByDate: only keeps real shared dates", () => {
  const a = [{ date: "2026-01-01", value: 1 }, { date: "2026-01-02", value: 2 }, { date: "2026-01-03", value: 3 }];
  const b = [{ date: "2026-01-01", value: 10 }, { date: "2026-01-03", value: 30 }];
  const pairs = alignByDate(a, b);
  assert.deepStrictEqual(pairs, [[1, 10], [3, 30]]);
});

ok("toDailySeries: converts Yahoo bars (time in epoch MILLISECONDS) correctly", () => {
  const bars = [{ time: Date.parse("2026-03-05T00:00:00Z"), close: 100 }, { time: Date.parse("2026-03-06T00:00:00Z"), close: 105 }];
  const daily = toDailySeries(bars);
  assert.strictEqual(daily.length, 2);
  assert.strictEqual(daily[0].date, "2026-03-05");
  assert.strictEqual(daily[0].value, 100);
});
ok("toDailySeries: drops bars with no close or no derivable date", () => {
  const daily = toDailySeries([{ time: null, close: 100 }, { foo: 1 }, null]);
  assert.strictEqual(daily.length, 0);
});

ok("computeMacroCorrelation: honest null below the real minimum sample floor", () => {
  const shortBars = [{ time: Date.parse("2026-01-01"), close: 100 }, { time: Date.parse("2026-01-02"), close: 101 }];
  const shortMacro = [{ date: "2026-01-01", value: 4 }, { date: "2026-01-02", value: 4.1 }];
  assert.strictEqual(computeMacroCorrelation(shortBars, shortMacro), null);
});
ok("computeMacroCorrelation: real correlation computed once enough aligned observations exist", () => {
  const n = MIN_ALIGNED_OBSERVATIONS + 5;
  const bars = [], macro = [];
  for (let i = 0; i < n; i++) {
    const d = `2026-01-${String(i + 1).padStart(2, "0")}`;
    bars.push({ time: Date.parse(`${d}T00:00:00Z`), close: 100 + i * 2 }); // steadily rising
    macro.push({ date: d, value: 4 + i * 0.05 }); // steadily rising too -> positive correlation
  }
  const corr = computeMacroCorrelation(bars, macro);
  assert.ok(Number.isFinite(corr), "expected a real number, got " + corr);
  assert.ok(corr > 0.5, `expected a strong positive correlation for two co-rising series, got ${corr}`);
});
ok("computeMacroCorrelation: honest null when macroSeries isn't a real array", () => {
  assert.strictEqual(computeMacroCorrelation([{ time: 1, close: 1 }], null), null);
  assert.strictEqual(computeMacroCorrelation([{ time: 1, close: 1 }], undefined), null);
});

ok("sensitivityLabel: real bucket boundaries", () => {
  assert.strictEqual(sensitivityLabel(0.1), "LOW");
  assert.strictEqual(sensitivityLabel(-0.3), "MODERATE");
  assert.strictEqual(sensitivityLabel(0.6), "HIGH");
  assert.strictEqual(sensitivityLabel(0.95), "EXTREME");
  assert.strictEqual(sensitivityLabel(null), null);
  assert.strictEqual(sensitivityLabel(NaN), null);
});

ok("classifyRateRegime: HIKE always wins regardless of bias", () => {
  assert.strictEqual(classifyRateRegime({ fedStatementAction: "HIKE", fedStatementBias: "DOVISH" }), "HIKE");
});
ok("classifyRateRegime: CUT + CRISIS regime -> EMERGENCY_EASING", () => {
  assert.strictEqual(classifyRateRegime({ fedStatementAction: "CUT", marketRegimeLabel: "CRISIS" }), "EMERGENCY_EASING");
});
ok("classifyRateRegime: CUT + fast real decline in fed funds -> RATE_CUT_CYCLE", () => {
  assert.strictEqual(classifyRateRegime({ fedStatementAction: "CUT", fedFundsWindowChangePct: -1.5, marketRegimeLabel: "NEUTRAL" }), "RATE_CUT_CYCLE");
});
ok("classifyRateRegime: CUT without a fast decline -> DOVISH_HOLD (single cut, not yet a cycle)", () => {
  assert.strictEqual(classifyRateRegime({ fedStatementAction: "CUT", fedFundsWindowChangePct: -0.25, marketRegimeLabel: "NEUTRAL" }), "DOVISH_HOLD");
});
ok("classifyRateRegime: HOLD + hawkish statement bias -> HOLD_LONGER", () => {
  assert.strictEqual(classifyRateRegime({ fedStatementAction: "HOLD", fedStatementBias: "HAWKISH" }), "HOLD_LONGER");
});
ok("classifyRateRegime: HOLD + dovish statement bias -> DOVISH_HOLD", () => {
  assert.strictEqual(classifyRateRegime({ fedStatementAction: "HOLD", fedStatementBias: "DOVISH" }), "DOVISH_HOLD");
});
ok("classifyRateRegime: HOLD + neutral bias -> genuinely PAUSE (never auto-bullish or auto-bearish)", () => {
  assert.strictEqual(classifyRateRegime({ fedStatementAction: "HOLD", fedStatementBias: "NEUTRAL" }), "PAUSE");
});

ok("impliedDirection: consistent with the classified regime", () => {
  assert.strictEqual(impliedDirection({ fedStatementBias: "HAWKISH", rateRegime: "HIKE" }), "MORE_HAWKISH");
  assert.strictEqual(impliedDirection({ fedStatementBias: "NEUTRAL", rateRegime: "RATE_CUT_CYCLE" }), "MORE_DOVISH");
  assert.strictEqual(impliedDirection({ fedStatementBias: "NEUTRAL", rateRegime: "PAUSE" }), "NEUTRAL");
});

ok("explainPauseFlavor: inflation near the Fed's ~2% target + stable labor -> BULLISH_PAUSE", () => {
  const r = explainPauseFlavor({ cpiYoyChangePct: 2.1, unemploymentWindowChangePct: 1, marketRegimeLabel: "NEUTRAL" });
  assert.strictEqual(r.flavor, "BULLISH_PAUSE");
});
ok("explainPauseFlavor: inflation meaningfully above target -> BEARISH_PAUSE, not automatically bullish", () => {
  const r = explainPauseFlavor({ cpiYoyChangePct: 4.2, unemploymentWindowChangePct: 1, marketRegimeLabel: "NEUTRAL" });
  assert.strictEqual(r.flavor, "BEARISH_PAUSE");
});
ok("explainPauseFlavor: real labor softening + risk-off regime -> RECESSIONARY_PAUSE", () => {
  const r = explainPauseFlavor({ cpiYoyChangePct: 2.0, unemploymentWindowChangePct: 15, marketRegimeLabel: "RISK_OFF" });
  assert.strictEqual(r.flavor, "RECESSIONARY_PAUSE");
});
ok("explainPauseFlavor: no clear real signal either way -> TRANSITIONAL_PAUSE", () => {
  const r = explainPauseFlavor({ cpiYoyChangePct: 3.0, unemploymentWindowChangePct: 1, marketRegimeLabel: "NEUTRAL" });
  assert.strictEqual(r.flavor, "TRANSITIONAL_PAUSE");
});
ok("explainPauseFlavor: never crashes / always returns a real cryptoRead string", () => {
  for (const f of [explainPauseFlavor({}), explainPauseFlavor({ cpiYoyChangePct: NaN })]) {
    assert.ok(typeof f.cryptoRead === "string" && f.cryptoRead.length > 0);
  }
});

ok("explainCutFlavor: real labor deterioration -> RECESSION_EMERGENCY_CUTS, not automatically bullish", () => {
  const r = explainCutFlavor({ unemploymentWindowChangePct: 20, marketRegimeLabel: "NEUTRAL" });
  assert.strictEqual(r.flavor, "RECESSION_EMERGENCY_CUTS");
});
ok("explainCutFlavor: real liquidity expansion -> LIQUIDITY_DRIVEN_EASING", () => {
  const r = explainCutFlavor({ unemploymentWindowChangePct: 1, marketRegimeLabel: "NEUTRAL", liquidityWindowChangePct: 2.5 });
  assert.strictEqual(r.flavor, "LIQUIDITY_DRIVEN_EASING");
});
ok("explainCutFlavor: disinflation without labor stress or liquidity signal -> SOFT_LANDING_CUTS", () => {
  const r = explainCutFlavor({ cpiYoyChangePct: 2.0, unemploymentWindowChangePct: 1, marketRegimeLabel: "NEUTRAL", liquidityWindowChangePct: -1 });
  assert.strictEqual(r.flavor, "SOFT_LANDING_CUTS");
});

ok("computeRateRelationship: PAUSE regime carries a real flavor breakdown", () => {
  const r = computeRateRelationship({ fedStatementAction: "HOLD", fedStatementBias: "NEUTRAL", cpiYoyChangePct: 2.1, unemploymentWindowChangePct: 1, marketRegimeLabel: "NEUTRAL" });
  assert.strictEqual(r.rateRegime, "PAUSE");
  assert.ok(r.flavor && r.flavor.flavor, "expected a real pause flavor breakdown");
});
ok("computeRateRelationship: HIKE regime carries no pause/cut flavor (not applicable)", () => {
  const r = computeRateRelationship({ fedStatementAction: "HIKE", fedStatementBias: "HAWKISH" });
  assert.strictEqual(r.rateRegime, "HIKE");
  assert.strictEqual(r.flavor, null);
});

ok("computeMomentumScore: honest null below the real minimum lookback history", () => {
  assert.strictEqual(computeMomentumScore([{ time: Date.parse("2026-01-01"), close: 100 }], 14), null);
});
ok("computeMomentumScore: clamps a real outsized move to [-1, 1]", () => {
  const bars = [];
  for (let i = 0; i <= 14; i++) bars.push({ time: Date.parse(`2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`), close: 100 * Math.pow(1.1, i) }); // +10%/day compounding, way past +/-20%
  const score = computeMomentumScore(bars, 14);
  assert.strictEqual(score, 1);
});

ok("computeCryptoMacroScore: always discloses ETF flows / regulatory sentiment as unavailable, never fabricates them", () => {
  const r = computeCryptoMacroScore({ correlations: { fedFunds: 0.2, usd: -0.3, yields10y: -0.1, nasdaq: 0.4 }, rateRegime: "PAUSE", marketRegimeLabel: "NEUTRAL", momentumScore: 0.2 });
  assert.ok(r.unavailable.includes("ETF flows (no real data source)"));
  assert.ok(r.unavailable.includes("Regulatory sentiment (not quantified)"));
  assert.ok(r.score >= 0 && r.score <= 100);
});
ok("computeCryptoMacroScore: missing correlation inputs are disclosed, never defaulted to a fabricated 0", () => {
  const r = computeCryptoMacroScore({ correlations: {}, rateRegime: "PAUSE", marketRegimeLabel: "NEUTRAL", momentumScore: null });
  assert.ok(r.unavailable.includes("Fed sensitivity"));
  assert.ok(r.unavailable.includes("USD sensitivity"));
  assert.ok(r.unavailable.includes("10Y yield sensitivity"));
  assert.ok(r.unavailable.includes("Nasdaq correlation"));
  assert.ok(r.unavailable.includes("Momentum"));
  assert.strictEqual(r.score, 50); // no real signal at all -> exactly neutral midpoint
  assert.strictEqual(r.label, "Neutral");
});
ok("computeCryptoMacroScore: RATE_CUT_CYCLE with real positive sensitivities pushes the score up", () => {
  const cut = computeCryptoMacroScore({ correlations: { fedFunds: 0.5, usd: 0, yields10y: 0, nasdaq: 0 }, rateRegime: "RATE_CUT_CYCLE", marketRegimeLabel: "RISK_ON", momentumScore: null });
  const hike = computeCryptoMacroScore({ correlations: { fedFunds: 0.5, usd: 0, yields10y: 0, nasdaq: 0 }, rateRegime: "HIKE", marketRegimeLabel: "RISK_ON", momentumScore: null });
  assert.ok(cut.score > hike.score, `expected RATE_CUT_CYCLE (${cut.score}) to score higher than HIKE (${hike.score}) for the same sensitivity`);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("CRYPTO-MACRO-ENGINE TEST FAILED");
else console.log("CRYPTO-MACRO-ENGINE TEST OK");
