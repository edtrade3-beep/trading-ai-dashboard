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

  return writeJson(res, 404, { ok: false, error: "Not found" });
}

module.exports = { handleFutureWallet };
