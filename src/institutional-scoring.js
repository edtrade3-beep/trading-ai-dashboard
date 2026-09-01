// Server-side (CommonJS) port of computeInstitutionalGrade/institutionalLetterGrade/
// institutionalRecommendation/winProbFor/computeMarketBias/classifyMacroStatus/
// classifyEntryType from axiom-runner/components/market-helpers.js (an ES-module
// frontend file the backend can't `require` directly) — same reason and same
// "keep byte-identical whenever either changes" discipline as trade-planner-scoring.js,
// just a second file so that one stays scoped to the Telegram bot's /plan command.
// Built for the Smart Money page redesign (2026-08-05, "AI Institutional Decision
// Engine" spec) so the new /api/market/smart-money endpoint can compute the same real
// Confidence/Grade/Bias/Win% the website itself would show, not an approximation.
const { computeRegime } = require("./trade-planner-scoring");
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

  // Real bug fix (2026-08-26, "Trade Desk Tier 3a") — this is the EXACT
  // function this file's own header comment (below, institutionalRecommendation)
  // documents a real live incident for: a "★★★★★ Strong Buy" card once
  // shown directly under the real Core Engine's 🔴 AVOID banner. The
  // wording was softened in an earlier phase, but the underlying score had
  // zero real Stage-4/anti-chase awareness — this closes that gap at the
  // source. institutionalRecommendation() is a pure function of this score,
  // so capping it here automatically fixes the star/label read too.
  const stage4 = /Stage\s*4/i.test(String(row?.stage || ""));
  const abovePivotPct = Number(row?.abovePivotPct);
  const antiChase = Number.isFinite(abovePivotPct) ? computeAntiChase(abovePivotPct) : null;
  const chaseBlocked = antiChase?.band === "EXTENDED" || antiChase?.band === "DO_NOT_CHASE";
  // Real critical-red-flag hard gate (/goal Phase 5 audit, 2026-09-01) —
  // this function had Stage-4/anti-chase awareness (the fix above) but
  // none for a critical red flag (red-flag-engine.js), the one hard gate
  // classifyCoreVerdict/Cortex Verdict both already check. A red-flagged
  // symbol could still show an uncapped high institutional score anywhere
  // this renders standalone (not behind the Hero-verdict-gated Smart Money
  // panel) — e.g. RhProScanner.jsx's list rows. `criticalFlags` is
  // optional/additive, same "existing callers keep exact prior behavior"
  // contract as the stage4/chaseBlocked gate above.
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

function institutionalLetterGrade(score) {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B+";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

// Labels retitled from Strong Buy/Buy/Hold/Sell/Strong Sell to quality-
// only words (One Engine Migration Phase 3, 2026-08-23) — this function
// reads computeInstitutionalGrade's 0-100 quality score with zero
// awareness of Stage 4, red flags, or any other real gate, so verdict-
// shaped language here could (and did — confirmed via a real Phase 2
// screenshot: a "★★★★★ Strong Buy" card sitting directly under the real
// Core Engine's 🔴 AVOID banner) read as a second, competing trading
// verdict. Same real thresholds/stars/color — only the words change.
// This exact wording was already shipped and user-facing at one real
// call site (RhProScanner.jsx's own local QUALITY_WORD map) before this
// phase; promoted here into the source function so every consumer gets
// it automatically instead of needing its own relabeling patch.
function institutionalRecommendation(score) {
  if (score >= 85) return { label: "Excellent", stars: 5, color: "#0d9465" };
  if (score >= 70) return { label: "Strong", stars: 4, color: "#22a06b" };
  if (score >= 45) return { label: "Neutral", stars: 3, color: "#d6a312" };
  if (score >= 25) return { label: "Weak", stars: 2, color: "#e07b1a" };
  return { label: "Poor", stars: 1, color: "#c8282a" };
}

const MIN_WIN_SAMPLE = 10;
function winProbBucketOf(score) {
  if (score >= 80) return "80-100";
  if (score >= 60) return "60-79";
  if (score >= 40) return "40-59";
  return "0-39";
}
function winProbFor(track, score) {
  if (!track?.horizons) return null;
  const bucket = winProbBucketOf(score);
  for (const h of ["d20", "d10", "d5", "d60"]) {
    const b = track.horizons[h]?.buckets?.[bucket];
    if (b && b.count >= MIN_WIN_SAMPLE) return { winRate: b.winRate, count: b.count, horizon: h.slice(1) };
  }
  let best = null;
  for (const h of ["d20", "d10", "d5", "d60"]) {
    const b = track.horizons[h]?.buckets?.[bucket];
    if (b && (!best || b.count > best.count)) best = { count: b.count, horizon: h.slice(1) };
  }
  return best ? { winRate: null, count: best.count, horizon: best.horizon } : null;
}

function computeMarketBias({ macroData, distData } = {}) {
  const find = s => (macroData || []).find(m => (m.symbol || "").toUpperCase() === s);
  const spy = find("SPY"), qqq = find("QQQ");
  const chg = q => Number(q?.changesPercentage || 0);
  const vix = Number(distData?.vix) || 0;

  if (!spy) return { bias: null, confidence: null, character: null, riskPosture: null, label: "—" };

  const regime = computeRegime(macroData);
  const regimeDir = regime.score >= 55 ? 1 : regime.score < 40 ? -1 : 0;

  const spyChg = chg(spy), qqqChg = chg(qqq);
  const ruleDir = (vix > 30 || spyChg < -1.5) ? -1
    : (vix < 16 && spyChg > 0.3 && qqqChg > 0.3) ? 1
    : (Math.abs(spyChg) < 0.3 && vix < 22) ? 0
    : (spyChg > 0.5) ? 1
    : -1;

  const vixy = find("VIXY"), tlt = find("TLT"), uup = find("UUP"), hyg = find("HYG");
  let riskScore = 50 + chg(spy) * 8 + chg(qqq) * 6 - chg(vixy) * 3 + chg(tlt) * 2 - chg(uup) * 3 + chg(hyg) * 4;
  riskScore = Math.max(0, Math.min(100, Math.round(riskScore)));
  const riskDir = riskScore >= 65 ? 1 : riskScore < 40 ? -1 : 0;

  const dirs = [regimeDir, ruleDir, riskDir];
  const bullVotes = dirs.filter(d => d === 1).length;
  const bearVotes = dirs.filter(d => d === -1).length;
  const neutralVotes = dirs.filter(d => d === 0).length;
  const bias = bullVotes > bearVotes ? "Bullish" : bearVotes > bullVotes ? "Bearish" : "Neutral";

  const maxAgree = Math.max(bullVotes, bearVotes, neutralVotes);
  const confidence = maxAgree === 3 ? 90 : maxAgree === 2 ? 65 : 40;

  const trendDayFactor = regime.factors?.find(f => f.label === "Trend day");
  let character;
  if (vix >= 25) character = "Volatile";
  else if (vix > 0 && vix < 14) character = "Low Volatility";
  else if (trendDayFactor?.pass) character = "Trending";
  else character = "Range";

  const riskPosture = riskScore >= 65 ? "Risk On" : riskScore < 40 ? "Risk Off" : "Caution";

  return {
    bias, confidence, character, riskPosture,
    label: `${bias} · ${confidence}%`,
    sources: { regimeScore: regime.score, regimeLabel: regime.label, riskScore, vix },
  };
}

function classifyMacroStatus(symbol, { chgPct, vixLevel } = {}) {
  const sym = String(symbol || "").toUpperCase();
  if (sym === "VIX") {
    const level = Number(vixLevel) || 0;
    if (level <= 0) return { status: "neutral", label: "—" };
    if (level > 25) return { status: "red", label: "Elevated" };
    if (level < 16) return { status: "green", label: "Calm" };
    return { status: "yellow", label: "Mixed" };
  }
  const c = Number(chgPct) || 0;
  if (c >= 0.5) return { status: "green", label: "Up" };
  if (c <= -0.5) return { status: "red", label: "Down" };
  return { status: "yellow", label: "Flat" };
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

// Byte-identical port of axiom-live.jsx's getMarketSessionET — the real
// substitute for the mockup's fabricated "Market Wind: TAILWIND" field
// (user-confirmed direction, see the Smart Money redesign plan).
function getMarketSessionET(now = new Date()) {
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const mins = et.getHours() * 60 + et.getMinutes();
  if (mins >= 240 && mins < 570) return "PREMARKET";
  if (mins >= 570 && mins < 960) return "REGULAR";
  if (mins >= 960 && mins < 1200) return "AFTERMARKET";
  return "OVERNIGHT";
}

module.exports = {
  computeInstitutionalGrade, institutionalLetterGrade, institutionalRecommendation,
  MIN_WIN_SAMPLE, winProbBucketOf, winProbFor,
  computeMarketBias, classifyMacroStatus, classifyEntryType,
  getMarketSessionET,
};
