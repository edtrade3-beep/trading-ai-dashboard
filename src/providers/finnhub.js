const { fetchJsonSafe, round2, trimText } = require("../utils");

async function fetchFinnhubQuotes(symbols, finnhubKey) {
  if (!finnhubKey || !symbols.length) return [];
  const rows = await Promise.all(symbols.map(async (symbol) => {
    const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(finnhubKey)}`;
    const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(finnhubKey)}`;
    const [quote, profile] = await Promise.all([
      fetchJsonSafe(quoteUrl),
      fetchJsonSafe(profileUrl),
    ]);
    if (!quote || Number(quote.c) <= 0) return null;
    const price = Number(quote.c) || 0;
    const previousClose = Number(quote.pc) || 0;
    const change = price - previousClose;
    const changesPercentage = previousClose ? ((price - previousClose) / previousClose) * 100 : 0;
    const marketCapM = Number(profile?.marketCapitalization);
    return {
      symbol,
      name: profile?.name || symbol,
      price: round2(price),
      change: round2(change),
      changesPercentage: round2(changesPercentage),
      open: round2(Number(quote.o) || 0),
      previousClose: round2(previousClose),
      dayHigh: round2(Number(quote.h) || 0),
      dayLow: round2(Number(quote.l) || 0),
      volume: 0,
      avgVolume: 0,
      yearHigh: 0,
      yearLow: 0,
      marketCap: Number.isFinite(marketCapM) && marketCapM > 0 ? marketCapM * 1e6 : 0,
      pe: 0,
      priceAvg50: 0,
      priceAvg200: 0,
      preMarketPrice: 0,
      postMarketPrice: 0,
      preMarketChangePercent: 0,
      postMarketChangePercent: 0,
    };
  }));
  return rows.filter(Boolean);
}

async function fetchFinnhubNews(ticker, finnhubKey) {
  if (!finnhubKey || !ticker) return [];
  const to = new Date();
  const from = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);
  const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(ticker)}&from=${fromIso}&to=${toIso}&token=${encodeURIComponent(finnhubKey)}`;
  const payload = await fetchJsonSafe(url);
  if (!Array.isArray(payload)) return [];
  return payload.map((item) => ({
    ticker,
    title: item.headline || "Untitled",
    source: item.source || "Finnhub",
    publishedAt: item.datetime ? new Date(Number(item.datetime) * 1000).toISOString() : null,
    link: item.url || "#",
    summary: trimText(item.summary || "", 240),
  }));
}

module.exports = { fetchFinnhubQuotes, fetchFinnhubNews };
