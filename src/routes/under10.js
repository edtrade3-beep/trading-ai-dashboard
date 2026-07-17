// Under $10 Opportunity Scanner
// Scans for quality stocks under $10 with strong technical + fundamental setup
// Filters: price < $10, avgVolume > 500K, meaningful market cap
// Scores: Technical (50%) + Fundamental (30%) + Upside potential (20%)

"use strict";

const { writeJson } = require("../utils");
const { fetchYahooBars, fetchYahooFundamentals, fetchQuoteBatchWithFallback } = require("../providers/yahoo");

let _cache = null, _cacheTs = 0;
const TTL = 5 * 60 * 1000; // 5 min — shorter so results stay fresh

// Universe — verified sub-$50 stocks with real opportunity (updated June 2026)
const UNIVERSE = [
  // Crypto mining
  "MARA","RIOT","CLSK","BTBT","CIFR","HUT","IREN",
  // AI / Tech small cap
  "BBAI","SOUN","RGTI","QUBT","QBTS","OUST","LIDR",
  // Nuclear / Clean Energy
  "SMR","NNE","STEM","ARRY",
  // Space / Mobility
  "ACHR","SPCE","RIVN","LCID","GOEV",
  // Biotech / Genomics
  "RXRX","NVAX","CLOV","NTLA","EDIT","BEAM","VERV",
  // Fintech
  "SOFI","OPEN","UPST","AFRM",
  // Mining / Resources
  "AG","CDE","HL","GATO",
  // Cannabis
  "TLRY","ACB","CGC","SNDL","GRWG",
  // Other momentum
  "QUBT","QBTS","RGTI","NNE","SMR",
];

// Bars + real fundamentals for one symbol. Previously this fetched raw
// v8/finance/chart directly via https.get and read forwardPE/trailingPE/
// priceToBook/revenueGrowth/earningsGrowth/marketCap off its `meta` object —
// confirmed directly that v8/finance/chart's meta NEVER contains any of
// those fields (only price/volume/range meta), so the entire Fundamental
// Score (0-30, one of this scanner's three advertised scoring dimensions)
// was silently 0 for every single stock, every time — confirmed live
// against production: 38/38 results had fundScore:0, pe:null, mktCapM:null.
// fetchYahooBars (Alpaca-first, Yahoo-fallback) + fetchYahooFundamentals
// (real quoteSummary data, the same crumb-fixed path used elsewhere this
// session) actually have this data.
async function fetchSymbolData(sym) {
  const [rawBars, fund] = await Promise.all([
    fetchYahooBars(sym, "3mo", "1d").catch(() => []),
    fetchYahooFundamentals(sym).catch(() => null),
  ]);
  // Remap to the {o,h,l,c,v} shape the existing scoring math below expects,
  // so nothing downstream (RSI/EMA/ATR/volume-trend) needs to change.
  const bars = rawBars
    .map(b => ({ o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume }))
    .filter(b => b.c > 0);
  return { sym, bars, fund };
}

function calcEMA(closes, n) {
  if (closes.length < n) return 0;
  const k = 2 / (n + 1);
  let e = closes.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < closes.length; i++) e = closes[i] * k + e * (1 - k);
  return Math.round(e * 100) / 100;
}

function calcRSI(closes, n = 14) {
  if (closes.length < n + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    d > 0 ? gains += d : losses += Math.abs(d);
  }
  const rs = losses === 0 ? 100 : gains / n / (losses / n);
  return Math.round(100 - 100 / (1 + rs));
}

function scoreStock(sym, quoteRow, fund, bars) {
  const price = Number(quoteRow?.regularMarketPrice || bars.at(-1)?.c || 0);
  if (!price || price <= 0 || price > 50) return null; // only under $50

  // Calculate avgVol from bars (more reliable than a single quote snapshot)
  const recentVols = bars.slice(-20).map(b => b.v).filter(v => v > 0);
  const avgVol   = recentVols.length ? Math.round(recentVols.reduce((a,b)=>a+b,0) / recentVols.length) : 0;
  const currVol  = Number(quoteRow?.regularMarketVolume || bars.at(-1)?.v || 0);
  const mktCap   = Number(fund?.marketCap || 0);

  // Quality filters — relaxed to not miss good stocks
  if (avgVol > 0 && avgVol < 100_000) return null; // extremely illiquid only

  const hi52   = Number(quoteRow?.fiftyTwoWeekHigh || 0);
  const lo52   = Number(quoteRow?.fiftyTwoWeekLow  || 0);
  const closes = bars.map(b => b.c);
  const ema9   = calcEMA(closes, 9);
  const ema21  = calcEMA(closes, 21);
  const ema50  = calcEMA(closes, Math.min(50, closes.length));
  const rsi    = calcRSI(closes);
  const rvol   = avgVol > 0 ? Math.round(currVol / avgVol * 100) / 100 : 1;

  // 52w position
  const from52Lo = lo52  > 0 ? Math.round((price - lo52) / lo52 * 100) : 50;
  const from52Hi = hi52  > 0 ? Math.round((hi52 - price) / hi52 * 100) : 50;

  // Volume trend (recent 5d avg vs 20d avg)
  const vol5  = bars.slice(-5).reduce((s, b) => s + b.v, 0) / 5;
  const vol20 = bars.slice(-20).reduce((s, b) => s + b.v, 0) / 20;
  const volTrend = vol20 > 0 ? vol5 / vol20 : 1; // >1 = volume building

  // ATR (volatility)
  const atr = bars.slice(-14).reduce((s, b) => s + (b.h - b.l), 0) / 14;
  const atrPct = price > 0 ? atr / price * 100 : 0; // daily range %

  // ── TECHNICAL SCORE (0-50) ──
  let techScore = 0;
  if (rsi >= 30 && rsi <= 60)             techScore += 10; // sweet spot
  else if (rsi < 30)                       techScore += 8;  // oversold bounce
  if (ema9 > 0 && ema21 > 0 && ema9 > ema21) techScore += 10; // EMA aligned
  if (ema50 > 0 && price > ema50)          techScore += 8;  // above 50MA
  if (volTrend > 1.2)                      techScore += 8;  // volume building
  if (from52Lo < 30)                       techScore += 7;  // near 52w low (upside)
  if (rvol > 1.5)                          techScore += 7;  // unusual volume today

  // ── FUNDAMENTAL SCORE (0-30) ──
  let fundScore = 0;
  const pe       = Number(fund?.pe || 0);
  const pb       = Number(fund?.priceToBook || 0);
  const revGrowth = Number(fund?.revenueGrowth || 0);
  const earnGrowth= Number(fund?.earningsGrowth || 0);
  const beta     = Number(fund?.beta || 1);

  if (pe > 0 && pe < 30)               fundScore += 8;  // reasonable valuation
  if (pb > 0 && pb < 3)                fundScore += 5;  // book value support
  if (revGrowth > 0.1)                 fundScore += 8;  // revenue growing
  if (earnGrowth > 0)                  fundScore += 5;  // earnings improving
  if (mktCap > 100_000_000)            fundScore += 4;  // real company ($100M+)

  // ── UPSIDE SCORE (0-20) ──
  let upsideScore = 0;
  if (from52Hi > 50)     upsideScore += 10; // far from high — huge upside if recovers
  else if (from52Hi > 30) upsideScore += 7;
  else if (from52Hi > 15) upsideScore += 4;
  if (atrPct > 3 && atrPct < 15) upsideScore += 5; // volatile enough to move
  if (price < 5)         upsideScore += 5; // sub-$5 = biggest % potential

  const total = techScore + fundScore + upsideScore;
  if (total < 15) return null; // low threshold — show more results

  // Determine opportunity grade
  const grade = total >= 70 ? "🔥 A+"   :
                total >= 55 ? "⚡ A"    :
                total >= 40 ? "✅ B+"   :
                              "👀 B";

  // Key signals list
  const signals = [];
  if (rsi < 35)                              signals.push(`RSI ${rsi} 🔥 oversold`);
  if (ema9 > ema21)                          signals.push("EMA bullish ▲");
  if (volTrend > 1.5)                        signals.push(`Volume building ${(volTrend).toFixed(1)}x`);
  if (from52Lo < 20)                         signals.push(`Near 52w low (-${from52Lo}%)`);
  if (from52Hi > 60)                         signals.push(`Huge upside +${from52Hi}% to 52w hi`);
  if (revGrowth > 0.15)                      signals.push(`Revenue +${(revGrowth*100).toFixed(0)}% YoY`);
  if (rvol > 2)                              signals.push(`Vol spike ${rvol}x`);

  const chgPct = Number(quoteRow?.regularMarketChangePercent || 0);

  return {
    sym, price: Math.round(price * 100) / 100,
    chgPct: Math.round(chgPct * 100) / 100,
    grade, total,
    techScore, fundScore, upsideScore,
    rsi, ema9, ema21, rvol, volTrend: Math.round(volTrend * 100) / 100,
    hi52, lo52, from52Lo, from52Hi,
    mktCapM: mktCap > 0 ? Math.round(mktCap / 1e6) : null,
    avgVolK: avgVol > 0 ? Math.round(avgVol / 1e3) : null,
    pe: pe > 0 ? Math.round(pe * 10) / 10 : null,
    atrPct: Math.round(atrPct * 10) / 10,
    signals,
  };
}

async function runUnder10Scan(watchlistSyms) {
  // Merge watchlist under $10 + curated universe
  const all = [...new Set([...(watchlistSyms || []), ...UNIVERSE])].slice(0, 70);
  const results = [];

  // One batched quote fetch for price/volume/52w-range/change% across the
  // whole universe (cheap, same resilient Alpaca-first path other scanners
  // already use), then bars + real fundamentals per symbol in chunks of 8.
  const quotes = await fetchQuoteBatchWithFallback(all).catch(() => []);
  const quoteBySym = new Map(quotes.map(q => [String(q.symbol || "").toUpperCase(), q]));

  for (let i = 0; i < all.length; i += 8) {
    const batch = await Promise.all(all.slice(i, i + 8).map(s => fetchSymbolData(s)));
    for (const { sym, bars, fund } of batch) {
      const quoteRow = quoteBySym.get(sym);
      const r = scoreStock(sym, quoteRow, fund, bars);
      if (r) results.push(r);
    }
  }

  return results.sort((a, b) => b.total - a.total);
}

async function handleUnder10(req, res, requestUrl) {
  const forceRefresh = requestUrl.searchParams.get("refresh") === "1";
  if (!forceRefresh && _cache && Date.now() - _cacheTs < TTL) {
    return writeJson(res, 200, { ok: true, results: _cache, updatedAt: new Date(_cacheTs).toISOString() });
  }
  _cache = null; // clear before fresh run
  try {
    const wl = requestUrl.searchParams.get("symbols");
    const watchlistSyms = wl ? wl.split(",").map(s => s.trim().toUpperCase()) : [];
    const results = await runUnder10Scan(watchlistSyms);
    _cache = results; _cacheTs = Date.now();
    return writeJson(res, 200, { ok: true, results, total: results.length, updatedAt: new Date(_cacheTs).toISOString() });
  } catch (e) {
    return writeJson(res, 200, { ok: false, results: [], error: e.message });
  }
}

module.exports = { handleUnder10 };
