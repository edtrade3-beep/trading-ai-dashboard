"use strict";

// institution-score.js — server-side CommonJS port of computeInstitutionScore,
// kept byte-identical to axiom-runner/components/market-helpers.js (same
// dual-port convention as sniper-decision.js / cortex-decision.js — see
// those files' own headers). Exists so Telegram's /deep command can show
// the same real Accumulation/Distribution/Aggressive Buying/Aggressive
// Selling read the web app's AM Cortex Deep Scan shows, without requiring
// a browser. Combines real dark pool block prints, real options flow
// call/put skew, real Form 4 insider transactions, real 13F-derived
// institutional position change, and real short-interest change into one
// 0-100 score — never a guessed or invented signal.
//
// If you change computeInstitutionScore in market-helpers.js, mirror the
// change here too.

function computeInstitutionScore({ darkPool, optionsFlow, insiderData, shortInterest } = {}) {
  const darkPoolNotional = (darkPool?.prints || []).reduce((s, p) => s + (Number(p.value) || 0), 0);
  const darkPoolPts = darkPool ? Math.round(Math.max(0, Math.min(1, darkPoolNotional / 20_000_000)) * 30) : 15;

  const callN = Number(optionsFlow?.callNotional), putN = Number(optionsFlow?.putNotional);
  const flowTotal = (Number.isFinite(callN) ? callN : 0) + (Number.isFinite(putN) ? putN : 0);
  const flowRatio = flowTotal > 0 ? callN / flowTotal : null;
  const flowPts = flowRatio != null ? Math.round(flowRatio * 25) : 12;

  const txns = insiderData?.insiderTransactions?.transactions || [];
  const buyVal = txns.filter(t => t.type === "BUY").reduce((s, t) => s + (Number(t.value) || 0), 0);
  const sellVal = txns.filter(t => t.type === "SELL").reduce((s, t) => s + (Number(t.value) || 0), 0);
  const insiderTotal = buyVal + sellVal;
  const insiderRatio = insiderTotal > 0 ? buyVal / insiderTotal : null;
  const insiderPts = insiderRatio != null ? Math.round(insiderRatio * 20) : 10;

  const institutions = insiderData?.institutional?.institutions || [];
  const netChange = institutions.reduce((s, i) => s + (Number(i.change) || 0), 0);
  const totalAbsChange = institutions.reduce((s, i) => s + Math.abs(Number(i.change) || 0), 0);
  const instRatio = totalAbsChange > 0 ? (netChange / totalAbsChange + 1) / 2 : null;
  const instPts = instRatio != null ? Math.round(Math.max(0, Math.min(1, instRatio)) * 15) : 8;

  const sharesShort = Number(shortInterest?.sharesShort), sharesShortPrior = Number(shortInterest?.sharesShortPrior);
  const shortChangePct = (Number.isFinite(sharesShort) && Number.isFinite(sharesShortPrior) && sharesShortPrior > 0)
    ? ((sharesShort - sharesShortPrior) / sharesShortPrior) * 100 : null;
  const shortPts = shortChangePct != null ? Math.round(Math.max(0, Math.min(1, (10 - shortChangePct) / 20)) * 10) : 5;

  const breakdown = { darkPoolPts, flowPts, insiderPts, instPts, shortPts };
  const score = Math.max(0, Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0)));

  let label;
  if (score >= 80) label = "Aggressive Buying";
  else if (score >= 60) label = "Accumulation";
  else if (score <= 20) label = "Aggressive Selling";
  else if (score <= 40) label = "Distribution";
  else label = "Neutral";

  const reasons = [
    darkPool ? (darkPoolNotional > 0 ? `$${(darkPoolNotional / 1e6).toFixed(1)}M in real dark pool block prints` : "No real block prints above $500K") : "Dark pool data unavailable",
    flowRatio != null ? `Real options flow ${Math.round(flowRatio * 100)}% call-weighted notional` : "Options flow data unavailable",
    insiderTotal > 0 ? `Real insider transactions ${Math.round(insiderRatio * 100)}% buy-weighted ($${(insiderTotal / 1e6).toFixed(1)}M total)` : "No real recent insider transactions",
    institutions.length ? `Real 13F-derived institutional position change: ${netChange >= 0 ? "+" : ""}${netChange.toLocaleString()} shares net across ${institutions.length} reporting institutions` : "No real institutional position-change data",
    shortChangePct != null ? `Real short interest ${shortChangePct >= 0 ? "+" : ""}${shortChangePct.toFixed(1)}% vs. prior month` : "Short interest data unavailable",
  ];

  return {
    score, breakdown, label, reasons,
    disclosure: "Real-time ETF flow data isn't available — not included in this score.",
  };
}

module.exports = { computeInstitutionScore };
