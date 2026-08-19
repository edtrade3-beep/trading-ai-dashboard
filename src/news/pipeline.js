// src/news/pipeline.js — the real ingestion tick: provider -> normalize ->
// dedupe -> classify -> sentiment -> confirmation (batched, one fetch per
// unique ticker, not per headline) -> impact score -> verdict -> store.
// Registered as a background job in server.js, same registerJob pattern
// every other alert/scan job already uses.
"use strict";

const { getNewsProvider } = require("./provider");
const { normalizeBatch } = require("./normalizer");
const { dedupeBatch } = require("./dedupe");
const { classifyCatalyst } = require("./classifier");
const { classifySentiment } = require("./sentiment");
const { computeImpactScore, deriveVerdict, deriveNewsSignal } = require("./scorer");
const { confirmationFromRow, fetchConfirmationRows } = require("./confirmation");
const { insertNewsItems, isReady, pruneOld } = require("./store");

// Same real per-tick safety discipline as src/lightbox-state-store.js's
// MAX_SCAN_SYMBOLS — sized conservatively against the same real 2026-08-17
// rate-limit incident precedent (a full-watchlist burst every tick tripped
// Alpaca's rate limit once already; news ingestion hits Finnhub/Polygon/
// Yahoo/Google instead, but the same "cap the per-tick burst, rotate
// through the rest over subsequent ticks" discipline applies).
const MAX_TICKERS_PER_TICK = 60;
let scanOffset = 0;

function rotateSlice(arr, offset, count) {
  if (arr.length <= count) return arr;
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(arr[(offset + i) % arr.length]);
  return out;
}

async function runIngestionTick() {
  if (!isReady()) return { ok: true, skipped: "no database configured for news storage" };

  const { loadWatchlist } = require("../routes/watchlist");
  const allSymbols = (loadWatchlist().symbols || []).map((s) => String(s).toUpperCase());
  if (!allSymbols.length) return { ok: true, checked: 0 };

  const symbols = rotateSlice(allSymbols, scanOffset, MAX_TICKERS_PER_TICK);
  scanOffset = allSymbols.length ? (scanOffset + MAX_TICKERS_PER_TICK) % allSymbols.length : 0;

  const provider = getNewsProvider();
  let providerOk = true;
  let raw = [];
  try {
    raw = await provider.getLatestNews(symbols, 5); // 5 headlines/ticker keeps the batch bounded
  } catch {
    providerOk = false;
  }

  const normalized = normalizeBatch(raw);
  const deduped = dedupeBatch(normalized);
  if (!deduped.length) {
    await pruneOld().catch(() => {});
    return { ok: true, providerOk, checked: symbols.length, fetched: raw.length, inserted: 0 };
  }

  // Classify + sentiment first (cheap, no I/O) so we know exactly which
  // unique tickers actually need a real confirmation fetch.
  const classified = deduped.map((item) => {
    const cat = classifyCatalyst(item);
    const sent = classifySentiment(item);
    return { ...item, category: cat.category, catalystWeight: cat.catalystWeight, sentiment: sent.sentiment, sentimentScore: sent.score };
  });

  const uniqueTickers = [...new Set(classified.map((i) => i.ticker))];
  const { rowsBySymbol, spyChg } = await fetchConfirmationRows(uniqueTickers).catch(() => ({ rowsBySymbol: {}, spyChg: null }));

  const enriched = classified.map((item) => {
    const confirmation = confirmationFromRow(rowsBySymbol[item.ticker], spyChg, item.sentiment);
    const impact = computeImpactScore(item, confirmation);
    const verdict = deriveVerdict({ sentiment: item.sentiment, impactScore: impact.impactScore, confirmation });
    const newsSignal = deriveNewsSignal({ sentiment: item.sentiment, confirmation });
    return {
      ...item,
      impactScore: impact.impactScore, freshnessScore: impact.freshnessScore,
      confirmation, verdict, newsSignal,
    };
  });

  const { inserted } = await insertNewsItems(enriched);
  await pruneOld().catch(() => {});
  return { ok: true, providerOk, checked: symbols.length, fetched: raw.length, deduped: deduped.length, inserted };
}

module.exports = { runIngestionTick };
