"use strict";
// routes/valuation.js (2026-09-17, "VALUATION ENGINE" master prompt) —
// real HTTP surface for src/valuation-engine.js, the one canonical
// valuation authority. Fetches real FMP fundamentals + real multi-quarter
// history + real Yahoo forward EPS + real current price, then calls the
// SAME real computeValuationProfile every other consumer (canonical-
// decision-pipeline.js) uses — never a second formula.
const { writeJson } = require("../utils");
const { resolveProviderKeys } = require("../config");
const { fetchFmpFundamentals, fetchFmpFundamentalsHistory } = require("../providers/fmp");
const { fetchYahooQuoteBatch, fetchYahooFundamentals } = require("../providers/yahoo");
const { computeValuationProfile } = require("../valuation-engine");

const CACHE_TTL_MS = 15 * 60_000; // fundamentals move on a quarterly cadence, not intraday
const _cache = new Map();

// GET /api/market/valuation?symbol=X
async function handleValuation(req, res, requestUrl) {
  const symbol = (requestUrl.searchParams.get("symbol") || "").trim().toUpperCase();
  if (!symbol) return writeJson(res, 400, { ok: false, error: "symbol required" });
  try {
    const hit = _cache.get(symbol);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return writeJson(res, 200, hit.data);

    const keys = resolveProviderKeys(requestUrl.searchParams);
    if (!keys.fmp) return writeJson(res, 200, { ok: false, error: "FMP not configured" });

    const [fundamentals, fundamentalsHistory, quotes, yahooFundamentals] = await Promise.all([
      fetchFmpFundamentals(symbol, keys.fmp).catch(() => null),
      fetchFmpFundamentalsHistory(symbol, keys.fmp, 4).catch(() => null),
      fetchYahooQuoteBatch([symbol]).catch(() => []),
      fetchYahooFundamentals(symbol).catch(() => null),
    ]);
    if (!fundamentals) return writeJson(res, 200, { ok: false, error: `No real fundamentals data for ${symbol} right now.` });

    const price = Number(quotes?.find((q) => q.symbol === symbol)?.regularMarketPrice) || null;

    const profile = computeValuationProfile({
      fundamentals, fundamentalsHistory, price, forwardEps: yahooFundamentals?.epsForward ?? null,
      // priceChangePct (the real price move over the same multi-quarter
      // window computeFundamentalDivergence optionally uses) isn't fetched
      // here — a real quote gives today's move, not the multi-quarter
      // window's — left honestly null rather than approximated.
      priceChangePct: null,
    });

    const data = { ok: true, symbol, price, ...profile };
    _cache.set(symbol, { at: Date.now(), data });
    return writeJson(res, 200, data);
  } catch (err) {
    return writeJson(res, 200, { ok: false, error: err instanceof Error ? err.message : "Valuation unavailable." });
  }
}

module.exports = { handleValuation };
