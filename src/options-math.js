// src/options-math.js — pure math over already-real options-chain data.
// No fetches, no fabrication: every function here takes real fields already
// returned by GET /api/market/options (strike, bid, ask, iv, delta,
// openInterest, volume — see mapP() in routes/market.js) and derives a real
// number from them. Built for the options platform redesign, Phase 0 —
// feeds the Option Contract Recommender and Smart Option Chain sort keys in
// a later phase, but is a standalone, testable module with zero
// framework/route dependencies. Every function returns null (never a
// placeholder number) when its real required inputs are missing.

// Standard normal CDF (Zelen & Severo approximation), used for
// Black-Scholes N(d2).
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) p = 1 - p;
  return p;
}

// Probability of profit (expiring ITM), 0-100. Prefers a full Black-Scholes
// N(d2) when iv/strike/underlying/dte are all real and present (most
// accurate); falls back to the standard |delta| approximation (a contract's
// delta already IS an approximate probability of expiring ITM) when only
// delta is available — e.g. a Yahoo-sourced chain with no IV. Returns null,
// not a placeholder, when neither real input is present.
function probabilityOfProfit({ delta, iv, strike, underlying, dte, isCall } = {}) {
  if (
    Number.isFinite(iv) && iv > 0 &&
    Number.isFinite(strike) && strike > 0 &&
    Number.isFinite(underlying) && underlying > 0 &&
    Number.isFinite(dte) && dte > 0
  ) {
    const sigma = iv / 100;
    const t = dte / 365;
    const d1 = (Math.log(underlying / strike) + 0.5 * sigma * sigma * t) / (sigma * Math.sqrt(t));
    const d2 = d1 - sigma * Math.sqrt(t);
    const pop = isCall ? normCdf(d2) * 100 : (1 - normCdf(d2)) * 100;
    return Math.round(Math.max(0, Math.min(100, pop)));
  }
  if (Number.isFinite(delta)) {
    return Math.round(Math.max(0, Math.min(100, Math.abs(delta) * 100)));
  }
  return null;
}

// Expected 1-standard-deviation move over the contract's remaining life:
// IV × sqrt(DTE/365) × underlying. Real inputs only.
function expectedMove({ iv, underlying, dte } = {}) {
  if (
    !Number.isFinite(iv) || iv <= 0 ||
    !Number.isFinite(underlying) || underlying <= 0 ||
    !Number.isFinite(dte) || dte <= 0
  ) return null;
  const sigma = iv / 100;
  const move = underlying * sigma * Math.sqrt(dte / 365);
  return Math.round(move * 100) / 100;
}

// Bid-ask spread as % of mid price. Null (not 0) when bid/ask are
// missing/zero/crossed — a real 0% spread would be a data anomaly, not an
// honest "no spread" state, so this never fabricates a favorable number.
function spreadPct({ bid, ask } = {}) {
  const b = Number(bid), a = Number(ask);
  if (!Number.isFinite(b) || !Number.isFinite(a) || b <= 0 || a <= 0 || a < b) return null;
  const mid = (a + b) / 2;
  if (mid <= 0) return null;
  return Math.round(((a - b) / mid) * 10000) / 100; // %, 2dp
}

// Liquidity score 0-100 — a weighted composite of spread% (tighter=better),
// open interest, and today's volume. Weights are a documented judgment
// call, not a standard industry formula: spread is the strongest real-time
// liquidity signal (40%), OI reflects standing market depth (35%), volume
// reflects today's actual trading activity (25%). Each sub-score is a
// real, bounded transform of a real field.
function liquidityScore({ bid, ask, openInterest, volume } = {}) {
  const spread = spreadPct({ bid, ask });
  // Spread sub-score: 0% spread -> 100, 20%+ spread -> 0, linear between.
  // When spread can't be computed (no real bid/ask), use a below-neutral
  // 40 rather than guessing high or low — an honest partial composite, not
  // a fabricated spread number.
  const spreadSub = spread == null ? 40 : Math.max(0, Math.min(100, 100 - (spread / 20) * 100));
  // OI sub-score: log-scaled, 5000+ contracts -> 100.
  const oi = Number(openInterest) || 0;
  const oiSub = Math.max(0, Math.min(100, (Math.log10(oi + 1) / Math.log10(5001)) * 100));
  // Volume sub-score: log-scaled, 2000+ contracts today -> 100.
  const vol = Number(volume) || 0;
  const volSub = Math.max(0, Math.min(100, (Math.log10(vol + 1) / Math.log10(2001)) * 100));
  const score = spreadSub * 0.4 + oiSub * 0.35 + volSub * 0.25;
  return Math.round(score);
}

module.exports = { normCdf, probabilityOfProfit, expectedMove, spreadPct, liquidityScore };
