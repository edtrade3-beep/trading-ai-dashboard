"use strict";

// future-value-scan.js — real batch scan powering "🚀 FUTURE STOCKS" /
// "💎 UNDERVALUED STOCKS" (explicit user request, 2026-08-11: "Add TWO
// separate sections to my trading platform ... Never confuse 'good
// company' with 'good stock price'"). Scores real FMP fundamentals
// (src/providers/fmp.js — confirmed live-configured on this server) with
// src/future-value-scoring.js's disclosed real-data-only formulas, priced
// against real live quotes from the same Watchlist ∪ SCAN_UNIVERSE universe
// every other Sniper feature already scans (screenWatchlistCached, in
// src/routes/market.js — reused here rather than duplicating a price fetch).
//
// Kept as a standalone route file (not added into src/routes/market.js)
// deliberately — that file has its own unrelated in-progress edits this
// session and is left alone.
//
// Fundamentals move on a quarterly cadence, not intraday, so each symbol's
// FMP fundamentals are cached for 6 hours (own cache here, not the shared
// 3-min screener cache which is tuned for live price/technicals) — long
// enough to avoid hammering FMP on every scan, short enough to pick up a
// same-day earnings print. Concurrency capped at 6 in flight, the same
// worker-pool pattern screenTrendTemplate already uses for this exact
// 100+ symbol universe.

const { writeJson } = require("../utils");
const { resolveProviderKeys } = require("../config");
const { fetchFmpFundamentals } = require("../providers/fmp");
const { computeFutureValueRead } = require("../future-value-scoring");
const { loadWatchlist } = require("./watchlist");
const { SCAN_UNIVERSE } = require("../advisor-ai");

let screenWatchlistCached = null;
try { ({ screenWatchlistCached } = require("./market")); } catch { /* left null, route reports "screener unavailable" */ }

const FUND_TTL_MS = 6 * 60 * 60_000; // 6h — real fundamentals don't move intraday
const _fundCache = new Map(); // symbol -> { ts, data }

async function getFundamentalsCached(symbol, fmpKey) {
  const hit = _fundCache.get(symbol);
  const now = Date.now();
  if (hit && now - hit.ts < FUND_TTL_MS) return hit.data;
  const data = await fetchFmpFundamentals(symbol, fmpKey).catch(() => null);
  _fundCache.set(symbol, { ts: now, data });
  return data;
}

async function runFutureValueScan(keys) {
  if (!keys.fmp) return { ok: false, error: "FMP not configured", rows: [] };
  if (!screenWatchlistCached) return { ok: false, error: "screener unavailable", rows: [] };

  const { symbols: watchlistSymbols } = loadWatchlist();
  const symbols = [...new Set([...(watchlistSymbols || []), ...SCAN_UNIVERSE])];
  if (!symbols.length) return { ok: true, rows: [] };

  const priceRows = await screenWatchlistCached(symbols).catch(() => []);
  const priceBySymbol = new Map((priceRows || []).filter((r) => !r.error).map((r) => [r.symbol, r]));

  const queue = symbols.slice();
  const rows = [];
  async function worker() {
    while (queue.length) {
      const symbol = queue.shift();
      const priceRow = priceBySymbol.get(symbol);
      if (!priceRow || !(Number(priceRow.price) > 0)) continue;
      const f = await getFundamentalsCached(symbol, keys.fmp);
      if (!f) continue;
      const read = computeFutureValueRead(f, priceRow.price);
      if (!read) continue;
      rows.push({
        symbol,
        name: f.name || priceRow.longName || symbol,
        price: priceRow.price,
        sector: f.sector || null,
        ...read,
      });
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return { ok: true, rows };
}

// Single-symbol path — powers AM Cortex's per-stock analysis (explicit
// user request, 2026-08-11: "AM CORTEX"). Reuses the exact same real
// fundamentals fetch/cache/scoring as the full universe scan above; not a
// second implementation. Symbol needn't be in Watchlist ∪ SCAN_UNIVERSE —
// Cortex must be able to answer about any real ticker.
async function runFutureValueSymbol(symbol, keys) {
  if (!keys.fmp) return { ok: false, error: "FMP not configured" };
  if (!screenWatchlistCached) return { ok: false, error: "screener unavailable" };
  const priceRows = await screenWatchlistCached([symbol]).catch(() => []);
  const priceRow = (priceRows || []).find((r) => !r.error && r.symbol === symbol);
  if (!priceRow || !(Number(priceRow.price) > 0)) return { ok: false, error: "No real live price for this symbol" };
  const f = await getFundamentalsCached(symbol, keys.fmp);
  if (!f) return { ok: false, error: "No real fundamentals data for this symbol" };
  const read = computeFutureValueRead(f, priceRow.price);
  if (!read) return { ok: false, error: "Could not score this symbol from real data" };
  return { ok: true, row: { symbol, name: f.name || priceRow.longName || symbol, price: priceRow.price, sector: f.sector || null, ...read } };
}

async function handleFutureValueScan(req, res, requestUrl) {
  try {
    const keys = resolveProviderKeys(requestUrl.searchParams);
    const symbolParam = (requestUrl.searchParams.get("symbol") || "").trim().toUpperCase();
    if (symbolParam) {
      const { ok, error, row } = await runFutureValueSymbol(symbolParam, keys);
      return writeJson(res, 200, ok ? { ok: true, row } : { ok: false, error });
    }
    const { ok, error, rows } = await runFutureValueScan(keys);
    if (!ok) return writeJson(res, 200, { ok: false, error, future: [], undervalued: [], overlap: [] });

    // 🚀 FUTURE STOCKS — real forward-quality read (growth durability +
    // moat proxy + financial strength), regardless of today's price.
    const future = rows
      .filter((r) => r.futureScore != null && r.futureScore >= 55)
      .sort((a, b) => b.futureScore - a.futureScore)
      .slice(0, 25);

    // 💎 UNDERVALUED STOCKS — real cheap-relative-to-fundamentals read,
    // excluding anything already priced above its own real analyst fair
    // value (TOO_EXPENSIVE zone) even if the value multiples look cheap.
    const undervalued = rows
      .filter((r) => r.valueScore != null && r.valueScore >= 55 && r.fairValue?.zone !== "TOO_EXPENSIVE")
      .sort((a, b) => b.valueScore - a.valueScore)
      .slice(0, 25);

    // 🏆 FUTURE + UNDERVALUED — requires both real reads at once (see
    // isFutureAndUndervalued in future-value-scoring.js), never just one.
    const overlap = rows
      .filter((r) => r.isFutureAndUndervalued)
      .sort((a, b) => b.futureScore - a.futureScore);

    return writeJson(res, 200, { ok: true, future, undervalued, overlap, scanned: rows.length, updatedAt: new Date().toISOString() });
  } catch (e) {
    return writeJson(res, 200, { ok: false, error: e.message, future: [], undervalued: [], overlap: [] });
  }
}

module.exports = { handleFutureValueScan, runFutureValueScan, runFutureValueSymbol };
