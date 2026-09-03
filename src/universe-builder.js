"use strict";
// universe-builder.js — dynamic, liquidity-filtered stock universe.
//
// Phase 1 fix (2026-09-03) for the Phase 0 read-only audit's core finding:
// SCAN_UNIVERSE (advisor-ai.js) is a 100-symbol hand-curated list, ~88%
// mega/large-cap by its own section comments. The audit also confirmed the
// scoring/ranking engine itself has no market-cap or liquidity weighting —
// the bias lives entirely in which candidates ever reach the scorer. No
// amount of re-ranking downstream can fix that; it needs a different
// universe-construction mechanism. This is that mechanism.
//
// Real, not fabricated: the raw symbol list comes from Alpaca's own
// /v2/assets endpoint (already-configured keys, no new provider needed,
// confirmed PAPER-only via alpaca-client.js's hardcoded BASE), and the
// liquidity filter uses real daily dollar volume from Alpaca's real
// snapshot quotes (fetchAlpacaQuotes, already existing, already batches
// internally) — never a hardcoded list of "known liquid names," which
// would just reintroduce the same bias one level down.
//
// Additive: does NOT replace SCAN_UNIVERSE or DAYTRADE_UNIVERSE — every
// existing call site of those is untouched. This is a new, larger,
// periodically-refreshed source, consumed by autopilot2-engine.js the same
// additive way DAYTRADE_UNIVERSE was added (fetchDaytradeUniverseCandidates,
// 2026-09-03) — one more real candidate source feeding the exact same
// canonical scoring/verdict bar, never a second engine or a looser one.
//
// Refresh is explicitly NOT on the hot tick path — fetching+filtering
// thousands of symbols takes real time and real provider calls, so it's a
// slow background job (see server.js's registerJob call) that persists its
// result; getDynamicUniverse()/getUniverseRotationBatch() below only ever
// read that persisted result, synchronously, no network.

const { alpacaTradingRequest } = require("./providers/alpaca-client");
const { fetchAlpacaQuotes } = require("./providers/alpaca-data");
const { readJsonSafe, writeJsonAtomic } = require("./atomic-write");

const MAJOR_EXCHANGES = new Set(["NASDAQ", "NYSE", "ARCA", "BATS"]);
// Real, disclosed floors — not a hand-picked symbol list. $3 avoids penny-
// stock noise; $5M/day avg dollar volume is a defensible small-cap-
// inclusive liquidity bar (small enough to admit real small/mid-caps,
// large enough that a paper order wouldn't move the tape).
const MIN_PRICE = 3;
const MIN_DOLLAR_VOLUME = 5_000_000;
// Headroom above the platform's own 500-symbol target — ranked by real
// liquidity, top N kept, so growth room exists without re-tuning constants.
const MAX_UNIVERSE_SIZE = 750;
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UNIVERSE_PATH = "data/dynamic-universe.json";
const CURSOR_PATH = "data/dynamic-universe-cursor.json";
// Plain common-stock-shaped tickers only — excludes warrants/units/rights
// (.WS/.U/.R-style suffixes) and other non-alpha symbols Alpaca's asset
// list otherwise includes.
const PLAIN_TICKER_RE = /^[A-Z]{1,5}$/;

// Pure — filters Alpaca's raw /v2/assets rows to active, tradable,
// major-exchange, plain-ticker symbols. No network, no I/O; unit-testable.
function filterTradableAssets(assets) {
  return (assets || [])
    .filter((a) => a && a.tradable && a.status === "active" && MAJOR_EXCHANGES.has(a.exchange))
    .map((a) => a.symbol)
    .filter((s) => typeof s === "string" && PLAIN_TICKER_RE.test(s));
}

// Pure — ranks real quote rows by real dollar volume (price × volume),
// drops anything below the disclosed liquidity floor, caps to
// MAX_UNIVERSE_SIZE. No network, no I/O; unit-testable.
function rankByLiquidity(quoteRows) {
  const rows = (quoteRows || [])
    .filter((q) => q && Number.isFinite(q.price) && q.price >= MIN_PRICE)
    .map((q) => ({ symbol: q.symbol, price: q.price, dollarVolume: q.price * (q.volume || 0) }))
    .filter((r) => r.dollarVolume >= MIN_DOLLAR_VOLUME);
  rows.sort((a, b) => b.dollarVolume - a.dollarVolume);
  return rows.slice(0, MAX_UNIVERSE_SIZE);
}

// Real network fetch + filter + persist. Never called from a hot path —
// intended to run on a slow background schedule (server.js registerJob).
// Honest failure discipline: a failed or empty refresh NEVER overwrites a
// previously-good persisted universe — Autopilot 2.0 keeps trading off the
// last real universe rather than silently going candidate-empty because
// one refresh attempt hit a timeout.
async function refreshDynamicUniverse() {
  const res = await alpacaTradingRequest("/v2/assets?status=active&asset_class=us_equity", "GET");
  if (!res.ok || !Array.isArray(res.data)) return null;

  const candidates = filterTradableAssets(res.data);
  if (!candidates.length) return null;

  const quotes = await fetchAlpacaQuotes(candidates);
  const ranked = rankByLiquidity(quotes);
  if (!ranked.length) return null;

  const record = {
    universe: ranked.map((r) => r.symbol),
    builtAt: Date.now(),
    sourceCount: candidates.length,
    liquidCount: ranked.length,
    minDollarVolume: MIN_DOLLAR_VOLUME,
  };
  writeJsonAtomic(UNIVERSE_PATH, record);
  return record;
}

// Fast, synchronous, no network — reads the last-persisted universe.
// `stale` is informational only (surfaced to callers/UI); it does not by
// itself block anything, matching this codebase's existing data-health
// convention of disclosing staleness rather than silently hiding it.
function getDynamicUniverse() {
  const record = readJsonSafe(UNIVERSE_PATH, null);
  if (!record || !Array.isArray(record.universe) || !record.universe.length) {
    return { universe: [], builtAt: 0, stale: true };
  }
  const stale = (Date.now() - record.builtAt) > REFRESH_INTERVAL_MS * 2;
  return { ...record, stale };
}

// Real rotation — advances a persisted cursor through the dynamic universe
// batchSize symbols at a time, so the full 500+-symbol list gets scanned
// across several ticks instead of any single tick paying for all of them
// at once. Direct response to the Phase 0 audit's own performance finding:
// scan concurrency is fixed at 6 workers against a single unofficial
// provider — this rotation reaches full real coverage over time without
// depending on that concurrency limit being raised first.
function getUniverseRotationBatch(batchSize) {
  const { universe } = getDynamicUniverse();
  if (!universe.length) return [];
  const size = Math.max(1, Math.min(batchSize, universe.length));
  const state = readJsonSafe(CURSOR_PATH, { cursor: 0 });
  const start = ((state.cursor % universe.length) + universe.length) % universe.length;
  const batch = [];
  for (let i = 0; i < size; i++) batch.push(universe[(start + i) % universe.length]);
  writeJsonAtomic(CURSOR_PATH, { cursor: (start + size) % universe.length });
  return batch;
}

module.exports = {
  filterTradableAssets,
  rankByLiquidity,
  refreshDynamicUniverse,
  getDynamicUniverse,
  getUniverseRotationBatch,
  MIN_PRICE,
  MIN_DOLLAR_VOLUME,
  MAX_UNIVERSE_SIZE,
  REFRESH_INTERVAL_MS,
  UNIVERSE_PATH,
  CURSOR_PATH,
};
