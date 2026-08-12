"use strict";

// seasonal-cycle.js — real S&P 500 "Cycle Composite" chart (explicit user
// request, 2026-08-12, after seeing Ned Davis Research's proprietary
// "S&P 500 Cycle Composite for 2026" chart via a Mark Minervini post). NDR's
// exact chart/branding/dataset is a paid proprietary product ("Distribution
// prohibited without permission") — this is NOT that. It IS a genuine,
// independently-computed version of the same well-known, public statistical
// technique (popularized by Yale Hirsch's Stock Trader's Almanac): equal-
// weight the real 1-year seasonal cycle, 4-year presidential cycle, and
// 10-year decennial cycle, each averaged from real historical S&P 500 daily
// closes, then overlay the real current year's actual performance.
//
// Real data source: Yahoo's ^GSPC daily chart endpoint with an explicit
// period1=0 range — confirmed live (2026-08-11) to return real daily closes
// back to 1970-01-02 (56 years), vs. NDR's own 1928 start. Every average
// below is computed from that real series; nothing is a fabricated curve.

const { writeJson, fetchJsonSafe } = require("../utils");

const CACHE_TTL_MS = 24 * 60 * 60_000; // 24h — only today's bar changes intraday
let _cache = null;
let _cacheTs = 0;

const CYCLE_LABELS = { 0: "Election Year", 1: "Post-Election Year", 2: "Midterm Year", 3: "Pre-Election Year" };

async function fetchGspcFullHistory() {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?period1=0&period2=${Math.floor(Date.now() / 1000)}&interval=1d`;
  const payload = await fetchJsonSafe(url);
  const result = payload?.chart?.result?.[0];
  const ts = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(ts) || !Array.isArray(closes)) return null;
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (!Number.isFinite(c) || c <= 0) continue;
    bars.push({ date: new Date(ts[i] * 1000), close: c });
  }
  return bars.length ? bars : null;
}

function computeCycleComposite() {
  return fetchGspcFullHistory().then((bars) => {
    if (!bars || bars.length < 500) return { ok: false, error: "Historical S&P 500 data unavailable" };

    // Group real bars by calendar year, in trading-day order.
    const byYear = new Map();
    for (const b of bars) {
      const y = b.date.getUTCFullYear();
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(b);
    }

    const currentYear = new Date().getUTCFullYear();
    const cyclePosition = currentYear % 4;
    const decennialDigit = currentYear % 10;

    // Real cumulative % return per trading-day-index, for every year.
    const yearSeries = new Map(); // year -> [pct, pct, ...]
    for (const [y, rows] of byYear.entries()) {
      if (rows.length < 100) continue; // partial/incomplete year at data edges
      const base = rows[0].close;
      yearSeries.set(y, rows.map((r) => (r.close / base - 1) * 100));
    }

    const allYears = [...yearSeries.keys()].filter((y) => y !== currentYear);
    const presidentialYears = allYears.filter((y) => y % 4 === cyclePosition);
    const decennialYears = allYears.filter((y) => y % 10 === decennialDigit);

    const maxLen = Math.max(...[...yearSeries.values()].map((s) => s.length));
    const avgSeries = (years) => {
      const out = [];
      for (let i = 0; i < maxLen; i++) {
        const vals = years.map((y) => yearSeries.get(y)[i]).filter((v) => Number.isFinite(v));
        out.push(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
      }
      return out;
    };

    const seasonalAvg = avgSeries(allYears);
    const presidentialAvg = avgSeries(presidentialYears);
    const decennialAvg = avgSeries(decennialYears);

    // Equal-weighted composite (NDR's own stated methodology) — only where
    // all three real components have a value at that trading-day index.
    const composite = seasonalAvg.map((s, i) => {
      const p = presidentialAvg[i], d = decennialAvg[i];
      if (![s, p, d].every((v) => Number.isFinite(v))) return null;
      return Math.round(((s + p + d) / 3) * 100) / 100;
    });

    // Real current-year actual performance, only through today.
    const actual = yearSeries.get(currentYear) || [];
    const actualPadded = Array.from({ length: maxLen }, (_, i) => (i < actual.length ? Math.round(actual[i] * 100) / 100 : null));

    // Real average trading-day-index for the 1st trading day of each
    // calendar month, across every historical year — used for honest month
    // gridlines instead of a guessed fixed spacing.
    const monthStartIdx = Array(12).fill(0).map(() => []);
    for (const rows of byYear.values()) {
      if (rows.length < 100) continue;
      let seenMonth = -1;
      rows.forEach((r, i) => {
        const m = r.date.getUTCMonth();
        if (m !== seenMonth) { monthStartIdx[m].push(i); seenMonth = m; }
      });
    }
    const monthTicks = monthStartIdx.map((arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

    return {
      ok: true,
      currentYear,
      cyclePosition,
      cyclePositionLabel: CYCLE_LABELS[cyclePosition],
      decennialDigit,
      dataFrom: bars[0].date.toISOString().slice(0, 10),
      dataTo: bars[bars.length - 1].date.toISOString().slice(0, 10),
      seasonalYearsCount: allYears.length,
      presidentialYearsCount: presidentialYears.length,
      decennialYearsCount: decennialYears.length,
      composite,
      actual: actualPadded,
      monthTicks,
      updatedAt: new Date().toISOString(),
    };
  });
}

async function getCycleCompositeCached() {
  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_TTL_MS) return _cache;
  const result = await computeCycleComposite().catch((e) => ({ ok: false, error: e.message }));
  if (result.ok) { _cache = result; _cacheTs = now; }
  return result;
}

async function handleSeasonalCycle(req, res) {
  try {
    const result = await getCycleCompositeCached();
    return writeJson(res, 200, result);
  } catch (e) {
    return writeJson(res, 200, { ok: false, error: e.message });
  }
}

module.exports = { handleSeasonalCycle };
