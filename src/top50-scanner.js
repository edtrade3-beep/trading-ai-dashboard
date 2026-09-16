"use strict";
// top50-scanner.js (2026-09-16, "Build Telegram Alerts for the AI Top 50
// Scanner" master prompt) — ranks the real, already-computed canonical
// opportunity universe by the new top50-scanner-score.js score and maps
// each real symbol's already-canonical tier/stage to the prompt's own
// READY/WAIT/SETTING UP/WATCH execution vocabulary.
//
// Reuse discipline (explicit prompt rule: "Do not create duplicate
// indicator engines. Reuse canonical calculations."):
// - Candidate universe + verdict/entry/stop/target/invalidation/tier/stage
//   come from routes/market.js's own computeAllOpportunities() — the SAME
//   real scan every other Trade Desk surface (TopOpportunities.jsx,
//   TradeGpsCard) already reads, never a second scan or a second
//   liquidity-filtered universe.
// - Daily EMA20/50/200 come from the SAME real daily bars buildTrendTemplate
//   already fetches (routes/market.js's exported fetchBarsCached — a
//   shared cache, not an independent fetch) via src/indicators.js's real
//   computeEMASeries — never a re-implemented EMA formula.
// - VWAP/RVOL/MACD(15m)/RSI(15m) come from routes/market.js's own exported
//   fetchDayTradeScanRows — the SAME real intraday scan Light Box's grid
//   and the Day Trade Console already use.
// - The 30/20/20/15/15 score itself is top50-scanner-score.js's own real,
//   disclosed-additive function — see that file's header for why it's a
//   deliberate 4th score, never a replacement for decision.opportunityScore.

const { computeTop50Score } = require("./top50-scanner-score");
const { computeEMASeries } = require("./indicators");

// tier/stage -> the prompt's own READY/WAIT/SETTING UP/WATCH vocabulary.
// Every input here is a real, already-computed field from
// opportunity-engine.js's classifyOpportunityTier/toOpportunityStage —
// this is a pure relabeling table, zero new classification logic.
// INVALIDATED is excluded entirely by the caller before this runs (a
// structurally broken setup isn't a Top 50 candidate at all).
function executionStatusFor(tier, stage) {
  if (tier === "ACTIONABLE") return stage === "EARLY" ? "SETTING UP" : "READY";
  if (tier === "EXTENDED") return "WATCH"; // real anti-chase gate — "good opportunity, bad entry right now"
  if (tier === "DEVELOPING" || tier === "WAIT") return "WAIT";
  return "WAIT"; // honest fallback for an unrecognized real tier — never guessed as READY
}

function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }

// Real daily EMA20/50/200 + SMA200 + "prior" (one daily bar back, a real
// meaningful "rising/falling" window at this timeframe, unlike 15m/RSI/
// MACD which use a cross-scan prior instead — see top50-scanner-score.js's
// own header for why). Returns null fields (never fabricated numbers) if
// there isn't enough real daily history yet.
function dailyEmaInputs(bars) {
  if (!Array.isArray(bars) || bars.length < 200) return { ema20: null, ema50: null, ema200: null, ema20Prior: null, ema50Prior: null, sma200: null };
  const closes = bars.map((b) => b.close);
  const ema20Series = computeEMASeries(bars, 20);
  const ema50Series = computeEMASeries(bars, 50);
  const ema200Series = computeEMASeries(bars, 200);
  const last = closes.length - 1;
  const sma200 = avg(closes.slice(last - 199, last + 1));
  return {
    ema20: ema20Series[last]?.value ?? null, ema50: ema50Series[last]?.value ?? null, ema200: ema200Series[last]?.value ?? null,
    ema20Prior: ema20Series[last - 1]?.value ?? null, ema50Prior: ema50Series[last - 1]?.value ?? null,
    sma200,
  };
}

// A minimum real liquidity floor (2026-09-16 — the prompt's own "apply
// minimum liquidity filters... exclude stocks with poor dollar volume /
// average volume") — same real $5M/day threshold universe-builder.js's
// own MIN_DOLLAR_VOLUME already uses for Autopilot 2.0's dynamic
// universe, reused here rather than inventing a second liquidity bar.
const MIN_DOLLAR_VOLUME = require("./universe-builder").MIN_DOLLAR_VOLUME;

// Ranks the real canonical opportunity universe by the new Top 50 score.
// `limit` defaults to 50 (the prompt's own "Top 50"); the UI asks for
// only 5 by default separately (AI Trade Desk's own display concern, not
// this function's).
async function scanTop50({ limit = 50 } = {}) {
  const { computeAllOpportunities, fetchBarsCached, fetchDayTradeScanRows } = require("./routes/market");
  const { tiers, marketRegime } = await computeAllOpportunities();
  const candidates = [
    ...(tiers.actionable || []), ...(tiers.developing || []), ...(tiers.wait || []), ...(tiers.extended || []),
    // INVALIDATED excluded from ranking/scoring below — a structurally
    // broken setup is never a real Top 50 candidate — but its real
    // symbol list is still returned (invalidatedSymbols) so a caller
    // tracking a symbol across runs (top50-telegram-alerts.js's "setup
    // invalidated" alert) can detect it dropped OUT of contention, not
    // just merely out of the ranked list.
  ];
  const invalidatedSymbols = (tiers.invalidated || []).map((c) => c.symbol);
  if (!candidates.length) return { symbols: [], invalidatedSymbols, marketRegime, generatedAt: new Date().toISOString() };

  const symbols = candidates.map((c) => c.symbol);
  const [dayTradeResult, dailyBarsBySymbol] = await Promise.all([
    fetchDayTradeScanRows(symbols).catch(() => ({ rows: [] })),
    Promise.all(symbols.map(async (sym) => {
      try { return [sym, await fetchBarsCached(sym)]; } catch { return [sym, null]; }
    })).then((pairs) => new Map(pairs)),
  ]);
  const dayTradeBySymbol = new Map((dayTradeResult.rows || []).map((r) => [r.symbol, r]));

  const scored = [];
  for (const c of candidates) {
    const bars = dailyBarsBySymbol.get(c.symbol);
    const dt = dayTradeBySymbol.get(c.symbol);
    const daily = dailyEmaInputs(bars);
    // Real liquidity filter — price × the SAME trailing daily-volume
    // average fetchDayTradeScanRows already computes for its own RVOL
    // read is a real dollar-volume proxy; a symbol fetchDayTradeScanRows
    // couldn't cover at all (provider gap) is honestly excluded rather
    // than scored on incomplete data.
    if (!bars || bars.length < 200 || !dt) continue;
    const recentAvgVol = avg(bars.slice(-21, -1).map((b) => b.volume || 0));
    const dollarVolume = Number.isFinite(recentAvgVol) ? c.price * recentAvgVol : 0;
    if (!(dollarVolume >= MIN_DOLLAR_VOLUME)) continue;

    const inputs = {
      price: c.price, ...daily,
      vwap: dt.vwap, vwapPrior: dt.vwapPrior,
      macdLine: dt.macdLine15m, macdSignal: dt.macdSignal15m, macdLinePrior: dt.macdLinePrior15m, macdSignalPrior: dt.macdSignalPrior15m,
      macdHistogram: dt.macdHistogram15m, macdHistogramPrior: null, // no cross-scan prior yet on a cold first run — see top50-telegram-alerts.js's own state cache for the warm-run version
      rsi: dt.rsi15m, rsiPrior: dt.rsi15mPrior,
      rvol: dt.rvol,
    };
    const top50Score = computeTop50Score(inputs);
    const executionStatus = executionStatusFor(c.tier, c.stage);
    scored.push({
      symbol: c.symbol, price: c.price,
      top50Score: top50Score.score, direction: top50Score.direction, breakdown: top50Score.breakdown,
      tier: c.tier, stage: c.stage, executionStatus,
      verdict: c.verdict, entry: c.entry, executableEntry: c.executableEntry, stop: c.stop, target: c.target, invalidation: c.invalidation,
      rvol: dt.rvol, vwap: dt.vwap, aboveVwap: dt.aboveVwap, rsi: dt.rsi15m,
    });
  }

  scored.sort((a, b) => b.top50Score - a.top50Score);
  return { symbols: scored.slice(0, limit), invalidatedSymbols, marketRegime, generatedAt: new Date().toISOString() };
}

module.exports = { scanTop50, executionStatusFor, dailyEmaInputs, MIN_DOLLAR_VOLUME };
