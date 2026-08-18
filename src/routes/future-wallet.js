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

  return writeJson(res, 404, { ok: false, error: "Not found" });
}

module.exports = { handleFutureWallet };
