// Server-side (CommonJS) port of computeRegime/computeAPlusScore/computeNextAction
// from axiom-runner/components/market-helpers.js (an ES-module frontend file the
// backend can't `require` directly). Keep this byte-identical to that file's logic
// whenever either changes — this exists so the Telegram bot's /plan command produces
// the exact same score/verdict as the website's Trade Planner tab, not an approximation.

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
  const label = score >= 75 ? "GREEN" : score >= 55 ? "YELLOW" : "RED";
  const color = score >= 75 ? "#22c55e" : score >= 55 ? "#d6a312" : "#ef4444";
  return { score, label, color, factors, vixVal };
}

function computeAPlusScore(row, regime) {
  const passCount = Number(row?.passCount || 0);
  const rsRating = Number(row?.rsRating || 0);
  const regimeScore = Number(regime?.score ?? 0);
  const trendPts = Math.round((passCount / 8) * 40);
  const rsPts = Math.round((rsRating / 100) * 30);
  const regimePts = Math.round((regimeScore / 100) * 20);
  const isGo = row?.verdict === "GO" || (row?.atBuyPoint && row?.volConfirmed);
  const setupPts = isGo ? 10 : row?.actionable ? 6 : 0;
  const score = Math.max(0, Math.min(100, trendPts + rsPts + regimePts + setupPts));
  const reasons = [
    `${passCount}/8 trend template criteria met`,
    rsRating >= 90 ? `RS ${rsRating} — top-decile market leader` : rsRating >= 70 ? `RS ${rsRating} — market leader` : `RS ${rsRating} — below leader threshold`,
    `Market regime ${regime?.label || "?"} (${regimeScore}/100)${regimeScore >= 75 ? " — favorable for breakouts" : regimeScore >= 55 ? " — mixed, be selective" : " — unfavorable, high failure risk"}`,
    isGo ? "At buy point with volume confirmation" : row?.actionable ? "Near pivot, not yet confirmed" : "Not yet actionable",
  ];
  return { score, reasons, breakdown: { trendPts, rsPts, regimePts, setupPts } };
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
