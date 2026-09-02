"use strict";

const RESEARCH_CONTEXT_VERSION = "research-context-v1";

// Converts persisted Research/Market Wrap output into bounded context only.
// It never emits a buy/sell verdict and never trusts free-form AI scores as
// executable trading inputs.
function buildResearchContext({ researchIntel = null, marketWrap = null, timestamp = Date.now() } = {}) {
  const shifts = Array.isArray(researchIntel?.narrativeShifts) ? researchIntel.narrativeShifts : [];
  const cards = Array.isArray(researchIntel?.cards) ? researchIntel.cards : [];
  const wrap = marketWrap && typeof marketWrap === "object" ? marketWrap : null;
  const riskCount = cards.filter((c) => c?.risk === "HIGH" || c?.status === "INVALIDATED").length;
  const deteriorating = shifts.filter((s) => /deteriorat|risk|tighten|bear/i.test(String(s?.state || ""))).length;
  return {
    available: !!(researchIntel || wrap),
    narrativeDimensions: shifts.slice(0, 12).map((s) => ({ dimension: s.dimension || null, state: s.state || null, shifted: !!s.shifted })),
    highRiskCount: riskCount,
    deterioratingCount: deteriorating,
    marketHealth: wrap?.spyHealth?.verdict || wrap?.marketHealth?.verdict || null,
    timestamp,
    engineVersion: RESEARCH_CONTEXT_VERSION,
  };
}

module.exports = { RESEARCH_CONTEXT_VERSION, buildResearchContext };
