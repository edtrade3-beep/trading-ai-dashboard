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
  const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(symbol)}?apikey=${encodeURIComponent(fmpKey)}`;
  const profileUrl = `https://financialmodelingprep.com/api/v3/profile/${encodeURIComponent(symbol)}?apikey=${encodeURIComponent(fmpKey)}`;
  const [quotePayload, profilePayload] = await Promise.all([fetchJsonSafe(quoteUrl), fetchJsonSafe(profileUrl)]);
  const quote = Array.isArray(quotePayload) ? quotePayload[0] : null;
  const profile = Array.isArray(profilePayload) ? profilePayload[0] : null;
  if (!quote && !profile) return null;
  return {
    symbol,
    marketCap: Number(quote?.marketCap) || Number(profile?.mktCap) || 0,
    pe: Number(quote?.pe) || 0,
    eps: Number(quote?.eps) || 0,
    sharesOutstanding: Number(profile?.sharesOutstanding) || 0,
    earningsDate: profile?.lastDiv || null,
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
