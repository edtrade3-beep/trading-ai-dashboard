// src/news/ticker-matcher.js — the concrete provider (fetchMarketNews)
// already tags every item with the real ticker it was queried for, so this
// is mostly a validation pass. The regex fallback exists for a future
// provider (e.g. a broad "latest market news" feed with no per-ticker
// query) that returns untagged items — matched against the real watchlist
// + SCAN_UNIVERSE symbol lists this app already loads elsewhere, never a
// guessed/fabricated ticker.
"use strict";

let _universeCache = null;
function realUniverse() {
  if (_universeCache) return _universeCache;
  const { loadWatchlist } = require("../routes/watchlist");
  const { SCAN_UNIVERSE } = require("../advisor-ai");
  const watchlist = (loadWatchlist().symbols || []).map((s) => String(s).toUpperCase());
  _universeCache = new Set([...watchlist, ...SCAN_UNIVERSE.map((s) => String(s).toUpperCase())]);
  return _universeCache;
}

// Cheap invalidation hook — the watchlist can change between ingestion
// ticks; called once per pipeline run rather than cached indefinitely.
function refreshUniverse() {
  _universeCache = null;
  return realUniverse();
}

// Matches real, standalone $TICKER or (TICKER) mentions and bare uppercase
// 1-5 letter tokens that are ALSO in the real known universe — avoids
// matching ordinary capitalized words ("AI", "CEO") by requiring universe
// membership, not just a regex shape.
function extractTickers(text, universe) {
  const u = universe || realUniverse();
  const found = new Set();
  const dollarMatches = String(text || "").match(/\$([A-Z]{1,5})\b/g) || [];
  for (const m of dollarMatches) { const t = m.slice(1); if (u.has(t)) found.add(t); }
  const bareTokens = String(text || "").match(/\b[A-Z]{2,5}\b/g) || [];
  for (const t of bareTokens) if (u.has(t)) found.add(t);
  return [...found];
}

// item already has a real .ticker from the provider in the common path;
// this only kicks in when that's missing (defensive fallback, not the
// primary path).
function matchTicker(item) {
  if (item.ticker) return item.ticker;
  const candidates = extractTickers(item.headline);
  return candidates[0] || null;
}

module.exports = { extractTickers, matchTicker, realUniverse, refreshUniverse };
