// Real tests for src/future-wallet-synthesis.js (Horse Hunter upgrade,
// 2026-08-26) — the CIO Synthesis step that turns Future Wallet's already-
// real quant/technical/future-potential/agent scores into the 3 disclosed
// fw_scores columns. Pure-function, synthetic-input, zero-network, zero-DB.
// Run: node test/future-wallet-synthesis.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const {
  band, weightedAverage, computeAgentAverage, scorePositionInBase, computeRiskProxy, synthesize, composeVerdict,
} = require("../src/future-wallet-synthesis");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking band/weightedAverage — real disclosed-threshold primitives…");
ok("band clamps and interpolates linearly between the two real thresholds", () => {
  assert.strictEqual(band(0.8, 0.8, 2.2), 100);
  assert.strictEqual(band(2.2, 0.8, 2.2), 0);
  assert.strictEqual(band(1.5, 0.8, 2.2), Math.round(((1.5 - 2.2) / (0.8 - 2.2)) * 100));
});
ok("band is honestly null when the real input is missing", () => {
  assert.strictEqual(band(null, 0.8, 2.2), null);
});
ok("weightedAverage renormalizes over available real inputs, never zero-fills a missing one", () => {
  const { score, coverage } = weightedAverage([[80, 50], [null, 30], [60, 20]]);
  assert.strictEqual(score, Math.round((80 * 50 + 60 * 20) / 70));
  assert.strictEqual(coverage, Math.round((70 / 100) * 100));
});
ok("weightedAverage is honestly null when nothing is available", () => {
  const { score, coverage } = weightedAverage([[null, 50], [null, 50]]);
  assert.strictEqual(score, null);
  assert.strictEqual(coverage, 0);
});

console.log("Checking scorePositionInBase — real entry-timing read from distance-off-high…");
ok("very close to the 52w high scores a real chase-risk penalty, not the max", () => {
  assert.ok(scorePositionInBase(-2) < scorePositionInBase(-18));
});
ok("a healthy real base zone (10-30% off high) scores highest", () => {
  assert.strictEqual(scorePositionInBase(-18), 90);
});
ok("a deep real drawdown scores lower — elevated broken-trend risk", () => {
  assert.ok(scorePositionInBase(-75) < scorePositionInBase(-18));
});
ok("honest null when distance-from-high is unavailable", () => {
  assert.strictEqual(scorePositionInBase(null), null);
});

console.log("Checking computeRiskProxy — real quant-only downside-risk proxy…");
ok("low beta/volatility/drawdown scores a real high (safe) proxy", () => {
  const { score } = computeRiskProxy({ beta: 0.7, volatility: 20, distance_from_high: -5 });
  assert.ok(score >= 80, `expected a high safety score, got ${score}`);
});
ok("high beta/volatility/deep-drawdown scores a real low (risky) proxy", () => {
  const { score } = computeRiskProxy({ beta: 2.5, volatility: 100, distance_from_high: -80 });
  assert.ok(score <= 20, `expected a low safety score, got ${score}`);
});
ok("honest null coverage when no real quant risk inputs exist at all", () => {
  const { score } = computeRiskProxy({});
  assert.strictEqual(score, null);
});

console.log("Checking synthesize — real 3-way score separation…");
ok("a strong company on every real axis scores high wealth/entry, and defers to a real Risk agent score when present", () => {
  const ctx = {
    metrics: { distance_from_high: -18, beta: 0.9, volatility: 25 },
    technical: { technical_score: 85 },
    potential: { future_potential_score: 90 },
  };
  const agentRows = [{ agent_name: "Valuation", score: 75 }, { agent_name: "Risk", score: 88 }];
  const r = synthesize(ctx, agentRows);
  assert.ok(r.future_wealth_score >= 80, `expected high wealth score, got ${r.future_wealth_score}`);
  assert.strictEqual(r.risk_score, 88, "must defer to the real Risk agent score when one exists");
  assert.strictEqual(r.components.risk.source, "risk-agent");
});
ok("with no agent data at all, wealth/entry are honestly computed from quant+technical only and risk falls back to the quant proxy", () => {
  const ctx = {
    metrics: { distance_from_high: -18, beta: 1.0, volatility: 30 },
    technical: { technical_score: 60 },
    potential: { future_potential_score: 55 },
  };
  const r = synthesize(ctx, []);
  assert.ok(r.future_wealth_score != null);
  assert.strictEqual(r.components.risk.source, "quant-proxy");
  assert.strictEqual(r.components.wealth.inputs.agentAvg, null);
});
ok("a company with zero real data anywhere honestly scores null on every axis, never a fabricated midpoint", () => {
  const r = synthesize({ metrics: {}, technical: {}, potential: {} }, []);
  assert.strictEqual(r.future_wealth_score, null);
  assert.strictEqual(r.current_entry_score, null);
  assert.strictEqual(r.risk_score, null);
});

console.log("Checking composeVerdict — real, deterministic, honest about gaps…");
ok("mentions when no agent swarm data exists yet, rather than staying silent about the gap", () => {
  const r = synthesize({ metrics: { distance_from_high: -18 }, technical: { technical_score: 60 }, potential: { future_potential_score: 55 } }, []);
  const v = composeVerdict(r);
  assert.ok(v.includes("no agent swarm data yet"));
});

console.log(`\n${passed} checks passed.`);
console.log("FUTURE-WALLET-SYNTHESIS TEST OK");
