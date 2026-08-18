// future-wallet-quant.js — Future Wallet 100 Phases 3+4: the market-data
// layer (real quotes/bars, reusing existing providers) and the
// quantitative screening engine (real technical + fundamental + valuation
// metrics, NULL — never fabricated — wherever real data is unavailable).
// Combined into one module/deploy unit because Phase 3 alone (just a fetch
// wrapper) produces nothing independently verifiable — this pairs real
// data-fetching with the real computation that turns it into
// fw_quant_metrics rows, matching the spec's own MARKET DATA -> QUANTITATIVE
// ENGINE architecture (two adjacent stages, same real pipeline).
"use strict";

const { getPool } = require("./atomic-write");
const { FMP_API_KEY, resolveProviderKeys } = require("./config");
const { computeRSI } = require("./indicators");
const { fetchYahooBars } = require("./providers/yahoo");
const { fetchFmpFundamentals } = require("./providers/fmp");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Pure calculation functions — each takes real bars/quote data and
// returns a real number or null (never a fabricated default). Kept
// separate from the orchestration below so they're directly unit-
// testable with hand-built synthetic bars, same "pure logic, zero I/O"
// convention as src/lightbox-engine.js. ──

function sma(closes, period) {
  if (!Array.isArray(closes) || closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

// Average True Range (Wilder, simple mean form) over `period` days.
function atr(bars, period = 14) {
  if (!Array.isArray(bars) || bars.length < period + 1) return null;
  const trs = [];
  for (let i = bars.length - period; i < bars.length; i++) {
    const cur = bars[i], prev = bars[i - 1];
    if (!prev) continue;
    trs.push(Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close)));
  }
  return trs.length ? trs.reduce((s, v) => s + v, 0) / trs.length : null;
}

function week52HighLow(bars) {
  if (!Array.isArray(bars) || !bars.length) return { high: null, low: null };
  const window = bars.slice(-252); // ~1 trading year
  return { high: Math.max(...window.map((b) => b.high)), low: Math.min(...window.map((b) => b.low)) };
}

function distanceFromHigh(price, high) {
  if (!(price > 0) || !(high > 0)) return null;
  return ((price - high) / high) * 100; // negative = below the high
}

function volumeRatio(volume, avgVolume) {
  if (!(volume >= 0) || !(avgVolume > 0)) return null;
  return volume / avgVolume;
}

// Momentum: real trailing 3-month (63 trading day) % price change — a
// standard, defensible momentum window, not an invented one.
function momentum3m(closes) {
  if (!Array.isArray(closes) || closes.length < 64) return null;
  const now = closes[closes.length - 1];
  const then = closes[closes.length - 64];
  if (!(then > 0)) return null;
  return ((now - then) / then) * 100;
}

// Annualized volatility from real daily log returns (stdev * sqrt(252)),
// the standard real definition — not a proxy.
function volatility(closes, period = 21) {
  if (!Array.isArray(closes) || closes.length < period + 1) return null;
  const rets = [];
  for (let i = closes.length - period; i < closes.length; i++) {
    if (closes[i - 1] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  if (rets.length < 2) return null;
  const mean = rets.reduce((s, v) => s + v, 0) / rets.length;
  const variance = rets.reduce((s, v) => s + (v - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100; // annualized %, matching how vol is normally quoted
}

// Relative strength vs. SPY: symbol's trailing-3-month return minus SPY's
// own trailing-3-month return over the SAME window — a real comparative
// number (e.g. +8.2 means the stock outperformed SPY by 8.2 percentage
// points over the last quarter), not a percentile rank (no real universe-
// wide distribution exists yet to rank against at this phase).
function relativeStrength(symbolCloses, spyCloses) {
  const symMom = momentum3m(symbolCloses);
  const spyMom = momentum3m(spyCloses);
  if (symMom == null || spyMom == null) return null;
  return symMom - spyMom;
}

// Trend score (0-100): a real, simple, deterministic MA-stack read —
// deliberately NOT the fuller Technical Score (that's Phase 5's
// fw_technical_scores.technical_score, a separate/later composite that
// will incorporate ADX/breakout/RS more elaborately). This one just
// answers "is price aligned above its moving averages in the classic
// bullish stack order," scored by how many of 3 real conditions hold.
function trendScoreFromStack(price, ma50, ma100, ma200) {
  if (!(price > 0)) return null;
  const checks = [
    ma50 != null && price > ma50,
    ma100 != null && ma50 != null && ma50 > ma100,
    ma200 != null && ma100 != null && ma100 > ma200,
  ];
  // Only score conditions whose inputs actually exist — never award points for an unknown MA.
  const scorable = [ma50 != null, ma100 != null && ma50 != null, ma200 != null && ma100 != null];
  const applicable = scorable.filter(Boolean).length;
  if (!applicable) return null;
  const passed = checks.filter((c, i) => scorable[i] && c).length;
  return Math.round((passed / applicable) * 100);
}

// ── Orchestration: fetch real data for a batch of symbols and compute
// real metrics, writing one fw_quant_metrics row per symbol. ──

function requirePool() {
  const pool = getPool();
  if (!pool) throw new Error("future-wallet-quant: Postgres pool not ready");
  return pool;
}

async function computeMetricsForSymbol(symbol, quote, bars, spyCloses, fmpKey) {
  const closes = Array.isArray(bars) ? bars.map((b) => b.close) : [];
  const lastBar = Array.isArray(bars) && bars.length ? bars[bars.length - 1] : null;
  const price = Number(quote?.price) || (lastBar ? lastBar.close : null);
  const ma50 = sma(closes, 50), ma100 = sma(closes, 100), ma200 = sma(closes, 200);
  const { high: hi52, low: lo52 } = week52HighLow(bars || []);
  const rsiVal = closes.length > 14 ? computeRSI(closes, 14) : null;
  const atrVal = atr(bars || []);
  // quote.avgVolume is a known real gap — this app's own quote aggregator
  // never populates it for Alpaca-covered symbols (see the same real note
  // in axiom-runner/components/trading-utils.js's computeRvol). Real
  // fallback: compute a genuine 50-day average from the bars already
  // fetched here, same "use real bars data instead of going dark" pattern
  // that function already established — not a new workaround invented here.
  const avgVolFromBars = Array.isArray(bars) && bars.length >= 50
    ? bars.slice(-50).reduce((s, b) => s + (b.volume || 0), 0) / 50
    : null;
  const volRatio = volumeRatio(Number(quote?.volume) || (lastBar ? lastBar.volume : null), Number(quote?.avgVolume) || avgVolFromBars);
  const mom = momentum3m(closes);
  const trendScore = trendScoreFromStack(price, ma50, ma100, ma200);
  const vol = volatility(closes);
  const rs = relativeStrength(closes, spyCloses);

  // Real incident, 2026-08-18: this was a bare single-attempt
  // `.catch(() => null)`. FMP rate-limited a contiguous block of ~31
  // symbols mid-run (alphabetically M-S, since the universe is processed
  // in ticker order) and every one silently wrote a row with ALL
  // fundamentals null — indistinguishable from a company that genuinely
  // has no fundamentals data — while the run still reported
  // "computed: 100, failed: 0". Worse, those degraded rows became the
  // "latest" row per symbol, so downstream Phase 7 scoring read nulls for
  // NVDA/MSFT/META, which demonstrably HAD real fundamentals minutes
  // earlier. Fixed per spec section 33 (retry once before declaring a
  // provider field unavailable) — and the caller now reports the real
  // fundamentals-coverage count instead of hiding it behind "failed: 0".
  let fundamentals = await fetchFmpFundamentals(symbol, fmpKey).catch(() => null);
  if (!fundamentals) {
    await sleep(1200);
    fundamentals = await fetchFmpFundamentals(symbol, fmpKey).catch(() => null);
  }

  const sources = {};
  const note = (field, ok, provider) => { sources[field] = ok ? { source: provider, timestamp: new Date().toISOString(), confidence: "high" } : { source: null, confidence: "unavailable" }; };
  note("price", price != null, "quote-aggregator");
  note("bars", closes.length > 0, "yahoo/alpaca-bars");
  note("fundamentals", !!fundamentals, "fmp");
  note("beta", fundamentals?.beta != null, "fmp");

  return {
    symbol,
    price: price ?? null,
    market_cap: Number(quote?.marketCap) || Number(fundamentals?.marketCap) || null,
    volume: Number(quote?.volume) || null,
    avg_volume: Number(quote?.avgVolume) || avgVolFromBars,
    atr: atrVal, rsi: rsiVal, ma50, ma100, ma200,
    relative_strength: rs,
    week52_high: hi52, week52_low: lo52,
    distance_from_high: distanceFromHigh(price, hi52),
    volume_ratio: volRatio,
    momentum: mom,
    trend_score: trendScore,
    volatility: vol,
    beta: fundamentals?.beta ?? null,
    revenue_growth: fundamentals?.revenueGrowth ?? null,
    eps_growth: fundamentals?.earningsGrowth ?? null,
    eps_acceleration: null, // needs 2+ periods of eps growth to compare — not available from a single-period fundamentals call; honestly left null rather than approximated
    gross_margin: fundamentals?.grossMargin ?? null,
    operating_margin: null, // fetchFmpFundamentals doesn't currently surface this field — honestly null rather than guessed
    net_margin: fundamentals?.profitMargin ?? null,
    fcf: fundamentals?.freeCashFlow ?? null,
    fcf_growth: fundamentals?.freeCashFlowGrowth ?? null,
    roic: fundamentals?.roic ?? null,
    roe: fundamentals?.roe ?? null,
    debt_equity: null, // not currently surfaced by fetchFmpFundamentals — honest null, not a guess
    cash: null,
    net_debt: null, // fetchFmpFundamentals returns netDebtToEbitda (a ratio), not a real net-debt dollar figure
    shares_outstanding: null, // fetchFmpFundamentals notes /stable/profile no longer returns this directly
    share_dilution: fundamentals?.sharesGrowth ?? null,
    pe: fundamentals?.pe ?? null,
    forward_pe: null,
    peg: fundamentals?.pegRatio ?? null,
    price_sales: fundamentals?.priceToSales ?? null,
    ev_sales: null,
    ev_ebitda: fundamentals?.evToEbitda ?? null,
    fcf_yield: fundamentals?.fcfYield ?? null,
    sources,
    // Not a DB column — a real per-symbol flag the caller uses to report
    // honest fundamentals coverage instead of counting a degraded row as
    // a clean success (see the retry comment above).
    _fundamentalsOk: !!fundamentals,
  };
}

async function upsertQuantMetrics(pool, m) {
  await pool.query(
    `INSERT INTO fw_quant_metrics (
      symbol, price, market_cap, volume, avg_volume, atr, rsi, ma50, ma100, ma200,
      relative_strength, week52_high, week52_low, distance_from_high, volume_ratio,
      momentum, trend_score, volatility, beta, revenue_growth, eps_growth, eps_acceleration,
      gross_margin, operating_margin, net_margin, fcf, fcf_growth, roic, roe, debt_equity,
      cash, net_debt, shares_outstanding, share_dilution, pe, forward_pe, peg, price_sales,
      ev_sales, ev_ebitda, fcf_yield, sources
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
      $23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42
    )`,
    [
      m.symbol, m.price, m.market_cap, m.volume, m.avg_volume, m.atr, m.rsi, m.ma50, m.ma100, m.ma200,
      m.relative_strength, m.week52_high, m.week52_low, m.distance_from_high, m.volume_ratio,
      m.momentum, m.trend_score, m.volatility, m.beta, m.revenue_growth, m.eps_growth, m.eps_acceleration,
      m.gross_margin, m.operating_margin, m.net_margin, m.fcf, m.fcf_growth, m.roic, m.roe, m.debt_equity,
      m.cash, m.net_debt, m.shares_outstanding, m.share_dilution, m.pe, m.forward_pe, m.peg, m.price_sales,
      m.ev_sales, m.ev_ebitda, m.fcf_yield, JSON.stringify(m.sources),
    ]
  );
}

// Batch size / delay tuned the same conservative way the universe seeder
// was, after that one got rate-limited at 12-concurrent (see
// future-wallet-universe.js's comment) — start conservative here too
// rather than repeat the same mistake.
const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 1500;

async function runQuantScreen(symbols) {
  const pool = requirePool();
  const uniq = [...new Set(symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean))];

  const keys = resolveProviderKeys(new URLSearchParams());
  let fetchMarketQuotes;
  try { ({ fetchMarketQuotes } = require("./routes/market")); } catch { fetchMarketQuotes = async () => []; }
  const quotes = await fetchMarketQuotes(uniq, keys).catch(() => []);
  const quoteBySymbol = new Map((quotes || []).map((q) => [q.symbol, q]));

  const spyBars = await fetchYahooBars("SPY", "1y", "1d").catch(() => null);
  const spyCloses = Array.isArray(spyBars) ? spyBars.map((b) => b.close) : [];

  const results = [];
  for (let i = 0; i < uniq.length; i += BATCH_SIZE) {
    const chunk = uniq.slice(i, i + BATCH_SIZE);
    const done = await Promise.all(chunk.map(async (sym) => {
      try {
        const bars = await fetchYahooBars(sym, "1y", "1d").catch(() => null);
        const metrics = await computeMetricsForSymbol(sym, quoteBySymbol.get(sym), bars, spyCloses, FMP_API_KEY);
        await upsertQuantMetrics(pool, metrics);
        return { symbol: sym, ok: true, fundamentalsOk: metrics._fundamentalsOk, barsOk: Array.isArray(bars) && bars.length > 0 };
      } catch (e) {
        return { symbol: sym, ok: false, reason: String((e && e.message) || e) };
      }
    }));
    results.push(...done);
    if (i + BATCH_SIZE < uniq.length) await sleep(BATCH_DELAY_MS);
  }
  const ok = results.filter((r) => r.ok);
  const noFundamentals = ok.filter((r) => !r.fundamentalsOk).map((r) => r.symbol);
  const noBars = ok.filter((r) => !r.barsOk).map((r) => r.symbol);
  return {
    requested: uniq.length,
    computed: ok.length,
    failed: results.length - ok.length,
    failedDetail: results.filter((r) => !r.ok),
    // Real data-coverage reporting — a row written with null fundamentals
    // is NOT a clean success, and hiding that behind "failed: 0" is what
    // let the 2026-08-18 rate-limit incident go unnoticed until Phase 7
    // surfaced it downstream.
    withFundamentals: ok.length - noFundamentals.length,
    missingFundamentals: noFundamentals,
    missingBars: noBars,
  };
}

async function getLatestQuantMetrics() {
  const pool = requirePool();
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (symbol) *
    FROM fw_quant_metrics
    ORDER BY symbol, as_of DESC
  `);
  return rows;
}

module.exports = {
  // pure calc fns, exported for unit testing
  sma, atr, week52HighLow, distanceFromHigh, volumeRatio, momentum3m, volatility, relativeStrength, trendScoreFromStack,
  // orchestration
  runQuantScreen, getLatestQuantMetrics,
};
