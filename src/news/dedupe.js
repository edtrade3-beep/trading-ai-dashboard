// src/news/dedupe.js — real dedup key from headline+source+ticker, DB-
// enforced via news_items' UNIQUE(dedupe_key) constraint (src/news/store.js)
// rather than trusted app-side alone. Same normalized-title dedup approach
// fetchMarketNews already uses within one ticker's own Yahoo+Google merge
// (src/routes/market.js) — this extends it to the persisted store.
"use strict";

const crypto = require("node:crypto");

function normalizeHeadline(headline) {
  return String(headline || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dedupeKey(item) {
  const norm = normalizeHeadline(item.headline).slice(0, 120);
  const raw = `${item.ticker}|${norm}|${(item.source || "").toLowerCase()}`;
  return crypto.createHash("sha1").update(raw).digest("hex");
}

// In-batch dedupe before it ever reaches the DB (cheap, avoids a wasted
// round-trip per duplicate within the same ingestion tick).
function dedupeBatch(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = dedupeKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, dedupeKey: key });
  }
  return out;
}

module.exports = { dedupeKey, dedupeBatch, normalizeHeadline };
