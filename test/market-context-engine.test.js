// Real tests for src/market-context-engine.js's pure decision logic —
// computeMarketContext itself is a real network orchestrator (self-
// loopback fetch of /api/market/macro-regime + real quote fetches), so
// this covers the pure, exported sub-functions with synthetic inputs,
// same "test the pure helpers, not the network-wrapped orchestration"
// convention as this session's other engine tests.
// Run: node test/market-context-engine.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const {
  computeCoreFedSignal, compute10yConfirmation, evaluateCrossAssetPatterns,
  detectDivergence, computeCompositeMacroScore, classifyTradingEnvironment,
  applyMarketContextToVerdict,
} = require("../src/market-context-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking computeCoreFedSignal — real 2Y + Fed-funds combination (spec §4)…");
ok("2Y rising + Fed funds not falling -> HAWKISH_REPRICING", () => {
  const r = computeCoreFedSignal({ twoYearTrend: "rising", fedFundsTrend: "rising", dxyChg: 0.2 });
  assert.strictEqual(r.signal, "HAWKISH_REPRICING");
});
ok("2Y falling + Fed funds not rising -> DOVISH_REPRICING", () => {
  const r = computeCoreFedSignal({ twoYearTrend: "falling", fedFundsTrend: "falling", dxyChg: -0.2 });
  assert.strictEqual(r.signal, "DOVISH_REPRICING");
});
ok("2Y and Fed funds disagree -> MIXED, never forced to a side", () => {
  const r = computeCoreFedSignal({ twoYearTrend: "rising", fedFundsTrend: "falling", dxyChg: 0 });
  assert.strictEqual(r.signal, "MIXED");
});
ok("no real 2Y or Fed-funds data -> honest UNKNOWN, never a guess", () => {
  const r = computeCoreFedSignal({ twoYearTrend: null, fedFundsTrend: null, dxyChg: null });
  assert.strictEqual(r.signal, "UNKNOWN");
});

console.log("Checking compute10yConfirmation — real 2Y/10Y comparison + honest driver attribution (spec §5)…");
ok("both rising -> STRONG_HAWKISH", () => {
  const r = compute10yConfirmation({ twoYearTrend: "rising", tenYearTrend: "rising", realYield10yTrend: 0, inflationYoy: 2, oilChg: 0 });
  assert.strictEqual(r.confirmation, "STRONG_HAWKISH");
});
ok("both falling -> STRONG_DOVISH", () => {
  const r = compute10yConfirmation({ twoYearTrend: "falling", tenYearTrend: "falling", realYield10yTrend: 0, inflationYoy: 2, oilChg: 0 });
  assert.strictEqual(r.confirmation, "STRONG_DOVISH");
});
ok("2Y up, 10Y down -> MIXED", () => {
  const r = compute10yConfirmation({ twoYearTrend: "rising", tenYearTrend: "falling", realYield10yTrend: 0, inflationYoy: 2, oilChg: 0 });
  assert.strictEqual(r.confirmation, "MIXED");
});
ok("real elevated inflation is attributed as the likely driver when it dominates", () => {
  const r = compute10yConfirmation({ twoYearTrend: "rising", tenYearTrend: "rising", realYield10yTrend: 0.2, inflationYoy: 4.5, oilChg: 0.3 });
  assert.strictEqual(r.likelyDriver, "inflation");
});
ok("no real dominant driver -> honestly null, never forced", () => {
  const r = compute10yConfirmation({ twoYearTrend: "rising", tenYearTrend: "rising", realYield10yTrend: 0.1, inflationYoy: 2, oilChg: 0.2 });
  assert.strictEqual(r.likelyDriver, null);
});

console.log("Checking evaluateCrossAssetPatterns — real disclosed threshold rules (spec §6-7)…");
ok("oil up + yields rising -> INFLATIONARY_PRESSURE", () => {
  const { patterns } = evaluateCrossAssetPatterns({ oilChg: 2, goldChg: 0, dxyChg: 0, vixLevel: 15, vixChg: 0, spyChg: 0.5, qqqChg: 0.5, tenYearTrend: "rising" });
  assert.ok(patterns.some((p) => p.id === "INFLATIONARY_PRESSURE"));
});
ok("gold up + DXY up + VIX up + SPY down -> SAFE_HAVEN_STRESS", () => {
  const { patterns } = evaluateCrossAssetPatterns({ oilChg: 0, goldChg: 1.5, dxyChg: 0.5, vixLevel: 25, vixChg: 5, spyChg: -1, qqqChg: -1.2, tenYearTrend: "flat" });
  assert.ok(patterns.some((p) => p.id === "SAFE_HAVEN_STRESS"));
});
ok("a quiet, unremarkable tape matches zero patterns — never forced", () => {
  const { patterns } = evaluateCrossAssetPatterns({ oilChg: 0.05, goldChg: 0.05, dxyChg: 0.02, vixLevel: 15, vixChg: 0, spyChg: 0.1, qqqChg: 0.1, tenYearTrend: "flat" });
  assert.strictEqual(patterns.length, 0);
});
ok("QQQ up more than SPY -> GROWTH_LEADERSHIP", () => {
  const { qqqSpyRelative } = evaluateCrossAssetPatterns({ oilChg: 0, goldChg: 0, dxyChg: 0, vixLevel: 15, vixChg: 0, spyChg: 0.3, qqqChg: 1.1, tenYearTrend: "flat" });
  assert.strictEqual(qqqSpyRelative, "GROWTH_LEADERSHIP");
});

console.log("Checking detectDivergence — the one genuinely new classifier (spec §8)…");
ok("hawkish repricing + both equities up -> MACRO_EQUITY_DIVERGENCE", () => {
  const r = detectDivergence({ fedSignal: "HAWKISH_REPRICING", spyChg: 0.4, qqqChg: 0.6 });
  assert.strictEqual(r.divergence, "MACRO_EQUITY_DIVERGENCE");
});
ok("dovish repricing + both equities down -> EQUITY_WEAKNESS_DESPITE_DOVISH", () => {
  const r = detectDivergence({ fedSignal: "DOVISH_REPRICING", spyChg: -0.4, qqqChg: -0.6 });
  assert.strictEqual(r.divergence, "EQUITY_WEAKNESS_DESPITE_DOVISH");
});
ok("hawkish repricing + equities down -> ALIGNED, not falsely flagged", () => {
  const r = detectDivergence({ fedSignal: "HAWKISH_REPRICING", spyChg: -0.4, qqqChg: -0.6 });
  assert.strictEqual(r.divergence, "ALIGNED");
});

console.log("Checking computeCompositeMacroScore — honest degrade on missing real inputs (spec §9)…");
ok("all real inputs present (including treasury/credit) -> confidence 100%", () => {
  const r = computeCompositeMacroScore({ fedSignal: "DOVISH_REPRICING", inflationYoy: 2.5, employmentScore: 60, liquidityScore: 55, breadthScore: 65, vixLevel: 15, divergence: "ALIGNED", treasuryScore: 60, creditScore: 65 });
  assert.strictEqual(r.confidence, 100);
});
ok("every real input missing -> honest 0% confidence and a neutral 0 score, never fabricated", () => {
  const r = computeCompositeMacroScore({ fedSignal: null, inflationYoy: null, employmentScore: null, liquidityScore: null, breadthScore: null, vixLevel: null, divergence: null, treasuryScore: null, creditScore: null });
  assert.strictEqual(r.confidence, 0);
  assert.strictEqual(r.score, 0);
});
ok("a hawkish/high-inflation/weak-growth/tight-liquidity backdrop produces a real negative score", () => {
  const r = computeCompositeMacroScore({ fedSignal: "HAWKISH_REPRICING", inflationYoy: 4.5, employmentScore: 25, liquidityScore: 20, breadthScore: 20, vixLevel: 28, divergence: "MACRO_EQUITY_DIVERGENCE" });
  assert.ok(r.score < 0, `expected a negative macro score, got ${r.score}`);
  assert.strictEqual(r.fedPressure.label, "HAWKISH");
});
ok("treasuryScore/creditScore omitted entirely -> honestly degrades confidence rather than assuming neutral", () => {
  const withBoth = computeCompositeMacroScore({ fedSignal: "DOVISH_REPRICING", inflationYoy: 2.5, employmentScore: 60, liquidityScore: 55, breadthScore: 65, vixLevel: 15, divergence: "ALIGNED", treasuryScore: 60, creditScore: 65 });
  const without = computeCompositeMacroScore({ fedSignal: "DOVISH_REPRICING", inflationYoy: 2.5, employmentScore: 60, liquidityScore: 55, breadthScore: 65, vixLevel: 15, divergence: "ALIGNED" });
  assert.strictEqual(withBoth.confidence, 100);
  assert.ok(without.confidence < 100, `expected < 100% confidence with treasury/credit missing, got ${without.confidence}`);
  assert.strictEqual(without.treasuryPressure, null);
  assert.strictEqual(without.creditPressure, null);
});
ok("a real weak treasuryScore (deep in real STRESSED territory) -> treasuryPressure TIGHTENING and pulls the composite score down", () => {
  const weak = computeCompositeMacroScore({ fedSignal: "MIXED", inflationYoy: 3, employmentScore: 50, liquidityScore: 50, breadthScore: 50, vixLevel: 20, divergence: null, treasuryScore: 10, creditScore: 50 });
  const strong = computeCompositeMacroScore({ fedSignal: "MIXED", inflationYoy: 3, employmentScore: 50, liquidityScore: 50, breadthScore: 50, vixLevel: 20, divergence: null, treasuryScore: 90, creditScore: 50 });
  assert.strictEqual(weak.treasuryPressure.label, "TIGHTENING");
  assert.ok(weak.score < strong.score, `expected weak treasury to score lower than strong treasury (weak=${weak.score}, strong=${strong.score})`);
});
ok("a real weak creditScore (spreads blown out) -> creditPressure STRESSED and pulls the composite score down", () => {
  const weak = computeCompositeMacroScore({ fedSignal: "MIXED", inflationYoy: 3, employmentScore: 50, liquidityScore: 50, breadthScore: 50, vixLevel: 20, divergence: null, treasuryScore: 50, creditScore: 5 });
  const strong = computeCompositeMacroScore({ fedSignal: "MIXED", inflationYoy: 3, employmentScore: 50, liquidityScore: 50, breadthScore: 50, vixLevel: 20, divergence: null, treasuryScore: 50, creditScore: 95 });
  assert.strictEqual(weak.creditPressure.label, "STRESSED");
  assert.ok(weak.score < strong.score, `expected weak credit to score lower than strong credit (weak=${weak.score}, strong=${strong.score})`);
});

console.log("Checking classifyTradingEnvironment (spec §2)…");
ok("any real divergence forces DO_NOT_CHASE regardless of score", () => {
  assert.strictEqual(classifyTradingEnvironment({ macroScore: 40, vixLevel: 15, divergence: "MACRO_EQUITY_DIVERGENCE" }), "DO_NOT_CHASE");
});
ok("high real VIX forces HIGH_VOLATILITY", () => {
  assert.strictEqual(classifyTradingEnvironment({ macroScore: 0, vixLevel: 32, divergence: "ALIGNED" }), "HIGH_VOLATILITY");
});
ok("a real strongly positive score -> LONG_FAVORABLE", () => {
  assert.strictEqual(classifyTradingEnvironment({ macroScore: 40, vixLevel: 15, divergence: "ALIGNED" }), "LONG_FAVORABLE");
});
ok("a real strongly negative score -> SHORT_FAVORABLE", () => {
  assert.strictEqual(classifyTradingEnvironment({ macroScore: -40, vixLevel: 15, divergence: "ALIGNED" }), "SHORT_FAVORABLE");
});

console.log("Checking applyMarketContextToVerdict — pure, additive A+ Score overlay (spec §10)…");
ok("a real bullish verdict + hostile macro -> MACRO HEADWIND, confidence reduced", () => {
  const r = applyMarketContextToVerdict({ verdict: "BUY", score: 91 }, { macroScore: -40 });
  assert.strictEqual(r.label, "A+ TECHNICAL SETUP — MACRO HEADWIND");
  assert.ok(r.confidenceAdjustment < 0);
});
ok("a real bullish verdict + supportive macro -> MACRO CONFIRMATION, confidence increased", () => {
  const r = applyMarketContextToVerdict({ verdict: "BUY", score: 91 }, { macroScore: 40 });
  assert.strictEqual(r.label, "A+ SETUP + MACRO CONFIRMATION");
  assert.ok(r.confidenceAdjustment > 0);
});
ok("no real Market Context available -> honest no-op, never a fabricated label", () => {
  const r = applyMarketContextToVerdict({ verdict: "BUY", score: 91 }, null);
  assert.strictEqual(r.label, null);
});
ok("neutral macro + neutral verdict -> no label, no forced opinion", () => {
  const r = applyMarketContextToVerdict({ verdict: "WATCH", score: 50 }, { macroScore: 0 });
  assert.strictEqual(r.label, null);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("MARKET-CONTEXT-ENGINE TEST FAILED"); else console.log("MARKET-CONTEXT-ENGINE TEST OK");
