"use strict";

// portfolio-shock-engine.js — formal Portfolio Shock Test (2026-09-11,
// explicit user request via a revised master platform spec's Portfolio
// Shock Test section: "Model scenarios such as SPY -5%, QQQ -8%, IWM
// -10%... Return estimated portfolio impact... Clearly label modeled
// outputs as estimates.").
//
// Purely deterministic — zero AI/Anthropic call. Reuses the exact real
// $-weighted factor-correlation data src/portfolio-correlation-calc.js
// already computes (real historical daily bars, real Pearson correlation
// of the actual held positions to SPY/QQQ/IWM) as the sensitivity basis
// for each scenario — correlation is an honest proxy for a scenario's
// likely direction/magnitude of impact, NOT a precise per-position beta,
// so every output here is explicitly labeled a modeled estimate, never a
// guaranteed outcome.
const SCENARIOS = [
  { key: "SPY_DOWN_5", label: "SPY -5%", proxy: "SPY", move: -0.05 },
  { key: "QQQ_DOWN_8", label: "QQQ -8%", proxy: "QQQ", move: -0.08 },
  { key: "IWM_DOWN_10", label: "IWM -10%", proxy: "IWM", move: -0.10 },
];

// Real, disclosed scope limit: only scenarios with a real matching factor
// proxy this platform already tracks (SPY/QQQ/IWM, per
// portfolio-correlation-calc.js's FACTOR_PROXIES) are modeled. VIX/rates/
// DXY/oil/gold scenarios from the spec would need their own real
// correlation basis this platform doesn't compute yet — rather than
// fabricate a number for those, they are honestly left out of v1.
function estimateScenarioImpact(scenario, factorExposure, totalValue) {
  const exposure = factorExposure.find((f) => f.proxy === scenario.proxy);
  if (!exposure) return null; // no real correlation data for this proxy — honestly omitted, never guessed
  const estimatedFraction = exposure.correlation * scenario.move;
  const estimatedDollarImpact = Math.round(estimatedFraction * totalValue * 100) / 100;
  return {
    scenario: scenario.label,
    proxy: scenario.proxy,
    portfolioCorrelation: exposure.correlation,
    estimatedPct: Number((estimatedFraction * 100).toFixed(2)),
    estimatedDollarImpact,
  };
}

function buildPortfolioShockTest({ positions = [], factorExposure = [], clusters = [] } = {}) {
  const totalValue = positions.reduce((sum, p) => sum + (Number(p.marketValue) || 0), 0);
  const scenarios = SCENARIOS
    .map((s) => estimateScenarioImpact(s, factorExposure, totalValue))
    .filter(Boolean);
  const worstScenario = scenarios.length
    ? [...scenarios].sort((a, b) => a.estimatedDollarImpact - b.estimatedDollarImpact)[0]
    : null;

  // Real correlation clusters (already computed by portfolio-correlation-
  // calc.js, >=0.7 threshold) are the real concentration signal — never a
  // second, independently-invented concentration metric.
  const correlationConcentration = clusters.slice(0, 5);

  return {
    generatedAt: new Date().toISOString(),
    totalValue,
    scenarios,
    worstScenario,
    correlationConcentration,
    positionCount: positions.length,
    disclosure: "All figures above are MODELED ESTIMATES derived from the portfolio's real historical correlation to broad-market proxies (SPY/QQQ/IWM) — not a precise per-position beta and not a guaranteed outcome.",
    engineVersion: "portfolio-shock-v1",
  };
}

// Real internal-fetch wrapper for the Master Agent chat trigger
// (src/routes/market.js) — same real getJson/positions-fetch convention
// as morning-mode-engine.js/deep-scan-engine.js, so "portfolio shock
// test" in chat runs the exact same real computation the dedicated
// /api/ai-hub/portfolio-shock-test route does, never a second version.
async function buildPortfolioShockReport() {
  const { getJson } = require("./morning-mode-engine");
  const posResp = await getJson("/api/alpaca/positions");
  if (!posResp || !posResp.ok) return { error: "No real broker account connected — nothing to model." };
  const positions = posResp.positions || [];
  if (!positions.length) return buildPortfolioShockTest({ positions: [], factorExposure: [], clusters: [] });
  const { computePortfolioCorrelation } = require("./portfolio-correlation-calc");
  const { factorExposure, clusters } = await computePortfolioCorrelation(positions, getJson);
  return buildPortfolioShockTest({ positions, factorExposure, clusters });
}

function renderPortfolioShockText(r) {
  if (r.error) return `⚠ ${r.error}`;
  const lines = ["📉 PORTFOLIO SHOCK TEST", "", r.disclosure];
  if (!r.positionCount) { lines.push("", "No open positions to model."); return lines.join("\n"); }
  lines.push("", `Total portfolio value modeled: $${r.totalValue.toLocaleString()}`);
  if (r.scenarios.length) {
    lines.push("", "Scenarios:");
    r.scenarios.forEach((s) => lines.push(`${s.scenario}: correlation ${s.portfolioCorrelation} → estimated ${s.estimatedPct >= 0 ? "+" : ""}${s.estimatedPct}% ($${s.estimatedDollarImpact.toLocaleString()})`));
  } else {
    lines.push("", "No real correlation data available yet for SPY/QQQ/IWM against these positions.");
  }
  if (r.worstScenario) lines.push("", `Worst modeled scenario: ${r.worstScenario.scenario} (${r.worstScenario.estimatedDollarImpact.toLocaleString()})`);
  if (r.correlationConcentration.length) {
    lines.push("", "Correlation concentration (real pairs ≥0.7):");
    r.correlationConcentration.forEach((c) => lines.push(`${c.a} ↔ ${c.b}: ${c.correlation}`));
  }
  return lines.join("\n");
}

module.exports = { SCENARIOS, buildPortfolioShockTest, buildPortfolioShockReport, renderPortfolioShockText };
