"use strict";
// Real tests for src/valuation-engine.js — "VALUATION ENGINE" master
// prompt (2026-09-17). Pure functions, no network — future-value-
// scoring.js's/mispricing-engine.js's own real formulas are reused
// directly (already covered by their own test files); these tests cover
// only the genuinely new combinators this file adds.
const assert = require("node:assert");
const {
  computeValuationProfile, valuationLevelFor, valueTrapLevelFor,
  computeGarpStatus, computeValuationTrend, pegStatusFor,
  computeCompanyQualityScore, finalValuationStateFor, computeWarningFlags, buildValuationWhy,
} = require("../src/valuation-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const IMPROVING_HISTORY = [
  { date: "Q1", revenueGrowth: 0.08, epsGrowth: 0.05, operatingMargin: 0.15, netDebtToEbitda: 1.0, fcfYield: 0.04 },
  { date: "Q2", revenueGrowth: 0.11, epsGrowth: 0.09, operatingMargin: 0.17, netDebtToEbitda: 0.8, fcfYield: 0.05 },
  { date: "Q3", revenueGrowth: 0.15, epsGrowth: 0.14, operatingMargin: 0.19, netDebtToEbitda: 0.6, fcfYield: 0.06 },
  { date: "Q4", revenueGrowth: 0.19, epsGrowth: 0.20, operatingMargin: 0.21, netDebtToEbitda: 0.5, fcfYield: 0.07 },
];
const DETERIORATING_HISTORY = [
  { date: "Q1", revenueGrowth: 0.05, epsGrowth: 0.02, operatingMargin: 0.12, netDebtToEbitda: 2.0, fcfYield: 0.02 },
  { date: "Q2", revenueGrowth: 0.00, epsGrowth: -0.05, operatingMargin: 0.10, netDebtToEbitda: 2.8, fcfYield: 0.00 },
  { date: "Q3", revenueGrowth: -0.05, epsGrowth: -0.15, operatingMargin: 0.07, netDebtToEbitda: 3.6, fcfYield: -0.01 },
  { date: "Q4", revenueGrowth: -0.08, epsGrowth: -0.25, operatingMargin: 0.04, netDebtToEbitda: 4.5, fcfYield: -0.02 },
];

console.log("Checking computeValuationProfile — scenario 1: cheap P/E + positive real revisions/trend = positive result…");

ok("cheap valuation + real improving multi-quarter trend produces a strongly-favorable, low-value-trap read", () => {
  const r = computeValuationProfile({
    fundamentals: { pe: 12, pegRatio: 0.8, fcfYield: 0.07, netDebtToEbitda: 0.5, revenueGrowth: 0.15, earningsGrowth: 0.2, freeCashFlowGrowth: 0.1, priceToSales: 2, evToEbitda: 9 },
    fundamentalsHistory: IMPROVING_HISTORY, price: 100, forwardEps: 5,
  });
  assert.ok(r.valuationScore >= 70, `expected a real strongly-favorable score, got ${r.valuationScore}`);
  assert.strictEqual(r.valueTrapLevel, "LOW");
  assert.strictEqual(r.garpStatus, "YES");
  assert.strictEqual(r.valuationTrend, "IMPROVING");
  assert.strictEqual(r.revenueTrend, "ACCELERATING");
});

console.log("\nChecking scenario 2: cheap P/E + collapsing earnings = value-trap warning…");

ok("a real cheap multiple with a real majority-deteriorating multi-quarter trend is flagged HIGH/EXTREME value-trap risk, never treated as a clean buy", () => {
  const r = computeValuationProfile({
    fundamentals: { pe: 8, fcfYield: -0.02, netDebtToEbitda: 4.5, revenueGrowth: -0.08, earningsGrowth: -0.25, freeCashFlowGrowth: -0.3, priceToSales: 0.8, evToEbitda: 6 },
    fundamentalsHistory: DETERIORATING_HISTORY, price: 40,
  });
  assert.ok(r.valueTrapRisk >= 45, `expected a real HIGH+ value-trap score, got ${r.valueTrapRisk}`);
  assert.ok(["HIGH", "EXTREME"].includes(r.valueTrapLevel));
  assert.strictEqual(r.garpStatus, "NO");
  assert.strictEqual(r.valuationTrend, "DETERIORATING");
});

console.log("\nChecking scenario 3: expensive P/E + very high growth = not automatically rejected…");

ok("a real high P/E paired with real strong growth (attractive PEG) still scores a real, non-trivial valuation — never floored just for a high headline multiple", () => {
  const r = computeValuationProfile({
    fundamentals: { pe: 55, pegRatio: 0.9, fcfYield: 0.03, netDebtToEbitda: 0.3, revenueGrowth: 0.45, earningsGrowth: 0.5, freeCashFlowGrowth: 0.4, priceToSales: 8, evToEbitda: 30 },
    fundamentalsHistory: IMPROVING_HISTORY, price: 300,
  });
  assert.ok(r.valuationScore >= 40, `a high-growth expensive stock should not be automatically floored to a rejection score, got ${r.valuationScore}`);
  assert.strictEqual(r.pegStatus, "ATTRACTIVE");
});

console.log("\nChecking scenario 4: negative FCF reduces valuation quality…");

ok("a real negative FCF yield produces a materially lower valuation score than the same stock with positive FCF, all else equal", () => {
  const base = { pe: 20, pegRatio: 1.2, netDebtToEbitda: 1, revenueGrowth: 0.1, earningsGrowth: 0.1, freeCashFlowGrowth: 0.05, priceToSales: 3, evToEbitda: 12 };
  const positiveFcf = computeValuationProfile({ fundamentals: { ...base, fcfYield: 0.06 }, price: 100 });
  const negativeFcf = computeValuationProfile({ fundamentals: { ...base, fcfYield: -0.04 }, price: 100 });
  assert.ok(negativeFcf.valuationScore < positiveFcf.valuationScore, `negative FCF (${negativeFcf.valuationScore}) should score lower than positive FCF (${positiveFcf.valuationScore})`);
});

console.log("\nChecking scenario 5: high debt increases (balance sheet) risk…");

ok("real net-debt/EBITDA above 3x is labeled HIGH balance-sheet risk; below 1x is LOW — never inverted or flattened", () => {
  const high = computeValuationProfile({ fundamentals: { pe: 15, netDebtToEbitda: 4.2 }, price: 50 });
  const low = computeValuationProfile({ fundamentals: { pe: 15, netDebtToEbitda: 0.4 }, price: 50 });
  assert.strictEqual(high.balanceSheetRisk, "HIGH");
  assert.strictEqual(low.balanceSheetRisk, "LOW");
});

console.log("\nChecking scenario 6: historical discount does not automatically equal undervalued (honestly unavailable, not fabricated)…");

ok("peDiscountToHistory/fiveYearMedianPE/sectorForwardPE are always real, honest nulls — no fabricated 5yr-history or sector-median comparison exists in this codebase", () => {
  const r = computeValuationProfile({ fundamentals: { pe: 15, pegRatio: 1 }, price: 100 });
  assert.strictEqual(r.peDiscountToHistory, null);
  assert.strictEqual(r.fiveYearMedianPE, null);
  assert.strictEqual(r.sectorForwardPE, null);
});

console.log("\nChecking scenario 7: missing data returns N/A (null), never zero…");

ok("no real fundamentals at all returns available:false with every score field honestly null, never a fabricated zero", () => {
  const r = computeValuationProfile({});
  assert.strictEqual(r.available, false);
  assert.strictEqual(r.valuationScore, null);
  assert.strictEqual(r.valuationLevel, null);
  assert.notStrictEqual(r.valuationScore, 0);
});

console.log("\nChecking scenario 8: PEG unavailable when growth <= 0…");

ok("pegStatusFor returns null (not a fabricated status) against zero/negative real earnings growth, even with a real positive PEG ratio", () => {
  assert.strictEqual(pegStatusFor(0.8, -0.1), null);
  assert.strictEqual(pegStatusFor(0.8, 0), null);
  assert.strictEqual(pegStatusFor(0.8, 0.1), "ATTRACTIVE");
});

ok("pegStatusFor returns null against a non-positive real PEG ratio too", () => {
  assert.strictEqual(pegStatusFor(-1, 0.1), null);
  assert.strictEqual(pegStatusFor(null, 0.1), null);
});

console.log("\nChecking valuationLevelFor / valueTrapLevelFor / computeValuationTrend banding…");

ok("valuationLevelFor maps the real prompt-specified bands correctly at each boundary", () => {
  assert.strictEqual(valuationLevelFor(95), "EXCEPTIONAL VALUE");
  assert.strictEqual(valuationLevelFor(84), "STRONGLY UNDERVALUED");
  assert.strictEqual(valuationLevelFor(50), "FAIR VALUE");
  assert.strictEqual(valuationLevelFor(10), "EXTREME VALUATION RISK");
  assert.strictEqual(valuationLevelFor(null), null);
});

ok("computeValuationTrend defaults to STABLE with no real multi-quarter data, never a fabricated direction", () => {
  assert.strictEqual(computeValuationTrend(null), "STABLE");
  assert.strictEqual(computeValuationTrend({ totalReal: 0 }), "STABLE");
});

console.log("\nChecking companyQualityScore — real reuse of future-value-scoring.js's own futureScore, never a second growth/quality/moat formula (2026-09-19 follow-up)…");

ok("computeCompanyQualityScore is high for real strong growth/quality/moat/balance-sheet fundamentals", () => {
  const score = computeCompanyQualityScore({
    revenueGrowth: 0.3, earningsGrowth: 0.35, freeCashFlowGrowth: 0.25, profitMargin: 0.2, roe: 0.25, roic: 0.2,
    currentRatio: 2.5, netDebtToEbitda: -0.5, grossMargin: 0.65,
  }, 10);
  assert.ok(score >= 70, `expected a real high company-quality score, got ${score}`);
});

ok("computeCompanyQualityScore is low for real weak fundamentals — never floored to a default", () => {
  const score = computeCompanyQualityScore({
    revenueGrowth: -0.1, earningsGrowth: -0.2, freeCashFlowGrowth: -0.3, profitMargin: 0.01, roe: -0.05, roic: -0.02,
    currentRatio: 0.6, netDebtToEbitda: 5, grossMargin: 0.15,
  }, -10);
  assert.ok(score <= 35, `expected a real low company-quality score, got ${score}`);
});

ok("computeCompanyQualityScore is honestly null with no real fundamentals", () => {
  assert.strictEqual(computeCompanyQualityScore(null), null);
});

ok("computeValuationProfile wires companyQualityScore into the real assembled profile — a separate real score alongside valuationScore, never merged into it", () => {
  const r = computeValuationProfile({
    fundamentals: { pe: 12, pegRatio: 0.8, fcfYield: 0.07, netDebtToEbitda: 0.5, revenueGrowth: 0.15, earningsGrowth: 0.2, freeCashFlowGrowth: 0.1, priceToSales: 2, evToEbitda: 9, profitMargin: 0.2, roe: 0.2, roic: 0.15, currentRatio: 2, grossMargin: 0.5 },
    fundamentalsHistory: IMPROVING_HISTORY, price: 100, forwardEps: 5,
  });
  assert.ok(Number.isFinite(r.companyQualityScore));
  assert.notStrictEqual(r.companyQualityScore, r.valuationScore, "must be a genuinely separate real number, not a duplicate of valuationScore");
});

console.log("\nChecking finalValuationState — a real, simplified 6-state read of the same valuationScore (2026-09-19 follow-up)…");

ok("bands the real spec-requested 6 states correctly, INSUFFICIENT DATA when no real score exists", () => {
  assert.strictEqual(finalValuationStateFor(85), "UNDERVALUED");
  assert.strictEqual(finalValuationStateFor(70), "ATTRACTIVE");
  assert.strictEqual(finalValuationStateFor(50), "FAIRLY VALUED");
  assert.strictEqual(finalValuationStateFor(30), "EXPENSIVE");
  assert.strictEqual(finalValuationStateFor(5), "EXTREMELY EXPENSIVE");
  assert.strictEqual(finalValuationStateFor(null), "INSUFFICIENT DATA");
});

console.log("\nChecking computeWarningFlags — only real, data-backed flags, never the spec's own unavailable ones (EPS-revision history, true 5yr P/E range)…");

ok("real deteriorating fundamentals produce real, specific warning flags", () => {
  const r = computeValuationProfile({
    // earningsGrowth kept slightly positive (not the fixture's own -0.25)
    // so pegStatus is actually evaluated here — PEG is honestly null
    // against non-positive growth (the real, separate, already-tested
    // rule), which would otherwise mask this specific HIGH_PEG flag.
    fundamentals: { pe: 8, fcfYield: -0.02, netDebtToEbitda: 4.5, revenueGrowth: -0.08, earningsGrowth: 0.02, freeCashFlowGrowth: -0.3, priceToSales: 0.8, evToEbitda: 6, pegRatio: 3 },
    fundamentalsHistory: DETERIORATING_HISTORY, price: 40,
  });
  const keys = r.warningFlags.map((f) => f.key);
  assert.ok(keys.includes("FCF_DETERIORATING"));
  assert.ok(keys.includes("HIGH_LEVERAGE"));
  assert.ok(keys.includes("HIGH_PEG"));
  assert.ok(r.warningFlags.every((f) => typeof f.label === "string" && f.label.length > 0), "every flag must carry a real, non-empty label");
});

ok("clean, improving fundamentals produce zero warning flags — never a fabricated flag when nothing real is wrong", () => {
  const r = computeValuationProfile({
    fundamentals: { pe: 12, pegRatio: 0.8, fcfYield: 0.07, netDebtToEbitda: 0.5, revenueGrowth: 0.15, earningsGrowth: 0.2, freeCashFlowGrowth: 0.1, priceToSales: 2, evToEbitda: 9 },
    fundamentalsHistory: IMPROVING_HISTORY, price: 100, forwardEps: 5,
  });
  assert.strictEqual(r.warningFlags.length, 0);
});

ok("computeWarningFlags never produces a flag this codebase has no real data source for (e.g. EPS-revision-history, historical-P/E-range flags)", () => {
  const allPossibleKeys = ["FCF_DETERIORATING", "REVENUE_DECELERATING", "MARGIN_COMPRESSION", "DEBT_RISING", "HIGH_LEVERAGE", "HIGH_PEG", "LOW_FCF_YIELD", "VALUE_TRAP_RISK"];
  const r = computeValuationProfile({
    fundamentals: { pe: 8, fcfYield: -0.02, netDebtToEbitda: 4.5, revenueGrowth: -0.08, earningsGrowth: -0.25, freeCashFlowGrowth: -0.3, pegRatio: 3 },
    fundamentalsHistory: DETERIORATING_HISTORY, price: 40,
  });
  for (const f of r.warningFlags) assert.ok(allPossibleKeys.includes(f.key), `unexpected flag key ${f.key} — must only ever be one of the real, data-backed set`);
});

console.log("\nChecking buildValuationWhy / priceAssessment — real templated explanation, real zone relabeling (2026-09-19 follow-up)…");

ok("whyText is a real, non-empty string built from actually-computed fields, honestly generic when nothing real is available", () => {
  assert.strictEqual(buildValuationWhy({}), "Not enough real data to explain this valuation read yet.");
  const text = buildValuationWhy({ forwardPE: 20, pegStatus: "ATTRACTIVE", peg: 0.8, fcfYield: 5, fcfGrowth: 10, revenueTrend: "ACCELERATING", latestRevenueGrowth: 15 });
  assert.match(text, /20\.0x/);
  assert.match(text, /0\.80/);
});

ok("priceAssessment is a real alias of buyZones (great value / fair value / expensive), zero new computation — greatValue is a real RANGE (goodBuyRange), matching the spec's own worked example ('Great Value: $118-$128'), not a bare 'below X' threshold", () => {
  const r = computeValuationProfile({
    fundamentals: { pe: 12, pegRatio: 0.8, fcfYield: 0.07, netDebtToEbitda: 0.5, revenueGrowth: 0.15, earningsGrowth: 0.2, freeCashFlowGrowth: 0.1, targetLow: 100, targetMedian: 150, targetHigh: 220, analystTarget: 150 },
    fundamentalsHistory: IMPROVING_HISTORY, price: 100, forwardEps: 5,
  });
  if (r.buyZones) {
    assert.deepStrictEqual(r.priceAssessment.greatValue, r.buyZones.goodBuyRange);
    assert.ok(Array.isArray(r.priceAssessment.greatValue), "greatValue must be a real [low, high] range, not a single number");
    assert.strictEqual(r.priceAssessment.expensive, r.buyZones.expensiveAbove);
    assert.deepStrictEqual(r.priceAssessment.fairValue, r.buyZones.fairValueRange);
  }
});

console.log("\nChecking reuse discipline (source-inspection tripwire) — ONE-ENGINE RULE…");

ok("valuation-engine.js reuses the real future-value-scoring.js and mispricing-engine.js — no second valuation/value-trap formula declared here", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../src/valuation-engine"), "utf8");
  assert.match(src, /require\("\.\/future-value-scoring"\)/);
  assert.match(src, /require\("\.\/mispricing-engine"\)/);
  assert.doesNotMatch(src, /function computeValueScore|function computeFairValueBands|function computeFundamentalDivergence/, "must not redeclare the canonical valuation/divergence formulas");
});

ok("companyQualityScore reuses future-value-scoring.js's own real computeQualityScore/computeGrowthScore/computeMoatProxy/computeFinancialStrength/computeFutureScore — never a second growth/quality/moat/balance-sheet formula", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../src/valuation-engine"), "utf8");
  assert.match(src, /computeQualityScore, computeGrowthScore, computeFinancialStrength, computeMoatProxy, computeFutureScore/);
  assert.doesNotMatch(src, /function computeQualityScore|function computeGrowthScore|function computeMoatProxy|function computeFinancialStrength|function computeFutureScore/, "must not redeclare any of the real company-quality sub-formulas");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("VALUATION-ENGINE TEST FAILED");
else console.log("VALUATION-ENGINE TEST OK");
