// future-value-scoring.js — client-side twin of src/future-value-scoring.js.
// Pure, dependency-free math, hand-ported here rather than fetched — same
// "small, stable, kept in sync via this header comment" discipline as
// entry-engine.js's own client twin. KEEP IN SYNC: any formula change goes
// in both files. See src/future-value-scoring.js for the full design
// rationale (real analyst-target-based fair value bands, no invented DCF;
// moat is a disclosed proxy, not a fabricated qualitative read).
//
// Reused by SmartScanTab.jsx's deep-dive Valuation section (2026-08-20,
// "ONE ENGINE" unification, phase 3) off the SAME real fundamentals
// (scanDeepData[ticker].fundamentals, from /api/market/fundamentals) this
// page already fetches — zero new requests, zero new scoring system.

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function round2(x) { return Number.isFinite(x) ? Math.round(x * 100) / 100 : null; }

function avg(nums) {
  const xs = nums.filter((x) => Number.isFinite(x));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

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

export function computeQualityScore(f) {
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

export function computeGrowthScore(f) {
  if (!f) return null;
  const parts = [];
  const rev = Number(f.revenueGrowth);
  if (Number.isFinite(rev)) parts.push(bandScore(rev * 100, [[-20, 0], [0, 35], [10, 60], [20, 85], [40, 100]]));
  const eps = Number(f.earningsGrowth);
  if (Number.isFinite(eps)) parts.push(bandScore(eps * 100, [[-20, 0], [0, 35], [10, 60], [20, 85], [40, 100]]));
  const fcfg = Number(f.freeCashFlowGrowth);
  if (Number.isFinite(fcfg)) parts.push(bandScore(fcfg * 100, [[-20, 0], [0, 35], [10, 60], [20, 85], [40, 100]]));
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

export function computeFinancialStrength(f) {
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

export function computeMoatProxy(f) {
  if (!f) return null;
  const parts = [];
  const gm = Number(f.grossMargin);
  if (Number.isFinite(gm)) parts.push(bandScore(gm * 100, [[0, 0], [30, 40], [50, 65], [65, 85], [80, 100]]));
  const roic = Number(f.roic);
  if (Number.isFinite(roic)) parts.push(bandScore(roic * 100, [[-5, 0], [0, 25], [10, 55], [20, 85], [35, 100]]));
  const p = avg(parts);
  return p == null ? null : Math.round(p);
}

export function computeValueScore(f) {
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

export function computeFutureScore({ quality, growth, moat, financialStrength }, upsidePct) {
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

export function computeFairValueBands(f, price) {
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

export function isFutureAndUndervalued({ futureScore, valueScore, marginOfSafetyPct }) {
  return Number.isFinite(futureScore) && futureScore >= 65 &&
    ((Number.isFinite(valueScore) && valueScore >= 60) ||
     (Number.isFinite(marginOfSafetyPct) && marginOfSafetyPct >= 15));
}

export function computeFutureValueRead(f, price) {
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
    sharesGrowth: Number.isFinite(Number(f.sharesGrowth)) ? Number(f.sharesGrowth) : null,
    growth: {
      revenueGrowth: Number.isFinite(Number(f.revenueGrowth)) ? Number(f.revenueGrowth) : null,
      earningsGrowth: Number.isFinite(Number(f.earningsGrowth)) ? Number(f.earningsGrowth) : null,
      threeYRevenueGrowthPerShare: Number.isFinite(Number(f.threeYRevenueGrowthPerShare)) ? Number(f.threeYRevenueGrowthPerShare) : null,
      fiveYRevenueGrowthPerShare: Number.isFinite(Number(f.fiveYRevenueGrowthPerShare)) ? Number(f.fiveYRevenueGrowthPerShare) : null,
      threeYNetIncomeGrowthPerShare: Number.isFinite(Number(f.threeYNetIncomeGrowthPerShare)) ? Number(f.threeYNetIncomeGrowthPerShare) : null,
      fiveYNetIncomeGrowthPerShare: Number.isFinite(Number(f.fiveYNetIncomeGrowthPerShare)) ? Number(f.fiveYNetIncomeGrowthPerShare) : null,
    },
    isFutureAndUndervalued: isFutureAndUndervalued({ futureScore, valueScore: value, marginOfSafetyPct: fairValue?.marginOfSafetyPct }),
  };
}
