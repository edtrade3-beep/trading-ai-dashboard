// Server-side (CommonJS) port of computeRegime/computeAPlusScore/computeNextAction
// from axiom-runner/components/market-helpers.js (an ES-module frontend file the
// backend can't `require` directly). Keep this byte-identical to that file's logic
// whenever either changes — this exists so the Telegram bot's /plan command produces
// the exact same score/verdict as the website's Trade Planner tab, not an approximation.

const { computeAntiChase } = require("./atr-risk-engine");

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
  // sixBand: additive-only field for the "AM Trading — Final Trading Logic
  // Redesign" spec's 6-level Market Regime classification (§18). `label`
  // (GREEN/YELLOW/ORANGE/RED) stays exactly as-is — dozens of existing
  // consumers do `regime.label === "GREEN"` string comparisons across both
  // client and server; changing that field would be a wide, unrelated
  // regression. New code reads `sixBand` instead.
  const sixBand = score >= 85 ? "STRONG_BULL" : score >= 70 ? "BULL" : score >= 55 ? "NEUTRAL" : score >= 40 ? "TRANSITION" : score >= 25 ? "BEAR" : "STRONG_BEAR";
  return { score, label, color, factors, vixVal, sixBand };
}

function computeAPlusScore(row, regime) {
  const passCount = Number(row?.passCount || 0);
  const regimeScore = Number(regime?.score ?? 0);

  const regimePts = Math.round((regimeScore / 100) * 20);

  // Entry/Breakout trimmed 20→15 / 15→10 (2026-08-14, VCP engine
  // integration Phase 2) to make room for the new standalone VCP Setup
  // Score dimension below — real overlap already existed with VCP's own
  // pivot-distance and breakout-readiness sub-components.
  const abovePivotPct = Number(row?.abovePivotPct);
  const idealDist = !Number.isFinite(abovePivotPct) ? null
    : abovePivotPct < 0 ? -abovePivotPct : Math.max(0, abovePivotPct - 5);
  const entryPts = idealDist == null ? 8 : Math.round(Math.max(0, Math.min(1, (15 - idealDist) / 15)) * 15);

  const isGo = row?.verdict === "GO" || (row?.atBuyPoint && row?.volConfirmed);
  const breakoutConf = Number(row?.confidence) || 0;
  const breakoutBase = isGo ? 8 : row?.actionable ? 5 : 0;
  const breakoutBonus = Math.round((breakoutConf / 100) * 2);
  const breakoutPts = Math.min(10, breakoutBase + breakoutBonus);

  const volRatio = Number(row?.volRatio);
  const volPts = Number.isFinite(volRatio) ? Math.round(Math.max(0, Math.min(1, volRatio / 2)) * 10) : 5;

  const riskPct = Number(row?.riskPct);
  const riskPts = Number.isFinite(riskPct) && riskPct > 0 ? Math.round(Math.max(0, Math.min(1, (10 - riskPct) / 7)) * 20) : 10;

  const pctFromHigh = Number(row?.pctFromHigh);
  const supportPts = Number.isFinite(pctFromHigh) ? Math.round(Math.max(0, Math.min(1, (pctFromHigh + 25) / 25)) * 10) : 5;

  // VCP Setup Score — the real, standalone 0-100 score from vcpReport()
  // (src/routes/market.js's own 5-component rubric), replacing the old
  // crude tightening-flag proxy. 2026-08-14 VCP engine integration Phase 2.
  const vcpScoreRaw = Number(row?.vcpScore);
  const vcpPts = Number.isFinite(vcpScoreRaw) ? Math.round((vcpScoreRaw / 100) * 15) : 7;

  const score = Math.max(0, Math.min(100, regimePts + entryPts + breakoutPts + volPts + riskPts + supportPts + vcpPts));
  const cautions = [];
  if (row?.earningsSoon) cautions.push(`⚠️ Earnings within ${row.earningsDte} day${row.earningsDte === 1 ? "" : "s"} — added gap risk (not scored, timing-only caution)`);
  const reasons = [
    `Market regime ${regime?.label || "?"} (${regimeScore}/100)${regimeScore >= 75 ? " — favorable for breakouts" : regimeScore >= 55 ? " — mixed, be selective" : " — unfavorable, high failure risk"}`,
    idealDist == null ? "Pivot distance unavailable" : computeAntiChase(abovePivotPct).label,
    isGo ? `At buy point with volume confirmation${breakoutConf ? ` (${breakoutConf}% breakout confidence)` : ""}` : row?.actionable ? "Near pivot, not yet confirmed" : "Not yet actionable",
    Number.isFinite(volRatio) ? `Volume ${volRatio.toFixed(1)}x the 50-day average` : "Volume data unavailable",
    Number.isFinite(riskPct) && riskPct > 0 ? `${riskPct.toFixed(1)}% risk to stop — ${riskPct <= 5 ? "tight, low-risk entry" : riskPct <= 8 ? "moderate risk" : "wide stop, higher risk"}` : "Risk distance unavailable",
    Number.isFinite(pctFromHigh) ? `${Math.abs(pctFromHigh).toFixed(1)}% ${pctFromHigh < 0 ? "below" : "at"} the 52-week high` : "52-week high distance unavailable",
    Number.isFinite(vcpScoreRaw) ? `VCP Setup Score ${vcpScoreRaw}/100${row?.vcpVerdict ? ` (${row.vcpVerdict})` : ""}` : "No real VCP base detected",
  ];
  return { score, reasons, cautions, breakdown: { regimePts, entryPts, breakoutPts, volPts, riskPts, supportPts, vcpPts }, passCount };
}

function computeNextAction(row) {
  const stage = String(row?.stage || "");
  const isGo = row?.verdict === "GO" || (row?.atBuyPoint && row?.volConfirmed);
  if (isGo) return { action: "BUY", color: "#0d9465", reason: "At buy point with volume confirmation." };
  if (stage.includes("4")) return { action: "AVOID", color: "#c8282a", reason: "Stage 4 downtrend — do not buy." };
  if (row?.atBuyPoint) return { action: "BREAKOUT", color: "#2563eb", reason: "At the pivot, but volume hasn't confirmed yet — wait for it or size down." };
  if (row?.actionable) return { action: "WATCH", color: "#d6a312", reason: "Near the buy zone, building strength — not a trigger yet." };
  return { action: "WAIT", color: "#94a3b8", reason: "Not yet actionable — no clean entry right now." };
}

module.exports = { computeRegime, computeAPlusScore, computeNextAction };
