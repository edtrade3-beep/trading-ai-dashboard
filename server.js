const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const os = require("node:os");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const MARKET_QUOTE_TIMEOUT_MS = 30000;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || "";
const FMP_API_KEY = process.env.FMP_API_KEY || "";
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY || "";
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || "";
const UNUSUAL_WHALES_API_KEY = process.env.UNUSUAL_WHALES_API_KEY || "";
const TRADIER_API_KEY = process.env.TRADIER_API_KEY || "";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const TIMEFRAME_CONFIG = {
  "1D": { range: "6mo", interval: "1d", aggregate: 1 },
  "4H": { range: "1mo", interval: "1h", aggregate: 4 },
  "1H": { range: "1mo", interval: "1h", aggregate: 1 },
  "15M": { range: "5d", interval: "15m", aggregate: 1 }
};
const CANDLE_TIMEFRAME_CONFIG = {
  "5M": { range: "1d", interval: "5m", aggregate: 1 },
  "15M": { range: "5d", interval: "15m", aggregate: 1 },
  "1H": { range: "1mo", interval: "1h", aggregate: 1 },
  "1D": { range: "6mo", interval: "1d", aggregate: 1 },
  "1W": { range: "2y", interval: "1wk", aggregate: 1 }
};

const MACRO_SYMBOLS = {
  SPY: ["SPY"],
  QQQ: ["QQQ"],
  VIX: ["^VIX"],
  DXY: ["DX-Y.NYB", "DX=F"],
  US10Y: ["^TNX"],
  US2Y: ["^UST2Y", "^US2Y", "2YY=F"]
};
const MARKET_CAP_CACHE = new Map();

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);

    if (requestUrl.pathname === "/api/health") {
      return writeJson(res, 200, { ok: true, version: "market-v2" });
    }

    if (requestUrl.pathname.startsWith("/api/fmp/")) {
      return proxyFinancialModelingPrep(requestUrl, res);
    }

    if (requestUrl.pathname.startsWith("/api/td/")) {
      return proxyTwelveData(requestUrl, res);
    }

    if (requestUrl.pathname === "/api/yahoo/quote") {
      const symbols = (requestUrl.searchParams.get("symbols") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (!symbols.length) {
        return writeJson(res, 400, { error: "At least one symbol is required." });
      }

      const payload = await fetchYahooQuotes(symbols);
      return writeJson(res, 200, payload);
    }

    if (requestUrl.pathname === "/api/market/quote") {
      const symbols = (requestUrl.searchParams.get("symbols") || "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      if (!symbols.length) {
        return writeJson(res, 400, { error: "At least one symbol is required." });
      }

      const keys = resolveProviderKeys(requestUrl.searchParams);
      const payload = await fetchMarketQuotes(symbols, keys);
      return writeJson(res, 200, payload);
    }

    if (requestUrl.pathname === "/api/yahoo/news") {
      const tickers = (requestUrl.searchParams.get("tickers") || "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      const limit = Math.max(1, Math.min(50, Number(requestUrl.searchParams.get("limit") || 20)));

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

    if (requestUrl.pathname === "/api/market/news") {
      const tickers = (requestUrl.searchParams.get("tickers") || "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      const limit = Math.max(1, Math.min(50, Number(requestUrl.searchParams.get("limit") || 20)));

      if (!tickers.length) {
        return writeJson(res, 400, { error: "At least one ticker is required." });
      }

      const keys = resolveProviderKeys(requestUrl.searchParams);
      const payload = await fetchMarketNews(tickers, limit, keys);
      return writeJson(res, 200, payload);
    }

    if (requestUrl.pathname === "/api/market/options-flow") {
      const symbols = (requestUrl.searchParams.get("symbols") || "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      if (!symbols.length) {
        return writeJson(res, 400, { error: "At least one symbol is required." });
      }

      const limit = Math.max(3, Math.min(60, Number(requestUrl.searchParams.get("limit") || 20)));
      const flowType = String(requestUrl.searchParams.get("flowType") || "all").toLowerCase();
      const minNotional = Math.max(0, Number(requestUrl.searchParams.get("minNotional") || 0));
      const unusualOnly = String(requestUrl.searchParams.get("unusualOnly") || "false").toLowerCase() === "true";
      const keys = resolveProviderKeys(requestUrl.searchParams);
      const payload = await fetchOptionsFlow(symbols, {
        limit,
        flowType,
        minNotional,
        unusualOnly,
        keys
      });
      return writeJson(res, 200, payload);
    }

    if (requestUrl.pathname === "/api/yahoo/candles") {
      const symbol = (requestUrl.searchParams.get("symbol") || "").trim().toUpperCase();
      const timeframe = (requestUrl.searchParams.get("timeframe") || "1D").trim().toUpperCase();

      if (!symbol) {
        return writeJson(res, 400, { error: "Symbol is required." });
      }

      const payload = await fetchYahooCandlesWithIndicators(symbol, timeframe);
      return writeJson(res, 200, payload);
    }

    if (requestUrl.pathname === "/api/yahoo/fundamentals") {
      const symbol = (requestUrl.searchParams.get("symbol") || "").trim().toUpperCase();
      if (!symbol) {
        return writeJson(res, 400, { error: "Symbol is required." });
      }
      const payload = await fetchYahooFundamentals(symbol);
      return writeJson(res, 200, payload);
    }

    if (requestUrl.pathname === "/api/market/fundamentals") {
      const symbol = (requestUrl.searchParams.get("symbol") || "").trim().toUpperCase();
      if (!symbol) {
        return writeJson(res, 400, { error: "Symbol is required." });
      }
      const keys = resolveProviderKeys(requestUrl.searchParams);
      const payload = await fetchMarketFundamentals(symbol, keys);
      return writeJson(res, 200, payload);
    }

    if (requestUrl.pathname === "/api/live") {
      const ticker = (requestUrl.searchParams.get("ticker") || "").trim().toUpperCase();
      const timeframe = requestUrl.searchParams.get("timeframe") || "1D";
      const style = requestUrl.searchParams.get("style") || "Swing";

      if (!ticker) {
        return writeJson(res, 400, { error: "Ticker is required." });
      }

      const payload = await buildLivePayload(ticker, timeframe, style);
      return writeJson(res, 200, payload);
    }

    return serveStatic(requestUrl.pathname, res);
  } catch (error) {
    return writeJson(res, 500, {
      error: "Server error",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Institutional Trading Analyst running at http://localhost:${PORT}`);
  const ifaces = os.networkInterfaces();
  const lanIps = Object.values(ifaces)
    .flat()
    .filter((x) => x && x.family === "IPv4" && !x.internal)
    .map((x) => x.address);
  for (const ip of lanIps) {
    console.log(`LAN access: http://${ip}:${PORT}`);
  }
});

async function proxyFinancialModelingPrep(requestUrl, res) {
  const upstreamPath = requestUrl.pathname.replace("/api/fmp", "");

  if (!upstreamPath.startsWith("/api/") && !upstreamPath.startsWith("/stable/")) {
    return writeJson(res, 400, { error: "Invalid FMP path." });
  }

  const upstreamUrl = `https://financialmodelingprep.com${upstreamPath}${requestUrl.search}`;

  try {
    const response = await fetch(upstreamUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";
    const bodyText = await response.text();

    res.writeHead(response.status, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });
    res.end(bodyText);
  } catch (error) {
    writeJson(res, 502, {
      error: "FMP proxy failed",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

async function proxyTwelveData(requestUrl, res) {
  const upstreamPath = requestUrl.pathname.replace("/api/td", "");

  if (!upstreamPath.startsWith("/")) {
    return writeJson(res, 400, { error: "Invalid Twelve Data path." });
  }

  const upstreamUrl = `https://api.twelvedata.com${upstreamPath}${requestUrl.search}`;

  try {
    const response = await fetch(upstreamUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";
    const bodyText = await response.text();

    res.writeHead(response.status, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });
    res.end(bodyText);
  } catch (error) {
    writeJson(res, 502, {
      error: "Twelve Data proxy failed",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

function resolveProviderKeys(searchParams) {
  return {
    finnhub: (searchParams.get("finnhubKey") || FINNHUB_API_KEY || "").trim(),
    fmp: (searchParams.get("fmpKey") || FMP_API_KEY || "").trim(),
    twelvedata: (searchParams.get("tdKey") || TWELVE_DATA_API_KEY || "").trim(),
    polygon: (searchParams.get("polygonKey") || POLYGON_API_KEY || "").trim(),
    unusualWhales: (searchParams.get("uwKey") || UNUSUAL_WHALES_API_KEY || "").trim(),
    tradier: (searchParams.get("tradierKey") || TRADIER_API_KEY || "").trim(),
  };
}

async function fetchJsonSafe(url, headers = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        ...headers,
      }
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload || null;
  } catch {
    return null;
  }
}

function withTimeout(promise, ms, fallbackValue) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallbackValue), ms)),
  ]);
}

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
    };
  }));
  return rows.filter(Boolean);
}

function mergeQuoteRows(primaryRows, overlayRows) {
  const overlay = Object.fromEntries(
    (overlayRows || []).map((row) => [String(row.symbol || "").toUpperCase(), row])
  );

  return (primaryRows || []).map((row) => {
    const key = String(row.symbol || "").toUpperCase();
    const o = overlay[key];
    if (!o) return row;
    return {
      ...row,
      name: row.name || o.name,
      marketCap: Number(row.marketCap) > 0 ? row.marketCap : (Number(o.marketCap) || 0),
      pe: Number(row.pe) > 0 ? row.pe : (Number(o.pe) || 0),
      priceAvg50: Number(row.priceAvg50) > 0 ? row.priceAvg50 : (Number(o.priceAvg50) || 0),
      priceAvg200: Number(row.priceAvg200) > 0 ? row.priceAvg200 : (Number(o.priceAvg200) || 0),
      avgVolume: Number(row.avgVolume) > 0 ? row.avgVolume : (Number(o.avgVolume) || 0),
      yearHigh: Number(row.yearHigh) > 0 ? row.yearHigh : (Number(o.yearHigh) || 0),
      yearLow: Number(row.yearLow) > 0 ? row.yearLow : (Number(o.yearLow) || 0),
    };
  });
}

async function fetchMarketQuotes(symbols, keys) {
  const liveBatch = await withTimeout(fetchYahooQuoteBatch(symbols), 5000, []);
  const quoteFirstRows = normalizeQuoteBatchToRows(symbols, Array.isArray(liveBatch) ? liveBatch : []);
  const yahooRows = quoteFirstRows.length
    ? quoteFirstRows
    : await withTimeout(fetchYahooQuotes(symbols), MARKET_QUOTE_TIMEOUT_MS, []);
  const resolvedYahoo = Array.isArray(yahooRows) ? yahooRows : [];
  const hasGaps = resolvedYahoo.some((row) => !Number.isFinite(Number(row.marketCap)) || Number(row.marketCap) <= 0);

  if (keys.fmp) {
    const fmpRows = await fetchFmpQuotes(symbols, keys.fmp);
    if (fmpRows.length) {
      if (!resolvedYahoo.length) {
        return fmpRows.map((row) => ({
          ...row,
          delta1d: round2(row.changesPercentage || 0),
          delta1w: 0,
          delta5m: 0,
          delta30m: 0,
        }));
      }
      if (hasGaps) return mergeQuoteRows(resolvedYahoo, fmpRows);
    }
  }

  if (!resolvedYahoo.length && keys.finnhub) {
    const fhRows = await fetchFinnhubQuotes(symbols, keys.finnhub);
    if (fhRows.length) {
      return fhRows.map((row) => ({
        ...row,
        delta1d: round2(row.changesPercentage || 0),
        delta1w: 0,
        delta5m: 0,
        delta30m: 0,
      }));
    }
  }

  return resolvedYahoo;
}

function normalizeQuoteBatchToRows(symbols, liveRows) {
  if (!Array.isArray(symbols) || !symbols.length || !Array.isArray(liveRows) || !liveRows.length) return [];
  const bySymbol = Object.fromEntries(
    liveRows.map((row) => [String(row.symbol || "").toUpperCase(), row])
  );
  const rows = symbols.map((symbol) => {
    const live = bySymbol[String(symbol || "").toUpperCase()];
    if (!live) return null;
    const price = Number(live?.regularMarketPrice);
    const previousClose = Number(live?.regularMarketPreviousClose);
    const change = Number(live?.regularMarketChange);
    const chgPct = Number(live?.regularMarketChangePercent);
    if (!Number.isFinite(price) || price <= 0) return null;
    return {
      symbol,
      name: live?.longName || live?.shortName || symbol,
      price: round2(price),
      change: round2(Number.isFinite(change) ? change : (previousClose ? (price - previousClose) : 0)),
      changesPercentage: round2(Number.isFinite(chgPct) ? chgPct : (previousClose ? ((price - previousClose) / previousClose) * 100 : 0)),
      delta1d: round2(Number.isFinite(chgPct) ? chgPct : 0),
      delta1w: 0,
      delta5m: 0,
      delta30m: 0,
      open: round2(Number(live?.regularMarketOpen) || 0),
      previousClose: round2(previousClose || 0),
      dayHigh: round2(Number(live?.regularMarketDayHigh) || price),
      dayLow: round2(Number(live?.regularMarketDayLow) || price),
      volume: Number(live?.regularMarketVolume) || 0,
      avgVolume: Number(live?.averageDailyVolume3Month) || 0,
      yearHigh: round2(Number(live?.fiftyTwoWeekHigh) || 0),
      yearLow: round2(Number(live?.fiftyTwoWeekLow) || 0),
      marketCap: Number(live?.marketCap) || 0,
      priceAvg50: 0,
      priceAvg200: 0,
    };
  }).filter(Boolean);
  return rows;
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

async function fetchMarketNews(tickers, limit, keys) {
  if (keys.finnhub) {
    const rows = await Promise.all(tickers.map((ticker) => fetchFinnhubNews(ticker, keys.finnhub)));
    const merged = rows
      .flat()
      .sort((a, b) => {
        const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
        const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
        return tb - ta;
      })
      .slice(0, limit);
    if (merged.length) return merged;
  }

  const rows = await Promise.all(
    tickers.map(async (ticker) => {
      const items = await fetchYahooNews(ticker);
      return items.map((item) => ({ ...item, ticker }));
    })
  );
  return rows
    .flat()
    .sort((a, b) => {
      const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return tb - ta;
    })
    .slice(0, limit);
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

async function fetchMarketFundamentals(symbol, keys) {
  if (keys.fmp) {
    const fmp = await fetchFmpFundamentals(symbol, keys.fmp);
    if (fmp) return fmp;
  }
  return fetchYahooFundamentals(symbol);
}

async function fetchOptionsFlow(symbols, options = {}) {
  const limit = Math.max(3, Math.min(60, Number(options?.limit || 20)));
  const flowType = String(options?.flowType || "all").toLowerCase();
  const minNotional = Math.max(0, Number(options?.minNotional || 0));
  const unusualOnly = Boolean(options?.unusualOnly);
  const keys = options?.keys || {};

  let rows = [];
  let source = "estimated-from-price-volume";

  if (keys.tradier) {
    const tradierRows = await withTimeout(fetchTradierOptionsFlow(symbols, keys.tradier), 12000, []);
    if (tradierRows.length) {
      rows = tradierRows;
      source = "tradier-options";
    }
  }

  if (!rows.length) {
    const yahooRows = await Promise.all(
      symbols.map((symbol) => withTimeout(fetchYahooOptionsFlowForSymbol(symbol), 7000, null))
    );
    rows = yahooRows.filter(Boolean);
    if (rows.length) source = "yahoo-options";
  }

  if (!rows.length) {
    rows = await fetchEstimatedOptionsFlow(symbols);
    source = "estimated-from-price-volume";
  }

  const flow = filterFlowRows(
    rows.flatMap((entry) => entry.flowRows || []),
    { flowType, minNotional, unusualOnly }
  )
    .sort((a, b) => (b.notional || 0) - (a.notional || 0))
    .slice(0, limit);

  const summary = {
    totalContracts: flow.reduce((acc, row) => acc + (Number(row.volume) || 0), 0),
    callNotional: round2(flow.filter((row) => row.side === "CALL").reduce((acc, row) => acc + (Number(row.notional) || 0), 0)),
    putNotional: round2(flow.filter((row) => row.side === "PUT").reduce((acc, row) => acc + (Number(row.notional) || 0), 0)),
  };

  return {
    generatedAt: new Date().toISOString(),
    source,
    filters: { flowType, minNotional, unusualOnly },
    symbols,
    summary,
    bySymbol: rows.map((entry) => ({
      symbol: entry.symbol,
      expiration: entry.expiration,
      callPutRatio: entry.callPutRatio,
      topContracts: entry.flowRows.slice(0, 6),
    })),
    flow,
  };
}

function filterFlowRows(rows, filters) {
  const flowType = String(filters?.flowType || "all").toLowerCase();
  const minNotional = Math.max(0, Number(filters?.minNotional || 0));
  const unusualOnly = Boolean(filters?.unusualOnly);
  return (rows || []).filter((row) => {
    const notional = Number(row?.notional || 0);
    if (notional < minNotional) return false;
    if (unusualOnly && !row?.unusual) return false;
    if (flowType === "sweep" && row?.tradeType !== "SWEEP") return false;
    if (flowType === "darkpool" && row?.tradeType !== "DARKPOOL") return false;
    if (flowType === "block" && row?.tradeType !== "BLOCK") return false;
    return true;
  });
}

async function fetchTradierOptionsFlow(symbols, tradierKey) {
  if (!tradierKey || !symbols.length) return [];
  const exp = nextFridayIso();
  const rows = await Promise.all(symbols.map((symbol) => fetchTradierOptionsFlowForSymbol(symbol, exp, tradierKey)));
  return rows.filter(Boolean);
}

async function fetchTradierOptionsFlowForSymbol(symbol, expirationIso, tradierKey) {
  const url = `https://api.tradier.com/v1/markets/options/chains?symbol=${encodeURIComponent(symbol)}&expiration=${encodeURIComponent(expirationIso)}&greeks=false`;
  const payload = await fetchJsonSafe(url, {
    Authorization: `Bearer ${tradierKey}`,
    Accept: "application/json",
  });
  const contracts = payload?.options?.option;
  const list = Array.isArray(contracts) ? contracts : (contracts ? [contracts] : []);
  if (!list.length) return null;

  const normalized = list
    .map((raw) => normalizeTradierOptionContract(symbol, raw))
    .filter(Boolean)
    .sort((a, b) => (b.notional || 0) - (a.notional || 0));
  if (!normalized.length) return null;

  const calls = normalized.filter((x) => x.side === "CALL");
  const puts = normalized.filter((x) => x.side === "PUT");
  const callNotional = calls.reduce((acc, x) => acc + (x.notional || 0), 0);
  const putNotional = puts.reduce((acc, x) => acc + (x.notional || 0), 0);
  const callPutRatio = putNotional > 0 ? round2(callNotional / putNotional) : (callNotional > 0 ? 9.99 : 0);
  return {
    symbol,
    expiration: expirationIso,
    callPutRatio,
    flowRows: normalized.slice(0, 14),
  };
}

function normalizeTradierOptionContract(symbol, raw) {
  const side = String(raw?.option_type || "").toUpperCase() === "CALL" ? "CALL" : "PUT";
  const strike = Number(raw?.strike);
  const volume = Number(raw?.volume || 0);
  const openInterest = Number(raw?.open_interest || 0);
  const lastPrice = Number(raw?.last || raw?.mark || raw?.bid || 0);
  if (!Number.isFinite(strike) || strike <= 0) return null;
  const notional = lastPrice > 0 ? lastPrice * Math.max(volume, 0) * 100 : 0;
  let tradeType = volume >= 1200 ? "BLOCK" : volume >= 200 ? "SWEEP" : "TAPE";
  if (notional >= 500000 && volume >= 300) tradeType = "DARKPOOL";
  return {
    symbol,
    side,
    strike: round2(strike),
    volume: Math.max(0, Math.round(volume)),
    openInterest: Math.max(0, Math.round(openInterest)),
    lastPrice: round2(lastPrice),
    notional: round2(notional),
    expiry: raw?.expiration_date || null,
    tradeType,
    unusual: volume >= 50 && volume > openInterest * 1.2,
    estimated: false,
  };
}

function nextFridayIso() {
  const d = new Date();
  const day = d.getUTCDay();
  const add = (5 - day + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

async function fetchEstimatedOptionsFlow(symbols) {
  const quotes = await withTimeout(fetchYahooQuotes(symbols), 20000, []);
  const rows = (Array.isArray(quotes) ? quotes : []).map((q) => {
    const price = Number(q.price || 0);
    const chg = Number(q.changesPercentage || 0);
    const vol = Number(q.volume || 0);
    const avgVol = Number(q.avgVolume || 0);
    const rvol = avgVol > 0 ? vol / avgVol : 1;
    const base = Math.max(80, Math.round((vol || avgVol || 1000000) / 60000));
    const bias = Math.max(0.12, Math.min(0.88, 0.5 + chg / 12 + (rvol - 1) * 0.25));
    const callContracts = Math.max(20, Math.round(base * bias));
    const putContracts = Math.max(20, base - callContracts);
    const strikeStep = price > 500 ? 10 : price > 200 ? 5 : 2.5;
    const strikeCall = round2(Math.ceil(price / strikeStep) * strikeStep);
    const strikePut = round2(Math.floor(price / strikeStep) * strikeStep);
    const estPremium = Math.max(0.5, price * 0.018);
    const expiration = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const callRow = {
      symbol: q.symbol,
      side: "CALL",
      strike: strikeCall,
      volume: callContracts,
      openInterest: Math.round(callContracts * 0.72),
      lastPrice: round2(estPremium),
      notional: round2(estPremium * callContracts * 100),
      expiry: expiration,
      tradeType: callContracts > 900 ? "BLOCK" : callContracts > 250 ? "SWEEP" : "TAPE",
      unusual: rvol > 1.2 && chg > 0,
      estimated: true,
    };
    const putRow = {
      symbol: q.symbol,
      side: "PUT",
      strike: strikePut,
      volume: putContracts,
      openInterest: Math.round(putContracts * 0.78),
      lastPrice: round2(estPremium * 0.95),
      notional: round2(estPremium * 0.95 * putContracts * 100),
      expiry: expiration,
      tradeType: putContracts > 900 ? "BLOCK" : putContracts > 250 ? "SWEEP" : "TAPE",
      unusual: rvol > 1.2 && chg < 0,
      estimated: true,
    };
    return {
      symbol: q.symbol,
      expiration,
      callPutRatio: putContracts > 0 ? round2(callContracts / putContracts) : 9.99,
      flowRows: [callRow, putRow].sort((a, b) => (b.notional || 0) - (a.notional || 0)),
    };
  });
  return rows.filter(Boolean);
}

async function fetchYahooOptionsFlowForSymbol(symbol) {
  const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const optionRoot = payload?.optionChain?.result?.[0];
    const optionSet = optionRoot?.options?.[0];
    const calls = Array.isArray(optionSet?.calls) ? optionSet.calls : [];
    const puts = Array.isArray(optionSet?.puts) ? optionSet.puts : [];
    if (!calls.length && !puts.length) return null;

    const normalizedCalls = calls.map((c) => normalizeOptionContract(symbol, c, "CALL")).filter(Boolean);
    const normalizedPuts = puts.map((p) => normalizeOptionContract(symbol, p, "PUT")).filter(Boolean);
    const all = [...normalizedCalls, ...normalizedPuts];
    const unusual = all
      .filter((row) => Number(row.volume) >= 50 && Number(row.volume) > Number(row.openInterest || 0) * 1.2)
      .sort((a, b) => (b.notional || 0) - (a.notional || 0));
    const fallbackTop = all.sort((a, b) => (b.notional || 0) - (a.notional || 0));
    const flowRows = (unusual.length ? unusual : fallbackTop).slice(0, 12);

    const callNotional = normalizedCalls.reduce((acc, row) => acc + (row.notional || 0), 0);
    const putNotional = normalizedPuts.reduce((acc, row) => acc + (row.notional || 0), 0);
    const callPutRatio = putNotional > 0 ? round2(callNotional / putNotional) : (callNotional > 0 ? 9.99 : 0);
    const expiration = optionSet?.expirationDate ? new Date(optionSet.expirationDate * 1000).toISOString().slice(0, 10) : null;

    return {
      symbol,
      expiration,
      callPutRatio,
      flowRows,
    };
  } catch {
    return null;
  }
}

function normalizeOptionContract(symbol, raw, side) {
  if (!raw) return null;
  const strike = Number(raw.strike);
  const volume = Number(raw.volume || 0);
  const oi = Number(raw.openInterest || 0);
  const last = Number(raw.lastPrice || 0);
  if (!Number.isFinite(strike) || strike <= 0) return null;
  const notional = last > 0 ? last * Math.max(volume, 0) * 100 : 0;
  let tradeType = volume >= 1000 ? "BLOCK" : volume >= 200 ? "SWEEP" : "TAPE";
  if (notional >= 500000 && volume >= 300) tradeType = "DARKPOOL";
  return {
    symbol,
    side,
    strike: round2(strike),
    volume: Math.max(0, Math.round(volume)),
    openInterest: Math.max(0, Math.round(oi)),
    lastPrice: round2(last),
    notional: round2(notional),
    expiry: raw.expiration ? new Date(raw.expiration * 1000).toISOString().slice(0, 10) : null,
    tradeType,
    unusual: volume >= 50 && volume > oi * 1.2,
  };
}

async function fetchYahooQuotes(symbols) {
  const liveRows = await fetchYahooQuoteBatch(symbols);
  const liveBySymbol = Object.fromEntries(
    liveRows.map((row) => [String(row.symbol || "").toUpperCase(), row])
  );

  const rows = await Promise.all(symbols.map(async (symbol) => {
    try {
      const live = liveBySymbol[String(symbol || "").toUpperCase()] || null;
      const bars = await fetchYahooBars(symbol, "5d", "1d");
      if (!bars.length) return null;

      const latest = bars.at(-1);
      const prev = bars.at(-2) || latest;
      const highs = bars.map((b) => b.high || 0);
      const lows = bars.map((b) => b.low || 0);
      const vols = bars.map((b) => b.volume || 0);
      const avg20 = average(vols.slice(-20));
      const avg50 = average(bars.slice(-5).map((b) => b.close));
      const avg200 = average(bars.slice(-5).map((b) => b.close));
      const chgPctBars = prev?.close ? ((latest.close - prev.close) / prev.close) * 100 : 0;
      const weekRef = bars.at(-6) || prev;
      const weekPct = weekRef?.close ? ((latest.close - weekRef.close) / weekRef.close) * 100 : 0;
      const d5m = 0;
      const d30m = 0;

      const livePrice = Number(live?.regularMarketPrice);
      const livePrevClose = Number(live?.regularMarketPreviousClose);
      const liveChg = Number(live?.regularMarketChange);
      const liveChgPct = Number(live?.regularMarketChangePercent);

      const price = Number.isFinite(livePrice) ? livePrice : (latest.close || 0);
      const previousClose = Number.isFinite(livePrevClose) ? livePrevClose : (prev?.close || 0);
      const change = Number.isFinite(liveChg) ? liveChg : ((latest.close || 0) - (prev?.close || 0));
      const chgPct = Number.isFinite(liveChgPct)
        ? liveChgPct
        : (previousClose ? ((price - previousClose) / previousClose) * 100 : chgPctBars);
      const marketCap = Number(live?.marketCap) || 0;

      return {
        symbol,
        name: live?.longName || live?.shortName || symbol,
        price: round2(price),
        change: round2(change),
        changesPercentage: round2(chgPct),
        delta1d: round2(chgPct),
        delta1w: round2(weekPct),
        delta5m: round2(d5m),
        delta30m: round2(d30m),
        open: round2(Number.isFinite(Number(live?.regularMarketOpen)) ? Number(live?.regularMarketOpen) : (latest.open || 0)),
        previousClose: round2(previousClose),
        dayHigh: round2(Number.isFinite(Number(live?.regularMarketDayHigh)) ? Number(live?.regularMarketDayHigh) : (latest.high || 0)),
        dayLow: round2(Number.isFinite(Number(live?.regularMarketDayLow)) ? Number(live?.regularMarketDayLow) : (latest.low || 0)),
        volume: Number.isFinite(Number(live?.regularMarketVolume)) ? Number(live?.regularMarketVolume) : (latest.volume || 0),
        avgVolume: Math.round(Number.isFinite(Number(live?.averageDailyVolume3Month)) ? Number(live?.averageDailyVolume3Month) : (avg20 || 0)),
        yearHigh: round2(Number.isFinite(Number(live?.fiftyTwoWeekHigh)) ? Number(live?.fiftyTwoWeekHigh) : Math.max(...highs)),
        yearLow: round2(Number.isFinite(Number(live?.fiftyTwoWeekLow)) ? Number(live?.fiftyTwoWeekLow) : Math.min(...lows)),
        marketCap,
        priceAvg50: round2(avg50 || 0),
        priceAvg200: round2(avg200 || 0),
      };
    } catch {
      return null;
    }
  }));

  return rows.filter(Boolean);
}

async function fetchYahooQuoteBatch(symbols) {
  try {
    const list = symbols.map((s) => String(s || "").trim()).filter(Boolean).join(",");
    if (!list) return [];
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(list)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload?.quoteResponse?.result) ? payload.quoteResponse.result : [];
  } catch {
    return [];
  }
}

async function resolveMarketCap(symbol, liveMarketCap, liveShares, price) {
  if (Number.isFinite(liveMarketCap) && liveMarketCap > 0) {
    MARKET_CAP_CACHE.set(symbol, { value: liveMarketCap, ts: Date.now() });
    return liveMarketCap;
  }

  if (Number.isFinite(liveShares) && liveShares > 0 && Number.isFinite(price) && price > 0) {
    const fromShares = liveShares * price;
    MARKET_CAP_CACHE.set(symbol, { value: fromShares, ts: Date.now() });
    return fromShares;
  }

  const cached = MARKET_CAP_CACHE.get(symbol);
  if (cached && Date.now() - cached.ts < 10 * 60 * 1000 && Number.isFinite(cached.value) && cached.value > 0) {
    return cached.value;
  }

  const fetched = await fetchYahooMarketCapFromSummary(symbol, price);
  if (Number.isFinite(fetched) && fetched > 0) {
    MARKET_CAP_CACHE.set(symbol, { value: fetched, ts: Date.now() });
    return fetched;
  }
  return 0;
}

async function fetchYahooMarketCapFromSummary(symbol, price) {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,defaultKeyStatistics`;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });
    if (!response.ok) return 0;
    const payload = await response.json();
    const result = payload?.quoteSummary?.result?.[0] || {};
    const fromPrice = Number(result?.price?.marketCap?.raw);
    if (Number.isFinite(fromPrice) && fromPrice > 0) return fromPrice;

    const shares = Number(result?.defaultKeyStatistics?.sharesOutstanding?.raw);
    if (Number.isFinite(shares) && shares > 0 && Number.isFinite(price) && price > 0) {
      return shares * price;
    }

    const chartMeta = await fetchYahooChartMeta(symbol);
    const chartShares = Number(chartMeta?.sharesOutstanding);
    const chartPrice = Number(chartMeta?.regularMarketPrice ?? price);
    if (Number.isFinite(chartShares) && chartShares > 0 && Number.isFinite(chartPrice) && chartPrice > 0) {
      return chartShares * chartPrice;
    }
    return 0;
  } catch {
    const chartMeta = await fetchYahooChartMeta(symbol);
    const chartShares = Number(chartMeta?.sharesOutstanding);
    const chartPrice = Number(chartMeta?.regularMarketPrice ?? price);
    if (Number.isFinite(chartShares) && chartShares > 0 && Number.isFinite(chartPrice) && chartPrice > 0) {
      return chartShares * chartPrice;
    }
    return 0;
  }
}

async function fetchYahooChartMeta(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d&includePrePost=false&events=div%2Csplits`;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.chart?.result?.[0]?.meta || null;
  } catch {
    return null;
  }
}

async function buildLivePayload(ticker, timeframe, style) {
  const config = TIMEFRAME_CONFIG[timeframe] || TIMEFRAME_CONFIG["1D"];
  const rawBars = await fetchYahooBars(ticker, config.range, config.interval);
  const bars = config.aggregate > 1 ? aggregateBars(rawBars, config.aggregate) : rawBars;

  if (bars.length < 30) {
    throw new Error(`Not enough market data returned for ${ticker}.`);
  }

  const closes = bars.map((bar) => bar.close);
  const highs = bars.map((bar) => bar.high);
  const lows = bars.map((bar) => bar.low);
  const volumes = bars.map((bar) => bar.volume || 0);
  const current = bars[bars.length - 1];
  const previous = bars[bars.length - 2];

  const ema9 = computeEMA(closes, 9);
  const ema21 = computeEMA(closes, 21);
  const ema200 = computeEMA(closes, Math.min(200, closes.length));
  const rsi = computeRSI(closes, 14);
  const vwap = computeVWAP(bars.slice(-Math.min(30, bars.length)));

  const support = round2(Math.min(...lows.slice(-20)));
  const resistance = round2(Math.max(...highs.slice(-20)));
  const avgVolume = average(volumes.slice(-20));
  const volumeSpike = current.volume > avgVolume * 1.6 ? "Yes" : "No";
  const volumeCharacter = current.close >= previous.close
    ? current.volume >= avgVolume ? "Accumulation" : "Neutral"
    : current.volume >= avgVolume ? "Distribution" : "Neutral";

  const trend = detectTrend(current.close, ema21, ema200, closes);
  const structure = detectStructure(current.close, highs, lows);
  const divergence = detectDivergence(closes, rsi);
  const smartMoney = inferSmartMoney(current, support, resistance, avgVolume, trend, volumeCharacter);
  const news = await fetchYahooNews(ticker);
  const newsSentiment = classifyNewsSentiment(news);
  const macro = await fetchMacroSignals();

  return {
    generatedAt: new Date().toISOString(),
    source: "Yahoo Finance public endpoints",
    formData: {
      ticker,
      timeframe,
      style,
      price: round2(current.close),
      support,
      resistance,
      liquidityZone: smartMoney.liquidityZone,
      trend,
      structure,
      volumeCharacter,
      ema9: round2(ema9),
      ema21: round2(ema21),
      ema200: round2(ema200),
      vwap: round2(vwap),
      rsi: round2(rsi),
      divergence,
      volumeSpike,
      stopClusters: smartMoney.stopClusters,
      fakeoutRisk: smartMoney.fakeoutRisk,
      newsSentiment,
      catalyst: news[0]?.title ? trimText(news[0].title, 90) : "No fresh catalyst found",
      newsNotes: buildNewsNotes(news),
      spyTrend: macro.spyTrend,
      qqqTrend: macro.qqqTrend,
      vix: macro.vix,
      dxy: macro.dxy,
      yield2y: macro.yield2y,
      yield10y: macro.yield10y
    },
    diagnostics: {
      marketDataPoints: bars.length,
      averageVolume: Math.round(avgVolume),
      latestVolume: current.volume,
      latestClose: current.close,
      macro
    },
    news: news.slice(0, 5)
  };
}

async function fetchMacroSignals() {
  const [spyBars, qqqBars, vixQuote, dxyQuote, us10yQuote, us2yQuote] = await Promise.all([
    fetchFirstAvailableBars(MACRO_SYMBOLS.SPY),
    fetchFirstAvailableBars(MACRO_SYMBOLS.QQQ),
    fetchFirstAvailableBars(MACRO_SYMBOLS.VIX),
    fetchFirstAvailableBars(MACRO_SYMBOLS.DXY),
    fetchFirstAvailableBars(MACRO_SYMBOLS.US10Y),
    fetchFirstAvailableBars(MACRO_SYMBOLS.US2Y)
  ]);

  return {
    spyTrend: detectSimpleTrend(spyBars),
    qqqTrend: detectSimpleTrend(qqqBars),
    vix: round2(vixQuote.at(-1)?.close ?? 18),
    dxy: round2(dxyQuote.at(-1)?.close ?? 104),
    yield10y: normalizeYield(us10yQuote.at(-1)?.close),
    yield2y: normalizeYield(us2yQuote.at(-1)?.close)
  };
}

async function fetchFirstAvailableBars(symbols) {
  for (const symbol of symbols) {
    try {
      const bars = await fetchYahooBars(symbol, "1mo", "1d");
      if (bars.length) {
        return bars;
      }
    } catch {
      continue;
    }
  }

  return [];
}

async function fetchYahooBars(symbol, range, interval) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false&events=div%2Csplits`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Yahoo chart request failed for ${symbol}: ${response.status}`);
  }

  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp || [];

  if (!quote || !timestamps.length) {
    throw new Error(`No chart data returned for ${symbol}.`);
  }

  const bars = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i] ?? 0;

    if ([open, high, low, close].some((value) => value == null)) {
      continue;
    }

    bars.push({
      time: timestamps[i] * 1000,
      open,
      high,
      low,
      close,
      volume
    });
  }

  return bars;
}

async function fetchYahooNews(ticker) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&quotesCount=1&newsCount=8&enableFuzzyQuery=false`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return fetchYahooRssNews(ticker);
    }
    const payload = await response.json();
    const rows = (payload.news || []).map((item) => ({
      title: item.title || "Untitled",
      publisher: item.publisher || "Unknown",
      source: item.publisher || "Unknown",
      link: item.link || "",
      publishedAt: item.providerPublishTime ? new Date(item.providerPublishTime * 1000).toISOString() : null,
      summary: item.summary || ""
    }));
    if (rows.length) return rows;
    return fetchYahooRssNews(ticker);
  } catch {
    return fetchYahooRssNews(ticker);
  }
}

async function fetchYahooRssNews(ticker) {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) return [];
    const xml = await response.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
      .slice(0, 8)
      .map((match) => {
        const block = match[1] || "";
        const title = extractXmlTag(block, "title") || "Untitled";
        const link = extractXmlTag(block, "link") || "";
        const published = extractXmlTag(block, "pubDate");
        const description = extractXmlTag(block, "description") || "";
        return {
          title,
          publisher: "Yahoo Finance",
          source: "Yahoo Finance",
          link,
          publishedAt: published ? new Date(published).toISOString() : null,
          summary: trimText(stripHtml(description), 220)
        };
      });
    return items;
  } catch {
    return [];
  }
}

function extractXmlTag(xmlBlock, tag) {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = String(xmlBlock || "").match(regex);
  return m?.[1] ? decodeXmlEntities(m[1].trim()) : "";
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

async function fetchYahooCandlesWithIndicators(symbol, timeframe) {
  const config = CANDLE_TIMEFRAME_CONFIG[timeframe] || CANDLE_TIMEFRAME_CONFIG["1D"];
  const rawBars = await fetchYahooBars(symbol, config.range, config.interval);
  const bars = config.aggregate > 1 ? aggregateBars(rawBars, config.aggregate) : rawBars;

  if (!bars.length) {
    throw new Error(`No candle data returned for ${symbol}.`);
  }

  const ema9 = computeEMASeries(bars, 9);
  const ema21 = computeEMASeries(bars, 21);
  const vwap = computeVWAPSeries(bars);
  const rsi = computeRSISeries(bars, 14);
  const macd = computeMACDSeries(bars, 12, 26, 9);

  return {
    symbol,
    timeframe,
    bars: bars.map((bar) => ({
      time: bar.time,
      open: round2(bar.open),
      high: round2(bar.high),
      low: round2(bar.low),
      close: round2(bar.close),
      volume: Math.round(bar.volume || 0)
    })),
    indicators: {
      ema9,
      ema21,
      vwap,
      rsi,
      macd
    }
  };
}

async function fetchYahooFundamentals(symbol) {
  const quoteRows = await fetchYahooQuoteBatch([symbol]);
  const live = quoteRows.find((r) => String(r?.symbol || "").toUpperCase() === symbol) || null;

  const livePrice = Number(live?.regularMarketPrice);
  const liveShares = Number(live?.sharesOutstanding);
  const liveMarketCap = Number(live?.marketCap);
  const livePE = Number(live?.trailingPE ?? live?.forwardPE);
  const liveEPS = Number(live?.epsTrailingTwelveMonths ?? live?.epsForward);
  const liveEarningsTs = Number((Array.isArray(live?.earningsTimestamp) ? live.earningsTimestamp[0] : live?.earningsTimestamp) || 0);

  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,summaryDetail,defaultKeyStatistics,calendarEvents,financialData`;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });
    if (!response.ok) {
      const fallbackCap = Number.isFinite(liveMarketCap) && liveMarketCap > 0
        ? liveMarketCap
        : (Number.isFinite(liveShares) && liveShares > 0 && Number.isFinite(livePrice) && livePrice > 0 ? liveShares * livePrice : 0);
      return {
        symbol,
        marketCap: fallbackCap,
        pe: Number.isFinite(livePE) ? livePE : null,
        eps: Number.isFinite(liveEPS) ? liveEPS : null,
        sharesOutstanding: Number.isFinite(liveShares) ? liveShares : null,
        earningsDate: liveEarningsTs > 0 ? new Date(liveEarningsTs * 1000).toISOString() : null
      };
    }
    const payload = await response.json();
    const result = payload?.quoteSummary?.result?.[0] || {};
    const price = result?.price || {};
    const summary = result?.summaryDetail || {};
    const stats = result?.defaultKeyStatistics || {};
    const financial = result?.financialData || {};
    const earningsRaw = result?.calendarEvents?.earnings?.earningsDate || [];
    const earningsTs = Array.isArray(earningsRaw) && earningsRaw.length
      ? Number(earningsRaw[0]?.raw || 0)
      : 0;

    const marketCap = Number(price?.marketCap?.raw || liveMarketCap || 0);
    const pe = Number(summary?.trailingPE?.raw ?? financial?.forwardPE?.raw ?? livePE);
    const eps = Number(stats?.trailingEps?.raw ?? stats?.forwardEps?.raw ?? liveEPS);
    const sharesOutstanding = Number(stats?.sharesOutstanding?.raw || liveShares || 0);

    return {
      symbol,
      marketCap: Number.isFinite(marketCap) && marketCap > 0
        ? marketCap
        : (Number.isFinite(sharesOutstanding) && sharesOutstanding > 0 && Number.isFinite(livePrice) && livePrice > 0 ? sharesOutstanding * livePrice : 0),
      pe: Number.isFinite(pe) ? pe : null,
      eps: Number.isFinite(eps) ? eps : null,
      sharesOutstanding: Number.isFinite(sharesOutstanding) ? sharesOutstanding : null,
      earningsDate: earningsTs > 0
        ? new Date(earningsTs * 1000).toISOString()
        : (liveEarningsTs > 0 ? new Date(liveEarningsTs * 1000).toISOString() : null)
    };
  } catch {
    const fallbackCap = Number.isFinite(liveMarketCap) && liveMarketCap > 0
      ? liveMarketCap
      : (Number.isFinite(liveShares) && liveShares > 0 && Number.isFinite(livePrice) && livePrice > 0 ? liveShares * livePrice : 0);
    return {
      symbol,
      marketCap: fallbackCap,
      pe: Number.isFinite(livePE) ? livePE : null,
      eps: Number.isFinite(liveEPS) ? liveEPS : null,
      sharesOutstanding: Number.isFinite(liveShares) ? liveShares : null,
      earningsDate: liveEarningsTs > 0 ? new Date(liveEarningsTs * 1000).toISOString() : null
    };
  }
}

function serveStatic(pathname, res) {
  const cleanPath = pathname === "/" ? "/axiom-runner/index.html" : pathname;
  const filePath = path.join(ROOT, cleanPath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500);
      res.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store, max-age=0"
    });
    res.end(content);
  });
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function aggregateBars(bars, size) {
  const aggregated = [];

  for (let index = 0; index < bars.length; index += size) {
    const chunk = bars.slice(index, index + size);
    if (chunk.length < size) {
      continue;
    }

    aggregated.push({
      time: chunk[chunk.length - 1].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map((bar) => bar.high)),
      low: Math.min(...chunk.map((bar) => bar.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((total, bar) => total + (bar.volume || 0), 0)
    });
  }

  return aggregated;
}

function computeEMA(values, period) {
  if (!values.length) return 0;
  const smoothing = 2 / (period + 1);
  let ema = values[0];

  for (let i = 1; i < values.length; i += 1) {
    ema = values[i] * smoothing + ema * (1 - smoothing);
  }

  return ema;
}

function computeRSI(values, period) {
  if (values.length <= period) return 50;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta;
    else losses += Math.abs(delta);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period || 0.0001;

  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
  }

  const rs = avgGain / (avgLoss || 0.0001);
  return 100 - (100 / (1 + rs));
}

function computeVWAP(bars) {
  let totalPriceVolume = 0;
  let totalVolume = 0;

  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    const volume = bar.volume || 0;
    totalPriceVolume += typicalPrice * volume;
    totalVolume += volume;
  }

  return totalVolume ? totalPriceVolume / totalVolume : bars.at(-1)?.close || 0;
}

function computeEMASeries(bars, period) {
  if (!bars.length) return [];
  const smoothing = 2 / (period + 1);
  let ema = bars[0].close;
  const out = [];
  for (let i = 0; i < bars.length; i += 1) {
    const close = bars[i].close;
    if (i === 0) ema = close;
    else ema = close * smoothing + ema * (1 - smoothing);
    out.push({ time: bars[i].time, value: round2(ema) });
  }
  return out;
}

function computeVWAPSeries(bars) {
  let totalPV = 0;
  let totalV = 0;
  return bars.map((bar) => {
    const typical = (bar.high + bar.low + bar.close) / 3;
    const vol = bar.volume || 0;
    totalPV += typical * vol;
    totalV += vol;
    const value = totalV ? (totalPV / totalV) : bar.close;
    return { time: bar.time, value: round2(value) };
  });
}

function computeRSISeries(bars, period = 14) {
  const closes = bars.map((b) => b.close);
  if (!closes.length) return [];
  const out = [];
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);

    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (i < period) {
        out.push({ time: bars[i].time, value: 50 });
        continue;
      }
      avgGain /= period;
      avgLoss /= period;
    } else {
      avgGain = ((avgGain * (period - 1)) + gain) / period;
      avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    }

    const rs = avgGain / (avgLoss || 0.0001);
    const rsi = 100 - (100 / (1 + rs));
    out.push({ time: bars[i].time, value: round2(rsi) });
  }

  if (!out.length) return bars.map((b) => ({ time: b.time, value: 50 }));
  return out;
}

function computeMACDSeries(bars, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (!bars.length) return { line: [], signal: [], histogram: [] };
  const closes = bars.map((b) => b.close);
  const fast = computeEMASeriesFromValues(closes, fastPeriod);
  const slow = computeEMASeriesFromValues(closes, slowPeriod);
  const lineValues = closes.map((_, i) => fast[i] - slow[i]);
  const signalValues = computeEMASeriesFromValues(lineValues, signalPeriod);

  const line = [];
  const signal = [];
  const histogram = [];
  for (let i = 0; i < bars.length; i += 1) {
    line.push({ time: bars[i].time, value: round2(lineValues[i]) });
    signal.push({ time: bars[i].time, value: round2(signalValues[i]) });
    histogram.push({ time: bars[i].time, value: round2(lineValues[i] - signalValues[i]) });
  }
  return { line, signal, histogram };
}

function computeEMASeriesFromValues(values, period) {
  if (!values.length) return [];
  const smoothing = 2 / (period + 1);
  const out = [];
  let ema = values[0];
  for (let i = 0; i < values.length; i += 1) {
    if (i === 0) ema = values[0];
    else ema = values[i] * smoothing + ema * (1 - smoothing);
    out.push(ema);
  }
  return out;
}

function detectTrend(price, ema21, ema200, closes) {
  const recent = closes.slice(-10);
  const first = recent[0] || price;
  const slope = ((price - first) / first) * 100;

  if (price > ema21 && ema21 > ema200 && slope > 1) return "Uptrend";
  if (price < ema21 && ema21 < ema200 && slope < -1) return "Downtrend";
  return "Range";
}

function detectStructure(price, highs, lows) {
  const priorHigh = Math.max(...highs.slice(-12, -2));
  const priorLow = Math.min(...lows.slice(-12, -2));

  if (price > priorHigh) return "Bullish BOS";
  if (price < priorLow) return "Bearish BOS";
  return "No clear BOS";
}

function detectDivergence(closes, rsi) {
  const recentCloses = closes.slice(-6);
  const earlierCloses = closes.slice(-12, -6);
  const recentDirection = recentCloses.at(-1) - recentCloses[0];
  const earlierDirection = earlierCloses.at(-1) - earlierCloses[0];

  if (recentDirection < 0 && earlierDirection >= 0 && rsi > 40) return "Bullish";
  if (recentDirection > 0 && earlierDirection <= 0 && rsi < 60) return "Bearish";
  return "None";
}

function inferSmartMoney(current, support, resistance, avgVolume, trend, volumeCharacter) {
  const upsideStops = round2(resistance + (resistance - support) * 0.12);
  const downsideStops = round2(support - (resistance - support) * 0.12);
  const fakeoutRisk = current.volume < avgVolume * 0.85 || trend === "Range"
    ? "High"
    : volumeCharacter === "Neutral"
      ? "Medium"
      : "Low";

  return {
    liquidityZone: `Above ${resistance} breakout highs and below ${support} swing lows`,
    stopClusters: `Buy stops near ${upsideStops}, sell stops near ${downsideStops}`,
    fakeoutRisk
  };
}

function classifyNewsSentiment(newsItems) {
  if (!newsItems.length) return "Neutral";

  const score = newsItems.slice(0, 5).reduce((total, item) => total + scoreHeadline(item.title), 0);
  if (score >= 2) return "Bullish";
  if (score <= -2) return "Bearish";
  return "Neutral";
}

function buildNewsNotes(newsItems) {
  if (!newsItems.length) {
    return "No current Yahoo Finance headlines were returned for this ticker.";
  }

  return newsItems
    .slice(0, 3)
    .map((item) => `${item.publisher}: ${trimText(item.title, 110)}`)
    .join(" | ");
}

function scoreHeadline(headline) {
  const text = headline.toLowerCase();
  const bullishWords = ["beat", "surge", "upgrade", "growth", "record", "bull", "rally", "wins", "strong", "expands"];
  const bearishWords = ["miss", "drop", "downgrade", "cuts", "probe", "lawsuit", "bear", "weak", "fall", "slump"];

  let score = 0;
  bullishWords.forEach((word) => {
    if (text.includes(word)) score += 1;
  });
  bearishWords.forEach((word) => {
    if (text.includes(word)) score -= 1;
  });
  return score;
}

function detectSimpleTrend(bars) {
  if (bars.length < 8) return "Range";
  const closes = bars.map((bar) => bar.close);
  const price = closes.at(-1);
  const ema20 = computeEMA(closes, Math.min(20, closes.length));
  const ema50 = computeEMA(closes, Math.min(50, closes.length));

  if (price > ema20 && ema20 >= ema50) return "Uptrend";
  if (price < ema20 && ema20 <= ema50) return "Downtrend";
  return "Range";
}

function normalizeYield(value) {
  if (!value) return 0;
  return round2(value > 20 ? value / 10 : value);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function trimText(value, maxLength) {
  if (!value || value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}
