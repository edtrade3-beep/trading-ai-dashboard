// spy-seasonality-engine.js — pure historical seasonality math for the
// Market Wrap "Seasonality" chart (explicit user request, 2026-08-31,
// shared two NDR-style S&P 500 Cycle Composite charts: "ADD HISTORICAL
// CHART IN MARKET WRAP EXPECTATION PREDICTION SPY HISTORY IN THE CURRENT
// MONTH WHAT MIGHT HAPPEND FOR EXAMPLE IN SEP MARKET SELL OFF IN SEPT IN
// ELECTION YEAR"). Deliberately NOT a synthetic multi-cycle composite
// curve like the reference charts (that requires proprietary NDR
// methodology/decades of intraday-resolution data this app doesn't
// have) — instead, an honest, directly real-data-computed read: for the
// given month, what did SPY (or any symbol) actually return in each of
// the real years on file, bucketed by the real 4-year US presidential
// cycle (a real, well-known, purely arithmetic classification — not a
// model guess). Real number always wins; nothing here is AI-touched.
"use strict";

const CYCLE_TYPES = ["PRESIDENTIAL", "POST_ELECTION", "MIDTERM", "PRE_ELECTION"];

// US presidential elections land on years divisible by 4 (2024, 2028…).
// Midterms are exactly 2 years after (2026, 2030…). Pure arithmetic, no
// external data needed — this is a calendar fact, not a market read.
function classifyCycleYear(year) {
  const r = ((Number(year) % 4) + 4) % 4;
  if (r === 0) return "PRESIDENTIAL";
  if (r === 1) return "POST_ELECTION";
  if (r === 2) return "MIDTERM";
  return "PRE_ELECTION";
}

// bars: real [{time (ms), close}], ascending by time. monthIndex: 0-11.
// For each real calendar year present, finds the last real close BEFORE
// that year's copy of the target month (the real entry price) and the
// last real close WITHIN that month (the real exit price) — skips a year
// entirely if either is missing (e.g., dataset starts mid-year, or the
// month hasn't happened yet this year), never fabricates a return.
function computeMonthlySeasonality(bars, monthIndex) {
  if (!Array.isArray(bars) || !bars.length || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return { years: [], stats: emptyStats() };
  }
  const clean = bars
    .filter((b) => b && Number.isFinite(b.time) && Number.isFinite(b.close))
    .map((b) => ({ time: b.time, close: b.close, d: new Date(b.time) }))
    .sort((a, b) => a.time - b.time);
  if (!clean.length) return { years: [], stats: emptyStats() };

  const byYear = new Map();
  for (const b of clean) {
    const y = b.d.getUTCFullYear();
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(b);
  }

  const years = [];
  for (const year of [...byYear.keys()].sort((a, b) => a - b)) {
    const monthBars = clean.filter((b) => b.d.getUTCFullYear() === year && b.d.getUTCMonth() === monthIndex);
    if (!monthBars.length) continue;
    const priorBars = clean.filter((b) => b.time < monthBars[0].time);
    if (!priorBars.length) continue; // no real entry price on file — never fabricate one
    const entryClose = priorBars[priorBars.length - 1].close;
    const exitClose = monthBars[monthBars.length - 1].close;
    if (!(entryClose > 0)) continue;
    years.push({
      year,
      cycleType: classifyCycleYear(year),
      returnPct: Number((((exitClose - entryClose) / entryClose) * 100).toFixed(2)),
      tradingDays: monthBars.length,
    });
  }

  return { years, stats: computeStats(years) };
}

function avg(nums) {
  if (!nums.length) return null;
  return Number((nums.reduce((s, n) => s + n, 0) / nums.length).toFixed(2));
}

function emptyStats() {
  const byCycleType = {};
  for (const t of CYCLE_TYPES) byCycleType[t] = { avg: null, winRate: null, count: 0 };
  return { avg: null, winRate: null, count: 0, byCycleType };
}

function computeStats(years) {
  if (!years.length) return emptyStats();
  const rets = years.map((y) => y.returnPct);
  const byCycleType = {};
  for (const t of CYCLE_TYPES) {
    const sub = years.filter((y) => y.cycleType === t).map((y) => y.returnPct);
    byCycleType[t] = {
      avg: avg(sub),
      winRate: sub.length ? Number(((sub.filter((r) => r > 0).length / sub.length) * 100).toFixed(0)) : null,
      count: sub.length,
    };
  }
  return {
    avg: avg(rets),
    winRate: Number(((rets.filter((r) => r > 0).length / rets.length) * 100).toFixed(0)),
    count: years.length,
    byCycleType,
  };
}

// All 12 months at once (2026-08-31, explicit user request after seeing
// the single-month chart: "MAKE IT MORE DETAILED MONTHLY") — reuses the
// SAME already-fetched real bars for every month rather than re-fetching,
// so the full-year view costs one real network call, not twelve.
function computeAllMonthsSeasonality(bars) {
  const months = [];
  for (let m = 0; m < 12; m++) {
    const { years, stats } = computeMonthlySeasonality(bars, m);
    months.push({ month: m, years, stats });
  }
  return months;
}

module.exports = { CYCLE_TYPES, classifyCycleYear, computeMonthlySeasonality, computeAllMonthsSeasonality };
