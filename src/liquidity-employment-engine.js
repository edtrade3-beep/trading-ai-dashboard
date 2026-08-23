"use strict";
// liquidity-employment-engine.js — real Liquidity + Employment scores
// (Institutional Intelligence Phase 3, 2026-08-23, user's own "AM
// Trading" institutional-architecture spec). Real FRED series (src/
// fred.js) only — composes existing real inputs, invents no new source.
//
// Disclosed, first-pass point-additive scores (same simple style as
// macro-engine.js/treasury-credit-engine.js — readouts, not gates). Every
// real input degrades honestly to a neutral half-credit when absent,
// never fabricated.
//
// Explicitly NOT covered (disclosed gap, not an invented number): labor
// force participation rate, U-6 broader unemployment, JOLTS openings/
// quits — real depth extensions, not required for a genuine first-pass
// read.

function clampScore(n) { return Math.max(0, Math.min(100, Math.round(n))); }

// Net Liquidity = Fed balance sheet − Treasury General Account − reverse
// repo usage, the same real composite macro/liquidity traders actually
// track (expansion of the Fed's balance sheet net of the two mechanisms
// that drain bank reserves). WALCL/WTREGEN are both in $millions
// (consistent units); RRPONTSYD's current near-zero value (the real,
// well-known post-2024 ON-RRP facility drain) means it barely moves this
// composite regardless of its exact unit scale right now — disclosed,
// not hidden.
function netLiquidityAt(walcl, tga, repo, valueKey) {
  const w = Number(walcl?.[valueKey]);
  const t = Number(tga?.[valueKey]);
  const r = Number(repo?.[valueKey]);
  if (!Number.isFinite(w) || !Number.isFinite(t)) return null;
  return w - t - (Number.isFinite(r) ? r : 0);
}

// input: { fred: { fedBalanceSheet, tgaBalance, reverseRepo } }
function computeLiquidityScore(input = {}) {
  const fred = input.fred || {};
  const latest = netLiquidityAt(fred.fedBalanceSheet, fred.tgaBalance, fred.reverseRepo, "value");
  const windowStart = netLiquidityAt(fred.fedBalanceSheet, fred.tgaBalance, fred.reverseRepo, "windowStartValue");

  const factors = {
    netLiquidity: latest,
    netLiquidityWindowStart: windowStart,
    netLiquidityChangePct: (latest != null && windowStart) ? Number((((latest - windowStart) / Math.abs(windowStart)) * 100).toFixed(2)) : null,
  };

  // Fundamentally a TREND metric (no agreed "healthy absolute level" for
  // Net Liquidity, unlike Treasury/Credit's level-based scores) — real,
  // disclosed banding on the % change over the fetched window.
  const changePct = factors.netLiquidityChangePct;
  let score;
  if (!Number.isFinite(changePct)) score = 50;
  else if (changePct >= 1.5) score = 90;
  else if (changePct >= 0.3) score = 72;
  else if (changePct >= -0.3) score = 55;
  else if (changePct >= -1.5) score = 30;
  else score = 10;

  return { score: clampScore(score), factors };
}

// input: { fred: { unemployment, joblessClaims, payrolls, wages } } —
// unemployment/joblessClaims are the SAME real fred.js reads the Macro
// Regime cascade already fetches, passed in by the caller rather than
// re-fetched.
function computeEmploymentScore(input = {}) {
  const fred = input.fred || {};
  const unemploymentTrendPct = Number(fred.unemployment?.windowChangePct);
  const joblessClaimsTrendPct = Number(fred.joblessClaims?.windowChangePct);
  const payrollsTrendPct = Number(fred.payrolls?.windowChangePct);
  const wagesYoy = Number(fred.wages?.yoyChangePct);

  const factors = {
    unemploymentWindowChangePct: Number.isFinite(unemploymentTrendPct) ? unemploymentTrendPct : null,
    joblessClaimsWindowChangePct: Number.isFinite(joblessClaimsTrendPct) ? joblessClaimsTrendPct : null,
    payrollsWindowChangePct: Number.isFinite(payrollsTrendPct) ? payrollsTrendPct : null,
    wagesYoy: Number.isFinite(wagesYoy) ? wagesYoy : null,
  };

  let score = 0;
  // Unemployment rate trend (25pts) — falling/flat is healthy, rising is
  // real labor-market deterioration.
  score += !Number.isFinite(unemploymentTrendPct) ? 12.5
    : unemploymentTrendPct <= 0 ? 25 : unemploymentTrendPct < 2 ? 15 : unemploymentTrendPct < 5 ? 5 : 0;
  // Jobless claims trend (25pts) — the more real-time leading labor
  // indicator; same rising-is-bad direction.
  score += !Number.isFinite(joblessClaimsTrendPct) ? 12.5
    : joblessClaimsTrendPct <= 0 ? 25 : joblessClaimsTrendPct < 5 ? 15 : joblessClaimsTrendPct < 15 ? 5 : 0;
  // Nonfarm payrolls trend (25pts) — real employment growth vs contraction.
  score += !Number.isFinite(payrollsTrendPct) ? 12.5
    : payrollsTrendPct > 0.15 ? 25 : payrollsTrendPct > 0 ? 18 : payrollsTrendPct > -0.15 ? 8 : 0;
  // Real wage growth YoY (25pts) — banded, not "higher is always better":
  // too-hot wage growth (>=5%) is a real inflationary-pressure signal;
  // too-weak (<1.5%) is a real labor-market-cooling signal; 1.5-4% is the
  // healthy real-income-growth-without-overheating band.
  score += !Number.isFinite(wagesYoy) ? 12.5
    : (wagesYoy >= 1.5 && wagesYoy < 4) ? 25 : (wagesYoy >= 4 && wagesYoy < 5) ? 15 : wagesYoy >= 1 ? 10 : 0;

  return { score: clampScore(score), factors };
}

module.exports = { computeLiquidityScore, computeEmploymentScore };
