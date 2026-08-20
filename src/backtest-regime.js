"use strict";

// backtest-regime.js — real, deterministic market-regime classifier for the
// MTF Decision System's historical backtest (Task #112, 2026-08-20). Pure
// function of a real SPY daily-bars array; zero fetching, zero fabricated
// regimes. A day is BULL when SPY's price sits above a rising 200-day SMA,
// BEAR is the mirror (price below a falling 200-day SMA), and everything
// else (chop, a flattening SMA, price straddling it) is SIDEWAYS — not a
// 4th invented state, just "neither of the other two confidently held."
// This is the same 200-day-trend read Minervini's own trend template uses
// for criterion #3, applied to the index instead of a single stock.

const { average, round2 } = require("./utils");

const SMA_PERIOD = 200;
const SLOPE_LOOKBACK = 20; // ~1 trading month, same window buildTrendTemplate uses for its own MA200 slope check

// spyBars: real daily bars [{ time, close, ... }], oldest first.
// Returns an array parallel to spyBars: entries before enough history exists
// are null (honest — no regime guessed without a real 200-day SMA behind it).
function classifyRegimeSeries(spyBars) {
  if (!Array.isArray(spyBars) || !spyBars.length) return [];
  const closes = spyBars.map((b) => b.close);
  const out = new Array(spyBars.length).fill(null);
  for (let i = 0; i < spyBars.length; i += 1) {
    if (i < SMA_PERIOD - 1 + SLOPE_LOOKBACK) continue; // need a real SMA200 both now and ~1mo ago
    const sma200 = average(closes.slice(i - SMA_PERIOD + 1, i + 1));
    const sma200Prev = average(closes.slice(i - SMA_PERIOD + 1 - SLOPE_LOOKBACK, i + 1 - SLOPE_LOOKBACK));
    const price = closes[i];
    const rising = sma200 > sma200Prev * 1.001;
    const falling = sma200 < sma200Prev * 0.999;
    let regime;
    if (price > sma200 * 1.01 && rising) regime = "BULL";
    else if (price < sma200 * 0.99 && falling) regime = "BEAR";
    else regime = "SIDEWAYS";
    out[i] = { time: spyBars[i].time, regime, sma200: round2(sma200), price: round2(price) };
  }
  return out;
}

// Looks up the regime in effect as of `time` — the most recent classified
// entry at or before it (a symbol's bar calendar can differ from SPY's by a
// holiday or two; this tolerates that instead of requiring exact alignment).
function regimeAt(regimeSeries, time) {
  let result = null;
  for (const entry of regimeSeries) {
    if (!entry) continue;
    if (entry.time > time) break;
    result = entry;
  }
  return result ? result.regime : null;
}

module.exports = { classifyRegimeSeries, regimeAt, SMA_PERIOD, SLOPE_LOOKBACK };
