"use strict";

// backtest-trend-template.js — a point-in-time trend-template approximation
// for the MTF Decision System's historical backtest (Task #112, 2026-08-20).
//
// This is a DELIBERATE, LABELED APPROXIMATION of buildTrendTemplate/
// _buildTrendTemplate (src/routes/market.js:1358+), NOT a byte-identical
// replay of it. The live function is tightly coupled to a live fetch
// (_fetchBarsCached) and to VCP/SMC/live-quote logic that has no meaning
// point-in-time over history — modifying it to accept a historical slice
// risked breaking every other live caller, and duplicating its full VCP/SMC
// analysis would add a lot of surface area with no bearing on the real
// question here (did the core Minervini 8-criteria + pivot/breakout signal
// produce good forward outcomes). So this ports the real formulas that DO
// drive the entry decision — the 8 criteria, the swing-high pivot, the
// stop/target math, breakout/extension classification — reusing the exact
// shared helpers (ttSmaAt, ttWeightedMomentum, round2, average) the live
// function itself uses, not reinvented math. What's intentionally left out:
// VCP contraction grading, Smart Money Concepts, live/extended-hours price —
// all informational-only in the live UI, never inputs to Sniper Decision's
// action itself.
//
// bars: a symbol's real daily bars, oldest first, covering enough history
// before `idx` for a genuine 200-day SMA + 52-week high/low (guarded below).
// idx: the point-in-time index to evaluate — only bars[0..idx] are used,
// exactly like the live function only ever sees "up to today." opts.spyMom:
// the real SPY weighted-momentum value as of the SAME point in time (the
// caller precomputes this once per SPY series and passes the matching
// value in — keeps this module free of its own SPY-fetching logic).

const { round2, average } = require("./utils");
const { ttSmaAt, ttWeightedMomentum } = require("./routes/market");

const LOOKBACK = 252; // ~1 trading year — same effective window the live function's "range: 1y" fetch gives it

function computeTrendTemplateAt(bars, idx, opts = {}) {
  if (!Array.isArray(bars) || idx < 0 || idx >= bars.length) return null;
  const window = bars.slice(Math.max(0, idx - LOOKBACK + 1), idx + 1);
  if (window.length < 200) return null; // not enough real history for a genuine 200-day SMA yet

  const closes = window.map((b) => b.close);
  const highs = window.map((b) => b.high);
  const lows = window.map((b) => b.low);
  const vols = window.map((b) => b.volume || 0);
  const last = closes.length - 1;
  const price = closes[last];

  const ma50 = ttSmaAt(closes, 50, last);
  const ma150 = ttSmaAt(closes, 150, last);
  const ma200 = ttSmaAt(closes, 200, last);
  const ma200Prev = ttSmaAt(closes, 200, last - 22);

  const hi52 = Math.max(...highs);
  const lo52 = Math.min(...lows);
  const pctFromHigh = round2((price / hi52 - 1) * 100);
  const pctFromLow = round2((price / lo52 - 1) * 100);

  const momentum = ttWeightedMomentum(closes);
  const spyMom = Number.isFinite(opts.spyMom) ? opts.spyMom : null;
  const rsRating = spyMom != null ? Math.max(1, Math.min(99, Math.round(50 + 50 * Math.tanh(2 * (momentum - spyMom))))) : null;

  const criteria = [
    { id: 1, label: "Price above 150-day & 200-day MA", pass: ma150 != null && ma200 != null && price > ma150 && price > ma200 },
    { id: 2, label: "150-day MA above 200-day MA", pass: ma150 != null && ma200 != null && ma150 > ma200 },
    { id: 3, label: "200-day MA trending up (≥1 month)", pass: ma200Prev != null && ma200 != null && ma200 > ma200Prev },
    { id: 4, label: "50-day MA above 150-day & 200-day MA", pass: ma50 != null && ma150 != null && ma200 != null && ma50 > ma150 && ma50 > ma200 },
    { id: 5, label: "Price above 50-day MA", pass: ma50 != null && price > ma50 },
    { id: 6, label: "Price ≥30% above 52-week low", pass: price >= lo52 * 1.30 },
    { id: 7, label: "Price within 25% of 52-week high", pass: price >= hi52 * 0.75 },
    { id: 8, label: "Relative Strength rating ≥70", pass: rsRating != null && rsRating >= 70 },
  ];
  const passCount = criteria.filter((c) => c.pass).length;
  const trendPass = criteria.slice(0, 7).every((c) => c.pass);

  // ── Pivot (most recent base resistance via real swing highs) ──
  const W = 3;
  const swingHighs = [];
  for (let i = Math.max(W, last - 50); i <= last - W; i += 1) {
    let isHigh = true;
    for (let j = i - W; j <= i + W; j += 1) { if (highs[j] > highs[i]) { isHigh = false; break; } }
    if (isHigh) swingHighs.push({ i, h: highs[i] });
  }
  let pivot;
  const recentSwings = swingHighs.filter((s) => s.i >= last - 25);
  if (recentSwings.length) pivot = Math.max(...recentSwings.map((s) => s.h));
  else if (swingHighs.length) pivot = swingHighs[swingHighs.length - 1].h;
  else pivot = Math.max(...highs.slice(Math.max(0, last - 20)));
  if (price > pivot && recentSwings.length > 1) {
    const below = recentSwings.map((s) => s.h).filter((h) => h < price).sort((a, b) => b - a);
    if (below.length) pivot = below[0];
  }
  const contractionLow = Math.min(...lows.slice(Math.max(0, last - 15)));

  // Real swing-low "building higher lows" read, same W=3 window as the pivot.
  const swingLows = [];
  for (let i = Math.max(W, last - 50); i <= last - W; i += 1) {
    let isLow = true;
    for (let j = i - W; j <= i + W; j += 1) { if (lows[j] < lows[i]) { isLow = false; break; } }
    if (isLow) swingLows.push({ i, l: lows[i] });
  }
  const recentSwingLows = swingLows.slice(-3);
  const higherLows = recentSwingLows.length === 3 && recentSwingLows[1].l > recentSwingLows[0].l && recentSwingLows[2].l > recentSwingLows[1].l;

  const avgVol50 = average(vols.slice(Math.max(0, last - 50)));
  const lastVol = vols[last];
  const volSurge = avgVol50 ? lastVol / avgVol50 : 0;

  const range10 = Math.max(...highs.slice(last - 10)) - Math.min(...lows.slice(last - 10));
  const tightnessPct = round2((range10 / price) * 100);
  const volDryup = avgVol50 ? round2(average(vols.slice(last - 10)) / avgVol50) : null;

  let ema21 = closes[Math.max(0, last - 21)];
  const kE = 2 / (21 + 1);
  for (let i = Math.max(1, last - 21) + 1; i <= last; i += 1) ema21 = closes[i] * kE + ema21 * (1 - kE);

  const entry = pivot;
  let stop = Math.max(entry * 0.92, contractionLow * 0.995);
  if (stop >= entry) stop = entry * 0.92;
  const riskPct = round2(((entry - stop) / entry) * 100);
  const target2 = round2(entry + 2 * (entry - stop));
  const target3 = round2(entry + 3 * (entry - stop));

  const abovePivotPct = round2((price / pivot - 1) * 100);
  const breakoutConfirmed = price > pivot && volSurge >= 1.4;
  const extended = abovePivotPct > 10;
  const actionable = abovePivotPct >= -6 && abovePivotPct <= 10;

  let verdict, verdictReason;
  if (passCount <= 5) { verdict = "AVOID"; verdictReason = `Trend not in gear (${passCount}/8)`; }
  else if (breakoutConfirmed && passCount >= 6) { verdict = "GO"; verdictReason = "Breakout above pivot on volume"; }
  else if (actionable && passCount >= 6) { verdict = "GO"; verdictReason = price > pivot ? `Above pivot, strong trend (${passCount}/8) — no volume confirmation yet` : `At the buy zone, strong trend (${passCount}/8)`; }
  else if (passCount >= 6) { verdict = "WAIT"; verdictReason = abovePivotPct < -6 ? "Base building below pivot" : "Trend good — wait for pivot"; }
  else { verdict = "AVOID"; verdictReason = "No setup"; }

  const stage = trendPass && passCount === 8 ? "Stage 2 — Confirmed Uptrend"
    : trendPass ? "Stage 2 — Uptrend (RS soft)"
    : passCount >= 4 ? "Stage 1/3 — Transition"
    : "Stage 4 — Downtrend";

  return {
    time: bars[idx].time, price: round2(price),
    ma50: ma50 != null ? round2(ma50) : null, ma150: ma150 != null ? round2(ma150) : null, ma200: ma200 != null ? round2(ma200) : null,
    hi52: round2(hi52), lo52: round2(lo52), pctFromHigh, pctFromLow,
    rsRating, momentum: round2(momentum), passCount, trendPass, criteria,
    pivot: round2(pivot), entry: round2(entry), stop: round2(stop), riskPct,
    target2, target3, contractionLow: round2(contractionLow), higherLows,
    tightnessPct, volDryup, volSurge: round2(volSurge), ema21: round2(ema21),
    abovePivotPct, breakoutConfirmed, extended, actionable, verdict, verdictReason, stage,
  };
}

module.exports = { computeTrendTemplateAt, LOOKBACK };
