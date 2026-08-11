"use strict";

// Server-side port of axiom-runner/components/sniper-decision.js — the same
// AI Sniper hard-gated decision engine, needed here (CommonJS) so the new
// watchlist-sniper-alerts.js cron job can compute it without a browser.
// KEEP THIS IN SYNC with the client file — same formulas/thresholds, same
// field names off screenTrendTemplate rows. If one changes, change both.
//
// computeReversalDetector is also ported here (from axiom-runner/
// components/market-helpers.js) for the same reason — it's a pure function
// of scalars, no other client dependencies, so this is a straight copy.

function round2(n) { return Math.round(n * 100) / 100; }

const SNIPER_TIMING = {
  ENTER_LONG: { label: "Enter Long", color: "#0d9465", icon: "🟢" },
  WAIT:       { label: "Wait",       color: "#d6a312", icon: "🟡" },
  NO_CHASE:   { label: "No Chase",   color: "#f97316", icon: "🟠" },
  AVOID:      { label: "Avoid",      color: "#c8282a", icon: "🔴" },
};

function computeReversalDetector({ price, hi52, lo52, rsi, rvol, dayChangePct, weekChangePct, ma50 }) {
  const px = Number(price);
  if (!Number.isFinite(px) || px <= 0) return null;
  const hi = Number(hi52), lo = Number(lo52);
  const distFromLo = Number.isFinite(hi) && Number.isFinite(lo) && lo > 0 ? (px - lo) / lo * 100 : null;
  const distFromHi = Number.isFinite(hi) && Number.isFinite(lo) && hi > 0 ? (hi - px) / hi * 100 : null;
  const r = Number(rsi), rv = Number(rvol), d1 = Number(dayChangePct), w1 = Number(weekChangePct), ma = Number(ma50);

  const bottomSigs = [], topSigs = [];
  if (distFromLo != null && distFromLo < 10) bottomSigs.push({ txt: `Near 52w low (-${distFromLo.toFixed(1)}%)`, weight: 3 });
  if (Number.isFinite(r) && r < 30) bottomSigs.push({ txt: `RSI oversold (${r.toFixed(0)})`, weight: 3 });
  if (Number.isFinite(r) && Number.isFinite(d1) && r < 40 && d1 > 1) bottomSigs.push({ txt: "RSI recovering + price up", weight: 2 });
  if (Number.isFinite(rv) && Number.isFinite(d1) && rv > 2.5 && d1 < -3) bottomSigs.push({ txt: `Climax sell volume (${rv.toFixed(1)}x) — exhaustion`, weight: 2 });
  if (Number.isFinite(w1) && Number.isFinite(d1) && w1 < -15 && d1 > 0) bottomSigs.push({ txt: "Sharp drop + reversal candle", weight: 2 });
  if (Number.isFinite(ma) && ma > 0 && px < ma * 0.85) bottomSigs.push({ txt: "Far below 50-day MA — stretched", weight: 1 });

  if (distFromHi != null && distFromHi < 5) topSigs.push({ txt: `Near 52w high (-${distFromHi.toFixed(1)}%)`, weight: 3 });
  if (Number.isFinite(r) && r > 70) topSigs.push({ txt: `RSI overbought (${r.toFixed(0)})`, weight: 3 });
  if (Number.isFinite(r) && Number.isFinite(d1) && r > 65 && d1 < -1) topSigs.push({ txt: "RSI dropping + price down", weight: 2 });
  if (Number.isFinite(rv) && Number.isFinite(d1) && rv > 2.5 && d1 > 5) topSigs.push({ txt: `Climax buy volume (${rv.toFixed(1)}x) — exhaustion`, weight: 2 });
  if (Number.isFinite(w1) && Number.isFinite(d1) && w1 > 20 && d1 < 0) topSigs.push({ txt: "Parabolic run + reversal candle", weight: 2 });
  if (Number.isFinite(ma) && ma > 0 && px > ma * 1.20) topSigs.push({ txt: "Far above 50-day MA — extended", weight: 1 });

  const bottomScore = bottomSigs.reduce((s, x) => s + x.weight, 0);
  const topScore = topSigs.reduce((s, x) => s + x.weight, 0);
  const threshold = 2;
  const isBottom = bottomScore >= threshold && bottomScore >= topScore;
  const isTop = topScore >= threshold && topScore > bottomScore;
  const isNeutral = !isBottom && !isTop;
  const verdict = isNeutral ? "MID RANGE"
    : isBottom ? (bottomScore >= 6 ? "LIKELY BOTTOM — early get-in zone" : "POSSIBLE BOTTOM — early get-in zone")
    : (topScore >= 6 ? "LIKELY TOP — early get-out zone" : "POSSIBLE TOP — early get-out zone");
  const sigs = isBottom ? bottomSigs : isTop ? topSigs : [];
  return { verdict, isBottom, isTop, isNeutral, bottomScore, topScore, sigs, distFromLo, distFromHi, hi52: hi, lo52: lo };
}

function computeSniperDecision(row) {
  const passCount = Number(row?.passCount || 0);
  const stage = String(row?.stage || "");
  const price = Number(row?.price);
  const pivot = Number(row?.pivot);
  const entry = Number(row?.entry);
  const stop = Number(row?.stop);
  const target2 = Number(row?.target2);
  const volRatio = Number(row?.volRatio);
  const rsRating = Number(row?.rsRating);
  const abovePivotPct = Number(row?.abovePivotPct);
  const vwap20 = Number(row?.technicals?.vwap20);

  const hasEntryMath = Number.isFinite(entry) && Number.isFinite(stop) && entry > stop;
  const target1 = hasEntryMath ? round2(entry + (entry - stop)) : null;
  const rr = (hasEntryMath && Number.isFinite(target2)) ? round2((target2 - entry) / (entry - stop)) : null;

  const reversal = computeReversalDetector({
    price, hi52: row?.hi52, lo52: row?.lo52, rsi: row?.rsi,
    rvol: volRatio, dayChangePct: row?.dayChangePct, weekChangePct: row?.weekChangePct, ma50: row?.ma50,
  });

  const stage4 = stage.includes("4");
  const trendBullish = passCount >= 6 && stage.includes("2");

  const aboveVwap = Number.isFinite(vwap20) && Number.isFinite(price) ? price >= vwap20 : null;
  const volumeConfirmed = Number.isFinite(volRatio) && volRatio >= 1.4;
  const momentumConfirmed = Number.isFinite(rsRating) && rsRating >= 70;
  const triggerConfirmed = !!(row?.breakoutConfirmed && row?.volConfirmed);
  const extended = !!row?.extended;
  const reversalTopRisk = !!(reversal && reversal.isTop);

  const reasons = [];
  if (passCount) reasons.push({ ok: trendBullish, text: `Minervini ${passCount}/8${trendBullish ? "" : " — trend not in gear"}` });
  if (aboveVwap != null) reasons.push({ ok: aboveVwap, text: aboveVwap ? "Above 20-day VWAP" : "Below 20-day VWAP" });
  if (Number.isFinite(volRatio)) reasons.push({ ok: volumeConfirmed, text: `RVOL ${volRatio.toFixed(1)}x` });
  if (Number.isFinite(rsRating)) reasons.push({ ok: momentumConfirmed, text: `RS Rating ${rsRating}` });
  reasons.push({ ok: !extended, text: extended ? "Extended above pivot — chasing risk" : "Not extended" });
  if (reversalTopRisk) reasons.push({ ok: false, text: "Real early get-out signs (near-top reversal read)" });

  let action, reason, waitingFor = null;
  if (stage4 || passCount <= 4) {
    action = "AVOID";
    reason = "Trend isn't in gear — this isn't a real setup right now.";
  } else if (!trendBullish) {
    action = "WAIT";
    reason = `Trend and quality aren't there yet (${passCount}/8, ${stage || "stage unclear"}).`;
    waitingFor = "A confirmed Stage 2 uptrend with 6+/8 Minervini criteria.";
  } else if (extended) {
    action = "NO_CHASE";
    reason = `${Number.isFinite(abovePivotPct) ? abovePivotPct.toFixed(1) + "% " : ""}above the pivot — already extended.`;
    waitingFor = "A pullback toward the pivot/VWAP, or a fresh base.";
  } else if (reversalTopRisk) {
    action = "NO_CHASE";
    reason = `${reversal.verdict} — ${reversal.sigs.map((s) => s.txt).join(", ")}.`;
    waitingFor = "Signs of exhaustion to cool off, or a real pullback before the next leg.";
  } else if (triggerConfirmed && volumeConfirmed && momentumConfirmed) {
    action = "ENTER_LONG";
    reason = "Trend, volume, and momentum all confirm the breakout.";
  } else if (!triggerConfirmed) {
    action = "WAIT";
    reason = "Trend and quality are strong. Breakout trigger is not confirmed.";
    waitingFor = Number.isFinite(pivot) ? `Break above $${pivot.toFixed(2)} with volume ≥1.4x average.` : "A confirmed breakout with volume.";
  } else {
    action = "WAIT";
    reason = "Close, but volume or momentum hasn't fully confirmed alongside the trigger yet.";
    waitingFor = "Volume ≥1.4x average and RS Rating ≥70 to confirm alongside the trigger.";
  }

  return {
    action, reason, waitingFor,
    meta: SNIPER_TIMING[action],
    reasons,
    gates: { trendBullish, aboveVwap, volumeConfirmed, momentumConfirmed, triggerConfirmed, extended, reversalTopRisk },
    reversal,
    price: Number.isFinite(price) ? price : null,
    pivot: Number.isFinite(pivot) ? pivot : null,
    entry: hasEntryMath ? entry : (Number.isFinite(pivot) ? pivot : null),
    stop: Number.isFinite(stop) ? stop : null,
    target1,
    target2: Number.isFinite(target2) ? target2 : null,
    rr,
    vwap20: Number.isFinite(vwap20) ? vwap20 : null,
  };
}

module.exports = { computeSniperDecision, computeReversalDetector, SNIPER_TIMING };
