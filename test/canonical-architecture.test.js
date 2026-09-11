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
ok("canonical pipeline recognizes provider timestamps for optional freshness", () => {
  const realNow = Date.now();
  const h = computeCanonicalAssetDecision({ symbol: "TEST", row: { symbol: "TEST", price: 100, entry: 100, stop: 95, target2: 110, passCount: 7, rsRating: 80, stage: "Stage 2", vcpScore: 80 }, macroQuotes: [{ symbol: "SPY", changesPercentage: 1 }, { symbol: "QQQ", changesPercentage: 1 }, { symbol: "VIX", price: 14 }], fundamentals: { updatedAt: realNow - 2 * 86400000 }, nowMs: realNow });
  assert.equal(h.dataHealth.sources.find((s) => s.source === "fundamentals").status, "STALE");
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

console.log("\nChecking Trade Score / Model Confidence / Data Quality / Estimated Probability separation (2026-09-11 Quant Agent requirement — never present an uncalibrated number as a probability)…");

ok("tradeScore exposes the real setup-quality composite, unchanged and un-conflated with anything else", () => {
  assert.equal(allowed.tradeScore, opportunity.score);
  assert.equal(allowed.tradeScore, allowed.opportunityScore);
});
ok("dataQuality/dataQualityStatus are the real per-source completeness score, exposed at the top level", () => {
  assert.equal(allowed.dataQuality, healthy.score);
  assert.equal(allowed.dataQualityStatus, healthy.status);
  assert.equal(staleBlocked.dataQuality, stale.score);
  assert(staleBlocked.dataQuality < allowed.dataQuality);
});
ok("modelConfidence is a real, distinct field from tradeScore and confidence — never just an alias", () => {
  assert.notEqual(allowed.modelConfidence, allowed.tradeScore);
  assert(Number.isFinite(allowed.modelConfidence));
  assert(allowed.modelConfidence >= 0 && allowed.modelConfidence <= 100);
});
ok("modelConfidence takes a real penalty for active critical red flags — a reliability concern, not a setup-quality one", () => {
  const flagged = buildAssetDecision({ opportunity: { ...opportunity, criticalFlags: 2 }, marketRegime: riskOn, dataHealth: healthy, timestamp: now });
  assert(flagged.modelConfidence < allowed.modelConfidence);
  // tradeScore itself is untouched by this — that's the setup-quality
  // dimension's own concern, not model confidence's.
  assert.equal(flagged.tradeScore, allowed.tradeScore);
});
ok("no historical track record at all -> estimatedProbability is honestly null, never fabricated, status NOT_CALIBRATED", () => {
  assert.equal(allowed.estimatedProbability, null);
  assert.equal(allowed.probabilityCalibrationStatus, "NOT_CALIBRATED");
});
ok("a real historical sample below the minimum threshold -> still honestly null, status INSUFFICIENT_SAMPLE, never shown as if calibrated", () => {
  const thin = buildAssetDecision({ opportunity: { ...opportunity, probability: undefined, probabilitySampleCount: 4 }, marketRegime: riskOn, dataHealth: healthy, timestamp: now });
  assert.equal(thin.estimatedProbability, null);
  assert.equal(thin.probabilityCalibrationStatus, "INSUFFICIENT_SAMPLE");
});
ok("a real, sufficiently-sampled historical win rate -> surfaced as CALIBRATED, and genuinely raises modelConfidence over the same setup with no track record", () => {
  const calibrated = buildAssetDecision({ opportunity: { ...opportunity, probability: 0.64, probabilitySampleCount: 25 }, marketRegime: riskOn, dataHealth: healthy, timestamp: now });
  assert.equal(calibrated.estimatedProbability, 0.64);
  assert.equal(calibrated.probabilityCalibrationStatus, "CALIBRATED");
  assert(calibrated.modelConfidence > allowed.modelConfidence);
});
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
ok("canonical pipeline wires the formal Red-Team review centrally — every consumer gets it for free, forwarded onto opportunity the same way assetDecision already is", () => {
  assert(pipelineResult?.redTeam);
  assert.strictEqual(pipelineResult.opportunity.redTeam, pipelineResult.redTeam);
  assert.equal(pipelineResult.redTeam.reviewedVerdict, pipelineResult.assetDecision.verdict);
});
ok("legacy Alpaca paper Autopilot tiers only canonical executable Final Verdicts", () => {
  assert.equal(tierForFinalDecision({ verdict: "STRONG_BUY" }), "A");
  assert.equal(tierForFinalDecision({ verdict: "BUY" }), "B");
  for (const verdict of ["WATCH", "WAIT", "HOLD", "REDUCE", "EXIT", "AVOID", "EARLY_BUY", null]) {
    assert.equal(tierForFinalDecision({ verdict }), null);
  }
});
ok("execution authority is paper-only and separates mutators from read-only jobs", () => {
  const status = executionStatus({ serverAutopilot: true, lightboxMode: "ASSIST", tradierMode: "autopilot" });
  assert.equal(status.paperOnly, true);
  assert.deepEqual(status.activeMutators, ["SERVER_AUTOPILOT", "LIGHTBOX_ASSIST", "TRADIER_AUTOEXEC"]);
  assert(status.readOnlySchedulers.includes("SCANNERS"));
});
ok("execution authority reports ADOL22 Autopilot 2.0 as an active mutator whenever it isn't OFF — real gap found in the 2026-09-10 platform audit (it mutates real paper positions via autopilot2-engine.js but was previously invisible to /api/health)", () => {
  const off = executionStatus({ autopilot2State: "OFF" });
  assert(!off.activeMutators.includes("ADOL22_AUTOPILOT2"));
  for (const state of ["RUNNING", "SAFE_MODE", "PAUSED"]) {
    const status = executionStatus({ autopilot2State: state });
    assert(status.activeMutators.includes("ADOL22_AUTOPILOT2"), `state ${state} should report ADOL22_AUTOPILOT2 as active`);
  }
  // No state passed at all must default to the honest "not visible/off" reading, never silently omitting a running tick.
  assert(!executionStatus({}).activeMutators.includes("ADOL22_AUTOPILOT2"));
});
ok("research context is bounded context, never a final verdict", () => {
  const c = buildResearchContext({ researchIntel: { narrativeShifts: [{ dimension: "fed-policy-direction", state: "DETERIORATING", shifted: true }], cards: [{ risk: "HIGH" }] } });
  assert.equal(c.available, true);
  assert.equal(c.highRiskCount, 1);
  assert.equal(c.verdict, undefined);
});
console.log(`\n${passed} checks passed.`);
if (!process.exitCode) console.log("CANONICAL-ARCHITECTURE TEST OK");
