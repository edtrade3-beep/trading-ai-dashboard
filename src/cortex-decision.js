"use strict";

// cortex-decision.js — server-side CommonJS port of AM Cortex's Heat Risk /
// Cortex Verdict / Technical Score, kept byte-identical to
// axiom-runner/components/cortex-engine.js (same dual-port convention this
// app already uses for sniper-decision.js — see that file's own header).
// Exists so the daily forward-return tracker (aplus-score-history.js) can
// log a real Cortex Verdict per symbol per day without duplicating or
// drifting from the exact logic Cortex itself shows the user. Only the 3
// functions the tracker needs are ported here — query parsing and scan
// ranking are UI-only concerns with no server-side need.
//
// If you change computeHeatRisk/computeCortexVerdict/computeTechnicalScore
// in cortex-engine.js, mirror the change here too.

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

function computeHeatRisk(row, sniper) {
  const rev = sniper?.reversal;
  const extended = !!row?.extended;
  const dayChg = Number(row?.dayChangePct);
  const volRatio = Number(row?.volRatio ?? row?.volSurge);
  const climaxMove = Number.isFinite(dayChg) && Number.isFinite(volRatio) && Math.abs(dayChg) >= 5 && volRatio >= 2.5;
  const stage4 = /Stage\s*4/i.test(String(row?.stage || ""));

  if (rev?.isTop && (rev.topScore >= 6 || climaxMove)) {
    return {
      state: "CLIMACTIC_DANGER", label: "CLIMACTIC DANGER", color: "#c8282a", icon: "🔴",
      reason: rev.sigs?.length ? rev.sigs.map((s) => s.txt).join(" · ") : "Exhaustion signals present near a real extreme.",
    };
  }
  if (extended || rev?.isTop) {
    return {
      state: "OVEREXTENDED_DO_NOT_CHASE", label: "OVEREXTENDED — DO NOT CHASE", color: "#e08a1e", icon: "🟠",
      reason: extended && Number.isFinite(row?.abovePivotPct) ? `${row.abovePivotPct.toFixed(1)}% above pivot — chasing risk.` : (rev?.verdict || "Stretched from recent structure."),
    };
  }
  if (stage4 || sniper?.action === "AVOID") {
    return {
      state: "WEAK_AVOID", label: "WEAK — AVOID", color: "#c8282a", icon: "🔴",
      reason: stage4 ? "Stage 4 downtrend — below key moving averages." : (sniper?.reason || "Trend not supportive."),
    };
  }
  if (sniper?.action === "ENTER_LONG" && !extended) {
    return { state: "HEALTHY_STRENGTH", label: "HEALTHY STRENGTH", color: "#0d9465", icon: "🟢", reason: "Trend, volume, and entry timing are aligned." };
  }
  return { state: "NEUTRAL_WAIT", label: "NEUTRAL — WAIT", color: "#d6a312", icon: "🟡", reason: sniper?.reason || "No clear real edge either way right now." };
}

function computeCortexVerdict({ sniper, heat, aplusScore }) {
  if (heat?.state === "CLIMACTIC_DANGER" || heat?.state === "WEAK_AVOID") {
    return { verdict: "AVOID", icon: "🔴", color: "#c8282a", reason: heat.reason };
  }
  if (heat?.state === "OVEREXTENDED_DO_NOT_CHASE") {
    return { verdict: "OVEREXTENDED", icon: "🟠", color: "#e08a1e", reason: "Strong stock, but current entry has poor reward/risk — wait for a pullback." };
  }
  if (sniper?.action === "ENTER_LONG" && heat?.state === "HEALTHY_STRENGTH") {
    return { verdict: "BUY ZONE", icon: "🟢", color: "#0d9465", reason: sniper.reason || "Setup and timing are both real right now." };
  }
  if (Number.isFinite(aplusScore) && aplusScore >= 65) {
    return { verdict: "WATCH", icon: "🟢", color: "#5ab552", reason: "Strong setup building — not at the buy point yet." };
  }
  return { verdict: "WAIT", icon: "🟡", color: "#d6a312", reason: sniper?.reason || "Not enough real edge to act yet." };
}

function computeTechnicalScore(row, sniper) {
  const parts = [];
  parts.push(sniper?.gates?.trendBullish ? 30 : 0);
  const rs = Number(row?.rsRating);
  parts.push(Number.isFinite(rs) ? Math.round(clamp(rs / 100, 0, 1) * 30) : 15);
  parts.push(sniper?.gates?.volumeConfirmed ? 20 : 0);
  const adx = row?.technicals?.adx;
  parts.push(
    adx?.strength === "Strong" && adx?.direction === "Bullish" ? 20
      : adx?.strength === "Developing" && adx?.direction === "Bullish" ? 12
      : adx ? 5 : 10
  );
  return Math.round(parts.reduce((a, b) => a + b, 0));
}

module.exports = { computeHeatRisk, computeCortexVerdict, computeTechnicalScore };
