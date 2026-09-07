"use strict";

// narrative-engine.js — Narrative Shift Detector (platform-unification
// prompt, 2026-09-07, §17: flag when the DOMINANT MACRO STORY changes —
// "soft landing" -> "reacceleration" — not just a numeric score move).
// Deliberately distinct from what-changed-engine.js: that engine diffs
// numeric snapshots (regime score, VIX, candidate verdicts) tick to tick;
// this classifies a qualitative, journalistic-style narrative label from
// the SAME already-computed real inputs macro-engine.js's computeMacroRegime
// produces (its own `factors` breakdown), and only fires a "shift" when the
// LABEL itself changes — a narrative can hold for weeks while the
// underlying regime score wobbles day to day, so this is intentionally a
// coarser, stickier read than the regime engine's own 8-state output.
//
// Pure classification only — no I/O, no fetches, no AI call (same
// "deterministic rules over already-real inputs" discipline as macro-
// engine.js itself, which this is directly layered on top of). Persistence
// and shift-detection live in narrative-store.js, mirroring the
// what-changed-engine.js / what-changed-store.js split.

const NARRATIVE_META = {
  STAGFLATION_RISK:     { label: "Stagflation Risk", icon: "🟥", color: "#c8282a" },
  CREDIT_STRESS:        { label: "Credit Stress", icon: "🟥", color: "#c8282a" },
  HARD_LANDING:         { label: "Hard Landing / Recession Risk", icon: "🔴", color: "#c8282a" },
  RISK_OFF_DELEVERAGING:{ label: "Risk-Off Deleveraging", icon: "🟠", color: "#e08a1e" },
  LATE_CYCLE_CAUTION:   { label: "Late-Cycle Caution", icon: "🟠", color: "#e08a1e" },
  REACCELERATION:       { label: "Reacceleration", icon: "🟡", color: "#d6a312" },
  MIXED_SIGNALS:        { label: "Mixed Signals", icon: "🟡", color: "#d6a312" },
  SOFT_LANDING:         { label: "Soft Landing", icon: "🟢", color: "#0d9465" },
  RISK_ON_EXPANSION:    { label: "Risk-On Expansion", icon: "🟢", color: "#0d9465" },
};

// input: { macroRegime: computeMacroRegime()'s own `regime` string,
// factors: its own `factors` object, creditStressed: real optional
// boolean from treasury-credit-engine.js's creditMomentum (null when the
// caller doesn't have a real credit read — that override is simply
// skipped, never guessed). Priority order below is deliberate — most
// specific/severe real cross-cutting condition checked first (same "hard
// gate before a soft read" discipline as macro-engine.js's own cascade).
function classifyNarrative({ macroRegime, factors = {}, creditStressed = null } = {}) {
  const { fedFundsTrend, unemploymentTrend, cpiYoy, corePceYoy } = factors;
  const inflationElevated = Number.isFinite(corePceYoy) ? corePceYoy > 3 : (Number.isFinite(cpiYoy) ? cpiYoy > 3.5 : null);
  const inflationLabel = Number.isFinite(corePceYoy) ? `Core PCE YoY ${corePceYoy.toFixed(1)}%` : Number.isFinite(cpiYoy) ? `CPI YoY ${cpiYoy.toFixed(1)}%` : null;

  // 1. STAGFLATION_RISK — a real cross-cutting condition regime buckets
  // alone don't capture: inflation AND employment both deteriorating at
  // once, regardless of which of the 8 base regimes that lands in.
  if (inflationElevated === true && unemploymentTrend === "rising") {
    const evidence = [inflationLabel, "Unemployment trend rising"].filter(Boolean);
    return { narrative: "STAGFLATION_RISK", evidence };
  }

  // 2. CREDIT_STRESS — only fires when the caller supplied a real credit
  // read AND the base regime already independently corroborates stress
  // (never credit alone, to avoid over-firing off one noisy spread tick).
  if (creditStressed === true && (macroRegime === "FINANCIAL_STRESS" || macroRegime === "RECESSION_RISK")) {
    return { narrative: "CREDIT_STRESS", evidence: ["Credit spreads real-widening", `Regime: ${macroRegime}`] };
  }

  // 3. HARD_LANDING
  if (macroRegime === "FINANCIAL_STRESS" || macroRegime === "RECESSION_RISK") {
    return { narrative: "HARD_LANDING", evidence: [`Regime: ${macroRegime}`, unemploymentTrend === "rising" ? "Unemployment rising" : null].filter(Boolean) };
  }

  // 4. RISK_OFF_DELEVERAGING
  if (macroRegime === "RISK_OFF") {
    return { narrative: "RISK_OFF_DELEVERAGING", evidence: ["Regime: Risk Off — VIX elevated, SPY/QQQ both down today"] };
  }

  // 5. LATE_CYCLE_CAUTION
  if (macroRegime === "LATE_CYCLE") {
    return { narrative: "LATE_CYCLE_CAUTION", evidence: ["Fed funds not falling — policy still restrictive", inflationLabel].filter(Boolean) };
  }

  // 6. REACCELERATION — the real "no landing" story: growth still
  // resilient (a risk-on-flavored regime) even as inflation is elevated
  // again, never auto-labeled bullish just because the regime looks risk-on.
  if ((macroRegime === "RISK_ON" || macroRegime === "SELECTIVE_RISK_ON") && inflationElevated === true) {
    return { narrative: "REACCELERATION", evidence: ["Growth conditions resilient", inflationLabel].filter(Boolean) };
  }

  // 7. SOFT_LANDING
  if (macroRegime === "RECOVERY" || ((macroRegime === "RISK_ON" || macroRegime === "SELECTIVE_RISK_ON") && fedFundsTrend !== "rising" && inflationElevated === false)) {
    return { narrative: "SOFT_LANDING", evidence: [fedFundsTrend === "falling" ? "Fed funds falling — policy easing" : "Fed funds steady", inflationLabel || "Inflation moderate/falling"].filter(Boolean) };
  }

  // 8. RISK_ON_EXPANSION — plain risk-on growth story when inflation's
  // real direction isn't clearly established one way or the other.
  if (macroRegime === "RISK_ON") {
    return { narrative: "RISK_ON_EXPANSION", evidence: ["Regime: Risk On — broad tape strength, VIX low"] };
  }

  // 9. MIXED_SIGNALS — honest fallback, never a forced label.
  return { narrative: "MIXED_SIGNALS", evidence: ["No single dominant real narrative signal"] };
}

module.exports = { classifyNarrative, NARRATIVE_META };
