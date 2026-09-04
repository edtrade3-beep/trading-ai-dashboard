// Real tests for src/investment-committee.js — the disagreement-surfacing
// layer over the canonical pipeline's already-computed signals. Run:
// node test/investment-committee.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { computeInvestmentCommittee, REVIEWER_KEYS } = require("../src/investment-committee");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

console.log("Checking computeInvestmentCommittee — honest per-reviewer reads, never fabricated…");

ok("no real inputs at all -> every reviewer honestly NOT_EVALUATED except entry-independent ones default sanely, never blocks STRONG_BUY off missing data", () => {
  const c = computeInvestmentCommittee({});
  for (const k of REVIEWER_KEYS) assert.ok(c.reviewers[k].verdict, `${k} must have a real verdict`);
  assert.strictEqual(c.reviewers.fundamentalQuality.verdict, "NOT_EVALUATED");
  assert.strictEqual(c.reviewers.accountingValuation.verdict, "NOT_EVALUATED");
  assert.strictEqual(c.reviewers.portfolioCorrelation.verdict, "NOT_EVALUATED");
  assert.strictEqual(c.blocksStrongBuy, false, "must never block off absent/NOT_EVALUATED data");
});

ok("a real critical red flag -> adversarialBearCase CONCERN and blocksStrongBuy true", () => {
  const c = computeInvestmentCommittee({ opportunity: { criticalFlags: 1, redFlags: ["real flag"] } });
  assert.strictEqual(c.reviewers.adversarialBearCase.verdict, "CONCERN");
  assert.strictEqual(c.blocksStrongBuy, true);
});

ok("real reversalTopRisk alone (no critical flags) -> adversarialBearCase CONCERN", () => {
  const c = computeInvestmentCommittee({ opportunity: { criticalFlags: 0, redFlags: [], reversalTopRisk: true } });
  assert.strictEqual(c.reviewers.adversarialBearCase.verdict, "CONCERN");
  assert.strictEqual(c.blocksStrongBuy, true);
});

ok("real clean red-flag data (present, empty, no reversal risk) -> adversarialBearCase SUPPORTIVE, not NOT_EVALUATED", () => {
  const c = computeInvestmentCommittee({ opportunity: { criticalFlags: 0, redFlags: [], reversalTopRisk: false } });
  assert.strictEqual(c.reviewers.adversarialBearCase.verdict, "SUPPORTIVE");
});

ok("real dataHealth.canTrade false -> dataQuality CONCERN and blocksStrongBuy true", () => {
  const c = computeInvestmentCommittee({ dataHealth: { canTrade: false, blockers: ["price: stale"] } });
  assert.strictEqual(c.reviewers.dataQuality.verdict, "CONCERN");
  assert.strictEqual(c.blocksStrongBuy, true);
});

ok("real dataHealth DEGRADED but canTrade true -> dataQuality NEUTRAL, does not block STRONG_BUY", () => {
  const c = computeInvestmentCommittee({ dataHealth: { canTrade: true, status: "DEGRADED", blockers: [] } });
  assert.strictEqual(c.reviewers.dataQuality.verdict, "NEUTRAL");
  assert.strictEqual(c.blocksStrongBuy, false);
});

ok("real dataHealth healthy -> dataQuality SUPPORTIVE", () => {
  const c = computeInvestmentCommittee({ dataHealth: { canTrade: true, status: "HEALTHY", blockers: [] } });
  assert.strictEqual(c.reviewers.dataQuality.verdict, "SUPPORTIVE");
});

ok("real eventRisk.blocksNewExposure -> eventRisk CONCERN and blocksStrongBuy true", () => {
  const c = computeInvestmentCommittee({ eventRisk: { blocksNewExposure: true, reason: "earnings in 1 day" } });
  assert.strictEqual(c.reviewers.eventRisk.verdict, "CONCERN");
  assert.strictEqual(c.blocksStrongBuy, true);
});

ok("real CRISIS regime -> macroRegimeFit CONCERN but does NOT alone block STRONG_BUY (regime already handled by applyRiskPolicy's own blockers)", () => {
  const c = computeInvestmentCommittee({ marketRegime: { regime: "CRISIS" } });
  assert.strictEqual(c.reviewers.macroRegimeFit.verdict, "CONCERN");
  assert.strictEqual(c.blocksStrongBuy, false);
});

ok("real RISK_ON regime -> macroRegimeFit SUPPORTIVE", () => {
  const c = computeInvestmentCommittee({ marketRegime: { regime: "RISK_ON" } });
  assert.strictEqual(c.reviewers.macroRegimeFit.verdict, "SUPPORTIVE");
});

ok("real DO_NOT_CHASE chase risk -> technicalTiming CONCERN", () => {
  const c = computeInvestmentCommittee({ opportunity: { entryStage: "CONFIRMATION", chaseRisk: "DO_NOT_CHASE" } });
  assert.strictEqual(c.reviewers.technicalTiming.verdict, "CONCERN");
});

ok("real STRUCTURE_BROKEN entry stage -> technicalTiming CONCERN even with no chase-risk band", () => {
  const c = computeInvestmentCommittee({ opportunity: { entryStage: "STRUCTURE_BROKEN" } });
  assert.strictEqual(c.reviewers.technicalTiming.verdict, "CONCERN");
});

ok("a real mix of SUPPORTIVE and CONCERN reviewers -> disagreement true", () => {
  const c = computeInvestmentCommittee({
    opportunity: { entryStage: "CONFIRMATION", criticalFlags: 1, redFlags: ["x"] },
    marketRegime: { regime: "RISK_ON" },
  });
  assert.strictEqual(c.disagreement, true);
});

ok("all-NOT_EVALUATED input -> disagreement is honestly false, not fabricated agreement or conflict", () => {
  const c = computeInvestmentCommittee({});
  assert.strictEqual(c.disagreement, false);
});

ok("criticalConcerns lists exactly the reviewer keys in CONCERN", () => {
  const c = computeInvestmentCommittee({
    opportunity: { criticalFlags: 1, redFlags: ["x"] },
    eventRisk: { blocksNewExposure: true, reason: "earnings" },
  });
  assert.deepStrictEqual(new Set(c.criticalConcerns), new Set(["adversarialBearCase", "eventRisk"]));
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("INVESTMENT-COMMITTEE TEST FAILED"); else console.log("INVESTMENT-COMMITTEE TEST OK");
