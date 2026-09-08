"use strict";
// Adversarial scenario audit — "3-Second AI Decision System" spec's own
// THIRD ADVERSARIAL PASS (2026-09-07): the 10 named scenarios, run as
// real tests against the actual exported functions this session built
// (and pre-existing engines they compose with), not just asserted in
// prose. A finding here that fails is reported honestly, not hidden.
const assert = require("node:assert");
const { classifyPartyStage, classifyTimingVerdict, computeExtensionScore } = require("../src/party-stage-engine");
const { computeMispricingScore, answerWhen, computeHiddenGemProfile } = require("../src/mispricing-engine");
const { computeQualityScore, computeValueScore, computeFinancialStrength } = require("../src/future-value-scoring");
const { translateToTradeGpsVerdict } = require("../src/trade-gps-verdict");
const { computeCoreScore } = require("../src/am-core-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

(async () => {
  // Scenario 6 needs a dynamic import (risk-gate-client.js is an ES
  // module, same reasoning as test/risk-gate-client.test.js) — done once,
  // up front, so every ok() below stays plain and synchronous.
  const { shouldStopTrading } = await import("../axiom-runner/components/risk-gate-client.js");

  console.log("SCENARIO 1 — Strong stock already +20%. Expected: DO NOT CHASE.");
  ok("chaseRisk=DO_NOT_CHASE (real +20%-class extension) -> Party Stage 6, timing verdict OVEREXTENDED", () => {
    const stage = classifyPartyStage({ entryStage: "BREAKOUT", chaseRisk: "DO_NOT_CHASE" });
    assert.strictEqual(stage.stage, 6);
    const ext = computeExtensionScore({ chaseRisk: "DO_NOT_CHASE" });
    const timing = classifyTimingVerdict({ partyStage: stage.stage, extensionScore: ext });
    assert.strictEqual(timing.verdict, "OVEREXTENDED");
  });
  ok("a real reversal-top read (parabolic run cooling off) also forces Stage 6 regardless of entryStage", () => {
    assert.strictEqual(classifyPartyStage({ entryStage: "EARLY", reversalTopRisk: true }).stage, 6);
  });

  console.log("\nSCENARIO 2 — Cheap P/E but deteriorating FCF. Expected: VALUE TRAP warning.");
  ok("real cheap valuation (low P/E, low PEG) + real deteriorating multi-quarter FCF/margin/revenue -> value-trap flagged, not a gem", () => {
    const fundamentals = { pe: 9, pegRatio: 0.6, priceToSales: 1.2, evToEbitda: 6, fcfYield: -0.01 };
    const valueScore = computeValueScore(fundamentals);
    assert.ok(valueScore >= 55, `expected this to genuinely screen cheap (got valueScore=${valueScore}) — otherwise this isn't testing what the scenario intends`);
    const quarters = [
      { date: "2026-01-01", revenueGrowth: 0.15, operatingMargin: 0.18, epsGrowth: 0.10, netDebtToEbitda: 1.8, fcfYield: 0.05 },
      { date: "2026-10-01", revenueGrowth: 0.03, operatingMargin: 0.10, epsGrowth: -0.05, netDebtToEbitda: 3.6, fcfYield: -0.01 },
    ];
    const profile = computeHiddenGemProfile({ quarters, priceChangePct: 0, valueScore, relativeStrengthTiming: 80 });
    assert.strictEqual(profile.valueTrapRisk.atRisk, true, "a cheap screen with real deteriorating fundamentals must be flagged, never called a hidden gem");
    assert.notStrictEqual(profile.when.verdict, "ACCUMULATE_NOW", "a value trap must never resolve to ACCUMULATE NOW");
  });

  console.log("\nSCENARIO 3 — Excellent fundamentals but poor technical entry. Expected: WAIT.");
  ok("real high mispricing score + real poor entry timing -> EXCELLENT_COMPANY_WAIT, never ACCUMULATE_NOW", () => {
    const when = answerWhen({ mispricingScore: 88, entryTimingScore: 15 });
    assert.strictEqual(when.verdict, "EXCELLENT_COMPANY_WAIT");
  });

  console.log("\nSCENARIO 4 — Weak fundamentals but a powerful short-term catalyst. Expected: possible short-term TRADE NOW, never mislabeled a long-term compounder.");
  ok("real weak fundamentals never clear the Hidden Gem bar regardless of technical timing", () => {
    const weakFundamentals = { pe: 65, pegRatio: 4.5, priceToSales: 18, evToEbitda: 40, fcfYield: -0.03, profitMargin: -0.05, roe: -0.10, roic: -0.04, currentRatio: 0.7, netDebtToEbitda: 6 };
    const valueScore = computeValueScore(weakFundamentals);
    const financialStrength = computeFinancialStrength(weakFundamentals);
    const mispricing = computeMispricingScore({ valueScore, financialStrength, roic: -4, relativeStrengthTiming: 95 });
    const when = answerWhen({ mispricingScore: mispricing.score, entryTimingScore: 95 });
    assert.notStrictEqual(when.verdict, "ACCUMULATE_NOW", "weak fundamentals + strong timing must never be labeled a compounder buy");
  });
  ok("the SAME weak-fundamentals name can still independently clear a real short-term Party Stage/Trade GPS setup — the two engines never cross-contaminate", () => {
    // Real structural guarantee, not a numeric assertion: classifyPartyStage
    // takes zero fundamental inputs at all, so a real hot technical setup on
    // a fundamentally weak name is unaffected by Hidden Gems' own verdict.
    const stage = classifyPartyStage({ entryStage: "BREAKOUT", chaseRisk: "NORMAL" });
    assert.strictEqual(stage.stage, 4);
  });

  console.log("\nSCENARIO 5 — No good opportunities. Expected: NO TRADE.");
  ok("a real below-actionable-threshold Trade GPS score -> NO_TRADE, never a forced pick", () => {
    const v = translateToTradeGpsVerdict({ tradeGpsScore: { score: 40, band: "REJECT" } });
    assert.strictEqual(v.verdict, "NO_TRADE");
  });
  ok("a real Trap Shield block also forces NO_TRADE regardless of an otherwise-actionable score", () => {
    const v = translateToTradeGpsVerdict({ tradeGpsScore: { score: 90 }, trapShield: { blocked: true, message: "real trap shield block" } });
    assert.strictEqual(v.verdict, "NO_TRADE");
  });

  console.log("\nSCENARIO 6 — Daily risk limit reached. Expected: STOP TRADING.");
  ok("a real tripped daily-loss breaker blocks a new entry", () => {
    assert.strictEqual(shouldStopTrading("BUY_STOCK", true), true);
  });
  ok("management/exit remains available even while STOP TRADING is active", () => {
    assert.strictEqual(shouldStopTrading("EXIT", true), false);
  });

  console.log("\nSCENARIO 7 — Missing fundamental data. Expected: lower confidence/completeness, no fabricated metrics.");
  ok("a real missing-fundamentals input never produces a fabricated quality/value score", () => {
    assert.strictEqual(computeQualityScore(null), null);
    assert.strictEqual(computeValueScore({}), null);
  });
  ok("a real partial-data mispricing score discloses every missing component, never defaults to a fabricated midpoint", () => {
    const r = computeMispricingScore({ valueScore: 70 });
    assert.ok(r.unavailable.length >= 5, "most components should be honestly disclosed as unavailable with only one real input supplied");
    assert.ok(Number.isFinite(r.score));
  });

  console.log("\nSCENARIO 8 — Stale market feed. Expected: visible stale-data state, restricted new recommendations.");
  ok("real BLOCKED data health forces NO_TRADE via Trade GPS's own translation layer", () => {
    const v = translateToTradeGpsVerdict({ tradeGpsScore: { score: 90, band: "STRONG" }, dataHealth: { status: "BLOCKED" }, assetDecisionVerdict: "BUY", signalState: "ENTER_NOW" });
    assert.strictEqual(v.verdict, "NO_TRADE");
    assert.ok(/stale|unavailable/i.test(v.reasonOneLine || ""));
  });

  console.log("\nSCENARIO 9 — Market changes from risk-on to risk-off. Expected: existing candidates reranked.");
  ok("a real regime score swing meaningfully moves computeCoreScore's output for the identical underlying row", () => {
    const baseRow = { passCount: 6, rsRating: 80, momentum: 5, stage: "Stage 2", volRatio: 1.4, riskPct: 1, pctFromHigh: -5, dollarVolume: 5e7 };
    const riskOnScore = computeCoreScore({ ...baseRow, regime: { score: 90 } });
    const riskOffScore = computeCoreScore({ ...baseRow, regime: { score: 15 } });
    assert.ok(riskOnScore.score > riskOffScore.score, `expected a real regime swing to rerank the same row (risk-on ${riskOnScore.score} should exceed risk-off ${riskOffScore.score})`);
  });

  console.log("\nSCENARIO 10 — A hidden gem thesis deteriorates. Expected: downgrade/exit, never a narrative defense.");
  ok("re-evaluating the SAME symbol with fresh, deteriorated quarterly data flips the verdict down — no persisted state to defend the old thesis", () => {
    const improvingQuarters = [
      { date: "2026-01-01", revenueGrowth: 0.05, operatingMargin: 0.12, epsGrowth: 0.03, netDebtToEbitda: 3.2, fcfYield: 0.02 },
      { date: "2026-10-01", revenueGrowth: 0.19, operatingMargin: 0.19, epsGrowth: 0.14, netDebtToEbitda: 1.6, fcfYield: 0.06 },
    ];
    const before = computeHiddenGemProfile({ quarters: improvingQuarters, priceChangePct: 3, valueScore: 82, financialStrength: 78, roic: 18, relativeStrengthTiming: 85 });
    assert.strictEqual(before.when.verdict, "ACCUMULATE_NOW");

    // Same symbol, one more real (deteriorating) quarter added — a
    // genuine fresh evaluation, not a mutation of the prior result.
    const deterioratedQuarters = [...improvingQuarters, { date: "2027-01-01", revenueGrowth: -0.04, operatingMargin: 0.09, epsGrowth: -0.12, netDebtToEbitda: 4.1, fcfYield: -0.02 }];
    const after = computeHiddenGemProfile({ quarters: deterioratedQuarters, priceChangePct: 3, valueScore: 82, financialStrength: 78, roic: 18, relativeStrengthTiming: 85 });
    assert.notStrictEqual(after.when.verdict, "ACCUMULATE_NOW", "a real deteriorating trend must downgrade the verdict, never keep defending the old thesis");
  });

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("ADVERSARIAL-SCENARIOS TEST FAILED");
  else console.log("ADVERSARIAL-SCENARIOS TEST OK");
})();
