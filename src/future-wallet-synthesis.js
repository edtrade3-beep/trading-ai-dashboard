// future-wallet-synthesis.js — Future Wallet 100 "CIO Synthesis": the real
// step that was always missing (fw_scores has been schema-only since
// future-wallet-store.js shipped — nothing has ever written to it). Wired
// in as part of the Horse Hunter upgrade (2026-08-26, explicit user
// request: wire Future Wallet's real engine into Light Box as a
// continuous long-term-winner engine, confirmed via AskUserQuestion —
// reuse, don't duplicate).
//
// Pure, disclosed, deterministic weighted blend of scores Future Wallet
// ALREADY computed in earlier phases (fw_quant_metrics -> fw_future_potential,
// fw_technical_scores, fw_agent_analysis) — zero new Claude API calls, zero
// new market-data fetches. Same "renormalize over whatever real data is
// actually available" discipline future-wallet-potential.js already
// established: a symbol missing an input just has that component excluded
// from its own weight total, never zero-filled.
//
// Three scores, kept deliberately separate (never combined into one number
// — explicit spec requirement, mirrored in fw_scores' own column design):
//   future_wealth_score  — the "Horse Score": is this a great LONG-TERM company?
//   current_entry_score  — is NOW a good time to START that long-term position?
//   risk_score            — how much real downside risk sits under this pick?
"use strict";

const { getPool } = require("./atomic-write");
const { withTimeout } = require("./utils");
const { getSymbolContext } = require("./future-wallet-agents");
const { classifyHorseStage } = require("./horse-stage");

const WEALTH_WEIGHTS = { futurePotential: 45, technical: 25, agentAvg: 30 };
const ENTRY_WEIGHTS = { valuationAgent: 45, technical: 30, positionInBase: 25 };
const RISK_WEIGHTS = { riskAgent: 100 }; // when the Risk agent has scored this symbol, defer to it entirely (100=low risk convention, spec-mandated)
const RISK_PROXY_WEIGHTS = { beta: 35, volatility: 35, drawdown: 20, debtEquity: 10 }; // used only when no Risk agent score exists yet

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
// Linear band: `good` maps to 100, `bad` maps to 0, clamped outside — same
// disclosed-threshold style future-wallet-potential.js's scoreRevenueGrowth etc. use.
function band(v, good, bad) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  const x = Number(v);
  return Math.round(clamp((x - bad) / (good - bad), 0, 1) * 100);
}

function weightedAverage(parts) {
  // parts: [[value, weight], ...] — value may be null (excluded, not zero-filled)
  const usable = parts.filter(([v]) => v != null && Number.isFinite(Number(v)));
  if (!usable.length) return { score: null, coverage: 0 };
  const totalW = parts.reduce((s, [, w]) => s + w, 0);
  const usedW = usable.reduce((s, [, w]) => s + w, 0);
  const weighted = usable.reduce((s, [v, w]) => s + Number(v) * w, 0);
  return { score: Math.round(weighted / usedW), coverage: Math.round((usedW / totalW) * 100) };
}

function computeAgentAverage(agentRows) {
  const scored = (agentRows || []).filter((r) => r.score != null && Number.isFinite(Number(r.score)));
  if (!scored.length) return null;
  return scored.reduce((s, r) => s + Number(r.score), 0) / scored.length;
}

// Real "is now a healthy entry zone" read from distance-from-52w-high.
// Too close to the high = fresh long-term money would be chasing recognized
// strength; too far below = elevated real risk the trend is actually
// broken, not just pulled back. A real base zone (10-30% off the high)
// scores highest. Disclosed thresholds, not a fabricated curve.
function scorePositionInBase(distanceFromHigh) {
  if (distanceFromHigh == null || !Number.isFinite(Number(distanceFromHigh))) return null;
  const d = Math.abs(Number(distanceFromHigh));
  if (d <= 5) return 60;
  if (d <= 30) return 90;
  if (d <= 60) return 55;
  return 25;
}

// Real downside-risk proxy from quant fundamentals when no Risk agent score
// exists yet for this symbol. Higher beta/volatility/drawdown/leverage ->
// lower (worse) score, matching the Risk agent's own 100=low-risk convention.
function computeRiskProxy(m) {
  const parts = [
    [band(m?.beta, 0.8, 2.2), RISK_PROXY_WEIGHTS.beta],
    [band(m?.volatility, 25, 90), RISK_PROXY_WEIGHTS.volatility],
    [m?.distance_from_high != null ? band(Math.abs(Number(m.distance_from_high)), 15, 70) : null, RISK_PROXY_WEIGHTS.drawdown],
    [m?.debt_equity != null ? band(m.debt_equity, 0.3, 2.5) : null, RISK_PROXY_WEIGHTS.debtEquity],
  ];
  return weightedAverage(parts);
}

// Pure — takes the real joined context (same shape future-wallet-agents.js's
// getSymbolContext already returns) plus real latest agent scores, returns
// the 3 synthesized scores + a disclosed component breakdown. Exported for
// unit testing with hand-built inputs.
function synthesize(ctx, agentRows) {
  const m = ctx.metrics || {};
  const t = ctx.technical || {};
  const fp = ctx.potential || {};
  const agentByName = {};
  for (const a of agentRows || []) agentByName[a.agent_name] = a.score != null ? Number(a.score) : null;
  const agentAvg = computeAgentAverage(agentRows);

  const wealth = weightedAverage([
    [fp.future_potential_score != null ? Number(fp.future_potential_score) : null, WEALTH_WEIGHTS.futurePotential],
    [t.technical_score != null ? Number(t.technical_score) : null, WEALTH_WEIGHTS.technical],
    [agentAvg, WEALTH_WEIGHTS.agentAvg],
  ]);

  const entry = weightedAverage([
    [agentByName.Valuation, ENTRY_WEIGHTS.valuationAgent],
    [t.technical_score != null ? Number(t.technical_score) : null, ENTRY_WEIGHTS.technical],
    [scorePositionInBase(m.distance_from_high), ENTRY_WEIGHTS.positionInBase],
  ]);

  let risk;
  if (agentByName.Risk != null) {
    risk = { score: Math.round(agentByName.Risk), coverage: 100, source: "risk-agent" };
  } else {
    const proxy = computeRiskProxy(m);
    risk = { ...proxy, source: proxy.score != null ? "quant-proxy" : "insufficient-data" };
  }

  return {
    future_wealth_score: wealth.score,
    current_entry_score: entry.score,
    risk_score: risk.score,
    components: {
      wealth: { ...wealth, weights: WEALTH_WEIGHTS, inputs: { futurePotential: fp.future_potential_score ?? null, technical: t.technical_score ?? null, agentAvg } },
      entry: { ...entry, weights: ENTRY_WEIGHTS, inputs: { valuationAgent: agentByName.Valuation ?? null, technical: t.technical_score ?? null, positionInBase: scorePositionInBase(m.distance_from_high) } },
      risk: { ...risk, weights: risk.source === "quant-proxy" ? RISK_PROXY_WEIGHTS : RISK_WEIGHTS },
    },
  };
}

// Deterministic one-line description of the actual computed components —
// not an AI call, just a real summary of the real numbers above. Honest
// about missing pieces (e.g. no agent scores yet) rather than silent.
function composeVerdict({ future_wealth_score, current_entry_score, risk_score, components }) {
  const parts = [];
  parts.push(future_wealth_score != null ? `Wealth ${future_wealth_score} (${components.wealth.coverage}% coverage)` : "Wealth: insufficient data");
  parts.push(current_entry_score != null ? `Entry ${current_entry_score}` : "Entry: insufficient data");
  parts.push(risk_score != null ? `Risk ${risk_score} (${components.risk.source === "risk-agent" ? "agent" : components.risk.source === "quant-proxy" ? "quant proxy" : "n/a"})` : "Risk: insufficient data");
  if (components.wealth.inputs.agentAvg == null) parts.push("no agent swarm data yet");
  return parts.join(" — ");
}

function requirePool() {
  const pool = getPool();
  if (!pool) throw new Error("future-wallet-synthesis: Postgres pool not ready");
  return pool;
}

async function getLatestAgentScoresBySymbol(pool, symbol) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (agent_name) agent_name, score FROM fw_agent_analysis WHERE symbol = $1 ORDER BY agent_name, run_at DESC`,
    [symbol]
  );
  return rows;
}

// Real orchestration: for each symbol with a real fw_quant_metrics row —
// (1) read its real PRIOR fw_scores row (before this run's write, so
// INFLECTION detection compares against the true prior state, never the
// value this same run is about to insert), (2) synthesize + persist the 3
// scores (A1), (3) classify the real 8-stage lifecycle off the fresh score
// + that real prior score (A2), (4) write a real fw_thesis_history journal
// row (A3) — kept in one per-symbol pass specifically because stage
// classification needs the prior-vs-new score ordering right; running A1
// for every symbol first and A3 afterward would corrupt "prior" into
// "what this same run just wrote." Symbols with zero real quant data are
// honestly skipped (nothing to synthesize), not scored blank.
async function runSynthesisAndStage(symbols, opts = {}) {
  const pool = requirePool();
  const institutionScores = opts.institutionScores || {};
  const universe = symbols && symbols.length
    ? symbols.map((s) => String(s).trim().toUpperCase())
    : (await pool.query(`SELECT ticker FROM fw_universe`)).rows.map((r) => r.ticker);

  const results = [];
  for (const symbol of universe) {
    try {
      const ctx = await getSymbolContext(symbol);
      if (!ctx.metrics) { results.push({ symbol, ok: false, reason: "no real quant metrics on file for this symbol" }); continue; }

      const { rows: priorRows } = await pool.query(
        `SELECT future_wealth_score FROM fw_scores WHERE symbol = $1 ORDER BY as_of DESC LIMIT 1`, [symbol]
      );
      const priorWealthScore = priorRows[0]?.future_wealth_score != null ? Number(priorRows[0].future_wealth_score) : null;
      const { rows: priorJournalRows } = await pool.query(
        `SELECT status FROM fw_thesis_history WHERE symbol = $1 ORDER BY as_of DESC LIMIT 1`, [symbol]
      );
      const priorStageLabel = priorJournalRows[0]?.status || null;

      const agentRows = await getLatestAgentScoresBySymbol(pool, symbol);
      const synth = synthesize(ctx, agentRows);
      const { future_wealth_score, current_entry_score, risk_score, components } = synth;
      const verdict = composeVerdict(synth);
      await pool.query(
        `INSERT INTO fw_scores (symbol, future_wealth_score, current_entry_score, risk_score, verdict, committee_reasoning)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [symbol, future_wealth_score, current_entry_score, risk_score, verdict, JSON.stringify(components)]
      );

      const stageResult = classifyHorseStage({
        futureWealthScore: future_wealth_score,
        marketCap: ctx.universe?.market_cap != null ? Number(ctx.universe.market_cap) : null,
        breakoutStatus: ctx.technical?.breakout_status || null,
        revenueGrowth: ctx.metrics?.revenue_growth != null ? Number(ctx.metrics.revenue_growth) : null,
        epsGrowth: ctx.metrics?.eps_growth != null ? Number(ctx.metrics.eps_growth) : null,
        institutionScore: institutionScores[symbol] ?? null,
        priorWealthScore,
      });
      const notes = `${stageResult.reasons.join("; ")} | wealth=${future_wealth_score ?? "—"} entry=${current_entry_score ?? "—"} risk=${risk_score ?? "—"}`;
      await pool.query(
        `INSERT INTO fw_thesis_history (symbol, status, notes) VALUES ($1,$2,$3)`,
        [symbol, stageResult.label, notes]
      );

      results.push({ symbol, ok: true, future_wealth_score, current_entry_score, risk_score, stage: stageResult.stage, stageLabel: stageResult.label, priorWealthScore, priorStageLabel });
    } catch (e) {
      results.push({ symbol, ok: false, reason: String((e && e.message) || e) });
    }
  }
  const ok = results.filter((r) => r.ok);
  return { scored: ok.length, failed: results.length - ok.length, results };
}

async function getLatestScores(symbols) {
  const pool = requirePool();
  const filter = Array.isArray(symbols) && symbols.length
    ? { clause: "WHERE symbol = ANY($1)", params: [symbols.map((s) => String(s).trim().toUpperCase())] }
    : { clause: "", params: [] };
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (symbol) * FROM fw_scores ${filter.clause} ORDER BY symbol, as_of DESC`,
    filter.params
  );
  return rows;
}

// Real latest stage per symbol (fw_thesis_history's most recent row) —
// batch version of getHorseJournal's per-symbol history, for callers (e.g.
// the Best-of-Both-Worlds crossover) that need "what stage is this symbol
// at right now" across many symbols at once, not full history.
async function getLatestStages(symbols) {
  const pool = requirePool();
  const filter = Array.isArray(symbols) && symbols.length
    ? { clause: "WHERE symbol = ANY($1)", params: [symbols.map((s) => String(s).trim().toUpperCase())] }
    : { clause: "", params: [] };
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (symbol) symbol, status, as_of FROM fw_thesis_history ${filter.clause} ORDER BY symbol, as_of DESC`,
    filter.params
  );
  return rows;
}

// The real Horse Journal read — score-history over time for one symbol
// ("63 → 71 → 79 → 87"), newest first, capped at 50 real entries.
async function getHorseJournal(symbol) {
  const pool = requirePool();
  const { rows } = await pool.query(
    `SELECT * FROM fw_thesis_history WHERE symbol = $1 ORDER BY as_of DESC LIMIT 50`,
    [String(symbol).trim().toUpperCase()]
  );
  return rows;
}

// Real institutional-signal enrichment for a bounded top slice only — each
// symbol needs 4 real self-loopback fetches (dark pool, options flow,
// insider/13F, short interest) through src/institution-score.js's real
// computeInstitutionScore, same exact route set /deep already hits
// (src/telegram-bot.js's cmdDeep). Running that over the FULL ~100-symbol
// universe every day would be 400 extra real fetches/day for a signal that
// only matters for candidates already worth a closer look — bounded to the
// top N by (already-real) future-potential score, same rate-limit-safety
// discipline as this app's other MAX_SCAN_SYMBOLS-style caps. Each
// self-loopback fetch is wrapped in withTimeout — same real lesson learned
// from the Light Box tick-freeze incident earlier this session (an
// unbounded hang inside a recurring background job silently freezes the
// whole tick with no thrown error).
const INSTITUTION_TOP_N = 20;
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
async function getJson(pathAndQuery) {
  try {
    const r = await withTimeout(fetch(`${BASE()}${pathAndQuery}`), 8000, null);
    if (!r) return null;
    return await withTimeout(r.json(), 8000, null);
  } catch { return null; }
}

async function fetchInstitutionScoresForTopSymbols(rankedSymbols) {
  const { computeInstitutionScore } = require("./institution-score");
  const top = (rankedSymbols || []).slice(0, INSTITUTION_TOP_N);
  const out = {};
  for (const symbol of top) {
    try {
      const [darkPoolRes, optionsFlowRes, insiderRes, shortInterestRes] = await Promise.allSettled([
        getJson(`/api/market/darkpool?symbol=${encodeURIComponent(symbol)}`),
        getJson(`/api/market/options-flow?symbols=${encodeURIComponent(symbol)}&limit=1`),
        getJson(`/api/market/insider?ticker=${encodeURIComponent(symbol)}`),
        getJson(`/api/market/short-interest?tickers=${encodeURIComponent(symbol)}`),
      ]);
      const darkPool = darkPoolRes.status === "fulfilled" && darkPoolRes.value?.ok ? darkPoolRes.value : null;
      const optionsFlow = optionsFlowRes.status === "fulfilled" && optionsFlowRes.value && !optionsFlowRes.value.error ? optionsFlowRes.value.summary || null : null;
      const insiderData = insiderRes.status === "fulfilled" && insiderRes.value?.ok ? insiderRes.value : null;
      const shortInterest = shortInterestRes.status === "fulfilled" && shortInterestRes.value?.ok ? (shortInterestRes.value.results || [])[0] || null : null;
      if (darkPool || optionsFlow || insiderData || shortInterest) {
        out[symbol] = computeInstitutionScore({ darkPool, optionsFlow, insiderData, shortInterest }).score;
      }
    } catch { /* per-symbol isolation — one failure never blocks the rest */ }
  }
  return out;
}

module.exports = {
  WEALTH_WEIGHTS, ENTRY_WEIGHTS, RISK_PROXY_WEIGHTS, INSTITUTION_TOP_N,
  band, weightedAverage, computeAgentAverage, scorePositionInBase, computeRiskProxy,
  synthesize, composeVerdict, runSynthesisAndStage, getLatestScores, getLatestStages, getHorseJournal,
  fetchInstitutionScoresForTopSymbols,
};
