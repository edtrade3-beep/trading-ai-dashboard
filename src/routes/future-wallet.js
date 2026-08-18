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
const { runAgentSwarm, getLatestAgentAnalysis, PILOT_AGENTS } = require("../future-wallet-agents");
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

  return writeJson(res, 404, { ok: false, error: "Not found" });
}

module.exports = { handleFutureWallet };
