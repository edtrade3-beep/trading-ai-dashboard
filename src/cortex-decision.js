"use strict";

// cortex-decision.js — server-side CommonJS port of AM Cortex's core
// decision functions, kept byte-identical to
// axiom-runner/components/cortex-engine.js (same dual-port convention this
// app already uses for sniper-decision.js — see that file's own header).
// Originally just the 3 functions the daily forward-return tracker needed
// (aplus-score-history.js); expanded 2026-08-13 to the full WHY/SETUP/
// LEVELS/VERDICT function set so Telegram's /cortex command can show the
// same real Cortex decision the web app shows, without a browser. Query
// parsing and scan ranking are still UI-only concerns, not ported here.
//
// If you change any of these functions in cortex-engine.js, mirror the
// change here too.

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
const round2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

function computeHeatRisk(row, sniper, antiChase) {
  const rev = sniper?.reversal;
  const band = antiChase?.band;
  const extended = band != null ? (band === "EXTENDED" || band === "DO_NOT_CHASE") : !!row?.extended;
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
      reason: band != null
        ? (antiChase.label || "Extended above the breakout — chasing risk.")
        : (extended && Number.isFinite(row?.abovePivotPct) ? `${row.abovePivotPct.toFixed(1)}% above pivot — chasing risk.` : (rev?.verdict || "Stretched from recent structure.")),
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

function computeCortexVerdict({ sniper, heat, aplusScore, criticalFlags, entryPlanStage, dailyBias }) {
  // Real hard-gate alignment with am-core-engine.js's classifyCoreVerdict
  // (One Engine consolidation, Phase 2.5, and /goal Phase 7 audit,
  // 2026-09-01) — see the identical comments on the client twin
  // (cortex-engine.js) for the full real-bug context. All 3 params are
  // optional and additive — existing callers that don't pass them keep
  // their exact prior behavior.
  if (Number(criticalFlags) > 0) {
    return { verdict: "AVOID", icon: "🔴", color: "#c8282a", reason: "A critical real red flag is active — not a valid setup right now." };
  }
  if (entryPlanStage === "STRUCTURE_BROKEN") {
    return { verdict: "AVOID", icon: "🔴", color: "#c8282a", reason: "4H structure is broken — not a valid setup right now." };
  }
  if (dailyBias === "BEARISH") {
    return { verdict: "AVOID", icon: "🔴", color: "#c8282a", reason: "Daily trend is bearish — long bias invalid." };
  }
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

function computePriceToPay(row, sniper) {
  const price = Number.isFinite(row?.price) ? row.price : null;
  const pivot = Number.isFinite(sniper?.pivot) ? sniper.pivot : (Number.isFinite(row?.pivot) ? row.pivot : null);
  if (!pivot) return null;
  const stop = Number.isFinite(sniper?.stop) ? sniper.stop : null;
  const target = Number.isFinite(sniper?.target2) ? sniper.target2 : null;
  const ma50 = Number.isFinite(row?.ma50) ? Number(row.ma50) : null;
  const pullbackLevel = (sniper?.gates?.trendBullish && ma50 != null && Number.isFinite(price) && ma50 < price) ? round2(ma50) : null;
  return {
    current: price,
    idealEntryLow: round2(pivot * 0.99),
    idealEntryHigh: round2(pivot * 1.03),
    aggressiveEntry: Number.isFinite(price) && price < pivot ? round2(price) : null,
    breakoutEntry: round2(pivot),
    pullbackLevel,
    invalidation: stop,
    target,
    rr: Number.isFinite(sniper?.rr) ? sniper.rr : null,
  };
}

function summarizeBuyPrice(priceToPay, verdict, sniper, aplusScore) {
  if (!priceToPay) return { label: "DATA UNAVAILABLE", reason: "No real pivot detected for this symbol." };
  const { current, idealEntryLow, idealEntryHigh, breakoutEntry, target, rr, aggressiveEntry, pullbackLevel } = priceToPay;
  const rrTxt = rr != null ? ` · ${rr.toFixed(1)}:1 reward/risk` : "";
  const targetTxt = target != null ? ` toward $${target}` : "";

  const trendWeak = sniper?.gates?.trendBullish === false;
  const scoreWeak = Number.isFinite(aplusScore) && aplusScore < 45;

  let result;
  if (verdict?.verdict === "AVOID") {
    result = { label: "NOT A BUY RIGHT NOW", ok: false, reason: verdict.reason };
  } else if (verdict?.verdict === "OVEREXTENDED") {
    result = { label: `WAIT FOR $${idealEntryLow} – $${idealEntryHigh}`, ok: false, reason: "Price already ran — buying here has poor reward/risk. Let it come back to the real buy zone first." };
  } else if (verdict?.verdict === "WAIT" && trendWeak && scoreWeak) {
    result = { label: "NO CLEAR SETUP YET", ok: false, reason: `Trend and quality aren't established (A+ ${aplusScore}/100) — a breakout level exists mathematically ($${breakoutEntry}), but there's no real edge to plan around yet. Revisit once the trend actually confirms.` };
  } else {
    const inZone = Number.isFinite(current) && current >= idealEntryLow && current <= breakoutEntry * 1.03;
    if (inZone && verdict?.verdict === "BUY ZONE") {
      result = { label: `$${current.toFixed(2)} (right now)`, ok: true, reason: `In the real buy zone${targetTxt}${rrTxt}.` };
    } else {
      result = { label: `$${idealEntryLow} – $${idealEntryHigh}`, ok: true, reason: `Real breakout buy zone (pivot $${breakoutEntry})${targetTxt}${rrTxt} — not there yet.` };
    }
  }

  if (result.ok !== false) {
    if (aggressiveEntry != null) {
      result.lowerOption = { label: `$${aggressiveEntry.toFixed(2)}`, reason: "Buy now, before the breakout confirms — cheaper, but no volume confirmation yet (more risk of a false start)." };
    } else if (pullbackLevel != null) {
      result.lowerOption = { label: `$${pullbackLevel}`, reason: "Real pullback level (50-day MA) in a confirmed uptrend — cheaper than the breakout zone if it pulls back here first." };
    }
  }

  return result;
}

function whyEvidence(sniper, aplus) {
  const sniperReasons = (sniper?.reasons || []).map((r) => (typeof r === "string" ? r : r?.text)).filter(Boolean);
  const list = [...sniperReasons, ...(aplus?.reasons || [])];
  return [...new Set(list)].slice(0, 8);
}

function computeTrimSignal(row, sniper, heat) {
  const target1 = Number.isFinite(sniper?.target1) ? sniper.target1 : null;
  const price = Number.isFinite(row?.price) ? row.price : null;
  if (target1 == null || price == null) return { label: "DATA UNAVAILABLE", reason: "No real target level to trim into yet." };

  if (heat?.state === "CLIMACTIC_DANGER") {
    return { label: "TRIM NOW", urgent: true, reason: `Real exhaustion signals present — take partial profits regardless of target: ${heat.reason}` };
  }
  if (price >= target1) {
    return { label: `PAST $${target1.toFixed(2)} — TRIM DUE`, urgent: true, reason: "Price has reached the first real target — the platform's own convention is scaling out 50% here, trailing the rest." };
  }
  const pctToTarget1 = ((target1 - price) / price) * 100;
  return { label: `$${target1.toFixed(2)} (+${pctToTarget1.toFixed(1)}% away)`, urgent: false, reason: "Real first scale-out level — not there yet." };
}

function computePremiumRead(futureValue) {
  if (!futureValue) return null;
  const growth = futureValue.growthScore;
  const zone = futureValue.fairValue?.zone;
  if (growth == null) return { verdict: "UNKNOWN", reason: "No real growth data to judge whether a premium is justified." };
  if (zone === "TOO_EXPENSIVE" && growth >= 65) {
    return { verdict: "MAYBE — GROWTH-JUSTIFIED, BUT PRICEY", reason: `Real durable growth (${growth}/100) can justify some premium, but the price is already above real analyst fair value — you'd be paying for growth that isn't guaranteed to keep compounding.` };
  }
  if (zone === "TOO_EXPENSIVE" && growth < 45) {
    return { verdict: "NO", reason: `Priced above real fair value with weak real growth (${growth}/100) to justify it — this isn't a "pay up for quality" situation.` };
  }
  if (zone === "IDEAL_BUY_ZONE" || zone === "ACCEPTABLE") {
    return { verdict: "N/A — NOT PRICED AT A PREMIUM", reason: "Real price is already at or below real analyst fair value — there's no premium to justify." };
  }
  return { verdict: "UNKNOWN", reason: "No real analyst price-target coverage to judge premium vs. fair value." };
}

// Mirrors market-helpers.js's MIN_WIN_SAMPLE = 10 (honest-null win-rate
// threshold) — a literal here rather than a require of the ESM file; see
// this file's header for the dual-port convention.
const MIN_WIN_SAMPLE = 10;

function verdictWinProbFor(track, verdict) {
  const cv = track?.cortexVerdict;
  if (!cv?.horizons || !verdict) return null;
  for (const h of ["d20", "d10", "d5", "d60"]) {
    const b = cv.horizons[h]?.buckets?.[verdict];
    if (b && b.count >= MIN_WIN_SAMPLE) return { winRate: b.winRate, avgReturnPct: b.avgReturnPct, count: b.count, horizon: h.slice(1), trackingStartedAt: cv.trackingStartedAt };
  }
  let best = null;
  for (const h of ["d20", "d10", "d5", "d60"]) {
    const b = cv.horizons[h]?.buckets?.[verdict];
    if (b && (!best || b.count > best.count)) best = { count: b.count, horizon: h.slice(1) };
  }
  return best ? { winRate: null, avgReturnPct: null, count: best.count, horizon: best.horizon, trackingStartedAt: cv.trackingStartedAt } : { winRate: null, avgReturnPct: null, count: 0, horizon: null, trackingStartedAt: cv.trackingStartedAt };
}

function computeBottomSignal(sniper, institutionScore, social) {
  const rev = sniper?.reversal;
  const dims = [];

  dims.push({
    name: "Technical",
    present: !!rev?.isBottom,
    detail: rev?.isBottom ? rev.verdict : (rev ? "No real technical bottom structure yet" : "Technical read unavailable"),
  });

  const flowBullish = institutionScore?.label === "Accumulation" || institutionScore?.label === "Aggressive Buying";
  dims.push({
    name: "Institutional flow (buyers stepping in)",
    present: flowBullish,
    detail: institutionScore ? `${institutionScore.label} (${institutionScore.score}/100)` : "Institutional flow data unavailable",
  });

  const bullPct = social?.stocktwits?.bullPct;
  const sentimentBullish = Number.isFinite(bullPct) && bullPct >= 55;
  dims.push({
    name: "Current sentiment",
    present: sentimentBullish,
    detail: Number.isFinite(bullPct) ? `${Math.round(bullPct)}% bullish on StockTwits right now` : "Sentiment data unavailable",
  });

  const agreeCount = dims.filter((d) => d.present).length;
  const label = agreeCount === 3 ? "STRONG BOTTOM SIGNAL"
    : agreeCount === 2 ? "PARTIAL BOTTOM SIGNAL"
    : agreeCount === 1 ? "WEAK BOTTOM SIGNAL"
    : "NO REAL BOTTOM SIGNAL YET";
  const color = agreeCount === 3 ? "#0d9465" : agreeCount === 2 ? "#5ab552" : agreeCount === 1 ? "#d6a312" : "#8a94a6";

  return { label, color, agreeCount, dims };
}

module.exports = {
  computeHeatRisk, computeCortexVerdict, computeTechnicalScore,
  computePriceToPay, summarizeBuyPrice, whyEvidence, computeTrimSignal, computePremiumRead,
  verdictWinProbFor, computeBottomSignal,
};
