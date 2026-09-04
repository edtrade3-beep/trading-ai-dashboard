// market-context-engine.js — Market Context Phase 1 (2026-08-27): a real,
// additive cross-asset layer on top of the already-real, already-working
// macro regime stack (macro-engine.js + treasury-credit-engine.js +
// liquidity-employment-engine.js + sector-rotation-engine.js, combined at
// GET /api/market/macro-regime). Nothing here modifies those engines —
// this file only ADDS the cross-asset reads (raw 2Y, DXY, oil, gold, BTC)
// those engines don't use, plus the divergence/composite-score/
// explanation layer the spec asks for. Same "never fabricate, honest
// degrade on missing data" discipline as every other engine in this app.
//
// Real, disclosed scope trim (see the plan): no MOVE index (no real free
// source exists anywhere in this app's provider set) — never fabricated.
"use strict";
const { PORT } = require("./config");

const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
async function getJson(p) {
  try { const r = await fetch(`${BASE()}${p}`); return await r.json(); } catch { return null; }
}

// Same real windowed-trend helper macro-engine.js uses internally (not
// exported there, so re-declared here rather than reaching into its
// private scope) — real trend off fred.js's windowChangePct, a disclosed
// per-series noise floor below which a move doesn't count as a genuine
// trend.
function trendOf(windowChangePct, flatBand) {
  if (!Number.isFinite(windowChangePct)) return null;
  if (windowChangePct > flatBand) return "rising";
  if (windowChangePct < -flatBand) return "falling";
  return "flat";
}

// ─── 1. Core Fed Signal (spec §4) ───────────────────────────────────────
// Real 2Y trend + real Fed-funds trend — the strongest real Fed-policy
// combination available from this app's existing real data (never
// derived from headlines). DXY trend is a real confirming factor, not a
// requirement (honestly optional — degrades gracefully when DXY data is
// unavailable).
function computeCoreFedSignal({ twoYearTrend, fedFundsTrend, dxyChg }) {
  const reasons = [];
  if (twoYearTrend == null && fedFundsTrend == null) {
    return { signal: "UNKNOWN", reasons: ["No real 2Y or Fed-funds trend data available"] };
  }
  const dxyRising = Number.isFinite(dxyChg) && dxyChg > 0.1;
  const dxyFalling = Number.isFinite(dxyChg) && dxyChg < -0.1;

  if (twoYearTrend === "rising" && fedFundsTrend !== "falling") {
    reasons.push("Real 2Y yield rising");
    if (fedFundsTrend === "rising") reasons.push("Real Fed funds trend also rising");
    if (dxyRising) reasons.push("DXY confirming (rising)");
    return { signal: "HAWKISH_REPRICING", reasons };
  }
  if (twoYearTrend === "falling" && fedFundsTrend !== "rising") {
    reasons.push("Real 2Y yield falling");
    if (fedFundsTrend === "falling") reasons.push("Real Fed funds trend also falling");
    if (dxyFalling) reasons.push("DXY confirming (falling)");
    return { signal: "DOVISH_REPRICING", reasons };
  }
  return { signal: "MIXED", reasons: ["Real 2Y and Fed-funds trends disagree or are flat"] };
}

// ─── 2. 10Y Confirmation (spec §5) ──────────────────────────────────────
// Compares real 2Y vs real 10Y trend direction, and honestly attributes
// the 10Y move to whichever real concurrent signal moved most (real
// yield trend -> growth/real-rate driven, inflation YoY -> inflation
// driven, oil trend -> commodity-driven) — a disclosed partial
// attribution (term premium/fiscal-risk data isn't available in this
// app), never a definitive causal claim.
function compute10yConfirmation({ twoYearTrend, tenYearTrend, realYield10yTrend, inflationYoy, oilChg }) {
  let confirmation = "UNKNOWN";
  if (twoYearTrend === "rising" && tenYearTrend === "rising") confirmation = "STRONG_HAWKISH";
  else if (twoYearTrend === "falling" && tenYearTrend === "falling") confirmation = "STRONG_DOVISH";
  else if (twoYearTrend && tenYearTrend) confirmation = "MIXED";

  const candidates = [];
  if (Number.isFinite(realYield10yTrend) && Math.abs(realYield10yTrend) > 1) candidates.push({ driver: "real yields / growth", mag: Math.abs(realYield10yTrend) });
  if (Number.isFinite(inflationYoy) && inflationYoy > 3) candidates.push({ driver: "inflation", mag: inflationYoy });
  if (Number.isFinite(oilChg) && Math.abs(oilChg) > 1.5) candidates.push({ driver: "oil", mag: Math.abs(oilChg) });
  candidates.sort((a, b) => b.mag - a.mag);

  return {
    confirmation,
    likelyDriver: candidates[0]?.driver || null,
    reasons: candidates.length
      ? [`10Y move most consistent with: ${candidates[0].driver}`]
      : ["No single real driver stands out — insufficient real signal to attribute the 10Y move"],
  };
}

// ─── 3/4. Oil/Gold cross-asset rules + QQQ/SPY relative strength (§6-7) ─
// Real, disclosed threshold rules matching the spec's own named patterns.
// A move can match zero, one, or more patterns — never forced into one.
function evaluateCrossAssetPatterns({ oilChg, goldChg, dxyChg, vixLevel, vixChg, spyChg, qqqChg, tenYearTrend }) {
  const patterns = [];
  const up = (v, t = 0.3) => Number.isFinite(v) && v > t;
  const down = (v, t = -0.3) => Number.isFinite(v) && v < t;
  const vixUp = Number.isFinite(vixChg) && vixChg > 3;

  if (up(oilChg) && tenYearTrend === "rising") patterns.push({ id: "INFLATIONARY_PRESSURE", reason: "Oil rising alongside rising yields" });
  if (up(oilChg) && down(spyChg) && vixUp) patterns.push({ id: "INFLATIONARY_RISK_OFF", reason: "Oil rising while SPY falls and VIX rises" });
  if (down(oilChg) && tenYearTrend === "falling" && up(spyChg)) patterns.push({ id: "DISINFLATIONARY_RISK_ON", reason: "Oil falling with yields, SPY rising" });
  if (up(goldChg) && tenYearTrend === "falling" && down(dxyChg)) patterns.push({ id: "LIQUIDITY_DOVISH", reason: "Gold rising as yields and DXY fall" });
  if (up(goldChg) && up(dxyChg) && vixUp && down(spyChg)) patterns.push({ id: "SAFE_HAVEN_STRESS", reason: "Gold and DXY both rising with VIX up, SPY down" });

  let qqqSpyRelative = "MIXED";
  if (Number.isFinite(qqqChg) && Number.isFinite(spyChg)) {
    if (qqqChg > 0 && spyChg > 0) qqqSpyRelative = qqqChg > spyChg ? "GROWTH_LEADERSHIP" : "BROAD_RISK_ON";
    else if (qqqChg < 0 && spyChg < 0) qqqSpyRelative = qqqChg < spyChg ? "GROWTH_LAGGING" : "BROAD_RISK_OFF";
    else if (spyChg > qqqChg) qqqSpyRelative = "DEFENSIVE_ROTATION";
    else qqqSpyRelative = "GROWTH_LEADERSHIP";
  }

  return { patterns, qqqSpyRelative };
}

// ─── 5. Macro/Equity Divergence Engine (spec §8) ────────────────────────
// The one genuinely new classifier — detects the two specific real
// contradiction patterns the spec names, off the Core Fed Signal already
// computed above (never re-derives its own regime).
function detectDivergence({ fedSignal, spyChg, qqqChg }) {
  const bothUp = Number.isFinite(spyChg) && Number.isFinite(qqqChg) && spyChg > 0 && qqqChg > 0;
  const bothDown = Number.isFinite(spyChg) && Number.isFinite(qqqChg) && spyChg < 0 && qqqChg < 0;

  if (fedSignal === "HAWKISH_REPRICING" && bothUp) {
    return { divergence: "MACRO_EQUITY_DIVERGENCE", reason: "Equities rising despite real tightening financial conditions — do not chase automatically." };
  }
  if (fedSignal === "DOVISH_REPRICING" && bothDown) {
    return { divergence: "EQUITY_WEAKNESS_DESPITE_DOVISH", reason: "Equities falling despite real dovish rates — investigate earnings/sector/company-specific risk." };
  }
  return { divergence: "ALIGNED", reason: "Equity direction is consistent with the real Fed/rates signal." };
}

// ─── 6. Composite Macro Score (spec §9) ─────────────────────────────────
// -100..+100, POSITIVE = supportive of risk-on, NEGATIVE = supportive of
// risk-off — one consistent internal polarity across all 7 sub-factors
// (a deliberate normalization choice, disclosed here: the spec's own
// prose example mixes "pressure" framing with signed framing; this
// implementation keeps one direction throughout so the weighted sum is
// never sign-ambiguous, then labels each sub-factor with a real
// HAWKISH/DOVISH-style word for readability). Each sub-factor honestly
// degrades toward 0 (neutral) when its real inputs are missing, and
// `confidence` reports what fraction of real inputs actually resolved.
// treasury/credit added (2026-09-04, direct user spec — Market Regime
// Engine section: "Treasury yields and yield-curve movement... credit
// conditions"). Both scores were already real and computed by
// treasury-credit-engine.js off real FRED series (/api/market/macro-regime
// already fetches and returns them as macroRegime.treasury/.credit) — they
// just never reached this composite's weighted blend before now, only a
// couple of their factor fields were read for display/trend purposes.
const SCORE_WEIGHTS = { fed: 0.20, inflation: 0.15, growth: 0.15, liquidity: 0.15, riskAppetite: 0.15, volatility: 0.10, equityAlignment: 0.10, treasury: 0.15, credit: 0.15 };

function computeCompositeMacroScore({ fedSignal, inflationYoy, employmentScore, liquidityScore, breadthScore, vixLevel, divergence, treasuryScore, creditScore }) {
  const parts = {};
  let resolvedCount = 0, totalCount = 9;

  parts.fed = fedSignal === "HAWKISH_REPRICING" ? -70 : fedSignal === "DOVISH_REPRICING" ? 70 : fedSignal === "MIXED" ? 0 : null;
  if (parts.fed != null) resolvedCount++;

  parts.inflation = Number.isFinite(inflationYoy) ? Math.round(Math.max(-100, Math.min(100, (3 - inflationYoy) * 25))) : null; // 3% = neutral anchor (Fed's own target-adjacent band)
  if (parts.inflation != null) resolvedCount++;

  parts.growth = Number.isFinite(employmentScore) ? (employmentScore - 50) * 2 : null;
  if (parts.growth != null) resolvedCount++;

  parts.liquidity = Number.isFinite(liquidityScore) ? (liquidityScore - 50) * 2 : null;
  if (parts.liquidity != null) resolvedCount++;

  parts.riskAppetite = Number.isFinite(breadthScore) ? (breadthScore - 50) * 2 : null;
  if (parts.riskAppetite != null) resolvedCount++;

  parts.volatility = Number.isFinite(vixLevel) ? Math.round(Math.max(-100, Math.min(100, (20 - vixLevel) * 6))) : null; // VIX 20 = neutral anchor
  if (parts.volatility != null) resolvedCount++;

  parts.equityAlignment = divergence === "ALIGNED" ? 20 : divergence ? -50 : null;
  if (parts.equityAlignment != null) resolvedCount++;

  // Real treasury-credit-engine.js scores (0-100, already disclosed
  // first-pass point-additive reads off real FRED yield-curve/spread
  // series) — same -50..+50-ish rescale every other 0-100 sub-score here
  // already uses (50 = neutral anchor).
  parts.treasury = Number.isFinite(treasuryScore) ? (treasuryScore - 50) * 2 : null;
  if (parts.treasury != null) resolvedCount++;

  parts.credit = Number.isFinite(creditScore) ? (creditScore - 50) * 2 : null;
  if (parts.credit != null) resolvedCount++;

  let score = 0, weightSum = 0;
  for (const [key, weight] of Object.entries(SCORE_WEIGHTS)) {
    if (parts[key] != null) { score += parts[key] * weight; weightSum += weight; }
  }
  const finalScore = weightSum > 0 ? Math.round(score / weightSum) : 0;
  const confidence = Math.round((resolvedCount / totalCount) * 100);

  return {
    score: finalScore,
    confidence,
    fedPressure: parts.fed != null ? { value: parts.fed, label: parts.fed < -20 ? "HAWKISH" : parts.fed > 20 ? "DOVISH" : "NEUTRAL" } : null,
    inflationPressure: parts.inflation != null ? { value: parts.inflation, label: parts.inflation < -20 ? "ELEVATED" : parts.inflation > 20 ? "CONTAINED" : "MODERATE" } : null,
    growthPressure: parts.growth != null ? { value: parts.growth, label: parts.growth < -20 ? "WEAK" : parts.growth > 20 ? "STRONG" : "MODERATE" } : null,
    liquidity: parts.liquidity != null ? { value: parts.liquidity, label: parts.liquidity < -20 ? "TIGHTENING" : parts.liquidity > 20 ? "EASING" : "NEUTRAL" } : null,
    riskAppetite: parts.riskAppetite != null ? { value: parts.riskAppetite, label: parts.riskAppetite < -20 ? "RISK-AVERSE" : parts.riskAppetite > 20 ? "RISK-SEEKING" : "NEUTRAL" } : null,
    volatility: parts.volatility != null ? { value: parts.volatility, label: parts.volatility < -20 ? "ELEVATED" : parts.volatility > 20 ? "CONTAINED" : "NORMAL" } : null,
    equityAlignment: parts.equityAlignment != null ? { value: parts.equityAlignment, label: divergence } : null,
    treasuryPressure: parts.treasury != null ? { value: parts.treasury, label: parts.treasury < -20 ? "TIGHTENING" : parts.treasury > 20 ? "ACCOMMODATIVE" : "NEUTRAL" } : null,
    creditPressure: parts.credit != null ? { value: parts.credit, label: parts.credit < -20 ? "STRESSED" : parts.credit > 20 ? "HEALTHY" : "NEUTRAL" } : null,
  };
}

// ─── 7. Trading Environment (spec §2 TRADING ENVIRONMENT) ──────────────
function classifyTradingEnvironment({ macroScore, vixLevel, divergence }) {
  if (divergence && divergence !== "ALIGNED") return "DO_NOT_CHASE";
  if (Number.isFinite(vixLevel) && vixLevel >= 28) return "HIGH_VOLATILITY";
  if (macroScore >= 25) return "LONG_FAVORABLE";
  if (macroScore <= -25) return "SHORT_FAVORABLE";
  if (Math.abs(macroScore) < 10) return "RANGE";
  return "WAIT";
}

// ─── 8. Explanation generator (spec §26) ────────────────────────────────
// Deterministic sentence-builder, no LLM required — cites the real
// factors that actually drove the classification.
function getMarketContextExplanation(context) {
  const { fedSignal, tenYearConfirmation, patterns, qqqSpyRelative, divergence, macroScore } = context;
  const bits = [];
  if (qqqSpyRelative === "GROWTH_LEADERSHIP") bits.push("QQQ is leading SPY");
  else if (qqqSpyRelative === "DEFENSIVE_ROTATION") bits.push("SPY is leading QQQ — defensive rotation");
  else if (qqqSpyRelative === "BROAD_RISK_ON") bits.push("SPY and QQQ are both up together");
  else if (qqqSpyRelative === "BROAD_RISK_OFF") bits.push("SPY and QQQ are both down together");

  if (fedSignal?.signal === "HAWKISH_REPRICING") bits.push("real 2Y/Fed-funds trends are repricing hawkish");
  else if (fedSignal?.signal === "DOVISH_REPRICING") bits.push("real 2Y/Fed-funds trends are repricing dovish");

  if (tenYearConfirmation?.likelyDriver) bits.push(`10Y move most consistent with ${tenYearConfirmation.likelyDriver}`);
  if (patterns?.length) bits.push(patterns.map((p) => p.reason).join("; "));

  const whatConfirms = divergence === "ALIGNED" ? "Equity direction confirms the real rates/Fed signal." : null;
  const whatContradicts = divergence && divergence !== "ALIGNED" ? context.divergenceReason : null;

  return {
    summary: bits.length ? bits.join(", ") + "." : "Insufficient real cross-asset data to explain the current move.",
    whatConfirms, whatContradicts,
    whatMattersNext: macroScore <= -25 ? "Watch for a real Fed-funds trend reversal or a real VIX spike easing before adding long risk."
      : macroScore >= 25 ? "Watch for the real 2Y trend or credit spreads turning against this read."
      : "No dominant real signal yet — wait for the next real data point to break the tie.",
  };
}

// ─── 9. A+ Score / Heat Risk modifier (spec §10-11) ─────────────────────
// Pure, additive — never mutates am-core-engine.js/cortex-decision.js.
function applyMarketContextToVerdict({ verdict, score }, context) {
  if (!context || context.macroScore == null) return { label: null, confidenceAdjustment: 0, explanation: "Market Context unavailable — technical read shown alone." };
  const bullishVerdict = verdict === "EARLY_BUY" || verdict === "STRONG_BUY" || verdict === "BUY";
  const macroSupportive = context.macroScore >= 15;
  const macroHostile = context.macroScore <= -15;

  if (bullishVerdict && macroHostile) {
    return { label: "A+ TECHNICAL SETUP — MACRO HEADWIND", confidenceAdjustment: -15, explanation: `Real technical setup, but Market Context reads ${context.macroScore} (macro-unsupportive) — reduce long confidence.` };
  }
  if (bullishVerdict && macroSupportive) {
    return { label: "A+ SETUP + MACRO CONFIRMATION", confidenceAdjustment: +10, explanation: `Real technical setup confirmed by a supportive Market Context (${context.macroScore}).` };
  }
  if (score >= 70 && !bullishVerdict && macroHostile) {
    return { label: "TECHNICAL STRENGTH — MACRO CONFIRMS CAUTION", confidenceAdjustment: 0, explanation: "Real technical strength, but macro backdrop already hostile." };
  }
  return { label: null, confidenceAdjustment: 0, explanation: null };
}

// ─── Orchestrator ────────────────────────────────────────────────────────
async function computeMarketContext() {
  const { fetchQuoteBatchWithFallback } = require("./providers/yahoo");
  const { fetchUS2Y } = require("./fred");

  const [macroRegime, us2y, crossAssetQuotes] = await Promise.all([
    getJson("/api/market/macro-regime"),
    fetchUS2Y().catch(() => null),
    fetchQuoteBatchWithFallback(["UUP", "USO", "GLD", "BTC-USD"]).catch(() => []),
  ]);

  if (!macroRegime || macroRegime.ok === false) {
    return { available: false, reason: "real base macro regime unavailable (GET /api/market/macro-regime failed)" };
  }

  const quoteBySym = new Map(crossAssetQuotes.map((q) => [String(q.symbol || "").toUpperCase(), q]));
  const dxyChg = Number(quoteBySym.get("UUP")?.regularMarketChangePercent);
  const oilChg = Number(quoteBySym.get("USO")?.regularMarketChangePercent);
  const goldChg = Number(quoteBySym.get("GLD")?.regularMarketChangePercent);
  const btcChg = Number(quoteBySym.get("BTC-USD")?.regularMarketChangePercent);

  const twoYearTrend = trendOf(us2y?.windowChangePct, 0.5);
  const tenYearTrend = trendOf(macroRegime.treasury?.factors?.us10yWindowChangePct, 0.5);
  const vixLevel = macroRegime.factors?.vixLevel ?? null;
  const spyChg = macroRegime.factors?.spyChg ?? null;
  const qqqChg = macroRegime.factors?.qqqChg ?? null;
  const inflationYoy = macroRegime.factors?.corePceYoy ?? macroRegime.factors?.cpiYoy ?? null;

  const fedSignal = computeCoreFedSignal({ twoYearTrend, fedFundsTrend: macroRegime.factors?.fedFundsTrend ?? null, dxyChg });
  const tenYearConfirmation = compute10yConfirmation({
    twoYearTrend, tenYearTrend,
    realYield10yTrend: macroRegime.treasury?.factors?.us10yWindowChangePct ?? null,
    inflationYoy, oilChg,
  });
  const { patterns, qqqSpyRelative } = evaluateCrossAssetPatterns({ oilChg, goldChg, dxyChg, vixLevel, vixChg: null, spyChg, qqqChg, tenYearTrend });
  const { divergence, reason: divergenceReason } = detectDivergence({ fedSignal: fedSignal.signal, spyChg, qqqChg });
  const macroScoreResult = computeCompositeMacroScore({
    fedSignal: fedSignal.signal, inflationYoy,
    employmentScore: macroRegime.employment?.score ?? null,
    liquidityScore: macroRegime.liquidity?.score ?? null,
    breadthScore: macroRegime.breadth?.score ?? null,
    vixLevel, divergence,
    treasuryScore: macroRegime.treasury?.score ?? null,
    creditScore: macroRegime.credit?.score ?? null,
  });
  const tradingEnvironment = classifyTradingEnvironment({ macroScore: macroScoreResult.score, vixLevel, divergence });

  const context = {
    available: true,
    asOf: new Date().toISOString(),
    regime: { regime: macroRegime.regime, label: macroRegime.label, icon: macroRegime.icon, color: macroRegime.color, score: macroRegime.score },
    fedSignal, tenYearConfirmation, patterns, qqqSpyRelative, divergence, divergenceReason,
    macroScore: macroScoreResult.score, confidence: macroScoreResult.confidence,
    fedPressure: macroScoreResult.fedPressure, inflationPressure: macroScoreResult.inflationPressure,
    growthPressure: macroScoreResult.growthPressure, liquidity: macroScoreResult.liquidity,
    riskAppetite: macroScoreResult.riskAppetite, volatility: macroScoreResult.volatility, equityAlignment: macroScoreResult.equityAlignment,
    treasuryPressure: macroScoreResult.treasuryPressure, creditPressure: macroScoreResult.creditPressure,
    tradingEnvironment,
    instruments: {
      twoYear: us2y ? { value: us2y.value, trend: twoYearTrend } : null,
      tenYear: { trend: tenYearTrend, realYield: macroRegime.treasury?.factors?.realYield10y ?? null },
      dxy: Number.isFinite(dxyChg) ? { chgPct: dxyChg } : null,
      vix: Number.isFinite(vixLevel) ? { level: vixLevel } : null,
      oil: Number.isFinite(oilChg) ? { chgPct: oilChg } : null,
      gold: Number.isFinite(goldChg) ? { chgPct: goldChg } : null,
      btc: Number.isFinite(btcChg) ? { chgPct: btcChg } : null,
      spy: Number.isFinite(spyChg) ? { chgPct: spyChg } : null,
      qqq: Number.isFinite(qqqChg) ? { chgPct: qqqChg } : null,
    },
    sectorRotation: macroRegime.sectorRotation ?? null,
  };
  context.explanation = getMarketContextExplanation(context);
  return context;
}

module.exports = {
  computeMarketContext,
  computeCoreFedSignal, compute10yConfirmation, evaluateCrossAssetPatterns,
  detectDivergence, computeCompositeMacroScore, classifyTradingEnvironment,
  getMarketContextExplanation, applyMarketContextToVerdict,
};
