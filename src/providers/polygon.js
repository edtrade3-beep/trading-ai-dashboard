const { fetchJsonSafe, round2, trimText } = require("../utils");

function normalizePolygonSnapshot(ticker, snap) {
  if (!snap || !snap.day) return null;
  const day = snap.day;
  const prevDay = snap.prevDay || {};
  const price = Number(snap.lastTrade?.p || snap.lastQuote?.P || day.c || 0);
  if (!price || price <= 0) return null;
  const previousClose = Number(prevDay.c || 0);
  const change = previousClose ? round2(price - previousClose) : 0;
  const changesPercentage = previousClose ? round2(((price - previousClose) / previousClose) * 100) : 0;
  return {
    symbol: String(ticker || "").toUpperCase(),
    name: String(ticker || "").toUpperCase(),
    price: round2(price),
    change,
    changesPercentage,
    delta1d: changesPercentage,
    delta1w: 0,
    delta5m: 0,
    delta30m: 0,
    open: round2(Number(day.o) || 0),
    previousClose: round2(previousClose),
    dayHigh: round2(Number(day.h) || 0),
    dayLow: round2(Number(day.l) || 0),
    volume: Number(day.v) || 0,
    avgVolume: Number(snap.ticker?.prevDay?.v) || 0,
    yearHigh: 0,
    yearLow: 0,
    marketCap: 0,
    pe: 0,
    priceAvg50: 0,
    priceAvg200: 0,
    preMarketPrice: 0,
    postMarketPrice: 0,
    preMarketChangePercent: 0,
    postMarketChangePercent: 0,
  };
}

async function fetchPolygonQuotes(symbols, polygonKey) {
  if (!polygonKey || !symbols.length) return [];
  const list = symbols.map((s) => encodeURIComponent(String(s).trim())).join(",");
  const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${list}&apiKey=${encodeURIComponent(polygonKey)}`;
  const payload = await fetchJsonSafe(url);
  if (!payload || !Array.isArray(payload.tickers)) return [];
  return payload.tickers
    .map((snap) => normalizePolygonSnapshot(snap.ticker, snap))
    .filter(Boolean);
}

async function fetchPolygonNews(ticker, polygonKey) {
  if (!polygonKey || !ticker) return [];
  const url = `https://api.polygon.io/v2/reference/news?ticker=${encodeURIComponent(ticker)}&limit=10&order=desc&sort=published_utc&apiKey=${encodeURIComponent(polygonKey)}`;
  const payload = await fetchJsonSafe(url);
  if (!payload || !Array.isArray(payload.results)) return [];
  return payload.results.map((item) => ({
    ticker,
    title: item.title || "Untitled",
    source: item.publisher?.name || "Polygon",
    publishedAt: item.published_utc || null,
    link: item.article_url || "#",
    summary: trimText(item.description || "", 240),
  }));
}

module.exports = { fetchPolygonQuotes, fetchPolygonNews };
