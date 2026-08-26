// data-freshness.js — real, honest per-scan data-quality check (Phase 3,
// 2026-08-26, spec Part 2: "the engine must understand data quality...
// if critical data is stale or missing, DO NOT silently use it, show
// DATA QUALITY WARNING"). Pure function, checks the real regularMarketTime
// already present on the same macro quote batch (SPY/QQQ/etc.)
// computeAllOpportunities() already fetches for regime classification —
// no new fetch, no new data source, no per-symbol plumbing into the deep
// scan pipeline (that would be a much larger, riskier change for a
// single-signal freshness check). Only meaningful during real market
// hours — quotes are expected to look "old" right after a real close;
// that's not staleness, that's just the market being closed.
"use strict";

const DEFAULT_STALE_AFTER_MINUTES = 15;

function computeDataFreshness({ quotes, nowMs, isMarketHours, staleAfterMinutes = DEFAULT_STALE_AFTER_MINUTES }) {
  const withTime = (quotes || []).filter((q) => Number.isFinite(q?.regularMarketTime));
  if (!withTime.length) {
    return { checked: false, stale: false, ageMinutes: null, staleAfterMinutes, note: "No real quote timestamp available to check." };
  }
  const newestSec = Math.max(...withTime.map((q) => q.regularMarketTime));
  const ageMinutes = Math.round((nowMs / 1000 - newestSec) / 60);
  const stale = Boolean(isMarketHours) && ageMinutes > staleAfterMinutes;
  return { checked: true, stale, ageMinutes, staleAfterMinutes };
}

module.exports = { computeDataFreshness, DEFAULT_STALE_AFTER_MINUTES };
