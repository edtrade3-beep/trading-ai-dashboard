const { fetchJsonSafe } = require("../utils");

function normalizeFmpQuoteRow(raw) {
  if (!raw) return null;
  const symbol = String(raw.symbol || "").toUpperCase();
  if (!symbol) return null;
  const price = Number(raw.price);
  const previousClose = Number(raw.previousClose);
  const change = Number(raw.change);
  const changesPercentage = Number(raw.changesPercentage);
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
    avgVolume: Number(raw.avgVolume) || 0,
    yearHigh: Number(raw.yearHigh) || 0,
    yearLow: Number(raw.yearLow) || 0,
    marketCap: Number(raw.marketCap) || 0,
    pe: Number(raw.pe) || 0,
    priceAvg50: Number(raw.priceAvg50) || 0,
    priceAvg200: Number(raw.priceAvg200) || 0,
    preMarketPrice: 0,
    postMarketPrice: 0,
    preMarketChangePercent: 0,
    postMarketChangePercent: 0,
  };
}

async function fetchFmpQuotes(symbols, fmpKey) {
  if (!fmpKey) return [];
  const list = symbols.map((s) => String(s || "").trim()).filter(Boolean).join(",");
  if (!list) return [];
  const url = `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(list)}?apikey=${encodeURIComponent(fmpKey)}`;
  const payload = await fetchJsonSafe(url);
  if (!Array.isArray(payload)) return [];
  return payload.map(normalizeFmpQuoteRow).filter(Boolean);
}

async function fetchFmpFundamentals(symbol, fmpKey) {
  if (!fmpKey || !symbol) return null;
  const k = encodeURIComponent(fmpKey), s = encodeURIComponent(symbol);
  const url = (p) => `https://financialmodelingprep.com/api/v3/${p}${p.includes("?") ? "&" : "?"}apikey=${k}`;
  // Batch the free FMP endpoints that populate the Valuation / Company / Analyst
  // panels. All are on the free tier. Failures degrade to null fields.
  const [quoteP, profileP, ratiosP, growthP, targetP] = await Promise.all([
    fetchJsonSafe(url(`quote/${s}`)),
    fetchJsonSafe(url(`profile/${s}`)),
    fetchJsonSafe(url(`ratios-ttm/${s}`)),
    fetchJsonSafe(url(`income-statement-growth/${s}?period=annual&limit=1`)),
    fetchJsonSafe(url(`price-target-consensus/${s}`)),
  ]);
  const quote = Array.isArray(quoteP) ? quoteP[0] : null;
  const profile = Array.isArray(profileP) ? profileP[0] : null;
  const ratios = Array.isArray(ratiosP) ? ratiosP[0] : null;
  const growth = Array.isArray(growthP) ? growthP[0] : null;
  const target = Array.isArray(targetP) ? targetP[0] : null;
  if (!quote && !profile) return null;
  const n = (v) => { const x = Number(v); return Number.isFinite(x) && x !== 0 ? x : null; };
  const tgt = n(target?.targetConsensus) || n(target?.targetMedian);
  return {
    symbol,
    marketCap: Number(quote?.marketCap) || Number(profile?.mktCap) || 0,
    pe: n(quote?.pe) || n(ratios?.peRatioTTM),
    trailingPE: n(quote?.pe) || n(ratios?.peRatioTTM),
    eps: n(quote?.eps),
    sharesOutstanding: Number(profile?.sharesOutstanding) || Number(quote?.sharesOutstanding) || 0,
    // Valuation
    priceToSales: n(ratios?.priceToSalesRatioTTM),
    pegRatio: n(ratios?.pegRatioTTM),
    priceToBook: n(ratios?.priceToBookRatioTTM),
    beta: n(profile?.beta),
    dividendYield: n(ratios?.dividendYielTTM),
    // Margins & returns (FMP returns decimals)
    grossMargin: n(ratios?.grossProfitMarginTTM),
    profitMargin: n(ratios?.netProfitMarginTTM),
    roe: n(ratios?.returnOnEquityTTM),
    // Growth
    revenueGrowth: n(growth?.growthRevenue),
    earningsGrowth: n(growth?.growthEPS) || n(growth?.growthNetIncome),
    // Analyst
    analystTarget: tgt,
    targetMeanPrice: tgt,
    targetHighPrice: n(target?.targetHigh),
    targetLowPrice: n(target?.targetLow),
    recommendationKey: null,
    numberOfAnalystOpinions: null,
    // Company profile
    sector: profile?.sector || null,
    industry: profile?.industry || null,
    description: profile?.description || null,
    // NOT profile?.lastDiv — that's the last dividend *amount*, not an
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
  const sym = encodeURIComponent(symbol);
  const histUrl = `https://financialmodelingprep.com/api/v3/income-statement/${sym}?period=annual&limit=5&apikey=${encodeURIComponent(fmpKey)}`;
  const estUrl  = `https://financialmodelingprep.com/api/v3/analyst-estimates/${sym}?period=annual&limit=4&apikey=${encodeURIComponent(fmpKey)}`;
  const [hist, est] = await Promise.all([fetchJsonSafe(histUrl), fetchJsonSafe(estUrl)]);
  const byYear = new Map();
  if (Array.isArray(hist)) {
    for (const r of hist) {
      const year = Number(String(r.calendarYear || (r.date || "").slice(0, 4)));
      if (!year) continue;
      byYear.set(year, { year, revenue: Number(r.revenue) || null, eps: Number(r.eps ?? r.epsdiluted) || null, estimate: false });
    }
  }
  if (Array.isArray(est)) {
    const thisYear = new Date().getFullYear();
    for (const r of est) {
      const year = Number(String((r.date || "").slice(0, 4)));
      if (!year || year < thisYear) continue;           // only forward years
      if (byYear.has(year) && byYear.get(year).estimate === false) continue; // prefer actuals
      byYear.set(year, { year, revenue: Number(r.estimatedRevenueAvg) || null, eps: Number(r.estimatedEpsAvg) || null, estimate: true });
    }
  }
  const annual = [...byYear.values()].filter(r => r.revenue || r.eps).sort((a, b) => a.year - b.year).slice(-6);
  return annual.length ? { annual } : null;
}

module.exports = { normalizeFmpQuoteRow, fetchFmpQuotes, fetchFmpFundamentals, fetchFmpEarnings };
