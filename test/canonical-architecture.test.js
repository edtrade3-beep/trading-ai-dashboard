"use strict";
const assert = require("node:assert");
const { computeDataHealth } = require("../src/data-health-engine");
const { computeMarketRegimeState, isCanonicalRegime } = require("../src/market-regime-engine");
const { buildAssetDecision, FINAL_VERDICTS, OPPORTUNITY_STAGES } = require("../src/asset-decision");
const { computeCanonicalAssetDecision } = require("../src/canonical-decision-pipeline");
const { computeEventRisk } = require("../src/event-risk-engine");
const { tierForFinalDecision } = require("../src/server-autopilot");
const { executionStatus } = require("../src/execution-authority");
const { buildResearchContext } = require("../src/research-context-adapter");
let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }
const now = 2_000_000;
const healthy = computeDataHealth([{ source: "price", timestamp: now - 1_000, staleAfterMs: 60_000 }, { source: "macro", timestamp: now - 2_000, staleAfterMs: 60_000 }], { nowMs: now });
const stale = computeDataHealth([{ source: "price", timestamp: now - 120_000, staleAfterMs: 60_000 }], { nowMs: now });
ok("healthy required sources permit trading", () => { assert.equal(healthy.canTrade, true); assert.equal(healthy.score, 100); });
ok("data health reports optional source availability without blocking", () => {
  const h = computeDataHealth([{ source: "price", timestamp: now - 1_000, staleAfterMs: 60_000 }, { source: "news", available: false, required: false }], { nowMs: now });
  assert.equal(h.canTrade, true);
  assert.equal(h.sources.find((s) => s.source === "news").status, "UNAVAILABLE");
});
ok("stale required source fails closed", () => { assert.equal(stale.canTrade, false); assert.equal(stale.sources[0].status, "STALE"); });
const riskOn = computeMarketRegimeState({ macroQuotes: [{ symbol: "SPY", changesPercentage: 1 }, { symbol: "QQQ", changesPercentage: 1.2 }, { symbol: "VIX", price: 14 }], dataHealth: healthy, timestamp: now });
const crisis = computeMarketRegimeState({ macroQuotes: [{ symbol: "SPY", changesPercentage: -3 }, { symbol: "QQQ", changesPercentage: -4 }, { symbol: "VIX", price: 40 }], dataHealth: healthy, timestamp: now });
ok("regime engine emits only canonical vocabulary", () => { assert.equal(isCanonicalRegime(riskOn.regime), true); assert.equal(isCanonicalRegime(crisis.regime), true); });
ok("real volatility crisis overrides ambiguity", () => assert.equal(crisis.regime, "CRISIS"));
const opportunity = { symbol: "TEST", price: 100, verdict: "BUY", verdictReason: "Canonical setup is actionable.", tier: "ACTIONABLE", entryStage: "BREAKOUT", score: 82, entryScore: 80, criticalFlags: 0, redFlags: [], reasons: ["Trend confirmed"], breakdown: { trend: 12, momentum: 8 }, entryPlan: { entryPrice: 100, stop: 95, target1: 110, target2: 115, rr: 2 }, fingerprint: {}, chaseRisk: "NORMAL" };
const allowed = buildAssetDecision({ opportunity, marketRegime: riskOn, dataHealth: healthy, timestamp: now });
const blocked = buildAssetDecision({ opportunity, marketRegime: crisis, dataHealth: healthy, timestamp: now });
const staleBlocked = buildAssetDecision({ opportunity, marketRegime: riskOn, dataHealth: stale, timestamp: now });
ok("AssetDecision uses standardized vocabularies", () => { assert(FINAL_VERDICTS.has(allowed.verdict)); assert(OPPORTUNITY_STAGES.has(allowed.opportunityStage)); });
ok("canonical BUY remains BUY when risk permits", () => assert.equal(allowed.verdict, "BUY"));
ok("risk layer blocks a BUY in CRISIS and explains it", () => { assert.equal(blocked.verdict, "AVOID"); assert.equal(blocked.riskOverride.from, "BUY"); });
ok("stale required data blocks BUY and lowers confidence", () => { assert.equal(staleBlocked.verdict, "WAIT"); assert(staleBlocked.confidence < allowed.confidence); });
ok("event risk blocks imminent earnings without fabricating missing events", () => {
  const e = computeEventRisk({ earningsDte: 1, nowMs: now });
  assert.equal(e.blocksNewExposure, true);
  assert.match(e.reason, /Earnings/);
  assert.equal(computeEventRisk({ nowMs: now }).blocksNewExposure, false);
});
const pipelineResult = computeCanonicalAssetDecision({
  symbol: "TEST",
  row: {
    symbol: "TEST", price: 100, entry: 100, pivot: 100, stop: 95, target2: 110,
    passCount: 8, rsRating: 90, momentum: 80, stage: "Stage 2 — Confirmed",
    volRatio: 2, breakoutConfirmed: true, extended: false, abovePivotPct: 0,
    vcpScore: 90, riskPct: 5, pctFromHigh: -2, dollarVolume: 50_000_000,
  },
  macroQuotes: [{ symbol: "SPY", changesPercentage: 1 }, { symbol: "QQQ", changesPercentage: 1 }, { symbol: "VIX", price: 14 }],
  nowMs: now,
});
ok("canonical pipeline returns one linked opportunity/regime/health/final-decision state", () => {
  assert(pipelineResult?.opportunity);
  assert.strictEqual(pipelineResult.opportunity.assetDecision, pipelineResult.assetDecision);
  assert(FINAL_VERDICTS.has(pipelineResult.assetDecision.verdict));
  assert(isCanonicalRegime(pipelineResult.marketRegime.regime));
  assert(Number.isFinite(pipelineResult.assetDecision.riskReward));
});
ok("legacy Alpaca paper Autopilot tiers only canonical executable Final Verdicts", () => {
  assert.equal(tierForFinalDecision({ verdict: "STRONG_BUY" }), "A");
  assert.equal(tierForFinalDecision({ verdict: "BUY" }), "B");
  for (const verdict of ["WATCH", "WAIT", "HOLD", "REDUCE", "EXIT", "AVOID", "EARLY_BUY", null]) {
    assert.equal(tierForFinalDecision({ verdict }), null);
  }
});
ok("execution authority is paper-only and separates mutators from read-only jobs", () => {
  const status = executionStatus({ serverAutopilot: true, lightboxMode: "ASSIST" });
  assert.equal(status.paperOnly, true);
  assert.deepEqual(status.activeMutators, ["SERVER_AUTOPILOT", "LIGHTBOX_ASSIST"]);
  assert(status.readOnlySchedulers.includes("SCANNERS"));
});
ok("research context is bounded context, never a final verdict", () => {
  const c = buildResearchContext({ researchIntel: { narrativeShifts: [{ dimension: "fed-policy-direction", state: "DETERIORATING", shifted: true }], cards: [{ risk: "HIGH" }] } });
  assert.equal(c.available, true);
  assert.equal(c.highRiskCount, 1);
  assert.equal(c.verdict, undefined);
});
console.log(`\n${passed} checks passed.`);
if (!process.exitCode) console.log("CANONICAL-ARCHITECTURE TEST OK");
