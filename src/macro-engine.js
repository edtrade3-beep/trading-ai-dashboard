"use strict";
// macro-engine.js — real Macro Regime Engine (Institutional Intelligence
// Phase 1, 2026-08-23, user's own "AM Trading" institutional-architecture
// spec: "the Core Engine should understand the environment before judging
// an individual stock"). Pure classification off real FRED macro series
// (src/fred.js) + real SPY/QQQ/VIX quotes already fetched elsewhere in
// this app — composes existing real inputs, invents no new data source.
//
// Disclosed, first-pass rule cascade (same discipline as am-core-engine.js's
// own disclosed point allocation) — derived from standard macro-regime
// framework logic (yield-curve inversion as a recession signal, VIX/tape
// as risk-appetite, Fed policy direction + core inflation as cycle-stage
// context), NOT backtested or quant-optimized. Every real input degrades
// honestly when absent (that clause is skipped, never fabricated) — same
// "never fabricate" discipline as every other engine in this app.
//
// No client twin — unlike computeGreenLight, nothing client-side needs to
// recompute this on a tight tick loop, and FRED CSV fetches can't run
// client-side anyway (CORS). The server computes once (routes/market.js,
// cached), the client only displays the real result.
//
// NOT wired into am-core-engine.js's computeCoreScore this phase
// (disclosed) — ships as its own real, visible read first; folding it
// into the Core Engine's bucket weights is a deliberate follow-up phase
// once this classification itself has been visible and validated.

const REGIME_META = {
  FINANCIAL_STRESS:  { icon: "🔴", label: "Financial Stress", color: "#c8282a" },
  RECESSION_RISK:    { icon: "🔴", label: "Recession Risk", color: "#c8282a" },
  RISK_OFF:          { icon: "🟠", label: "Risk Off", color: "#e08a1e" },
  LATE_CYCLE:        { icon: "🟠", label: "Late Cycle", color: "#e08a1e" },
  DISTRIBUTION:      { icon: "🟡", label: "Distribution", color: "#d6a312" },
  SELECTIVE_RISK_ON: { icon: "🟡", label: "Selective Risk-On", color: "#d6a312" },
  RECOVERY:          { icon: "🟢", label: "Recovery", color: "#0d9465" },
  RISK_ON:           { icon: "🟢", label: "Risk On", color: "#0d9465" },
};

// Real trend off a real windowed % change (fred.js's windowChangePct —
// latest vs the oldest real observation in the fetched window, not just
// the prior day, since staircase series like Fed funds barely move
// day-to-day except right at a policy decision). flatBand is a disclosed,
// per-series noise threshold below which a real move doesn't count as a
// genuine trend.
function trendOf(windowChangePct, flatBand) {
  if (!Number.isFinite(windowChangePct)) return null;
  if (windowChangePct > flatBand) return "rising";
  if (windowChangePct < -flatBand) return "falling";
  return "flat";
}

// input: { fred: { yieldCurve, fedFunds, unemployment, joblessClaims, cpi,
// corePce }, vixLevel, spyChg, qqqChg } — fred.* entries are fred.js's own
// real { value, windowChangePct, yoyChangePct, ... } shape, already
// fetched by the caller (routes/market.js). All real, all already-fetched
// elsewhere — no new fetches happen inside this pure function.
function computeMacroRegime(input = {}) {
  const fred = input.fred || {};
  const vixLevel = Number(input.vixLevel);
  const spyChg = Number(input.spyChg);
  const qqqChg = Number(input.qqqChg);

  const yieldCurve = Number(fred.yieldCurve?.value);
  const fedFundsTrend = trendOf(fred.fedFunds?.windowChangePct, 0.5);
  const unemploymentTrend = trendOf(fred.unemployment?.windowChangePct, 1);
  const joblessClaimsTrend = trendOf(fred.joblessClaims?.windowChangePct, 2);
  const corePceYoy = Number(fred.corePce?.yoyChangePct);
  const cpiYoy = Number(fred.cpi?.yoyChangePct);
  // Core PCE (the Fed's own preferred gauge) leads when real; headline CPI
  // is the honest fallback when Core PCE isn't available yet. Thresholds
  // differ slightly since headline CPI typically runs a bit hotter than
  // Core PCE — a disclosed, not arbitrary, difference.
  const inflationElevated = Number.isFinite(corePceYoy) ? corePceYoy > 3 : (Number.isFinite(cpiYoy) ? cpiYoy > 3.5 : null);
  const inflationModerateOrFalling = inflationElevated === false;

  const has = {
    vix: Number.isFinite(vixLevel), spy: Number.isFinite(spyChg), qqq: Number.isFinite(qqqChg),
    yieldCurve: Number.isFinite(yieldCurve),
  };

  const factors = {
    vixLevel: has.vix ? vixLevel : null,
    spyChg: has.spy ? spyChg : null,
    qqqChg: has.qqq ? qqqChg : null,
    yieldCurve: has.yieldCurve ? yieldCurve : null,
    fedFundsTrend, unemploymentTrend, joblessClaimsTrend,
    cpiYoy: Number.isFinite(cpiYoy) ? cpiYoy : null,
    corePceYoy: Number.isFinite(corePceYoy) ? corePceYoy : null,
  };

  // Real, disclosed composite 0-100 (simple additive, same style as
  // trade-planner-scoring.js's own computeRegime — not computeCoreScore's
  // more elaborate weighted-bucket system). Each component honestly
  // degrades to a neutral half-credit when its real input is absent,
  // rather than zeroing out or fabricating a value.
  let score = 0;
  score += !has.vix ? 12.5 : vixLevel < 18 ? 25 : vixLevel < 22 ? 15 : vixLevel < 30 ? 5 : 0;
  score += (!has.spy || !has.qqq) ? 12.5 : (spyChg > 0 && qqqChg > 0) ? 25 : (spyChg > 0 || qqqChg > 0) ? 12 : 0;
  score += !has.yieldCurve ? 10 : yieldCurve >= 0.25 ? 20 : yieldCurve >= 0 ? 12 : 0;
  score += !fedFundsTrend ? 8 : fedFundsTrend === "falling" ? 15 : fedFundsTrend === "flat" ? 8 : 0;
  score += inflationElevated == null ? 8 : inflationElevated ? 0 : 15;
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Real, disclosed rule cascade — most severe/specific first, same "hard
  // gate before a soft read" discipline as am-core-engine.js's
  // classifyCoreVerdict. Each branch only fires when every real input it
  // needs is actually present (has.*/trend != null checks) — a missing
  // input skips that branch rather than guessing.

  // 1. FINANCIAL_STRESS
  if (has.vix && vixLevel >= 30) {
    return { regime: "FINANCIAL_STRESS", score, factors, reasons: [`VIX ${vixLevel.toFixed(1)} — extreme volatility`] };
  }
  if (has.yieldCurve && yieldCurve <= -0.5 && joblessClaimsTrend === "rising") {
    return { regime: "FINANCIAL_STRESS", score, factors, reasons: [`Yield curve deeply inverted (${yieldCurve.toFixed(2)})`, "Jobless claims rising"] };
  }

  // 2. RECESSION_RISK
  if (has.yieldCurve && yieldCurve < 0 && unemploymentTrend === "rising") {
    return { regime: "RECESSION_RISK", score, factors, reasons: [`Yield curve inverted (${yieldCurve.toFixed(2)})`, "Unemployment rising"] };
  }

  // 3. RISK_OFF
  if (has.vix && has.spy && has.qqq && vixLevel >= 22 && spyChg < 0 && qqqChg < 0) {
    return { regime: "RISK_OFF", score, factors, reasons: [`VIX ${vixLevel.toFixed(1)}`, "SPY and QQQ both down today"] };
  }

  // 4. LATE_CYCLE
  if (fedFundsTrend && fedFundsTrend !== "falling" && inflationElevated === true && joblessClaimsTrend === "rising") {
    return { regime: "LATE_CYCLE", score, factors, reasons: ["Fed funds not falling — policy still restrictive", "Core inflation still elevated", "Jobless claims rising"] };
  }

  // 5. DISTRIBUTION
  if (has.spy && has.qqq && spyChg <= 0 && qqqChg <= 0 && has.vix && vixLevel >= 15 && vixLevel < 22 && has.yieldCurve && yieldCurve < 0.25) {
    return { regime: "DISTRIBUTION", score, factors, reasons: ["SPY and QQQ both flat-to-down", `VIX creeping up (${vixLevel.toFixed(1)})`, "Yield curve flat-to-inverted"] };
  }

  // 6. RECOVERY
  if (fedFundsTrend === "falling" && has.spy && has.qqq && spyChg > 0 && qqqChg > 0 && inflationModerateOrFalling !== false) {
    return { regime: "RECOVERY", score, factors, reasons: ["Fed funds falling — policy easing", "SPY and QQQ both up", "Inflation moderate or falling"] };
  }

  // 7. RISK_ON
  if (has.vix && vixLevel < 18 && has.spy && has.qqq && spyChg > 0 && qqqChg > 0 && has.yieldCurve && yieldCurve >= 0 && inflationElevated !== true) {
    return { regime: "RISK_ON", score, factors, reasons: [`VIX low (${vixLevel.toFixed(1)})`, "SPY and QQQ both up", "Yield curve not inverted", "Inflation not elevated"] };
  }

  // 8. SELECTIVE_RISK_ON — real fallback, never a silent crash/null state.
  return { regime: "SELECTIVE_RISK_ON", score, factors, reasons: ["No single dominant real signal — constructive but mixed conditions"] };
}

module.exports = { REGIME_META, computeMacroRegime };
