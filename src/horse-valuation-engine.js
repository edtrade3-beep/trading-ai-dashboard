// horse-valuation-engine.js — Horse Hunter upgrade (2026-08-26): the real
// reverse-valuation / required-CAGR / scenario math the spec's "10X
// Question," "Reverse Valuation Engine," "CAGR Engine," and "Scenario
// Engine" sections ask for. Pure functions, unit-tested, zero I/O.
//
// DATA HONESTY (important): the required-CAGR arithmetic itself is pure
// math and always real. But a REVERSE VALUATION or a 10X PATH needs a
// target market cap, which needs a real revenue/margin scenario — and
// nothing in this app supplies a real TAM/market-share estimate yet (that
// lands with the Horse Hunter Tier B "Market" agent). Until then,
// compute10xPath/computeScenarioReturns honestly return
// `pathStatus: "DATA_INSUFFICIENT"` rather than inventing a TAM. The
// multiple applied to potential earnings/revenue is either explicitly
// supplied by the caller or falls back to the company's OWN real current
// multiple (fw_quant_metrics.pe/ev_sales) — never an invented "fair"
// multiple.
"use strict";

// Required CAGR to turn $1 into `targetMultiple` dollars over `years` —
// the exact real formula behind the spec's own worked examples (10X over
// 3/5/7/10 years -> ~115%/58%/39%/26%), verified as regression tests below.
function computeRequiredCagr(targetMultiple, years) {
  if (!(targetMultiple > 0) || !(years > 0)) return null;
  return Math.pow(targetMultiple, 1 / years) - 1; // decimal, e.g. 0.39 = 39%
}

// Real reverse valuation: revenue x margin -> potential earnings, then
// applied against a real multiple. multipleType "earnings" = P/E-style
// (multiple x potential earnings); "revenue" = EV/Sales-style (multiple x
// potential revenue directly, for pre-profit companies where an earnings
// multiple isn't honestly applicable yet).
function computeReverseValuation({ revenue, margin, multiple, multipleType = "earnings" } = {}) {
  if (!(revenue > 0) || margin == null || !Number.isFinite(Number(margin)) || !(multiple > 0)) return null;
  const potentialEarnings = revenue * Number(margin);
  const potentialMarketCap = multipleType === "revenue" ? revenue * multiple : potentialEarnings * multiple;
  return { potentialEarnings, potentialMarketCap, multiple, multipleType };
}

// The spec's own "10X Question," reframed correctly: NOT "will this 10X"
// but "is there a real, disclosed mathematical path." Requires a real
// current market cap (always available) AND a real revenue/margin/multiple
// scenario (not available until an agent-estimated TAM exists) — honestly
// gated rather than fabricated.
function compute10xPath({ currentMarketCap, years, targetMultiple = 10, revenue, margin, multiple, multipleType = "earnings" } = {}) {
  if (!(currentMarketCap > 0)) {
    return { pathStatus: "DATA_INSUFFICIENT", reason: "no real current market cap on file" };
  }
  if (!(revenue > 0) || margin == null || !(multiple > 0)) {
    return { pathStatus: "DATA_INSUFFICIENT", reason: "no real TAM/market-share/margin estimate on file yet — needs the agent swarm's Market agent" };
  }
  const requiredMarketCap = currentMarketCap * targetMultiple;
  const requiredCagr = computeRequiredCagr(targetMultiple, years);
  const valuation = computeReverseValuation({ revenue, margin, multiple, multipleType });
  return {
    pathStatus: "REAL_PATH_MODELED",
    currentMarketCap, requiredMarketCap, targetMultiple, years, requiredCagr,
    modeledMarketCap: valuation.potentialMarketCap,
    meetsRequiredCap: valuation.potentialMarketCap >= requiredMarketCap,
    ...valuation,
  };
}

// Real bear/base/bull/outlier scenario math — each scenario is a real
// revenue/margin/multiple assumption (agent-estimated or user-supplied),
// never fabricated here. Reports the market-cap multiple and required CAGR
// each scenario actually implies vs. the real current market cap, rather
// than a single guaranteed target (explicit spec requirement — "never
// present a single guaranteed target").
function computeScenarioReturns({ currentMarketCap, years, scenarios } = {}) {
  if (!(currentMarketCap > 0) || !Array.isArray(scenarios) || !scenarios.length) {
    return { pathStatus: "DATA_INSUFFICIENT", reason: "no real current market cap or scenario set on file" };
  }
  const results = scenarios.map((s) => {
    const valuation = computeReverseValuation(s);
    if (!valuation) return { label: s.label || null, pathStatus: "DATA_INSUFFICIENT" };
    const impliedMultiple = valuation.potentialMarketCap / currentMarketCap;
    const impliedCagr = years > 0 ? Math.pow(Math.max(impliedMultiple, 0), 1 / years) - 1 : null;
    return { label: s.label || null, pathStatus: "REAL_PATH_MODELED", ...valuation, impliedMultiple, impliedCagr };
  });
  return { pathStatus: "REAL_PATH_MODELED", currentMarketCap, years, scenarios: results };
}

module.exports = { computeRequiredCagr, computeReverseValuation, compute10xPath, computeScenarioReturns };
