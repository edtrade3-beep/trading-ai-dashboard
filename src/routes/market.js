const { writeJson, readRequestBody, withTimeout, round2, average, trimText } = require("../utils");
const { callAnthropicApi, MODELS, anthropicRequest } = require("../anthropic");
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
      priceAvg50:  round2(Number(live?.fiftyDayAverage) || 0),
      priceAvg200: round2(Number(live?.twoHundredDayAverage) || 0),
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

// ── Minervini Trend Template (8 public criteria from "Trade Like a Stock Market Wizard") ──
function ttSmaAt(values, period, endIdx) {
  if (endIdx == null) endIdx = values.length - 1;
  if (endIdx - period + 1 < 0) return null;
  let sum = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i += 1) sum += values[i];
  return sum / period;
}

function ttSmaSeries(values, period) {
  return values.map((_, i) => ttSmaAt(values, period, i));
}

// IBD-style weighted momentum: most recent quarter double-weighted.
function ttWeightedMomentum(closes) {
  const last = closes.length - 1;
  const perf = (back) => {
    const idx = last - back;
    if (idx < 0 || !closes[idx]) return 0;
    return closes[last] / closes[idx] - 1;
  };
  return 0.4 * perf(63) + 0.2 * perf(126) + 0.2 * perf(189) + 0.2 * perf(252);
}

// ── Deep VCP analysis (Volatility Contraction Pattern, Minervini) ──
// Isolates the most recent base, counts contractions (the "T" footprint),
// checks progressive tightening + volume dry-up, and grades base quality.
function analyzeVCP(bars) {
  const n = bars.length, last = n - 1;
  if (n < 30) return null;
  const highs = bars.map((b) => b.high), lows = bars.map((b) => b.low), vols = bars.map((b) => b.volume || 0);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const W = 2;
  const start = Math.max(W, last - 65); // ~13 weeks of base history

  // Detect swing highs/lows (fractals).
  const pts = [];
  for (let i = start; i <= last - W; i += 1) {
    let isH = true, isL = true;
    for (let j = i - W; j <= i + W; j += 1) {
      if (j === i) continue;
      if (highs[j] >= highs[i]) isH = false;
      if (lows[j] <= lows[i]) isL = false;
    }
    if (isH) pts.push({ i, price: highs[i], type: "H" });
    else if (isL) pts.push({ i, price: lows[i], type: "L" });
  }
  // Collapse consecutive same-type swings, keeping the extreme.
  const seq = [];
  for (const p of pts) {
    const prev = seq[seq.length - 1];
    if (prev && prev.type === p.type) {
      if ((p.type === "H" && p.price > prev.price) || (p.type === "L" && p.price < prev.price)) seq[seq.length - 1] = p;
    } else seq.push(p);
  }
  // Base begins at the highest swing high (left side of the consolidation).
  let startIdx = 0, maxH = -Infinity;
  for (let k = 0; k < seq.length; k += 1) if (seq[k].type === "H" && seq[k].price > maxH) { maxH = seq[k].price; startIdx = k; }
  const base = seq.slice(startIdx);
  if (base.length < 2) return null;

  // Each high→low leg is one contraction.
  const contractions = [];
  for (let k = 0; k < base.length - 1; k += 1) {
    if (base[k].type === "H" && base[k + 1].type === "L") {
      const depth = (base[k].price - base[k + 1].price) / base[k].price * 100;
      if (depth > 0.5) contractions.push({
        depth: round2(depth), high: round2(base[k].price), low: round2(base[k + 1].price),
        highIdx: base[k].i, lowIdx: base[k + 1].i,
      });
    }
  }
  if (!contractions.length) return null;
  const depths = contractions.map((c) => c.depth);
  const baseHigh = Math.max(...base.filter((p) => p.type === "H").map((p) => p.price));
  const baseLow = Math.min(...base.filter((p) => p.type === "L").map((p) => p.price));
  const baseDepth = round2((baseHigh - baseLow) / baseHigh * 100);
  const baseStartI = base[0].i;
  const weeks = round2((last - baseStartI) / 5);
  const finalDepth = depths[depths.length - 1];

  let tighterSteps = 0;
  for (let k = 1; k < depths.length; k += 1) if (depths[k] <= depths[k - 1] + 0.5) tighterSteps += 1;
  const tightening = depths.length >= 2 && depths[depths.length - 1] < depths[0];

  // Volume should dry up into the apex: 2nd half of base vs 1st half.
  const halfLen = Math.max(1, Math.floor((last - baseStartI) / 2));
  const firstHalfVol = mean(vols.slice(baseStartI, baseStartI + halfLen + 1));
  const secondHalfVol = mean(vols.slice(last - halfLen, last + 1));
  const volTrend = firstHalfVol ? round2(secondHalfVol / firstHalfVol) : null; // <1 = drying up

  // Quality score 0–100.
  const cc = depths.length;
  let q = (cc >= 2 && cc <= 4) ? 25 : cc === 1 ? 8 : cc === 5 ? 15 : 5;
  q += depths.length >= 2 ? Math.round(30 * (tighterSteps / (depths.length - 1))) : 0;
  q += finalDepth < 5 ? 25 : finalDepth < 8 ? 18 : finalDepth < 12 ? 10 : 3;
  q += volTrend == null ? 5 : volTrend < 0.8 ? 20 : volTrend < 1 ? 12 : volTrend < 1.2 ? 5 : 0;
  q = Math.min(100, q);
  const grade = q >= 80 ? "A" : q >= 65 ? "B" : q >= 50 ? "C" : "D";

  return {
    footprint: cc + "T", count: cc, contractions, depths,
    baseHigh: round2(baseHigh), baseLow: round2(baseLow), baseDepth, weeks,
    tightening, tighterSteps, finalDepth: round2(finalDepth), volTrend,
    quality: q, grade,
    points: base.map((p) => ({ i: p.i, price: round2(p.price), type: p.type })),
  };
}

// ── VCP Breakout Engine (deterministic) ──
// Extends analyzeVCP output with pivot/proximity/breakout/volume/state machine.
// Does NOT modify VCP detection or grading.
function vcpBreakoutEngine(symbol, bars, vcp, price) {
  const n = bars.length, last = n - 1;
  const highs = bars.map((b) => b.high), vols = bars.map((b) => b.volume || 0), closes = bars.map((b) => b.close);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

  const out = {
    symbol,
    vcpGrade: vcp ? vcp.grade : "-",
    tCount: vcp ? vcp.footprint : "-",
    baseDepth: vcp ? vcp.baseDepth : 0,
    pivot: { price: 0, distancePct: 0, valid: false },
    state: "WATCH",
    volume: { dryUpScore: 0, breakoutRatio: 0, grade: "weak" },
    signal: "NONE",
    confidence: 0,
  };
  if (!vcp || !vcp.contractions || !vcp.contractions.length) return out;

  // 1. Pivot = highest high of the FINAL contraction leg (inside final base only).
  const finalC = vcp.contractions[vcp.contractions.length - 1];
  let pivot = 0;
  for (let i = finalC.highIdx; i <= last; i += 1) pivot = Math.max(pivot, highs[i]);
  const gradeValid = ["A", "B", "C"].includes(vcp.grade);
  out.pivot.price = round2(pivot);
  out.pivot.valid = gradeValid;
  const distancePct = round2((pivot - price) / pivot * 100); // + = price below pivot
  out.pivot.distancePct = distancePct;

  // dry-up score derived from existing volTrend (grading untouched)
  const vt = vcp.volTrend == null ? 1 : vcp.volTrend;
  out.volume.dryUpScore = Math.round(Math.max(0, Math.min(100, (1 - vt) * 100 + 50)));

  // 4. Volume expansion model
  const avg20 = mean(vols.slice(Math.max(0, last - 19), last + 1));
  const baseStart = vcp.points && vcp.points.length ? vcp.points[0].i : Math.max(0, last - 40);
  const baseVolumeAvg = mean(vols.slice(baseStart, last + 1)) || 1;
  const legVols = vcp.contractions.slice(-3).map((c) => mean(vols.slice(c.highIdx, c.lowIdx + 1)));
  const maxLegVol = legVols.length ? Math.max(...legVols) : 0;

  // 3. Breakout detection — most recent close that crosses above pivot inside the base.
  let breakoutIdx = -1;
  for (let i = Math.max(baseStart + 1, 1); i <= last; i += 1) {
    if (closes[i] > pivot && closes[i - 1] <= pivot) breakoutIdx = i;
  }
  const breakoutVolume = vols[breakoutIdx >= 0 ? breakoutIdx : last];
  const breakoutRatio = round2(breakoutVolume / baseVolumeAvg);
  out.volume.breakoutRatio = breakoutRatio;
  out.volume.grade = breakoutRatio >= 2 ? "A+" : breakoutRatio >= 1.5 ? "valid" : "weak";
  // Strict volume condition: > 1.5× the 20-day avg AND > the heaviest of the last 3 legs.
  const volStrict = breakoutVolume > avg20 * 1.5 && breakoutVolume > maxLegVol;

  if (!gradeValid) {
    out.confidence = Math.round((vcp.quality || 0) * 0.5);
    return out; // base too weak — stays WATCH / NONE
  }

  // 5. Trade state machine
  let state, signal = "NONE";
  if (breakoutIdx >= 0) {
    const end = Math.min(breakoutIdx + 5, last);
    let failedWithin5 = false;
    for (let i = breakoutIdx + 1; i <= end; i += 1) if (closes[i] < pivot) { failedWithin5 = true; break; }
    const currentlyAbove = closes[last] > pivot;
    if (failedWithin5 || !currentlyAbove) { state = "FAILED"; signal = "FAILURE"; }
    else if (volStrict && breakoutRatio >= 1.5) { state = "CONFIRMED"; signal = "BREAKOUT"; }
    else { state = "BREAKOUT_ACTIVE"; signal = "NONE"; }
  } else if (distancePct <= 8 && distancePct >= -2) {
    state = "SETUP_READY";
    if (["A", "B"].includes(vcp.grade)) signal = "SETUP";
  } else {
    state = "WATCH"; // base exists but price not near pivot (≤15% or beyond)
  }
  out.state = state;
  out.signal = signal;

  // 7. Confidence (deterministic)
  let conf = vcp.quality || 0;
  if (state === "SETUP_READY") conf = Math.round(conf * 0.9);
  else if (state === "BREAKOUT_ACTIVE") conf = Math.round(conf * 0.95);
  else if (state === "CONFIRMED") conf = conf + 10 + (breakoutRatio >= 2 ? 10 : 0);
  else if (state === "FAILED") conf = Math.round(conf * 0.3);
  else conf = Math.round(conf * 0.7); // WATCH
  out.confidence = Math.max(0, Math.min(100, conf));
  return out;
}

function atrAt(bars, period, endIdx) {
  if (endIdx - period < 0) return null;
  let sum = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i += 1) {
    const tr = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close));
    sum += tr;
  }
  return sum / period;
}

// ── VCP Report (deterministic, weighted 0–100 rubric + structured verdict) ──
// Separate from analyzeVCP grading — this scores Trend(20)/Contraction(30)/
// Volatility(20)/Volume(20)/Breakout(10) and produces the formatted report.
function vcpReport(symbol, bars, vcp, trend, price) {
  const n = bars.length, last = n - 1;
  const closes = bars.map((b) => b.close), highs = bars.map((b) => b.high);
  const baseStart = vcp && vcp.points && vcp.points.length ? vcp.points[0].i : Math.max(0, last - 40);

  // Prior uptrend (into the base)
  const momRef = Math.max(0, baseStart - 120);
  const mom = closes[momRef] ? closes[baseStart] / closes[momRef] - 1 : 0;
  const stack = (price > trend.ma50 ? 1 : 0) + (trend.ma50 > trend.ma150 ? 1 : 0) + (trend.ma150 > trend.ma200 ? 1 : 0) + (price > trend.ma200 ? 1 : 0);
  const uptrendValid = mom > 0 && price > trend.ma200 && trend.passCount >= 5;

  // Component scores
  const cTrend = Math.min(20, (stack / 4) * 10 + (mom > 0.3 ? 10 : mom > 0.15 ? 7 : mom > 0 ? 4 : 0));

  const cc = vcp ? vcp.count : 0;
  const depths = vcp ? vcp.depths : [];
  let tighterSteps = 0;
  for (let k = 1; k < depths.length; k += 1) if (depths[k] <= depths[k - 1] + 0.5) tighterSteps += 1;
  const tightening = vcp ? vcp.tightening : false;
  const cCount = (cc >= 2 && cc <= 4) ? 15 : cc === 1 ? 5 : cc === 5 ? 9 : 4;
  const cTighten = cc >= 2 ? Math.round((tighterSteps / (cc - 1)) * 15) : 0;
  const cContraction = Math.min(30, cCount + cTighten);

  // Volatility compression via ATR(14): now vs base start
  const atrNow = atrAt(bars, 14, last), atrBase = atrAt(bars, 14, Math.min(last, baseStart + 14));
  const atrRatio = (atrNow != null && atrBase) ? atrNow / atrBase : null;
  const cVolatility = atrRatio == null ? 8 : atrRatio < 0.6 ? 20 : atrRatio < 0.75 ? 15 : atrRatio < 0.9 ? 10 : atrRatio < 1.0 ? 6 : 2;

  const vt = vcp && vcp.volTrend != null ? vcp.volTrend : 1;
  const cVolume = vt < 0.7 ? 20 : vt < 0.85 ? 15 : vt < 1.0 ? 10 : vt < 1.15 ? 5 : 2;

  // Breakout readiness (proximity to final-leg pivot)
  let pivot = 0;
  if (vcp && vcp.contractions.length) { const f = vcp.contractions[vcp.contractions.length - 1]; for (let i = f.highIdx; i <= last; i += 1) pivot = Math.max(pivot, highs[i]); }
  const dist = pivot ? (pivot - price) / pivot * 100 : 100;
  const cBreakout = dist < 0 ? 10 : dist <= 3 ? 10 : dist <= 8 ? 7 : dist <= 15 ? 4 : 1;

  const score = Math.round(cTrend + cContraction + cVolatility + cVolume + cBreakout);

  // Verdict + risk
  let verdict;
  if (!uptrendValid || cc < 2 || !tightening) verdict = "INVALID VCP";
  else if (score >= 80 && cBreakout >= 7) verdict = "A+ SETUP";
  else if (score >= 60) verdict = "WATCHLIST";
  else if (score >= 40) verdict = "WEAK SETUP";
  else verdict = "INVALID VCP";
  const riskState = (verdict === "INVALID VCP") ? "HIGH" : score >= 75 ? "LOW" : score >= 55 ? "MEDIUM" : "HIGH";

  const pct = (x) => (x >= 0 ? "+" : "") + round2(x) + "%";
  const structure = {
    trend: uptrendValid
      ? `${trend.stage}; ${stack}/4 MA stack; ${pct(mom * 100)} into the base over ~6 mo.`
      : `No clear prior uptrend (mom ${pct(mom * 100)}, ${trend.passCount}/8 template). Structure unqualified.`,
    contractions: cc
      ? `${cc} contraction${cc > 1 ? "s" : ""}: ${depths.map((d) => "-" + d + "%").join(" → ")} — ${tightening ? "progressively tightening" : "NOT progressively tightening"}.`
      : "No measurable contractions in the base.",
    volatility: atrRatio == null ? "Insufficient data for ATR." : `ATR ${atrRatio < 1 ? "contracted" : "expanded"} ${pct((atrRatio - 1) * 100)} vs base start (ratio ${round2(atrRatio)}).`,
    volume: `Volume into apex ${vt < 1 ? "drying up" : "rising"} — ratio ${round2(vt)}× vs first half of base.`,
    breakout: pivot ? `Pivot ${round2(pivot)}; price ${dist < 0 ? "above by " + pct(-dist) : pct(dist) + " below"}.` : "No pivot.",
  };
  const explanation = verdict === "INVALID VCP"
    ? (!uptrendValid ? "Rejected: no qualifying prior uptrend." : cc < 2 ? "Rejected: fewer than two contractions — no compression sequence." : !tightening ? "Rejected: contractions are not progressively tightening." : "Score too low for a tradable base.")
    : `${cc}-leg base${tightening ? ", tightening" : ""}; ATR ${atrRatio != null && atrRatio < 1 ? "compressing" : "elevated"}, volume ${vt < 1 ? "drying up" : "not drying"}; ${dist < 0 ? "above pivot" : round2(dist) + "% from pivot"}. ${verdict === "A+ SETUP" ? "Textbook structure at the buy point." : verdict === "WATCHLIST" ? "Solid base — watch for the breakout." : "Base present but quality/readiness is sub-par."}`;

  const text =
`${symbol}:
VCP SCORE (0–100): ${score}

STRUCTURE:
Trend Analysis: ${structure.trend}
Contraction Phases: ${structure.contractions}
Volatility Behavior: ${structure.volatility}
Volume Behavior: ${structure.volume}
Breakout Level: ${structure.breakout}

RISK STATE: ${riskState}

FINAL VERDICT: ${verdict}

EXPLANATION: ${explanation}`;

  return {
    score, verdict, riskState,
    components: { trend: Math.round(cTrend), contraction: Math.round(cContraction), volatility: cVolatility, volume: cVolume, breakout: cBreakout },
    structure, explanation, text,
  };
}

// ── 30-Day Market Outlook ──
// Aggregates trend/momentum/breadth/volatility/seasonality + prediction-market
// odds into a composite lean, and a volatility-based expected 30-day range.
async function fetchPolymarketOdds() {
  try {
    const data = await withTimeout(
      fetch("https://gamma-api.polymarket.com/markets?closed=false&active=true&limit=500&order=volume24hr&ascending=false")
        .then((r) => (r.ok ? r.json() : null)), 9000, null);
    if (!Array.isArray(data)) return {};
    const yesProb = (m) => { try {
      const p = JSON.parse(m.outcomePrices || "[]"), o = JSON.parse(m.outcomes || "[]");
      const yi = o.findIndex((x) => /yes/i.test(x));
      const v = Number(p[yi >= 0 ? yi : 0]);
      return Number.isFinite(v) ? v : null;
    } catch { return null; } };

    // Fed rate markets — aggregate the per-outcome Yes probabilities into hike/hold/cut.
    const fedMs = data.filter((m) => /fed|interest rate/i.test(m.question || "") && /meeting/i.test(m.question || ""));
    let fed = null;
    if (fedMs.length) {
      let hold = 0, cut = 0, hike = 0;
      for (const m of fedMs) {
        const p = yesProb(m); if (p == null) continue;
        const q = (m.question || "").toLowerCase();
        if (/no change|maintain|keep|unchanged/.test(q)) hold += p;
        else if (/decrease|cut|lower/.test(q)) cut += p;
        else if (/increase|hike|raise/.test(q)) hike += p;
      }
      const tot = hold + cut + hike;
      if (tot > 0) fed = {
        cut: Math.round(cut / tot * 100), hold: Math.round(hold / tot * 100), hike: Math.round(hike / tot * 100),
        meeting: ((fedMs[0].question || "").match(/after the (.*?) meeting/i) || [])[1] || null,
      };
    }
    const rec = data.find((m) => /recession/i.test(m.question || ""));
    return {
      fed,
      recession: rec ? { q: rec.question, prob: Math.round((yesProb(rec) || 0) * 100) } : null,
    };
  } catch { return {}; }
}

async function buildMarketOutlook() {
  const spy = await fetchYahooBars("SPY", "1y", "1d");
  if (!Array.isArray(spy) || spy.length < 60) throw new Error("SPY data unavailable.");
  const closes = spy.map((b) => b.close);
  const last = closes.length - 1, price = closes[last];

  const sma = (arr, p, end) => { if (end - p + 1 < 0) return null; let s = 0; for (let i = end - p + 1; i <= end; i++) s += arr[i]; return s / p; };
  const ma50 = sma(closes, 50, last), ma200 = sma(closes, 200, last);
  const ret1mo = closes[last - 21] ? (price / closes[last - 21] - 1) * 100 : 0;
  const rsi = (() => { try { const { computeRSI } = require("../indicators"); const r = computeRSI(closes, 14); return Array.isArray(r) ? r[r.length - 1] : r; } catch { return 50; } })();

  // Realized volatility → expected 30-day range (1σ ≈ 68%, 2σ ≈ 95%)
  const rets = [];
  for (let i = last - 29; i <= last; i++) if (i > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const dailyVol = Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length);
  const sigma30 = dailyVol * Math.sqrt(21);
  const range = {
    expectedMovePct: round2(sigma30 * 100),
    low1: round2(price * (1 - sigma30)), high1: round2(price * (1 + sigma30)),
    low2: round2(price * (1 - 2 * sigma30)), high2: round2(price * (1 + 2 * sigma30)),
  };

  // VIX
  let vix = null, vixTrend = 0;
  try { const v = await fetchYahooBars("^VIX", "1mo", "1d"); if (v && v.length) { vix = round2(v[v.length - 1].close); vixTrend = round2(v[v.length - 1].close - v[0].close); } } catch {}

  // Breadth proxy — % of major index ETFs above their 50-day MA
  let breadthPct = null;
  try {
    const etfs = ["SPY", "QQQ", "IWM", "RSP", "MDY"];
    const res = await Promise.all(etfs.map((s) => fetchYahooBars(s, "6mo", "1d").catch(() => null)));
    const above = res.filter((bars) => { if (!bars || bars.length < 50) return false; const c = bars.map((b) => b.close); const m = sma(c, 50, c.length - 1); return c[c.length - 1] > m; }).length;
    breadthPct = Math.round(above / etfs.length * 100);
  } catch {}

  // Seasonality — average SPY return for the current calendar month (multi-year)
  let seasonality = null;
  try {
    const m = await fetchYahooBars("SPY", "5y", "1mo");
    if (m && m.length > 13) {
      const curMonth = new Date().getMonth();
      const rs = [];
      for (let i = 1; i < m.length; i++) if (new Date(m[i].time).getMonth() === curMonth) rs.push(m[i].close / m[i - 1].close - 1);
      if (rs.length) seasonality = round2(rs.reduce((a, b) => a + b, 0) / rs.length * 100);
    }
  } catch {}

  const odds = await fetchPolymarketOdds();

  // ── Composite lean (signed sub-scores, weighted) ──
  const signals = [];
  const add = (name, val, detail) => signals.push({ name, score: round2(val), detail });
  add("Trend", ma50 && ma200 ? (price > ma50 && ma50 > ma200 ? 25 : price < ma50 && ma50 < ma200 ? -25 : price > ma200 ? 8 : -8) : 0,
    ma50 && ma200 ? `SPY ${price > ma50 ? "above" : "below"} 50DMA, 50 ${ma50 > ma200 ? ">" : "<"} 200` : "n/a");
  add("Momentum", Math.max(-20, Math.min(20, ret1mo * 2)) * 0.5 + (rsi > 55 ? 8 : rsi < 45 ? -8 : 0) + (rsi > 78 ? -4 : 0),
    `1mo ${ret1mo >= 0 ? "+" : ""}${round2(ret1mo)}%, RSI ${Math.round(rsi)}`);
  add("Breadth", breadthPct == null ? 0 : breadthPct >= 60 ? 15 : breadthPct <= 40 ? -15 : (breadthPct - 50) * 0.6, breadthPct == null ? "n/a" : `${breadthPct}% of index ETFs > 50DMA`);
  add("Volatility", vix == null ? 0 : (vix < 15 ? 12 : vix < 18 ? 4 : vix < 22 ? -4 : vix < 28 ? -12 : -18) + (vixTrend > 2 ? -4 : vixTrend < -2 ? 4 : 0), vix == null ? "n/a" : `VIX ${vix}${vixTrend >= 0 ? " +" : " "}${vixTrend}`);
  add("Seasonality", seasonality == null ? 0 : Math.max(-8, Math.min(8, seasonality * 4)), seasonality == null ? "n/a" : `${new Date().toLocaleString("en-US", { month: "long" })} avg ${seasonality >= 0 ? "+" : ""}${seasonality}%`);
  if (odds.recession && odds.recession.prob != null) add("Recession odds", Math.max(-12, -(odds.recession.prob - 25) * 0.3), `${odds.recession.prob}% (Polymarket)`);
  if (odds.fed) add("Fed cut odds", Math.min(8, odds.fed.cut * 0.08) - (odds.fed.hike > 30 ? 6 : 0), `cut ${odds.fed.cut}% · hold ${odds.fed.hold}% · hike ${odds.fed.hike}% (Polymarket)`);

  const composite = round2(signals.reduce((a, s) => a + s.score, 0));
  const lean = composite >= 20 ? "BULLISH" : composite <= -20 ? "BEARISH" : "NEUTRAL";
  const confidence = Math.min(100, Math.round(Math.abs(composite) / 60 * 100));

  return {
    asOf: new Date().toISOString(),
    spy: round2(price), lean, composite, confidence,
    range, vix, breadthPct, seasonality,
    predictionMarkets: odds,
    signals,
    note: "Weighted read of current conditions + a volatility-based probabilistic range — not a prediction or advice.",
  };
}

async function buildTrendTemplate(symbol, opts = {}) {
  const bars = await fetchYahooBars(symbol, "1y", "1d");
  if (!Array.isArray(bars) || bars.length < 200) {
    throw new Error(`Not enough history for ${symbol} (need ~200 trading days, got ${bars ? bars.length : 0}).`);
  }
  const closes = bars.map((b) => b.close);
  const last = closes.length - 1;
  const price = closes[last];

  const ma50 = ttSmaAt(closes, 50, last);
  const ma150 = ttSmaAt(closes, 150, last);
  const ma200 = ttSmaAt(closes, 200, last);
  const ma200Prev = ttSmaAt(closes, 200, last - 22); // ~1 month ago

  const hi52 = Math.max(...bars.map((b) => b.high));
  const lo52 = Math.min(...bars.map((b) => b.low));
  const pctFromHigh = round2((price / hi52 - 1) * 100);
  const pctFromLow = round2((price / lo52 - 1) * 100);

  // Relative Strength vs SPY. In a screen, screenTrendTemplate overwrites rsRating with a true
  // cross-universe percentile; the standalone value here stays an approximation vs SPY.
  let rsRating = null, momentum = null;
  try {
    let spyMom = opts.spyMom;
    if (spyMom == null) {
      const spy = await fetchYahooBars("SPY", "1y", "1d");
      spyMom = ttWeightedMomentum(spy.map((b) => b.close));
    }
    momentum = ttWeightedMomentum(closes);
    rsRating = Math.max(1, Math.min(99, Math.round(50 + 50 * Math.tanh(2 * (momentum - spyMom)))));
  } catch {
    rsRating = null;
  }

  const criteria = [
    { id: 1, label: "Price above 150-day & 200-day MA", pass: price > ma150 && price > ma200 },
    { id: 2, label: "150-day MA above 200-day MA", pass: ma150 > ma200 },
    { id: 3, label: "200-day MA trending up (≥1 month)", pass: ma200Prev != null && ma200 > ma200Prev },
    { id: 4, label: "50-day MA above 150-day & 200-day MA", pass: ma50 > ma150 && ma50 > ma200 },
    { id: 5, label: "Price above 50-day MA", pass: price > ma50 },
    { id: 6, label: "Price ≥30% above 52-week low", pass: price >= lo52 * 1.30 },
    { id: 7, label: "Price within 25% of 52-week high", pass: price >= hi52 * 0.75 },
    { id: 8, label: "Relative Strength rating ≥70", pass: rsRating != null && rsRating >= 70, value: rsRating },
  ];
  const passCount = criteria.filter((c) => c.pass).length;
  const trendPass = criteria.slice(0, 7).every((c) => c.pass);

  // ── Entry / Stop / Target (VCP pivot breakout, Minervini SEPA) ──
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const tail = (k) => bars.slice(Math.max(0, bars.length - k));
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const vols = bars.map((b) => b.volume || 0);

  // Pivot = resistance of the most recent base. Find swing highs (local maxima)
  // and take the resistance of the most recent consolidation, so the pivot tracks
  // the current base rather than a stale months-old peak.
  const W = 3; // bars on each side for a swing high
  const swingHighs = [];
  for (let i = Math.max(W, last - 50); i <= last - W; i += 1) {
    let isHigh = true;
    for (let j = i - W; j <= i + W; j += 1) { if (highs[j] > highs[i]) { isHigh = false; break; } }
    if (isHigh) swingHighs.push({ i, h: highs[i] });
  }
  let pivot;
  const recentSwings = swingHighs.filter((s) => s.i >= last - 25); // recent base resistance
  if (recentSwings.length) pivot = Math.max(...recentSwings.map((s) => s.h));
  else if (swingHighs.length) pivot = swingHighs[swingHighs.length - 1].h;
  else pivot = Math.max(...highs.slice(Math.max(0, last - 20)));
  // If the latest bar is poking to a fresh high, the pivot is the prior swing it cleared.
  if (price > pivot && recentSwings.length > 1) {
    const below = recentSwings.map((s) => s.h).filter((h) => h < price).sort((a, b) => b - a);
    if (below.length) pivot = below[0];
  }
  // Tightest recent contraction low (15 bars) — used for a tighter stop.
  const contractionLow = Math.min(...lows.slice(Math.max(0, last - 15)));

  const avgVol50 = avg(vols.slice(Math.max(0, last - 50)));
  const lastVol = vols[last];
  const volSurge = avgVol50 ? lastVol / avgVol50 : 0;

  // Volatility contraction read.
  const range10 = (Math.max(...highs.slice(last - 10)) - Math.min(...lows.slice(last - 10)));
  const tightnessPct = round2((range10 / price) * 100);
  const volDryup = avgVol50 ? round2(avg(vols.slice(last - 10)) / avgVol50) : null;

  // 21-day EMA for the faster trailing-sell rule.
  let ema21 = closes[Math.max(0, last - 21)];
  const kE = 2 / (21 + 1);
  for (let i = Math.max(1, last - 21) + 1; i <= last; i += 1) ema21 = closes[i] * kE + ema21 * (1 - kE);

  const entry = pivot; // buy trigger = break above pivot
  // Stop: tighter of −8% from entry or just under the contraction low; never above entry.
  let stop = Math.max(entry * 0.92, contractionLow * 0.995);
  if (stop >= entry) stop = entry * 0.92;
  const riskPct = round2(((entry - stop) / entry) * 100);
  const target2 = round2(entry + 2 * (entry - stop));
  const target3 = round2(entry + 3 * (entry - stop));

  const abovePivotPct = round2((price / pivot - 1) * 100);
  const breakoutConfirmed = price > pivot && volSurge >= 1.4;
  const extended = abovePivotPct > 10; // chasing risk
  // Actionable only when price is near/at the pivot (a tradable distance) — not stranded
  // far below it. This gates whether the entry/stop/target levels are live.
  const actionable = abovePivotPct >= -6 && abovePivotPct <= 10;
  let setupStatus;
  if (breakoutConfirmed) setupStatus = "Breakout — buy trigger hit";
  else if (price > pivot) setupStatus = "Above pivot — needs volume confirmation";
  else if (abovePivotPct >= -3) setupStatus = "At pivot — watch for breakout";
  else if (abovePivotPct >= -8) setupStatus = "Base forming near pivot";
  else setupStatus = "Below pivot — no actionable setup yet";

  const sellSignals = [];
  if (price < ma50) sellSignals.push("Closed below 50-day MA");
  if (price < ema21) sellSignals.push("Closed below 21-day EMA");

  // ── Deep VCP analysis ──
  const vcp = analyzeVCP(bars);
  const recentContractions = vcp ? vcp.depths.slice(-4) : [];
  const tightening = vcp ? vcp.tightening : false;

  // ── GO / WAIT / AVOID verdict ──
  let verdict, verdictReason;
  if (passCount <= 5) { verdict = "AVOID"; verdictReason = "Trend not in gear (" + passCount + "/8)"; }
  else if (breakoutConfirmed && passCount >= 7) { verdict = "GO"; verdictReason = "Breakout above pivot on volume"; }
  else if (actionable && passCount >= 7) {
    verdict = "WAIT";
    verdictReason = price > pivot ? "Above pivot — needs volume ≥1.4×" : "At pivot — wait for the breakout";
  } else if (passCount >= 6) { verdict = "WAIT"; verdictReason = abovePivotPct < -6 ? "Base building below pivot" : "Trend good — wait for pivot"; }
  else { verdict = "AVOID"; verdictReason = "No setup"; }

  const stage = trendPass && passCount === 8 ? "Stage 2 — Confirmed Uptrend"
    : trendPass ? "Stage 2 — Uptrend (RS soft)"
    : passCount >= 4 ? "Stage 1/3 — Transition"
    : "Stage 4 — Downtrend";

  const setup = {
    pivot: round2(pivot),
    entry: round2(entry),
    stop: round2(stop),
    riskPct,
    target2,
    target3,
    contractionLow: round2(contractionLow),
    tightnessPct,
    volDryup,
    volSurge: round2(volSurge),
    ema21: round2(ema21),
    abovePivotPct,
    breakoutConfirmed,
    extended,
    actionable,
    status: setupStatus,
    sellSignals,
    contractions: recentContractions,
    tightening,
    vcp,
    breakout: vcpBreakoutEngine(symbol, bars, vcp, price),
    report: vcpReport(symbol, bars, vcp, { passCount, ma50, ma150, ma200, stage, price }, price),
    verdict,
    verdictReason,
  };

  const result = {
    symbol,
    asOf: new Date(bars[last].time).toISOString(),
    price: round2(price),
    passCount,
    score: passCount,
    qualifies: passCount === 8,
    stage,
    rsRating,
    rsApprox: true,
    momentum,
    volRatio: round2(volSurge),
    ma: { ma50: round2(ma50), ma150: round2(ma150), ma200: round2(ma200) },
    hi52: round2(hi52),
    lo52: round2(lo52),
    pctFromHigh,
    pctFromLow,
    criteria,
    setup,
  };
  if (opts.light) return result;
  result.bars = bars.map((b) => ({
    time: b.time,
    open: round2(b.open),
    high: round2(b.high),
    low: round2(b.low),
    close: round2(b.close),
    volume: Math.round(b.volume || 0),
  }));
  result.series = {
    ma50: ttSmaSeries(closes, 50).map((v) => (v == null ? null : round2(v))),
    ma150: ttSmaSeries(closes, 150).map((v) => (v == null ? null : round2(v))),
    ma200: ttSmaSeries(closes, 200).map((v) => (v == null ? null : round2(v))),
  };
  return result;
}

// Scan many symbols with bounded concurrency, fetching SPY momentum just once.
async function screenTrendTemplate(symbols) {
  let spyMom = null;
  try { spyMom = ttWeightedMomentum((await fetchYahooBars("SPY", "1y", "1d")).map((b) => b.close)); } catch {}

  const out = [];
  const queue = symbols.slice();
  const worker = async () => {
    while (queue.length) {
      const sym = queue.shift();
      try {
        const r = await buildTrendTemplate(sym, { light: true, spyMom });
        const passExclRS = r.criteria.filter((c) => c.id !== 8 && c.pass).length; // template passes without the RS rule
        const volConfirmed = (r.volRatio || 0) >= 1.4;  // breakout-day volume ≥40% above the 50-day average
        out.push({
          symbol: r.symbol, price: r.price, passCount: r.passCount, qualifies: r.qualifies,
          stage: r.stage, rsRating: r.rsRating, pctFromHigh: r.pctFromHigh,
          pivot: r.setup.pivot, entry: r.setup.entry, stop: r.setup.stop, riskPct: r.setup.riskPct,
          target2: r.setup.target2, abovePivotPct: r.setup.abovePivotPct,
          breakoutConfirmed: r.setup.breakoutConfirmed, extended: r.setup.extended,
          setupStatus: r.setup.status, actionable: r.setup.actionable,
          verdict: r.setup.verdict, tightening: r.setup.tightening,
          vcpGrade: r.setup.vcp ? r.setup.vcp.grade : "-", tCount: r.setup.vcp ? r.setup.vcp.footprint : "-",
          state: r.setup.breakout.state, signal: r.setup.breakout.signal, confidence: r.setup.breakout.confidence,
          vcpScore: r.setup.report.score, vcpVerdict: r.setup.report.verdict, riskState: r.setup.report.riskState,
          momentum: r.momentum, volRatio: r.volRatio, volConfirmed,
          _passExclRS: passExclRS,
          atBuyPoint: r.passCount >= 7 && r.setup.actionable && !r.setup.extended,
        });
      } catch (err) {
        out.push({ symbol: sym, error: err instanceof Error ? err.message : "failed" });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, symbols.length) }, worker));

  // ── Real RS rating: percentile-rank each name's weighted momentum across the screened universe (1–99). ──
  const scored = out.filter((x) => !x.error && x.momentum != null);
  const moms = scored.map((x) => x.momentum).sort((a, b) => a - b);
  const pctile = (m) => {
    if (moms.length < 2) return 50;
    let below = 0; for (const v of moms) { if (v < m) below++; }
    return Math.max(1, Math.min(99, Math.round((below / (moms.length - 1)) * 100)));
  };
  for (const x of scored) {
    x.rsRating = pctile(x.momentum);            // overwrite SPY-approx with a true percentile
    x.rsApprox = false;
    const rsPass = x.rsRating >= 70;            // Minervini RS rule, now percentile-based
    x.passCount = x._passExclRS + (rsPass ? 1 : 0);
    x.qualifies = x.passCount === 8;
    // Buy point now requires a volume-confirmed breakout — no more low-volume fakeouts.
    x.atBuyPoint = x.passCount >= 7 && x.actionable && !x.extended && x.volConfirmed;
    delete x._passExclRS; delete x.momentum;
  }

  // ── Fundamentals overlay (one batched quote call): next earnings date + EPS growth. ──
  try {
    const syms = out.filter((x) => !x.error).map((x) => x.symbol);
    const qmap = {};
    for (let i = 0; i < syms.length; i += 20) {
      const qs = await fetchYahooQuoteBatch(syms.slice(i, i + 20)).catch(() => []);
      (qs || []).forEach((q) => { qmap[String(q.symbol || "").toUpperCase()] = q; });
    }
    const now = Date.now();
    for (const x of out) {
      if (x.error) continue;
      const q = qmap[x.symbol]; if (!q) continue;
      const ts = Number((Array.isArray(q.earningsTimestamp) ? q.earningsTimestamp[0] : q.earningsTimestamp) || 0);
      x.earningsDte = ts ? Math.round((ts * 1000 - now) / 86400000) : null;
      x.earningsSoon = x.earningsDte != null && x.earningsDte >= 0 && x.earningsDte <= 10;
      const epsTTM = Number(q.epsTrailingTwelveMonths || 0), epsFwd = Number(q.epsForward || 0);
      x.epsGrowth = (epsTTM > 0 && epsFwd > 0) ? Math.round((epsFwd / epsTTM - 1) * 100) : null;
    }
  } catch { /* fundamentals are best-effort */ }

  const rank = (x) => x.error ? -1 : (x.atBuyPoint ? 1000 : 0) + x.passCount * 100 + (x.rsRating || 0);
  out.sort((a, b) => rank(b) - rank(a));
  return out;
}

async function handleMarket(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;

  if (pathname === "/api/market/trend-template" && req.method === "GET") {
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) return writeJson(res, 400, { error: "Symbol is required." });
    try {
      const payload = await buildTrendTemplate(symbol);
      return writeJson(res, 200, payload);
    } catch (err) {
      return writeJson(res, 502, { error: err instanceof Error ? err.message : "Trend Template failed." });
    }
  }

  // Market-implied Fed rate read from 30-day fed funds futures (ZQ). Implied rate = 100 − price.
  // Falling implied rate over recent weeks = market pricing CUTS; rising = HIKES.
  if (pathname === "/api/market/fedwatch" && req.method === "GET") {
    const _fw = handleMarket._fwCache || (handleMarket._fwCache = { data: null, ts: 0 });
    if (_fw.data && Date.now() - _fw.ts < 15 * 60 * 1000) return writeJson(res, 200, _fw.data);
    try {
      const bars = await fetchYahooBars("ZQ=F", "3mo", "1d");
      const closes = (bars || []).map(b => b.close).filter(v => v > 0);
      if (closes.length < 5) return writeJson(res, 200, { ok: false, error: "no futures data" });
      const last = closes[closes.length - 1];
      const ago = closes[Math.max(0, closes.length - 22)];      // ~1 month ago
      const impliedRate = round2(100 - last);
      const prevRate = round2(100 - ago);
      const delta = round2(impliedRate - prevRate);             // negative = market moved toward cuts
      const lean = delta <= -0.04 ? "CUTS" : delta >= 0.04 ? "HIKES" : "STEADY";
      // Rough probability of a 25bp move priced over the month (|delta| toward 0.25 = one cut/hike).
      const moveProb = Math.max(0, Math.min(100, Math.round(Math.abs(delta) / 0.25 * 100)));
      const payload = { ok: true, impliedRate, prevRate, delta, lean, moveProb, asOf: new Date().toISOString() };
      _fw.data = payload; _fw.ts = Date.now();
      return writeJson(res, 200, payload);
    } catch (e) { return writeJson(res, 200, { ok: false, error: e instanceof Error ? e.message : "fedwatch failed" }); }
  }

  // AI second-opinion on a Green Light setup — cheap (Haiku) + cached trader persona.
  if (pathname === "/api/market/ai-setup-review" && req.method === "POST") {
    const key = (process.env.ANTHROPIC_API_KEY || "").trim();
    if (!key) return writeJson(res, 200, { ok: false, error: "ANTHROPIC_API_KEY not set" });
    let b; try { b = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { ok: false, error: "bad json" }); }
    const s = b.setup || {};
    const sym = String(s.symbol || "").toUpperCase().replace(/[^A-Z.]/g, "").slice(0, 8);
    if (!sym) return writeJson(res, 400, { ok: false, error: "symbol required" });
    const SYSTEM = `You are a disciplined institutional swing-trader reviewing a long setup from a rules-based scanner. Be concise and honest — your job is to critique, not cheerlead. Rules you trade by: trade only A+ setups (score ≥90) in a green market regime, in strong sectors, at the buy zone (not extended); risk 1% per trade; reward:risk must be ≥2:1; cut losers fast, let winners run; when in doubt, stay in cash. Respond in 3 short parts:\nVERDICT: BUY / WAIT / PASS (one word)\nWHY: one tight sentence.\nRISKS: 1-2 specific risks to watch.\nNo preamble, no disclaimers, under 70 words total.`;
    const prompt = `Setup for ${sym}:\n- Price $${s.px} (${s.chg >= 0 ? "+" : ""}${s.chg}% today)\n- A+ Score ${s.aScore}/100 (grade ${s.grade})\n- Market regime ${s.marketScore}/100 ${s.marketPass ? "(green)" : "(not green)"}\n- Sector ${s.sector || "?"} ${s.strongSector ? "(strong)" : "(weak/unknown)"}\n- Relative strength vs SPY: ${s.relStrength}%\n- RVOL ${s.rvol}x\n- Entry $${s.bestEntry}, stop $${s.stop}, R:R ${s.rr}:1\n- At buy zone: ${s.atEntry ? "yes" : "no (extended/pullback)"}\nGive your review.`;
    try {
      const review = await callAnthropicApi(prompt, key, { model: MODELS.haiku, maxTokens: 220, system: SYSTEM, cache: true });
      return writeJson(res, 200, { ok: true, review: (review || "").trim() });
    } catch (e) { return writeJson(res, 200, { ok: false, error: e.message }); }
  }

  // AI SCAN — one cheap batched call: rank the day's setups + a market read. Far cheaper than per-stock.
  if (pathname === "/api/market/ai-scan" && req.method === "POST") {
    const key = (process.env.ANTHROPIC_API_KEY || "").trim();
    if (!key) return writeJson(res, 200, { ok: false, error: "ANTHROPIC_API_KEY not set" });
    let b; try { b = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { ok: false, error: "bad json" }); }
    const setups = Array.isArray(b.setups) ? b.setups.slice(0, 12) : [];
    const regime = Number(b.regime) || 0;
    if (!setups.length) return writeJson(res, 200, { ok: true, analysis: "No setups to analyze — stay in cash." });
    const SYSTEM = `You are a disciplined institutional swing-trader doing a quick scan triage. Be concise and honest — your job is to focus the trader on the best 1-3 names and warn off weak ones. Rules: only A+ (score ≥90) in a green market, strong sector, at the buy zone, reward:risk ≥2:1; cut losers fast, let winners run; cash is a position. Format:\nMARKET: one short line on whether to be aggressive, selective, or in cash given the regime.\nTOP PICKS: up to 3 tickers, one tight reason each (best first).\nAVOID: any names that look weak/extended, one phrase each (or "none").\nKeep the whole thing under 120 words. No preamble.`;
    const rows = setups.map(s => `${s.symbol}: A+${s.aScore}/100 (${s.grade}), R:R ${s.rr}:1, RVOL ${s.rvol}x, RS ${s.relStrength}% vs SPY, sector ${s.sector || "?"}, ${s.atEntry ? "at entry" : "extended"}`).join("\n");
    const prompt = `Market regime ${regime}/100. Today's scanned setups:\n${rows}\n\nTriage them.`;
    try {
      const analysis = await callAnthropicApi(prompt, key, { model: MODELS.haiku, maxTokens: 350, system: SYSTEM, cache: true });
      return writeJson(res, 200, { ok: true, analysis: (analysis || "").trim() });
    } catch (e) { return writeJson(res, 200, { ok: false, error: e.message }); }
  }

  // Diagnostic: test the Gmail lead connection (connect + find leads, no send).
  if (pathname === "/api/market/leads-status" && req.method === "GET") {
    try { const { testGmailConnection } = require("../gmail-leads"); return writeJson(res, 200, await testGmailConnection()); }
    catch (e) { return writeJson(res, 200, { ok: false, error: e.message }); }
  }

  // 📧 CARGURUS LEAD RESPONDER — parse a lead email + draft the dealer reply.
  if (pathname === "/api/market/lead-reply" && req.method === "POST") {
    const key = (process.env.ANTHROPIC_API_KEY || "").trim();
    if (!key) return writeJson(res, 200, { ok: false, error: "ANTHROPIC_API_KEY not set" });
    let b; try { b = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { ok: false, error: "bad json" }); }
    const email = String(b.email || "").slice(0, 6000);
    if (!email.trim()) return writeJson(res, 400, { ok: false, error: "lead email text required" });
    const dealer = b.dealer || { name: "Dixie Motors", address: "6416 Dixie Highway, Fairfield, OH 45014", phone: "513-874-4999" };
    const system = `You are the sales assistant for ${dealer.name}, a used-car dealership. You receive a CarGurus lead email. Extract the customer's FIRST name, their email, their phone, and the vehicle they're asking about (year make model trim) plus the LISTED price (use "Listed Price", not the market value). Then write a short, warm reply email.
Reply template (follow it closely):
Subject: <Year Make Model Trim> – Still Available
Body:
Hi <FirstName>,

Thank you for your interest in our <Year Make Model Trim>.

The vehicle is still available at the listed price of $<ListedPrice>. What day and time would you like to come in and take a look at it?

Please let me know the best way to reach you, or feel free to call us at ${dealer.phone}.

${dealer.name}
${dealer.address}

Return ONLY valid JSON, no markdown: {"firstName":"","customerEmail":"","customerPhone":"","vehicle":"","price":"","subject":"","body":""}. The body must be the full email text with real line breaks as \\n.`;
    try {
      const raw = await callAnthropicApi(`Lead email:\n${email}`, key, { model: MODELS.haiku, maxTokens: 600, system, cache: true });
      let data; try { data = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim()); } catch { data = { body: raw, subject: "Vehicle – Still Available" }; }
      return writeJson(res, 200, { ok: true, ...data });
    } catch (e) { return writeJson(res, 200, { ok: false, error: e.message }); }
  }

  // ✈️ AI FLIGHT FINDER — cheapest flights + best dates to fly/book (live web search).
  if (pathname === "/api/market/flight-find" && req.method === "POST") {
    const key = (process.env.ANTHROPIC_API_KEY || "").trim();
    if (!key) return writeJson(res, 200, { ok: false, error: "ANTHROPIC_API_KEY not set" });
    let b; try { b = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { ok: false, error: "bad json" }); }
    const from = String(b.from || "").slice(0, 60), to = String(b.to || "").slice(0, 60);
    const when = String(b.when || "").slice(0, 80), trip = b.roundTrip === false ? "one-way" : "round-trip";
    const flexible = b.flexible !== false;
    if (!from || !to) return writeJson(res, 400, { ok: false, error: "from and to required" });
    const system = `You are an expert flight deal hunter. Use web_search (Google Flights, Skyscanner, Kayak, airline sites) to find the CHEAPEST real flights for the route and timeframe. Be specific and current. Return:\nCHEAPEST OPTIONS: 3-4 with price, airline, exact dates, stops, and a booking LINK (full https URL — a Google Flights or Skyscanner search link for the route/dates is fine).\nBEST DATES: the cheapest days to depart/return for this route (e.g., "fly out Tue Jan 14, back Tue Jan 21 — ~$120 cheaper than the weekend").\nWHEN TO BOOK: how far ahead is ideal for this route + any price trend.\nTIP: one money-saving move (nearby airport, flexible dates, etc.).\nUse real current prices/links from your searches — never invent. Under 260 words.`;
    const prompt = `Find me the cheapest ${trip} flights from ${from} to ${to}${when ? `, around ${when}` : ""}.${flexible ? " My dates are flexible — find the cheapest days." : ""} Give current real options and the best dates to fly and book.`;
    const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
    try {
      const messages = [{ role: "user", content: prompt }];
      let text = "";
      for (let i = 0; i < 5; i++) {
        const resp = await anthropicRequest({ model: MODELS.haiku, max_tokens: 1000, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages, tools }, key, 90000);
        const content = resp.content || [];
        const t = content.filter(c => c.type === "text").map(c => c.text).join("");
        if (t) text = t;
        if (resp.stop_reason === "pause_turn") { messages.push({ role: "assistant", content }); continue; }
        break;
      }
      return writeJson(res, 200, { ok: true, flights: (text || "").replace(/<\/?cite[^>]*>/g, "").trim() || "(no results)" });
    } catch (e) { return writeJson(res, 200, { ok: false, error: e.message }); }
  }

  // 🛒 AI DEAL FINDER — searches the live web for the best deals on a product within budget.
  if (pathname === "/api/market/deal-find" && req.method === "POST") {
    const key = (process.env.ANTHROPIC_API_KEY || "").trim();
    if (!key) return writeJson(res, 200, { ok: false, error: "ANTHROPIC_API_KEY not set" });
    let b; try { b = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { ok: false, error: "bad json" }); }
    const what = String(b.query || "laptop").slice(0, 120);
    const budget = String(b.budget || "").replace(/[^0-9]/g, "").slice(0, 7);
    const use = String(b.useCase || "").slice(0, 200);
    const system = `You are a savvy deal-hunting expert. Use web_search to find the BEST current real deals for what the user wants within their budget. Search retailers (Amazon, Best Buy, Walmart, Newegg, manufacturer sites) and deal sites. Return 3-5 concrete options. For EACH option provide, on its own lines: model name, current price, retailer, a one-line why-it's-a-good-value, and a direct LINK — the full https:// URL to the product page (or the retailer's search page for that exact model) from your search results. Always include a usable link for every option. Then a "BEST VALUE" pick and one money-saving tip. Use real, current prices/models/links from your searches — never invent a URL. Under 260 words.`;
    const prompt = `Find me the best ${what}${budget ? ` under $${budget}` : ""}${use ? ` for: ${use}` : ""}. Prioritize cheap but good — best bang for the buck. Give current real options.`;
    const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
    try {
      const messages = [{ role: "user", content: prompt }];
      let text = "";
      for (let i = 0; i < 5; i++) {
        const resp = await anthropicRequest({ model: MODELS.haiku, max_tokens: 1000, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages, tools }, key, 90000);
        const content = resp.content || [];
        const t = content.filter(c => c.type === "text").map(c => c.text).join("");
        if (t) text = t;
        if (resp.stop_reason === "pause_turn") { messages.push({ role: "assistant", content }); continue; }
        break;
      }
      return writeJson(res, 200, { ok: true, deals: (text || "").replace(/<\/?cite[^>]*>/g, "").trim() || "(no results)" });
    } catch (e) { return writeJson(res, 200, { ok: false, error: e.message }); }
  }

  // 🩸 AI BOTTOM SPOTTER — capitulation candidates + live news → "real bottom or falling knife?"
  if (pathname === "/api/market/ai-bottom" && req.method === "POST") {
    const key = (process.env.ANTHROPIC_API_KEY || "").trim();
    if (!key) return writeJson(res, 200, { ok: false, error: "ANTHROPIC_API_KEY not set" });
    let b; try { b = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { ok: false, error: "bad json" }); }
    const cands = (Array.isArray(b.candidates) ? b.candidates : []).slice(0, 8);
    const market = b.market || {};
    const system = `You are a contrarian trader hunting capitulation bottoms — but disciplined, never a knife-catcher. Use web_search for the latest news on the names and the overall tape. For each candidate decide: REAL REVERSAL SETUP vs FALLING KNIFE (avoid), and state the ONE thing that would confirm a bottom (e.g., reclaim of a level, volume reversal, news resolving). Format:\nTAPE: one line — is the broad market washing out or still falling?\nBEST BOTTOM PLAY: 1-2 names with the cleanest reversal setup + why.\nKNIVES: names to avoid + the red flag (bad news, no support).\nCONFIRM: what to wait for before buying any bottom.\nUnder 130 words. Bottoms are dangerous — be honest about risk.`;
    const rows = cands.length ? cands.map(c => `${c.symbol}: bottom score ${c.bottomScore}/100, ${c.offHigh}% off high, RVOL ${c.rvol}x, today ${c.chg}%`).join("\n") : "no strong capitulation candidates";
    const prompt = `Market: regime ${market.regime}/100${market.vix ? `, VIX ${market.vix}` : ""}${market.spyChg != null ? `, SPY ${market.spyChg}% today` : ""}.\nCapitulation candidates:\n${rows}\n\nAre we near a bottom? Which are real reversals vs falling knives?`;
    const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];
    try {
      const messages = [{ role: "user", content: prompt }];
      let text = "";
      for (let i = 0; i < 4; i++) {
        const resp = await anthropicRequest({ model: MODELS.haiku, max_tokens: 600, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages, tools }, key, 60000);
        const content = resp.content || [];
        const t = content.filter(c => c.type === "text").map(c => c.text).join("");
        if (t) text = t;
        if (resp.stop_reason === "pause_turn") { messages.push({ role: "assistant", content }); continue; }
        break;
      }
      return writeJson(res, 200, { ok: true, analysis: (text || "").trim() || "(no answer)" });
    } catch (e) { return writeJson(res, 200, { ok: false, error: e.message }); }
  }

  // 🗣️ TRADING COPILOT — chat that knows your context and can search live news.
  if (pathname === "/api/market/ai-copilot" && req.method === "POST") {
    const key = (process.env.ANTHROPIC_API_KEY || "").trim();
    if (!key) return writeJson(res, 200, { ok: false, error: "ANTHROPIC_API_KEY not set" });
    let b; try { b = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { ok: false, error: "bad json" }); }
    const ctx = b.context || {};
    const history = (Array.isArray(b.messages) ? b.messages : []).slice(-8)
      .map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 2000) }))
      .filter(m => m.content);
    if (!history.length) return writeJson(res, 400, { ok: false, error: "no message" });
    const wl = (ctx.watchlist || []).slice(0, 40).join(", ");
    const pos = (ctx.positions || []).slice(0, 30).map(p => `${p.symbol} ${p.qty}@${p.avgEntry} (${p.unrealizedPL >= 0 ? "+" : ""}${Math.round(p.unrealizedPL)})`).join(", ");
    const setups = (ctx.setups || []).slice(0, 10).map(s => `${s.symbol} A+${s.aScore}`).join(", ");
    const system = `You are the user's trading copilot inside their platform. Be concise, direct, and practical — like a sharp trading desk colleague, not a chatbot. You can use web_search for anything time-sensitive (why a stock is moving today, latest news, earnings reactions). Always tie answers to their actual context below.

THEIR CONTEXT:
- Account: $${ctx.account || "?"} · risk ${ctx.riskPct || 1}% per trade
- Market regime: ${ctx.regime != null ? ctx.regime + "/100" : "?"}
- Watchlist: ${wl || "—"}
- Open positions: ${pos || "none"}
- Today's A+ setups: ${setups || "none"}

RULES THEY TRADE BY: only A+ setups (≥90) in a green regime, strong sector, at the buy zone; reward:risk ≥2:1; risk 1% per trade; cut losers fast, let winners run; cash is a position. If asked to plan a trade, give entry / stop / target / share size for their account & risk. You are not a licensed advisor — frame trade ideas as educational, not personalized financial advice. Keep most answers under 150 words unless they ask for depth.`;
    const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];
    try {
      const messages = history.slice();
      let text = "";
      for (let i = 0; i < 4; i++) {
        const resp = await anthropicRequest({ model: MODELS.haiku, max_tokens: 700,
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages, tools }, key, 60000);
        const content = resp.content || [];
        const t = content.filter(c => c.type === "text").map(c => c.text).join("");
        if (t) text = t;
        if (resp.stop_reason === "pause_turn") { messages.push({ role: "assistant", content }); continue; }
        break;
      }
      return writeJson(res, 200, { ok: true, reply: (text || "").trim() || "(no answer)" });
    } catch (e) { return writeJson(res, 200, { ok: false, error: e.message }); }
  }

  // Manually fire the server-side AI game plan / trade coach (for testing or off-hours).
  if (pathname === "/api/market/ai-trigger" && req.method === "POST") {
    const type = (searchParams.get("type") || "gameplan").toLowerCase();
    try {
      const { runMorningGamePlan, runTradeCoach } = require("../ai-coach");
      (type === "coach" ? runTradeCoach() : runMorningGamePlan()).catch(() => {});
      return writeJson(res, 200, { ok: true, fired: type, note: "Running — check Telegram in a few seconds (needs ANTHROPIC_API_KEY + Telegram + data)." });
    } catch (e) { return writeJson(res, 200, { ok: false, error: e.message }); }
  }

  // AI MORNING GAME PLAN — one batched call: regime + top setups → a 1-paragraph plan.
  if (pathname === "/api/market/ai-gameplan" && req.method === "POST") {
    const key = (process.env.ANTHROPIC_API_KEY || "").trim();
    if (!key) return writeJson(res, 200, { ok: false, error: "ANTHROPIC_API_KEY not set" });
    let b; try { b = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { ok: false, error: "bad json" }); }
    const regime = Number(b.regime) || 0;
    const setups = (Array.isArray(b.setups) ? b.setups : []).slice(0, 10);
    const SYSTEM = `You are a head trader writing the team's morning game plan in ONE short paragraph (max 60 words). Be direct and actionable. Cover: today's stance (aggressive long / selective / cash) given the regime, the 1-3 best tickers to focus on, and one risk to respect. No fluff, no disclaimers.`;
    const rows = setups.length ? setups.map(s => `${s.symbol} (A+${s.aScore}, ${s.sector || "?"}, ${s.atEntry ? "at entry" : "extended"})`).join(", ") : "none qualify";
    const prompt = `Date: ${new Date().toDateString()}. Market regime ${regime}/100. Top A+ setups today: ${rows}. Write the morning game plan.`;
    try {
      const plan = await callAnthropicApi(prompt, key, { model: MODELS.haiku, maxTokens: 200, system: SYSTEM, cache: true });
      return writeJson(res, 200, { ok: true, plan: (plan || "").trim() });
    } catch (e) { return writeJson(res, 200, { ok: false, error: e.message }); }
  }

  // AI TRADE COACH — one batched call: review today's closed trades → honest feedback.
  if (pathname === "/api/market/ai-coach" && req.method === "POST") {
    const key = (process.env.ANTHROPIC_API_KEY || "").trim();
    if (!key) return writeJson(res, 200, { ok: false, error: "ANTHROPIC_API_KEY not set" });
    let b; try { b = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { ok: false, error: "bad json" }); }
    const trades = (Array.isArray(b.trades) ? b.trades : []).slice(0, 25);
    if (!trades.length) return writeJson(res, 200, { ok: true, coach: "No closed trades today — nothing to review. Discipline (sitting out) is a valid result." });
    const SYSTEM = `You are a tough-but-fair trading coach reviewing a trader's CLOSED trades for the day. Be specific and honest — praise good discipline, call out mistakes (cutting winners early, holding losers, oversizing, revenge trades). Max 80 words. Format:\nWENT WELL: one line.\nFIX: 1-2 specific things.\nTOMORROW: one focus.`;
    const rows = trades.map(t => `${t.symbol} ${t.side || "long"}: entry $${t.entry} → exit $${t.exit}, P&L $${Math.round(t.pnl)}, held ${t.held || "?"}`).join("\n");
    const prompt = `Today's closed trades:\n${rows}\n\nCoach me.`;
    try {
      const coach = await callAnthropicApi(prompt, key, { model: MODELS.haiku, maxTokens: 250, system: SYSTEM, cache: true });
      return writeJson(res, 200, { ok: true, coach: (coach || "").trim() });
    } catch (e) { return writeJson(res, 200, { ok: false, error: e.message }); }
  }

  if (pathname === "/api/market/outlook" && req.method === "GET") {
    try {
      const payload = await buildMarketOutlook();
      return writeJson(res, 200, payload);
    } catch (err) {
      return writeJson(res, 502, { error: err instanceof Error ? err.message : "Outlook failed." });
    }
  }

  if (pathname === "/api/market/trend-screen" && req.method === "GET") {
    const symbols = (searchParams.get("symbols") || "")
      .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 60);
    if (!symbols.length) return writeJson(res, 400, { error: "symbols required" });
    try {
      const results = await screenTrendTemplate(symbols);
      return writeJson(res, 200, { count: results.length, results });
    } catch (err) {
      return writeJson(res, 502, { error: err instanceof Error ? err.message : "Screen failed." });
    }
  }

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

  // ── Prediction markets (Polymarket) — odds for events that move stocks ──
  if (pathname === "/api/market/predictions") {
    try {
      const https = require("https");
      const getJson = (url) => new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }, r => {
          let d = ""; r.on("data", c => d += c); r.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
        });
        req.on("error", reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error("timeout")); });
      });
      // Polymarket Gamma API — active markets sorted by volume
      const markets = await getJson("https://gamma-api.polymarket.com/markets?closed=false&active=true&order=volume24hr&ascending=false&limit=120");
      const arr = Array.isArray(markets) ? markets : [];
      // Keywords for trader-relevant events
      const KW = /fed|rate|interest|recession|inflation|cpi|gdp|jobs|unemployment|s&p|sp500|nasdaq|dow|stock|market|bitcoin|btc|ethereum|eth|crypto|tariff|trump|election|powell|treasury|yield|gold|oil|nvidia|tesla|government shutdown/i;
      const relevant = arr.filter(m => KW.test(m.question || "") && m.outcomes && m.outcomePrices)
        .map(m => {
          let outcomes = [], prices = [];
          try { outcomes = JSON.parse(m.outcomes); prices = JSON.parse(m.outcomePrices); } catch {}
          const yesIdx = outcomes.findIndex(o => /yes/i.test(o));
          const yesPct = yesIdx >= 0 ? Math.round(Number(prices[yesIdx]) * 100) : (prices[0] ? Math.round(Number(prices[0]) * 100) : null);
          return {
            question: m.question,
            yesPct,
            outcomes: outcomes.map((o, i) => ({ label: o, pct: Math.round(Number(prices[i] || 0) * 100) })),
            volume: Math.round(Number(m.volume || m.volumeNum || 0)),
            endDate: m.endDate || null,
            category: /fed|rate|powell|inflation|cpi|recession|gdp|jobs|treasury|yield/i.test(m.question) ? "MACRO"
                    : /bitcoin|btc|eth|crypto/i.test(m.question) ? "CRYPTO"
                    : /trump|election|shutdown|government/i.test(m.question) ? "POLITICS"
                    : /s&p|nasdaq|dow|stock|nvidia|tesla|market/i.test(m.question) ? "STOCKS" : "OTHER",
          };
        })
        .filter(m => m.yesPct !== null)
        .slice(0, 40);
      return writeJson(res, 200, { ok: true, markets: relevant, count: relevant.length });
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: e.message, markets: [] });
    }
  }

  // ── StockTwits social sentiment ("X for traders") ──
  if (pathname === "/api/market/social-sentiment") {
    try {
      const st = require("../providers/stocktwits");
      const symParam = (searchParams.get("symbols") || "SPY,QQQ").split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 6);
      const [perSymbol, trending] = await Promise.all([
        Promise.all(symParam.map(s => st.fetchSentiment(s).catch(() => null))),
        st.fetchTrending(12).catch(() => []),
      ]);
      const valid = perSymbol.filter(Boolean);
      // Market-wide read from SPY/QQQ
      let totalBull = 0, totalBear = 0;
      valid.forEach(v => { totalBull += v.bullish; totalBear += v.bearish; });
      const tot = totalBull + totalBear;
      const netPct = tot ? Math.round((totalBull - totalBear) / tot * 100) : 0;
      const label = netPct >= 25 ? "BULLISH" : netPct >= 8 ? "LEAN BULLISH" : netPct <= -25 ? "BEARISH" : netPct <= -8 ? "LEAN BEARISH" : "MIXED";
      return writeJson(res, 200, { ok: true, netPct, label, totalBull, totalBear, symbols: valid, trending });
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: e.message });
    }
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

  // ── GET /api/market/distribution — Institutional distribution / shift scan ─
  // Cached 5 minutes so repeated loads don't re-hit Yahoo every time.
  if (pathname === "/api/market/distribution" && req.method === "GET") {
    const _distCache = handleMarket._distCache || (handleMarket._distCache = { data: null, ts: 0 });
    const DIST_TTL = 5 * 60 * 1000;
    const forceRefresh = requestUrl.searchParams.get("refresh") === "1";
    if (!forceRefresh && _distCache.data && Date.now() - _distCache.ts < DIST_TTL) {
      return writeJson(res, 200, _distCache.data);
    }
    try {
      const INDEXES   = ["SPY", "QQQ", "IWM", "SMH"];
      const DEFENSIVE = ["XLU", "XLP", "XLV", "GLD", "TLT"];
      const GROWTH    = ["XLK", "XLY", "SMH", "ARKK"];
      const CREDIT    = ["HYG", "LQD"];

      // All 11 S&P sectors + key macro ETFs — with top constituent stocks
      const SECTORS = [
        { sym: "XLK",  name: "Tech",         icon: "💻", stocks: ["NVDA","MSFT","AAPL","AMD","AVGO"] },
        { sym: "XLF",  name: "Financials",   icon: "🏦", stocks: ["JPM","BAC","GS","MS","WFC"] },
        { sym: "XLV",  name: "Healthcare",   icon: "🏥", stocks: ["UNH","JNJ","LLY","ABBV","MRK"] },
        { sym: "XLE",  name: "Energy",       icon: "⚡", stocks: ["XOM","CVX","COP","EOG","SLB","VST","CEG"] },
        { sym: "XLI",  name: "Industrials",  icon: "🏭", stocks: ["GE","CAT","RTX","HON","UNP"] },
        { sym: "XLY",  name: "Cons. Disc.",  icon: "🛍", stocks: ["AMZN","TSLA","HD","MCD","NKE"] },
        { sym: "XLP",  name: "Cons. Staples",icon: "🛒", stocks: ["PG","KO","PEP","WMT","COST"] },
        { sym: "XLU",  name: "Utilities",    icon: "💡", stocks: ["NEE","DUK","SO","AEP","EXC"] },
        { sym: "XLRE", name: "Real Estate",  icon: "🏠", stocks: ["AMT","PLD","EQIX","SPG","PSA"] },
        { sym: "XLB",  name: "Materials",    icon: "⛏", stocks: ["LIN","SHW","APD","ECL","NEM"] },
        { sym: "XLC",  name: "Comm. Svcs",   icon: "📡", stocks: ["META","GOOGL","NFLX","DIS","T"] },
        { sym: "GLD",  name: "Gold",         icon: "🥇", stocks: ["GLD","GDX","GDXJ","NEM","AEM"] },
        { sym: "TLT",  name: "Bonds (TLT)",  icon: "📜", stocks: ["TLT","IEF","BND","AGG","HYG"] },
        { sym: "IBIT", name: "Bitcoin",      icon: "₿",  stocks: ["IBIT","MSTR","COIN","MARA","RIOT"] },
      ];

      const allSyms = [...new Set([
        ...INDEXES, ...DEFENSIVE, ...GROWTH, ...CREDIT,
        ...SECTORS.map(s => s.sym),
      ])];
      const quotes  = await fetchYahooQuoteBatch(allSyms).catch(() => []);
      const qMap    = Object.fromEntries(quotes.map(q => [String(q.symbol || "").toUpperCase(), q]));

      // Fetch bars: 3-month for indexes (distribution days) + 5-day for sectors (money flow)
      const allBarSyms = [...new Set([...INDEXES, ...SECTORS.map(s => s.sym)])];
      const barResults = await Promise.allSettled(
        allBarSyms.map(sym => {
          const range = INDEXES.includes(sym) ? "3mo" : "5d";
          return fetchYahooBars(sym, range, "1d").then(b => ({ sym, bars: b }));
        })
      );
      const barMap = {};
      barResults.forEach(r => { if (r.status === "fulfilled") barMap[r.value.sym] = r.value.bars; });

      const warnings = [];
      let riskScore = 0;

      // ── 1. Distribution days per index (down + RVOL > 1.2, in last 25 sessions) ──
      const distDays = {};
      for (const sym of INDEXES) {
        const bars = barMap[sym] || [];
        const last25 = bars.slice(-25);
        if (last25.length < 5) { distDays[sym] = 0; continue; }
        const vols = last25.map(b => b.volume || 0);
        const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;
        let count = 0;
        for (const bar of last25) {
          const chgPct = bar.close && bar.open ? (bar.close - bar.open) / bar.open * 100 : 0;
          const rvol   = avgVol > 0 ? bar.volume / avgVol : 0;
          if (chgPct <= -0.2 && rvol >= 1.2) count++;
        }
        distDays[sym] = count;
        if (count >= 4) { riskScore += 20; warnings.push({ level: "HIGH", sig: `${sym}: ${count} distribution days in 25 sessions`, tag: "DIST" }); }
        else if (count >= 2) { riskScore += 8; warnings.push({ level: "MED", sig: `${sym}: ${count} distribution days — watch closely`, tag: "DIST" }); }
      }

      // ── 2. Sector rotation: defensive > growth ──────────────────────────────
      const defensiveChg = DEFENSIVE.map(s => Number(qMap[s]?.regularMarketChangePercent || 0));
      const growthChg    = GROWTH.map(s => Number(qMap[s]?.regularMarketChangePercent || 0));
      const defAvg  = defensiveChg.reduce((a,b)=>a+b,0)/defensiveChg.length;
      const grwAvg  = growthChg.reduce((a,b)=>a+b,0)/growthChg.length;
      const rotDiff = round2(defAvg - grwAvg);
      if (rotDiff > 0.8) { riskScore += 18; warnings.push({ level: "HIGH", sig: `Defensive sectors outpacing growth by ${rotDiff.toFixed(1)}% — rotation underway`, tag: "ROTATION" }); }
      else if (rotDiff > 0.3) { riskScore += 8; warnings.push({ level: "MED", sig: `Mild defensive rotation: defensives +${defAvg.toFixed(1)}% vs growth +${grwAvg.toFixed(1)}%`, tag: "ROTATION" }); }

      // ── 3. Credit stress: HYG weakening vs LQD ─────────────────────────────
      // Compute change % manually from price/prevClose in case regularMarketChangePercent is stale
      const getChgPct = (sym) => {
        const q = qMap[sym];
        if (!q) return 0;
        const price = Number(q.regularMarketPrice || 0);
        const prev  = Number(q.regularMarketPreviousClose || q.regularMarketOpen || 0);
        if (price > 0 && prev > 0) return round2((price - prev) / prev * 100);
        // Fallback to Yahoo's field (already in percent)
        const raw = Number(q.regularMarketChangePercent || 0);
        return round2(Math.abs(raw) > 50 ? raw / 100 : raw); // normalise if returned as decimal
      };
      const hygChg = getChgPct("HYG");
      const lqdChg = getChgPct("LQD");
      const hygPrice = round2(Number(qMap["HYG"]?.regularMarketPrice || 0));
      const creditSpread = round2(lqdChg - hygChg);
      if (hygChg < -0.5 && creditSpread > 0.3) { riskScore += 15; warnings.push({ level: "HIGH", sig: `HYG (junk) ${hygChg.toFixed(2)}% — credit stress, risk-off signal`, tag: "CREDIT" }); }
      else if (hygChg < -0.2) { riskScore += 5; warnings.push({ level: "LOW", sig: `HYG softening (${hygChg.toFixed(2)}%) — monitor credit spreads`, tag: "CREDIT" }); }

      // ── 4. Volume divergence: index up but volume declining ─────────────────
      for (const sym of ["SPY", "QQQ"]) {
        const bars = (barMap[sym] || []).slice(-10);
        if (bars.length < 5) continue;
        const recentPriceUp = bars[bars.length-1].close > bars[0].close;
        const recentVols = bars.map(b => b.volume || 0);
        const volTrend = recentVols[recentVols.length-1] < recentVols[0] * 0.75;
        if (recentPriceUp && volTrend) {
          riskScore += 10;
          warnings.push({ level: "MED", sig: `${sym}: price rising on declining volume — possible distribution/churn`, tag: "DIVERGENCE" });
        }
      }

      // ── 5. Index below key MAs ──────────────────────────────────────────────
      for (const sym of INDEXES) {
        const q = qMap[sym];
        if (!q) continue;
        const px  = Number(q.regularMarketPrice || 0);
        const ma50 = Number(q.fiftyDayAverage || 0);
        const ma200= Number(q.twoHundredDayAverage || 0);
        if (px > 0 && ma200 > 0 && px < ma200) {
          riskScore += 15;
          warnings.push({ level: "HIGH", sig: `${sym} below 200-day MA ($${round2(ma200)}) — primary downtrend risk`, tag: "MA" });
        } else if (px > 0 && ma50 > 0 && px < ma50) {
          riskScore += 10;
          warnings.push({ level: "MED", sig: `${sym} below 50-day MA ($${round2(ma50)}) — momentum broken`, tag: "MA" });
        }
      }

      // ── 6. VIX — fetch via chart meta (more reliable than batch for ^VIX) ────
      let vix = 0, vixChg = 0, vixPrev = 0;
      try {
        // Try batch first (fast)
        const vixBatch = await fetchYahooQuoteBatch(["^VIX"]).catch(() => []);
        vix = Number(vixBatch[0]?.regularMarketPrice || 0);
        vixPrev = Number(vixBatch[0]?.regularMarketPreviousClose || 0);
        if (vix > 0 && vixPrev > 0) vixChg = round2((vix - vixPrev) / vixPrev * 100);

        // Fallback: chart meta if batch failed
        if (vix === 0) {
          const { fetchYahooChartMeta } = require("../providers/yahoo");
          const meta = await fetchYahooChartMeta("^VIX").catch(() => null);
          if (meta) {
            vix = round2(Number(meta.regularMarketPrice || meta.chartPreviousClose || 0));
            vixPrev = round2(Number(meta.chartPreviousClose || 0));
            if (vix > 0 && vixPrev > 0) vixChg = round2((vix - vixPrev) / vixPrev * 100);
          }
        }

        // Second fallback: use UVXY as volatility proxy
        if (vix === 0) {
          const uvxyQ = await fetchYahooQuoteBatch(["UVXY"]).catch(() => []);
          const uvxy  = uvxyQ[0];
          if (uvxy) {
            const uvxyPx   = Number(uvxy.regularMarketPrice || 0);
            const uvxyPrev = Number(uvxy.regularMarketPreviousClose || 0);
            if (uvxyPx > 0 && uvxyPrev > 0) {
              vixChg = round2((uvxyPx - uvxyPrev) / uvxyPrev * 100);
              // UVXY roughly 1.5× VIX daily moves; estimate VIX from its price range
              vix = round2(uvxyPx * 0.6 + 10); // rough proxy
            }
          }
        }
      } catch {}

      vix = round2(vix);
      if (vix > 25) { riskScore += 20; warnings.push({ level: "HIGH", sig: `VIX ${vix.toFixed(1)} — elevated fear, reduce size and tighten stops`, tag: "VIX" }); }
      else if (vix > 18) { riskScore += 8; warnings.push({ level: "MED", sig: `VIX ${vix.toFixed(1)} — above normal range, watch for spike`, tag: "VIX" }); }
      if (vixChg > 15) { riskScore += 10; warnings.push({ level: "HIGH", sig: `VIX +${vixChg.toFixed(1)}% today — sudden fear spike, de-risk`, tag: "VIX" }); }

      riskScore = Math.min(100, riskScore);
      const alert = riskScore >= 65 ? "DANGER" : riskScore >= 40 ? "CAUTION" : riskScore >= 20 ? "WATCH" : "NORMAL";

      // Always-visible status for every check (green = clear, amber = watch, red = alert)
      const maxDistDays = Math.max(...Object.values(distDays));
      const checkStatus = [
        {
          tag: "DIST",
          label: "Distribution Days",
          icon: "📊",
          status: maxDistDays >= 4 ? "HIGH" : maxDistDays >= 2 ? "MED" : "OK",
          detail: maxDistDays >= 2
            ? `${maxDistDays} high-vol down days in 25 sessions`
            : "No distribution — institutions not selling",
        },
        {
          tag: "ROTATION",
          label: "Sector Rotation",
          icon: "🔄",
          status: rotDiff > 0.8 ? "HIGH" : rotDiff > 0.3 ? "MED" : "OK",
          detail: rotDiff > 0.3
            ? `Defensives outperforming growth by ${rotDiff.toFixed(1)}%`
            : `Growth leading defensives by ${Math.abs(rotDiff).toFixed(1)}% — risk-on`,
        },
        {
          tag: "CREDIT",
          label: "Credit Spreads (HYG)",
          icon: "💳",
          status: (hygChg < -0.5) ? "HIGH" : (hygChg < -0.2) ? "MED" : "OK",
          detail: hygChg < -0.2
            ? `HYG $${hygPrice} (${hygChg.toFixed(2)}%) — junk bonds weakening, spreads widening`
            : hygPrice > 0
              ? `HYG $${hygPrice} (${hygChg >= 0 ? "+" : ""}${hygChg.toFixed(2)}%) — credit market healthy`
              : "HYG credit data loading…",
        },
        {
          tag: "DIVERGENCE",
          label: "Volume Divergence",
          icon: "📉",
          status: warnings.some(w => w.tag === "DIVERGENCE") ? "MED" : "OK",
          detail: warnings.some(w => w.tag === "DIVERGENCE")
            ? "Price up on declining volume — possible distribution"
            : "Volume confirming price moves — healthy",
        },
        {
          tag: "MA",
          label: "Index MA Breaks",
          icon: "📏",
          status: warnings.filter(w => w.tag === "MA").some(w => w.level === "HIGH") ? "HIGH"
                : warnings.some(w => w.tag === "MA") ? "MED" : "OK",
          detail: (() => {
            const maW = warnings.filter(w => w.tag === "MA");
            if (!maW.length) return "All indexes above key moving averages";
            return maW.map(w => w.sig).join(" | ");
          })(),
        },
        {
          tag: "VIX",
          label: "VIX / Fear Index",
          icon: "😨",
          status: vix > 25 ? "HIGH" : vix > 18 ? "MED" : "OK",
          detail: vix > 0
            ? `VIX ${vix.toFixed(1)}${vixChg !== 0 ? ` (${vixChg >= 0 ? "+" : ""}${vixChg.toFixed(1)}% today)` : ""} — ${vix > 25 ? "ELEVATED: reduce size, tighten stops" : vix > 18 ? "ABOVE NORMAL: watch for spike" : vix > 12 ? "normal — calm market conditions" : "very low — complacency, stay alert"}`
            : "Fetching VIX data — will show on next refresh",
        },
      ];

      const indexSnapshot = INDEXES.map(sym => {
        const q = qMap[sym] || {};
        return {
          sym,
          chg:   round2(Number(q.regularMarketChangePercent || 0)),
          price: round2(Number(q.regularMarketPrice || 0)),
          distDays: distDays[sym] || 0,
        };
      });

      // ── Fetch constituent stock quotes for sectors ─────────────────────────
      const allConstituents = [...new Set(SECTORS.flatMap(s => s.stocks || []))];
      const constChunks = [];
      for (let i = 0; i < allConstituents.length; i += 20) constChunks.push(allConstituents.slice(i, i + 20));
      const constResults = await Promise.allSettled(constChunks.map(c => fetchYahooQuoteBatch(c)));
      const constQuotes  = constResults.flatMap(r => r.status === "fulfilled" ? r.value : []);
      const constMap     = Object.fromEntries(constQuotes.map(q => [String(q.symbol||"").toUpperCase(), q]));

      // ── Money Flow: where institutions are rotating ─────────────────────────
      const moneyFlow = SECTORS.map(sec => {
        const q    = qMap[sec.sym];
        const bars = barMap[sec.sym] || [];

        // Use bar data as primary source — most reliable
        const todayBar = bars[bars.length - 1];
        const prevBar  = bars[bars.length - 2];

        let price = 0, chg = 0, vol = 0;

        if (todayBar && prevBar) {
          price = round2(todayBar.close);
          chg   = prevBar.close > 0
            ? round2((todayBar.close - prevBar.close) / prevBar.close * 100)
            : 0;
          vol   = todayBar.volume || 0;
        } else if (q) {
          // Fallback to quote batch
          price = Number(q.regularMarketPrice || 0);
          const absChg = Number(q.regularMarketChange || 0);
          const pct    = Number(q.regularMarketChangePercent || 0);
          const prev   = Number(q.regularMarketPreviousClose || 0);
          if (absChg !== 0 && price > 0)   chg = round2(absChg / (price - absChg) * 100);
          else if (prev > 0 && price > 0)  chg = round2((price - prev) / prev * 100);
          else if (pct !== 0)              chg = round2(Math.abs(pct) > 50 ? pct / 100 : pct);
          vol = Number(q?.regularMarketVolume || 0);
        }

        if (price === 0 && q) price = Number(q.regularMarketPrice || 0);

        // Compute RVOL from bars (20-day avg volume)
        let rvol = 1;
        if (bars.length >= 5) {
          const recentVols = bars.slice(-21, -1).map(b => b.volume || 0).filter(v => v > 0);
          const avgVol = recentVols.length ? recentVols.reduce((a, b) => a + b, 0) / recentVols.length : 0;
          if (avgVol > 0 && vol > 0) rvol = round2(vol / avgVol);
        } else if (q) {
          const av = Number(q.averageDailyVolume3Month || q.averageDailyVolume10Day || 0);
          if (av > 0 && vol > 0) rvol = round2(vol / av);
        }

        const ma50 = bars.length >= 50
          ? round2(bars.slice(-50).reduce((s, b) => s + b.close, 0) / 50)
          : Number(q?.fiftyDayAverage || 0);
        const ma50above = ma50 > 0 && price > 0 ? price > ma50 : null;

        // Flow score: volume-weighted change — high rvol on up day = strong inflow
        const flow = round2(chg * Math.min(rvol, 3));

        const flowLbl = flow > 1.5 ? "STRONG IN" : flow > 0.5 ? "IN" : flow > 0 ? "MILD IN"
          : flow < -1.5 ? "STRONG OUT" : flow < -0.5 ? "OUT" : flow < 0 ? "MILD OUT" : "NEUTRAL";

        // Top movers within this sector
        const topStocks = (sec.stocks || []).map(sym => {
          const sq  = constMap[sym];
          if (!sq) return null;
          const sp  = round2(Number(sq.regularMarketPrice || 0));
          const sc  = round2(Number(sq.regularMarketChange || 0));
          const scp = sp > 0 && sc !== 0 ? round2(sc / (sp - sc) * 100) : round2(Number(sq.regularMarketChangePercent || 0));
          return { sym, price: sp, chg: scp, name: sq.shortName || sq.longName || sym };
        }).filter(Boolean).sort((a,b) => Math.abs(b.chg) - Math.abs(a.chg)).slice(0, 3);

        return { ...sec, chg, rvol, flow, flowLbl, ma50above, price, topStocks };
      }).sort((a, b) => b.flow - a.flow);

      const topInflows  = moneyFlow.filter(s => s.flow > 0).slice(0, 5);
      const topOutflows = moneyFlow.filter(s => s.flow < 0).slice(-4).reverse();

      const distResult = {
        ok: true, riskScore, alert, warnings, checkStatus,
        vix: round2(vix), vixChg: round2(vixChg),
        rotationDiff: rotDiff, indexSnapshot,
        moneyFlow, topInflows, topOutflows,
        scannedAt: new Date().toISOString(),
      };
      _distCache.data = distResult;
      _distCache.ts   = Date.now();
      return writeJson(res, 200, distResult);
    } catch (e) {
      return writeJson(res, 502, { ok: false, error: e.message, warnings: [], riskScore: 0 });
    }
  }

  // ── GET /api/market/darkpool?symbol=NVDA (optional) ──────────────────────
  // Returns recent dark pool / block trade prints via Unusual Whales API.
  if (pathname === "/api/market/darkpool" && req.method === "GET") {
    const { UNUSUAL_WHALES_API_KEY } = require("../config");
    const symbol = (requestUrl.searchParams.get("symbol") || "").trim().toUpperCase();
    const uwKey  = UNUSUAL_WHALES_API_KEY || providerKeys?.unusualWhales;
    if (!uwKey) return writeJson(res, 200, { ok: false, error: "Unusual Whales API key not configured", prints: [] });

    try {
      const endpoint = symbol
        ? `https://api.unusualwhales.com/api/darkpool/${encodeURIComponent(symbol)}`
        : `https://api.unusualwhales.com/api/darkpool/recent`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${uwKey}`, Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`UW HTTP ${r.status}`);
      const data = await r.json();
      const raw  = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      const prints = raw.slice(0, 30).map(p => ({
        ticker:   String(p.ticker || p.symbol || "—").toUpperCase(),
        price:    Number(p.price || p.executed_at_price || 0),
        size:     Number(p.size || p.volume || 0),
        value:    Number(p.premium || p.total_value || (p.price * p.size) || 0),
        time:     p.executed_at || p.date || p.timestamp || "",
        dark:     true,
      })).filter(p => p.value > 500_000); // only blocks > $500K
      return writeJson(res, 200, { ok: true, symbol: symbol || "MARKET", prints, scannedAt: new Date().toISOString() });
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: e.message, prints: [] });
    }
  }

  // ── GET /api/market/trade-signals — Live trade signal engine ──────────────
  // Scans a universe of stocks and returns actionable LONG/SHORT/CALL/PUT signals
  if (pathname === "/api/market/trade-signals" && req.method === "GET") {
    // ── Options helpers ────────────────────────────────────────────────────────
    function getNearestExpiry(minDTE = 21) {
      // Returns the next 3rd-Friday monthly expiration at least minDTE days out
      // Uses date-only comparison to avoid time-of-day DTE errors
      const now   = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // midnight today
      const results = [];
      for (let m = 0; m < 6; m++) {
        const d = new Date(today.getFullYear(), today.getMonth() + m, 1);
        // Find 3rd Friday of this month
        let friCount = 0;
        while (friCount < 3) {
          if (d.getDay() === 5) friCount++;
          if (friCount < 3) d.setDate(d.getDate() + 1);
        }
        // DTE = calendar days from today (midnight) to expiry (midnight)
        const dte = Math.round((d.getTime() - today.getTime()) / 86400000);
        results.push({ date: new Date(d), dte });
      }
      // Pick the first expiry with DTE >= minDTE (prefer 21-45 DTE range)
      const chosen = results.find(r => r.dte >= minDTE) || results[results.length - 1];
      const mm   = String(chosen.date.getMonth() + 1).padStart(2, "0");
      const dd   = String(chosen.date.getDate()).padStart(2, "0");
      const yyyy = chosen.date.getFullYear(); // full 4-digit year
      return { label: `${mm}/${dd}/${yyyy}`, dte: chosen.dte };
    }

    function getStrike(price, action) {
      // Standard increment based on price
      const step = price < 25 ? 0.5 : price < 50 ? 1 : price < 100 ? 2 : price < 200 ? 5 : price < 500 ? 10 : 20;
      const snap = v => Math.round(v / step) * step;
      if (action === "BUY CALLS")   return round2(snap(price * 1.02));  // slightly OTM call
      if (action === "SELL PUTS")   return round2(snap(price * 0.95));  // OTM put (5% below)
      if (action === "CALLS or STOCK") return round2(snap(price * 1.01)); // near ATM
      if (action === "BUY PUTS")    return round2(snap(price * 0.98));  // slightly OTM put
      if (action === "SELL CALLS")  return round2(snap(price * 1.05));  // OTM call (5% above)
      if (action === "PUTS or SHORT") return round2(snap(price * 0.98));
      if (action === "PUTS")        return round2(snap(price * 0.97));
      return round2(snap(price));
    }

    function estimatePremium(price, strike, ivProxy, dte, isCall) {
      // Simplified ATM premium estimate: S × (IV/100) × sqrt(DTE/365) × 0.4
      if (!price || !dte) return null;
      const iv = (ivProxy || 40) / 100;
      const T  = dte / 365;
      const atmPrem = price * iv * Math.sqrt(T) * 0.4;
      // Adjust for moneyness
      const moneyness = isCall ? (price / strike) : (strike / price);
      const adj = moneyness > 1.05 ? 0.5 : moneyness > 1.02 ? 0.75 : moneyness > 0.98 ? 1.0 : 0.75;
      return round2(atmPrem * adj);
    }

    const _sigCache = handleMarket._sigCache || (handleMarket._sigCache = { data: null, ts: 0 });
    const SIG_TTL = 60 * 1000; // 1 min cache — matches frontend auto-refresh interval
    if (_sigCache.data && Date.now() - _sigCache.ts < SIG_TTL) {
      return writeJson(res, 200, _sigCache.data);
    }
    try {
      const UNIVERSE = [
        "SPY","QQQ","NVDA","TSLA","AAPL","META","AMZN","MSFT","AMD","NFLX",
        "COIN","MSTR","PLTR","SMCI","ARM","HOOD","MARA","RIOT","SOFI","RBLX",
        "UPST","AFRM","CRWD","NET","PANW","ZS","SNOW","DDOG","UBER","ABNB",
        "BBAI","SERV","RKLB","ASTS","IONQ","RGTI","SOUN","OKLO","SMR","CEG",
        "GLD","TLT","HYG","UNG","USO","IBIT","GBTC",
        "SPY","QQQ","IWM","UVXY","SMH","XLK","XLU","XLP",
      ];
      const CHUNK = 20;
      const chunks = [];
      for (let i = 0; i < UNIVERSE.length; i += CHUNK)
        chunks.push(UNIVERSE.slice(i, i + CHUNK));
      const settled = await Promise.allSettled(chunks.map(c => fetchYahooQuoteBatch(c)));
      const quotes  = settled.flatMap(r => r.status === "fulfilled" ? r.value : []);

      // Get VIX for market context
      const vixQ   = await fetchYahooQuoteBatch(["^VIX"]).catch(() => []);
      const vix    = Number(vixQ[0]?.regularMarketPrice || 0);
      const mktEnv = vix > 25 ? "RISK-OFF" : vix > 18 ? "CAUTION" : "RISK-ON";

      const signals = [];

      for (const q of quotes) {
        try {
          const sym    = String(q.symbol || "").toUpperCase();
          const price  = Number(q.regularMarketPrice || 0);
          if (price <= 0) continue;

          const chgPct = Number(q.regularMarketChangePercent || 0);
          const vol    = Number(q.regularMarketVolume || 0);
          const avgVol = Number(q.averageDailyVolume3Month || q.averageDailyVolume10Day || q.averageDailyVolume || 0);
          const rvol   = (avgVol > 0 && vol > 0) ? vol / avgVol : 1.0; // default 1.0 if missing

          const hi52   = Number(q.fiftyTwoWeekHigh || 0);
          const lo52   = Number(q.fiftyTwoWeekLow  || 0);
          const ma50   = Number(q.fiftyDayAverage   || q.regularMarketDayHigh * 0.97 || 0);
          const ma200  = Number(q.twoHundredDayAverage || 0);
          const prev   = Number(q.regularMarketPreviousClose || price);

          const yearPos = (hi52 > lo52 && price > 0) ? (price - lo52) / (hi52 - lo52) : 0.5;
          const ivProxy = (hi52 > lo52 && price > 0) ? Math.min(99, Math.round((hi52 - lo52) / price * 100 * 1.4)) : 40;

          // ── Score ────────────────────────────────────────────────────────────
          let score = 50;
          const reasons = [], contra = [];

          // MA trend (only if available)
          if (ma50 > 0 && price > ma50 * 1.01)  { score += 14; reasons.push(`Above MA50 $${round2(ma50)}`); }
          else if (ma50 > 0 && price < ma50 * 0.99) { score -= 12; contra.push(`Below MA50 $${round2(ma50)}`); }
          if (ma200 > 0 && price > ma200)         { score += 8;  reasons.push("Above MA200 — primary uptrend"); }
          else if (ma200 > 0 && price < ma200)    { score -= 8;  contra.push("Below MA200 — primary downtrend"); }
          if (ma50 > 0 && ma200 > 0 && ma50 > ma200) { score += 6; reasons.push("Golden cross — MA50 > MA200"); }

          // Day momentum — always available
          if (chgPct >= 5)       { score += 22; reasons.push(`+${chgPct.toFixed(1)}% — breakout momentum`); }
          else if (chgPct >= 3)  { score += 16; reasons.push(`+${chgPct.toFixed(1)}% — strong day`); }
          else if (chgPct >= 1)  { score += 8;  reasons.push(`+${chgPct.toFixed(1)}% — positive`); }
          else if (chgPct >= 0)  { score += 2; }
          else if (chgPct <= -5) { score -= 22; contra.push(`${chgPct.toFixed(1)}% — breakdown`); }
          else if (chgPct <= -3) { score -= 16; contra.push(`${chgPct.toFixed(1)}% — heavy selling`); }
          else if (chgPct <= -1) { score -= 8;  contra.push(`${chgPct.toFixed(1)}% — weak`); }

          // Volume confirmation
          if (rvol >= 3.0 && chgPct > 0)  { score += 20; reasons.push(`RVOL ${rvol.toFixed(1)}× — huge institutional interest`); }
          else if (rvol >= 2.0 && chgPct > 0) { score += 14; reasons.push(`RVOL ${rvol.toFixed(1)}× — strong volume`); }
          else if (rvol >= 1.3 && chgPct > 0) { score += 8;  reasons.push(`RVOL ${rvol.toFixed(1)}× — above-average volume`); }
          else if (rvol >= 2.0 && chgPct < 0) { score -= 14; contra.push(`RVOL ${rvol.toFixed(1)}× selling — distribution`); }
          else if (rvol >= 1.3 && chgPct < 0) { score -= 8;  contra.push(`RVOL ${rvol.toFixed(1)}× on down day`); }

          // 52-week position
          if (yearPos > 0.90)      { score += 10; reasons.push("At 52w high — price discovery"); }
          else if (yearPos > 0.75) { score += 6;  reasons.push("Upper 52w range"); }
          else if (yearPos < 0.15) { score -= 10; contra.push("Near 52w low — downtrend"); }
          else if (yearPos < 0.30) { score -= 4;  contra.push("Lower 52w range"); }

          // Market env
          if (mktEnv === "RISK-OFF") score -= 8;
          if (mktEnv === "CAUTION")  score -= 3;

          score = Math.max(5, Math.min(100, Math.round(score)));

          // ── Classify signal ───────────────────────────────────────────────
          let action = null, confidence = "", rationale = [], optionType = null, optionNote = "";

          if (score >= 68 && chgPct > 0) {
            action = "LONG";
            confidence = score >= 85 ? "HIGH" : score >= 75 ? "MEDIUM" : "LOW";
            rationale = reasons.slice(0, 3);
            if (ivProxy < 40)      { optionType = "BUY CALLS";     optionNote = `IV ${ivProxy} — options cheap`; }
            else if (ivProxy > 65) { optionType = "SELL PUTS";     optionNote = `IV ${ivProxy} — sell puts to enter`; }
            else                   { optionType = "CALLS or STOCK"; optionNote = `IV ${ivProxy}`; }
          } else if (score <= 35 && chgPct < 0) {
            action = "SHORT / AVOID";
            confidence = score <= 20 ? "HIGH" : score <= 28 ? "MEDIUM" : "LOW";
            rationale = contra.slice(0, 3);
            if (ivProxy < 40)      { optionType = "BUY PUTS";      optionNote = `IV ${ivProxy} — puts cheap`; }
            else if (ivProxy > 65) { optionType = "SELL CALLS";    optionNote = `IV ${ivProxy} — sell calls`; }
            else                   { optionType = "PUTS or SHORT";  optionNote = `IV ${ivProxy}`; }
          } else if (score >= 55 && chgPct > 0) {
            // Always capture developing bullish setups
            action = "WATCH";
            confidence = "LOW";
            rationale = reasons.length ? reasons.slice(0, 2) : [`+${chgPct.toFixed(1)}% with score ${score}`];
            optionType = score >= 62 ? "CALLS or STOCK" : null;
            optionNote = `IV ${ivProxy} — wait for stronger confirmation`;
          } else if (score <= 45 && chgPct < 0) {
            // Capture weakening stocks too
            action = "WATCH SHORT";
            confidence = "LOW";
            rationale = contra.length ? contra.slice(0, 2) : [`${chgPct.toFixed(1)}% weakness`];
            optionType = score <= 38 ? "PUTS" : null;
            optionNote = `IV ${ivProxy} — setup developing`;
          }

          if (!action) continue;

          const entry   = round2(price);
          const stopPct = action === "SHORT / AVOID" ? 1.08 : 0.92;
          const stop    = round2(ma50 > 0 && action === "LONG" ? Math.max(ma50 * 0.97, price * 0.92) : price * stopPct);
          const target1 = round2(action.startsWith("SHORT") ? price * 0.90 : (hi52 > price * 1.02 ? Math.min(price * 1.12, hi52) : price * 1.12));
          const target2 = round2(action.startsWith("SHORT") ? price * 0.78 : (hi52 > price * 1.02 ? hi52 * 1.05 : price * 1.22));
          const rr      = stop !== entry ? round2(Math.abs(target1 - entry) / Math.abs(entry - stop)) : 0;

          // ── Options-specific trade details ──────────────────────────────────
          let optDetail = null;
          if (optionType && !optionType.includes("WAIT")) {
            const expiry = getNearestExpiry(21);
            const strike = getStrike(price, optionType);
            const isCall = optionType.includes("CALL");
            const isPut  = optionType.includes("PUT");
            const prem   = estimatePremium(price, strike, ivProxy, expiry.dte, isCall);
            const contracts = prem > 0 ? Math.max(1, Math.round(500 / (prem * 100))) : 1; // ~$500 risk

            optDetail = {
              type:    isCall ? "CALL" : isPut ? "PUT" : null,
              action:  optionType.includes("BUY") ? "BUY" : "SELL",
              strike,
              expiry:  expiry.label,
              dte:     expiry.dte,
              estPrem: prem,
              contracts,
              // Full trade string e.g. "BUY 2x NVDA $230 CALL 07/18/25 ~$3.40/contract"
              tradeStr: prem
                ? `${optionType.includes("BUY") ? "BUY" : "SELL"} ${contracts}× ${sym} $${strike} ${isCall ? "CALL" : "PUT"} ${expiry.label} ~$${prem}/contract`
                : `${optionType} ${sym} $${strike} ${expiry.label}`,
            };
          }

          signals.push({
            sym, action, confidence, score,
            entry, stop, target1, target2, rr,
            chgPct: round2(chgPct), rvol: round2(rvol),
            ma50: round2(ma50), ma200: round2(ma200),
            hi52: round2(hi52), ivProxy, optionType, optionNote,
            optDetail,
            rationale: rationale.length ? rationale : [chgPct > 0 ? `+${chgPct.toFixed(1)}% momentum` : `${chgPct.toFixed(1)}% weakness`],
            mktEnv, ts: new Date().toISOString(),
          });
        } catch {}
      }

      // Sort: LONG (high conf) first, then SHORT, then WATCH — always return something
      // If nothing scored above thresholds, show the top movers by score anyway
      signals.sort((a, b) => {
        const confOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        if (a.confidence !== b.confidence) return (confOrder[a.confidence] || 2) - (confOrder[b.confidence] || 2);
        return b.score - a.score;
      });

      const sigResult = {
        ok: true,
        signals: signals.slice(0, 18),
        mktEnv, vix: round2(vix),
        scannedAt: new Date().toISOString(),
      };
      _sigCache.data = sigResult;
      _sigCache.ts   = Date.now();
      return writeJson(res, 200, sigResult);
    } catch (e) {
      return writeJson(res, 502, { ok: false, error: e.message, signals: [] });
    }
  }

  // ── GET /api/market/smc?symbol=NVDA ─────────────────────────────────────────
  if (pathname === "/api/market/smc" && req.method === "GET") {
    const symbol = (requestUrl.searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) return writeJson(res, 400, { error: "symbol required" });
    try {
      const { detectFVGs, detectOrderBlocks, detectBOSChoCh, computeVolumeProfile, detectLiquidityLevels } = require("../smc-engine");
      const bars = await fetchYahooBars(symbol, "3mo", "1d");
      if (!bars.length) return writeJson(res, 200, { ok: false, error: "No bar data" });
      const price = bars[bars.length - 1].close;
      return writeJson(res, 200, {
        ok: true, symbol, price: round2(price),
        fvgs:       detectFVGs(bars),
        orderBlocks: detectOrderBlocks(bars),
        ...detectBOSChoCh(bars),
        volumeProfile: computeVolumeProfile(bars),
        liquidity:  detectLiquidityLevels(bars),
        scannedAt:  new Date().toISOString(),
      });
    } catch (e) {
      return writeJson(res, 502, { ok: false, error: e.message });
    }
  }

  // ── GET /api/market/tick-trin ─────────────────────────────────────────────
  if (pathname === "/api/market/tick-trin" && req.method === "GET") {
    try {
      // Try Yahoo for VIX + VVIX first, then compute breadth-based TICK proxy
      const [vixQ, breadthQ] = await Promise.allSettled([
        fetchYahooQuoteBatch(["^VIX", "^VVIX"]).catch(() => []),
        fetchYahooQuoteBatch(["SPY","QQQ","IWM","XLK","XLF","XLE","XLV","XLI","XLY","XLP","XLU","XLRE","XLB","XLC"]).catch(() => []),
      ]);

      const vixData = vixQ.status === "fulfilled" ? vixQ.value : [];
      const bData   = breadthQ.status === "fulfilled" ? breadthQ.value : [];

      const vix  = round2(Number(vixData.find(q=>q.symbol==="^VIX")?.regularMarketPrice || 0));
      const vvix = round2(Number(vixData.find(q=>q.symbol==="^VVIX")?.regularMarketPrice || 0));
      const vixPct = round2(Number(vixData.find(q=>q.symbol==="^VIX")?.regularMarketChangePercent || 0));

      // Compute TICK proxy: count advancing vs declining sector ETFs
      let adv = 0, dec = 0, totalChg = 0;
      for (const q of bData) {
        const chg = Number(q.regularMarketChangePercent || 0);
        if (chg > 0) adv++; else if (chg < 0) dec++;
        totalChg += chg;
      }
      const tickProxy = Math.round((adv - dec) / Math.max(bData.length, 1) * 1000);
      const avgChg    = bData.length ? round2(totalChg / bData.length) : 0;
      const volRatios = bData.map(q => {
        const v = Number(q.regularMarketVolume||0);
        const a = Number(q.averageDailyVolume3Month||q.averageDailyVolume10Day||1);
        return a > 0 ? v / a : 1;
      });
      const trinProxy = round2(volRatios.length
        ? (dec / Math.max(adv,1)) / (volRatios.filter((_,i)=>Number(bData[i]?.regularMarketChangePercent||0)<0).reduce((a,b)=>a+b,0) / Math.max(volRatios.filter((_,i)=>Number(bData[i]?.regularMarketChangePercent||0)>0).reduce((a,b)=>a+b,0),0.01))
        : 1);

      const tickSignal = tickProxy > 600 ? "EXTREME BUYING" : tickProxy > 300 ? "BROAD BUYING" : tickProxy < -600 ? "EXTREME SELLING" : tickProxy < -300 ? "BROAD SELLING" : "NEUTRAL";
      const trinSignal = trinProxy < 0.7 ? "VERY BULLISH" : trinProxy < 0.9 ? "BULLISH" : trinProxy < 1.1 ? "NEUTRAL" : trinProxy < 1.4 ? "BEARISH" : "VERY BEARISH";

      return writeJson(res, 200, {
        ok: true,
        data: {
          TICK:  { price: tickProxy, label: "NYSE TICK (proxy)" },
          TRIN:  { price: isFinite(trinProxy) ? trinProxy : 1, label: "TRIN (proxy)" },
          VIX:   { price: vix, pct: vixPct, label: "CBOE VIX" },
          VVIX:  { price: vvix, label: "VIX of VIX" },
          breadth: { adv, dec, total: bData.length, avgChg },
        },
        tickSignal, trinSignal,
        scannedAt: new Date().toISOString(),
      });
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: e.message, data: {} });
    }
  }

  // ── GET /api/market/short-changes — weekly short interest change leaders ───
  if (pathname === "/api/market/short-changes" && req.method === "GET") {
    try {
      const UNIVERSE = ["NVDA","TSLA","AAPL","META","AMD","COIN","MSTR","PLTR","SMCI","ARM",
        "HOOD","MARA","RIOT","SOFI","UPST","AFRM","CRWD","NET","SNOW","DDOG",
        "BBAI","SERV","RKLB","ASTS","IONQ","RGTI","OKLO","SMR","CEG","GEV",
        "IBIT","HYG","SPY","QQQ","IWM","SMH","XLK","ABNB","UBER","DASH"];
      const chunks = [];
      for (let i = 0; i < UNIVERSE.length; i += 20) chunks.push(UNIVERSE.slice(i, i + 20));
      const settled = await Promise.allSettled(chunks.map(c => fetchYahooQuoteBatch(c)));
      const quotes = settled.flatMap(r => r.status === "fulfilled" ? r.value : []);

      const stocks = quotes.map(q => {
        const sym    = String(q.symbol || "").toUpperCase();
        const price  = round2(Number(q.regularMarketPrice || 0));
        const sfRaw  = Number(q.shortPercentOfFloat || 0);
        const sf     = sfRaw > 1 ? round2(sfRaw) : round2(sfRaw * 100);
        const days   = round2(Number(q.shortRatio || 0));
        const shares = Number(q.sharesShortPriorMonth || 0);
        const curr   = Number(q.sharesShort || 0);
        const chgPct = (shares > 0 && curr > 0) ? round2((curr - shares) / shares * 100) : 0;
        return { sym, price, shortFloat: sf, daysToCover: days, shortChange: chgPct };
      }).filter(s => s.price > 0 && s.shortFloat > 0);

      const increasing = [...stocks].sort((a,b) => b.shortChange - a.shortChange).slice(0, 8);
      const covering   = [...stocks].sort((a,b) => a.shortChange - b.shortChange).slice(0, 8);
      const highShort  = [...stocks].sort((a,b) => b.shortFloat - a.shortFloat).slice(0, 10);

      return writeJson(res, 200, { ok: true, increasing, covering, highShort, scannedAt: new Date().toISOString() });
    } catch (e) {
      return writeJson(res, 502, { ok: false, error: e.message });
    }
  }

  // ── GET /api/market/darkpool-heatmap — dark pool activity vs avg by symbol ─
  if (pathname === "/api/market/darkpool-heatmap" && req.method === "GET") {
    const { UNUSUAL_WHALES_API_KEY } = require("../config");
    const uwKey = UNUSUAL_WHALES_API_KEY || providerKeys?.unusualWhales;
    if (!uwKey) return writeJson(res, 200, { ok: false, error: "Unusual Whales key not configured", stocks: [] });
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 8000);
      const r = await fetch("https://api.unusualwhales.com/api/darkpool/recent", {
        headers: { Authorization: "Bearer " + uwKey, Accept: "application/json" },
        signal: controller.signal,
      });
      if (!r.ok) throw new Error("UW HTTP " + r.status);
      const data = await r.json();
      const raw  = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      // Group by ticker, sum premium
      const byTicker = {};
      for (const p of raw) {
        const sym = String(p.ticker || p.symbol || "").toUpperCase();
        if (!sym) continue;
        if (!byTicker[sym]) byTicker[sym] = { sym, prints: 0, value: 0 };
        byTicker[sym].prints++;
        byTicker[sym].value += Number(p.premium || p.total_value || 0);
      }
      const stocks = Object.values(byTicker)
        .sort((a,b) => b.value - a.value)
        .slice(0, 20)
        .map(s => ({ ...s, value: round2(s.value / 1e6) })); // $M
      return writeJson(res, 200, { ok: true, stocks, scannedAt: new Date().toISOString() });
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: e.message, stocks: [] });
    }
  }

  // ── GET /api/market/earnings-calendar ────────────────────────────────────
  if (pathname === "/api/market/earnings-calendar" && req.method === "GET") {
    const _ec = handleMarket._ecCache || (handleMarket._ecCache = { data: null, ts: 0 });
    if (_ec.data && Date.now() - _ec.ts < 30 * 60 * 1000) return writeJson(res, 200, _ec.data);
    try {
      const UNIVERSE = [
        "NVDA","TSLA","AAPL","META","AMZN","MSFT","AMD","NFLX","COIN","MSTR",
        "PLTR","SMCI","ARM","HOOD","MARA","CRWD","NET","PANW","ZS","SNOW",
        "DDOG","UBER","ABNB","DASH","PINS","RDDT","SOFI","UPST","AFRM",
        "BBAI","SERV","RKLB","ASTS","IONQ","RGTI","OKLO","SMR","CEG","GEV",
        "SPY","QQQ","IWM","SMH","XLK","IBIT","GLD","GOOGL","AVGO","ORCL",
      ];
      const chunks = [];
      for (let i = 0; i < UNIVERSE.length; i += 20) chunks.push(UNIVERSE.slice(i, i + 20));
      const settled = await Promise.allSettled(chunks.map(c => fetchYahooQuoteBatch(c)));
      const quotes  = settled.flatMap(r => r.status === "fulfilled" ? r.value : []);
      const today   = Date.now();
      const events  = [];
      for (const q of quotes) {
        const sym = String(q.symbol || "").toUpperCase();
        const earningsTs = Number(
          (Array.isArray(q.earningsTimestamp) ? q.earningsTimestamp[0] : q.earningsTimestamp) || 0
        );
        if (!earningsTs) continue;
        const earnDate = new Date(earningsTs * 1000);
        const dte = Math.round((earnDate - today) / 86400000);
        const price = round2(Number(q.regularMarketPrice || 0));
        const hi52  = Number(q.fiftyTwoWeekHigh || 0);
        const lo52  = Number(q.fiftyTwoWeekLow  || 0);
        // Implied expected move proxy from IV
        const iv = (hi52 > lo52 && price > 0) ? (hi52 - lo52) / price : 0;
        const expMove = round2(iv / Math.sqrt(252) * 100);
        const epsTTM  = round2(Number(q.epsTrailingTwelveMonths || 0));
        const epsEst  = round2(Number(q.epsForward || 0));
        events.push({
          sym, price,
          date: earnDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }),
          dte, expMove,
          epsTTM, epsEst,
          timing: q.earningsTimestampStart ? "Pre-Market" : q.earningsTimestampEnd ? "After-Hours" : "TBD",
          mktCap: round2((Number(q.marketCap) || 0) / 1e9),
        });
      }
      events.sort((a, b) => a.dte - b.dte);
      const result = { ok: true, events: events.slice(0, 40), scannedAt: new Date().toISOString() };
      _ec.data = result; _ec.ts = Date.now();
      return writeJson(res, 200, result);
    } catch (e) { return writeJson(res, 502, { ok: false, error: e.message, events: [] }); }
  }

  // ── GET /api/market/econ-calendar ─────────────────────────────────────────
  if (pathname === "/api/market/econ-calendar" && req.method === "GET") {
    // Key upcoming events with estimated dates (updated quarterly)
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const nextFriday = (d) => { const dt = new Date(d); while (dt.getDay() !== 5) dt.setDate(dt.getDate()+1); return dt; };
    const thirdFriday = (yr, mo) => { const d = new Date(yr,mo,1); let c=0; while(c<3){if(d.getDay()===5)c++;if(c<3)d.setDate(d.getDate()+1);} return d; };
    // Approximate upcoming dates for key events
    const events = [
      // These are estimated — in production would fetch from an API
      { name: "FOMC Meeting",   tag: "FED",  impact: "HIGH",  note: "Rate decision + press conference. Expect vol spike.",        date: thirdFriday(y, m+1) },
      { name: "CPI Release",    tag: "CPI",  impact: "HIGH",  note: "Inflation data. Hot print → risk-off; cool → risk-on.",      date: new Date(y, m, 10) },
      { name: "NFP Jobs Report",tag: "NFP",  impact: "HIGH",  note: "First Friday of month. Strong jobs = hawkish Fed risk.",     date: nextFriday(new Date(y, m, 1)) },
      { name: "PCE Inflation",  tag: "PCE",  impact: "HIGH",  note: "Fed's preferred inflation gauge. Market-moving.",            date: new Date(y, m, 28) },
      { name: "PPI Data",       tag: "PPI",  impact: "MED",   note: "Producer prices — leads CPI by 1-2 months.",                 date: new Date(y, m, 11) },
      { name: "Retail Sales",   tag: "RTLS", impact: "MED",   note: "Consumer spending health. Weak → recession fears.",          date: new Date(y, m, 15) },
      { name: "GDP Estimate",   tag: "GDP",  impact: "MED",   note: "Economic growth. Two negatives = technical recession.",      date: new Date(y, m+1, 28) },
      { name: "FOMC Minutes",   tag: "MINS", impact: "MED",   note: "Full meeting notes — clues on future rate path.",            date: new Date(y, m+1, 20) },
    ].map(ev => {
      const dte = Math.round((ev.date - now) / 86400000);
      return {
        name: ev.name, tag: ev.tag, impact: ev.impact, note: ev.note,
        date: ev.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        dte, countdown: dte <= 0 ? "TODAY" : dte === 1 ? "TOMORROW" : `in ${dte}d`,
        isUrgent: dte >= 0 && dte <= 2,
      };
    }).filter(e => e.dte >= -1).sort((a,b) => a.dte - b.dte);
    return writeJson(res, 200, { ok: true, events });
  }

  // ── GET /api/market/econ-events — LIVE estimates/actuals from FMP economic calendar ──
  if (pathname === "/api/market/econ-events" && req.method === "GET") {
    const keys = resolveProviderKeys(searchParams);
    const fmpKey = keys.fmp;
    if (!fmpKey) return writeJson(res, 200, { ok: false, reason: "no-fmp-key", events: [] });
    try {
      const now = new Date();
      const from = now.toISOString().slice(0, 10);
      const to = new Date(now.getTime() + 21 * 86400000).toISOString().slice(0, 10);
      const url = `https://financialmodelingprep.com/api/v3/economic_calendar?from=${from}&to=${to}&apikey=${encodeURIComponent(fmpKey)}`;
      const raw = await withTimeout(fetch(url).then(r => r.ok ? r.json() : []), 12000, []);
      // Keep only the big US market-movers
      const KEY = [
        { match: /CPI/i, tag: "CPI" }, { match: /Core CPI/i, tag: "CPI" },
        { match: /PCE/i, tag: "PCE" }, { match: /Federal Funds|FOMC|Interest Rate Decision/i, tag: "FED" },
        { match: /Nonfarm|Non-Farm|Unemployment Rate/i, tag: "JOBS" }, { match: /PPI/i, tag: "PPI" },
        { match: /Retail Sales/i, tag: "RETAIL" }, { match: /GDP/i, tag: "GDP" },
      ];
      const events = (Array.isArray(raw) ? raw : [])
        .filter(e => (e.country === "US" || e.country === "USD" || e.currency === "USD"))
        .map(e => {
          const k = KEY.find(x => x.match.test(e.event || ""));
          if (!k) return null;
          return { tag: k.tag, event: e.event, date: e.date, impact: e.impact || "",
            estimate: e.estimate, previous: e.previous, actual: e.actual };
        })
        .filter(Boolean)
        .filter(e => e.impact === "High" || ["CPI","PCE","FED","JOBS"].includes(e.tag))
        .slice(0, 8);
      return writeJson(res, 200, { ok: true, events });
    } catch (err) {
      console.error("[econ-events] error:", err?.message);
      return writeJson(res, 200, { ok: false, events: [] });
    }
  }

  // GET /api/market/chart?symbol=AMD&interval=1d&range=90d (trade planner)
  if (pathname === '/api/market/chart') {
    const sym = (requestUrl.searchParams.get('symbol')||'').toUpperCase().replace(/[^A-Z0-9.^-]/g,'').slice(0,10);
    const interval = requestUrl.searchParams.get('interval')||'1d';
    const range = requestUrl.searchParams.get('range')||'90d';
    if(!sym) return writeJson(res,400,{error:'symbol required'});
    try {
      const https = require('https');
      const data = await new Promise((resolve,reject)=>{
        const req = https.request({
          hostname:'query1.finance.yahoo.com',
          path:'/v8/finance/chart/'+encodeURIComponent(sym)+'?interval='+interval+'&range='+range,
          method:'GET',
          headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json'},
        }, response=>{
          let d='';
          response.on('data',c=>d+=c);
          response.on('end',()=>{try{resolve(JSON.parse(d));}catch{reject(new Error('Bad JSON'));}});
        });
        req.on('error',reject);
        req.setTimeout(8000,()=>{req.destroy();reject(new Error('Yahoo timeout'));});
        req.end();
      });
      res.writeHead(200,{'Content-Type':'application/json'});
      return res.end(JSON.stringify(data));
    } catch(e) { return writeJson(res,502,{error:e.message}); }
  }

  return writeJson(res, 404, { error: 'Unknown market endpoint.' });
}

module.exports = handleMarket;
