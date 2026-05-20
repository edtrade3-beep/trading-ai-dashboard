"use strict";
/**
 * StockTwits public API — no auth key required for read-only access
 * Rate limit: ~200 req/hour without OAuth token
 *
 * Endpoints used:
 *   GET /api/2/trending/symbols.json          — top trending tickers
 *   GET /api/2/streams/symbol/{sym}.json      — recent messages + sentiment
 */

const BASE = "https://api.stocktwits.com/api/2";
const UA   = "AMTradingPlatform/1.0 (stocktwits reader)";

// ── Simple in-memory TTL cache ────────────────────────────────────────────────
const _cache = new Map();

function cached(key, ttlMs, fn) {
  const now = Date.now();
  const hit = _cache.get(key);
  if (hit && now - hit.ts < ttlMs) return Promise.resolve(hit.value);
  return fn().then(val => {
    _cache.set(key, { ts: Date.now(), value: val });
    return val;
  });
}

// ── Fetch top trending symbols ────────────────────────────────────────────────
// Cached 5 minutes so repeated calls don't hammer the API

async function fetchTrending(limit = 30) {
  return cached("trending", 5 * 60_000, async () => {
    const r = await fetch(`${BASE}/trending/symbols.json`, {
      headers: { "User-Agent": UA },
      signal:  AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`StockTwits trending HTTP ${r.status}`);
    const d = await r.json();
    return (d.symbols || []).slice(0, limit).map(s => ({
      symbol:         s.symbol,
      title:          s.title   || s.symbol,
      watchlistCount: s.watchlist_count || 0,
    }));
  });
}

// ── Fetch recent message sentiment for a symbol ───────────────────────────────
// Returns bullish/bearish counts + 3 message previews
// Cached 3 minutes per symbol

async function fetchSentiment(symbol, limit = 30) {
  const sym = symbol.toUpperCase();
  return cached(`sent:${sym}`, 3 * 60_000, async () => {
    const r = await fetch(
      `${BASE}/streams/symbol/${encodeURIComponent(sym)}.json?limit=${limit}`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12_000) }
    );
    if (!r.ok) throw new Error(`StockTwits ${sym} HTTP ${r.status}`);
    const d = await r.json();

    const messages = d.messages || [];
    let bullish = 0, bearish = 0, neutral = 0;
    for (const m of messages) {
      const s = m.entities?.sentiment?.basic;
      if      (s === "Bullish") bullish++;
      else if (s === "Bearish") bearish++;
      else                      neutral++;
    }

    const total   = messages.length;
    const bullPct = total > 0 ? Math.round(bullish / total * 100) : 0;
    const bearPct = total > 0 ? Math.round(bearish / total * 100) : 0;

    let sentiment;
    if (bullish === 0 && bearish === 0) sentiment = "NO SENTIMENT DATA";
    else if (bullPct >= 65)             sentiment = "BULLISH";
    else if (bearPct >= 65)             sentiment = "BEARISH";
    else                                sentiment = "MIXED";

    // 3 most recent message snippets with emoji
    const previews = messages.slice(0, 3).map(m => {
      const se = m.entities?.sentiment?.basic;
      const e  = se === "Bullish" ? "🟢" : se === "Bearish" ? "🔴" : "⚪";
      const body = (m.body || "").replace(/[\n\r]+/g, " ").trim().slice(0, 90);
      return `${e} ${body}`;
    });

    return { symbol: sym, bullish, bearish, neutral, total, bullPct, bearPct, sentiment, previews };
  });
}

module.exports = { fetchTrending, fetchSentiment };
