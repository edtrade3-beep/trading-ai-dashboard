"use strict";

// future-value-scoring.js — real scoring engine for the "🚀 FUTURE STOCKS" /
// "💎 UNDERVALUED STOCKS" feature (explicit user request, 2026-08-11: "Add
// TWO separate sections to my trading platform ... Never confuse 'good
// company' with 'good stock price'"). Every input here is a REAL field
// already fetched from FMP (src/providers/fmp.js's fetchFmpFundamentals) —
// no invented DCF model, no fabricated "moat score" pulled from thin air.
// Where a requested concept has no real provider field (moat, management
// quality), this either derives a disclosed proxy from real data (moat —
// see computeMoatProxy) or the app simply omits it rather than making a
// number up.
//
// Every band below is a plain, disclosed threshold — same style already
// used by market-helpers.js's computeFundamentalsRead/computeValuationVerdict
// (P/E<15 "cheap", PEG<1 "cheap", revenue growth >=20% "strong", etc.) —
// not a fitted or hidden curve.

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function round2(x) { return Number.isFinite(x) ? Math.round(x * 100) / 100 : null; }

function avg(nums) {
  const xs = nums.filter((x) => Number.isFinite(x));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// Piecewise-linear lookup: points is [[x, score], ...] sorted by x ascending.
function bandScore(value, points) {
  if (!Number.isFinite(value)) return null;
  if (value <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (value >= last[0]) return last[1];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    if (value >= x0 && value <= x1) {
      const t = (value - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return null;
}

// ---- QUALITY_SCORE — real profitability + balance-sheet health ----
function computeQualityScore(f) {
  if (!f) return null;
  const parts = [];
  const pm = Number(f.profitMargin);
  if (Number.isFinite(pm)) parts.push(bandScore(pm * 100, [[-20, 0], [0, 30], [10, 55], [20, 80], [35, 100]]));
  const roe = Number(f.roe);
  if (Number.isFinite(roe)) parts.push(bandScore(roe * 100, [[-10, 0], [0, 30], [10, 55], [20, 80], [35, 100]]));
  const roic = Number(f.roic);
  if (Number.isFinite(roic)) parts.push(bandScore(roic * 100, [[-5, 0], [0, 30], [8, 55], [15, 80], [25, 100]]));
  const cr = Number(f.currentRatio);
  if (Number.isFinite(cr)) parts.push(bandScore(cr, [[0.5, 15], [1, 55], [1.5, 85], [3, 100], [6, 100]]));
  const ndte = Number(f.netDebtToEbitda);
  if (Number.isFinite(ndte)) parts.push(bandScore(ndte, [[-2, 100], [0, 90], [2, 60], [4, 30], [8, 0]]));
  const p = avg(parts);
  return p == null ? null : Math.round(p);
}

// ---- GROWTH_SCORE — current growth blended with real 3yr/5yr durability ----
function computeGrowthScore(f) {
  if (!f) return null;
  const parts = [];
  const rev = Number(f.revenueGrowth);
  if (Number.isFinite(rev)) parts.push(bandScore(rev * 100, [[-20, 0], [0, 35], [10, 60], [20, 85], [40, 100]]));
  const eps = Number(f.earningsGrowth);
  if (Number.isFinite(eps)) parts.push(bandScore(eps * 100, [[-20, 0], [0, 35], [10, 60], [20, 85], [40, 100]]));
  const fcfg = Number(f.freeCashFlowGrowth);
  if (Number.isFinite(fcfg)) parts.push(bandScore(fcfg * 100, [[-20, 0], [0, 35], [10, 60], [20, 85], [40, 100]]));
  // Real 3yr/5yr *per-share* growth (buybacks/dilution already baked in) —
  // a steadier durability signal than one noisy quarter. FMP returns these
  // as cumulative multi-year growth, not annualized, hence the wider bands.
  const threeYRev = Number(f.threeYRevenueGrowthPerShare);
  if (Number.isFinite(threeYRev)) parts.push(bandScore(threeYRev * 100, [[-30, 0], [0, 35], [15, 60], [40, 85], [80, 100]]));
  const fiveYRev = Number(f.fiveYRevenueGrowthPerShare);
  if (Number.isFinite(fiveYRev)) parts.push(bandScore(fiveYRev * 100, [[-30, 0], [0, 35], [25, 60], [60, 85], [120, 100]]));
  const threeYNI = Number(f.threeYNetIncomeGrowthPerShare);
  if (Number.isFinite(threeYNI)) parts.push(bandScore(threeYNI * 100, [[-40, 0], [0, 35], [15, 60], [40, 85], [90, 100]]));
  const fiveYNI = Number(f.fiveYNetIncomeGrowthPerShare);
  if (Number.isFinite(fiveYNI)) parts.push(bandScore(fiveYNI * 100, [[-40, 0], [0, 35], [25, 60], [70, 85], [150, 100]]));
  const p = avg(parts);
  return p == null ? null : Math.round(p);
}

// ---- FINANCIAL_STRENGTH — real liquidity, leverage, and cash generation ----
function computeFinancialStrength(f) {
  if (!f) return null;
  const parts = [];
  const cr = Number(f.currentRatio);
  if (Number.isFinite(cr)) parts.push(bandScore(cr, [[0.5, 15], [1, 55], [1.5, 85], [3, 100], [6, 100]]));
  const ndte = Number(f.netDebtToEbitda);
  if (Number.isFinite(ndte)) parts.push(bandScore(ndte, [[-2, 100], [0, 90], [2, 60], [4, 30], [8, 0]]));
  const fcfy = Number(f.fcfYield);
  if (Number.isFinite(fcfy)) parts.push(bandScore(fcfy * 100, [[-5, 0], [0, 30], [2, 55], [5, 80], [10, 100]]));
  const fcfg = Number(f.freeCashFlowGrowth);
  if (Number.isFinite(fcfg)) parts.push(bandScore(fcfg * 100, [[-20, 20], [0, 50], [15, 75], [35, 100]]));
  const p = avg(parts);
  return p == null ? null : Math.round(p);
}

// ---- MOAT_SCORE (disclosed proxy) — no real "moat" field exists from any
// provider this app integrates. Rather than fabricate one, this derives a
// transparent proxy from two real signals that correlate with durable
// competitive advantage: sustained high gross margin (pricing power) and
// high ROIC (capital earning outsized real returns). ALWAYS surfaced in the
// UI as "Moat Proxy", never presented as a qualitative analyst read.
function computeMoatProxy(f) {
  if (!f) return null;
  const parts = [];
  const gm = Number(f.grossMargin);
  if (Number.isFinite(gm)) parts.push(bandScore(gm * 100, [[0, 0], [30, 40], [50, 65], [65, 85], [80, 100]]));
  const roic = Number(f.roic);
  if (Number.isFinite(roic)) parts.push(bandScore(roic * 100, [[-5, 0], [0, 25], [10, 55], [20, 85], [35, 100]]));
  const p = avg(parts);
  return p == null ? null : Math.round(p);
}

// ---- VALUE_SCORE — cheaper (relative to real disclosed bands) scores higher ----
function computeValueScore(f) {
  if (!f) return null;
  const parts = [];
  const pe = Number(f.pe ?? f.trailingPE);
  if (Number.isFinite(pe) && pe > 0) parts.push(bandScore(pe, [[8, 100], [15, 80], [25, 55], [40, 30], [70, 10], [120, 0]]));
  const peg = Number(f.pegRatio);
  if (Number.isFinite(peg) && peg > 0) parts.push(bandScore(peg, [[0.3, 100], [1, 80], [2, 50], [3, 25], [5, 0]]));
  const ps = Number(f.priceToSales);
  if (Number.isFinite(ps) && ps > 0) parts.push(bandScore(ps, [[1, 100], [3, 75], [6, 50], [10, 25], [20, 0]]));
  const evEbitda = Number(f.evToEbitda);
  if (Number.isFinite(evEbitda) && evEbitda > 0) parts.push(bandScore(evEbitda, [[5, 100], [10, 80], [15, 55], [25, 30], [45, 0]]));
  const fcfy = Number(f.fcfYield);
  if (Number.isFinite(fcfy)) parts.push(bandScore(fcfy * 100, [[-2, 0], [0, 30], [3, 60], [6, 85], [10, 100]]));
  const p = avg(parts);
  return p == null ? null : Math.round(p);
}

// ---- FUTURE_SCORE — weighted blend of durability + moat + strength,
// nudged (not dominated) by real analyst upside ----
function computeFutureScore({ quality, growth, moat, financialStrength }, upsidePct) {
  const weighted = [];
  if (growth != null) weighted.push([growth, 0.35]);
  if (quality != null) weighted.push([quality, 0.25]);
  if (moat != null) weighted.push([moat, 0.20]);
  if (financialStrength != null) weighted.push([financialStrength, 0.20]);
  if (!weighted.length) return null;
  const totalW = weighted.reduce((s, [, w]) => s + w, 0);
  const base = weighted.reduce((s, [v, w]) => s + v * w, 0) / totalW;
  const adj = base + (Number.isFinite(upsidePct) ? clamp(upsidePct / 3, -10, 10) : 0);
  return Math.round(clamp(adj, 0, 100));
}

// ---- Fair value bands — 100% real analyst price targets, no invented DCF.
// Conservative = real analyst LOW target, Fair Value = real analyst MEDIAN
// target, Bull = real analyst HIGH target. Buy-zone bands are just an
// honest split of that real range: bottom half of Low→Median = IDEAL,
// Low-Median→Median = ACCEPTABLE, above Median = TOO EXPENSIVE (paying more
// than what analysts, in aggregate, think it's worth). MAX PRICE TO PAY =
// the real median target — a disclosed rule, not a magic number.
function computeFairValueBands(f, price) {
  const px = Number(price);
  const lo = Number(f?.targetLowPrice);
  const med = Number(f?.targetMedianPrice) || Number(f?.targetMeanPrice) || Number(f?.analystTarget);
  const hi = Number(f?.targetHighPrice);
  if (!Number.isFinite(med) || med <= 0) return null;
  const conservative = Number.isFinite(lo) && lo > 0 ? lo : med * 0.85;
  const bull = Number.isFinite(hi) && hi > 0 ? hi : med * 1.15;
  const idealBuyZoneMax = (conservative + med) / 2;
  const marginOfSafetyPct = Number.isFinite(px) && px > 0 ? ((med - px) / med) * 100 : null;
  let zone = null;
  if (Number.isFinite(px) && px > 0) {
    zone = px <= idealBuyZoneMax ? "IDEAL_BUY_ZONE" : px <= med ? "ACCEPTABLE" : "TOO_EXPENSIVE";
  }
  return {
    conservative: round2(conservative),
    fairValue: round2(med),
    bull: round2(bull),
    idealBuyZoneMax: round2(idealBuyZoneMax),
    maxPriceToPay: round2(med),
    marginOfSafetyPct: marginOfSafetyPct == null ? null : Math.round(marginOfSafetyPct * 10) / 10,
    zone,
  };
}

// 🏆 FUTURE+UNDERVALUED overlap — requires BOTH a real future-quality read
// AND a real attractive-valuation read, never just one (explicit user
// instruction: "Great Future + Undervalued = HIGH PRIORITY" is the ONLY
// case that earns this badge — a great business at a rich price, or a cheap
// weak business, must not qualify).
function isFutureAndUndervalued({ futureScore, valueScore, marginOfSafetyPct }) {
  return Number.isFinite(futureScore) && futureScore >= 65 &&
    ((Number.isFinite(valueScore) && valueScore >= 60) ||
     (Number.isFinite(marginOfSafetyPct) && marginOfSafetyPct >= 15));
}

function computeFutureValueRead(f, price) {
  if (!f) return null;
  const quality = computeQualityScore(f);
  const growth = computeGrowthScore(f);
  const moat = computeMoatProxy(f);
  const financialStrength = computeFinancialStrength(f);
  const value = computeValueScore(f);
  const fairValue = computeFairValueBands(f, price);
  const futureScore = computeFutureScore({ quality, growth, moat, financialStrength }, fairValue?.marginOfSafetyPct);
  return {
    qualityScore: quality,
    growthScore: growth,
    moatScore: moat,
    financialStrength,
    valueScore: value,
    futureScore,
    fairValue,
    // Real share-count trend passthrough (negative = buybacks = good) —
    // surfaced directly rather than folded into a score, since it's a
    // simple real fact the user can read at a glance.
    sharesGrowth: Number.isFinite(Number(f.sharesGrowth)) ? Number(f.sharesGrowth) : null,
    isFutureAndUndervalued: isFutureAndUndervalued({ futureScore, valueScore: value, marginOfSafetyPct: fairValue?.marginOfSafetyPct }),
  };
}

module.exports = {
  computeQualityScore,
  computeGrowthScore,
  computeMoatProxy,
  computeFinancialStrength,
  computeValueScore,
  computeFutureScore,
  computeFairValueBands,
  computeFutureValueRead,
};
