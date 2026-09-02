// routes/future-wallet.js — Future Wallet 100 API surface. Phase 2 adds
// the universe endpoints only (list + seed). Later phases add their own
// endpoints here as each stage of the pipeline (quant screen, technical/
// VCP, agents, committee scores, ranked lists, dashboard reads) lands —
// same one-file-per-feature convention every other src/routes/*.js already
// follows.
"use strict";

const { writeJson, readRequestBody } = require("../utils");
const { isReady } = require("../future-wallet-store");
const { seedFutureWalletUniverse, getUniverse, SEED_UNIVERSE } = require("../future-wallet-universe");
const { runQuantScreen, getLatestQuantMetrics } = require("../future-wallet-quant");
const { runTechnicalScreen, getLatestTechnicalScores } = require("../future-wallet-technical");
const { runFuturePotentialScoring, getLatestFuturePotential } = require("../future-wallet-potential");
const { runAgentSwarm, getLatestAgentAnalysis, getRawStats, dedupeAgentAnalysis, PILOT_AGENTS } = require("../future-wallet-agents");
const { getLatestScores, getLatestStages, getHorseJournal } = require("../future-wallet-synthesis");
const { ANTHROPIC_API_KEY } = require("../config");

async function handleFutureWallet(req, res, requestUrl) {
  const { pathname } = requestUrl;

  if (!isReady()) {
    return writeJson(res, 503, { ok: false, error: "Future Wallet store not ready — DATABASE_URL must be configured" });
  }

  if (pathname === "/api/future-wallet/universe" && req.method === "GET") {
    const rows = await getUniverse();
    return writeJson(res, 200, { ok: true, count: rows.length, seedSize: SEED_UNIVERSE.length, rows });
  }

  if (pathname === "/api/future-wallet/seed-universe" && req.method === "POST") {
    // Optional {symbols:[...]} body targets a specific subset (e.g.
    // retrying just what failed last time) instead of re-running the
    // full ~100-symbol default every time.
    let symbols;
    try {
      const raw = await readRequestBody(req);
      const body = raw ? JSON.parse(raw) : {};
      if (Array.isArray(body.symbols) && body.symbols.length) symbols = body.symbols;
    } catch {}
    const result = await seedFutureWalletUniverse(symbols);
    return writeJson(res, 200, { ok: true, ...result });
  }

  // Phases 3+4: real market-data fetch + quantitative screening. Defaults
  // to the full real universe currently in fw_universe (so this naturally
  // stays in sync with whatever Phase 2 actually seeded); optional
  // {symbols:[...]} body targets a subset (e.g. a retry).
  if (pathname === "/api/future-wallet/run-quant-screen" && req.method === "POST") {
    let symbols;
    try {
      const raw = await readRequestBody(req);
      const body = raw ? JSON.parse(raw) : {};
      if (Array.isArray(body.symbols) && body.symbols.length) symbols = body.symbols;
    } catch {}
    if (!symbols) {
      const universe = await getUniverse();
      symbols = universe.map((r) => r.ticker);
    }
    const result = await runQuantScreen(symbols);
    return writeJson(res, 200, { ok: true, ...result });
  }

  if (pathname === "/api/future-wallet/quant-metrics" && req.method === "GET") {
    const rows = await getLatestQuantMetrics();
    return writeJson(res, 200, { ok: true, count: rows.length, rows });
  }

  // Phases 5+6: Technical Score + the real VCP engine, via the existing
  // screenTrendTemplate (same reuse pattern — no new fetch/rate-limit code).
  if (pathname === "/api/future-wallet/run-technical-screen" && req.method === "POST") {
    let symbols;
    try {
      const raw = await readRequestBody(req);
      const body = raw ? JSON.parse(raw) : {};
      if (Array.isArray(body.symbols) && body.symbols.length) symbols = body.symbols;
    } catch {}
    if (!symbols) {
      const universe = await getUniverse();
      symbols = universe.map((r) => r.ticker);
    }
    const result = await runTechnicalScreen(symbols);
    return writeJson(res, 200, { ok: true, ...result });
  }

  if (pathname === "/api/future-wallet/technical-scores" && req.method === "GET") {
    const rows = await getLatestTechnicalScores();
    return writeJson(res, 200, { ok: true, count: rows.length, rows });
  }

  // Phase 7: Future Potential (quantitative portion only — qualitative
  // dimensions are recorded as PENDING for the Phase 8 agent swarm; see
  // future-wallet-potential.js's header for why that split is deliberate).
  // Reads straight from the stored fw_quant_metrics rows — no refetching.
  if (pathname === "/api/future-wallet/run-future-potential" && req.method === "POST") {
    let symbols;
    try {
      const raw = await readRequestBody(req);
      const body = raw ? JSON.parse(raw) : {};
      if (Array.isArray(body.symbols) && body.symbols.length) symbols = body.symbols;
    } catch {}
    const result = await runFuturePotentialScoring(symbols);
    return writeJson(res, 200, { ok: true, ...result });
  }

  if (pathname === "/api/future-wallet/future-potential" && req.method === "GET") {
    const rows = await getLatestFuturePotential();
    return writeJson(res, 200, { ok: true, count: rows.length, rows });
  }

  // Phase 8 (PILOT SCOPE — explicit user request 2026-08-18: small pilot
  // first, not the full 15-agent x ~20-candidate spec). Real Claude calls,
  // real shared $25/mo budget — defaults to 5 agents x 5 top-ranked
  // candidates (25 calls) unless the caller narrows it further. See
  // future-wallet-agents.js's header for the full real-data-only framing.
  if (pathname === "/api/future-wallet/run-agent-swarm" && req.method === "POST") {
    if (!ANTHROPIC_API_KEY) return writeJson(res, 200, { ok: false, error: "ANTHROPIC_API_KEY not set" });
    let body = {};
    try {
      const raw = await readRequestBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch {}
    const symbols = Array.isArray(body.symbols) && body.symbols.length ? body.symbols : undefined;
    const candidateCount = Number(body.candidateCount) > 0 ? Math.min(Number(body.candidateCount), 10) : 5;
    const agentNames = Array.isArray(body.agents) && body.agents.length ? body.agents : undefined;
    const result = await runAgentSwarm({ symbols, candidateCount, agentNames, apiKey: ANTHROPIC_API_KEY });
    return writeJson(res, 200, { ok: true, ...result });
  }

  if (pathname === "/api/future-wallet/agent-analysis" && req.method === "GET") {
    const symbolParam = requestUrl.searchParams.get("symbols");
    const symbols = symbolParam ? symbolParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    const rows = await getLatestAgentAnalysis(symbols);
    return writeJson(res, 200, { ok: true, count: rows.length, availableAgents: PILOT_AGENTS.map((a) => a.name), rows });
  }

  // Diagnostic: real raw (symbol, agent_name) row counts — reveals an
  // accidental duplicate run that getLatestAgentAnalysis's DISTINCT ON
  // would otherwise hide.
  if (pathname === "/api/future-wallet/agent-analysis-stats" && req.method === "GET") {
    const stats = await getRawStats();
    return writeJson(res, 200, { ok: true, ...stats });
  }

  // Real DELETE, keeps only the most recent row per (symbol, agent_name).
  if (pathname === "/api/future-wallet/dedupe-agent-analysis" && req.method === "POST") {
    const result = await dedupeAgentAnalysis();
    return writeJson(res, 200, { ok: true, ...result });
  }

  // Horse Hunter upgrade (2026-08-26) — real CIO-synthesized scores
  // (fw_scores, populated by future-wallet-synthesis.js's runSynthesisAndStage,
  // wired into the daily job below) and the real score-history Journal
  // (fw_thesis_history) for one symbol.
  if (pathname === "/api/future-wallet/scores" && req.method === "GET") {
    const symbolParam = requestUrl.searchParams.get("symbols");
    const symbols = symbolParam ? symbolParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    const rows = await getLatestScores(symbols);
    return writeJson(res, 200, { ok: true, count: rows.length, rows });
  }

  if (pathname === "/api/future-wallet/journal" && req.method === "GET") {
    const symbol = (requestUrl.searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) return writeJson(res, 400, { ok: false, error: "symbol is required" });
    const rows = await getHorseJournal(symbol);
    return writeJson(res, 200, { ok: true, symbol, count: rows.length, rows });
  }

  // Horse Hunter Tier B3 — the one combined real read Light Box's UI
  // needs: top Horses ranked by real Wealth Score, each carrying its real
  // stage and whether it's also a real current Light Box opportunity
  // (bestOfBoth), so the frontend makes one call instead of three.
  if (pathname === "/api/future-wallet/horses" && req.method === "GET") {
    const limit = Math.max(1, Math.min(50, Number(requestUrl.searchParams.get("limit")) || 20));
    const rawMaxPrice = Number(requestUrl.searchParams.get("maxPrice"));
    const maxPrice = Number.isFinite(rawMaxPrice) && rawMaxPrice > 0 ? rawMaxPrice : null;
    const [scores, stages, crossover, quantMetrics] = await Promise.all([
      getLatestScores(),
      getLatestStages(),
      require("../horse-opportunity-crossover").getBestOfBothWorlds().catch(() => []),
      maxPrice != null ? require("../future-wallet-quant").getLatestQuantMetrics().catch(() => []) : Promise.resolve([]),
    ]);
    const stageBySymbol = new Map(stages.map((s) => [s.symbol, s.status]));
    const crossoverSymbols = new Set(crossover.map((c) => c.symbol));
    const priceBySymbol = new Map(quantMetrics.map((m) => [m.symbol, m.price != null ? Number(m.price) : null]));
    let rows = scores
      .filter((s) => s.future_wealth_score != null)
      .map((s) => ({
        symbol: s.symbol,
        price: priceBySymbol.get(s.symbol) ?? null,
        horseScore: Number(s.future_wealth_score),
        entryScore: s.current_entry_score != null ? Number(s.current_entry_score) : null,
        riskScore: s.risk_score != null ? Number(s.risk_score) : null,
        stage: stageBySymbol.get(s.symbol) || "UNKNOWN",
        verdict: s.verdict || null,
        verdictType: "FUTURE_POTENTIAL",
        // Future Wallet intentionally ranks structural potential; current
        // entry timing belongs to the canonical market decision pipeline and
        // is not inferred from this long-horizon score.
        currentEntryVerdict: null,
        bestOfBoth: crossoverSymbols.has(s.symbol),
      }));
    // Real filter, applied only when requested — a row whose real price
    // isn't known yet (quant screen hasn't run for it) is excluded rather
    // than guessed into or out of the result.
    if (maxPrice != null) rows = rows.filter((r) => r.price != null && r.price <= maxPrice);
    rows = rows.sort((a, b) => b.horseScore - a.horseScore).slice(0, limit);
    return writeJson(res, 200, { ok: true, count: rows.length, rows, bestOfBoth: crossover, maxPrice });
  }

  // The spec's real "⭐ BEST OF BOTH WORLDS" — symbols that are simultaneously
  // a real long-term Horse and a real current Light Box opportunity.
  if (pathname === "/api/future-wallet/best-of-both" && req.method === "GET") {
    const { getBestOfBothWorlds } = require("../horse-opportunity-crossover");
    const rows = await getBestOfBothWorlds();
    return writeJson(res, 200, { ok: true, count: rows.length, rows });
  }

  // The spec's real "10X Question" / Reverse Valuation Engine — real
  // current market cap (always available) x the Market agent's real
  // ESTIMATE-labeled TAM/market-share (B1), honestly DATA_INSUFFICIENT
  // until that agent has actually analyzed this symbol. Current margin/
  // multiple default to the company's OWN real current figures (never an
  // invented "fair" multiple) — a pre-profit company (net margin <= 0)
  // falls back to a real EV/Sales-style multiple instead of P/E.
  if (pathname === "/api/future-wallet/10x-path" && req.method === "GET") {
    const symbol = (requestUrl.searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) return writeJson(res, 400, { ok: false, error: "symbol is required" });
    const years = Number(requestUrl.searchParams.get("years")) || 7;
    const targetMultiple = Number(requestUrl.searchParams.get("targetMultiple")) || 10;
    const { getSymbolContext, getMarketEstimate } = require("../future-wallet-agents");
    const { compute10xPath } = require("../horse-valuation-engine");
    const [ctx, marketEstimate] = await Promise.all([getSymbolContext(symbol), getMarketEstimate(symbol)]);
    if (!ctx.universe || !ctx.metrics) {
      return writeJson(res, 200, { ok: true, symbol, pathStatus: "DATA_INSUFFICIENT", reason: "no real quant/universe data on file for this symbol" });
    }
    if (!marketEstimate) {
      return writeJson(res, 200, { ok: true, symbol, pathStatus: "DATA_INSUFFICIENT", reason: "no real Market-agent TAM estimate on file yet — run the agent swarm for this symbol" });
    }
    const currentMarketCap = ctx.universe.market_cap != null ? Number(ctx.universe.market_cap) : null;
    const netMargin = ctx.metrics.net_margin != null ? Number(ctx.metrics.net_margin) : null;
    const pe = ctx.metrics.pe != null ? Number(ctx.metrics.pe) : null;
    const evSales = ctx.metrics.ev_sales != null ? Number(ctx.metrics.ev_sales) : null;
    const useRevenueMultiple = netMargin == null || netMargin <= 0;
    const result = compute10xPath({
      currentMarketCap, years, targetMultiple,
      revenue: marketEstimate.revenueCeilingUsd,
      margin: useRevenueMultiple ? null : netMargin,
      multiple: useRevenueMultiple ? evSales : pe,
      multipleType: useRevenueMultiple ? "revenue" : "earnings",
    });
    return writeJson(res, 200, { ok: true, symbol, marketEstimate, ...result });
  }

  // Manual trigger for the daily refresh (quant -> technical -> future-
  // potential -> synthesis -> stage -> journal -> alerts), same "run-*"
  // on-demand convention every other phase's endpoint above already
  // follows. force=true deliberately bypasses the once/real-day background
  // gate (runFutureWalletDailyRefresh's default behavior respects it) —
  // needed to actually verify the pipeline on demand rather than waiting
  // for a real day boundary.
  if (pathname === "/api/future-wallet/run-daily-refresh" && req.method === "POST") {
    let body = {};
    try { const raw = await readRequestBody(req); body = raw ? JSON.parse(raw) : {}; } catch {}
    const result = await require("../future-wallet-daily-job").runFutureWalletDailyRefresh({ force: !!body.force });
    return writeJson(res, 200, result);
  }

  // Manual trigger for the weekly agent swarm (B2) — same on-demand
  // convention. Real Claude spend every call; this route exists for
  // verification, not for routine use (the real registered job already
  // covers the once/real-week cadence).
  if (pathname === "/api/future-wallet/run-weekly-agents" && req.method === "POST") {
    const result = await require("../future-wallet-weekly-agents-job").runWeeklyAgentSwarm();
    return writeJson(res, 200, result);
  }

  return writeJson(res, 404, { ok: false, error: "Not found" });
}

module.exports = { handleFutureWallet };
