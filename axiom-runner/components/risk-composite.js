// risk-composite.js — Risk Engine composite / Portfolio AI, options
// platform redesign Phase 13. Pure aggregation over 3 real, currently-
// uncombined systems this app already computes (never re-derived here):
// risk-lab-calc.js's VaR95/99 + regression beta + volatility
// (GET /api/ai-hub/risk-lab, button-gated — needs real per-symbol bars),
// risk-guardrails.js's open-risk%/concentration (GET /api/ai-hub/
// risk-snapshot, already-polled), portfolio-correlation-calc.js's real
// correlation clusters (GET /api/ai-hub/portfolio-correlation,
// button-gated), and /api/market/distribution's real market-wide
// riskScore. Same shape as market-helpers.js's deriveTopLevelScores:
// passthrough of real values, honest null/skip when a dimension hasn't
// been computed yet — never fabricated to fill a gap.
//
// Honest gap, confirmed during Phase 13 implementation and flagged
// rather than silently worked around: risk-lab-calc.js only ever
// computed VaR95/99 + beta + volatility — Sharpe/Sortino/MaxDD (despite
// a past phase name suggesting otherwise) were never built for OPEN
// portfolio holdings. Those 3 metrics DO exist for CLOSED trade history
// (trading-utils.js's computeTradeStats, a genuinely different real
// system) — not included in this composite, which is scoped to open
// positions only.

// Real 0-100 sub-score, higher = safer, from real openRiskPct against
// the real 6% cap both autopilot engines already enforce.
function scoreOpenRisk(openRiskPct, cap = 6) {
  const pct = openRiskPct != null ? Number(openRiskPct) : NaN;
  if (!Number.isFinite(pct)) return null;
  return Math.max(0, Math.min(100, Math.round(100 - (pct / cap) * 100)));
}

// Real 0-100 sub-score from real $-weighted top-position concentration.
function scoreConcentration(topPositionPct) {
  const pct = topPositionPct != null ? Number(topPositionPct) : NaN;
  if (!Number.isFinite(pct)) return null;
  // 0% concentration -> 100, 40%+ in one name -> 0
  return Math.max(0, Math.min(100, Math.round(100 - (pct / 40) * 100)));
}

// Real 0-100 sub-score from real VaR95 as a % of real portfolio value —
// a higher real 1-day-95%-VaR-as-%-of-equity is riskier.
function scoreVar(riskLab) {
  if (!riskLab || !(riskLab.totalValue > 0)) return null;
  const varPct = (riskLab.var95 / riskLab.totalValue) * 100;
  return Math.max(0, Math.min(100, Math.round(100 - (varPct / 8) * 100))); // 0% VaR -> 100, 8%+ -> 0
}

// Real 0-100 sub-score from the real correlation-cluster count — more
// real highly-correlated (>=0.70) pairs means the account is less
// diversified than its position count suggests.
function scoreCorrelation(correlation) {
  if (!correlation || !Array.isArray(correlation.clusters)) return null;
  const n = correlation.clusters.length;
  return Math.max(0, Math.min(100, Math.round(100 - n * 15))); // each real cluster costs 15pts
}

// Real 0-100 sub-score from the real market-wide distribution riskScore
// (/api/market/distribution) — inverted so higher = safer, matching the
// other sub-scores' convention.
function scoreMarketRisk(marketRiskScore) {
  const s = Number(marketRiskScore);
  if (!Number.isFinite(s)) return null;
  return Math.max(0, Math.min(100, Math.round(100 - s)));
}

// `riskSnapshot` — real GET /api/ai-hub/risk-snapshot payload (already
// polled every 60s by PortfolioRiskCard.jsx). `riskLab` — real GET
// /api/ai-hub/risk-lab payload, or null if not yet run. `correlation` —
// real GET /api/ai-hub/portfolio-correlation payload, or null if not yet
// run. `marketRiskScore` — real /api/market/distribution riskScore, or
// null.
export function computeCompositeRiskScore({ riskSnapshot, riskLab, correlation, marketRiskScore } = {}) {
  const dims = [
    { key: "openRisk", label: "Open Risk %", weight: 30, score: scoreOpenRisk(riskSnapshot?.openRiskPct) },
    { key: "concentration", label: "Concentration", weight: 25, score: scoreConcentration(riskSnapshot?.topPositionPct) },
    { key: "var", label: "Value at Risk", weight: 20, score: scoreVar(riskLab) },
    { key: "correlation", label: "Correlation", weight: 15, score: scoreCorrelation(correlation) },
    { key: "marketRisk", label: "Market Backdrop", weight: 10, score: scoreMarketRisk(marketRiskScore) },
  ];
  const available = dims.filter(d => d.score != null);
  if (!available.length) return { score: null, breakdown: dims, dimensionsUsed: 0, label: "No real risk data yet" };

  const totalWeight = available.reduce((s, d) => s + d.weight, 0);
  const score = Math.round(available.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight);
  const label = score >= 80 ? "Low Risk" : score >= 60 ? "Moderate Risk" : score >= 40 ? "Elevated Risk" : "High Risk";
  return { score, breakdown: dims, dimensionsUsed: available.length, label };
}

// Real portfolio-level Greeks aggregation — sums each open Position
// Manager position's real per-contract Greeks (Phase 11's already-polled
// repriceOne, delta/gamma/theta/vega persisted on the position, Polygon-
// only) weighted by real qty × 100 (contract multiplier). Zero new
// fetches — operates on the same real /api/paper-positions payload the
// Position Manager tab already fetches. Honest per-Greek null when no
// open position has that real Greek yet (e.g. no POLYGON_API_KEY).
export function aggregatePortfolioGreeks(openPositions) {
  if (!Array.isArray(openPositions) || openPositions.length === 0) {
    return { available: false, reason: "No open paper positions." };
  }
  const withGreeks = openPositions.filter(p => p.greeks && (p.greeks.delta != null || p.greeks.gamma != null || p.greeks.theta != null || p.greeks.vega != null));
  if (!withGreeks.length) {
    return { available: false, reason: "No real per-contract Greeks yet — requires a Polygon-sourced chain (POLYGON_API_KEY) and at least one real reprice." };
  }
  const sum = (field) => {
    const vals = withGreeks.filter(p => p.greeks[field] != null);
    if (!vals.length) return null;
    return Math.round(vals.reduce((s, p) => s + Number(p.greeks[field]) * Number(p.qty || 1) * 100, 0) * 100) / 100;
  };
  return {
    available: true,
    positionsWithGreeks: withGreeks.length,
    positionsTotal: openPositions.length,
    netDelta: sum("delta"), netGamma: sum("gamma"), netTheta: sum("theta"), netVega: sum("vega"),
  };
}
