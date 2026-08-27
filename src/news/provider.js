// src/news/provider.js — NewsProvider abstraction (2026-08-19, explicit
// user spec: "Do NOT rely on unauthorized scraping or bypass Finviz
// restrictions. If direct Finviz API/data access is unavailable, create a
// clean NEWS_PROVIDER abstraction so another authorized news source can be
// substituted without rewriting the trading engine.")
//
// Real finding, confirmed by direct inspection before writing this: this
// app already has a "Finviz" integration (src/providers/finviz.js,
// src/routes/finviz.js), and it IS unauthorized HTML scraping (spoofed
// browser User-Agent against finviz.com/news.ashx, no API key, no ToS-
// backed access) — exactly what this spec says not to do. It is left
// untouched (pre-existing, out of scope for this feature) and this module
// never references it.
//
// What IS real and authorized: src/routes/market.js's fetchMarketNews,
// already used by the live /api/market/news route — a real provider-
// priority chain (Finnhub, keyed -> Polygon, keyed -> free Yahoo News +
// Google News RSS fallback, both public/keyless endpoints). That's the
// concrete NewsProvider implementation below. Swapping to a different
// authorized source later (a real News API subscription, etc.) means
// writing one new class here, not touching the pipeline/classifier/scorer.
"use strict";

const { resolveProviderKeys } = require("../config");

/**
 * @typedef {Object} RawNewsItem
 * @property {string} title
 * @property {string} source
 * @property {string|null} publishedAt - ISO string or null
 * @property {string} link
 * @property {string} summary
 * @property {string} [ticker]
 */

class NewsProvider {
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async getLatestNews(tickers, limit) { throw new Error("NewsProvider.getLatestNews not implemented"); }
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async getTickerNews(ticker, limit) { throw new Error("NewsProvider.getTickerNews not implemented"); }
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async searchNews(query, limit) { throw new Error("NewsProvider.searchNews not implemented"); }
}

// Real implementation — thin wrapper over the already-live fetchMarketNews
// chain. Lazy-required (not top-level) to avoid a require cycle: routes/
// market.js's own route handler lazily requires src/news/* modules too.
class MarketNewsProvider extends NewsProvider {
  constructor() {
    super();
    this._keys = resolveProviderKeys(new URLSearchParams()); // env-var-sourced only, no query-string override in a background job
  }

  async getLatestNews(tickers, limit = 20) {
    const { fetchMarketNews } = require("../routes/market");
    if (!Array.isArray(tickers) || !tickers.length) return [];
    try {
      // perTicker:true (2026-08-27 fix) — this call is always multi-ticker
      // (the ingestion pipeline's whole point), so it needs `limit` real
      // headlines per ticker, not `limit` total across the whole batch —
      // see fetchMarketNews's own header comment for the real bug this
      // closes (a few busy tickers were starving the rest of the batch).
      return await fetchMarketNews(tickers, limit, this._keys, { perTicker: true });
    } catch {
      return [];
    }
  }

  async getTickerNews(ticker, limit = 10) {
    return this.getLatestNews([String(ticker || "").toUpperCase()].filter(Boolean), limit);
  }

  async searchNews(query, limit = 10) {
    // fetchMarketNews is ticker-scoped (Finnhub/Polygon require a real
    // symbol); a free-text search only has a real, honest path through
    // the keyless Google News RSS leg it already uses internally.
    const { fetchGoogleNews } = require("../providers/googlenews");
    try {
      return await fetchGoogleNews(query, limit);
    } catch {
      return [];
    }
  }
}

let _instance = null;
function getNewsProvider() {
  if (!_instance) _instance = new MarketNewsProvider();
  return _instance;
}

module.exports = { NewsProvider, MarketNewsProvider, getNewsProvider };
