"use strict";
// risk-score.test.js — the additive, observational Unified Risk Score
// (2026-09-13, explicit user task: "ADD UNIFIED RISK SCORE ONLY"). Tests
// computeRiskScore directly (unit-level, no engine dependencies needed —
// it only reads a few fields off dataHealth/marketRegime/eventRisk) plus
// one integration check confirming buildAssetDecision's existing
// verdict/blocker behavior is unchanged with the new fields present.
const assert = require("node:assert");
const { computeRiskScore, buildAssetDecision } = require("../src/asset-decision");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking computeRiskScore — additive Unified Risk Score...");

ok("LOW-RISK case: healthy data, supportive regime, no event/critical risk -> low score", () => {
  const r = computeRiskScore({
    dataHealth: { canTrade: true, score: 100 },
    marketRegime: { regime: "RISK_ON" },
    eventRisk: { blocksNewExposure: false, score: 0 },
    criticalFlags: 0,
    committee: null,
    riskReward: 2.5,
  });
  assert.ok(r.score < 20, `expected LOW score, got ${r.score}`);
  assert.strictEqual(r.level, "LOW");
});

ok("MEDIUM-RISK case: mixed regime, moderate event risk, some uncertainty -> elevated middle range", () => {
  const r = computeRiskScore({
    dataHealth: { canTrade: true, score: 80 },
    marketRegime: { regime: "NEUTRAL" },
    eventRisk: { blocksNewExposure: false, score: 40 },
    criticalFlags: 1,
    committee: null,
    riskReward: 1.2,
  });
  assert.ok(r.score >= 20 && r.score <= 59, `expected NORMAL/ELEVATED range, got ${r.score}`);
});

ok("HIGH-RISK case: stale/bad data, hostile regime, major event risk, critical warning -> high/critical score", () => {
  const r = computeRiskScore({
    dataHealth: { canTrade: false, score: 20 },
    marketRegime: { regime: "CRISIS" },
    eventRisk: { blocksNewExposure: true, reason: "FOMC in 4 hours" },
    criticalFlags: 3,
    committee: { blocksStrongBuy: true, criticalConcerns: ["stale_filing", "liquidity"] },
    riskReward: 0.5,
  });
  assert.ok(r.score >= 60, `expected HIGH/CRITICAL score, got ${r.score}`);
  assert.ok(["HIGH", "CRITICAL"].includes(r.level));
  assert.ok(r.contributors.length > 0);
});

ok("BOUNDARY: score always stays within 0-100 even at the real worst-case input combination", () => {
  const r = computeRiskScore({
    dataHealth: { canTrade: false, score: 0 },
    marketRegime: { regime: "CRISIS" },
    eventRisk: { blocksNewExposure: true },
    criticalFlags: 99,
    committee: { blocksStrongBuy: true, criticalConcerns: ["a", "b", "c", "d", "e"] },
    riskReward: 0,
  });
  assert.ok(r.score >= 0 && r.score <= 100, `score out of bounds: ${r.score}`);
  assert.ok(Number.isFinite(r.score), "score must never be NaN");
});

ok("missing/unavailable inputs use a conservative non-zero default, never silently 'safe'", () => {
  const r = computeRiskScore({ dataHealth: null, marketRegime: null, eventRisk: null, criticalFlags: 0, committee: null, riskReward: null });
  assert.ok(r.score > 0, `missing data should not read as zero risk, got ${r.score}`);
});

console.log("\nChecking buildAssetDecision — riskScore is additive, existing verdict/blocker behavior unchanged...");

const opportunity = {
  symbol: "TEST", price: 100, verdict: "BUY", verdictReason: "Canonical setup is actionable.",
  tier: "ACTIONABLE", entryStage: "BREAKOUT", score: 82, entryScore: 80, criticalFlags: 0, redFlags: [],
  reasons: ["Trend confirmed"], breakdown: { trend: 12, momentum: 8 },
  entryPlan: { entryPrice: 100, stop: 95, target1: 110, target2: 115, rr: 2 }, fingerprint: {}, chaseRisk: "NORMAL",
};
const riskOn = { regime: "RISK_ON" };
const crisis = { regime: "CRISIS" };
const healthy = { canTrade: true, score: 100, sources: [] };

ok("REGRESSION: a BUY that passes risk policy still reads BUY, and now also carries a real riskScore", () => {
  const d = buildAssetDecision({ opportunity, marketRegime: riskOn, dataHealth: healthy, timestamp: 2_000_000 });
  assert.strictEqual(d.verdict, "BUY");
  assert.strictEqual(d.riskOverride, null);
  assert.ok(Number.isFinite(d.riskScore));
  assert.ok(["LOW", "NORMAL", "ELEVATED", "HIGH", "CRITICAL"].includes(d.riskLevel));
  assert.ok(Array.isArray(d.riskContributors));
});

ok("REGRESSION: CRISIS still blocks the BUY to AVOID exactly as before, riskScore is purely additive alongside it", () => {
  const d = buildAssetDecision({ opportunity, marketRegime: crisis, dataHealth: healthy, timestamp: 2_000_000 });
  assert.strictEqual(d.verdict, "AVOID");
  assert.strictEqual(d.riskOverride.from, "BUY");
  assert.ok(Number.isFinite(d.riskScore));
  assert.ok(d.riskScore >= 20, "CRISIS regime should register real elevated risk");
});

console.log(`\n${passed} check(s) passed.`);
