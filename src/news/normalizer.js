// src/news/normalizer.js — raw provider item -> the spec's exact NEWS
// object shape. Every field here traces to something the provider actually
// returned; `receivedAt` is the one generated field (real — it's when this
// app's ingestion tick actually saw the item, not a fabricated timestamp).
// category/sentiment/impactScore/freshnessScore/catalystStrength are filled
// in by later pipeline stages (classifier/sentiment/scorer) and start out
// honestly null here, never a placeholder guess.
"use strict";

function normalizeNewsItem(raw, fallbackTicker) {
  if (!raw || !raw.title) return null;
  const ticker = String(raw.ticker || fallbackTicker || "").toUpperCase().trim();
  if (!ticker) return null;
  return {
    ticker,
    headline: String(raw.title).trim(),
    source: String(raw.source || raw.publisher || "Unknown").trim(),
    url: String(raw.link || raw.url || "").trim(),
    publishedAt: raw.publishedAt || null,
    receivedAt: new Date().toISOString(),
    summary: String(raw.summary || "").trim(),
    category: null,
    sentiment: null,
    impactScore: null,
    freshnessScore: null,
    catalystStrength: null,
    confirmation: null,
    verdict: null,
  };
}

function normalizeBatch(rawItems, fallbackTicker) {
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((r) => normalizeNewsItem(r, fallbackTicker))
    .filter(Boolean);
}

module.exports = { normalizeNewsItem, normalizeBatch };
