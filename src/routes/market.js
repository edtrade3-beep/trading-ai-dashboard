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

  return writeJson(res, 404, { error: "Unknown market endpoint." });
}

module.exports = handleMarket;
