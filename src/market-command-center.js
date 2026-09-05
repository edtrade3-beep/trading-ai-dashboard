// market-command-center.js — A+ Market Intelligence V1.1 (2026-09-05, see
// .claude/plans/proud-yawning-unicorn.md). One real aggregator over
// already-existing, already-computed engines — no new scoring formula,
// no new market-data provider. Same "never fabricate, honest degrade"
// discipline every other engine in this app follows: a missing input
// (no FMP key, no watchlist earnings in range, no high-impact news yet)
// produces an honest null/omitted section, never a guessed value.
"use strict";

const { computeMarketRegimeState } = require("./market-regime-engine");
const { computeMarketContext } = require("./market-context-engine");
const { resolveProviderKeys } = require("./config");

// Top-3 explainable drivers (spec's "TOP MARKET DRIVERS") — just ranking
// market-context-engine.js's own already-computed, already-labeled
// pressure sub-factors by |value|. No new weighting model.
const DRIVER_SENTENCES = {
  fedPressure: { HAWKISH: "Fed policy signal turning hawkish", DOVISH: "Fed policy signal turning dovish" },
  inflationPressure: { ELEVATED: "Inflation pressure elevated", CONTAINED: "Inflation pressure contained" },
  growthPressure: { WEAK: "Growth/employment data weakening", STRONG: "Growth/employment data strengthening" },
  liquidity: { TIGHTENING: "Liquidity conditions tightening", EASING: "Liquidity conditions easing" },
  riskAppetite: { "RISK-AVERSE": "Market breadth deteriorating", "RISK-SEEKING": "Market breadth strengthening" },
  volatility: { ELEVATED: "Volatility (VIX) elevated", CONTAINED: "Volatility (VIX) contained" },
  treasuryPressure: { TIGHTENING: "Treasury yields rising", ACCOMMODATIVE: "Treasury yields falling" },
  creditPressure: { STRESSED: "Credit spreads widening", HEALTHY: "Credit spreads healthy" },
};
function topDrivers(marketContext, n = 3) {
  const keys = Object.keys(DRIVER_SENTENCES);
  return keys
    .map((k) => marketContext[k] && { key: k, ...marketContext[k] })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, n)
    .map((d) => DRIVER_SENTENCES[d.key][d.label] || null)
    .filter(Boolean);
}

// Real, disclosed VIX banding — not a new composite score, just a
// human-readable label over the same VIX level market-context-engine.js
// already resolved.
function riskLevelFromVix(vixLevel) {
  if (!Number.isFinite(vixLevel)) return { level: "UNKNOWN", reason: "Real VIX level unavailable right now." };
  if (vixLevel >= 35) return { level: "EXTREME", reason: `VIX ${vixLevel.toFixed(1)} — real crisis-level volatility.` };
  if (vixLevel >= 28) return { level: "HIGH", reason: `VIX ${vixLevel.toFixed(1)} — real elevated volatility.` };
  if (vixLevel >= 20) return { level: "ELEVATED", reason: `VIX ${vixLevel.toFixed(1)} — above the historical calm range.` };
  if (vixLevel >= 15) return { level: "NORMAL", reason: `VIX ${vixLevel.toFixed(1)} — normal range.` };
  return { level: "LOW", reason: `VIX ${vixLevel.toFixed(1)} — real low-volatility regime.` };
}

// Real watchlist-wide earnings lookup — same Yahoo earningsTimestamp
// field /api/market/next-earnings already uses for a single symbol
// (routes/market.js), applied here across the whole real watchlist in
// one batched fetch instead of a fixed universe. Returns the single
// nearest upcoming event (Catalyst Radar) and the single most recently
// reported one within the last 5 real days, if any (Expectation Gap
// candidate) — never a fabricated date.
async function findWatchlistEarnings(symbols) {
  if (!symbols.length) return { upcoming: null, recentlyReported: null };
  const { fetchYahooQuoteBatch } = require("./providers/yahoo");
  let quotes = [];
  try { quotes = await fetchYahooQuoteBatch(symbols); } catch { quotes = []; }

  const events = [];
  for (const q of quotes || []) {
    const ts = Number((Array.isArray(q?.earningsTimestamp) ? q.earningsTimestamp[0] : q?.earningsTimestamp) || 0);
    if (!ts) continue;
    const date = new Date(ts * 1000);
    const dte = (date.getTime() - Date.now()) / 86400000;
    const timing = q.earningsTimestampStart ? "Pre-Market" : q.earningsTimestampEnd ? "After-Hours" : "TBD";
    events.push({ symbol: String(q.symbol || "").toUpperCase(), date: date.toISOString(), dte, timing });
  }

  const upcoming = events.filter((e) => e.dte >= 0).sort((a, b) => a.dte - b.dte)[0] || null;
  const recentlyReported = events.filter((e) => e.dte < 0 && e.dte >= -5).sort((a, b) => b.dte - a.dte)[0] || null;
  return { upcoming, recentlyReported };
}

// Real earnings-surprise expectation gap (spec's "Expectation Gap
// Engine," scoped to earnings only — see the plan's disclosed decision:
// no macro consensus data exists anywhere in this app). Reuses this
// app's EXISTING paid FMP tier (fetchFmpLastEarnings, already wired for
// other features) — not a new provider, not new spend. Capped to the
// single symbol Catalyst Radar already identified as most-recently-
// reported, so this never multiplies into one FMP call per watchlist
// symbol on every refresh.
async function findExpectationGap(recentlyReportedSymbol) {
  if (!recentlyReportedSymbol) return null;
  const keys = resolveProviderKeys(new URLSearchParams());
  if (!keys.fmp) return null; // honest omission, never a fabricated surprise
  const { fetchFmpLastEarnings } = require("./providers/fmp");
  try {
    const result = await fetchFmpLastEarnings(recentlyReportedSymbol, keys.fmp);
    return result ? { symbol: recentlyReportedSymbol, ...result } : null;
  } catch { return null; }
}

// Biggest news event + biggest news/price divergence (spec's "Biggest
// News Event" / "Biggest News/Price Divergence") — reuses the EXISTING
// scored news_items feed (src/news/store.js's getFeed, already running
// as a 5-minute background job) filtered/ranked in JS. No new SQL, no
// schema change — `confirmation.divergence` is the field V1's news
// engine already added.
async function findTopNewsAndDivergence() {
  const { getFeed, isReady } = require("./news/store");
  if (!isReady()) return { topNews: null, topDivergence: null };
  try {
    const { rows } = await getFeed({ minImpact: 50, limit: 20 });
    const sorted = (rows || []).slice().sort((a, b) => (b.impact_score || 0) - (a.impact_score || 0));
    const topNews = sorted[0] || null;
    const topDivergence = sorted.find((r) => r.confirmation?.divergence === "NEWS_PRICE_DIVERGENCE") || null;
    return { topNews, topDivergence };
  } catch { return { topNews: null, topDivergence: null }; }
}

async function computeMarketCommandCenter() {
  const { fetchMarketQuotes } = require("./routes/market");
  const { loadWatchlist } = require("./routes/watchlist");
  const keys = resolveProviderKeys(new URLSearchParams());
  const watchlistSymbols = (loadWatchlist().symbols || []).map((s) => String(s).toUpperCase());

  const [macroQuotes, marketContext, { topNews, topDivergence }, { upcoming, recentlyReported }] = await Promise.all([
    fetchMarketQuotes(["SPY", "QQQ", "VIXY"], keys).catch(() => []),
    computeMarketContext().catch(() => ({ available: false })),
    findTopNewsAndDivergence(),
    findWatchlistEarnings(watchlistSymbols),
  ]);

  const regimeState = computeMarketRegimeState({ macroQuotes, marketContext: marketContext?.available ? marketContext : null });
  const expectationGap = await findExpectationGap(recentlyReported?.symbol || null);
  const vixLevel = marketContext?.instruments?.vix?.level ?? null;

  return {
    ok: true,
    asOf: new Date().toISOString(),
    regime: { regime: regimeState.regime, confidence: regimeState.confidence, volatility: regimeState.volatility },
    pressure: marketContext?.available
      ? { score: marketContext.macroScore, confidence: marketContext.confidence, drivers: topDrivers(marketContext) }
      : { score: null, confidence: null, drivers: [], reason: "Real market context unavailable right now." },
    sectorRotation: marketContext?.sectorRotation || null,
    topNews: topNews ? { ticker: topNews.ticker, headline: topNews.headline, verdict: topNews.verdict, impactScore: topNews.impact_score, url: topNews.url, source: topNews.source } : null,
    topDivergence: topDivergence
      ? { ticker: topDivergence.ticker, headline: topDivergence.headline, rejectionLabel: topDivergence.confirmation?.rejectionLabel || null, divergenceReason: topDivergence.confirmation?.divergenceReason || null, url: topDivergence.url }
      : null,
    nextCatalyst: upcoming,
    expectationGap,
    riskLevel: riskLevelFromVix(vixLevel),
  };
}

module.exports = { computeMarketCommandCenter, topDrivers, riskLevelFromVix, findWatchlistEarnings };
