"use strict";
// Real tests for src/property-engine.js — "STOCKS + PROPERTIES" master
// prompt (2026-09-16), Property Engine math. Pure functions, no network —
// same convention as top50-scanner-score.test.js/what-to-pay.test.js.
const assert = require("node:assert");
const {
  PROPERTY_ENGINE_DEFAULTS, monthlyMortgagePayment,
  computeTrueCost, computeFlipAnalysis, computeRentalAnalysis, computeComparablesQuality,
  computeRentalDealScore, computeFlipDealScore,
} = require("../src/property-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking monthlyMortgagePayment — real standard amortization formula…");

ok("a real $240k loan @ 7.5%/30yr matches the well-known standard amortization result (~$1,678)", () => {
  const m = monthlyMortgagePayment(240000, 0.075, 30);
  assert.ok(m > 1670 && m < 1690, `got ${m}`);
});

ok("a real $0 loan (100% cash) has a real $0 payment, never NaN/divide-by-zero", () => {
  assert.strictEqual(monthlyMortgagePayment(0, 0.075, 30), 0);
});

console.log("\nChecking computeTrueCost — real acquisition cost, never assumes repairs = $0 when unspecified…");

ok("real closing costs computed off the real default %, repairCost left null (not 0) when omitted", () => {
  const r = computeTrueCost({ purchasePrice: 200000 });
  assert.strictEqual(r.closingCosts, 200000 * PROPERTY_ENGINE_DEFAULTS.buyClosingCostPct);
  assert.strictEqual(r.repairCost, null);
  assert.strictEqual(r.repairCostProvided, false);
  assert.strictEqual(r.totalCost, 200000 + r.closingCosts);
});

ok("a real supplied repair cost is added into totalCost and flagged provided", () => {
  const r = computeTrueCost({ purchasePrice: 200000, repairCost: 30000 });
  assert.strictEqual(r.repairCostProvided, true);
  assert.strictEqual(r.totalCost, 200000 + r.closingCosts + 30000);
});

ok("invalid/missing purchasePrice returns null, never a fabricated cost", () => {
  assert.strictEqual(computeTrueCost({}), null);
  assert.strictEqual(computeTrueCost({ purchasePrice: 0 }), null);
});

console.log("\nChecking computeFlipAnalysis — real ARV-based spread, requires a real repair cost input…");

ok("missing repairCost returns repairCostRequired:true, never assumes $0 rehab", () => {
  const r = computeFlipAnalysis({ purchasePrice: 200000, arv: 300000 });
  assert.strictEqual(r.repairCostRequired, true);
});

ok("a real worked flip example computes real profit/ROI/70%-rule off real inputs", () => {
  // purchase 200k, repair 40k, ARV 320k
  const r = computeFlipAnalysis({ purchasePrice: 200000, repairCost: 40000, arv: 320000 });
  assert.strictEqual(r.repairCostRequired, false);
  const buyClosing = 200000 * PROPERTY_ENGINE_DEFAULTS.buyClosingCostPct;
  const sellClosing = 320000 * PROPERTY_ENGINE_DEFAULTS.sellClosingCostPct;
  assert.ok(Math.abs(r.buyClosingCosts - buyClosing) < 0.01);
  assert.ok(Math.abs(r.sellingCosts - sellClosing) < 0.01);
  const totalCost = 200000 + buyClosing + 40000;
  assert.ok(Math.abs(r.totalCost - totalCost) < 0.01);
  const netProceeds = 320000 - sellClosing;
  assert.ok(Math.abs(r.netProceeds - netProceeds) < 0.01);
  assert.ok(Math.abs(r.profit - (netProceeds - totalCost)) < 0.01);
  // 200000 + 40000 = 240000 vs 320000*0.70 = 224000 -> FAILS the 70% rule
  assert.strictEqual(r.meetsSeventyPercentRule, false);
});

ok("a real deal that clears the 70% rule is flagged true, with a real max-offer figure", () => {
  const r = computeFlipAnalysis({ purchasePrice: 150000, repairCost: 30000, arv: 320000 });
  // 150000 + 30000 = 180000 vs 320000*0.70=224000 -> passes
  assert.strictEqual(r.meetsSeventyPercentRule, true);
  assert.ok(Math.abs(r.maxOfferAtSeventyPercent - (320000 * 0.70 - 30000)) < 0.01);
});

console.log("\nChecking computeRentalAnalysis — real amortized mortgage + real named default assumptions…");

ok("a real worked rental example produces internally-consistent NOI/cap-rate/cash-on-cash figures", () => {
  const r = computeRentalAnalysis({ purchasePrice: 250000, rentEstimate: 2200 });
  assert.ok(r.monthlyMortgage > 0);
  assert.ok(Math.abs(r.downPayment - 250000 * PROPERTY_ENGINE_DEFAULTS.downPaymentPct) < 0.01);
  assert.ok(Math.abs(r.monthlyCashFlow - (2200 - r.monthlyOperatingExpenses - r.monthlyMortgage)) < 0.01);
  assert.ok(Math.abs(r.capRate - r.noiAnnual / 250000) < 1e-9);
  assert.ok(Math.abs(r.cashOnCashReturn - (r.annualCashFlow / r.cashInvested)) < 1e-9);
});

ok("cap rate is computed on NOI which excludes debt service (mortgage), a real, distinct figure from cash-on-cash", () => {
  const r = computeRentalAnalysis({ purchasePrice: 250000, rentEstimate: 2200 });
  const noiWithoutMortgage = (2200 * 12) - (r.monthlyOperatingExpenses * 12);
  assert.ok(Math.abs(r.noiAnnual - noiWithoutMortgage) < 0.01);
});

ok("the real, well-known 1% rule check is honest — rent >= 1% of price passes, below it fails", () => {
  const passes = computeRentalAnalysis({ purchasePrice: 100000, rentEstimate: 1200 });
  const fails = computeRentalAnalysis({ purchasePrice: 400000, rentEstimate: 2200 });
  assert.strictEqual(passes.onePercentRuleMet, true);
  assert.strictEqual(fails.onePercentRuleMet, false);
});

ok("invalid/missing price or rent returns null, never a fabricated read", () => {
  assert.strictEqual(computeRentalAnalysis({ purchasePrice: 200000 }), null);
  assert.strictEqual(computeRentalAnalysis({ rentEstimate: 2000 }), null);
});

console.log("\nChecking computeComparablesQuality — real RentCast comparables[], never a fabricated confidence…");

ok("no real comparables -> honest zero quality, not a guessed default", () => {
  assert.deepStrictEqual(computeComparablesQuality([]), { compCount: 0, avgCorrelation: null, quality: 0 });
  assert.deepStrictEqual(computeComparablesQuality(null), { compCount: 0, avgCorrelation: null, quality: 0 });
});

ok("more real comps with higher real correlation values score higher, never lower", () => {
  const thin = computeComparablesQuality([{ correlation: 0.5 }]);
  const rich = computeComparablesQuality(Array.from({ length: 10 }, () => ({ correlation: 0.95 })));
  assert.ok(rich.quality > thin.quality);
  assert.strictEqual(rich.compCount, 10);
});

console.log("\nChecking Deal Scores — real, additive, bounded 0-100, never fabricated precision…");

ok("computeRentalDealScore stays within real 0-100 bounds and rewards real stronger reads", () => {
  const weak = computeRentalDealScore({ capRate: 0.02, cashOnCashReturn: 0.01, onePercentRuleMet: false, compQuality: 20 });
  const strong = computeRentalDealScore({ capRate: 0.09, cashOnCashReturn: 0.11, onePercentRuleMet: true, compQuality: 90 });
  assert.ok(weak >= 0 && weak <= 100);
  assert.ok(strong >= 0 && strong <= 100);
  assert.ok(strong > weak);
});

ok("computeFlipDealScore stays within real 0-100 bounds and rewards a real 70%-rule pass + real higher ROI", () => {
  const weak = computeFlipDealScore({ roi: 0.02, meetsSeventyPercentRule: false, spreadPct: 0.05, compQuality: 20 });
  const strong = computeFlipDealScore({ roi: 0.25, meetsSeventyPercentRule: true, spreadPct: 0.30, compQuality: 90 });
  assert.ok(weak >= 0 && weak <= 100);
  assert.ok(strong >= 0 && strong <= 100);
  assert.ok(strong > weak);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("PROPERTY-ENGINE TEST FAILED");
else console.log("PROPERTY-ENGINE TEST OK");
