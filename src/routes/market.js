const { writeJson, readRequestBody, withTimeout, round2, average, trimText } = require("../utils");
const { MARKET_QUOTE_TIMEOUT_MS, MACRO_SYMBOLS, TIMEFRAME_CONFIG, resolveProviderKeys } = require("../config");
const {
  computeEMA, computeRSI, computeVWAP,
  detectTrend, detectStructure, detectDivergence, detectSimpleTrend,
  normalizeYield, aggregateBars
} = require("../indicators");
const {
  fetchYahooQuotes, fetchYahooQuoteBatch, fetchYahooBars,
  fetchYahooNews, fetchYahooFundamentals,
  fetchYahooOptionsFlowForSymbol, fetchEstimatedOptionsFlow,
  fetchYahooShortInterest,
  fetchYahooInsiderTransactions, fetchYahooInstitutional,
  fetchYahooAnalystRatings, fetchYahooDividendInfo,
  fetchStockTwitsSentiment,
} = require("../providers/yahoo");
const { fetchFinnhubQuotes, fetchFinnhubNews } = require("../providers/finnhub");
const { fetchFmpQuotes, fetchFmpFundamentals } = require("../providers/fmp");
const { fetchPolygonQuotes, fetchPolygonNews } = require("../providers/polygon");
const { fetchTradierOptionsFlow } = require("../providers/tradier");

// --- Quote helpers ---

function normalizeQuoteBatchToRows(symbols, liveRows) {
  if (!Array.isArray(symbols) || !symbols.length || !Array.isArray(liveRows) || !liveRows.length) return [];
  const bySymbol = Object.fromEntries(
    liveRows.map((row) => [String(row.symbol || "").toUpperCase(), row])
  );
  return symbols.map((symbol) => {
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
      delta1w: 0, delta5m: 0, delta30m: 0,
      open: round2(Number(live?.regularMarketOpen) || 0),
      previousClose: round2(previousClose || 0),
      dayHigh: round2(Number(live?.regularMarketDayHigh) || price),
      dayLow: round2(Number(live?.regularMarketDayLow) || price),
      volume: Number(live?.regularMarketVolume) || 0,
      avgVolume: Number(live?.averageDailyVolume3Month) || 0,
      yearHigh: round2(Number(live?.fiftyTwoWeekHigh) || 0),
      yearLow: round2(Number(live?.fiftyTwoWeekLow) || 0),
      marketCap: Number(live?.marketCap) || 0,
      priceAvg50: 0, priceAvg200: 0,
      preMarketPrice: round2(Number(live?.preMarketPrice) || 0),
      postMarketPrice: round2(Number(live?.postMarketPrice) || 0),
      preMarketChangePercent: round2(Number(live?.preMarketChangePercent) || 0),
      postMarketChangePercent: round2(Number(live?.postMarketChangePercent) || 0),
    };
  }).filter(Boolean);
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
  // Primary: v7 batch (1 HTTP call, 90s cached) — fast when Yahoo allows it
  const liveBatch = await withTimeout(fetchYahooQuoteBatch(symbols), 8000, []);
  const quoteFirstRows = normalizeQuoteBatchToRows(symbols, Array.isArray(liveBatch) ? liveBatch : []);
  // Fallback: per-symbol chart calls — slower but works when v7 is blocked
  // Cap at 15s total so we never hang the server
  const yahooRows = quoteFirstRows.length
    ? quoteFirstRows
    : await withTimeout(fetchYahooQuotes(symbols), Math.min(MARKET_QUOTE_TIMEOUT_MS, 15000), []);
  const resolvedYahoo = Array.isArray(yahooRows) ? yahooRows : [];
  const hasGaps = resolvedYahoo.some((row) => !Number.isFinite(Number(row.marketCap)) || Number(row.marketCap) <= 0);

  if (keys.fmp) {
    const fmpRows = await fetchFmpQuotes(symbols, keys.fmp);
    if (fmpRows.length) {
      if (!resolvedYahoo.length) {
        return fmpRows.map((row) => ({
          ...row, delta1d: round2(row.changesPercentage || 0), delta1w: 0, delta5m: 0, delta30m: 0,
        }));
      }
      if (hasGaps) return mergeQuoteRows(resolvedYahoo, fmpRows);
    }
  }

  if (!resolvedYahoo.length && keys.finnhub) {
    const fhRows = await fetchFinnhubQuotes(symbols, keys.finnhub);
    if (fhRows.length) {
      return fhRows.map((row) => ({
        ...row, delta1d: round2(row.changesPercentage || 0), delta1w: 0, delta5m: 0, delta30m: 0,
      }));
    }
  }

  if (!resolvedYahoo.length && keys.polygon) {
    const pgRows = await fetchPolygonQuotes(symbols, keys.polygon);
    if (pgRows.length) return pgRows;
  }

  return resolvedYahoo;
}

// --- News helpers ---

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

  if (keys.polygon) {
    const rows = await Promise.all(tickers.map((ticker) => fetchPolygonNews(ticker, keys.polygon)));
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

// --- Fundamentals ---

async function fetchMarketFundamentals(symbol, keys) {
  if (keys.fmp) {
    const fmp = await fetchFmpFundamentals(symbol, keys.fmp);
    if (fmp) return fmp;
  }
  return fetchYahooFundamentals(symbol);
}

// --- Options flow ---

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
    if (tradierRows.length) { rows = tradierRows; source = "tradier-options"; }
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
    source, filters: { flowType, minNotional, unusualOnly },
    symbols, summary,
    bySymbol: rows.map((entry) => ({
      symbol: entry.symbol, expiration: entry.expiration,
      callPutRatio: entry.callPutRatio, topContracts: entry.flowRows.slice(0, 6),
    })),
    flow,
  };
}

// --- Live payload (trading analyst) ---

function inferSmartMoney(current, support, resistance, avgVolume, trend, volumeCharacter) {
  const upsideStops = round2(resistance + (resistance - support) * 0.12);
  const downsideStops = round2(support - (resistance - support) * 0.12);
  const fakeoutRisk = current.volume < avgVolume * 0.85 || trend === "Range"
    ? "High"
    : volumeCharacter === "Neutral" ? "Medium" : "Low";
  return {
    liquidityZone: `Above ${resistance} breakout highs and below ${support} swing lows`,
    stopClusters: `Buy stops near ${upsideStops}, sell stops near ${downsideStops}`,
    fakeoutRisk
  };
}

function scoreHeadline(headline) {
  const text = headline.toLowerCase();
  const bullishWords = ["beat", "surge", "upgrade", "growth", "record", "bull", "rally", "wins", "strong", "expands"];
  const bearishWords = ["miss", "drop", "downgrade", "cuts", "probe", "lawsuit", "bear", "weak", "fall", "slump"];
  let score = 0;
  bullishWords.forEach((word) => { if (text.includes(word)) score += 1; });
  bearishWords.forEach((word) => { if (text.includes(word)) score -= 1; });
  return score;
}

function classifyNewsSentiment(newsItems) {
  if (!newsItems.length) return "Neutral";
  const score = newsItems.slice(0, 5).reduce((total, item) => total + scoreHeadline(item.title), 0);
  if (score >= 2) return "Bullish";
  if (score <= -2) return "Bearish";
  return "Neutral";
}

function buildNewsNotes(newsItems) {
  if (!newsItems.length) return "No current Yahoo Finance headlines were returned for this ticker.";
  return newsItems
    .slice(0, 3)
    .map((item) => `${item.publisher}: ${trimText(item.title, 110)}`)
    .join(" | ");
}

async function fetchFirstAvailableBars(symbols) {
  for (const symbol of symbols) {
    try {
      const bars = await fetchYahooBars(symbol, "1mo", "1d");
      if (bars.length) return bars;
    } catch {
      continue;
    }
  }
  return [];
}

const MACRO_CACHE_TTL_MS = 15 * 60 * 1000;
let macroCacheValue = null;
let macroCacheAt = 0;

async function fetchMacroSignals() {
  const now = Date.now();
  if (macroCacheValue && now - macroCacheAt < MACRO_CACHE_TTL_MS) {
    return macroCacheValue;
  }
  const [spyBars, qqqBars, vixQuote, dxyQuote, us10yQuote, us2yQuote] = await Promise.all([
    fetchFirstAvailableBars(MACRO_SYMBOLS.SPY),
    fetchFirstAvailableBars(MACRO_SYMBOLS.QQQ),
    fetchFirstAvailableBars(MACRO_SYMBOLS.VIX),
    fetchFirstAvailableBars(MACRO_SYMBOLS.DXY),
    fetchFirstAvailableBars(MACRO_SYMBOLS.US10Y),
    fetchFirstAvailableBars(MACRO_SYMBOLS.US2Y)
  ]);
  macroCacheValue = {
    spyTrend: detectSimpleTrend(spyBars),
    qqqTrend: detectSimpleTrend(qqqBars),
    vix: round2(vixQuote.at(-1)?.close ?? 18),
    dxy: round2(dxyQuote.at(-1)?.close ?? 104),
    yield10y: normalizeYield(us10yQuote.at(-1)?.close),
    yield2y: normalizeYield(us2yQuote.at(-1)?.close)
  };
  macroCacheAt = now;
  return macroCacheValue;
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
      ticker, timeframe, style,
      price: round2(current.close),
      support, resistance,
      liquidityZone: smartMoney.liquidityZone,
      trend, structure, volumeCharacter,
      ema9: round2(ema9), ema21: round2(ema21), ema200: round2(ema200),
      vwap: round2(vwap), rsi: round2(rsi),
      divergence, volumeSpike,
      stopClusters: smartMoney.stopClusters,
      fakeoutRisk: smartMoney.fakeoutRisk,
      newsSentiment,
      catalyst: news[0]?.title ? trimText(news[0].title, 90) : "No fresh catalyst found",
      newsNotes: buildNewsNotes(news),
      spyTrend: macro.spyTrend, qqqTrend: macro.qqqTrend,
      vix: macro.vix, dxy: macro.dxy,
      yield2y: macro.yield2y, yield10y: macro.yield10y
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

// --- Route handler ---

async function handleMarket(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;

  if (pathname === "/api/market/quote") {
    const symbols = (searchParams.get("symbols") || "")
      .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!symbols.length) return writeJson(res, 400, { error: "At least one symbol is required." });
    const keys = resolveProviderKeys(searchParams);
    try {
      const payload = await withTimeout(fetchMarketQuotes(symbols, keys), 28000, []);
      return writeJson(res, 200, Array.isArray(payload) ? payload : []);
    } catch (err) {
      // Return empty array rather than letting this propagate to a 502
      console.error("[market/quote] Error:", err?.message);
      return writeJson(res, 200, []);
    }
  }

  if (pathname === "/api/market/movers") {
    const symbols = (searchParams.get("symbols") || "")
      .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!symbols.length) return writeJson(res, 400, { error: "At least one symbol is required." });
    const n = Math.max(1, Math.min(20, Number(searchParams.get("n") || 5)));
    const keys = resolveProviderKeys(searchParams);
    const payload = await fetchMarketQuotes(symbols, keys);
    const rawQuotes = Array.isArray(payload) ? payload : (payload.quotes || []);
    const quotes = rawQuotes.filter((q) => typeof q.price === "number" && typeof q.changesPercentage === "number");
    const sorted = [...quotes].sort((a, b) => b.changesPercentage - a.changesPercentage);
    return writeJson(res, 200, {
      gainers: sorted.slice(0, n).map((q) => ({ symbol: q.symbol, price: q.price, changesPercentage: q.changesPercentage })),
      losers: sorted.slice(-n).reverse().map((q) => ({ symbol: q.symbol, price: q.price, changesPercentage: q.changesPercentage })),
      count: quotes.length,
      generatedAt: new Date().toISOString(),
    });
  }

  if (pathname === "/api/market/news") {
    const tickers = (searchParams.get("tickers") || "")
      .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const limit = Math.max(1, Math.min(50, Number(searchParams.get("limit") || 20)));
    if (!tickers.length) return writeJson(res, 400, { error: "At least one ticker is required." });
    const keys = resolveProviderKeys(searchParams);
    const payload = await fetchMarketNews(tickers, limit, keys);
    return writeJson(res, 200, payload);
  }

  if (pathname === "/api/market/options-flow") {
    const symbols = (searchParams.get("symbols") || "")
      .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!symbols.length) return writeJson(res, 400, { error: "At least one symbol is required." });
    const limit = Math.max(3, Math.min(60, Number(searchParams.get("limit") || 20)));
    const flowType = String(searchParams.get("flowType") || "all").toLowerCase();
    const minNotional = Math.max(0, Number(searchParams.get("minNotional") || 0));
    const unusualOnly = String(searchParams.get("unusualOnly") || "false").toLowerCase() === "true";
    const keys = resolveProviderKeys(searchParams);
    const payload = await fetchOptionsFlow(symbols, { limit, flowType, minNotional, unusualOnly, keys });
    return writeJson(res, 200, payload);
  }

  if (pathname === "/api/market/fundamentals") {
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) return writeJson(res, 400, { error: "Symbol is required." });
    const keys = resolveProviderKeys(searchParams);
    const payload = await fetchMarketFundamentals(symbol, keys);
    return writeJson(res, 200, payload);
  }

  // POST /api/market/screen — server-side momentum screener
  if (pathname === "/api/market/screen" && req.method === "POST") {
    let body;
    try {
      const raw = await readRequestBody(req);
      body = JSON.parse(raw);
    } catch {
      return writeJson(res, 400, { error: "Invalid JSON body. Send { symbols: [...], filters: {...} }" });
    }

    const rawSymbols = Array.isArray(body.symbols) ? body.symbols : [];
    const symbols = rawSymbols
      .map((s) => String(s || "").trim().toUpperCase())
      .filter((s) => /^[A-Z0-9.\-^]{1,12}$/.test(s))
      .slice(0, 200);

    if (!symbols.length) return writeJson(res, 400, { error: "Provide at least one symbol in the symbols array." });

    const filters = body.filters || {};
    const minPrice = Number(filters.minPrice) || 0;
    const maxPrice = Number(filters.maxPrice) || Infinity;
    const minChangePct = Number(filters.minChangePct) || -Infinity;
    const maxChangePct = Number(filters.maxChangePct) || Infinity;
    const minRvol = Number(filters.minRvol) || 0;
    const minScore = Number(filters.minScore) || 0;
    const limit = Math.max(1, Math.min(100, Number(filters.limit) || 50));

    const keys = resolveProviderKeys(searchParams);
    const quotes = await withTimeout(fetchMarketQuotes(symbols, keys), 15000, []);

    const scored = quotes
      .map((q) => {
        const price = Number(q.price || 0);
        const chgPct = Number(q.changesPercentage || 0);
        const vol = Number(q.volume || 0);
        const avgVol = Number(q.avgVolume || 1);
        const rvol = avgVol > 0 ? round2(vol / avgVol) : 0;
        const yearHigh = Number(q.yearHigh || 0);
        const yearLow = Number(q.yearLow || 0);

        let tech = 50;
        if (chgPct > 2) tech += 20;
        else if (chgPct > 0.5) tech += 12;
        else if (chgPct > 0) tech += 5;
        else if (chgPct > -1) tech -= 5;
        else tech -= 15;

        if (rvol > 1.5 && chgPct > 0) tech += 15;
        else if (rvol > 1.2 && chgPct > 0) tech += 8;
        else if (rvol > 1.5 && chgPct < 0) tech -= 10;

        if (yearHigh > yearLow && price > 0) {
          const pos = (price - yearLow) / (yearHigh - yearLow);
          if (pos > 0.85) tech += 10;
          else if (pos > 0.6) tech += 5;
          else if (pos < 0.2) tech -= 10;
        }

        let fund = 50;
        const pe = Number(q.pe || 0);
        if (pe > 0 && pe < 25) fund += 12;
        else if (pe > 40) fund -= 8;
        if (Number(q.marketCap) > 200e9) fund += 8;
        else if (Number(q.marketCap) > 50e9) fund += 4;

        const macro = chgPct > 0 ? 63 : 55;

        const composite = Math.round(
          Math.max(0, Math.min(100, tech)) * 0.45 +
          Math.max(0, Math.min(100, fund)) * 0.35 +
          Math.max(0, Math.min(100, macro)) * 0.20
        );

        return { ...q, rvol, tech: Math.round(tech), fund: Math.round(fund), macro, composite };
      })
      .filter((q) => {
        if (q.price < minPrice || q.price > maxPrice) return false;
        if (q.changesPercentage < minChangePct || q.changesPercentage > maxChangePct) return false;
        if (q.rvol < minRvol) return false;
        if (q.composite < minScore) return false;
        return true;
      })
      .sort((a, b) => b.composite - a.composite)
      .slice(0, limit);

    return writeJson(res, 200, {
      results: scored,
      count: scored.length,
      screened: quotes.length,
      generatedAt: new Date().toISOString(),
    });
  }

  if (pathname === "/api/live") {
    const ticker = (searchParams.get("ticker") || "").trim().toUpperCase();
    const timeframe = searchParams.get("timeframe") || "1D";
    const style = searchParams.get("style") || "Swing";
    if (!ticker) return writeJson(res, 400, { error: "Ticker is required." });
    if (!/^[A-Z0-9.\-^]{1,12}$/.test(ticker)) {
      return writeJson(res, 400, { error: "Invalid ticker format." });
    }
    try {
      const payload = await buildLivePayload(ticker, timeframe, style);
      return writeJson(res, 200, payload);
    } catch (error) {
      return writeJson(res, 422, {
        error: error instanceof Error ? error.message : "Failed to build live payload",
        ticker
      });
    }
  }

  // GET /api/market/short-interest?tickers=BBAI,PLTR,...
  if (pathname === "/api/market/short-interest" && req.method === "GET") {
    const tickers = (searchParams.get("tickers") || "")
      .split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 30);
    if (!tickers.length) return writeJson(res, 400, { error: "tickers param required" });
    const settled = await Promise.allSettled(tickers.map(t => fetchYahooShortInterest(t)));
    const results = settled.map((r, i) =>
      r.status === "fulfilled" ? r.value : { symbol: tickers[i], shortFloat: null, shortRatio: null }
    );
    return writeJson(res, 200, { ok: true, fetchedAt: new Date().toISOString(), results });
  }

  // GET /api/market/insider?ticker=BBAI
  if (pathname === "/api/market/insider" && req.method === "GET") {
    const ticker = (searchParams.get("ticker") || "").trim().toUpperCase();
    if (!ticker) return writeJson(res, 400, { error: "ticker required" });
    const [txns, inst] = await Promise.all([
      fetchYahooInsiderTransactions(ticker).catch(() => ({ symbol: ticker, transactions: [], holders: [] })),
      fetchYahooInstitutional(ticker).catch(() => ({ symbol: ticker, institutions: [], funds: [], insidersPct: 0, institutionsPct: 0 })),
    ]);
    return writeJson(res, 200, { ok: true, ticker, insiderTransactions: txns, institutional: inst, fetchedAt: new Date().toISOString() });
  }

  // GET /api/market/analyst?tickers=BBAI,PLTR
  if (pathname === "/api/market/analyst" && req.method === "GET") {
    const tickers = (searchParams.get("tickers") || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 10);
    if (!tickers.length) return writeJson(res, 400, { error: "tickers required" });
    const settled = await Promise.allSettled(tickers.map(t => fetchYahooAnalystRatings(t)));
    const results = settled.map((r, i) => r.status === "fulfilled" ? r.value : { symbol: tickers[i], history: [], trend: [] });
    return writeJson(res, 200, { ok: true, results, fetchedAt: new Date().toISOString() });
  }

  // GET /api/market/dividends?tickers=AAPL,MSFT
  if (pathname === "/api/market/dividends" && req.method === "GET") {
    const tickers = (searchParams.get("tickers") || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 30);
    if (!tickers.length) return writeJson(res, 400, { error: "tickers required" });
    const settled = await Promise.allSettled(tickers.map(t => fetchYahooDividendInfo(t)));
    const results = settled.map((r, i) => r.status === "fulfilled" ? r.value : { symbol: tickers[i], dividendYield: 0 });
    return writeJson(res, 200, { ok: true, results: results.filter(r => r.dividendYield > 0 || r.exDividendDate || r.lastSplitFactor), fetchedAt: new Date().toISOString() });
  }

  // GET /api/market/social?ticker=BBAI
  if (pathname === "/api/market/social" && req.method === "GET") {
    const ticker = (searchParams.get("ticker") || "").trim().toUpperCase();
    if (!ticker) return writeJson(res, 400, { error: "ticker required" });
    const [stwits] = await Promise.all([
      fetchStockTwitsSentiment(ticker).catch(() => ({ symbol: ticker, bullPct: 50, total: 0, messages: [] })),
    ]);
    // Reddit WSB mentions (best-effort)
    let redditCount = 0;
    try {
      const rUrl = `https://www.reddit.com/r/wallstreetbets/search.json?q=${encodeURIComponent(ticker)}&restrict_sr=1&sort=new&limit=10&t=week`;
      const rRes = await fetch(rUrl, { headers: { "User-Agent": "AM-Trading/1.0" }, signal: AbortSignal.timeout(5000) });
      if (rRes.ok) { const rData = await rRes.json(); redditCount = rData?.data?.dist || 0; }
    } catch {}
    return writeJson(res, 200, { ok: true, ticker, stocktwits: stwits, redditMentions: redditCount, fetchedAt: new Date().toISOString() });
  }


  // GET /api/market/feargreed
  if (pathname === "/api/market/feargreed" && req.method === "GET") {
    try {
      const [spyBars, vixBars, tltBars, hygBars] = await Promise.all([
        withTimeout(fetchYahooBars("SPY",  "1y",  "1d"), 12000, []),
        withTimeout(fetchYahooBars("^VIX", "3mo", "1d"), 10000, []),
        withTimeout(fetchYahooBars("TLT",  "3mo", "1d"), 10000, []),
        withTimeout(fetchYahooBars("HYG",  "3mo", "1d"), 10000, []),
      ]);
      const { computeRSI } = require("../indicators");
      const vix = vixBars.at(-1)?.close ?? 20;
      const vixScore = Math.max(0, Math.min(100, Math.round(100 - ((vix - 10) / 35) * 100)));
      const spyCloses = spyBars.map(b => b.close);
      const spyCurrent = spyCloses.at(-1) ?? 0;
      const spy125 = spyCloses.length >= 125
        ? spyCloses.slice(-125).reduce((a, b) => a + b, 0) / 125 : spyCurrent;
      const spyMaDiff = spy125 > 0 ? ((spyCurrent - spy125) / spy125) * 100 : 0;
      const momentumScore = Math.max(0, Math.min(100, Math.round(50 + spyMaDiff * 8)));
      const spyRsi = spyCloses.length >= 15 ? computeRSI(spyCloses, 14) : 50;
      const rsiScore = Math.max(0, Math.min(100, Math.round(spyRsi)));
      const slice252 = spyCloses.slice(-252);
      const spy52h = Math.max(...slice252), spy52l = Math.min(...slice252);
      const rangeScore = spy52h > spy52l
        ? Math.round(((spyCurrent - spy52l) / (spy52h - spy52l)) * 100) : 50;
      const tltCloses = tltBars.map(b => b.close);
      const tlt20 = tltCloses.length >= 20 ? tltCloses.slice(-20).reduce((a,b)=>a+b,0)/20 : (tltCloses.at(-1)??0);
      const tltCur = tltCloses.at(-1) ?? tlt20;
      const tltDiff = tlt20 > 0 ? ((tltCur - tlt20) / tlt20) * 100 : 0;
      const safeHavenScore = Math.max(0, Math.min(100, Math.round(50 - tltDiff * 10)));
      const hygCloses = hygBars.map(b => b.close);
      const hyg20 = hygCloses.length >= 20 ? hygCloses.slice(-20).reduce((a,b)=>a+b,0)/20 : (hygCloses.at(-1)??0);
      const hygCur = hygCloses.at(-1) ?? hyg20;
      const hygDiff = hyg20 > 0 ? ((hygCur - hyg20) / hyg20) * 100 : 0;
      const junkScore = Math.max(0, Math.min(100, Math.round(50 + hygDiff * 20)));
      const composite = Math.round(
        vixScore*0.30 + momentumScore*0.25 + rsiScore*0.15 +
        rangeScore*0.15 + safeHavenScore*0.08 + junkScore*0.07
      );
      const fgLabel = composite<=25?"EXTREME FEAR":composite<=45?"FEAR":composite<=55?"NEUTRAL":composite<=75?"GREED":"EXTREME GREED";
      const sign = n => n >= 0 ? "+" : "";
      return writeJson(res, 200, {
        ok:true, fetchedAt:new Date().toISOString(),
        score:composite, label:fgLabel, vix:round2(vix),
        components:[
          {name:"VIX Level",         score:vixScore,       weight:30, detail:"VIX at " + round2(vix)},
          {name:"Market Momentum",   score:momentumScore,  weight:25, detail:"SPY " + sign(spyMaDiff) + round2(spyMaDiff) + "% vs 125d MA"},
          {name:"RSI (14)",          score:rsiScore,       weight:15, detail:"SPY RSI = " + round2(spyRsi)},
          {name:"52-Week Range",     score:rangeScore,     weight:15, detail:"SPY at " + rangeScore + "% of 52w range"},
          {name:"Safe Haven Demand", score:safeHavenScore, weight:8,  detail:"TLT " + sign(tltDiff) + round2(tltDiff) + "% (20d)"},
          {name:"Junk Bond Demand",  score:junkScore,      weight:7,  detail:"HYG " + sign(hygDiff) + round2(hygDiff) + "% (20d)"},
        ],
      });
    } catch(err) {
      return writeJson(res, 422, {error:err?.message||"Fear & Greed fetch failed"});
    }
  }

  // GET /api/market/breadth
  if (pathname === "/api/market/breadth" && req.method === "GET") {
    const SECTORS = [
      {sym:"XLK",name:"Technology"},{sym:"XLF",name:"Financials"},{sym:"XLE",name:"Energy"},
      {sym:"XLV",name:"Health Care"},{sym:"XLI",name:"Industrials"},{sym:"XLY",name:"Cons. Discret."},
      {sym:"XLP",name:"Cons. Staples"},{sym:"XLRE",name:"Real Estate"},{sym:"XLU",name:"Utilities"},
      {sym:"XLB",name:"Materials"},{sym:"XLC",name:"Comm. Services"},
    ];
    const INDICES = [
      {sym:"SPY",name:"S&P 500"},{sym:"QQQ",name:"Nasdaq 100"},
      {sym:"IWM",name:"Russell 2000"},{sym:"DIA",name:"Dow Jones"},
    ];
    const all = [...SECTORS, ...INDICES];
    const barsArr = await Promise.allSettled(
      all.map(({sym}) => withTimeout(fetchYahooBars(sym,"1y","1d"),9000,[]))
    );
    const results = all.map(({sym,name},i) => {
      const bars = barsArr[i].status==="fulfilled" ? barsArr[i].value : [];
      if (bars.length < 2) return {sym,name,price:0,change:0,ma50:null,ma200:null,above50:null,above200:null,pos52w:50,status:"N/A"};
      const closes = bars.map(b=>b.close);
      const cur=closes.at(-1), prev=closes.at(-2);
      const change = prev ? round2(((cur-prev)/prev)*100) : 0;
      const ma50  = closes.length>=50  ? round2(closes.slice(-50).reduce((a,b)=>a+b,0)/50)  : null;
      const ma200 = closes.length>=200 ? round2(closes.slice(-200).reduce((a,b)=>a+b,0)/200): null;
      const s252=closes.slice(-252), h52=Math.max(...s252), l52=Math.min(...s252);
      const pos52w = h52>l52 ? round2(((cur-l52)/(h52-l52))*100) : 50;
      const above50=ma50!=null?cur>ma50:null, above200=ma200!=null?cur>ma200:null;
      const status=(above200&&above50&&change>0)?"Bullish":(!above200||change<-0.5)?"Bearish":"Neutral";
      return {sym,name,price:round2(cur),change,ma50,ma200,above50,above200,pos52w,status};
    });
    const sectors=results.slice(0,SECTORS.length), indices=results.slice(SECTORS.length);
    const tot=sectors.length;
    const adv=sectors.filter(s=>s.change>0).length;
    const ab50=sectors.filter(s=>s.above50).length;
    const ab200=sectors.filter(s=>s.above200).length;
    return writeJson(res,200,{
      ok:true,fetchedAt:new Date().toISOString(),
      summary:{
        advancingPct:round2((adv/tot)*100), decliningPct:round2(((tot-adv)/tot)*100),
        above50Pct:round2((ab50/tot)*100), above200Pct:round2((ab200/tot)*100),
        adRatio:round2(adv/Math.max(1,tot-adv)),
      },
      sectors, indices,
    });
  }

  // GET /api/market/seasonality?ticker=SPY
  if (pathname === "/api/market/seasonality" && req.method === "GET") {
    const sticker=(searchParams.get("ticker")||"SPY").trim().toUpperCase();
    const sbars = await withTimeout(fetchYahooBars(sticker,"5y","1d"),18000,[]);
    if (sbars.length<10) return writeJson(res,422,{error:"No data for " + sticker});
    const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const monthly=Array.from({length:12},()=>[]);
    const weekly =Array.from({length:7 },()=>[]);
    for (let i=1;i<sbars.length;i++) {
      const ret=((sbars[i].close-sbars[i-1].close)/sbars[i-1].close)*100;
      if (!Number.isFinite(ret)) continue;
      const d=new Date(sbars[i].time*1000);
      monthly[d.getMonth()].push(ret);
      weekly[d.getDay()].push(ret);
    }
    const monthlyAvg=monthly.map((rets,i)=>({
      month:MONTHS[i],
      avgReturn:rets.length?round2(rets.reduce((a,b)=>a+b,0)/rets.length):null,
      count:rets.length,
      winRate:rets.length?round2((rets.filter(r=>r>0).length/rets.length)*100):null,
    }));
    const dowAvg=weekly.map((rets,i)=>({
      day:DAYS[i],
      avgReturn:rets.length?round2(rets.reduce((a,b)=>a+b,0)/rets.length):null,
      count:rets.length,
      winRate:rets.length?round2((rets.filter(r=>r>0).length/rets.length)*100):null,
    })).filter(d=>d.count>0);
    return writeJson(res,200,{ok:true,ticker:sticker,fetchedAt:new Date().toISOString(),dataPoints:sbars.length,months:monthlyAvg,daysOfWeek:dowAvg});
  }

  // GET /api/market/candles?ticker=BBAI&timeframe=1D
  if (pathname === "/api/market/candles" && req.method === "GET") {
    const ticker    = (searchParams.get("ticker") || "").trim().toUpperCase();
    const timeframe = searchParams.get("timeframe") || "1D";
    if (!ticker) return writeJson(res, 400, { error: "ticker required" });
    const { CANDLE_TIMEFRAME_CONFIG } = require("../config");
    const cfg = CANDLE_TIMEFRAME_CONFIG[timeframe] || CANDLE_TIMEFRAME_CONFIG["1D"];
    try {
      const bars = await fetchYahooBars(ticker, cfg.range, cfg.interval);
      return writeJson(res, 200, { ok: true, ticker, timeframe, bars: bars.slice(-120) });
    } catch (err) {
      return writeJson(res, 422, { error: err?.message || "Candle fetch failed" });
    }
  }

  // GET /api/market/crypto — live crypto prices + Fear & Greed + BTC dominance
  if (pathname === "/api/market/crypto" && req.method === "GET") {
    // Server-side cache — only hit Binance/CoinGecko once per 2 minutes
    if (!handleMarket._cryptoCache) handleMarket._cryptoCache = { data: null, ts: 0 };
    const CRYPTO_TTL = 120_000; // 2 minutes
    if (handleMarket._cryptoCache.data && Date.now() - handleMarket._cryptoCache.ts < CRYPTO_TTL) {
      return writeJson(res, 200, handleMarket._cryptoCache.data);
    }
    // Binance symbol → display info
    const BINANCE_MAP = [
      { binance: "BTCUSDT",  symbol: "BTC",   name: "Bitcoin" },
      { binance: "ETHUSDT",  symbol: "ETH",   name: "Ethereum" },
      { binance: "SOLUSDT",  symbol: "SOL",   name: "Solana" },
      { binance: "BNBUSDT",  symbol: "BNB",   name: "BNB" },
      { binance: "XRPUSDT",  symbol: "XRP",   name: "XRP" },
      { binance: "DOGEUSDT", symbol: "DOGE",  name: "Dogecoin" },
      { binance: "ADAUSDT",  symbol: "ADA",   name: "Cardano" },
      { binance: "AVAXUSDT", symbol: "AVAX",  name: "Avalanche" },
      { binance: "LINKUSDT", symbol: "LINK",  name: "Chainlink" },
      { binance: "DOTUSDT",  symbol: "DOT",   name: "Polkadot" },
      { binance: "MATICUSDT",symbol: "MATIC", name: "Polygon" },
      { binance: "UNIUSDT",  symbol: "UNI",   name: "Uniswap" },
      { binance: "LTCUSDT",  symbol: "LTC",   name: "Litecoin" },
      { binance: "BCHUSDT",  symbol: "BCH",   name: "Bitcoin Cash" },
      { binance: "ATOMUSDT", symbol: "ATOM",  name: "Cosmos" },
    ];

    const H = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };

    try {
      const symbolList = JSON.stringify(BINANCE_MAP.map(m => m.binance));
      const binanceUrl = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbolList)}`;

      const [binanceResult, geckoMarketsResult, fngResult, globalResult] = await Promise.allSettled([
        // Binance 24h ticker — public, no key, very fast
        withTimeout(
          fetch(binanceUrl, { headers: H }).then(r => r.ok ? r.json() : null).catch(() => null),
          8000, null
        ),
        // CoinGecko markets — market caps + prices as backup
        withTimeout(
          fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,binancecoin,ripple,dogecoin,cardano,avalanche-2,chainlink,polkadot,matic-network,uniswap,litecoin,bitcoin-cash,cosmos&order=market_cap_desc&per_page=15&page=1&sparkline=false", { headers: H })
            .then(r => r.ok ? r.json() : null).catch(() => null),
          10000, null
        ),
        // Fear & Greed
        withTimeout(
          fetch("https://api.alternative.me/fng/?limit=7", { headers: H })
            .then(r => r.ok ? r.json() : null).catch(() => null),
          6000, null
        ),
        // CoinGecko global
        withTimeout(
          fetch("https://api.coingecko.com/api/v3/global", { headers: H })
            .then(r => r.ok ? r.json() : null).catch(() => null),
          8000, null
        ),
      ]);

      // Build coin list from Binance data (primary) with CoinGecko mcap as supplement
      const binanceTickers = binanceResult.status === "fulfilled" && Array.isArray(binanceResult.value)
        ? binanceResult.value : [];
      const geckoMarkets = geckoMarketsResult.status === "fulfilled" && Array.isArray(geckoMarketsResult.value)
        ? geckoMarketsResult.value : [];

      const binanceBySymbol = Object.fromEntries(binanceTickers.map(t => [t.symbol, t]));
      const geckoBySymbol = Object.fromEntries(geckoMarkets.map(g => [
        // Map CoinGecko symbol to Binance base
        String(g.symbol || "").toUpperCase() + "USDT", g
      ]));

      const coins = BINANCE_MAP.map(({ binance, symbol, name }) => {
        const b = binanceBySymbol[binance];
        const g = geckoBySymbol[binance];
        // Use Binance for price/changes, CoinGecko for marketCap if available
        const price = b ? round2(Number(b.lastPrice)) : (g ? round2(g.current_price) : 0);
        if (!price) return null;
        const chgPct = b
          ? round2(Number(b.priceChangePercent))
          : (g ? round2(g.price_change_percentage_24h) : 0);
        const high24h = b ? round2(Number(b.highPrice)) : (g ? round2(g.high_24h) : price);
        const low24h  = b ? round2(Number(b.lowPrice))  : (g ? round2(g.low_24h)  : price);
        const volume  = b ? Number(b.quoteVolume) : (g ? g.total_volume : 0);
        const marketCap = g ? g.market_cap : 0;
        return { symbol, name, price, changesPercentage: chgPct, high24h, low24h, volume, marketCap };
      }).filter(Boolean);

      // Fear & Greed
      let fearGreed = null;
      const fng = fngResult.status === "fulfilled" ? fngResult.value : null;
      if (fng?.data?.length) {
        fearGreed = {
          value: Number(fng.data[0].value),
          label: fng.data[0].value_classification,
          history: fng.data.slice(0, 7).map(d => ({
            value: Number(d.value),
            label: d.value_classification,
            timestamp: d.timestamp,
          })),
        };
      }

      // Global macro — CoinGecko or derived from coin data
      let globalMacro = null;
      const gd = globalResult.status === "fulfilled" ? globalResult.value : null;
      if (gd?.data) {
        globalMacro = {
          totalMarketCap: gd.data.total_market_cap?.usd || 0,
          totalVolume24h: gd.data.total_volume?.usd || 0,
          btcDominance: round2(gd.data.market_cap_percentage?.btc || 0),
          ethDominance: round2(gd.data.market_cap_percentage?.eth || 0),
          activeCurrencies: gd.data.active_cryptocurrencies || 0,
          marketCapChange24h: round2(gd.data.market_cap_change_percentage_24h_usd || 0),
        };
      } else if (geckoMarkets.length) {
        // Derive from CoinGecko markets data if global endpoint failed
        const totalMcap = geckoMarkets.reduce((s, g) => s + (g.market_cap || 0), 0);
        const btcMcap = geckoMarkets.find(g => g.symbol === "btc")?.market_cap || 0;
        const ethMcap = geckoMarkets.find(g => g.symbol === "eth")?.market_cap || 0;
        if (totalMcap > 0) {
          globalMacro = {
            totalMarketCap: totalMcap,
            totalVolume24h: geckoMarkets.reduce((s, g) => s + (g.total_volume || 0), 0),
            btcDominance: round2((btcMcap / totalMcap) * 100),
            ethDominance: round2((ethMcap / totalMcap) * 100),
            activeCurrencies: 0,
            marketCapChange24h: 0,
          };
        }
      }

      const payload = { ok: true, coins, fearGreed, globalMacro, generatedAt: new Date().toISOString() };
      // Only cache if we actually got coin data — don't cache empty responses
      if (coins.length > 0) {
        handleMarket._cryptoCache = { data: payload, ts: Date.now() };
      }
      return writeJson(res, 200, payload);
    } catch (err) {
      console.error("[market/crypto] Error:", err?.message);
      // Return stale cache if available rather than empty
      if (handleMarket._cryptoCache?.data) return writeJson(res, 200, handleMarket._cryptoCache.data);
      return writeJson(res, 200, { ok: true, coins: [], fearGreed: null, globalMacro: null, generatedAt: new Date().toISOString() });
    }
  }

  // GET /api/market/options?symbol=AAPL&expiry=2025-01-17
  // Uses Polygon.io (POLYGON_API_KEY) — free tier supported
  if (pathname === "/api/market/options" && req.method === "GET") {
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) return writeJson(res, 400, { error: "symbol required" });
    const requestedExpiry = searchParams.get("expiry") || null;
    const polyKey = process.env.POLYGON_API_KEY || "";

    if (!polyKey) {
      return writeJson(res, 503, { error: "POLYGON_API_KEY not set — add it in Render → Environment." });
    }

    try {
      const PH = { "Accept": "application/json" };

      // Step 1: get underlying price from Polygon snapshot
      const snapRes = await withTimeout(
        fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${polyKey}`, { headers: PH }),
        8000, null
      );
      const snapJson = snapRes?.ok ? await snapRes.json().catch(() => ({})) : {};
      const underlying = round2(
        snapJson?.ticker?.lastTrade?.p ||
        snapJson?.ticker?.day?.c ||
        snapJson?.ticker?.prevDay?.c || 0
      );

      // Step 2: get all option contracts for this symbol (first page to extract expiry dates)
      // Polygon free tier: up to 5 req/min, returns up to 250 contracts per page
      const expiryParam = requestedExpiry ? `&expiration_date=${requestedExpiry}` : "";
      const contractsUrl = `https://api.polygon.io/v3/snapshot/options/${symbol}?limit=250&sort=expiration_date${expiryParam}&apiKey=${polyKey}`;
      const contractsRes = await withTimeout(fetch(contractsUrl, { headers: PH }), 12000, null);

      if (!contractsRes?.ok) {
        const errBody = contractsRes ? await contractsRes.text().catch(() => "") : "timeout";
        throw new Error(`Polygon returned ${contractsRes?.status || "timeout"}: ${errBody.slice(0, 120)}`);
      }

      const contractsJson = await contractsRes.json().catch(() => ({}));
      const results = contractsJson?.results || [];

      if (results.length === 0) {
        return writeJson(res, 404, { error: `No options found for ${symbol}. Try a major symbol like AAPL, NVDA, SPY.` });
      }

      // Extract unique sorted expiry dates from returned contracts
      const expirySet = new Set();
      for (const r of results) {
        const exp = r.details?.expiration_date;
        if (exp) expirySet.add(exp);
      }
      const expiryDates = [...expirySet].sort();
      const chosenExpiry = requestedExpiry && expiryDates.includes(requestedExpiry)
        ? requestedExpiry : expiryDates[0];

      // Step 3: if a different expiry was requested, fetch again for that specific date
      let chainResults = results;
      if (requestedExpiry && requestedExpiry !== expiryDates[0]) {
        const expRes2 = await withTimeout(
          fetch(`https://api.polygon.io/v3/snapshot/options/${symbol}?limit=250&expiration_date=${requestedExpiry}&apiKey=${polyKey}`, { headers: PH }),
          12000, null
        );
        if (expRes2?.ok) {
          const expJson2 = await expRes2.json().catch(() => ({}));
          if ((expJson2?.results || []).length > 0) chainResults = expJson2.results;
        }
      }

      // Filter to chosen expiry only
      const forExpiry = chainResults.filter(r => r.details?.expiration_date === chosenExpiry);

      const underlyingFinal = underlying || 0;
      const mapP = (r) => {
        const d = r.details || {};
        const day = r.day || {};
        const greeks = r.greeks || {};
        const strike = round2(d.strike_price || 0);
        const isCall = d.contract_type === "call";
        const itm = underlyingFinal > 0 && (isCall ? strike <= underlyingFinal : strike >= underlyingFinal);
        return {
          contractSymbol: d.ticker || r.ticker || "",
          strike,
          lastPrice: round2(day.last_price || day.close || 0),
          bid: round2(r.last_quote?.bid || 0),
          ask: round2(r.last_quote?.ask || 0),
          change: round2(day.change || 0),
          changePct: round2(day.change_percent || 0),
          volume: Number(day.volume) || 0,
          openInterest: Number(r.open_interest) || 0,
          iv: round2((r.implied_volatility || 0) * 100),
          inTheMoney: itm,
          expiry: d.expiration_date || chosenExpiry,
          delta: greeks.delta != null ? round2(greeks.delta) : null,
        };
      };

      const calls = forExpiry.filter(r => r.details?.contract_type === "call").map(mapP)
        .sort((a, b) => a.strike - b.strike);
      const puts  = forExpiry.filter(r => r.details?.contract_type === "put").map(mapP)
        .sort((a, b) => a.strike - b.strike);

      return writeJson(res, 200, {
        ok: true, symbol,
        underlying: underlyingFinal,
        expiryDates,
        selectedExpiry: chosenExpiry,
        calls, puts,
        source: "polygon",
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[market/options] Polygon error:", err?.message);
      return writeJson(res, 502, { error: "Options data unavailable: " + err?.message });
    }
  }

  // GET /api/market/sec?symbol=AAPL — recent SEC filings from EDGAR RSS
  if (pathname === "/api/market/sec" && req.method === "GET") {
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) return writeJson(res, 400, { error: "symbol required" });
    try {
      const H = { "User-Agent": "axiom-platform/1.0 contact@example.com", "Accept": "application/json" };
      // Step 1: resolve CIK from ticker
      const tickerRes = await withTimeout(
        fetch(`https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(symbol)}%22&dateRange=custom&startdt=2020-01-01&forms=8-K,4,13F-HR&hits.hits._source.period_of_report=true`, { headers: H }),
        8000, null
      );
      // Use the simpler company search endpoint
      const cikRes = await withTimeout(
        fetch(`https://efts.sec.gov/LATEST/search-index?q=%22${symbol}%22&forms=8-K,4&hits.hits.total.value=5`, { headers: H }),
        8000, null
      );

      // Fallback: use SEC full-text search API
      const searchRes = await withTimeout(
        fetch(`https://efts.sec.gov/LATEST/search-index?q=%22${symbol}%22&forms=8-K,4&dateRange=custom&startdt=2024-01-01`, { headers: H }).then(r => r.ok ? r.json() : null).catch(() => null),
        8000, null
      );

      // Use EDGAR company search to get filings
      const edgarSearch = await withTimeout(
        fetch(`https://efts.sec.gov/LATEST/search-index?q="${symbol}"&forms=8-K,4&dateRange=custom&startdt=2025-01-01&hits.hits._source=period_of_report,entity_name,file_date,form_type,file_num`, { headers: H })
          .then(r => r.ok ? r.json() : null).catch(() => null),
        8000, null
      );

      // Best approach: use EDGAR full-text search
      const ftSearch = await withTimeout(
        fetch(`https://efts.sec.gov/LATEST/search-index?q=%22${symbol}%22&dateRange=custom&startdt=2025-01-01&forms=8-K%2C4%2C13F-HR`, { headers: H })
          .then(r => r.ok ? r.json() : null).catch(() => null),
        8000, null
      );

      const hits = ftSearch?.hits?.hits || [];
      const filings = hits.slice(0, 10).map(h => {
        const s = h._source || {};
        return {
          type:   s.form_type || "—",
          date:   s.file_date || s.period_of_report || "",
          entity: s.entity_name || symbol,
          desc:   s.display_names ? s.display_names.join(", ") : (s.form_type || ""),
          url:    `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(symbol)}&type=${encodeURIComponent(s.form_type || "8-K")}&dateb=&owner=include&count=5`,
        };
      });

      return writeJson(res, 200, { ok: true, symbol, filings, generatedAt: new Date().toISOString() });
    } catch (err) {
      console.error("[market/sec] Error:", err?.message);
      return writeJson(res, 200, { ok: true, symbol, filings: [], generatedAt: new Date().toISOString() });
    }
  }

  return writeJson(res, 404, { error: "Unknown market endpoint." });
}

module.exports = handleMarket;
