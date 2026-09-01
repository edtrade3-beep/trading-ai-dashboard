"use strict";

// market-helpers-decision.js — server-side CommonJS port of the
// market-helpers.js pure functions AM Cortex needs, kept byte-identical to
// axiom-runner/components/market-helpers.js (same dual-port convention as
// sniper-decision.js / cortex-decision.js — see those files' own headers).
// Exists so Telegram's /cortex command can show the same real Cortex
// decision the web app shows, without a browser.
//
// computeRegime/computeAPlusScore are NOT duplicated here — a real
// duplicate was accidentally introduced when this file was first created
// (2026-08-13) despite src/trade-planner-scoring.js already being the
// established server-side port of those two (used by 7+ files: Telegram
// /plan, aplus-score-history.js, watchlist alert jobs, x-intel-engine).
// Found and fixed 2026-08-14 during the VCP engine integration — this file
// now delegates to that single real source instead of maintaining a
// second copy that could silently drift out of sync.
//
// If you change computeInstitutionalGrade/computeFundamentalsRead/
// classifyEntryType in market-helpers.js, mirror the change here too.

const { computeRegime, computeAPlusScore } = require("./trade-planner-scoring");
const { computeAntiChase } = require("./atr-risk-engine");

function computeInstitutionalGrade(row, technicals, regime, sectorInfo, optionsFlow, criticalFlags) {
  const passCount = Number(row?.passCount);
  const trendPts = Number.isFinite(passCount) ? Math.round((passCount / 8) * 20) : 10;

  const adx = technicals?.adx;
  let technicalPts = 7;
  if (adx) {
    if (adx.strength === "Strong") technicalPts = adx.direction === "Bullish" ? 15 : adx.direction === "Bearish" ? 2 : 8;
    else if (adx.strength === "Developing") technicalPts = adx.direction === "Bullish" ? 11 : adx.direction === "Bearish" ? 5 : 8;
    else technicalPts = 8;
  }

  const smc = row?.smc;
  let smartMoneyPts = 8;
  if (smc?.bos?.type === "BULL_BOS") smartMoneyPts = 15;
  else if (smc?.bos?.type === "BEAR_BOS") smartMoneyPts = 3;
  else if (smc?.choch?.type === "CHOCH_BULL") smartMoneyPts = 12;
  else if (smc?.choch?.type === "CHOCH_BEAR") smartMoneyPts = 5;
  else if (smc?.nearestOB?.type === "BULL_OB") smartMoneyPts = 10;
  else if (smc?.nearestOB?.type === "BEAR_OB") smartMoneyPts = 6;

  const callN = Number(optionsFlow?.callNotional), putN = Number(optionsFlow?.putNotional);
  const flowTotal = (Number.isFinite(callN) ? callN : 0) + (Number.isFinite(putN) ? putN : 0);
  const flowRatio = flowTotal > 0 ? callN / flowTotal : null;
  const optionsFlowPts = flowRatio != null ? Math.max(1, Math.min(15, Math.round(flowRatio * 14) + 1)) : 8;

  const epsGrowth = Number(row?.epsGrowth);
  const fundamentalPts = Number.isFinite(epsGrowth) ? Math.round(Math.max(0, Math.min(1, (epsGrowth + 10) / 30)) * 15) : 7;

  const macroPts = Math.round((Number(regime?.score) || 0) / 100 * 10);

  const sectorPts = sectorInfo?.rank ? Math.round(((11 - sectorInfo.rank + 1) / 11) * 10) : 5;

  const rawScore = Math.max(0, Math.min(100, trendPts + technicalPts + smartMoneyPts + optionsFlowPts + fundamentalPts + macroPts + sectorPts));

  // Real Stage-4/anti-chase/critical-red-flag hard gate — this file had
  // drifted out of sync with its own "kept byte-identical" mandate (see
  // header): market-helpers.js/institutional-scoring.js got this gate
  // 2026-08-26 (the real "★★★★★ Strong Buy under a 🔴 AVOID banner"
  // incident) but this Telegram-facing copy never did, so `/cortex` could
  // still show an uncapped institutional score for a Stage-4/extended/
  // critically-red-flagged symbol after that fix shipped everywhere else.
  // Brought current here (/goal Phase 5 audit, 2026-09-01), plus the new
  // critical-flag gate added to the other two copies in the same pass.
  const stage4 = /Stage\s*4/i.test(String(row?.stage || ""));
  const abovePivotPct = Number(row?.abovePivotPct);
  const antiChase = Number.isFinite(abovePivotPct) ? computeAntiChase(abovePivotPct) : null;
  const chaseBlocked = antiChase?.band === "EXTENDED" || antiChase?.band === "DO_NOT_CHASE";
  const criticalGated = Number(criticalFlags) > 0;
  const gated = stage4 || chaseBlocked || criticalGated;
  const score = gated ? Math.min(rawScore, 20) : rawScore;

  const cautions = [];
  if (criticalGated) cautions.push("🔴 A critical real red flag is active — real score capped.");
  if (stage4) cautions.push("🔴 Stage 4 downtrend — real score capped, not a valid long setup.");
  if (chaseBlocked) cautions.push(`🔴 ${antiChase.label} — real score capped, too extended to chase.`);

  const reasons = [
    Number.isFinite(passCount) ? `${passCount}/8 real Minervini trend-template criteria pass` : "Trend template data unavailable",
    adx ? `ADX ${adx.adx} (${adx.strength}), ${adx.direction} — +DI ${adx.plusDI} / -DI ${adx.minusDI}` : "ADX unavailable (insufficient history)",
    smc?.bos?.type ? smc.bos.label : smc?.choch?.type ? smc.choch.label : smc?.nearestOB?.type ? `Nearest real order block: ${smc.nearestOB.type === "BULL_OB" ? "bullish" : "bearish"}` : "No clear real market-structure signal",
    flowRatio != null ? `Real options flow ${Math.round(flowRatio * 100)}% call-weighted notional` : "Options flow data unavailable",
    Number.isFinite(epsGrowth) ? `EPS growth (fwd vs TTM): ${epsGrowth >= 0 ? "+" : ""}${epsGrowth}%` : "Forward EPS data unavailable",
    `Market regime ${regime?.label || "?"} (${regime?.score ?? "?"}/100)`,
    sectorInfo?.rank ? `Sector rank #${sectorInfo.rank}/${sectorInfo.of} today` : "Sector rank unavailable",
  ];
  return {
    score, reasons, cautions,
    breakdown: { trendPts, technicalPts, smartMoneyPts, optionsFlowPts, fundamentalPts, macroPts, sectorPts },
  };
}

function computeFundamentalsRead(f) {
  const bull = [], bear = [];
  if (!f) return { bull, bear };
  const pe = Number(f.pe ?? f.trailingPE);
  if (Number.isFinite(pe) && pe > 0) {
    if (pe < 15) bull.push(`P/E of ${pe.toFixed(1)} is cheap — priced well below the broad market`);
    else if (pe < 25) bull.push(`P/E of ${pe.toFixed(1)} is a reasonable valuation`);
    else if (pe > 50) bear.push(`P/E of ${pe.toFixed(1)} is expensive — priced for a lot of future growth to show up`);
  }
  const peg = Number(f.pegRatio);
  if (Number.isFinite(peg) && peg > 0) {
    if (peg < 1) bull.push(`PEG of ${peg.toFixed(2)} — cheap relative to its own growth rate`);
    else if (peg < 2) bull.push(`PEG of ${peg.toFixed(2)} — fairly priced relative to growth`);
    else if (peg >= 3) bear.push(`PEG of ${peg.toFixed(2)} — expensive relative to its own growth rate`);
  }
  const rev = Number(f.revenueGrowth);
  if (Number.isFinite(rev)) {
    if (rev >= 0.20) bull.push(`Revenue growing ${(rev * 100).toFixed(1)}% — strong top-line expansion`);
    else if (rev >= 0.10) bull.push(`Revenue growing ${(rev * 100).toFixed(1)}%`);
    else if (rev < 0) bear.push(`Revenue shrinking ${(rev * 100).toFixed(1)}%`);
  }
  const eps = Number(f.earningsGrowth);
  if (Number.isFinite(eps)) {
    if (eps >= 0.20) bull.push(`Earnings growing ${(eps * 100).toFixed(1)}% — strong bottom-line expansion`);
    else if (eps >= 0.10) bull.push(`Earnings growing ${(eps * 100).toFixed(1)}%`);
    else if (eps < 0) bear.push(`Earnings shrinking ${(eps * 100).toFixed(1)}%`);
  }
  const pm = Number(f.profitMargin);
  if (Number.isFinite(pm)) {
    if (pm >= 0.20) bull.push(`Profit margin ${(pm * 100).toFixed(1)}% — highly profitable`);
    else if (pm >= 0.10) bull.push(`Profit margin ${(pm * 100).toFixed(1)}% — solidly profitable`);
    else if (pm < 0) bear.push(`Negative profit margin (${(pm * 100).toFixed(1)}%) — losing money on every dollar of revenue`);
  }
  return { bull, bear };
}

function classifyEntryType(row, aplusScore) {
  const stage = String(row?.stage || "");
  if (row?.atBuyPoint && row?.volConfirmed && Number(aplusScore) >= 80) {
    return { type: "Ideal Entry", color: "#0d9465", reason: "Confirmed breakout (volume-backed) at a high real Trade Setup Score — the textbook best entry." };
  }
  if (row?.atBuyPoint && row?.volConfirmed) {
    return { type: "Breakout Entry", color: "#22a06b", reason: "Real buy point, confirmed by volume ≥1.4x the 50-day average." };
  }
  if (row?.actionable && !row?.atBuyPoint && !row?.extended && row?.tightening && row?.abovePivotPct != null && row?.abovePivotPct < 0 && row?.abovePivotPct > -5) {
    return { type: "Early Entry", color: "#7c5cff", reason: "Real VCP base contracting, coiled within 5% below the real pivot — before it triggers." };
  }
  if ((row?.rsRating || 0) >= 80 && stage.includes("2")) {
    return { type: "Trend Entry", color: "#2563eb", reason: "RS ≥80 in a confirmed Stage 2 uptrend — buying real established strength." };
  }
  if (row?.actionable && !row?.atBuyPoint && !row?.extended) {
    return { type: "Pullback Entry", color: "#d6a312", reason: "Real actionable setup, not yet at the buy point, not extended — a quality pullback." };
  }
  return null;
}

module.exports = { computeRegime, computeAPlusScore, computeInstitutionalGrade, computeFundamentalsRead, classifyEntryType };
