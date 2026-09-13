"use strict";
// market-agent.js — "Market Agents": read-only research/market-data
// specialists for the Astra/Claude/Router dev system (2026-09-13). Scoped
// deliberately narrow: this file imports ONLY status/read functions from
// the existing market-scanner module — no order-placement or
// account-mutating module is required anywhere here, so there is no
// structural path from this agent to touching real money. Reuses the exact
// same engine the existing Telegram Master Agent /status and /market
// commands already call — no duplicate scanning logic.
const { getScannerStatus } = require("./market-scanner");

async function marketSnapshot() {
  const status = getScannerStatus();
  const hits = (status.lastHits || []).slice(0, 5);
  return {
    ok: true,
    regime: status.macroRegime || "Unknown",
    lastRunAt: status.lastRunAt || null,
    scanCount: status.scanCount || 0,
    topSignals: hits.map((h) => ({ symbol: h.symbol, signal: h.signal, price: h.price, composite: h.composite })),
  };
}

module.exports = { marketSnapshot };
