// src/volatility-lab.js — real Historical Volatility, Realized Volatility,
// IV skew, and IV term structure. Options platform redesign Phase 8.
//
// HV/RV are pure math over real daily bars (fetchYahooBars-shaped:
// {time, open, high, low, close, volume}) — the standard textbook
// definition (annualized stdev of daily log returns), computed fresh here
// since the existing src/risk-lab-calc.js `estimateVol` is a different,
// simplified ATR/price proxy built for parametric VaR, not this metric.
//
// Skew/Term Structure require real per-contract `delta`/`iv` from a
// Polygon-sourced options-chain sample (same shape routes/market.js's
// GEX route already builds: {strike, expiry, type, delta, iv}) — honest
// `{available:false, reason}` when delta isn't present (Yahoo's fallback
// chain has none), same convention gamma-exposure.js established.
const { round2 } = require("./utils");

function logReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) out.push(Math.log(closes[i] / closes[i - 1]));
  }
  return out;
}

function stdev(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// Annualized realized volatility (%) over the trailing `days` real daily
// bars — sqrt(252) is the standard trading-days-per-year annualization
// factor. Returns null (never a guess) when there aren't enough real bars.
function computeRealizedVol(bars, days) {
  if (!Array.isArray(bars) || bars.length < days + 1) return null;
  const closes = bars.slice(-(days + 1)).map(b => Number(b.close)).filter(c => c > 0);
  if (closes.length < days) return null;
  const sd = stdev(logReturns(closes));
  if (sd == null) return null;
  return round2(sd * Math.sqrt(252) * 100);
}

// HV20/HV60 (the standard longer lookbacks) + RV10 (short realized vol,
// used to judge whether current IV is rich/cheap vs. what's actually
// happening right now) — each independently null when real history is
// short, never backfilled or estimated.
function computeHvRv(bars) {
  return {
    hv20: computeRealizedVol(bars, 20),
    hv60: computeRealizedVol(bars, 60),
    rv10: computeRealizedVol(bars, 10),
  };
}

// Real 25-delta skew: put IV minus call IV at the strikes whose real
// delta is closest to the standard 25-delta convention. `contracts` —
// real {strike, type: "call"|"put", delta, iv} rows (delta signed, put
// delta negative) from a single expiry's real Polygon chain. Requires
// real delta — never derived from strike distance as a substitute, since
// that would silently change what "25-delta" means.
function computeSkew(contracts) {
  if (!Array.isArray(contracts) || contracts.length === 0) {
    return { available: false, reason: "No real contract data for this expiry." };
  }
  const calls = contracts.filter(c => c.type === "call" && c.delta != null && Number.isFinite(Number(c.iv)));
  const puts = contracts.filter(c => c.type === "put" && c.delta != null && Number.isFinite(Number(c.iv)));
  if (calls.length === 0 || puts.length === 0) {
    return { available: false, reason: "Skew requires real per-contract delta (Polygon) — unavailable on this chain." };
  }
  const bestCall = calls.reduce((best, c) =>
    Math.abs(Number(c.delta) - 0.25) < Math.abs(Number(best.delta) - 0.25) ? c : best
  );
  const bestPut = puts.reduce((best, c) =>
    Math.abs(Number(c.delta) + 0.25) < Math.abs(Number(best.delta) + 0.25) ? c : best
  );
  // Tolerance: if the closest real delta available is too far from 0.25
  // (a sparse/illiquid chain), the read isn't a reliable "25-delta" skew —
  // report honestly rather than silently mislabeling a 5-delta or 60-delta
  // reading as if it were the standard convention.
  if (Math.abs(Number(bestCall.delta) - 0.25) > 0.15 || Math.abs(Number(bestPut.delta) + 0.25) > 0.15) {
    return { available: false, reason: "No real contracts near 25-delta on this chain — skew read would be unreliable." };
  }
  const skew = round2(Number(bestPut.iv) - Number(bestCall.iv));
  return {
    available: true, skew,
    callIv: round2(Number(bestCall.iv)), callStrike: bestCall.strike, callDelta: round2(Number(bestCall.delta)),
    putIv: round2(Number(bestPut.iv)), putStrike: bestPut.strike, putDelta: round2(Number(bestPut.delta)),
    label: skew > 3 ? "Put skew (downside fear priced in)" : skew < -3 ? "Call skew (upside chase priced in)" : "Flat skew",
  };
}

// Real IV term structure across multiple real expiries sampled from the
// same chain fetch (contracts carry `expiry`, `dte`, `type`, `iv`, real
// strikes — no per-contract delta required here, just ATM proximity).
// `underlying` — real spot price.
function computeTermStructure(contracts, underlying) {
  const u = Number(underlying);
  if (!Array.isArray(contracts) || contracts.length === 0 || !(u > 0)) {
    return { available: false, reason: "No real contract data to build a term structure." };
  }
  const byExpiry = new Map();
  for (const c of contracts) {
    if (!c.expiry || !Number.isFinite(Number(c.iv))) continue;
    if (!byExpiry.has(c.expiry)) byExpiry.set(c.expiry, []);
    byExpiry.get(c.expiry).push(c);
  }
  const points = [];
  for (const [expiry, rows] of byExpiry.entries()) {
    const atm = rows.reduce((best, c) =>
      Math.abs(Number(c.strike) - u) < Math.abs(Number(best.strike) - u) ? c : best
    );
    points.push({ expiry, dte: atm.dte ?? null, atmIv: round2(Number(atm.iv)) });
  }
  points.sort((a, b) => (a.dte ?? 0) - (b.dte ?? 0));
  if (points.length < 2) {
    return { available: false, reason: "Term structure needs real contracts across at least 2 expiries — this chain sample only covers one." };
  }
  const near = points[0], far = points[points.length - 1];
  const diff = round2(far.atmIv - near.atmIv);
  return {
    available: true, points,
    nearExpiry: near.expiry, nearAtmIv: near.atmIv,
    farExpiry: far.expiry, farAtmIv: far.atmIv,
    structure: diff > 1 ? "Contango (normal — near-term IV lower than far-term)"
      : diff < -1 ? "Backwardation (near-term IV elevated — often event/uncertainty-driven)"
      : "Flat term structure",
  };
}

// Real IV Rank trend — rising/falling/flat over the real recent daily
// snapshot history iv-history-store.js already accumulates. Not a
// forecast: a deterministic read on real past data only, explicitly
// never framed as a prediction of future IV.
function ivRankTrend(symbol, history) {
  if (!Array.isArray(history) || !symbol) return { available: false, reason: "No real IV history to read a trend from." };
  const series = [];
  for (const day of history) {
    const row = (day.symbols || []).find(s => s.symbol === symbol);
    if (row && Number.isFinite(Number(row.iv))) series.push(Number(row.iv));
  }
  if (series.length < 3) {
    return { available: false, reason: `IV trend needs at least 3 real daily snapshots — ${series.length} collected.` };
  }
  const recent = series.slice(-5);
  const first = recent[0], last = recent[recent.length - 1];
  const pctChange = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
  const direction = pctChange > 10 ? "Rising" : pctChange < -10 ? "Falling" : "Flat";
  return { available: true, direction, pctChange: round2(pctChange), daysUsed: recent.length };
}

// Deterministic Buy Premium / Sell Premium / Avoid recommendation off
// real IV Rank — mirrors market-helpers.js's regimeStrategyHint pattern
// (plain ordered-threshold lookup, no new model).
function volRecommendation({ ivRank } = {}) {
  const r = Number(ivRank);
  if (!Number.isFinite(r)) return "Insufficient Data";
  if (r >= 70) return "Sell Premium";
  if (r <= 30) return "Buy Premium";
  return "Neutral / Avoid";
}

module.exports = { computeRealizedVol, computeHvRv, computeSkew, computeTermStructure, ivRankTrend, volRecommendation };
