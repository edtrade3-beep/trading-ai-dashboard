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

  // Broad, non-ticker-scoped market news (2026-08-26, explicit user request:
  // "make sure system platform detect big/major news that change market
  // regime/change narrative"). Real gap found before this change: the fetch
  // above is per-watchlist-ticker only, so a genuinely regime-shifting
  // headline that doesn't name any watchlist symbol (e.g. "Fed Surprises
  // Markets With Emergency Rate Cut") never reached this pipeline at all —
  // it could only ever show up in the pull-only, unscored /api/market/
  // macro-news route. SPY/QQQ/DIA are broad-market ETFs, so a ticker-scoped
  // provider search on them still naturally surfaces Fed/CPI/jobs/
  // geopolitical coverage (same real technique /api/market/macro-news
  // already uses) without a second provider. Tagged ticker "MARKET" so it
  // reads as market-wide, not SPY-specific. No separate keyword pre-filter
  // needed: it flows through the SAME classifier/scorer below, and anything
  // merely incidental (a single-stock story that happened to surface via an
  // SPY search) lands in OTHER (catalyst weight 30) — mathematically
  // incapable of reaching the impact-score bar /majornews and the regime
  // alert below both use. Best-effort/isolated: a failure here never blocks
  // the primary per-ticker leg above.
  try {
    const marketRaw = await provider.getLatestNews(["SPY", "QQQ", "DIA"], 15);
    raw = raw.concat(marketRaw.map((item) => ({ ...item, ticker: "MARKET" })));
  } catch { /* best-effort secondary leg */ }

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

  const { inserted, insertedItems } = await insertNewsItems(enriched);
  await sendRegimeAlerts(insertedItems).catch(() => {});
  await pruneOld().catch(() => {});
  return { ok: true, providerOk, checked: symbols.length, fetched: raw.length, deduped: deduped.length, inserted };
}

// Proactive push for genuinely regime/narrative-shifting news (2026-08-26,
// explicit user request — see the classifier.js header comment for the
// real gap this closes). Deliberately narrower than /majornews's own
// HIGH/EXTREME (>=80) bar: gated to the 3 real regime-relevant categories
// (SYSTEMIC_RISK/GEOPOLITICAL/MACRO) so a routine single-stock M&A or FDA
// story — which can also clear 80 — never fires this specific alert; those
// are still visible via /majornews on request. Fires only on `insertedItems`
// (genuinely new rows this tick, per store.js's ON CONFLICT check), so the
// same story is never re-alerted on a later tick. sendTelegramMessage's own
// global 60s cooldown / 40-per-day cap (src/telegram.js) is the real
// backstop against a burst of simultaneous regime headlines spamming chat.
const REGIME_ALERT_CATEGORIES = new Set(["SYSTEMIC_RISK", "GEOPOLITICAL", "MACRO"]);
const REGIME_ALERT_MIN_IMPACT = 80;

async function sendRegimeAlerts(items) {
  const worthy = (items || []).filter(
    (i) => REGIME_ALERT_CATEGORIES.has(i.category) && Number(i.impactScore) >= REGIME_ALERT_MIN_IMPACT
  );
  if (!worthy.length) return;
  const { sendTelegramMessage } = require("../telegram");
  for (const item of worthy) {
    const cls = item.impactScore >= 90 ? "EXTREME" : "HIGH";
    const when = item.publishedAt
      ? new Date(item.publishedAt).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "";
    const text = [
      `🚨 MARKET REGIME ALERT — ${item.category} [${cls}]`,
      item.headline,
      [item.source, when].filter(Boolean).join(" · "),
      item.url || null,
      "",
      "/majornews for more",
    ].filter((l) => l != null).join("\n");
    await sendTelegramMessage(text).catch(() => {});
  }
}

module.exports = { runIngestionTick };
