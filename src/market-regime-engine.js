"use strict";

const { computeRegime } = require("./trade-planner-scoring");
const MARKET_REGIME_VERSION = "market-regime-v1";
const REGIMES = new Set(["RISK_ON", "SELECTIVE_RISK_ON", "NEUTRAL", "RISK_OFF", "CRISIS"]);

function computeMarketRegimeState({ macroQuotes = [], marketContext = null, dataHealth = null, timestamp = Date.now() } = {}) {
  const base = computeRegime(macroQuotes);
  const contextScore = Number.isFinite(marketContext?.macroScore) ? marketContext.macroScore : null;
  const vix = Number.isFinite(base.vixVal) && base.vixVal > 0 ? base.vixVal : null;
  let regime;
  if ((vix != null && vix >= 35) || (contextScore != null && contextScore <= -60)) regime = "CRISIS";
  else if (base.score < 40 || (contextScore != null && contextScore <= -25)) regime = "RISK_OFF";
  else if (base.score < 55 || (contextScore != null && contextScore < 0)) regime = "NEUTRAL";
  else if (base.score < 75 || (contextScore != null && contextScore < 25)) regime = "SELECTIVE_RISK_ON";
  else regime = "RISK_ON";
  const symbols = new Set((macroQuotes || []).map((q) => String(q?.symbol || "").toUpperCase()));
  const coverage = (["SPY", "QQQ"].filter((s) => symbols.has(s)).length + (["VIX", "^VIX", "VIXY"].some((s) => symbols.has(s)) ? 1 : 0) + (contextScore != null ? 1 : 0)) / 4;
  const healthMultiplier = Number.isFinite(dataHealth?.confidenceMultiplier) ? dataHealth.confidenceMultiplier : 1;
  const blockers = dataHealth && !dataHealth.canTrade ? [...dataHealth.blockers] : [];
  if (regime === "CRISIS") blockers.push("Crisis regime blocks new directional risk.");
  else if (regime === "RISK_OFF") blockers.push("Risk-off regime blocks new long exposure.");
  return {
    regime, score: base.score, confidence: Math.round(coverage * 100 * healthMultiplier), timestamp,
    reasons: base.factors.filter((f) => f.pass).map((f) => f.label), blockers, factors: base.factors,
    volatility: { level: vix, state: vix == null ? "UNKNOWN" : vix >= 35 ? "CRISIS" : vix >= 25 ? "ELEVATED" : "NORMAL" },
    contextScore, dataHealth: dataHealth || null,
    compatibility: { label: base.label, sixBand: base.sixBand, color: base.color }, engineVersion: MARKET_REGIME_VERSION,
  };
}

function isCanonicalRegime(value) { return REGIMES.has(value); }
module.exports = { MARKET_REGIME_VERSION, REGIMES, computeMarketRegimeState, isCanonicalRegime };
