const { fetchJsonSafe, round2, average, trimText, stripHtml, decodeXmlEntities, extractXmlTag, withTimeout } = require("../utils");
const { aggregateBars, computeEMASeries, computeVWAPSeries, computeRSISeries, computeMACDSeries } = require("../indicators");
const { CANDLE_TIMEFRAME_CONFIG } = require("../config");

// ── Caches ──────────────────────────────────────────────────────────────────
const MARKET_CAP_CACHE = new Map();
// Quote batch cache: 3 minutes — reduces Yahoo calls and speeds up page load
const QUOTE_BATCH_CACHE = new Map();
const QUOTE_CACHE_TTL_MS = 180_000;

// ── Robust Yahoo fetch with AbortController timeout ──────────────────────────
const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Origin": "https://finance.yahoo.com",
  "Referer": "https://finance.yahoo.com/",
};

async function yFetch(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: YAHOO_HEADERS, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ── Yahoo crumb manager ───────────────────────────────────────────────────────
// Yahoo v7/v8 APIs block cloud IPs unless a valid crumb + session cookie is sent.
// We obtain these once by loading finance.yahoo.com, then reuse for 30 min.
let _crumbCache = null; // { crumb, cookie, ts }
const CRUMB_TTL = 30 * 60 * 1000;

async function getYahooCrumb() {
  if (_crumbCache && Date.now() - _crumbCache.ts < CRUMB_TTL) return _crumbCache;
  try {
    // Step 1: get a session cookie. Confirmed via direct production testing
    // that https://finance.yahoo.com/ (the full site, behind heavier bot
    // protection) is unreachable from Render at the connection level
    // ("fetch failed", not an HTTP error) even though the query1/query2 API
    // hosts used below are fine. fc.yahoo.com is a lighter, cookie-only host
    // (404s — no real page — but still sets the session cookie) that other
    // Yahoo crumb implementations use for exactly this reason; confirmed
    // reachable from Render and its cookie works for step 2 below.
    const pageRes = await fetch("https://fc.yahoo.com/", {
      headers: { "User-Agent": YAHOO_HEADERS["User-Agent"] },
      signal: AbortSignal.timeout(8000),
    });
    const cookie = (pageRes.headers.get("set-cookie") || "")
      .split(",").map(s => s.trim().split(";")[0]).filter(Boolean).join("; ");

    // Step 2: fetch the crumb using that cookie
    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: {
        ...YAHOO_HEADERS,
        ...(cookie ? { "Cookie": cookie } : {}),
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.length < 3) return null;
    _crumbCache = { crumb, cookie, ts: Date.now() };
    console.log("[Yahoo] Crumb refreshed:", crumb.slice(0, 6) + "…");
    return _crumbCache;
  } catch {
    return null;
  }
}

async function yFetchWithCrumb(url, timeoutMs = 8000) {
  const session = await getYahooCrumb();
  const sep = url.includes("?") ? "&" : "?";
  const urlWithCrumb = session ? `${url}${sep}crumb=${encodeURIComponent(session.crumb)}` : url;
  const headers = { ...YAHOO_HEADERS, ...(session?.cookie ? { "Cookie": session.cookie } : {}) };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(urlWithCrumb, { headers, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// Plain-then-crumb fallback for v10/finance/quoteSummary — every one of
// fetchYahooMarketCapFromSummary/Fundamentals/ShortInterest/
// InsiderTransactions/Institutional/AnalystRatings/DividendInfo/Earnings
// called yFetch (no crumb) directly against this endpoint, which now 401s
// ("Invalid Crumb") unconditionally on every request (confirmed via direct
// curl, independent of any cloud-IP block) — the same root cause already
// found and fixed for the squeeze screener's v7/finance/quote calls.
// short interest, insider transactions, institutional ownership, analyst
// ratings, and dividend info had NO other data source, so they were
// silently returning empty/null 100% of the time with no indication
// anything was wrong.
async function yFetchQuoteSummary(url, timeoutMs = 8000) {
  try {
    const res = await yFetch(url, timeoutMs);
    if (res.ok) return res;
  } catch { /* fall through to crumb */ }
  return yFetchWithCrumb(url, timeoutMs);
}

// ── Parse chart result into bar array ────────────────────────────────────────
function parseYahooChartBars(payload) {
  const result = payload?.chart?.result?.[0];
  const q = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp || [];
  if (!q || !timestamps.length) return [];
  const bars = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = q.open?.[i], high = q.high?.[i], low = q.low?.[i], close = q.close?.[i];
    const volume = q.volume?.[i] ?? 0;
    if ([open, high, low, close].some(v => v == null)) continue;
    bars.push({ time: timestamps[i] * 1000, open, high, low, close, volume });
  }
  return bars;
}

async function fetchYahooBars(symbol, range, interval) {
  // Prefer REAL Alpaca data (free, intraday-capable) when keys are set; fall back
  // to Yahoo for crypto/indices or if Alpaca returns nothing. Same bar shape.
  try {
    const { fetchAlpacaBars } = require("./alpaca-data");
    const a = await fetchAlpacaBars(symbol, range, interval);
    if (a && a.length > 0) return a;
  } catch { /* fall through to Yahoo */ }

  // Try query1 first, fall back to query2 (different rate-limit pool)
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false&events=div%2Csplits`;
  const urls = [
    `https://query1.finance.yahoo.com${path}`,
    `https://query2.finance.yahoo.com${path}`,
  ];
  for (const url of urls) {
    try {
      const response = await yFetch(url, 9000);
      if (!response.ok) continue;
      const payload = await response.json();
      const bars = parseYahooChartBars(payload);
      if (bars.length > 0) return bars;
    } catch { continue; }
  }
  throw new Error(`Yahoo chart unavailable for ${symbol}`);
}

async function fetchYahooQuoteBatch(symbols) {
  try {
    const list = symbols.map((s) => String(s || "").trim()).filter(Boolean).join(",");
    if (!list) return [];

    // Check cache first
    const cached = QUOTE_BATCH_CACHE.get(list);
    if (cached && Date.now() - cached.ts < QUOTE_CACHE_TTL_MS) return cached.data;

    // Try 1: plain v7 (fast, no crumb needed on some IPs)
    const baseUrls = [
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(list)}`,
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(list)}`,
    ];
    for (const url of baseUrls) {
      try {
        const response = await yFetch(url, 7000);
        if (!response.ok) continue;
        const payload = await response.json();
        const result = Array.isArray(payload?.quoteResponse?.result) ? payload.quoteResponse.result : [];
        if (result.length > 0) {
          QUOTE_BATCH_CACHE.set(list, { data: result, ts: Date.now() });
          return result;
        }
      } catch { continue; }
    }

    // Try 2: v7 with crumb auth (required when cloud IP is blocked)
    for (const host of ["query1", "query2"]) {
      try {
        const url = `https://${host}.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(list)}`;
        const response = await yFetchWithCrumb(url, 8000);
        if (!response.ok) continue;
        const payload = await response.json();
        const result = Array.isArray(payload?.quoteResponse?.result) ? payload.quoteResponse.result : [];
        if (result.length > 0) {
          QUOTE_BATCH_CACHE.set(list, { data: result, ts: Date.now() });
          return result;
        }
      } catch { continue; }
    }

    return [];
  } catch {
    return [];
  }
}

// Same plain-then-crumb fallback as fetchYahooQuoteBatch, but for callers
// that need fields beyond fetchYahooQuoteBatch's default set (e.g. the
// squeeze screener needs shortPercentOfFloat/shortRatio/floatShares, which
// aren't in the default response). Confirmed directly: Yahoo's v7 quote
// endpoint now 401s ("Invalid Crumb") unconditionally, for every request,
// not just from blocked cloud IPs — so without this crumb fallback, any
// caller hitting v7/finance/quote gets zero results 100% of the time.
async function fetchYahooQuoteBatchWithFields(symbols, fields) {
  const list = symbols.map((s) => String(s || "").trim()).filter(Boolean).join(",");
  if (!list) return [];
  const fieldsQs = fields ? `&fields=${encodeURIComponent(fields)}` : "";
  for (const host of ["query1", "query2"]) {
    try {
      const url = `https://${host}.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(list)}${fieldsQs}`;
      const response = await yFetch(url, 7000);
      if (!response.ok) continue;
      const payload = await response.json();
      const result = Array.isArray(payload?.quoteResponse?.result) ? payload.quoteResponse.result : [];
      if (result.length > 0) return result;
    } catch { continue; }
  }
  for (const host of ["query1", "query2"]) {
    try {
      const url = `https://${host}.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(list)}${fieldsQs}`;
      const response = await yFetchWithCrumb(url, 8000);
      if (!response.ok) continue;
      const payload = await response.json();
      const result = Array.isArray(payload?.quoteResponse?.result) ? payload.quoteResponse.result : [];
      if (result.length > 0) return result;
    } catch { continue; }
  }
  return [];
}

// Same job as fetchYahooQuoteBatch (raw Yahoo v7 quote objects — symbol,
// regularMarketPrice, regularMarketChangePercent, fiftyDayAverage, etc.) but
// falls back to Alpaca snapshots, reshaped onto the same field names, when
// Yahoo returns nothing (e.g. IP-blocked from Render). Alpaca's snapshot has
// no MA50/MA200/52-week fields, so those come back absent on the fallback
// path — strictly better than the zero rows callers got before, and callers
// that already tolerate missing MA/52w data (via `|| 0` guards) keep working.
async function fetchQuoteBatchWithFallback(symbols) {
  const primary = await fetchYahooQuoteBatch(symbols);
  if (primary.length) return primary;
  try {
    const { fetchAlpacaQuotes } = require("./alpaca-data");
    const rows = await fetchAlpacaQuotes(symbols);
    return rows.map((r) => ({
      symbol: r.symbol,
      regularMarketPrice: r.price,
      regularMarketPreviousClose: r.previousClose,
      regularMarketChange: r.previousClose ? r.price - r.previousClose : 0,
      regularMarketChangePercent: r.changesPercentage,
      regularMarketVolume: r.volume,
      regularMarketOpen: r.open,
      regularMarketDayHigh: r.dayHigh,
      regularMarketDayLow: r.dayLow,
      longName: r.name, shortName: r.name,
    }));
  } catch { return []; }
}

async function fetchYahooChartMeta(symbol) {
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d&includePrePost=false&events=div%2Csplits`;
  for (const host of ["query1", "query2"]) {
    try {
      const response = await yFetch(`https://${host}.finance.yahoo.com${path}`, 6000);
      if (!response.ok) continue;
      const payload = await response.json();
      const meta = payload?.chart?.result?.[0]?.meta;
      if (meta) return meta;
    } catch { continue; }
  }
  return null;
}

async function fetchYahooMarketCapFromSummary(symbol, price) {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,defaultKeyStatistics`;
  try {
    const response = await yFetchQuoteSummary(url, 7000);
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
        pe: Number.isFinite(Number(live?.trailingPE)) && Number(live?.trailingPE) > 0 ? round2(Number(live.trailingPE)) : 0,
        eps: Number.isFinite(Number(live?.epsTrailingTwelveMonths)) && Number(live?.epsTrailingTwelveMonths) > 0 ? round2(Number(live.epsTrailingTwelveMonths)) : 0,
        sharesOutstanding: Number.isFinite(Number(live?.sharesOutstanding)) ? Number(live.sharesOutstanding) : 0,
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

  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,summaryDetail,defaultKeyStatistics,calendarEvents,financialData,recommendationTrend`;

  function buildFallback(cap) {
    const p = Number.isFinite(livePE) ? livePE : null;
    const e = Number.isFinite(liveEPS) ? liveEPS : null;
    return {
      symbol, marketCap: cap,
      pe: p, trailingPE: p,
      eps: e, epsTrailingTwelveMonths: e, epsForward: null,
      sharesOutstanding: Number.isFinite(liveShares) ? liveShares : null,
      earningsDate: liveEarningsTs > 0 ? new Date(liveEarningsTs * 1000).toISOString() : null,
      revenue: null, revenueGrowth: null, earningsGrowth: null,
      grossMargin: null, profitMargin: null,
      roe: null, debtToEquity: null, freeCashflow: null, totalCash: null,
      analystTarget: null, targetMeanPrice: null, priceToSales: null,
      dividendYield: null, beta: null, pegRatio: null, priceToBook: null,
      recommendationKey: null, recommendationMean: null, numberOfAnalystOpinions: null,
    };
  }

  try {
    const response = await yFetchQuoteSummary(url, 10000);
    if (!response.ok) {
      const cap = Number.isFinite(liveMarketCap) && liveMarketCap > 0
        ? liveMarketCap
        : (Number.isFinite(liveShares) && liveShares > 0 && Number.isFinite(livePrice) && livePrice > 0 ? liveShares * livePrice : 0);
      return buildFallback(cap);
    }
    const payload = await response.json();
    const result = payload?.quoteSummary?.result?.[0] || {};
    const price = result?.price || {};
    const summary = result?.summaryDetail || {};
    const stats = result?.defaultKeyStatistics || {};
    const financial = result?.financialData || {};
    const recTrend = result?.recommendationTrend?.trend?.[0] || {}; // most recent period
    const earningsRaw = result?.calendarEvents?.earnings?.earningsDate || [];
    const earningsTs = Array.isArray(earningsRaw) && earningsRaw.length ? Number(earningsRaw[0]?.raw || 0) : 0;

    const marketCap = Number(price?.marketCap?.raw || liveMarketCap || 0);
    const pe = Number(summary?.trailingPE?.raw ?? financial?.forwardPE?.raw ?? livePE);
    const eps = Number(stats?.trailingEps?.raw ?? stats?.forwardEps?.raw ?? liveEPS);
    const sharesOutstanding = Number(stats?.sharesOutstanding?.raw || liveShares || 0);

    const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };

    return {
      symbol,
      marketCap: Number.isFinite(marketCap) && marketCap > 0
        ? marketCap
        : (sharesOutstanding > 0 && livePrice > 0 ? sharesOutstanding * livePrice : 0),
      // PE aliases so UI can use either name
      pe:            Number.isFinite(pe) ? pe : null,
      trailingPE:    Number.isFinite(pe) ? pe : null,
      eps:           Number.isFinite(eps) ? eps : null,
      epsTrailingTwelveMonths: Number.isFinite(eps) ? eps : null,
      epsForward:    n(stats?.forwardEps?.raw),
      sharesOutstanding: Number.isFinite(sharesOutstanding) ? sharesOutstanding : null,
      earningsDate: earningsTs > 0
        ? new Date(earningsTs * 1000).toISOString()
        : (liveEarningsTs > 0 ? new Date(liveEarningsTs * 1000).toISOString() : null),
      // Income & growth
      revenue:       n(financial?.totalRevenue?.raw),
      revenueGrowth: n(financial?.revenueGrowth?.raw),
      earningsGrowth: n(financial?.earningsGrowth?.raw),
      grossMargin:   n(financial?.grossMargins?.raw),
      profitMargin:  n(financial?.profitMargins?.raw),
      // Efficiency & leverage
      roe:           n(financial?.returnOnEquity?.raw),
      debtToEquity:  n(financial?.debtToEquity?.raw),
      freeCashflow:  n(financial?.freeCashflow?.raw),
      totalCash:     n(financial?.totalCash?.raw),
      // Valuation
      analystTarget: n(financial?.targetMeanPrice?.raw),
      targetMeanPrice: n(financial?.targetMeanPrice?.raw),
      priceToSales:  n(summary?.priceToSalesTrailing12Months?.raw),
      dividendYield: n(summary?.dividendYield?.raw),
      beta:          n(summary?.beta?.raw),
      pegRatio:      n(stats?.pegRatio?.raw),
      priceToBook:   n(stats?.priceToBook?.raw),
      // Analyst consensus — pull from financialData + live quote for best coverage
      recommendationKey: financial?.recommendationKey || null,
      recommendationMean: n(financial?.recommendationMean?.raw),
      numberOfAnalystOpinions: n(financial?.numberOfAnalystOpinions?.raw) ?? n(live?.numberOfAnalystOpinions),
      analystTarget:     n(financial?.targetMeanPrice?.raw) ?? n(live?.targetMeanPrice),
      targetMeanPrice:   n(financial?.targetMeanPrice?.raw) ?? n(live?.targetMeanPrice),
      targetHighPrice:   n(financial?.targetHighPrice?.raw) ?? n(live?.targetHighPrice),
      targetLowPrice:    n(financial?.targetLowPrice?.raw)  ?? n(live?.targetLowPrice),
      // Recommendation trend breakdown for the bar chart
      analystStrongBuy:  Number(recTrend?.strongBuy  || 0) || null,
      analystBuy:        Number(recTrend?.buy        || 0) || null,
      analystHold:       Number(recTrend?.hold       || 0) || null,
      analystSell:       Number(recTrend?.sell        || 0) || null,
      analystStrongSell: Number(recTrend?.strongSell || 0) || null,
    };
  } catch {
    const cap = Number.isFinite(liveMarketCap) && liveMarketCap > 0
      ? liveMarketCap
      : (Number.isFinite(liveShares) && liveShares > 0 && Number.isFinite(livePrice) && livePrice > 0 ? liveShares * livePrice : 0);
    return buildFallback(cap);
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

// ── Short interest data ───────────────────────────────────────────────────────
async function fetchYahooShortInterest(symbol) {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=defaultKeyStatistics,summaryDetail`;
  try {
    const res = await yFetchQuoteSummary(url, 8000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const stats = payload?.quoteSummary?.result?.[0]?.defaultKeyStatistics || {};
    const summary = payload?.quoteSummary?.result?.[0]?.summaryDetail || {};
    const shortFloat  = Number(stats?.shortPercentOfFloat?.raw ?? summary?.shortPercentOfFloat?.raw ?? null);
    const shortRatio  = Number(stats?.shortRatio?.raw ?? null);
    const sharesShort = Number(stats?.sharesShort?.raw ?? null);
    const sharesShortPrior = Number(stats?.sharesShortPriorMonth?.raw ?? null);
    const dateShort   = stats?.dateShortInterest?.fmt || null;
    const float       = Number(stats?.floatShares?.raw ?? null);
    return {
      symbol: symbol.toUpperCase(),
      shortFloat:       Number.isFinite(shortFloat)  ? round2(shortFloat * 100)  : null, // as percent
      shortRatio:       Number.isFinite(shortRatio)  ? round2(shortRatio)        : null, // days to cover
      sharesShort:      Number.isFinite(sharesShort) ? sharesShort              : null,
      sharesShortPrior: Number.isFinite(sharesShortPrior) ? sharesShortPrior   : null,
      floatShares:      Number.isFinite(float)       ? float                    : null,
      dateShortInterest: dateShort,
    };
  } catch {
    return { symbol: symbol.toUpperCase(), shortFloat: null, shortRatio: null, sharesShort: null, sharesShortPrior: null, floatShares: null, dateShortInterest: null };
  }
}

// ── Insider transactions (Form 4 via Yahoo) ───────────────────────────────────
async function fetchYahooInsiderTransactions(symbol) {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=insiderTransactions,insiderHolders`;
  try {
    const res = await yFetchQuoteSummary(url, 10000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const r = payload?.quoteSummary?.result?.[0] || {};
    const txns   = (r?.insiderTransactions?.transactions  || []).slice(0, 20);
    const holders= (r?.insiderHolders?.holders            || []).slice(0, 10);
    return {
      symbol: symbol.toUpperCase(),
      transactions: txns.map(t => ({
        date:   t.startDate?.fmt || "",
        name:   t.filerName || "Unknown",
        role:   t.filerRelation || "",
        type:   String(t.transactionText || "").toLowerCase().includes("sale") ? "SELL" : "BUY",
        shares: Number(t.shares?.raw || 0),
        value:  Number(t.value?.raw  || 0),
        text:   t.transactionText || "",
      })),
      holders: holders.map(h => ({
        name:   h.name || "",
        shares: Number(h.shares?.raw || 0),
        value:  Number(h.value?.raw  || 0),
        date:   h.latestTransDate?.fmt || "",
        relation: h.relation || "",
        desc:   h.transactionDescription || "",
      })),
    };
  } catch {
    return { symbol: symbol.toUpperCase(), transactions: [], holders: [] };
  }
}

// ── Institutional ownership / 13F-style ──────────────────────────────────────
async function fetchYahooInstitutional(symbol) {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=institutionalOwnership,majorHoldersBreakdown,fundOwnership`;
  try {
    const res = await yFetchQuoteSummary(url, 10000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const r = payload?.quoteSummary?.result?.[0] || {};
    const instList = (r?.institutionalOwnership?.ownershipList || []).slice(0, 25);
    const fundList = (r?.fundOwnership?.ownershipList          || []).slice(0, 10);
    const bkdn     = r?.majorHoldersBreakdown || {};
    return {
      symbol: symbol.toUpperCase(),
      insidersPct:      round2(Number(bkdn.insidersPercentHeld?.raw || 0) * 100),
      institutionsPct:  round2(Number(bkdn.institutionsPercentHeld?.raw || 0) * 100),
      institutions: instList.map(o => ({
        name:      o.organization || "",
        date:      o.reportDate?.fmt || "",
        shares:    Number(o.position?.raw || 0),
        change:    Number(o.change?.raw   || 0),
        pctHeld:   round2(Number(o.pctHeld?.raw || 0) * 100),
        value:     Number(o.value?.raw    || 0),
      })),
      funds: fundList.map(f => ({
        name:   f.organization || "",
        date:   f.reportDate?.fmt || "",
        shares: Number(f.position?.raw || 0),
        pctHeld: round2(Number(f.pctHeld?.raw || 0) * 100),
      })),
    };
  } catch {
    return { symbol: symbol.toUpperCase(), insidersPct: 0, institutionsPct: 0, institutions: [], funds: [] };
  }
}

// ── Analyst ratings ───────────────────────────────────────────────────────────
async function fetchYahooAnalystRatings(symbol) {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=upgradeDowngradeHistory,recommendationTrend,financialData`;
  try {
    const res = await yFetchQuoteSummary(url, 10000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const r = payload?.quoteSummary?.result?.[0] || {};
    const history = (r?.upgradeDowngradeHistory?.history || []).slice(0, 20);
    const trend   = (r?.recommendationTrend?.trend       || []).slice(0, 4);
    const fd      = r?.financialData || {};
    return {
      symbol: symbol.toUpperCase(),
      targetLow:    Number(fd.targetLowPrice?.raw    || 0),
      targetMean:   Number(fd.targetMeanPrice?.raw   || 0),
      targetHigh:   Number(fd.targetHighPrice?.raw   || 0),
      currentPrice: Number(fd.currentPrice?.raw      || 0),
      recommendation: fd.recommendationKey || "",
      numAnalysts:  Number(fd.numberOfAnalystOpinions?.raw || 0),
      history: history.map(h => ({
        date:      h.epochGradeDate ? new Date(h.epochGradeDate * 1000).toISOString().slice(0, 10) : "",
        firm:      h.firm || "",
        action:    h.action || "",   // main, up, down, reit
        fromGrade: h.fromGrade || "",
        toGrade:   h.toGrade || "",
      })),
      trend: trend.map(t => ({
        period:     t.period || "",
        strongBuy:  Number(t.strongBuy  || 0),
        buy:        Number(t.buy        || 0),
        hold:       Number(t.hold       || 0),
        sell:       Number(t.sell       || 0),
        strongSell: Number(t.strongSell || 0),
      })),
    };
  } catch {
    return { symbol: symbol.toUpperCase(), history: [], trend: [], targetMean: 0, targetLow: 0, targetHigh: 0, currentPrice: 0, recommendation: "", numAnalysts: 0 };
  }
}

// ── Dividend & split calendar ─────────────────────────────────────────────────
async function fetchYahooDividendInfo(symbol) {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents,summaryDetail`;
  try {
    const res = await yFetchQuoteSummary(url, 8000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const r   = payload?.quoteSummary?.result?.[0] || {};
    const cal = r?.calendarEvents    || {};
    const sd  = r?.summaryDetail     || {};
    return {
      symbol:           symbol.toUpperCase(),
      exDividendDate:   cal.exDividendDate?.fmt  || null,
      dividendDate:     cal.dividendDate?.fmt    || null,
      dividendRate:     round2(Number(sd.dividendRate?.raw   || 0)),
      dividendYield:    round2(Number(sd.dividendYield?.raw  || 0) * 100),
      payoutRatio:      round2(Number(sd.payoutRatio?.raw    || 0) * 100),
      fiveYearAvgYield: round2(Number(sd.fiveYearAvgDividendYield?.raw || 0)),
      lastSplitFactor:  sd.lastSplitFactor || null,
      lastSplitDate:    sd.lastSplitDate?.fmt || null,
    };
  } catch {
    return { symbol: symbol.toUpperCase(), exDividendDate: null, dividendDate: null, dividendRate: 0, dividendYield: 0, payoutRatio: 0, lastSplitFactor: null, lastSplitDate: null };
  }
}

// ── StockTwits social sentiment ───────────────────────────────────────────────
async function fetchStockTwitsSentiment(symbol) {
  const url = `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(symbol)}.json`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const messages = data?.messages || [];
    const bullCount = messages.filter(m => m.entities?.sentiment?.basic === "Bullish").length;
    const bearCount = messages.filter(m => m.entities?.sentiment?.basic === "Bearish").length;
    const total = messages.length;
    // Most StockTwits posts carry no explicit Bullish/Bearish tag (confirmed
    // live: a real TSLA pull had 30 total messages but only 13 tagged) — the
    // previous bullPct = bullCount/total silently treated every untagged/
    // neutral post as bearish once the frontend computed bearPct = 100 -
    // bullPct, badly overstating bear sentiment on every query with any
    // untagged posts, not just an edge case. bullPct is now a share of
    // OPINIONATED posts only; null (not a fabricated 50) when there are none.
    const opinionated = bullCount + bearCount;
    return {
      symbol: symbol.toUpperCase(),
      bullCount, bearCount, total,
      bullPct: opinionated > 0 ? Math.round(bullCount / opinionated * 100) : null,
      messages: messages.slice(0, 15).map(m => ({
        body:      String(m.body  || "").slice(0, 200),
        sentiment: m.entities?.sentiment?.basic || "Neutral",
        date:      m.created_at || "",
        user:      m.user?.username || "anon",
        likes:     m.likes?.total  || 0,
      })),
    };
  } catch {
    return { symbol: symbol.toUpperCase(), bullCount: 0, bearCount: 0, total: 0, bullPct: null, messages: [] };
  }
}

// Annual earnings history (revenue + earnings) plus forward EPS estimate from
// earningsTrend. Returns { annual: [{ year, revenue, eps, estimate }] } or null.
// NOTE: Yahoo is IP-blocked from some cloud hosts (e.g. Render) — used as a local
// / non-blocked fallback only.
async function fetchYahooEarnings(symbol) {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=earnings,earningsTrend`;
  try {
    const r = await yFetchQuoteSummary(url, 10000);
    if (!r.ok) return null;
    const j = await r.json();
    const result = j?.quoteSummary?.result?.[0] || {};
    const yearly = result?.earnings?.financialsChart?.yearly || [];
    const byYear = new Map();
    for (const y of yearly) {
      const year = Number(y?.date);
      if (!year) continue;
      byYear.set(year, { year, revenue: Number(y?.revenue?.raw) || null, eps: null, estimate: false });
    }
    // Forward EPS estimate: earningsTrend "+1y" period.
    const trend = (result?.earningsTrend?.trend || []).find(t => t?.period === "+1y");
    const fwdEps = Number(trend?.earningsEstimate?.avg?.raw);
    if (Number.isFinite(fwdEps)) {
      const nextYear = new Date().getFullYear() + 1;
      byYear.set(nextYear, { year: nextYear, revenue: null, eps: fwdEps, estimate: true });
    }
    const annual = [...byYear.values()].filter(x => x.revenue || x.eps).sort((a, b) => a.year - b.year).slice(-6);
    return annual.length ? { annual } : null;
  } catch { return null; }
}

module.exports = {
  fetchYahooEarnings,
  fetchYahooBars, fetchYahooQuoteBatch, fetchYahooQuotes, fetchQuoteBatchWithFallback,
  fetchYahooQuoteBatchWithFields,
  fetchYahooNews, fetchYahooRssNews,
  fetchYahooFundamentals, fetchYahooCandlesWithIndicators,
  fetchYahooOptionsFlowForSymbol, fetchEstimatedOptionsFlow,
  fetchYahooMarketCapFromSummary, fetchYahooChartMeta,
  resolveMarketCap, MARKET_CAP_CACHE,
  fetchYahooShortInterest,
  fetchYahooInsiderTransactions, fetchYahooInstitutional,
  fetchYahooAnalystRatings, fetchYahooDividendInfo,
  fetchStockTwitsSentiment,
};
