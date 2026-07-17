const { writeJson } = require("../utils");
const {
  fetchYahooQuotes,
  fetchYahooNews,
  fetchYahooCandlesWithIndicators,
  fetchYahooFundamentals,
  fetchYahooShortInterest,
  fetchYahooInsiderTransactions,
  fetchYahooOptionsFlowForSymbol,
} = require("../providers/yahoo");

async function handleYahoo(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;

  if (pathname === "/api/yahoo/quote") {
    const symbols = (searchParams.get("symbols") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!symbols.length) {
      return writeJson(res, 400, { error: "At least one symbol is required." });
    }
    const payload = await fetchYahooQuotes(symbols);
    return writeJson(res, 200, payload);
  }

  if (pathname === "/api/yahoo/news") {
    const tickers = (searchParams.get("tickers") || "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const limit = Math.max(1, Math.min(50, Number(searchParams.get("limit") || 20)));
    if (!tickers.length) {
      return writeJson(res, 400, { error: "At least one ticker is required." });
    }
    const rows = await Promise.all(
      tickers.map(async (ticker) => {
        const items = await fetchYahooNews(ticker);
        return items.map((item) => ({ ...item, ticker }));
      })
    );
    const merged = rows
      .flat()
      .sort((a, b) => {
        const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
        const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
        return tb - ta;
      })
      .slice(0, limit);
    return writeJson(res, 200, merged);
  }

  if (pathname === "/api/yahoo/candles") {
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    const timeframe = (searchParams.get("timeframe") || "1D").trim().toUpperCase();
    if (!symbol) {
      return writeJson(res, 400, { error: "Symbol is required." });
    }
    const payload = await fetchYahooCandlesWithIndicators(symbol, timeframe);
    return writeJson(res, 200, payload);
  }

  if (pathname === "/api/yahoo/fundamentals") {
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) {
      return writeJson(res, 400, { error: "Symbol is required." });
    }
    const payload = await fetchYahooFundamentals(symbol);
    return writeJson(res, 200, payload);
  }

  // GET /api/yahoo/short-interest?symbol=BBAI
  if (pathname === "/api/yahoo/short-interest") {
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) return writeJson(res, 400, { error: "Symbol is required." });
    const payload = await fetchYahooShortInterest(symbol);
    return writeJson(res, 200, payload);
  }

  // GET /api/yahoo/insider?symbol=BBAI
  if (pathname === "/api/yahoo/insider") {
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) return writeJson(res, 400, { error: "Symbol is required." });
    const payload = await fetchYahooInsiderTransactions(symbol);
    return writeJson(res, 200, payload);
  }

  // GET /api/yahoo/options?symbol=BBAI
  if (pathname === "/api/yahoo/options") {
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) return writeJson(res, 400, { error: "Symbol is required." });
    const payload = await fetchYahooOptionsFlowForSymbol(symbol);
    return writeJson(res, 200, payload || { symbol, callPutRatio: null, flowRows: [] });
  }

  return writeJson(res, 404, { error: "Unknown Yahoo endpoint." });
}

module.exports = handleYahoo;
