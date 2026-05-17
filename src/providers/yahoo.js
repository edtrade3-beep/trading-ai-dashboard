const { fetchJsonSafe, round2, average, trimText, stripHtml, decodeXmlEntities, extractXmlTag, withTimeout } = require("../utils");
const { aggregateBars, computeEMASeries, computeVWAPSeries, computeRSISeries, computeMACDSeries } = require("../indicators");
const { CANDLE_TIMEFRAME_CONFIG } = require("../config");

const MARKET_CAP_CACHE = new Map();

async function fetchYahooBars(symbol, range, interval) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false&events=div%2Csplits`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
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
    if ([open, high, low, close].some((value) => value == null)) continue;
    bars.push({ time: timestamps[i] * 1000, open, high, low, close, volume });
  }
  return bars;
}

async function fetchYahooQuoteBatch(symbols) {
  try {
    const list = symbols.map((s) => String(s || "").trim()).filter(Boolean).join(",");
    if (!list) return [];
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(list)}`;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload?.quoteResponse?.result) ? payload.quoteResponse.result : [];
  } catch {
    return [];
  }
}

async function fetchYahooChartMeta(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d&includePrePost=false&events=div%2Csplits`;
  try {
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.chart?.result?.[0]?.meta || null;
  } catch {
    return null;
  }
}

async function fetchYahooMarketCapFromSummary(symbol, price) {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,defaultKeyStatistics`;
  try {
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
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
        delta5m: 0,
        delta30m: 0,
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
        preMarketPrice: round2(Number(live?.preMarketPrice) || 0),
        postMarketPrice: round2(Number(live?.postMarketPrice) || 0),
        preMarketChangePercent: round2(Number(live?.preMarketChangePercent) || 0),
        postMarketChangePercent: round2(Number(live?.postMarketChangePercent) || 0),
      };
    } catch {
      return null;
    }
  }));
  return rows.filter(Boolean);
}

async function fetchYahooNews(ticker) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&quotesCount=1&newsCount=8&enableFuzzyQuery=false`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) return fetchYahooRssNews(ticker);
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
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) {
      const fallbackCap = Number.isFinite(liveMarketCap) && liveMarketCap > 0
        ? liveMarketCap
        : (Number.isFinite(liveShares) && liveShares > 0 && Number.isFinite(livePrice) && livePrice > 0 ? liveShares * livePrice : 0);
      return {
        symbol, marketCap: fallbackCap,
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
    const earningsTs = Array.isArray(earningsRaw) && earningsRaw.length ? Number(earningsRaw[0]?.raw || 0) : 0;
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
      symbol, marketCap: fallbackCap,
      pe: Number.isFinite(livePE) ? livePE : null,
      eps: Number.isFinite(liveEPS) ? liveEPS : null,
      sharesOutstanding: Number.isFinite(liveShares) ? liveShares : null,
      earningsDate: liveEarningsTs > 0 ? new Date(liveEarningsTs * 1000).toISOString() : null
    };
  }
}

async function fetchYahooCandlesWithIndicators(symbol, timeframe) {
  const config = CANDLE_TIMEFRAME_CONFIG[timeframe] || CANDLE_TIMEFRAME_CONFIG["1D"];
  const rawBars = await fetchYahooBars(symbol, config.range, config.interval);
  const bars = config.aggregate > 1 ? aggregateBars(rawBars, config.aggregate) : rawBars;
  if (!bars.length) throw new Error(`No candle data returned for ${symbol}.`);
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
    indicators: { ema9, ema21, vwap, rsi, macd }
  };
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
    symbol, side,
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

async function fetchYahooOptionsFlowForSymbol(symbol) {
  const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
  try {
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
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
    return { symbol, expiration, callPutRatio, flowRows };
  } catch {
    return null;
  }
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
      symbol: q.symbol, side: "CALL", strike: strikeCall, volume: callContracts,
      openInterest: Math.round(callContracts * 0.72), lastPrice: round2(estPremium),
      notional: round2(estPremium * callContracts * 100), expiry: expiration,
      tradeType: callContracts > 900 ? "BLOCK" : callContracts > 250 ? "SWEEP" : "TAPE",
      unusual: rvol > 1.2 && chg > 0, estimated: true,
    };
    const putRow = {
      symbol: q.symbol, side: "PUT", strike: strikePut, volume: putContracts,
      openInterest: Math.round(putContracts * 0.78), lastPrice: round2(estPremium * 0.95),
      notional: round2(estPremium * 0.95 * putContracts * 100), expiry: expiration,
      tradeType: putContracts > 900 ? "BLOCK" : putContracts > 250 ? "SWEEP" : "TAPE",
      unusual: rvol > 1.2 && chg < 0, estimated: true,
    };
    return {
      symbol: q.symbol, expiration,
      callPutRatio: putContracts > 0 ? round2(callContracts / putContracts) : 9.99,
      flowRows: [callRow, putRow].sort((a, b) => (b.notional || 0) - (a.notional || 0)),
    };
  });
  return rows.filter(Boolean);
}

module.exports = {
  fetchYahooBars, fetchYahooQuoteBatch, fetchYahooQuotes,
  fetchYahooNews, fetchYahooRssNews,
  fetchYahooFundamentals, fetchYahooCandlesWithIndicators,
  fetchYahooOptionsFlowForSymbol, fetchEstimatedOptionsFlow,
  fetchYahooMarketCapFromSummary, fetchYahooChartMeta,
  resolveMarketCap, MARKET_CAP_CACHE
};
