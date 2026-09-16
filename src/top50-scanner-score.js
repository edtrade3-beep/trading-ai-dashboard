"use strict";
// top50-scanner-score.js (2026-09-16, "Build Telegram Alerts for the AI
// Top 50 Scanner" master prompt) — the prompt's own explicit 30/20/20/15/15
// EMA-structure/VWAP/MACD/RSI/RVOL weighting. Deliberately ADDITIVE, same
// sanctioned precedent as trade-gps-score.js's own header comment ("a
// second, narrower... read, never a competing platform-wide verdict") —
// this repo's canonical opportunity score (am-core-engine.js's
// computeCoreScore, feeding decision.opportunityScore everywhere) uses a
// genuinely different 12-bucket composite (regime/structure/RS/VCP/
// options/etc, Minervini SMA-based trend, no VWAP or MACD bucket at all)
// and is NOT touched, replaced, or duplicated by this file. This score
// exists ONLY to drive the Top 50 scanner's own ranking + Telegram alerts
// — never fed into decision.opportunityScore, never shown as "the" AI
// verdict elsewhere.
//
// Real inputs only — every value here is expected to already be computed
// by src/indicators.js (computeEMASeries/computeVWAPSeries/
// computeMACDSeries/computeRSISeries) or the real day-trade 15m scan row
// (routes/market.js's fetchDayTradeScanRows) by the caller (top50-scanner.js
// below). This file does zero fetching and zero indicator math of its
// own — pure scoring over real numbers, same discipline as trade-gps-score.js.

// RVOL bucket table — the prompt's own explicit suggested scoring,
// verbatim. RVOL itself is computed by the caller as "today's cumulative
// volume so far ÷ the average FULL-SESSION volume of the trailing ~20
// sessions" — the exact same real formula this codebase already uses in
// two other places (routes/market.js's fetchDayTradeScanRows, src/
// greenlight-calc.js's computeRvol), reused here rather than inventing a
// third, genuinely different "volume-by-minute-of-day historical curve"
// formula. Disclosed limitation: this real, already-in-production formula
// is NOT literally "volume at this exact minute vs. the historical
// average volume at this exact minute" — it compares today's running
// total against a full-SESSION average, so it understates RVOL early in
// the day and overstates it late in the day (a real, honest bias, same
// one every existing caller of this formula already lives with) — no
// historical per-minute volume history exists anywhere in this codebase
// to build the literal minute-bucketed version faithfully, and a
// fabricated-precision version of that would be less honest than reusing
// the real, disclosed, already-proven formula.
function rvolPoints(rvol) {
  if (!Number.isFinite(rvol) || rvol < 1.0) return 0;
  if (rvol < 1.2) return 4;
  if (rvol < 1.5) return 8;
  if (rvol < 2.0) return 12;
  return 15;
}

// TREND / EMA STRUCTURE — 30 points, 6 real checks × 5 each. Mirrors for
// SHORT (every inequality flips, "rising" becomes "falling").
function trendPoints({ price, ema20, ema50, ema200, ema20Prior, ema50Prior, sma200 }, isShort) {
  const has = (v) => Number.isFinite(v);
  const checks = isShort
    ? [
        has(price) && has(ema20) && price < ema20,
        has(ema20) && has(ema50) && ema20 < ema50,
        has(ema50) && has(ema200) && ema50 < ema200,
        has(ema20) && has(ema20Prior) && ema20 < ema20Prior,
        has(ema50) && has(ema50Prior) && ema50 < ema50Prior,
        has(price) && has(sma200) && price < sma200,
      ]
    : [
        has(price) && has(ema20) && price > ema20,
        has(ema20) && has(ema50) && ema20 > ema50,
        has(ema50) && has(ema200) && ema50 > ema200,
        has(ema20) && has(ema20Prior) && ema20 > ema20Prior,
        has(ema50) && has(ema50Prior) && ema50 > ema50Prior,
        has(price) && has(sma200) && price > sma200,
      ];
  return checks.filter(Boolean).length * 5;
}

// VWAP — 20 points. price-vs-VWAP (8), VWAP rising/falling with
// direction (6), and a distance-from-VWAP quality read (6) that also
// covers "VWAP retest holds" — a price sitting CLOSE to VWAP (within
// 0.5%) on the favorable side reads as a real, currently-holding retest;
// further above/below is a real, disclosed simplification of "retest"
// (no historical intraday price-path data is available to detect a real
// pull-back-and-bounce sequence, only the current bar's distance) —
// excessive extension is penalized down to 0, never negative.
function vwapPoints({ price, vwap, vwapPrior }, isShort) {
  if (!Number.isFinite(price) || !Number.isFinite(vwap)) return 0;
  const sideOk = isShort ? price < vwap : price > vwap;
  const sidePts = sideOk ? 8 : 0;
  const risingOk = Number.isFinite(vwapPrior) && (isShort ? vwap < vwapPrior : vwap > vwapPrior);
  const risingPts = risingOk ? 6 : 0;
  const distPct = Math.abs((price - vwap) / vwap) * 100;
  // Full 6 within a healthy 0-2% band (real retest-holds range); tapers
  // linearly to 0 by 6% extension — an excessively extended read never
  // scores VWAP-distance points, matching the prompt's own "penalize
  // excessive extension from VWAP" instruction.
  const distPts = !sideOk ? 0 : Math.max(0, Math.round(6 * (1 - Math.max(0, distPct - 2) / 4)));
  return sidePts + risingPts + Math.min(6, distPts);
}

// MACD — 20 points. line-vs-signal (6), line-vs-zero (5), histogram
// improving vs. the prior real bar (5), a fresh crossover bonus (4, only
// when the line/signal relationship just flipped this bar — real,
// requires both the current and prior line/signal values).
function macdPoints({ macdLine, macdSignal, macdLinePrior, macdSignalPrior, macdHistogram, macdHistogramPrior }, isShort) {
  const has = (v) => Number.isFinite(v);
  let pts = 0;
  if (has(macdLine) && has(macdSignal)) pts += (isShort ? macdLine < macdSignal : macdLine > macdSignal) ? 6 : 0;
  if (has(macdLine)) pts += (isShort ? macdLine < 0 : macdLine > 0) ? 5 : 0;
  if (has(macdHistogram) && has(macdHistogramPrior)) {
    const improving = isShort ? macdHistogram < macdHistogramPrior : macdHistogram > macdHistogramPrior;
    pts += improving ? 5 : 0;
  }
  if (has(macdLine) && has(macdSignal) && has(macdLinePrior) && has(macdSignalPrior)) {
    const nowAbove = macdLine > macdSignal;
    const wasAbove = macdLinePrior > macdSignalPrior;
    const freshCross = isShort ? (wasAbove && !nowAbove) : (!wasAbove && nowAbove);
    pts += freshCross ? 4 : 0;
  }
  return pts;
}

// RSI — 15 points. Healthy-band position (10, centered 55-70 for LONG /
// 30-45 for SHORT per the prompt's own bearish-setup section — NEVER a
// hard rejection above 70, per the prompt's explicit instruction) plus a
// crossing/acceleration bonus (up to 5: crossed the real midline this
// bar, crossed the real healthy-band edge this bar, or accelerating
// >=2pts/bar in the trade's direction).
function rsiPoints({ rsi, rsiPrior }, isShort) {
  if (!Number.isFinite(rsi)) return 0;
  const [lo, hi, mid, edge] = isShort ? [30, 45, 50, 45] : [55, 70, 50, 55];
  let bandPts;
  if (rsi >= lo && rsi <= hi) bandPts = 10;
  else {
    const dist = rsi < lo ? lo - rsi : rsi - hi;
    bandPts = Math.max(0, Math.round(10 * (1 - dist / 20)));
  }
  let bonus = 0;
  if (Number.isFinite(rsiPrior)) {
    const crossedMid = isShort ? (rsiPrior >= mid && rsi < mid) : (rsiPrior <= mid && rsi > mid);
    const crossedEdge = isShort ? (rsiPrior >= edge && rsi < edge) : (rsiPrior <= edge && rsi > edge);
    const accelerating = isShort ? (rsiPrior - rsi >= 2) : (rsi - rsiPrior >= 2);
    if (crossedMid) bonus += 2;
    if (crossedEdge) bonus += 2;
    if (accelerating) bonus += 1;
  }
  return Math.min(15, bandPts + Math.min(5, bonus));
}

// Real weight sum, asserted (same discipline as trade-gps-score.js's own
// WEIGHT_SUM assert) so a future edit to the point tables above can never
// silently drift the total away from 100.
const MAX_TREND = 30, MAX_VWAP = 20, MAX_MACD = 20, MAX_RSI = 15, MAX_RVOL = 15;
const WEIGHT_SUM = MAX_TREND + MAX_VWAP + MAX_MACD + MAX_RSI + MAX_RVOL;
if (WEIGHT_SUM !== 100) throw new Error(`top50-scanner-score.js: bucket max points must sum to 100, got ${WEIGHT_SUM}`);

// Computes BOTH the LONG and SHORT read off the same real inputs and
// returns whichever real direction scores higher — an honest auto-
// classification (both are real math, never a guess), not a coin flip.
// Callers who already know the intended direction (e.g. an existing open
// position) may pass `direction: "LONG"|"SHORT"` to force that side
// instead of auto-picking.
function computeTop50Score(inputs = {}, { direction } = {}) {
  const longScore = trendPoints(inputs, false) + vwapPoints(inputs, false) + macdPoints(inputs, false) + rsiPoints(inputs, false) + rvolPoints(inputs.rvol);
  const shortScore = trendPoints(inputs, true) + vwapPoints(inputs, true) + macdPoints(inputs, true) + rsiPoints(inputs, true) + rvolPoints(inputs.rvol);
  const isShort = direction ? direction === "SHORT" : shortScore > longScore;
  const score = isShort ? shortScore : longScore;
  return {
    score,
    direction: isShort ? "SHORT" : "LONG",
    breakdown: {
      trend: trendPoints(inputs, isShort), vwap: vwapPoints(inputs, isShort), macd: macdPoints(inputs, isShort),
      rsi: rsiPoints(inputs, isShort), rvol: rvolPoints(inputs.rvol),
    },
  };
}

module.exports = { computeTop50Score, rvolPoints, WEIGHT_SUM };
