"use strict";
// Real tests for canonical-decision-pipeline.js's valuation wiring —
// "VALUATION ENGINE" master prompt (2026-09-17), scenarios 9-10: valuation
// must never override lifecycle execution readiness or the existing
// canonical Trade Desk verdict logic. Also confirms 100% backward
// compatibility — every existing caller that never passes fundamentals/
// fundamentalsHistory/forwardEps must see canonical.valuation stay null,
// with zero behavior change anywhere else.
const assert = require("node:assert");
const fs = require("node:fs");
const { computeCanonicalAssetDecision } = require("../src/canonical-decision-pipeline");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

// A real, well-formed row shape this pipeline's own existing tests use.
const REAL_ROW = {
  symbol: "TEST", price: 100, passCount: 7, rsRating: 85, momentum: 1.2, stage: "Stage 2",
  volRatio: 1.8, entry: 98, stop: 92, target2: 110, riskPct: 6, pctFromHigh: -5,
  dayChangePct: 1.5, weekChangePct: 3, rsi: 60, ma50: 95, hi52: 105, lo52: 70,
};
const MACRO = [{ symbol: "SPY", price: 500, changesPercentage: 0.5 }];

console.log("Checking scenario 9: valuation never overrides lifecycle execution readiness…");

ok("with NO fundamentals passed (every existing real caller today), canonical.valuation is honestly null — zero behavior change for existing consumers", () => {
  const canonical = computeCanonicalAssetDecision({ symbol: "TEST", row: REAL_ROW, macroQuotes: MACRO });
  assert.ok(canonical, "pipeline must still return a real result with no fundamentals");
  assert.strictEqual(canonical.valuation, null);
  assert.ok(canonical.assetDecision, "assetDecision must compute normally regardless of valuation");
});

ok("with EXTREME cheap-but-value-trap fundamentals passed, the real tier/signalState/verdict are unchanged from the no-fundamentals run — valuation rides alongside, never feeds back into lifecycle", () => {
  const baseline = computeCanonicalAssetDecision({ symbol: "TEST", row: REAL_ROW, macroQuotes: MACRO });
  const withValuation = computeCanonicalAssetDecision({
    symbol: "TEST", row: REAL_ROW, macroQuotes: MACRO,
    fundamentals: { pe: 5, fcfYield: -0.1, netDebtToEbitda: 6, revenueGrowth: -0.3, earningsGrowth: -0.5, freeCashFlowGrowth: -0.4 },
    fundamentalsHistory: [
      { date: "Q1", revenueGrowth: 0.02, epsGrowth: -0.1, netDebtToEbitda: 3 },
      { date: "Q2", revenueGrowth: -0.3, epsGrowth: -0.5, netDebtToEbitda: 6 },
    ],
  });
  assert.strictEqual(withValuation.opportunity.tier, baseline.opportunity.tier, "tier must be identical regardless of valuation input");
  assert.strictEqual(withValuation.assetDecision.verdict, baseline.assetDecision.verdict, "verdict must be identical regardless of valuation input");
  assert.strictEqual(withValuation.assetDecision.signalState, baseline.assetDecision.signalState, "signalState must be identical regardless of valuation input");
  assert.ok(withValuation.valuation, "valuation should now be a real, populated object");
  assert.ok(withValuation.valuation.valueTrapRisk > 0, "the extreme value-trap case should be reflected in the real valuation object itself");
});

console.log("\nChecking scenario 10: final verdict continues using the existing canonical decision logic (structural)…");

ok("computeCanonicalAssetDecision computes `valuation` from fundamentals/fundamentalsHistory/forwardEps ALONE, strictly after assetDecision is already final — never passed into buildAssetDecision/computeOpportunity", () => {
  const src = fs.readFileSync(require.resolve("../src/canonical-decision-pipeline"), "utf8");
  const assetDecisionIdx = src.indexOf("const assetDecision = buildAssetDecision(");
  const valuationIdx = src.indexOf("const valuation = fundamentals");
  assert.ok(assetDecisionIdx > -1 && valuationIdx > -1, "both real call sites must exist");
  assert.ok(valuationIdx > assetDecisionIdx, "valuation must be computed AFTER assetDecision is already final, per the prompt's own 'must not override' rule");
  // The real buildAssetDecision/computeOpportunity call sites must never
  // receive a valuation-shaped argument.
  assert.doesNotMatch(src, /buildAssetDecision\(\{[^}]*valuation/s);
  assert.doesNotMatch(src, /computeOpportunity\(\{[^}]*valuation/s);
});

ok("valuation-engine.js's computeValuationProfile is never imported by asset-decision.js or opportunity-engine.js — the real lifecycle/verdict engines have zero dependency on valuation", () => {
  const assetDecisionSrc = fs.readFileSync(require.resolve("../src/asset-decision"), "utf8");
  const opportunitySrc = fs.readFileSync(require.resolve("../src/opportunity-engine"), "utf8");
  assert.doesNotMatch(assetDecisionSrc, /valuation-engine/);
  assert.doesNotMatch(opportunitySrc, /valuation-engine/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("VALUATION-CANONICAL-INTEGRATION TEST FAILED");
else console.log("VALUATION-CANONICAL-INTEGRATION TEST OK");
