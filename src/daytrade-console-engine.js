// daytrade-console-engine.js — pure calculation engine for the Day Trade
// Console (explicit user request, 2026-08-18): a single-symbol, 15-minute
// intraday decision page with 12 real, numerically-scored boxes (ORB,
// VWAP, Momentum, Volume, Trend, Relative Strength, Market Confirmation,
// Price Action, Mixed Signals, master Day Trade Score, Trade Plan) plus a
// protective NO_TRADE state.
//
// Zero I/O — every function here takes real, already-fetched data
// (bars, quote fields, regime, benchmark rows) and returns a real number
// or null (never fabricated), same purity/testability convention as
// src/lightbox-engine.js and src/future-wallet-quant.js's pure scorers.
// The stateful orchestration (fetching real data) lives in the route.
//
// Reuses (does not reimplement): computeRSI/computeMACDSeries/computeEMA/
// computeVWAPSeries (src/indicators.js), atrAt (src/routes/market.js,
// exported for this file), sectorOf/etfOf (src/sector-theme-map.js),
// computeRegime (src/trade-planner-scoring.js).
"use strict";

const { computeRSI, computeMACDSeries, computeEMA, computeVWAPSeries } = require("./indicators");

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x) => clamp(x, 0, 1);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

// ── Rate of Change — genuinely new, no existing implementation anywhere. ──
function computeROC(closes, period = 10) {
  if (!Array.isArray(closes) || closes.length <= period) return null;
  const now = closes[closes.length - 1];
  const then = closes[closes.length - 1 - period];
  if (!(then > 0)) return null;
  return ((now - then) / then) * 100;
}

// VWAP momentum: is the session VWAP itself rising or falling, not just
// where price sits relative to it. Real VWAP series via the existing
// computeVWAPSeries (indicators.js), compared over the last `lookback` bars.
function computeVwapMomentum(bars, lookback = 4) {
  if (!Array.isArray(bars) || bars.length <= lookback) return null;
  const series = computeVWAPSeries(bars);
  if (!Array.isArray(series) || series.length <= lookback) return null;
  const now = series[series.length - 1]?.value;
  const then = series[series.length - 1 - lookback]?.value;
  if (!(now > 0) || !(then > 0)) return null;
  return ((now - then) / then) * 100;
}

// ── ORB Score — explicit spec requirement: NOT price-crossing-OR-high
// alone. Real weighted blend: price position vs OR (40), volume
// confirmation (20), VWAP alignment (15), momentum alignment (15),
// market-direction alignment (10). Direction-aware: scores a bullish
// breakout and a bearish breakdown symmetrically. ──
function computeOrbScore({ price, orHigh, orLow, rvol, aboveVwap, bull15, marketBullish }) {
  if (!(price > 0) || !(orHigh > 0) || !(orLow > 0)) return { score: null, status: "NO_DATA", direction: null };

  const orMid = (orHigh + orLow) / 2;
  const orRange = Math.max(orHigh - orLow, 0.01);
  let direction = null;
  let pricePts = 20; // inside the range = neutral partial credit

  if (price > orHigh) {
    direction = "bullish";
    const distPct = ((price - orHigh) / orHigh) * 100;
    pricePts = 20 + clamp01(distPct / 1.5) * 20; // fresh breakout (0-1.5% above) scores highest
  } else if (price < orLow) {
    direction = "bearish";
    const distPct = ((orLow - price) / orLow) * 100;
    pricePts = 20 + clamp01(distPct / 1.5) * 20;
  } else {
    // Still inside the range — partial credit for proximity to either edge.
    const distToHigh = (orHigh - price) / orRange;
    const distToLow = (price - orLow) / orRange;
    pricePts = 20 * (1 - Math.min(distToHigh, distToLow));
  }

  const volPts = rvol == null ? 10 : rvol >= 1.5 ? 20 : rvol >= 1.0 ? 12 : 4;

  let vwapPts = 7.5; // unknown/neutral default (half credit)
  if (direction && aboveVwap != null) vwapPts = (direction === "bullish") === aboveVwap ? 15 : 0;

  let momPts = 7.5;
  if (direction && bull15 != null) momPts = (direction === "bullish") === bull15 ? 15 : 0;

  let marketPts = 5;
  if (direction && marketBullish != null) marketPts = (direction === "bullish") === marketBullish ? 10 : 0;

  const score = Math.round(pricePts + volPts + vwapPts + momPts + marketPts);
  let status;
  if (direction === "bullish" && score >= 65) status = "BULLISH_BREAKOUT";
  else if (direction === "bearish" && score >= 65) status = "BEARISH_BREAKDOWN";
  else status = "MIXED_WAIT";

  return { score: clamp(score, 0, 100), status, direction };
}

// ── VWAP Score — position (distance %) + real momentum (rising/falling),
// blended so "above VWAP but VWAP now falling" reads weaker than "above
// VWAP and rising" per the spec's own interpretation rule. ──
function computeVwapScore(price, vwap, vwapMomentumPct) {
  if (!(price > 0) || !(vwap > 0)) return null;
  const distPct = ((price - vwap) / vwap) * 100;
  let score = 50 + clamp(distPct * 12, -35, 35);
  if (vwapMomentumPct != null) score += clamp(vwapMomentumPct * 8, -15, 15);
  return Math.round(clamp(score, 0, 100));
}

// ── Momentum Score — real blend of RSI, ROC, MACD state, and short-term
// price momentum. Averages only over whichever real inputs are available
// (same honest-coverage pattern as Future Wallet's scorers), never
// penalizing for a genuinely-missing component. ──
function computeMomentumScore({ rsi, roc, macdHistogram, priceMomentumPct, rvol }) {
  const parts = [];
  if (rsi != null) parts.push(clamp(rsi, 0, 100)); // RSI is already 0-100
  if (roc != null) parts.push(clamp(50 + roc * 5, 0, 100));
  if (macdHistogram != null) parts.push(clamp(50 + macdHistogram * 20, 0, 100));
  if (priceMomentumPct != null) parts.push(clamp(50 + priceMomentumPct * 10, 0, 100));
  if (rvol != null) parts.push(clamp(30 + rvol * 25, 0, 100)); // volume-confirmed momentum
  if (!parts.length) return null;
  return Math.round(parts.reduce((s, v) => s + v, 0) / parts.length);
}

function macdStateFromHistogram(h) {
  if (h == null) return null;
  if (h > 0.01) return "BULLISH";
  if (h < -0.01) return "BEARISH";
  return "NEUTRAL";
}

function momentumDirectionFromRocTrend(rocNow, rocPrev) {
  if (rocNow == null || rocPrev == null) return null;
  const delta = rocNow - rocPrev;
  if (delta > 0.3) return "ACCELERATING";
  if (delta < -0.3) return "DECELERATING";
  return "FLAT";
}

// ── Volume Score — relative volume vs. the session's own running average. ──
function computeVolumeScore(rvol) {
  if (rvol == null || !Number.isFinite(rvol)) return null;
  return Math.round(clamp(rvol * 45, 0, 100)); // 1.0x -> 45, 2.0x+ -> 90-100
}
function volumeState(rvol) {
  if (rvol == null) return null;
  if (rvol >= 1.5) return "STRONG";
  if (rvol >= 0.8) return "NORMAL";
  return "WEAK";
}

// ── Trend Score — price vs. VWAP/9/20/50 EMA stack, 15-min timeframe.
// Only scores conditions whose real inputs exist (never awards points for
// an unknown EMA), same discipline as Future Wallet's trend-stack scorer. ──
function computeTrendScore(price, vwap, ema9, ema20, ema50) {
  if (!(price > 0)) return null;
  const checks = [
    vwap != null && price > vwap,
    ema9 != null && price > ema9,
    ema9 != null && ema20 != null && ema9 > ema20,
    ema20 != null && ema50 != null && ema20 > ema50,
  ];
  const scorable = [vwap != null, ema9 != null, ema9 != null && ema20 != null, ema20 != null && ema50 != null];
  const applicable = scorable.filter(Boolean).length;
  if (!applicable) return null;
  const passed = checks.filter((c, i) => scorable[i] && c).length;
  return Math.round((passed / applicable) * 100);
}
// Always reports the real EMA-stack finding honestly — never relabeled by
// an external bias. (The spec's "invert for bearish setups" rule applies
// to the MASTER score's BUY/SELL classification, handled in
// classifyMasterScore below — not to this box's own real reading.)
function trendLabel(score) {
  if (score == null) return null;
  if (score >= 85) return "STRONG_BULLISH";
  if (score >= 60) return "BULLISH";
  if (score >= 40) return "SIDEWAYS";
  if (score >= 15) return "BEARISH";
  return "STRONG_BEARISH";
}

// ── Relative Strength — real %-change deltas vs. SPY/QQQ/sector ETF
// (same `chg - benchmarkChg` formula already used by the swing GreenLight
// signal, extended to QQQ + sector here). ──
function computeRelativeStrength(chg, spyChg, qqqChg, sectorChg) {
  const vsSpy = chg != null && spyChg != null ? chg - spyChg : null;
  const vsQqq = chg != null && qqqChg != null ? chg - qqqChg : null;
  const vsSector = chg != null && sectorChg != null ? chg - sectorChg : null;
  const diffs = [vsSpy, vsQqq, vsSector].filter((v) => v != null);
  const score = diffs.length ? Math.round(clamp(50 + (diffs.reduce((s, v) => s + v, 0) / diffs.length) * 10, 0, 100)) : null;
  const classification = score == null ? null : score >= 65 ? "LEADER" : score >= 40 ? "NEUTRAL" : "LAGGARD";
  return { vsSpy, vsQqq, vsSector, score, classification };
}

// ── Market Confirmation — wraps the real, existing computeRegime; adds
// per-index dots from the same real chg/VIX values (thresholds matched to
// computeRegime's own internal factor thresholds, so this never disagrees
// with the aggregate score it's built from). ──
function dotFromChg(chg) { if (chg == null) return null; return chg > -0.1 ? "GREEN" : chg > -0.5 ? "YELLOW" : "RED"; }
function dotFromVix(vix) { if (vix == null) return null; return vix < 20 ? "GREEN" : vix < 28 ? "YELLOW" : "RED"; }
function computeMarketConfirmation(regime, spyChg, qqqChg, sectorChg) {
  return {
    score: regime?.score ?? null,
    regimeLabel: regime?.label ?? null,
    vixVal: regime?.vixVal ?? null,
    dots: { spy: dotFromChg(spyChg), qqq: dotFromChg(qqqChg), vix: dotFromVix(regime?.vixVal), sector: dotFromChg(sectorChg) },
  };
}

// ── Price Action — genuinely new: real higher-highs/higher-lows from
// 15-min bar swing structure, breakout/retest/failed-breakout state
// against a real resistance/support level, and 15-min ATR (reuses the
// existing atrAt formula, just fed intraday bars). ──
function findSwingPoints(bars, lookback = 2) {
  const highs = [], lows = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    const window = bars.slice(i - lookback, i + lookback + 1);
    if (bars[i].high === Math.max(...window.map((b) => b.high))) highs.push({ i, price: bars[i].high });
    if (bars[i].low === Math.min(...window.map((b) => b.low))) lows.push({ i, price: bars[i].low });
  }
  return { highs, lows };
}
function higherSequence(points, count = 2) {
  if (points.length < count + 1) return null;
  const recent = points.slice(-(count + 1));
  for (let i = 1; i < recent.length; i++) if (!(recent[i].price > recent[i - 1].price)) return false;
  return true;
}

// Direction-symmetric: checks BOTH a bullish breakout above resistance
// AND a bearish breakdown below support, since Price Action must confirm
// either a long or a short thesis (spec section 11 requires the whole
// scoring framework to work both directions, not just bullish).
function detectPriceAction(bars, orHigh, orLow) {
  if (!Array.isArray(bars) || bars.length < 10) {
    return { higherHighs: null, higherLows: null, breakout: null, breakdown: null, retest: null, failedBreakout: null, failedBreakdown: null, support: null, resistance: null };
  }
  const { highs, lows } = findSwingPoints(bars);
  const higherHighs = higherSequence(highs);
  const higherLows = higherSequence(lows);

  const resistance = orHigh ?? (highs.length ? highs[highs.length - 1].price : null);
  const support = orLow ?? (lows.length ? lows[lows.length - 1].price : null);

  const last = bars[bars.length - 1].close;
  const recentBars = bars.slice(-6); // last ~90 min on 15m bars

  let breakout = null, retest = null, failedBreakout = null;
  if (resistance != null) {
    breakout = last > resistance;
    // Retest: price broke above resistance earlier in the recent window, pulled back to within 0.3% of it, and is holding at/above it now.
    const brokeEarlier = recentBars.slice(0, -1).some((b) => b.high > resistance);
    const pulledBack = recentBars.some((b) => Math.abs(b.low - resistance) / resistance < 0.003);
    retest = brokeEarlier ? (pulledBack && last >= resistance) : null;
    // Failed breakout: broke above resistance earlier in the window, then closed back below it.
    failedBreakout = brokeEarlier ? last < resistance : null;
  }

  let breakdown = null, failedBreakdown = null;
  if (support != null) {
    breakdown = last < support;
    const brokeDownEarlier = recentBars.slice(0, -1).some((b) => b.low < support);
    // Failed breakdown: broke below support earlier, then closed back above it (bullish-for-support-holding evidence).
    failedBreakdown = brokeDownEarlier ? last > support : null;
  }

  return { higherHighs, higherLows, breakout, breakdown, retest, failedBreakout, failedBreakdown, support, resistance };
}

// Single bullish-scaled 0-100 score (matching every other subscore's
// convention: 0=bearish evidence, 100=bullish evidence) — same
// null-preserving discipline as every other scorer here: a component
// contributes only when its real input is actually known.
function computePriceActionScore(pa) {
  const flags = [
    pa.higherHighs,                                   // true=bullish structure, false=not confirmed, null=unknown
    pa.higherLows,
    pa.breakout,                                       // true=bullish breakout evidence
    pa.breakdown == null ? null : !pa.breakdown,        // a real breakdown is bearish evidence -> invert onto the bullish scale
    pa.retest,                                          // true=bullish (holding the breakout), false=broke but didn't retest cleanly, null=no breakout to retest
    pa.failedBreakout == null ? null : !pa.failedBreakout, // a real failed breakout is bearish evidence -> invert
    pa.failedBreakdown,                                 // true=support held (bullish evidence), false/null=not applicable or breakdown confirmed
  ];
  const known = flags.filter((f) => f != null);
  if (!known.length) return null;
  const bullish = known.filter((f) => f === true).length;
  return Math.round((bullish / known.length) * 100);
}

// ── Mixed Signals — the spec's own explicit centerpiece: real per-box
// bullish/neutral/bearish classification, counts, and a grounded reasoning
// sentence naming exactly which real conditions disagree. ──
const SUBSCORE_LABELS = { orb: "ORB", vwap: "VWAP", momentum: "Momentum", volume: "Volume", relativeStrength: "Relative Strength", market: "Market Regime", trend: "Trend", priceAction: "Price Action" };
function classify(score) { if (score == null) return "unknown"; return score >= 60 ? "bullish" : score <= 40 ? "bearish" : "neutral"; }

function computeMixedSignals(subscores) {
  const classified = {};
  for (const key of Object.keys(SUBSCORE_LABELS)) classified[key] = classify(subscores[key]);

  const bullish = Object.keys(classified).filter((k) => classified[k] === "bullish");
  const bearish = Object.keys(classified).filter((k) => classified[k] === "bearish");
  const neutral = Object.keys(classified).filter((k) => classified[k] === "neutral" || classified[k] === "unknown");

  // Deliberately conservative — matches the spec's own worked example
  // (section 13): ORB/VWAP/Momentum/RS bullish + Volume bearish + Market
  // neutral (4 bullish, 1 bearish, 3 neutral) must classify as MIXED, not
  // BULLISH, even though bullish is a numeric plurality. A clean
  // directional verdict requires either zero contradicting evidence with
  // real conviction (5+ of 8 confirming, none bearish), or an overwhelming
  // majority (4+ signal margin) that swamps any noise. Anything short of
  // that — including a bare plurality with real bearish evidence present —
  // is real conflicting evidence, and the spec is explicit: don't force a
  // call when the evidence conflicts.
  let verdict;
  if (bearish.length === 0 && bullish.length >= 5) verdict = "BULLISH";
  else if (bullish.length === 0 && bearish.length >= 5) verdict = "BEARISH";
  else if (bullish.length - bearish.length >= 4) verdict = "BULLISH";
  else if (bearish.length - bullish.length >= 4) verdict = "BEARISH";
  else verdict = "MIXED";

  const name = (k) => SUBSCORE_LABELS[k];
  const listJoin = (arr) => arr.length <= 1 ? (arr[0] || "") : arr.length === 2 ? `${arr[0]} and ${arr[1]}` : `${arr.slice(0, -1).join(", ")}, and ${arr[arr.length - 1]}`;
  let reason;
  if (verdict === "MIXED") {
    reason = bullish.length && bearish.length
      ? `${listJoin(bullish.map(name))} ${bullish.length > 1 ? "are" : "is"} bullish, but ${listJoin(bearish.map(name))} ${bearish.length > 1 ? "are" : "is"} bearish — evidence is conflicting, not a clean setup.`
      : "Too few real signals are strongly bullish or bearish right now — not enough evidence for a directional call.";
  } else if (verdict === "BULLISH") {
    reason = `${listJoin(bullish.map(name))} confirm bullish (${bullish.length}/${bullish.length + bearish.length + neutral.length} scored bullish)${bearish.length ? `, though ${listJoin(bearish.map(name))} ${bearish.length > 1 ? "are" : "is"} not confirming` : ""}.`;
  } else {
    reason = `${listJoin(bearish.map(name))} confirm bearish (${bearish.length}/${bearish.length + bullish.length + neutral.length} scored bearish)${bullish.length ? `, though ${listJoin(bullish.map(name))} ${bullish.length > 1 ? "are" : "is"} not confirming` : ""}.`;
  }

  return { classified, bullishCount: bullish.length, bearishCount: bearish.length, neutralCount: neutral.length, verdict, reason };
}

// ── Master Day Trade Score — the spec's exact weights. Direction comes
// from the Mixed Signals verdict; the score itself is direction-agnostic
// "quality of the real setup," relabeled per direction at the end (spec
// section 11's "for bearish setups, invert the directional interpretation"). ──
const MASTER_WEIGHTS = { orb: 20, vwap: 15, momentum: 15, volume: 15, trend: 10, relativeStrength: 10, market: 10, priceAction: 5 };

function computeMasterScore(subscores) {
  let weighted = 0, weightAvailable = 0;
  for (const [key, w] of Object.entries(MASTER_WEIGHTS)) {
    const v = subscores[key];
    if (v != null) { weighted += v * w; weightAvailable += w; }
  }
  const totalWeight = Object.values(MASTER_WEIGHTS).reduce((s, w) => s + w, 0);
  if (!weightAvailable) return { score: null, coverage: 0 };
  return { score: Math.round(weighted / weightAvailable), coverage: Math.round((weightAvailable / totalWeight) * 100) };
}

// `score` is on a single bullish-scaled 0-100 axis (0=bearish evidence,
// 100=bullish evidence) — the same axis every subscore uses. A real,
// strong bearish sweep therefore scores LOW on this axis, not high. The
// band thresholds below are conviction bands ("how extreme is the real
// evidence"), so for a BEARISH verdict they must be read off the
// distance-from-bullish (100 - score), not off the raw score directly —
// otherwise a genuine high-conviction short (real low raw score) would
// band into AVOID/WEAK and get labeled "avoid shorting", the exact
// opposite of what the data shows. This is the spec's "invert the
// directional interpretation for bearish setups" rule, scoped correctly
// to this final classification step only (not to any individual subscore
// — see trendLabel above).
function classifyMasterScore(score, direction) {
  if (score == null) return "NO_DATA";
  const bandScore = direction === "BEARISH" ? 100 - score : score;
  const bands = bandScore >= 90 ? "A_PLUS" : bandScore >= 80 ? "STRONG" : bandScore >= 70 ? "WATCH" : bandScore >= 60 ? "WAIT" : bandScore >= 50 ? "WEAK" : "AVOID";
  if (direction === "BEARISH") {
    return { A_PLUS: "A_PLUS_SELL", STRONG: "SELL", WATCH: "WATCH_SHORT", WAIT: "WAIT", WEAK: "WEAK_NO_TRADE", AVOID: "AVOID_SHORT" }[bands];
  }
  return { A_PLUS: "A_PLUS_BUY", STRONG: "BUY", WATCH: "WATCH_WAIT_CONFIRM", WAIT: "WAIT", WEAK: "WEAK_NO_TRADE", AVOID: "SELL_AVOID" }[bands];
}

// ── Trade Plan — ATR-based, direction-symmetric (long or short), with a
// real NO_TRADE gate (missing data, poor R:R, or genuinely conflicting
// signals override any raw score). ──
function computeTradePlan({ price, atr15m, direction, rr = null }) {
  if (!(price > 0) || !(atr15m > 0) || (direction !== "BULLISH" && direction !== "BEARISH")) {
    return { direction: "NO_TRADE", reason: !(price > 0) ? "no real price" : !(atr15m > 0) ? "no real ATR (insufficient bars)" : "signals too mixed for a directional plan" };
  }
  const isLong = direction === "BULLISH";
  const entry = price;
  const stop = isLong ? entry - atr15m * 1.5 : entry + atr15m * 1.5;
  const riskDist = Math.abs(entry - stop);
  const target1 = isLong ? entry + riskDist * 1.5 : entry - riskDist * 1.5;
  const target2 = isLong ? entry + riskDist * 3 : entry - riskDist * 3;
  const rewardRisk = riskDist > 0 ? +((Math.abs(target2 - entry)) / riskDist).toFixed(2) : null;
  const positionRiskPct = entry > 0 ? +((riskDist / entry) * 100).toFixed(2) : null;

  if (rewardRisk != null && rewardRisk < 1.2) {
    return { direction: "NO_TRADE", reason: `risk/reward too poor (${rewardRisk}:1)`, entry: r1(entry), stop: r1(stop) };
  }

  return {
    direction: isLong ? "LONG" : "SHORT",
    entry: r1(entry), stop: r1(stop), target1: r1(target1), target2: r1(target2),
    rewardRisk, atr: r1(atr15m), positionRiskPct,
  };
}

module.exports = {
  computeROC, computeVwapMomentum,
  computeOrbScore, computeVwapScore, computeMomentumScore, macdStateFromHistogram, momentumDirectionFromRocTrend,
  computeVolumeScore, volumeState,
  computeTrendScore, trendLabel,
  computeRelativeStrength, computeMarketConfirmation, dotFromChg, dotFromVix,
  detectPriceAction, computePriceActionScore, findSwingPoints,
  computeMixedSignals, classify,
  computeMasterScore, classifyMasterScore, MASTER_WEIGHTS,
  computeTradePlan,
  // real, already-existing engine reused for MACD/RSI/EMA inputs by the route:
  computeRSI, computeMACDSeries, computeEMA,
};
