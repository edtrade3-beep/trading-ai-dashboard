"use strict";

// market-helpers-decision.js — server-side CommonJS port of the
// market-helpers.js pure functions AM Cortex needs (Market Regime, A+
// Score, Institutional Grade, Fundamentals Read, Entry Type), kept
// byte-identical to axiom-runner/components/market-helpers.js (same
// dual-port convention as sniper-decision.js / cortex-decision.js — see
// those files' own headers). Exists so Telegram's /cortex command can show
// the same real Cortex decision the web app shows, without a browser.
//
// If you change computeRegime/computeAPlusScore/computeInstitutionalGrade/
// computeFundamentalsRead/classifyEntryType in market-helpers.js, mirror
// the change here too.

function computeRegime(macroData) {
  const find = s => (macroData || []).find(m => (m.symbol || "").toUpperCase() === s);
  const spy = find("SPY"), qqq = find("QQQ"), vix = find("VIX") || find("^VIX") || find("VIXY");
  const chg = q => Number(q?.changesPercentage || 0);
  const factors = [];
  factors.push({ label: "SPY up", pass: spy ? chg(spy) > -0.1 : false, pts: 20 });
  factors.push({ label: "QQQ up", pass: qqq ? chg(qqq) > -0.1 : false, pts: 20 });
  const vixVal = Number(vix?.price || vix?.regularMarketPrice || 0);
  factors.push({ label: "VIX < 20", pass: vixVal > 0 ? vixVal < 20 : (spy ? chg(spy) > -0.3 : false), pts: 20 });
  factors.push({ label: "Breadth +", pass: spy && qqq ? (chg(spy) > 0 && chg(qqq) > 0) : false, pts: 20 });
  factors.push({ label: "Trend day", pass: spy ? chg(spy) > 0.4 : false, pts: 20 });
  const score = factors.reduce((s, f) => s + (f.pass ? f.pts : 0), 0);
  const label = score >= 75 ? "GREEN" : score >= 55 ? "YELLOW" : score >= 40 ? "ORANGE" : "RED";
  const color = score >= 75 ? "#22c55e" : score >= 55 ? "#d6a312" : score >= 40 ? "#e07b1a" : "#ef4444";
  return { score, label, color, factors, vixVal };
}

function computeAPlusScore(row, regime) {
  const passCount = Number(row?.passCount || 0);
  const regimeScore = Number(regime?.score ?? 0);

  const regimePts = Math.round((regimeScore / 100) * 20);

  const abovePivotPct = Number(row?.abovePivotPct);
  const idealDist = !Number.isFinite(abovePivotPct) ? null
    : abovePivotPct < 0 ? -abovePivotPct : Math.max(0, abovePivotPct - 5);
  const entryPts = idealDist == null ? 10 : Math.round(Math.max(0, Math.min(1, (15 - idealDist) / 15)) * 20);

  const isGo = row?.verdict === "GO" || (row?.atBuyPoint && row?.volConfirmed);
  const breakoutConf = Number(row?.confidence) || 0;
  const breakoutBase = isGo ? 12 : row?.actionable ? 7 : 0;
  const breakoutBonus = Math.round((breakoutConf / 100) * 3);
  const breakoutPts = Math.min(15, breakoutBase + breakoutBonus);

  const volRatio = Number(row?.volRatio);
  const volPts = Number.isFinite(volRatio) ? Math.round(Math.max(0, Math.min(1, volRatio / 2)) * 10) : 5;

  const riskPct = Number(row?.riskPct);
  const riskPts = Number.isFinite(riskPct) && riskPct > 0 ? Math.round(Math.max(0, Math.min(1, (10 - riskPct) / 7)) * 20) : 10;

  const pctFromHigh = Number(row?.pctFromHigh);
  const supportPts = Number.isFinite(pctFromHigh) ? Math.round(Math.max(0, Math.min(1, (pctFromHigh + 25) / 25)) * 10) : 5;

  const volatilityPts = row?.tightening ? 5 : (row?.vcpGrade && row.vcpGrade !== "-" ? 3 : 2);

  const score = Math.max(0, Math.min(100, regimePts + entryPts + breakoutPts + volPts + riskPts + supportPts + volatilityPts));
  const cautions = [];
  if (row?.earningsSoon) cautions.push(`⚠️ Earnings within ${row.earningsDte} day${row.earningsDte === 1 ? "" : "s"} — added gap risk (not scored, timing-only caution)`);
  const reasons = [
    `Market regime ${regime?.label || "?"} (${regimeScore}/100)${regimeScore >= 75 ? " — favorable for breakouts" : regimeScore >= 55 ? " — mixed, be selective" : " — unfavorable, high failure risk"}`,
    idealDist == null ? "Pivot distance unavailable"
      : abovePivotPct < 0 ? `${Math.abs(abovePivotPct).toFixed(1)}% below pivot — base not yet broken`
      : abovePivotPct <= 5 ? `${abovePivotPct.toFixed(1)}% above pivot — fresh, unextended entry`
      : `${abovePivotPct.toFixed(1)}% above pivot — extended, chasing risk`,
    isGo ? `At buy point with volume confirmation${breakoutConf ? ` (${breakoutConf}% breakout confidence)` : ""}` : row?.actionable ? "Near pivot, not yet confirmed" : "Not yet actionable",
    Number.isFinite(volRatio) ? `Volume ${volRatio.toFixed(1)}x the 50-day average` : "Volume data unavailable",
    Number.isFinite(riskPct) && riskPct > 0 ? `${riskPct.toFixed(1)}% risk to stop — ${riskPct <= 5 ? "tight, low-risk entry" : riskPct <= 8 ? "moderate risk" : "wide stop, higher risk"}` : "Risk distance unavailable",
    Number.isFinite(pctFromHigh) ? `${Math.abs(pctFromHigh).toFixed(1)}% ${pctFromHigh < 0 ? "below" : "at"} the 52-week high` : "52-week high distance unavailable",
    row?.tightening ? "VCP tightening — each pullback shallower than the last" : row?.vcpGrade && row.vcpGrade !== "-" ? `VCP grade ${row.vcpGrade}, not yet tightening` : "No real VCP base detected",
  ];
  return { score, reasons, cautions, breakdown: { regimePts, entryPts, breakoutPts, volPts, riskPts, supportPts, volatilityPts }, passCount };
}

function computeInstitutionalGrade(row, technicals, regime, sectorInfo, optionsFlow) {
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

  const score = Math.max(0, Math.min(100, trendPts + technicalPts + smartMoneyPts + optionsFlowPts + fundamentalPts + macroPts + sectorPts));
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
    score, reasons, cautions: [],
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
