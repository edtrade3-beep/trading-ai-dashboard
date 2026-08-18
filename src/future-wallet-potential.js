// future-wallet-potential.js — Future Wallet 100 Phase 7: Future
// Potential scoring.
//
// SCOPE HONESTY (important): the spec's Future Potential engine (section
// 8) lists 17 inputs, but they split into two genuinely different kinds:
//
//   QUANTITATIVE — real, computable from data already in fw_quant_metrics
//   right now: revenue growth, EPS growth, ROIC, free cash flow, margins,
//   capital allocation (real share-count trend: buybacks vs. dilution).
//
//   QUALITATIVE — TAM, industry growth, market-share opportunity,
//   competitive moat, technology leadership, network effects, switching
//   costs, distribution, ecosystem, management. These cannot be honestly
//   derived from a price/fundamentals feed. They need real research —
//   that's exactly what the Phase 8 AI agent swarm (MOAT AGENT, GROWTH
//   AGENT, etc.) is for.
//
// So this phase computes the real QUANTITATIVE sub-score only, and records
// the qualitative dimensions as explicitly PENDING in the components JSONB
// rather than inventing values for them. The spec's own rule — "Do NOT ask
// the AI to invent financial data... Never fabricate... Use UNKNOWN when
// data is unavailable" — cuts both ways: a moat score derived from a
// quant proxy and labeled as a real moat assessment would be exactly that
// kind of fabrication. (ROIC IS used as a real, explicitly-labeled quality/
// moat *proxy* below — same honest framing src/providers/fmp.js already
// documents for the existing Future/Undervalued Stocks feature — but it's
// never presented as a substitute for the real Moat Agent's assessment.)
//
// Every sub-score is scored ONLY when its real input exists; the total is
// renormalized over whatever was actually scorable, and `coverage` records
// what fraction of the rubric's weight had real data behind it — so a
// thin-data company gets an honest low-confidence score rather than a
// silently-zeroed one.
"use strict";

const { getPool } = require("./atomic-write");

// Real quantitative rubric. Weights sum to 100 across the six components
// that have genuinely available real data today.
const WEIGHTS = {
  revenueGrowth: 22,
  epsGrowth: 16,
  roic: 22,
  fcfQuality: 16,
  marginProfile: 14,
  capitalAllocation: 10,
};

// The spec's qualitative dimensions — recorded as pending, never scored
// from quant proxies. Phase 8's agents fill these in.
const PENDING_QUALITATIVE = [
  "tam", "industryGrowth", "marketShareOpportunity", "competitiveMoat",
  "technologyLeadership", "networkEffects", "switchingCosts", "distribution",
  "ecosystem", "management",
];

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Each scorer returns 0-100, or null when the real input is unavailable.
// Thresholds are stated plainly so the rubric is auditable rather than magic.

// Revenue growth (decimal, e.g. 0.65 = +65%). 0% -> 0, 40%+ -> 100.
function scoreRevenueGrowth(g) {
  if (g == null || !Number.isFinite(g)) return null;
  return Math.round(clamp01(g / 0.40) * 100);
}

// EPS growth (decimal). Negative growth scores 0; 40%+ -> 100.
function scoreEpsGrowth(g) {
  if (g == null || !Number.isFinite(g)) return null;
  return Math.round(clamp01(g / 0.40) * 100);
}

// ROIC (decimal, e.g. 0.52 = 52%). A real quality + moat-DURABILITY proxy
// (explicitly a proxy, not a moat assessment). 0% -> 0, 30%+ -> 100.
function scoreRoic(r) {
  if (r == null || !Number.isFinite(r)) return null;
  return Math.round(clamp01(r / 0.30) * 100);
}

// FCF quality: is free cash flow real and positive, and is it growing?
// 60% of this sub-score is "positive FCF at all", 40% is real FCF growth.
function scoreFcfQuality(fcf, fcfGrowth) {
  const hasFcf = fcf != null && Number.isFinite(fcf);
  const hasGrowth = fcfGrowth != null && Number.isFinite(fcfGrowth);
  if (!hasFcf && !hasGrowth) return null;
  let pts = 0, weight = 0;
  if (hasFcf) { pts += (fcf > 0 ? 60 : 0); weight += 60; }
  if (hasGrowth) { pts += clamp01(fcfGrowth / 0.30) * 40; weight += 40; }
  return weight ? Math.round((pts / weight) * 100) : null;
}

// Margin profile: gross margin (structural pricing power) + net margin
// (what actually reaches the bottom line). Gross 60%+ -> full marks on
// that half; net 20%+ -> full marks on its half.
function scoreMarginProfile(gross, net) {
  const hasG = gross != null && Number.isFinite(gross);
  const hasN = net != null && Number.isFinite(net);
  if (!hasG && !hasN) return null;
  let pts = 0, weight = 0;
  if (hasG) { pts += clamp01(gross / 0.60) * 50; weight += 50; }
  if (hasN) { pts += clamp01(net / 0.20) * 50; weight += 50; }
  return weight ? Math.round((pts / weight) * 100) : null;
}

// Capital allocation from the real share-count trend: negative
// sharesGrowth = buybacks (shrinking share count, good for holders),
// positive = dilution. -3% or better -> 100, +5% or worse -> 0.
function scoreCapitalAllocation(sharesGrowth) {
  if (sharesGrowth == null || !Number.isFinite(sharesGrowth)) return null;
  return Math.round(clamp01((0.05 - sharesGrowth) / 0.08) * 100);
}

// Pure: takes a real fw_quant_metrics row, returns the real quantitative
// Future Potential score + a full component breakdown. Exported for unit
// testing with hand-built rows.
function computeFuturePotential(m) {
  const subs = {
    revenueGrowth: scoreRevenueGrowth(m?.revenue_growth != null ? Number(m.revenue_growth) : null),
    epsGrowth: scoreEpsGrowth(m?.eps_growth != null ? Number(m.eps_growth) : null),
    roic: scoreRoic(m?.roic != null ? Number(m.roic) : null),
    fcfQuality: scoreFcfQuality(
      m?.fcf != null ? Number(m.fcf) : null,
      m?.fcf_growth != null ? Number(m.fcf_growth) : null
    ),
    marginProfile: scoreMarginProfile(
      m?.gross_margin != null ? Number(m.gross_margin) : null,
      m?.net_margin != null ? Number(m.net_margin) : null
    ),
    capitalAllocation: scoreCapitalAllocation(m?.share_dilution != null ? Number(m.share_dilution) : null),
  };

  let weighted = 0, weightAvailable = 0;
  for (const [key, w] of Object.entries(WEIGHTS)) {
    if (subs[key] != null) { weighted += subs[key] * w; weightAvailable += w; }
  }
  const totalWeight = Object.values(WEIGHTS).reduce((s, w) => s + w, 0);
  const score = weightAvailable > 0 ? Math.round(weighted / weightAvailable) : null;
  const coverage = Math.round((weightAvailable / totalWeight) * 100);

  const qualitativePending = {};
  for (const k of PENDING_QUALITATIVE) qualitativePending[k] = "PENDING_AI_AGENT";

  return {
    score,
    components: {
      quantitative: subs,
      weights: WEIGHTS,
      coverage,                 // % of the rubric's weight backed by real data
      scoredFrom: "quantitative-only",
      qualitative: qualitativePending,
      note: "Qualitative dimensions (TAM, moat, network effects, management, etc.) are not scored here — they require the Phase 8 AI agent swarm. This score reflects real quantitative fundamentals only.",
    },
  };
}

function requirePool() {
  const pool = getPool();
  if (!pool) throw new Error("future-wallet-potential: Postgres pool not ready");
  return pool;
}

async function runFuturePotentialScoring(symbols) {
  const pool = requirePool();
  const filter = Array.isArray(symbols) && symbols.length
    ? { clause: "WHERE symbol = ANY($1)", params: [symbols.map((s) => String(s).trim().toUpperCase())] }
    : { clause: "", params: [] };

  // Latest real quant metrics row per symbol.
  const { rows: metrics } = await pool.query(
    `SELECT DISTINCT ON (symbol) * FROM fw_quant_metrics ${filter.clause} ORDER BY symbol, as_of DESC`,
    filter.params
  );

  const results = [];
  for (const m of metrics) {
    try {
      const { score, components } = computeFuturePotential(m);
      await pool.query(
        `INSERT INTO fw_future_potential (symbol, future_potential_score, components) VALUES ($1, $2, $3)`,
        [m.symbol, score, JSON.stringify(components)]
      );
      results.push({ symbol: m.symbol, ok: true, score, coverage: components.coverage });
    } catch (e) {
      results.push({ symbol: m.symbol, ok: false, reason: String((e && e.message) || e) });
    }
  }
  const ok = results.filter((r) => r.ok);
  return {
    metricsRowsFound: metrics.length,
    scored: ok.length,
    failed: results.length - ok.length,
    failedDetail: results.filter((r) => !r.ok),
  };
}

async function getLatestFuturePotential() {
  const pool = requirePool();
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (symbol) *
    FROM fw_future_potential
    ORDER BY symbol, as_of DESC
  `);
  return rows;
}

module.exports = {
  WEIGHTS, PENDING_QUALITATIVE,
  scoreRevenueGrowth, scoreEpsGrowth, scoreRoic, scoreFcfQuality, scoreMarginProfile, scoreCapitalAllocation,
  computeFuturePotential,
  runFuturePotentialScoring, getLatestFuturePotential,
};
