"use strict";
// support-resistance-engine.js — the ONE canonical support/resistance
// CLUSTER model for AI Trade Desk (2026-09-18, "BUILD THE CANONICAL QUANT
// ENGINE FOR AI TRADE DESK" master prompt, "SUPPORT / RESISTANCE ENGINE").
// Pure derivation over the same real daily bars quant-feature-engine.js
// already consumes — reuses indicators.js's own computeEMASeries/
// computeVWAP/computeDonchian and atr-risk-engine.js's own ATR, never a
// second copy of any of them. The prompt's own explicit rule: "Do not
// pretend mathematical precision exists when it does not. Use zones." —
// every level here is a real, sourced candidate (an actual swing low, an
// actual EMA value, an actual gap boundary); clustering only ever GROUPS
// real candidates that already agree, it never invents a level.
//
// SIGNAL LIFECYCLE SAFETY: read-only over price/volume bars, no opinion
// on tier/signalState/verdict/Opportunity Score — same additive-lens rule
// as quant-feature-engine.js/what-to-pay.js/valuation-engine.js.

const { computeEMASeries, computeVWAP, computeDonchian } = require("./indicators");
const { computeAtrRiskLevels } = require("./atr-risk-engine");

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

// Real local-extrema swing detector — a low/high is a "swing" only when
// it's the lowest/highest point within `window` real bars on both sides.
// Not a fabricated pattern match, just an honest structural definition
// used consistently for both swing lows and (broken) swing highs below.
function findSwingPoints(bars, window, kind) {
  const points = [];
  const field = kind === "low" ? "low" : "high";
  const better = kind === "low" ? (a, b) => a < b : (a, b) => a > b;
  for (let i = window; i < bars.length - window; i += 1) {
    const v = bars[i][field];
    let isSwing = true;
    for (let j = i - window; j <= i + window; j += 1) {
      if (j === i) continue;
      if (!better(v, bars[j][field]) && v !== bars[j][field]) { isSwing = false; break; }
      if (v === bars[j][field] && j < i) { isSwing = false; break; } // tie goes to the earlier bar, avoid double-counting a flat stretch
    }
    if (isSwing) points.push({ index: i, price: v });
  }
  return points;
}

// Real gap levels — a real gap gap up/down (today's low above yesterday's
// high, or vice versa) over the trailing real bars. The gap boundary
// itself (not the mid-point) is the real candidate support/resistance
// level — the classic "price tends to revisit/hold a real gap edge" read.
function findGapLevels(bars, lookback = 90) {
  const start = Math.max(1, bars.length - lookback);
  const gaps = [];
  for (let i = start; i < bars.length; i += 1) {
    const prev = bars[i - 1], cur = bars[i];
    if (cur.low > prev.high) gaps.push({ price: cur.low, type: "GAP_UP", index: i });
    else if (cur.high < prev.low) gaps.push({ price: cur.high, type: "GAP_DOWN", index: i });
  }
  return gaps;
}

// Real anchored VWAP — the SAME real computeVWAP indicators.js already
// exports, just run over a bar slice anchored from a real structural
// point (a recent swing low/high, or a real high-volume breakout day)
// instead of the whole history. Never a second VWAP formula.
function anchoredVwapFrom(bars, anchorIndex) {
  if (!Number.isFinite(anchorIndex) || anchorIndex < 0 || anchorIndex >= bars.length - 1) return null;
  return round2(computeVWAP(bars.slice(anchorIndex)));
}

// Groups real candidate levels that sit within `tolerancePct` of each
// other into one zone. The more INDEPENDENT sources agree on the same
// price area, the stronger the real evidence — confidence scales with
// that count, never with how many total candidates exist overall (a
// single source repeated wouldn't strengthen a zone; this only counts
// each real distinct source label once per cluster).
function clusterLevels(candidates, tolerancePct) {
  const valid = candidates.filter((c) => Number.isFinite(c.price) && c.price > 0).sort((a, b) => a.price - b.price);
  const clusters = [];
  for (const cand of valid) {
    let placed = false;
    for (const cluster of clusters) {
      const centerPrice = cluster.members.reduce((s, m) => s + m.price, 0) / cluster.members.length;
      if (Math.abs((cand.price - centerPrice) / centerPrice) * 100 <= tolerancePct) {
        cluster.members.push(cand);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ members: [cand] });
  }
  return clusters.map((cluster) => {
    const prices = cluster.members.map((m) => m.price);
    const sources = [...new Set(cluster.members.map((m) => m.source))];
    return {
      low: round2(Math.min(...prices)),
      high: round2(Math.max(...prices)),
      mid: round2(prices.reduce((s, p) => s + p, 0) / prices.length),
      evidenceCount: sources.length,
      sources,
    };
  });
}

// Real, disclosed confidence banding off the real evidence count — never
// a fabricated "mathematical precision" number (the prompt's own explicit
// rule). 1 source = WEAK (a single real level, still worth showing, just
// honestly labeled), 2 = MODERATE, 3+ = STRONG.
function confidenceFor(evidenceCount) {
  if (evidenceCount >= 3) return "STRONG";
  if (evidenceCount === 2) return "MODERATE";
  return "WEAK";
}

// The one real exported function. `bars`: real daily OHLCV, same shape
// every other Trade Desk quant surface already fetches. `pivot`/
// `contractionLow` (optional): the SAME real breakout/support levels
// buildTrendTemplate already computes — passed in rather than
// recalculated, per the ONE-ENGINE rule. Returns real clustered zones
// both below (support) and above (resistance) current price, each with
// a real evidence count/confidence and the actual sources that agree.
function computeSupportResistanceZones({ bars, price, pivot, contractionLow } = {}) {
  if (!Array.isArray(bars) || bars.length < 30 || !Number.isFinite(price) || price <= 0) {
    return { available: false, reason: "Not enough real daily bar history yet." };
  }

  const atrResult = computeAtrRiskLevels(bars, price);
  const atr = atrResult.atr;
  // Clustering tolerance scales with real ATR% — a quiet stock clusters
  // tightly (levels must be genuinely close to count as "the same area"),
  // a volatile one gets a wider real net. Never one fixed % for every
  // stock (the prompt's own repeated rule, applied here too). Floors at
  // 1% so a near-zero-ATR read still produces sane clusters.
  const atrPct = Number.isFinite(atr) && price > 0 ? (atr / price) * 100 : null;
  const tolerancePct = Math.max(1, Number.isFinite(atrPct) ? atrPct * 0.6 : 1.5);

  const candidates = [];

  // EMA20/50/200 — the same real series indicators.js already computes.
  const emaLabels = [[20, "EMA20"], [50, "EMA50"], [200, "EMA200"]];
  for (const [period, label] of emaLabels) {
    if (bars.length < period + 1) continue;
    const val = computeEMASeries(bars, period).at(-1)?.value;
    if (Number.isFinite(val)) candidates.push({ price: val, source: label });
  }

  // Real swing lows/highs (window=3 — a real 3-bar-each-side local
  // extreme, the same convention as detectStructure's own prior-high/low
  // read elsewhere in this codebase, just generalized to a full list).
  const swingLows = findSwingPoints(bars.slice(-120), 3, "low");
  for (const s of swingLows.slice(-6)) candidates.push({ price: s.price, source: "SWING_LOW" });

  // Prior resistance turned support — a real former swing HIGH that
  // price has since broken above and is now trading over. Only counted
  // when it's genuinely below current price (otherwise it's still real
  // resistance, not support) — never relabeled without that real check.
  const swingHighs = findSwingPoints(bars.slice(-120), 3, "high");
  for (const s of swingHighs.slice(-6)) {
    if (s.price < price) candidates.push({ price: s.price, source: "PRIOR_RESISTANCE" });
  }

  // Real gap levels.
  for (const g of findGapLevels(bars)) candidates.push({ price: g.price, source: g.type });

  // Real breakout/consolidation levels — reused, not recalculated.
  if (Number.isFinite(pivot)) candidates.push({ price: pivot, source: "BREAKOUT_PIVOT" });
  if (Number.isFinite(contractionLow)) candidates.push({ price: contractionLow, source: "CONTRACTION_LOW" });
  const donchian = computeDonchian(bars, 20);
  if (donchian) {
    candidates.push({ price: donchian.lower, source: "DONCHIAN_LOWER" });
    candidates.push({ price: donchian.upper, source: "DONCHIAN_UPPER" });
  }

  // Real anchored VWAP — anchored from the most recent real swing low
  // (a genuine structural starting point, not an arbitrary date).
  if (swingLows.length) {
    const lastSwingLow = swingLows.at(-1);
    const av = anchoredVwapFrom(bars, bars.length - 120 + lastSwingLow.index);
    if (Number.isFinite(av)) candidates.push({ price: av, source: "ANCHORED_VWAP" });
  }

  const allZones = clusterLevels(candidates, tolerancePct)
    .map((z) => ({ ...z, confidence: confidenceFor(z.evidenceCount) }))
    .sort((a, b) => a.mid - b.mid);

  const supportZones = allZones.filter((z) => z.high < price);
  const resistanceZones = allZones.filter((z) => z.low > price);

  // The nearest real support zone below price and nearest resistance
  // zone above — the two a caller most likely wants front and center,
  // without discarding the rest (still returned in supportZones/
  // resistanceZones for anyone who wants the full real picture).
  const nearestSupport = supportZones.length ? supportZones[supportZones.length - 1] : null;
  const nearestResistance = resistanceZones.length ? resistanceZones[0] : null;

  return {
    available: true, price: round2(price), atr, atrPercent: round2(atrPct), tolerancePct: round2(tolerancePct),
    supportZones, resistanceZones, nearestSupport, nearestResistance,
  };
}

module.exports = {
  computeSupportResistanceZones, clusterLevels, findSwingPoints, findGapLevels, anchoredVwapFrom, confidenceFor,
};
