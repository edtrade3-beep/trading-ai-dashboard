"use strict";
// portfolio-shock-engine.test.js — formal Portfolio Shock Test (2026-09-11,
// explicit user request). Covers buildPortfolioShockTest (pure) and
// renderPortfolioShockText (pure) — buildPortfolioShockReport itself does
// real internal HTTP fetches, exercised live instead (same convention as
// this session's other Master Agent engines).
const assert = require("node:assert");
const { buildPortfolioShockTest, renderPortfolioShockText } = require("../src/portfolio-shock-engine");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

console.log("Checking buildPortfolioShockTest — real, correlation-derived estimates, never a fabricated precise loss…");

ok("no positions at all -> honest zero-state, never a fabricated scenario", () => {
  const r = buildPortfolioShockTest({ positions: [], factorExposure: [], clusters: [] });
  assert.equal(r.totalValue, 0);
  assert.deepStrictEqual(r.scenarios, []);
  assert.equal(r.worstScenario, null);
  assert.equal(r.positionCount, 0);
});

ok("a real position with real factor-exposure correlation produces a real, correctly-derived dollar estimate for each matching scenario", () => {
  const positions = [{ symbol: "NVDA", marketValue: 10000 }];
  const factorExposure = [{ proxy: "SPY", label: "S&P 500", correlation: 0.8 }, { proxy: "QQQ", label: "Nasdaq 100", correlation: 0.9 }];
  const r = buildPortfolioShockTest({ positions, factorExposure, clusters: [] });
  assert.equal(r.totalValue, 10000);
  const spy = r.scenarios.find((s) => s.proxy === "SPY");
  assert.equal(spy.portfolioCorrelation, 0.8);
  assert.equal(spy.estimatedPct, -4); // 0.8 * -5% = -4%
  assert.equal(spy.estimatedDollarImpact, -400); // -4% of 10000
});

ok("a scenario with no real matching factor-exposure data is honestly omitted, never guessed", () => {
  const positions = [{ symbol: "NVDA", marketValue: 10000 }];
  const r = buildPortfolioShockTest({ positions, factorExposure: [{ proxy: "SPY", label: "S&P 500", correlation: 0.8 }], clusters: [] });
  assert.equal(r.scenarios.length, 1);
  assert.ok(!r.scenarios.some((s) => s.proxy === "QQQ"));
  assert.ok(!r.scenarios.some((s) => s.proxy === "IWM"));
});

ok("worstScenario picks the real most-negative estimated dollar impact, not just the first scenario", () => {
  const positions = [{ symbol: "NVDA", marketValue: 10000 }];
  const factorExposure = [{ proxy: "SPY", label: "S&P 500", correlation: 0.2 }, { proxy: "QQQ", label: "Nasdaq 100", correlation: 0.9 }];
  const r = buildPortfolioShockTest({ positions, factorExposure, clusters: [] });
  assert.equal(r.worstScenario.proxy, "QQQ"); // 0.9 * -8% = -7.2% vs 0.2 * -5% = -1%
});

ok("real correlation clusters are forwarded verbatim as the concentration signal, never re-derived", () => {
  const clusters = [{ a: "NVDA", b: "AMD", correlation: 0.85 }];
  const r = buildPortfolioShockTest({ positions: [{ symbol: "NVDA", marketValue: 100 }], factorExposure: [], clusters });
  assert.deepStrictEqual(r.correlationConcentration, clusters);
});

ok("every response carries the explicit modeled-estimate disclosure", () => {
  const r = buildPortfolioShockTest({ positions: [], factorExposure: [], clusters: [] });
  assert.match(r.disclosure, /MODELED ESTIMATES/);
});

console.log("\nChecking renderPortfolioShockText — honest rendering of real vs. absent data…");

ok("an error state renders the honest error, nothing fabricated", () => {
  assert.match(renderPortfolioShockText({ error: "No real broker account connected — nothing to model." }), /No real broker account connected/);
});
ok("zero positions renders an honest empty state", () => {
  const text = renderPortfolioShockText({ positionCount: 0, disclosure: "x" });
  assert.match(text, /No open positions to model/);
});
ok("real scenarios render with real correlation and dollar figures", () => {
  const r = buildPortfolioShockTest({ positions: [{ symbol: "NVDA", marketValue: 10000 }], factorExposure: [{ proxy: "SPY", label: "S&P 500", correlation: 0.8 }], clusters: [] });
  const text = renderPortfolioShockText(r);
  assert.match(text, /SPY -5%: correlation 0\.8/);
  assert.match(text, /-400/);
});

console.log(`\n${passed} checks passed.`);
if (!process.exitCode) console.log("PORTFOLIO-SHOCK-ENGINE TEST OK");
