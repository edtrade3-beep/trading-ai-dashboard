// atr-risk-engine.js — client-side twin of src/atr-risk-engine.js's
// computeAtrRiskLevels ONLY (not computeAntiChase — that already has its
// own real twin, anti-chase.js; not duplicated here). Pure, dependency-
// free math, hand-ported here rather than fetched — same "small, stable,
// kept in sync via this header comment" discipline as entry-engine.js /
// simple-decision.js's own client twins. KEEP IN SYNC: any formula
// change goes in both files. See src/atr-risk-engine.js for the full
// design rationale.
//
// Added One Engine Migration Phase 4 (2026-08-23) so TradePlannerTab.jsx
// can call the real, already-tested ATR stop/target/trailing-stop
// formula directly off its own already-fetched daily bars, instead of
// re-deriving it inline (the exact duplicate Telegram's /plan command
// also had — both move to this same real function together, off the
// same real daily bars each already fetches, so they keep agreeing on
// numbers for the same symbol). atrAt (src/routes/market.js there,
// server-only file for unrelated reasons) is pure array math with no
// real server-only behavior, so it's inlined here rather than imported.

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

const ATR_DEFAULTS = {
  stopMult: 1.5,
  target1R: 2,
  target2R: 3,
  target3R: 4,
  trailingMult: 1.5,
  atrPeriod: 14,
};

function atrAt(bars, period, endIdx) {
  if (endIdx - period < 0) return null;
  let sum = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i += 1) {
    const tr = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close));
    sum += tr;
  }
  return sum / period;
}

// bars: real OHLC bars ({high, low, close}, any timeframe). price: current
// real price to anchor levels off. opts.direction ("LONG"|"SHORT",
// default LONG, added 2026-08-31 for Autopilot 2.0's bidirectional
// trading) — see src/atr-risk-engine.js for the full rationale.
export function computeAtrRiskLevels(bars, price, opts = {}) {
  const o = { ...ATR_DEFAULTS, ...opts };
  const isShort = o.direction === "SHORT";
  if (!Array.isArray(bars) || bars.length < o.atrPeriod + 1 || !Number.isFinite(price) || price <= 0) {
    return { atr: null, stop: null, target1: null, target2: null, target3: null, trailingStop: null, riskPerShare: null, dataInsufficient: true };
  }
  const atrVal = atrAt(bars, o.atrPeriod, bars.length - 1);
  if (!Number.isFinite(atrVal) || atrVal <= 0) {
    return { atr: null, stop: null, target1: null, target2: null, target3: null, trailingStop: null, riskPerShare: null, dataInsufficient: true };
  }
  const stop = round2(isShort ? price + o.stopMult * atrVal : price - o.stopMult * atrVal);
  const riskPerShare = round2(isShort ? stop - price : price - stop);
  const target1 = round2(isShort ? price - o.target1R * riskPerShare : price + o.target1R * riskPerShare);
  const target2 = round2(isShort ? price - o.target2R * riskPerShare : price + o.target2R * riskPerShare);
  const target3 = round2(isShort ? price - o.target3R * riskPerShare : price + o.target3R * riskPerShare);
  const trailingStop = round2(isShort ? price + o.trailingMult * atrVal : price - o.trailingMult * atrVal);
  return { atr: round2(atrVal), stop, target1, target2, target3, trailingStop, riskPerShare, dataInsufficient: false };
}
