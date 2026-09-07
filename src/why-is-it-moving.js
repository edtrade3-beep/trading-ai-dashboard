// why-is-it-moving.js — A+ Market Intelligence, spec §7 (2026-09-05, see
// .claude/plans/proud-yawning-unicorn.md). A real, on-demand aggregator
// over already-existing, already-computed data — no new market-data
// fetch, no new scoring formula, no LLM call. Confidence values are
// real derived numbers (a news item's own already-computed impact
// score, or a real ratio of how much of the move a sector/market
// benchmark's own change could plausibly account for) — never a
// fabricated percentage. Spec's own mandatory rule, carried through
// exactly: zero qualifying candidates means an honest `unexplained:
// true`, never a forced weak guess.
"use strict";

const { etfOf } = require("./sector-theme-map");

const NEWS_IMPACT_THRESHOLD = 60; // matches this app's own HIGH-impact bar (src/news/scorer.js's impactClassification)
const RATIO_THRESHOLD = 20; // a sector/market move explaining less than a real 20% of the ticker's own move isn't a credible driver

// Real ratio: "how much of the ticker's own move could this benchmark's
// own move plausibly account for" — 0 when directions disagree (a
// falling sector can't explain a rising stock), capped at 95 (never
// claims to fully explain a move with a single external factor).
function explanatoryRatio(tickerChg, benchmarkChg) {
  if (!Number.isFinite(tickerChg) || !Number.isFinite(benchmarkChg) || tickerChg === 0) return 0;
  if ((tickerChg > 0) !== (benchmarkChg > 0)) return 0; // opposite directions never "explain" the move
  return Math.max(0, Math.min(95, Math.round(Math.abs(benchmarkChg / tickerChg) * 100)));
}

// newsItems: recent real scored rows for this ticker (news/store.js's
// getFeed({ticker}) shape — impact_score, category, headline, sentiment).
// sectorChg/marketChg: real % change of the ticker's own sector ETF and
// of SPY (or QQQ, whichever moved more) today.
function rankMoveDrivers({ tickerChg, sectorName, sectorChg, marketChg, newsItems = [], marketLabel = "Broad market move" }) {
  const candidates = [];

  for (const item of newsItems) {
    const impact = Number(item.impact_score);
    if (Number.isFinite(impact) && impact >= NEWS_IMPACT_THRESHOLD) {
      candidates.push({ type: "NEWS", label: item.headline, confidence: impact, detail: item.category || null, url: item.url || null });
    }
  }

  const sectorRatio = explanatoryRatio(tickerChg, sectorChg);
  if (sectorRatio >= RATIO_THRESHOLD) {
    candidates.push({ type: "SECTOR", label: `${sectorName || "Sector"} ${sectorChg > 0 ? "strength" : "weakness"} (${sectorChg > 0 ? "+" : ""}${sectorChg.toFixed(2)}%)`, confidence: sectorRatio, detail: null, url: null });
  }

  const marketRatio = explanatoryRatio(tickerChg, marketChg);
  if (marketRatio >= RATIO_THRESHOLD) {
    candidates.push({ type: "MARKET", label: `${marketLabel} (${marketChg > 0 ? "+" : ""}${marketChg.toFixed(2)}%)`, confidence: marketRatio, detail: null, url: null });
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  const drivers = candidates.slice(0, 4);
  return { drivers, unexplained: drivers.length === 0 };
}

// Crypto has no sector ETF, no confirmation.js divergence check (built for
// equity price-vs-headline confirmation), and its news isn't in this app's
// stock-oriented news/store.js pipeline (src/news/ticker-matcher.js has no
// crypto matching at all) — so it needs its own real data path rather than
// reusing computeWhyIsItMoving's equity fetch. It DOES reuse the same real
// classifier/sentiment/scorer pipeline (news/classifier.js, sentiment.js,
// scorer.js) and the same rankMoveDrivers ranking/threshold logic — just a
// "CRYPTO_MARKET" comparison (total real crypto market-cap % change) in
// place of the equity SECTOR/SPY-QQQ comparisons.
const CRYPTO_NAME = { BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana" };
function isCryptoSymbol(symbol) { return Object.prototype.hasOwnProperty.call(CRYPTO_NAME, String(symbol || "").toUpperCase()); }

async function computeCryptoWhyIsItMoving(symbol) {
  const { resolveProviderKeys, PORT } = require("./config");
  const { fetchFmpCryptoNews } = require("./providers/fmp");
  const { classifyCatalyst } = require("./news/classifier");
  const { classifySentiment } = require("./news/sentiment");
  const { computeImpactScore } = require("./news/scorer");
  const keys = resolveProviderKeys(new URLSearchParams());

  const base = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
  const getJson = async (p) => { try { const r = await fetch(`${base()}${p}`); return await r.json(); } catch { return null; } };

  const [cryptoData, rawNews] = await Promise.all([
    getJson("/api/market/crypto"),
    keys.fmp ? fetchFmpCryptoNews(keys.fmp, 40).catch(() => []) : Promise.resolve([]),
  ]);

  const coin = (cryptoData?.coins || []).find((c) => c.symbol === symbol);
  const tickerChg = Number(coin?.changesPercentage);
  if (!coin || !Number.isFinite(tickerChg)) {
    return { ok: false, symbol, error: "Real price/change data unavailable for this coin right now." };
  }
  const marketChg = Number(cryptoData?.globalMacro?.marketCapChange24h);

  // Real, disclosed relevance filter — FMP's crypto-news feed isn't
  // reliably ticker-tagged, so this matches the coin's own symbol/name in
  // the real headline+summary text rather than trusting a `symbol` field
  // that's frequently blank for general crypto-market stories.
  const name = CRYPTO_NAME[symbol];
  const relevant = (rawNews || []).filter((item) => {
    const text = `${item.headline || ""} ${item.summary || ""}`.toLowerCase();
    return text.includes(symbol.toLowerCase()) || text.includes(name.toLowerCase());
  }).slice(0, 8);

  const newsItems = relevant.map((item) => {
    const { category, catalystWeight } = classifyCatalyst(item);
    const { sentiment } = classifySentiment(item);
    // No real price-vs-news confirmation source exists for crypto in this
    // app (confirmation.js's detectNewsDivergence is built on equity SPY/
    // QQQ context) — pass null, same honest "confirmation unavailable,
    // real mid-point" path computeImpactScore already has for that case.
    const { impactScore } = computeImpactScore({ ...item, catalystWeight, sentiment }, null);
    return { impact_score: impactScore, headline: item.headline, category, url: item.url };
  });

  const { drivers, unexplained } = rankMoveDrivers({
    tickerChg,
    sectorName: null, sectorChg: null, // no real sector concept for crypto
    marketChg: Number.isFinite(marketChg) ? marketChg : null,
    marketLabel: "Broad crypto market move",
    newsItems,
  });

  return {
    ok: true, symbol, tickerChg, drivers, unexplained,
    ...(keys.fmp ? {} : { newsNote: "No FMP API key configured — crypto news drivers are unavailable, real price/market-move drivers only." }),
  };
}

async function computeWhyIsItMoving(symbol) {
  if (isCryptoSymbol(symbol)) return computeCryptoWhyIsItMoving(String(symbol).toUpperCase());

  const { fetchMarketQuotes } = require("./routes/market");
  const { getFeed, isReady } = require("./news/store");
  const { resolveProviderKeys, PORT } = require("./config");
  const keys = resolveProviderKeys(new URLSearchParams());

  const base = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
  const getJson = async (p) => { try { const r = await fetch(`${base()}${p}`); return await r.json(); } catch { return null; } };

  const [quotes, macroRegime, newsResult] = await Promise.all([
    fetchMarketQuotes([symbol, "SPY", "QQQ"], keys).catch(() => []),
    getJson("/api/market/macro-regime"),
    isReady() ? getFeed({ ticker: symbol, sinceMinutes: 1440, limit: 5 }).catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] }),
  ]);

  const bySym = new Map((quotes || []).map((q) => [String(q.symbol || "").toUpperCase(), q]));
  const tickerQuote = bySym.get(String(symbol).toUpperCase());
  const tickerChg = Number(tickerQuote?.changesPercentage ?? tickerQuote?.delta1d);
  if (!tickerQuote || !Number.isFinite(tickerChg)) {
    return { ok: false, symbol, error: "Real price/change data unavailable for this symbol right now." };
  }

  const spyChg = Number(bySym.get("SPY")?.changesPercentage ?? bySym.get("SPY")?.delta1d);
  const qqqChg = Number(bySym.get("QQQ")?.changesPercentage ?? bySym.get("QQQ")?.delta1d);
  // Whichever real broad-market benchmark moved more today — the
  // stronger, more relevant real comparison for this specific move.
  const marketChg = [spyChg, qqqChg].filter(Number.isFinite).sort((a, b) => Math.abs(b) - Math.abs(a))[0] ?? null;

  const etf = etfOf(String(symbol).toUpperCase());
  const sectorRow = etf && macroRegime?.sectorRotation?.ranked
    ? macroRegime.sectorRotation.ranked.find((s) => s.sym === etf)
    : null;

  const { drivers, unexplained } = rankMoveDrivers({
    tickerChg,
    sectorName: sectorRow?.name || null,
    sectorChg: Number.isFinite(sectorRow?.change) ? sectorRow.change : null,
    marketChg,
    newsItems: newsResult?.rows || [],
  });

  return { ok: true, symbol: String(symbol).toUpperCase(), tickerChg, drivers, unexplained };
}

module.exports = { computeWhyIsItMoving, computeCryptoWhyIsItMoving, isCryptoSymbol, rankMoveDrivers, explanatoryRatio, NEWS_IMPACT_THRESHOLD, RATIO_THRESHOLD };
