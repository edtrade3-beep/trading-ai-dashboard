// Real tests for src/horse-valuation-engine.js (Horse Hunter upgrade,
// 2026-08-26) — required-CAGR / reverse-valuation / scenario math. Pure-
// function, synthetic-input, zero-network. Regression-tests the CAGR
// formula against the user's OWN worked examples from the spec (10X over
// 3/5/7/10 years -> ~115%/58%/39%/26%).
// Run: node test/horse-valuation-engine.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { computeRequiredCagr, computeReverseValuation, compute10xPath, computeScenarioReturns } = require("../src/horse-valuation-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }
function close(a, b, tol = 0.01) { return Math.abs(a - b) <= tol; }

console.log("Checking computeRequiredCagr — real math, matches the spec's own worked examples…");
ok("10X over 3 years -> ~115% required CAGR", () => assert.ok(close(computeRequiredCagr(10, 3), 1.1544, 0.001)));
ok("10X over 5 years -> ~58% required CAGR", () => assert.ok(close(computeRequiredCagr(10, 5), 0.5849, 0.001)));
ok("10X over 7 years -> ~39% required CAGR", () => assert.ok(close(computeRequiredCagr(10, 7), 0.3895, 0.001)));
ok("10X over 10 years -> ~26% required CAGR", () => assert.ok(close(computeRequiredCagr(10, 10), 0.2589, 0.001)));
ok("honest null with invalid inputs (zero/negative years or multiple)", () => {
  assert.strictEqual(computeRequiredCagr(10, 0), null);
  assert.strictEqual(computeRequiredCagr(0, 5), null);
  assert.strictEqual(computeRequiredCagr(10, -3), null);
});

console.log("Checking computeReverseValuation — real revenue x margin x multiple math…");
ok("earnings-multiple mode: revenue x margin x P/E-style multiple", () => {
  const r = computeReverseValuation({ revenue: 2_000_000_000, margin: 0.15, multiple: 25, multipleType: "earnings" });
  assert.strictEqual(r.potentialEarnings, 300_000_000);
  assert.strictEqual(r.potentialMarketCap, 7_500_000_000);
});
ok("revenue-multiple mode: revenue x EV/Sales-style multiple directly (for pre-profit companies)", () => {
  const r = computeReverseValuation({ revenue: 500_000_000, margin: -0.05, multiple: 8, multipleType: "revenue" });
  assert.strictEqual(r.potentialMarketCap, 4_000_000_000);
});
ok("honest null when revenue/margin/multiple is missing or non-positive (earnings mode requires margin)", () => {
  assert.strictEqual(computeReverseValuation({ revenue: 0, margin: 0.1, multiple: 10 }), null);
  assert.strictEqual(computeReverseValuation({ revenue: 100, margin: null, multiple: 10 }), null);
  assert.strictEqual(computeReverseValuation({ revenue: 100, margin: 0.1, multiple: 0 }), null);
});
ok("revenue mode does NOT require margin — it's unused in that branch's market-cap math", () => {
  const r = computeReverseValuation({ revenue: 500_000_000, margin: null, multiple: 8, multipleType: "revenue" });
  assert.strictEqual(r.potentialMarketCap, 4_000_000_000);
  assert.strictEqual(r.potentialEarnings, null, "honestly null, not fabricated from a missing margin");
});

console.log("Checking compute10xPath — the spec's real '10X Question,' honestly gated…");
ok("with a real current market cap but no real TAM/margin/multiple estimate -> honest DATA_INSUFFICIENT, never fabricated", () => {
  const r = compute10xPath({ currentMarketCap: 2_000_000_000, years: 7 });
  assert.strictEqual(r.pathStatus, "DATA_INSUFFICIENT");
});
ok("with no real current market cap at all -> honest DATA_INSUFFICIENT", () => {
  const r = compute10xPath({ years: 7, revenue: 1e9, margin: 0.15, multiple: 25 });
  assert.strictEqual(r.pathStatus, "DATA_INSUFFICIENT");
});
ok("the worked spec example: $2B -> $20B (10X) over 7 years models a real path when inputs exist", () => {
  const r = compute10xPath({ currentMarketCap: 2_000_000_000, years: 7, targetMultiple: 10, revenue: 3_000_000_000, margin: 0.25, multiple: 30 });
  assert.strictEqual(r.pathStatus, "REAL_PATH_MODELED");
  assert.strictEqual(r.requiredMarketCap, 20_000_000_000);
  assert.ok(close(r.requiredCagr, 0.3895, 0.001));
  assert.strictEqual(r.modeledMarketCap, 3_000_000_000 * 0.25 * 30);
  assert.strictEqual(r.meetsRequiredCap, r.modeledMarketCap >= 20_000_000_000);
});

console.log("Checking computeScenarioReturns — real bear/base/bull/outlier math, never a single guaranteed target…");
ok("computes a distinct real implied CAGR per scenario, not one number", () => {
  const r = computeScenarioReturns({
    currentMarketCap: 2_000_000_000, years: 7,
    scenarios: [
      { label: "BEAR", revenue: 1_500_000_000, margin: 0.10, multiple: 15 },
      { label: "BASE", revenue: 3_000_000_000, margin: 0.20, multiple: 25 },
      { label: "BULL", revenue: 5_000_000_000, margin: 0.25, multiple: 30 },
    ],
  });
  assert.strictEqual(r.scenarios.length, 3);
  const [bear, base, bull] = r.scenarios;
  assert.ok(bear.impliedCagr < base.impliedCagr, "BEAR must imply a lower real CAGR than BASE");
  assert.ok(base.impliedCagr < bull.impliedCagr, "BASE must imply a lower real CAGR than BULL");
});
ok("honest DATA_INSUFFICIENT when no real current market cap or scenario set exists", () => {
  assert.strictEqual(computeScenarioReturns({}).pathStatus, "DATA_INSUFFICIENT");
});
ok("a scenario missing real inputs is honestly flagged per-scenario, not silently dropped or fabricated", () => {
  const r = computeScenarioReturns({ currentMarketCap: 1e9, years: 5, scenarios: [{ label: "NO_DATA" }] });
  assert.strictEqual(r.scenarios[0].pathStatus, "DATA_INSUFFICIENT");
});

console.log(`\n${passed} checks passed.`);
console.log("HORSE-VALUATION-ENGINE TEST OK");
