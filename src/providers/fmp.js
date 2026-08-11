const { fetchJsonSafe } = require("../utils");

// FMP retired their entire legacy /api/v3/ and /api/v4/ endpoint family on
// 2025-08-31 (confirmed live, 2026-08-03: every function below was hitting a
// 403 "Legacy Endpoint" error and silently returning null/[] via
// fetchJsonSafe, so this app's paid FMP tier had been effectively unusable
// for fundamentals/earnings/quotes for months — real user report "why don't
// we use FMP more" traced to this, not an architecture choice). Migrated to
// the current /stable/ API, field names verified against real live
// responses (several fields were renamed, not just moved — e.g.
// changesPercentage -> changePercentage, peRatioTTM -> priceToEarningsRatioTTM,
// calendarYear -> fiscalYear, growthEPS -> epsgrowth (lowercase g)).
function normalizeFmpQuoteRow(raw) {
  if (!raw) return null;
  const symbol = String(raw.symbol || "").toUpperCase();
  if (!symbol) return null;
  const price = Number(raw.price);
  const previousClose = Number(raw.previousClose);
  const change = Number(raw.change);
  const changesPercentage = Number(raw.changePercentage);
  return {
    symbol,
    name: raw.name || raw.companyName || symbol,
    price: Number.isFinite(price) ? price : 0,
    change: Number.isFinite(change) ? change : 0,
    changesPercentage: Number.isFinite(changesPercentage) ? changesPercentage : 0,
    open: Number(raw.open) || 0,
    previousClose: Number.isFinite(previousClose) ? previousClose : 0,
    dayHigh: Number(raw.dayHigh) || 0,
    dayLow: Number(raw.dayLow) || 0,
    volume: Number(raw.volume) || 0,
    avgVolume: Number(raw.averageVolume) || 0,
    yearHigh: Number(raw.yearHigh) || 0,
    yearLow: Number(raw.yearLow) || 0,
    marketCap: Number(raw.marketCap) || 0,
    pe: 0, // /stable/quote no longer returns a P/E field — real ratios-ttm covers this in fetchFmpFundamentals
    priceAvg50: Number(raw.priceAvg50) || 0,
    priceAvg200: Number(raw.priceAvg200) || 0,
    preMarketPrice: 0,
    postMarketPrice: 0,
    preMarketChangePercent: 0,
    postMarketChangePercent: 0,
  };
}

// /stable/quote only accepts one symbol per request (confirmed live —
// comma-separated batch silently returns []; /stable/batch-quote-short
// exists but is 402/higher-tier-only on this plan). Real parallel
// single-symbol requests instead — fine here since this is only ever called
// as a gap-filler for a handful of stragglers Yahoo missed, never the full
// scan universe.
async function fetchFmpQuotes(symbols, fmpKey) {
  if (!fmpKey) return [];
  const list = symbols.map((s) => String(s || "").trim()).filter(Boolean);
  if (!list.length) return [];
  const rows = await Promise.all(list.map(async (sym) => {
    const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(sym)}&apikey=${encodeURIComponent(fmpKey)}`;
    const payload = await fetchJsonSafe(url);
    return Array.isArray(payload) ? payload[0] : null;
  }));
  return rows.map(normalizeFmpQuoteRow).filter(Boolean);
}

async function fetchFmpFundamentals(symbol, fmpKey) {
  if (!fmpKey || !symbol) return null;
  const k = encodeURIComponent(fmpKey), s = encodeURIComponent(symbol);
  const url = (p) => `https://financialmodelingprep.com/stable/${p}?symbol=${s}&apikey=${k}`;
  const [quoteP, profileP, ratiosP, keyMetricsP, growthP, targetP] = await Promise.all([
    fetchJsonSafe(url(`quote`)),
    fetchJsonSafe(url(`profile`)),
    fetchJsonSafe(url(`ratios-ttm`)),
    fetchJsonSafe(url(`key-metrics-ttm`)),
    fetchJsonSafe(url(`financial-growth`) + "&limit=1"),
    fetchJsonSafe(url(`price-target-consensus`)),
  ]);
  const quote = Array.isArray(quoteP) ? quoteP[0] : null;
  const profile = Array.isArray(profileP) ? profileP[0] : null;
  const ratios = Array.isArray(ratiosP) ? ratiosP[0] : null;
  const keyMetrics = Array.isArray(keyMetricsP) ? keyMetricsP[0] : null;
  const growth = Array.isArray(growthP) ? growthP[0] : null;
  const target = Array.isArray(targetP) ? targetP[0] : null;
  if (!quote && !profile) return null;
  const n = (v) => { const x = Number(v); return Number.isFinite(x) && x !== 0 ? x : null; };
  const tgt = n(target?.targetConsensus) || n(target?.targetMedian);
  // TEMP DEBUG (2026-08-11) — inspecting the real raw FMP schema live to
  // ground a new Future/Undervalued Stocks feature in real fields
  // (ROIC/EV-EBITDA/FCF-yield/debt) instead of guessing field names.
  // Removed before shipping the real feature.
  const _debugRaw = { keyMetrics, growth, target };
  return {
    _debugRaw,
    symbol,
    marketCap: Number(quote?.marketCap) || Number(profile?.marketCap) || 0,
    pe: n(ratios?.priceToEarningsRatioTTM),
    trailingPE: n(ratios?.priceToEarningsRatioTTM),
    eps: null, // real EPS now comes from fetchFmpEarnings' income-statement row, not this call
    sharesOutstanding: 0, // /stable/profile no longer returns shares outstanding directly
    // Valuation
    priceToSales: n(ratios?.priceToSalesRatioTTM),
    pegRatio: n(ratios?.priceToEarningsGrowthRatioTTM),
    priceToBook: n(ratios?.priceToBookRatioTTM),
    beta: n(profile?.beta),
    dividendYield: n(ratios?.dividendYieldTTM),
    // Margins & returns (FMP returns decimals)
    grossMargin: n(ratios?.grossProfitMarginTTM),
    profitMargin: n(ratios?.netProfitMarginTTM),
    // returnOnEquityTTM lives on key-metrics-ttm, not ratios-ttm (confirmed
    // against a real live response — ratios-ttm simply doesn't carry it).
    roe: n(keyMetrics?.returnOnEquityTTM),
    // Growth
    revenueGrowth: n(growth?.revenueGrowth),
    earningsGrowth: n(growth?.epsgrowth) || n(growth?.netIncomeGrowth),
    // Analyst
    analystTarget: tgt,
    targetMeanPrice: tgt,
    targetHighPrice: n(target?.targetHigh),
    targetLowPrice: n(target?.targetLow),
    recommendationKey: null,
    numberOfAnalystOpinions: null,
    // Company profile
    name: profile?.companyName || null,
    sector: profile?.sector || null,
    industry: profile?.industry || null,
    description: profile?.description || null,
    // NOT profile?.lastDividend — that's the last dividend *amount*, not an
    // earnings date. This function doesn't fetch a real earnings calendar
    // (fetchFmpEarnings below does, for a different endpoint); leaving this
    // null is honest, a wrong date here would be worse than none.
    earningsDate: null,
  };
}

// Annual earnings history (past) + analyst estimates (forward). Returns
// { annual: [{ year, revenue, eps, estimate }] } sorted oldest→newest, or null.
async function fetchFmpEarnings(symbol, fmpKey) {
  if (!fmpKey || !symbol) return null;
  const sym = encodeURIComponent(symbol), k = encodeURIComponent(fmpKey);
  const histUrl = `https://financialmodelingprep.com/stable/income-statement?symbol=${sym}&period=annual&limit=5&apikey=${k}`;
  const estUrl  = `https://financialmodelingprep.com/stable/analyst-estimates?symbol=${sym}&period=annual&limit=4&apikey=${k}`;
  const [hist, est] = await Promise.all([fetchJsonSafe(histUrl), fetchJsonSafe(estUrl)]);
  const byYear = new Map();
  if (Array.isArray(hist)) {
    for (const r of hist) {
      const year = Number(String(r.fiscalYear || (r.date || "").slice(0, 4)));
      if (!year) continue;
      byYear.set(year, { year, revenue: Number(r.revenue) || null, eps: Number(r.eps ?? r.epsDiluted) || null, estimate: false });
    }
  }
  if (Array.isArray(est)) {
    const thisYear = new Date().getFullYear();
    for (const r of est) {
      const year = Number(String((r.date || "").slice(0, 4)));
      if (!year || year < thisYear) continue;           // only forward years
      if (byYear.has(year) && byYear.get(year).estimate === false) continue; // prefer actuals
      byYear.set(year, { year, revenue: Number(r.revenueAvg) || null, eps: Number(r.epsAvg) || null, estimate: true });
    }
  }
  const annual = [...byYear.values()].filter(r => r.revenue || r.eps).sort((a, b) => a.year - b.year).slice(-6);
  return annual.length ? { annual } : null;
}

// The most recent REPORTED quarterly earnings result — real actual EPS
// (and revenue, when FMP has it) vs. what was estimated, with a real
// beat/miss/inline read off the real surprise %. Distinct from
// fetchFmpEarnings above, which is annual history/estimates only — this is
// specifically "what did the company just report last quarter" (2026-08-05,
// explicit user request: "last earning right underneath ticker and price").
// Honest null if no FMP key, no data, or nothing with a real actual EPS yet
// (i.e. only future/scheduled dates on file) — never a guessed number.
async function fetchFmpLastEarnings(symbol, fmpKey) {
  if (!fmpKey || !symbol) return null;
  const url = `https://financialmodelingprep.com/stable/earnings?symbol=${encodeURIComponent(symbol)}&limit=8&apikey=${encodeURIComponent(fmpKey)}`;
  const rows = await fetchJsonSafe(url);
  if (!Array.isArray(rows) || !rows.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const reported = rows.find((r) => r.epsActual != null && String(r.date || "") <= today)
    || rows.find((r) => r.epsActual != null);
  if (!reported) return null;
  const epsActual = Number(reported.epsActual);
  const epsEstimated = reported.epsEstimated != null ? Number(reported.epsEstimated) : null;
  const revenueActual = reported.revenueActual != null ? Number(reported.revenueActual) : null;
  const revenueEstimated = reported.revenueEstimated != null ? Number(reported.revenueEstimated) : null;
  const surprisePercent = (epsEstimated != null && epsEstimated !== 0)
    ? Math.round(((epsActual - epsEstimated) / Math.abs(epsEstimated)) * 10000) / 100
    : null;
  return {
    date: reported.date || null,
    epsActual: Number.isFinite(epsActual) ? epsActual : null,
    epsEstimated,
    revenueActual,
    revenueEstimated,
    surprisePercent,
    result: surprisePercent == null ? null : surprisePercent > 0.5 ? "BEAT" : surprisePercent < -0.5 ? "MISS" : "INLINE",
  };
}

// Real crypto-native news — FMP's v3 crypto_news endpoint (same family as
// stock_news/general_news, unlocked at meaningful volume on the paid tier).
// Genuinely different from CryptoTab.jsx's prior approach, which pulled
// EQUITY headlines for crypto-adjacent tickers (COIN, MSTR, RIOT, MARA,
// CLSK) as a proxy — this is real news about the coins themselves. Field
// names mapped onto CryptoNews.jsx's existing fallback chain
// (headline/publishedAt/url/source) so no client-side field-guessing is
// needed. Real article `text` is truncated for a summary line, never
// fabricated. Empty array (not an error) when no real key is configured.
async function fetchFmpCryptoNews(fmpKey, limit = 30) {
  if (!fmpKey) return [];
  const n = Math.max(1, Math.min(100, Number(limit) || 30));
  // FMP retired the legacy /api/v3/crypto_news endpoint (2025-08-31) —
  // confirmed live via a 403 "Legacy Endpoint" error pointing at their
  // current stable API. This is the replacement.
  const url = `https://financialmodelingprep.com/stable/news/crypto?limit=${n}&apikey=${encodeURIComponent(fmpKey)}`;
  const payload = await fetchJsonSafe(url);
  if (!Array.isArray(payload)) return [];
  return payload.map((r) => {
    const headline = r.title || r.headline || "";
    if (!headline) return null;
    return {
      symbol: r.symbol || null,
      headline,
      summary: r.text ? String(r.text).slice(0, 240) : "",
      url: r.url || r.link || "",
      source: r.site || r.source || "",
      publishedAt: r.publishedDate || r.date || null,
      image: r.image || null,
    };
  }).filter(Boolean);
}

module.exports = { normalizeFmpQuoteRow, fetchFmpQuotes, fetchFmpFundamentals, fetchFmpEarnings, fetchFmpLastEarnings, fetchFmpCryptoNews };
