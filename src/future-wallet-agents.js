// future-wallet-agents.js — Future Wallet 100 Phase 8: AI agent swarm
// (PILOT SCOPE, explicit user request 2026-08-18: "small pilot first" —
// 5 agents [Fundamental, Growth, Valuation, Moat, Risk] on a handful of
// top-ranked candidates, not the full 15-agent x ~20-candidate spec, to
// see real output quality and real cost against the app's shared $25/mo
// Anthropic budget before scaling up).
//
// Reuses the existing src/anthropic.js chokepoint (callAnthropicApi) —
// same real usage-logging/budget-warning path every other AI feature in
// this app already goes through, nothing new there. Each agent gets its
// own stable system prompt (cache:true — real per-call savings since the
// same system prompt repeats across every candidate in a run).
//
// REAL-DATA-ONLY DISCIPLINE (matches future-wallet-potential.js's own
// framing): every agent prompt is built ONLY from real rows already in
// fw_quant_metrics/fw_technical_scores/fw_future_potential/fw_universe —
// never invented context. Each agent is explicitly instructed to mark
// data_quality UNKNOWN/ASSUMPTION when the real inputs don't support a
// FACT-based conclusion, and to never invent a number that wasn't given
// to it. A parse failure on the model's response is stored honestly
// (score/verdict null, raw text kept) rather than silently discarded.
"use strict";

const { getPool } = require("./atomic-write");
const { callAnthropicApi, MODELS } = require("./anthropic");

// ── Pilot agent roster (5 of the spec's 15) ──────────────────────────────
const RESPONSE_FORMAT_INSTRUCTIONS = `
Respond with ONLY a single JSON object, no prose outside it, in exactly this shape:
{"score": <integer 0-100, or null if you cannot honestly score this>, "verdict": "<one short phrase, e.g. 'Strong moat, priced for it'>", "reasoning": "<2-4 sentences, grounded ONLY in the real data given below>", "data_quality": "<FACT | ESTIMATE | ASSUMPTION | UNKNOWN — the honest basis of this analysis>"}
Never invent a number that was not given to you. If the real data provided is insufficient to score this dimension honestly, set score to null and data_quality to "UNKNOWN" rather than guessing.`.trim();

// Distinct format for the Market agent — it exists specifically to supply
// the TAM/market-share numbers the reverse-valuation math engine
// (src/horse-valuation-engine.js) needs and nothing else in this app can
// honestly provide. Every numeric field here is data_quality: "ESTIMATE"
// by construction (no real TAM dataset exists anywhere in this app) — the
// agent is told that explicitly so it never dresses a guess up as a FACT.
const MARKET_RESPONSE_FORMAT_INSTRUCTIONS = `
Respond with ONLY a single JSON object, no prose outside it, in exactly this shape:
{"score": <integer 0-100 market-opportunity-size score, or null>, "verdict": "<one short phrase>", "reasoning": "<2-4 sentences>", "data_quality": "ESTIMATE", "tamUsd": <your best real-world estimate of the total addressable market in USD, rounded to a sensible order of magnitude, or null if you genuinely cannot estimate it>, "realisticMarketSharePct": <a realistic long-term achievable market share as a decimal 0-1 (e.g. 0.08 = 8%), or null>, "revenueCeilingUsd": <tamUsd * realisticMarketSharePct if both are set, else null>}
This is explicitly an ESTIMATE, never a FACT — ground it in your real knowledge of the industry's actual market size, not the company's own numbers alone. Round generously rather than implying false precision. If you genuinely cannot estimate a real TAM for this business, set tamUsd, realisticMarketSharePct, and revenueCeilingUsd all to null rather than inventing a number.`.trim();

const PILOT_AGENTS = [
  {
    name: "Fundamental",
    systemPrompt: `You are the FUNDAMENTAL AGENT on an equity research desk. You assess the real financial health of a company — margins, cash generation, balance sheet quality, capital allocation — using ONLY the real numbers provided to you in each request. You never fabricate a financial figure. ${RESPONSE_FORMAT_INSTRUCTIONS}`,
  },
  {
    name: "Growth",
    systemPrompt: `You are the GROWTH AGENT on an equity research desk. You assess the real durability and quality of a company's growth — revenue growth, EPS growth trajectory, whether growth is decelerating or accelerating — using ONLY the real numbers provided to you in each request. You never fabricate a growth figure. ${RESPONSE_FORMAT_INSTRUCTIONS}`,
  },
  {
    name: "Valuation",
    systemPrompt: `You are the VALUATION AGENT on an equity research desk. You assess whether the real current price is reasonable relative to the real fundamentals given — P/E, PEG, price/sales, EV/EBITDA, FCF yield — using ONLY the real numbers provided to you in each request. You never fabricate a multiple or a fair-value estimate beyond what the given ratios support. ${RESPONSE_FORMAT_INSTRUCTIONS}`,
  },
  {
    name: "Moat",
    systemPrompt: `You are the MOAT AGENT on an equity research desk. You assess competitive durability using the real quantitative PROXIES given to you — sustained high ROIC/ROE relative to typical competitive erosion, margin stability, and your own general knowledge of the company's known business model and industry position (state clearly when you're drawing on general knowledge vs. the numeric proxy). You never invent a specific real-world fact (a patent, a contract, a customer count) that wasn't given to you. ${RESPONSE_FORMAT_INSTRUCTIONS}`,
  },
  {
    name: "Risk",
    systemPrompt: `You are the RISK AGENT on an equity research desk. You assess real downside risk — valuation risk from the given multiples, technical/momentum risk from the given trend and distance-from-high figures, and balance-sheet risk from whatever leverage/dilution figures are given — using ONLY the real numbers provided. Score LOW risk as a HIGH score (100 = low risk, 0 = high risk) and say so explicitly in your reasoning. You never fabricate a risk factor not supported by the given data. ${RESPONSE_FORMAT_INSTRUCTIONS}`,
  },
  {
    // 2026-08-26, Horse Hunter upgrade B1 — the one piece nothing else in
    // this app can honestly supply: a real TAM/market-share estimate,
    // which src/horse-valuation-engine.js's compute10xPath needs to stop
    // returning DATA_INSUFFICIENT. See MARKET_RESPONSE_FORMAT_INSTRUCTIONS
    // above for why every field here is explicitly ESTIMATE, never FACT.
    name: "Market",
    systemPrompt: `You are the MARKET AGENT on an equity research desk. You estimate the real total addressable market (TAM) for this company's actual business, a realistic long-term achievable market share, and the resulting revenue ceiling — using the real company/sector/industry/revenue context given to you plus your own general real-world knowledge of that industry's actual market size (state clearly when you're drawing on general knowledge vs. a given number). You never invent a precise TAM with false confidence — round to a sensible order of magnitude, and set fields to null rather than guess when you genuinely don't have a defensible basis. ${MARKET_RESPONSE_FORMAT_INSTRUCTIONS}`,
  },
];

function requirePool() {
  const pool = getPool();
  if (!pool) throw new Error("future-wallet-agents: Postgres pool not ready");
  return pool;
}

// Real combined ranking over whatever real scores exist per symbol —
// same "renormalize over available real data" discipline as every other
// Future Wallet scorer. Never fabricates a score for a symbol missing
// both real inputs; such symbols simply can't be honestly ranked and are
// excluded from the candidate list (not silently zero-scored).
function rankScore(technicalScore, futurePotentialScore) {
  const parts = [technicalScore, futurePotentialScore].filter((v) => v != null && Number.isFinite(Number(v))).map(Number);
  if (!parts.length) return null;
  return parts.reduce((s, v) => s + v, 0) / parts.length;
}

async function selectCandidates(n) {
  const pool = requirePool();
  const { rows } = await pool.query(`
    SELECT u.ticker, u.company, u.sector, u.industry,
           t.technical_score, fp.future_potential_score
    FROM fw_universe u
    LEFT JOIN LATERAL (
      SELECT technical_score FROM fw_technical_scores WHERE symbol = u.ticker ORDER BY as_of DESC LIMIT 1
    ) t ON true
    LEFT JOIN LATERAL (
      SELECT future_potential_score FROM fw_future_potential WHERE symbol = u.ticker ORDER BY as_of DESC LIMIT 1
    ) fp ON true
  `);
  return rows
    .map((r) => ({ ...r, rank_score: rankScore(r.technical_score, r.future_potential_score) }))
    .filter((r) => r.rank_score != null)
    .sort((a, b) => b.rank_score - a.rank_score)
    .slice(0, n);
}

// Real joined row for one symbol — the exact same real data a human
// analyst pulling up this stock's quant sheet would see. No estimates,
// no filler for missing fields (they're simply omitted from the prompt
// text below, which is itself an honest signal to the agent).
async function getSymbolContext(symbol) {
  const pool = requirePool();
  const [{ rows: uRows }, { rows: mRows }, { rows: tRows }, { rows: fpRows }] = await Promise.all([
    pool.query(`SELECT * FROM fw_universe WHERE ticker = $1`, [symbol]),
    pool.query(`SELECT * FROM fw_quant_metrics WHERE symbol = $1 ORDER BY as_of DESC LIMIT 1`, [symbol]),
    pool.query(`SELECT * FROM fw_technical_scores WHERE symbol = $1 ORDER BY as_of DESC LIMIT 1`, [symbol]),
    pool.query(`SELECT * FROM fw_future_potential WHERE symbol = $1 ORDER BY as_of DESC LIMIT 1`, [symbol]),
  ]);
  return { universe: uRows[0] || null, metrics: mRows[0] || null, technical: tRows[0] || null, potential: fpRows[0] || null };
}

function fmt(v, suffix = "") {
  if (v == null) return "unknown";
  const n = Number(v);
  return Number.isFinite(n) ? `${n}${suffix}` : "unknown";
}
function fmtPct(v) { return v == null ? "unknown" : `${(Number(v) * 100).toFixed(1)}%`; }

// fw_quant_metrics has no raw revenue column (only revenue_growth) — a
// real, disclosed derivation (market cap / price-to-sales) when both real
// inputs exist, explicitly labeled as derived rather than a direct real
// figure. Needed so the Market agent (below) has an actual dollar revenue
// base to reason about TAM/market-share from, not just a growth rate.
function estimatedRevenue(marketCap, priceSales) {
  const mc = Number(marketCap), ps = Number(priceSales);
  if (!(mc > 0) || !(ps > 0)) return null;
  return mc / ps;
}

function buildContextText(ctx) {
  const u = ctx.universe || {};
  const m = ctx.metrics || {};
  const t = ctx.technical || {};
  const fp = ctx.potential || {};
  const revEst = estimatedRevenue(u.market_cap, m.price_sales);
  return `
Company: ${u.company || "unknown"} (${u.ticker || "unknown"}) — ${u.sector || "unknown sector"} / ${u.industry || "unknown industry"}
Market cap: ${fmt(u.market_cap)}
Estimated annual revenue (derived: market cap / price-to-sales, NOT a direct real figure): ${revEst != null ? fmt(Math.round(revEst)) : "unknown"}

REAL QUANT METRICS (as of ${m.as_of || "unknown"}):
Price: ${fmt(m.price)}  |  52w range: ${fmt(m.week52_low)} - ${fmt(m.week52_high)}  |  Distance from 52w high: ${fmt(m.distance_from_high, "%")}
Revenue growth: ${fmtPct(m.revenue_growth)}  |  EPS growth: ${fmtPct(m.eps_growth)}
Gross margin: ${fmtPct(m.gross_margin)}  |  Net margin: ${fmtPct(m.net_margin)}
ROIC: ${fmtPct(m.roic)}  |  ROE: ${fmtPct(m.roe)}
FCF: ${fmt(m.fcf)}  |  FCF growth: ${fmtPct(m.fcf_growth)}
Share dilution (neg=buybacks): ${fmtPct(m.share_dilution)}
P/E: ${fmt(m.pe)}  |  PEG: ${fmt(m.peg)}  |  Price/Sales: ${fmt(m.price_sales)}  |  EV/EBITDA: ${fmt(m.ev_ebitda)}  |  FCF yield: ${fmtPct(m.fcf_yield)}
Beta: ${fmt(m.beta)}  |  RSI: ${fmt(m.rsi)}  |  Trend score (0-100): ${fmt(m.trend_score)}  |  Momentum: ${fmt(m.momentum, "%")}

REAL TECHNICAL/VCP (as of ${t.as_of || "unknown"}):
Technical score (0-100): ${fmt(t.technical_score)}  |  VCP score: ${fmt(t.vcp_score)}  |  VCP verdict: ${t.vcp_verdict || "unknown"}
Breakout status: ${t.breakout_status || "unknown"}  |  Support: ${fmt(t.support)}  |  Resistance: ${fmt(t.resistance)}

REAL QUANTITATIVE FUTURE POTENTIAL (as of ${fp.as_of || "unknown"}):
Future potential score (quantitative-only, 0-100): ${fmt(fp.future_potential_score)}
`.trim();
}

// `extra` keeps the FULL real parsed JSON object (not just the 4 common
// fields every agent shares) — needed so an agent with its own additional
// disclosed fields (e.g. the Market agent's tamUsd/realisticMarketSharePct
// below) doesn't have them silently discarded before they ever reach
// fw_agent_analysis.raw_response.
function parseAgentResponse(text) {
  try {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no JSON object found");
    const parsed = JSON.parse(match[0]);
    return {
      score: parsed.score == null ? null : Number(parsed.score),
      verdict: parsed.verdict || null,
      reasoning: parsed.reasoning || null,
      data_quality: parsed.data_quality || "UNKNOWN",
      parseError: false,
      extra: parsed,
    };
  } catch {
    return { score: null, verdict: null, reasoning: String(text || "").slice(0, 500), data_quality: "UNKNOWN", parseError: true, extra: null };
  }
}

async function runOneAgent(agentDef, symbol, contextText, apiKey) {
  const prompt = `Analyze ${symbol} using ONLY the real data below.\n\n${contextText}`;
  const raw = await callAnthropicApi(prompt, apiKey, {
    model: MODELS.sonnet,
    maxTokens: 700,
    system: agentDef.systemPrompt,
    cache: true,
    timeout: 45000,
    feature: "future-wallet-agent-swarm",
  });
  const parsed = parseAgentResponse(raw);
  return { ...parsed, model_used: MODELS.sonnet, raw_response: { text: raw, parsed: parsed.extra } };
}

async function runAgentSwarm({ symbols, candidateCount = 5, agentNames, apiKey } = {}) {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const pool = requirePool();
  const agents = agentNames && agentNames.length ? PILOT_AGENTS.filter((a) => agentNames.includes(a.name)) : PILOT_AGENTS;

  let candidates;
  if (Array.isArray(symbols) && symbols.length) {
    candidates = symbols.map((s) => ({ ticker: String(s).trim().toUpperCase() }));
  } else {
    candidates = await selectCandidates(candidateCount);
  }

  const results = [];
  for (const c of candidates) {
    const symbol = c.ticker;
    let contextText;
    try {
      const ctx = await getSymbolContext(symbol);
      if (!ctx.metrics) { results.push({ symbol, agent: null, ok: false, reason: "no real quant metrics on file for this symbol" }); continue; }
      contextText = buildContextText(ctx);
    } catch (e) {
      results.push({ symbol, agent: null, ok: false, reason: String((e && e.message) || e) });
      continue;
    }
    for (const agentDef of agents) {
      try {
        const out = await runOneAgent(agentDef, symbol, contextText, apiKey);
        await pool.query(
          `INSERT INTO fw_agent_analysis (symbol, agent_name, score, verdict, reasoning, data_quality, model_used, raw_response) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [symbol, agentDef.name, out.score, out.verdict, out.reasoning, out.data_quality, out.model_used, JSON.stringify(out.raw_response)]
        );
        results.push({ symbol, agent: agentDef.name, ok: true, score: out.score, verdict: out.verdict, parseError: out.parseError });
      } catch (e) {
        results.push({ symbol, agent: agentDef.name, ok: false, reason: String((e && e.message) || e) });
      }
    }
  }

  const ok = results.filter((r) => r.ok);
  return {
    candidates: candidates.map((c) => c.ticker),
    agentsRun: agents.map((a) => a.name),
    totalCalls: results.length,
    succeeded: ok.length,
    failed: results.length - ok.length,
    results,
  };
}

// Real latest Market-agent TAM/market-share estimate for one symbol, or
// null if the Market agent hasn't analyzed it yet (or explicitly returned
// null fields itself — an honest "I can't estimate this"). Feeds
// src/horse-valuation-engine.js's compute10xPath so it can move off
// DATA_INSUFFICIENT once a real estimate exists.
async function getMarketEstimate(symbol) {
  const pool = requirePool();
  const { rows } = await pool.query(
    `SELECT raw_response, run_at FROM fw_agent_analysis WHERE symbol = $1 AND agent_name = 'Market' ORDER BY run_at DESC LIMIT 1`,
    [String(symbol).trim().toUpperCase()]
  );
  const row = rows[0];
  const parsed = row?.raw_response?.parsed;
  if (!parsed || parsed.tamUsd == null || parsed.realisticMarketSharePct == null) return null;
  return {
    tamUsd: Number(parsed.tamUsd),
    realisticMarketSharePct: Number(parsed.realisticMarketSharePct),
    revenueCeilingUsd: parsed.revenueCeilingUsd != null ? Number(parsed.revenueCeilingUsd) : Number(parsed.tamUsd) * Number(parsed.realisticMarketSharePct),
    asOf: row.run_at,
  };
}

async function getLatestAgentAnalysis(symbols) {
  const pool = requirePool();
  const filter = Array.isArray(symbols) && symbols.length
    ? { clause: "WHERE symbol = ANY($1)", params: [symbols.map((s) => String(s).trim().toUpperCase())] }
    : { clause: "", params: [] };
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (symbol, agent_name) * FROM fw_agent_analysis ${filter.clause} ORDER BY symbol, agent_name, run_at DESC`,
    filter.params
  );
  return rows;
}

// Diagnostic: real raw row counts per (symbol, agent_name) — unlike
// getLatestAgentAnalysis (which DISTINCT ONs to the latest row and would
// silently hide a duplicate run), this surfaces every row actually on
// disk, so an accidental duplicate POST (e.g. a client-side timeout that
// looked like a failure but wasn't, followed by a retry) is visible
// before it's mistaken for "only one run happened."
async function getRawStats() {
  const pool = requirePool();
  const { rows: total } = await pool.query(`SELECT COUNT(*)::int AS n FROM fw_agent_analysis`);
  const { rows: groups } = await pool.query(`
    SELECT symbol, agent_name, COUNT(*)::int AS n, MIN(run_at) AS first_run, MAX(run_at) AS last_run
    FROM fw_agent_analysis GROUP BY symbol, agent_name ORDER BY n DESC, symbol, agent_name
  `);
  const duplicateGroups = groups.filter((g) => g.n > 1);
  return {
    totalRows: total[0].n,
    distinctPairs: groups.length,
    duplicateGroups,
    totalDuplicateRows: duplicateGroups.reduce((s, g) => s + (g.n - 1), 0),
  };
}

// Deletes every row except the most recent per (symbol, agent_name) —
// keeps the latest real analysis, removes stale duplicate rows from an
// accidental re-run. Real DELETE, run only on explicit request.
async function dedupeAgentAnalysis() {
  const pool = requirePool();
  const { rows } = await pool.query(`
    DELETE FROM fw_agent_analysis a
    USING fw_agent_analysis b
    WHERE a.symbol = b.symbol AND a.agent_name = b.agent_name AND a.run_at < b.run_at
    RETURNING a.id
  `);
  return { deletedCount: rows.length };
}

module.exports = {
  PILOT_AGENTS,
  rankScore, selectCandidates, getSymbolContext, buildContextText, parseAgentResponse,
  runAgentSwarm, getLatestAgentAnalysis, getMarketEstimate, getRawStats, dedupeAgentAnalysis,
};
