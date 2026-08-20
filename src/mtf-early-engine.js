"use strict";

// mtf-early-engine.js — EARLY_DEVELOPMENT (1H timeframe), MTF Decision
// System Phase 2 (2026-08-20). Confirmed via the Phase 1/2 architecture
// audit: nothing in this codebase tracked an indicator's VALUE + SLOPE +
// DIRECTION + ACCELERATION over time before this — every existing engine
// (Sniper Decision, Cortex, Foundation, daytrade-console-engine) reads a
// current snapshot only. This is the one genuinely new module in Phase 2.
//
// Built as ONE small reusable primitive (computeSeriesTrend) applied
// across RSI / volume-ratio / EMA9-vs-21 spread, per the spec's own
// instruction that change-detection should be "one principle used
// throughout," not bespoke per-indicator code.

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

// Real slope/acceleration over the trailing `sampleCount` values of any
// numeric series (RSI readings, volume-ratio readings, whatever). No
// linear regression — deliberately simple and robust rather than fitted:
// slope = average step-to-step change; acceleration = whether the most
// recent step is meaningfully bigger (same direction) than the earlier
// steps' average.
function computeSeriesTrend(values, sampleCount = 5) {
  const v = (values || []).filter((x) => Number.isFinite(x)).slice(-sampleCount);
  if (v.length < 3) return { slope: null, direction: null, accelerating: null, samples: v };
  const deltas = [];
  for (let i = 1; i < v.length; i++) deltas.push(v[i] - v[i - 1]);
  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const slope = round2(avgDelta);
  // "Flat" threshold scales with the series' own magnitude — a fixed
  // 0.01 absolute cutoff correctly flags noise for a volume-ratio series
  // (~0-3) but wrongly reads ordinary RSI/RS noise (~0-100, single-point
  // wobbles of 0.2-0.3 per step) as a real trend. Real bug found while
  // testing: an RS series of 90/90.2/89.9/90.1 (pure noise) was reading
  // "up" before this fix.
  const avgAbsValue = v.reduce((a, b) => a + Math.abs(b), 0) / v.length;
  const flatThreshold = Math.max(0.01, avgAbsValue * 0.005);
  const direction = avgDelta > flatThreshold ? "up" : avgDelta < -flatThreshold ? "down" : "flat";
  const recentDelta = deltas[deltas.length - 1];
  const earlierDeltas = deltas.slice(0, -1);
  const avgEarlier = earlierDeltas.length ? earlierDeltas.reduce((a, b) => a + b, 0) / earlierDeltas.length : 0;
  const accelerating = direction !== "flat"
    && Math.sign(recentDelta) === Math.sign(avgDelta || 1)
    && Math.abs(recentDelta) > Math.abs(avgEarlier) * 1.1;
  return { slope, direction, accelerating, samples: v.map((n) => round2(n)) };
}

// EARLY_DEVELOPMENT off real 1H series already computed by
// fetchYahooCandlesWithIndicators (ema9, ema21, rsi) plus real volume off
// the raw bars — zero new data fetching, this module is pure math over
// data the platform already pulls.
function computeEarlyDevelopment({ bars, indicators }) {
  if (!Array.isArray(bars) || bars.length < 10 || !indicators) {
    return { score: null, dataInsufficient: true, reasons: [] };
  }

  const rsiSeries = (indicators.rsi || []).map((p) => p.value);
  const rsiTrend = computeSeriesTrend(rsiSeries);

  const volumes = bars.map((b) => b.volume || 0);
  const last20 = volumes.slice(-20);
  const avgVol20 = last20.length ? last20.reduce((a, b) => a + b, 0) / last20.length : 0;
  const volRatioSeries = bars.slice(-8)
    .map((b) => (avgVol20 > 0 ? round2((b.volume || 0) / avgVol20) : null))
    .filter((x) => x != null);
  const volTrend = computeSeriesTrend(volRatioSeries);

  const ema9Series = (indicators.ema9 || []).map((p) => p.value);
  const ema21Series = (indicators.ema21 || []).map((p) => p.value);
  const spreadSeries = ema9Series
    .map((v, i) => (Number.isFinite(v) && Number.isFinite(ema21Series[i]) && ema21Series[i] !== 0
      ? round2((v - ema21Series[i]) / ema21Series[i] * 100) : null))
    .filter((x) => x != null);
  const stackTrend = computeSeriesTrend(spreadSeries);

  const reasons = [];
  let points = 0;
  const known = [];

  if (rsiTrend.direction != null) {
    known.push(rsiTrend.direction);
    if (rsiTrend.direction === "up") {
      points += rsiTrend.accelerating ? 2 : 1;
      reasons.push(`RSI improving${rsiTrend.accelerating ? " and accelerating" : ""} (${rsiTrend.samples.join(" → ")}).`);
    } else if (rsiTrend.direction === "down") {
      reasons.push(`RSI weakening (${rsiTrend.samples.join(" → ")}).`);
    }
  }
  if (volTrend.direction != null) {
    known.push(volTrend.direction);
    if (volTrend.direction === "up") {
      points += volTrend.accelerating ? 2 : 1;
      reasons.push(`Participation increasing${volTrend.accelerating ? " and accelerating" : ""} (${volTrend.samples.map((n) => n + "x").join(" → ")}).`);
    } else if (volTrend.direction === "down") {
      reasons.push("Participation fading.");
    }
  }
  if (stackTrend.direction != null) {
    known.push(stackTrend.direction);
    if (stackTrend.direction === "up") {
      points += 1;
      reasons.push("9/21 EMA spread widening bullishly on the 1H.");
    } else if (stackTrend.direction === "down") {
      reasons.push("9/21 EMA spread narrowing or inverting on the 1H.");
    }
  }

  const maxPoints = 5; // 2 (RSI) + 2 (volume) + 1 (EMA stack)
  const score = known.length ? Math.max(0, Math.min(100, Math.round(points / maxPoints * 100))) : null;

  if (!reasons.length) reasons.push("Not enough real 1H history yet to read a trend.");

  return { score, reasons, rsiTrend, volTrend, stackTrend, dataInsufficient: false };
}

module.exports = { computeSeriesTrend, computeEarlyDevelopment };
