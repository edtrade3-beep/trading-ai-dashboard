"use strict";

// backtest-engine.js — walk-forward historical backtest for the MTF
// Decision System's DAILY entry-quality layer (Task #112, 2026-08-20), the
// one deliberately-deferred piece of the original spec. Reuses real,
// already-shipped engines wherever possible per the platform's own "DO NOT
// duplicate existing calculations" instruction:
//   - computeTrendTemplateAt (backtest-trend-template.js) — point-in-time
//     port of buildTrendTemplate's real Minervini 8-criteria/pivot math
//   - computeSniperDecision (sniper-decision.js) — the SAME entry-decision
//     function the live Decision Workspace uses, completely unmodified
//   - computeRSI/computeVWAP (indicators.js) — the same shared indicator math
//   - classifyRegimeSeries (backtest-regime.js) — real SPY-based regime read
//
// Scope, stated honestly (this is real, not a caveat to bury): this backs
// only the DAILY layer — trend template + Sniper Decision's ENTER_LONG
// trigger. The 4H/1H SWING_SETUP/EARLY_DEVELOPMENT layers and the 8-state
// confirmation machine (mtf-decision-engine.js) are NOT backtested here.
// Yahoo's public intraday history is short-lived, and while Alpaca (this
// app's preferred bars provider) retains meaningfully more hourly history,
// replaying the full MTF alignment + debounce state machine hour-by-hour
// over years is a materially larger, separate undertaking. This backtest
// answers a real, narrower question: historically, when the daily-layer
// entry signal fired, what happened next — broken out by market regime.
//
// No lookahead: every signal is evaluated using only bars up to and
// including its own day; the fill price is the NEXT bar's open (a real
// next-session fill, not today's already-known close); outcomes are
// measured strictly on bars after the fill.

const { fetchYahooBars } = require("./providers/yahoo");
const { round2 } = require("./utils");
const { computeRSI, computeVWAP } = require("./indicators");
const { computeSniperDecision } = require("./sniper-decision");
const { computeTrendTemplateAt } = require("./backtest-trend-template");
const { classifyRegimeSeries, regimeAt } = require("./backtest-regime");
const { computeAtrRiskLevels } = require("./atr-risk-engine");
const { ttWeightedMomentum } = require("./routes/market");

const DEFAULT_HORIZONS = [5, 10, 20, 40]; // real trading days
const MIN_GAP_DAYS = 10; // don't count a fresh signal within 10 trading days of the last one on the same symbol — same setup re-firing, not a new independent trade
const RANGE_BY_YEARS = { 1: "1y", 2: "2y", 3: "3y", 5: "5y" };

function nearestRange(years) {
  const y = Number(years);
  if (RANGE_BY_YEARS[y]) return RANGE_BY_YEARS[y];
  if (!Number.isFinite(y) || y <= 1) return "1y";
  if (y <= 2) return "2y";
  if (y <= 3) return "3y";
  return "5y";
}

// Builds the "row" shape computeSniperDecision expects, from real
// point-in-time values only — same fields the live scanner assembles, just
// computed here directly off the historical bars slice instead of reused
// from a live row object (screenTrendTemplate's row assembly isn't a pure
// function we can call point-in-time without a live fetch).
function buildSniperRow(bars, idx, tt) {
  const closes = bars.slice(0, idx + 1).map((b) => b.close);
  const rsi = computeRSI(closes, 14);
  const vwapWindow = bars.slice(Math.max(0, idx - 19), idx + 1);
  const vwap20 = computeVWAP(vwapWindow);
  const dayChangePct = idx >= 1 ? round2((bars[idx].close / bars[idx - 1].close - 1) * 100) : null;
  const weekChangePct = idx >= 5 ? round2((bars[idx].close / bars[idx - 5].close - 1) * 100) : null;
  return {
    passCount: tt.passCount, stage: tt.stage, price: tt.price, pivot: tt.pivot,
    entry: tt.entry, stop: tt.stop, target2: tt.target2, volRatio: tt.volSurge,
    rsRating: tt.rsRating, abovePivotPct: tt.abovePivotPct, hi52: tt.hi52, lo52: tt.lo52,
    rsi: round2(rsi), dayChangePct, weekChangePct, ma50: tt.ma50,
    breakoutConfirmed: tt.breakoutConfirmed, volConfirmed: tt.volSurge >= 1.4, extended: tt.extended,
    technicals: { vwap20: round2(vwap20) },
  };
}

// Real forward outcome for one signal over one horizon — strictly future
// bars relative to the fill, no lookahead into how the horizon resolves.
function computeOutcome(bars, fillIdx, entryPrice, stop, target1, horizonDays) {
  const endIdx = fillIdx + horizonDays;
  if (endIdx >= bars.length) return null; // not enough real future data yet — honest null, not estimated
  const window = bars.slice(fillIdx + 1, endIdx + 1);
  if (!window.length) return null;
  const exitClose = window[window.length - 1].close;
  const returnPct = round2((exitClose / entryPrice - 1) * 100);
  const mfePct = round2((Math.max(...window.map((b) => b.high)) / entryPrice - 1) * 100);
  const maePct = round2((Math.min(...window.map((b) => b.low)) / entryPrice - 1) * 100);
  const stopHit = Number.isFinite(stop) ? window.some((b) => b.low <= stop) : null;
  const target1Hit = Number.isFinite(target1) ? window.some((b) => b.high >= target1) : null;
  return { returnPct, mfePct, maePct, stopHit, target1Hit };
}

// Walk-forward replay for one symbol. Returns { symbol, events, dataInsufficient? }.
async function runBacktest(symbol, opts = {}) {
  const years = opts.years || 5;
  const range = nearestRange(years);
  const horizons = opts.horizons || DEFAULT_HORIZONS;
  const maxHorizon = Math.max(...horizons);

  const [bars, spyBars] = await Promise.all([
    fetchYahooBars(symbol, range, "1d"),
    opts.spyBars || fetchYahooBars("SPY", range, "1d"),
  ]);
  if (!Array.isArray(bars) || bars.length < 220) {
    return { symbol, events: [], dataInsufficient: true, reason: `Not enough real daily history for ${symbol} (need ~220+ trading days, got ${bars ? bars.length : 0}).` };
  }
  const regimeSeries = classifyRegimeSeries(spyBars);
  const spyCloses = spyBars.map((b) => b.close);
  const spyTimeIdx = new Map(spyBars.map((b, i) => [b.time, i]));

  function spyMomAt(time) {
    let idx = spyTimeIdx.get(time);
    if (idx == null) {
      // symbol's calendar day not found in SPY's (rare holiday mismatch) — use the nearest SPY day at or before it
      for (let i = spyBars.length - 1; i >= 0; i -= 1) { if (spyBars[i].time <= time) { idx = i; break; } }
    }
    if (idx == null || idx < 200) return null;
    return ttWeightedMomentum(spyCloses.slice(0, idx + 1));
  }

  const events = [];
  let lastSignalIdx = -Infinity;
  const lastUsableIdx = bars.length - 2 - maxHorizon; // needs idx+1 for fill AND idx+1+maxHorizon for the longest outcome window
  for (let idx = 200; idx <= lastUsableIdx; idx += 1) {
    const tt = computeTrendTemplateAt(bars, idx, { spyMom: spyMomAt(bars[idx].time) });
    if (!tt) continue;
    const row = buildSniperRow(bars, idx, tt);
    const sniper = computeSniperDecision(row);
    if (sniper.action !== "ENTER_LONG") continue;
    if (idx - lastSignalIdx < MIN_GAP_DAYS) continue; // same setup still firing — not a fresh independent trade
    lastSignalIdx = idx;

    const fillIdx = idx + 1;
    const entryPrice = bars[fillIdx].open;
    const target1 = Number.isFinite(tt.entry) && Number.isFinite(tt.stop) ? round2(entryPrice + (tt.entry - tt.stop)) : null;
    const atr = computeAtrRiskLevels(bars.slice(0, idx + 1), tt.price);

    const outcomes = {};
    for (const h of horizons) outcomes[`d${h}`] = computeOutcome(bars, fillIdx, entryPrice, tt.stop, target1, h);

    events.push({
      symbol, time: bars[idx].time, fillTime: bars[fillIdx].time,
      entryPrice: round2(entryPrice), stop: tt.stop, target1, target2: tt.target2,
      atrStop: atr.stop, atrTarget1: atr.target1,
      quality: round2((tt.passCount / 8) * 100), passCount: tt.passCount, rsRating: tt.rsRating, stage: tt.stage,
      regime: regimeAt(regimeSeries, bars[idx].time) || "UNKNOWN",
      outcomes,
    });
  }
  return { symbol, events };
}

// Aggregates real completed outcomes for one horizon key across a set of
// events, optionally filtered to one regime. Honest null when a bucket has
// zero real completed outcomes — same discipline as mtf-outcome-tracker.js.
function aggregate(events, horizonKey) {
  const rows = events.map((e) => e.outcomes[horizonKey]).filter(Boolean);
  if (!rows.length) return null;
  const n = rows.length;
  const avg = (f) => round2(rows.reduce((s, r) => s + f(r), 0) / n);
  const wins = rows.filter((r) => r.returnPct > 0).length;
  const stopRows = rows.filter((r) => r.stopHit != null);
  const targetRows = rows.filter((r) => r.target1Hit != null);
  return {
    count: n,
    avgReturnPct: avg((r) => r.returnPct),
    winRate: round2((wins / n) * 100),
    avgMfePct: avg((r) => r.mfePct),
    avgMaePct: avg((r) => r.maePct),
    stopHitRate: stopRows.length ? round2((stopRows.filter((r) => r.stopHit).length / stopRows.length) * 100) : null,
    target1HitRate: targetRows.length ? round2((targetRows.filter((r) => r.target1Hit).length / targetRows.length) * 100) : null,
  };
}

const REGIMES = ["BULL", "BEAR", "SIDEWAYS", "UNKNOWN"];

function buildReport(events, horizons = DEFAULT_HORIZONS) {
  const horizonKeys = horizons.map((h) => `d${h}`);
  const overall = {};
  for (const k of horizonKeys) overall[k] = aggregate(events, k);
  const byRegime = {};
  for (const regime of REGIMES) {
    const subset = events.filter((e) => e.regime === regime);
    if (!subset.length) continue;
    byRegime[regime] = { eventCount: subset.length };
    for (const k of horizonKeys) byRegime[regime][k] = aggregate(subset, k);
  }
  return { totalEvents: events.length, overall, byRegime };
}

// Runs the backtest across several symbols, sharing one SPY fetch. Symbols
// run sequentially (real per-symbol daily-bar fetch, not a bulk endpoint —
// keeping this on-demand tool from bursting many concurrent requests at
// once, same rate-limit-safety discipline as this session's background jobs).
async function runBacktestUniverse(symbols, opts = {}) {
  const years = opts.years || 5;
  const range = nearestRange(years);
  const spyBars = await fetchYahooBars("SPY", range, "1d");
  const perSymbol = [];
  for (const symbol of symbols) {
    try {
      const result = await runBacktest(symbol, { ...opts, spyBars });
      perSymbol.push(result);
    } catch (e) {
      perSymbol.push({ symbol, events: [], dataInsufficient: true, reason: e instanceof Error ? e.message : "backtest failed" });
    }
  }
  const allEvents = perSymbol.flatMap((r) => r.events);
  const report = buildReport(allEvents, opts.horizons || DEFAULT_HORIZONS);
  const skipped = perSymbol.filter((r) => r.dataInsufficient).map((r) => ({ symbol: r.symbol, reason: r.reason }));
  return {
    symbols: perSymbol.map((r) => r.symbol), years, range,
    perSymbol: perSymbol.map((r) => ({ symbol: r.symbol, eventCount: r.events.length, dataInsufficient: !!r.dataInsufficient })),
    skipped,
    report,
    scopeNote: "Daily-layer only (trend template + Sniper Decision entry trigger). 4H/1H SWING_SETUP/EARLY_DEVELOPMENT and the 8-state confirmation machine are not backtested — see backtest-engine.js header for why.",
  };
}

module.exports = { runBacktest, runBacktestUniverse, buildReport, aggregate, computeOutcome, buildSniperRow, DEFAULT_HORIZONS, MIN_GAP_DAYS };
