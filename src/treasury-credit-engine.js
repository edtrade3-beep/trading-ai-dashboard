"use strict";
// treasury-credit-engine.js — real Treasury + Credit scores (Institutional
// Intelligence Phase 2, 2026-08-23, user's own "AM Trading" institutional-
// architecture spec). Real FRED series (src/fred.js) only — composes
// existing real inputs, invents no new data source.
//
// Disclosed, first-pass point-additive scores (same simple style as
// trade-planner-scoring.js's own computeRegime, not am-core-engine.js's
// more elaborate weighted-bucket system — these are readouts, not gates).
// Real thresholds grounded in actual historical ranges (HY OAS ~3-4% in
// healthy markets, 10%+ in real credit stress like 2020, 20%+ in 2008;
// SLOOS net-tightening spiked well above 30 in 2008/2020) — disclosed
// judgment calls, not backtested/optimized. Every real input degrades
// honestly to a neutral half-credit when absent, never fabricated.
//
// Explicitly NOT covered (no clean free real-time source — a disclosed
// gap, not an invented number): default rates, corporate refinancing
// volume, leveraged-loan issuance, private credit, term premium, Treasury
// auction demand, issuance/fiscal-pressure metrics.

function clampScore(n) { return Math.max(0, Math.min(100, Math.round(n))); }

// input: { fred: { yieldCurve, realYield10y, us10y } } — all real fred.js
// { value, windowChangePct, ... } shapes, already fetched by the caller.
function computeTreasuryScore(input = {}) {
  const fred = input.fred || {};
  const yieldCurve = Number(fred.yieldCurve?.value);
  const realYield = Number(fred.realYield10y?.value);
  const us10yTrend = Number(fred.us10y?.windowChangePct);

  const factors = {
    yieldCurve: Number.isFinite(yieldCurve) ? yieldCurve : null,
    realYield10y: Number.isFinite(realYield) ? realYield : null,
    us10yWindowChangePct: Number.isFinite(us10yTrend) ? us10yTrend : null,
  };

  let score = 0;
  // Yield curve (40pts) — steep/positive = healthy term structure,
  // inverted = the real, standard recession-warning signal.
  score += !Number.isFinite(yieldCurve) ? 20
    : yieldCurve >= 0.5 ? 40 : yieldCurve >= 0.25 ? 30 : yieldCurve >= 0 ? 20 : yieldCurve >= -0.5 ? 8 : 0;
  // Real 10Y yield level (35pts) — disclosed thresholds: real yields this
  // high genuinely tighten financial conditions for borrowers/equities.
  score += !Number.isFinite(realYield) ? 17.5
    : realYield < 1.5 ? 35 : realYield < 2 ? 25 : realYield < 2.5 ? 12 : 0;
  // Real 10Y trend over the fetched window (25pts) — a sharp real rise is
  // a real recent tightening impulse; falling/flat is not.
  score += !Number.isFinite(us10yTrend) ? 12.5
    : us10yTrend <= 0 ? 25 : us10yTrend < 3 ? 15 : us10yTrend < 8 ? 5 : 0;

  return { score: clampScore(score), factors };
}

// input: { fred: { hySpread, igSpread, lendingStandards } }
function computeCreditScore(input = {}) {
  const fred = input.fred || {};
  const hy = Number(fred.hySpread?.value);
  const ig = Number(fred.igSpread?.value);
  const lending = Number(fred.lendingStandards?.value);

  const factors = {
    hySpread: Number.isFinite(hy) ? hy : null,
    igSpread: Number.isFinite(ig) ? ig : null,
    lendingStandards: Number.isFinite(lending) ? lending : null,
  };

  let score = 0;
  // HY OAS spread (40pts) — real historical anchors: <3.5 healthy/tight,
  // 3.5-5 moderate, 5-7 elevated stress, >=7 severe (2020-crisis territory).
  score += !Number.isFinite(hy) ? 20
    : hy < 3.5 ? 40 : hy < 5 ? 28 : hy < 7 ? 12 : 0;
  // IG OAS spread (30pts) — real anchors: <1 healthy, 1-1.5 moderate,
  // 1.5-2.5 elevated, >=2.5 stressed.
  score += !Number.isFinite(ig) ? 15
    : ig < 1 ? 30 : ig < 1.5 ? 21 : ig < 2.5 ? 9 : 0;
  // SLOOS net % of banks tightening C&I lending standards (30pts) — real
  // anchor: 2008/2020 readings spiked well above 30; net easing (negative)
  // or flat is healthy, mild tightening is a soft warning.
  score += !Number.isFinite(lending) ? 15
    : lending <= 0 ? 30 : lending < 10 ? 22 : lending < 30 ? 10 : 0;

  return { score: clampScore(score), factors };
}

// Real, disclosed momentum off HY spread's own real 30-day windowChangePct
// (widening spread = deteriorating credit conditions, narrowing =
// improving). changePts is the real absolute spread move in percentage
// points (not the %-of-value changePct), matching how credit spreads are
// actually quoted/discussed (e.g. "spreads widened 15bps").
function computeCreditMomentum(input = {}) {
  const fred = input.fred || {};
  const hySpread = fred.hySpread;
  const value = Number(hySpread?.value);
  const windowStart = Number.isFinite(value) && Number.isFinite(hySpread?.windowChangePct)
    ? value / (1 + hySpread.windowChangePct / 100)
    : null;
  if (!Number.isFinite(value) || windowStart == null) {
    return { status: null, changePts: null };
  }
  const changePts = Number((value - windowStart).toFixed(2));
  const status = changePts > 0.15 ? "DETERIORATING" : changePts < -0.15 ? "IMPROVING" : "STABLE";
  return { status, changePts };
}

module.exports = { computeTreasuryScore, computeCreditScore, computeCreditMomentum };
