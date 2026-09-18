"use strict";
// quant-feature-engine.js — the ONE canonical normalized quant feature
// vector for AI Trade Desk (2026-09-18, "BUILD THE CANONICAL QUANT ENGINE
// FOR AI TRADE DESK" master prompt, Phase 2). Pure derivation over the
// SAME real daily bars every other Trade Desk surface already fetches
// (_fetchBarsCached in routes/market.js, fetchYahooBars(symbol,"1y","1d"))
// — reuses indicators.js's own EMA/RSI/MACD series math and atr-risk-
// engine.js's own ATR, never a second copy of either. This file's only
// genuinely new work is the FEATURES the raw indicators don't already
// expose: multi-horizon returns + acceleration, EMA/RSI slope and
// acceleration (not just the latest value), real structure-transition
// detection (reclaim, slope turning), and ONE canonical, optionally
// time-of-day-normalized RVOL (replacing the 3 independently duplicated
// inline calcs in routes/market.js — that consolidation is a separate,
// deliberately deferred follow-up so each existing call site's own real
// behavior can be verified individually rather than swapped blind).
//
// SIGNAL LIFECYCLE SAFETY (same rule valuation-engine.js/what-to-pay.js
// already follow): this module only ever reads price/volume bars. It has
// no opinion on tier/signalState/verdict/Opportunity Score and computes
// none of them — a purely additive, read-only feature lens.
//
// "Do NOT assume these weights are optimal... Weights must eventually be
// validated through backtesting" (the prompt's own Phase 4 caveat) — this
// file deliberately does NOT touch the real Opportunity Score formula
// (am-core-engine.js/opportunity-engine.js). It computes features for
// consumers (What Price To Pay, future support/resistance clustering,
// eventual backtested reweighting) to read, never rewires the live score.

const { computeEMASeries, computeRSISeries, computeMACDSeries } = require("./indicators");
const { computeAtrRiskLevels } = require("./atr-risk-engine");

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }
function pct(a, b) { return Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? round2(((a - b) / b) * 100) : null; }

// % change of a real {time,value} series over `lookback` real bars — a
// disclosed, bar-count slope (not a per-bar derivative, which would be
// noisy on daily data). Reused by every slope field below.
function slopeOf(series, lookback = 5) {
  if (!Array.isArray(series) || series.length < lookback + 1) return null;
  const last = series[series.length - 1]?.value;
  const prior = series[series.length - 1 - lookback]?.value;
  return pct(last, prior);
}

// ---- RETURNS (prompt's own formula: returnN = (price - priceNAgo) / priceNAgo) ----
function computeReturnsFeatures(bars) {
  if (!Array.isArray(bars) || bars.length < 2) return { available: false };
  const closes = bars.map((b) => b.close);
  const last = closes.length - 1;
  const at = (n) => (last - n >= 0 ? closes[last - n] : null);
  const price = closes[last];
  const return1D = pct(price, at(1));
  const return5D = pct(price, at(5));
  const return20D = pct(price, at(20));
  const return60D = pct(price, at(60));

  // Acceleration — real recent daily pace (last 5 real trading days) vs.
  // real prior daily pace (the 15 real trading days before that), never
  // the raw multi-day return itself. This is the prompt's own explicit
  // "improving momentum, not merely a stock that already had an enormous
  // move" distinction, made concrete: positive = accelerating.
  let returnAcceleration = null;
  const price5 = at(5), price20 = at(20);
  if (Number.isFinite(return5D) && Number.isFinite(price5) && Number.isFinite(price20)) {
    const recentDailyPace = return5D / 5;
    const priorWindowReturn = pct(price5, price20);
    const priorDailyPace = Number.isFinite(priorWindowReturn) ? priorWindowReturn / 15 : null;
    if (Number.isFinite(priorDailyPace)) returnAcceleration = round2(recentDailyPace - priorDailyPace);
  }
  return { available: true, price: round2(price), return1D, return5D, return20D, return60D, returnAcceleration };
}

// ---- TREND (EMA structure + transitions) ----
function computeTrendFeatures(bars) {
  if (!Array.isArray(bars) || bars.length < 21) return { available: false };
  const price = bars[bars.length - 1].close;
  const priorClose = bars.length > 1 ? bars[bars.length - 2].close : null;

  const ema20Series = computeEMASeries(bars, 20);
  const ema50Series = bars.length >= 51 ? computeEMASeries(bars, 50) : [];
  const ema200Series = bars.length >= 201 ? computeEMASeries(bars, 200) : [];
  const ema20 = ema20Series.at(-1)?.value ?? null;
  const ema50 = ema50Series.length ? ema50Series.at(-1)?.value ?? null : null;
  const ema200 = ema200Series.length ? ema200Series.at(-1)?.value ?? null : null;
  const ema20Prior = ema20Series.length > 1 ? ema20Series.at(-2)?.value : null;

  const ema20Slope = slopeOf(ema20Series, 5);
  const ema50Slope = ema50Series.length ? slopeOf(ema50Series, 10) : null;

  const distanceFromEma20Pct = pct(price, ema20);
  const distanceFromEma50Pct = pct(price, ema50);
  const distanceFromEma200Pct = pct(price, ema200);

  // Deliberately NOT required for Early Discovery (prompt's own explicit
  // rule) — a real, disclosed read only, callers decide how to weight it.
  const stackedBullish = Number.isFinite(ema20) && Number.isFinite(ema50) && Number.isFinite(ema200)
    ? price > ema20 && ema20 > ema50 && ema50 > ema200 : null;

  // Real transition detection — "detect trend improvement BEFORE the move
  // becomes mature." A genuine cross (prior close on the wrong side, now
  // on the right side) rather than just "currently above."
  const reclaimingEma20 = Number.isFinite(price) && Number.isFinite(ema20) && Number.isFinite(priorClose) && Number.isFinite(ema20Prior)
    ? price > ema20 && priorClose <= ema20Prior : null;
  const ema20SlopeTurningPositive = Number.isFinite(ema20Slope) ? ema20Slope > 0 : null;
  const approachingEma50 = Number.isFinite(distanceFromEma50Pct) ? distanceFromEma50Pct >= -3 && distanceFromEma50Pct <= 0 : null;
  const reclaimingEma50 = Number.isFinite(price) && Number.isFinite(ema50) && Number.isFinite(priorClose)
    ? price > ema50 && priorClose <= ema50 : null;

  // Higher-low forming — real, simple structural read: split the trailing
  // 20 real bars in half and compare each half's own lowest low. Not a
  // fabricated pattern-match, just an honest two-swing comparison.
  let higherLowForming = null;
  if (bars.length >= 20) {
    const recent = bars.slice(-20);
    const firstHalfLow = Math.min(...recent.slice(0, 10).map((b) => b.low));
    const secondHalfLow = Math.min(...recent.slice(10).map((b) => b.low));
    higherLowForming = secondHalfLow > firstHalfLow;
  }

  return {
    available: true, ema20: round2(ema20), ema50: round2(ema50), ema200: round2(ema200),
    ema20Slope, ema50Slope,
    distanceFromEma20Pct, distanceFromEma50Pct, distanceFromEma200Pct,
    stackedBullish, reclaimingEma20, ema20SlopeTurningPositive, approachingEma50, reclaimingEma50, higherLowForming,
  };
}

// ---- MOMENTUM (RSI/MACD value AND change — not just the latest value) ----
function computeMomentumFeatures(bars) {
  if (!Array.isArray(bars) || bars.length < 30) return { available: false };
  const rsiSeries = computeRSISeries(bars, 14);
  const macd = computeMACDSeries(bars);
  const rsi = rsiSeries.at(-1)?.value ?? null;
  const rsiSlope = slopeOf(rsiSeries, 5);
  const rsiAccelerating = Number.isFinite(rsiSlope) ? rsiSlope > 0 : null;

  const histogram = macd.histogram.at(-1)?.value ?? null;
  const histogramPrior = macd.histogram.length > 5 ? macd.histogram.at(-6)?.value ?? null : null;
  const macdHistogramImproving = Number.isFinite(histogram) && Number.isFinite(histogramPrior) ? histogram > histogramPrior : null;

  return {
    available: true, rsi: round2(rsi), rsiSlope, rsiAccelerating,
    macdLine: round2(macd.line.at(-1)?.value), macdSignal: round2(macd.signal.at(-1)?.value),
    macdHistogram: round2(histogram), macdHistogramImproving,
  };
}

// ---- VOLATILITY (real ATR — reused, not recomputed) ----
function computeVolatilityFeatures(bars, price) {
  const result = computeAtrRiskLevels(Array.isArray(bars) ? bars : [], price);
  if (!Number.isFinite(result.atr)) return { available: false };
  const atrPercent = Number.isFinite(price) && price > 0 ? round2((result.atr / price) * 100) : null;
  return { available: true, atr: result.atr, atrPercent };
}

// ---- VOLUME (ONE canonical RVOL, real time-of-day normalization when the
// caller actually has it) ----
// RVOL = currentComparableVolume / averageComparableVolume. `elapsedFraction`
// (0-1, how far through the regular session today's volume covers) lets an
// intraday caller compare "volume so far today" to "average volume AT THE
// SAME POINT in the session" instead of against a full day's average — the
// prompt's own explicit "appropriate time-of-day normalization" ask,
// applied only when the caller supplies a real fraction (never invented).
// A daily/EOD caller omits it and gets the plain today-vs-N-day-average
// read every existing RVOL site in this app already computes — same
// formula, now in one place other call sites can migrate to.
function computeRvol({ volume, avgVolume, elapsedFraction = null } = {}) {
  if (!Number.isFinite(volume) || !Number.isFinite(avgVolume) || avgVolume <= 0) return null;
  const comparableAvg = Number.isFinite(elapsedFraction) && elapsedFraction > 0 && elapsedFraction <= 1
    ? avgVolume * elapsedFraction
    : avgVolume;
  return comparableAvg > 0 ? round2(volume / comparableAvg) : null;
}

function computeVolumeFeatures(bars) {
  if (!Array.isArray(bars) || bars.length < 21) return { available: false };
  const recent = bars.slice(-20);
  const avgVolume20D = recent.reduce((s, b) => s + (b.volume || 0), 0) / recent.length;
  const currentVolume = bars.at(-1).volume || 0;
  const rvol = computeRvol({ volume: currentVolume, avgVolume: avgVolume20D });

  // Volume acceleration — is today's RVOL itself higher than the prior
  // day's own RVOL (a real 2nd-derivative read), not just "is RVOL high."
  const priorRecent = bars.slice(-21, -1);
  const avgVolumePrior20D = priorRecent.length === 20 ? priorRecent.reduce((s, b) => s + (b.volume || 0), 0) / 20 : null;
  const priorDayVolume = bars.length > 1 ? bars.at(-2).volume || 0 : null;
  const rvolPrior = Number.isFinite(avgVolumePrior20D) && Number.isFinite(priorDayVolume)
    ? computeRvol({ volume: priorDayVolume, avgVolume: avgVolumePrior20D }) : null;
  const volumeAccelerating = Number.isFinite(rvol) && Number.isFinite(rvolPrior) ? rvol > rvolPrior : null;

  return { available: true, avgVolume20D: Math.round(avgVolume20D), currentVolume, rvol, volumeAccelerating };
}

// ---- THE canonical combined feature vector ----
function computeQuantFeatures({ bars, price } = {}) {
  const resolvedPrice = Number.isFinite(price) ? price : (Array.isArray(bars) && bars.length ? bars.at(-1).close : null);
  return {
    available: Array.isArray(bars) && bars.length > 0,
    price: round2(resolvedPrice),
    returns: computeReturnsFeatures(bars),
    trend: computeTrendFeatures(bars),
    momentum: computeMomentumFeatures(bars),
    volatility: computeVolatilityFeatures(bars, resolvedPrice),
    volume: computeVolumeFeatures(bars),
  };
}

module.exports = {
  computeQuantFeatures,
  computeReturnsFeatures, computeTrendFeatures, computeMomentumFeatures,
  computeVolatilityFeatures, computeVolumeFeatures, computeRvol, slopeOf,
};
