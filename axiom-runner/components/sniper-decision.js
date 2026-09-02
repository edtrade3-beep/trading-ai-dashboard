// AI Sniper Decision Engine — explicit user spec (2026-08-10): "the primary
// problem is information overload and contradictory signals ... there must
// be exactly ONE FINAL ACTION." This is a genuinely new decision LAYER, not
// a new competing quality opinion: it composes real fields this app already
// computes (Minervini passCount/stage from buildTrendTemplate, entry-zone/
// volume/extension flags from the VCP setup engine, the same entry/stop/
// target2 math TradeSetupPanel and Scanner's own R:R column already use)
// into ONE hard-gated ENTRY TIMING verdict. Always render this under its
// own "AI SNIPER ACTION" heading (see SniperDecisionModal.jsx) so it never
// reads as a second, unlabeled disagreement with ai-actions.js's unified
// AI_ACTIONS quality verdict shown elsewhere — that answers "is this a good
// business/setup", this answers "should I press the button right now."
//
// Long-only guardrail (already established elsewhere in this app — equity
// shorts aren't offered, only puts, per RhProScanner.jsx's own comment).
// ENTER SHORT is intentionally not a state here; a bearish setup surfaces
// as AVOID, same as everywhere else long-only in this app.
//
// R:R note: this app's real target2 is ALWAYS entry + 2*(entry-stop) by
// construction (src/routes/market.js), so real R:R to target2 is always
// exactly 2.0 for every setup — it does not vary per stock the way a truly
// dynamic R:R would. It's shown here as real, useful context (this
// platform's fixed target ladder), but is NOT used as a hard gate, since a
// constant value can never fail one.
import { computeReversalDetector } from "./market-helpers.js";

export const SNIPER_TIMING = {
  ENTER_LONG: { label: "Enter Long", color: "#0d9465", icon: "🟢" },
  WAIT:       { label: "Wait",       color: "#d6a312", icon: "🟡" },
  NO_CHASE:   { label: "No Chase",   color: "#f97316", icon: "🟠" },
  AVOID:      { label: "Avoid",      color: "#c8282a", icon: "🔴" },
};

function round2(n) { return Math.round(n * 100) / 100; }

export function computeSniperDecision(row) {
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
  const target1 = hasEntryMath ? round2(entry + (entry - stop)) : null; // 1R scale-out — same formula TrendSetupPanel.jsx uses
  const rr = (hasEntryMath && Number.isFinite(target2)) ? round2((target2 - entry) / (entry - stop)) : null;

  // Early get-in / get-out read — explicit user request (2026-08-10, "add
  // when to get out before stock goes down and get in before stock goes
  // up"). Reuses the exact same real Reversal Detector RhProScanner's row-
  // expansion and the Chart page already show (computeReversalDetector,
  // market-helpers.js) — real 52-week-range/RSI/volume-climax/MA-distance
  // signals, not a new model. isTop ("early get-out zone") is treated as a
  // genuine gate below, same weight as "extended" — you shouldn't enter a
  // likely top even if the trend/trigger otherwise line up. isBottom
  // ("early get-in zone") is deliberately NOT allowed to override a weak-
  // trend AVOID/WAIT into an entry — catching a reversal before the trend
  // actually confirms is real, higher-risk speculation, not a hard-gated
  // "enter now" call; it's surfaced as a watch flag instead (see
  // SniperDecisionModal.jsx).
  const reversal = computeReversalDetector({
    price, hi52: row?.hi52, lo52: row?.lo52, rsi: row?.rsi,
    rvol: volRatio, dayChangePct: row?.dayChangePct, weekChangePct: row?.weekChangePct, ma50: row?.ma50,
  });

  // ── QUALITY gate — "is this a good stock to even be looking at" ──
  const stage4 = stage.includes("4");
  const trendBullish = passCount >= 6 && stage.includes("2");

  // ── TIMING gates — "is right now a good moment to press the button" ──
  const aboveVwap = Number.isFinite(vwap20) && Number.isFinite(price) ? price >= vwap20 : null;
  const volumeConfirmed = Number.isFinite(volRatio) && volRatio >= 1.4;
  const momentumConfirmed = Number.isFinite(rsRating) && rsRating >= 70;
  // CRITICAL, per the spec: "NEVER show ENTER LONG if the entry trigger has
  // not actually occurred." row.atBuyPoint (screenTrendTemplate) means "in
  // the buy zone, not yet extended" — it does NOT require price to have
  // actually closed above the pivot, so a stock sitting just below its
  // pivot with everything else lined up still has atBuyPoint=true. The
  // field that means "the trigger already happened" is breakoutConfirmed
  // (real close above pivot on volume — same field the raw GO/WAIT/AVOID
  // verdict's "Breakout above pivot on volume" branch checks). Using
  // atBuyPoint here was a real bug caught in testing (VRTX: atBuyPoint=true,
  // breakoutConfirmed=false, price 1.8% BELOW the pivot — would have shown
  // ENTER LONG on an untriggered setup).
  const triggerConfirmed = !!(row?.breakoutConfirmed && row?.volConfirmed);
  const extended = !!row?.extended;
  const reversalTopRisk = !!reversal?.isTop;

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
    // Same weight as "extended" — real early get-out signs (near the 52w
    // high, overbought RSI, climax volume, or a parabolic run cooling off)
    // override an otherwise-clean breakout. You shouldn't press ENTER LONG
    // into a stock that's already flashing exhaustion signs.
    action = "NO_CHASE";
    reason = `${reversal.verdict} — ${reversal.sigs.map(s => s.txt).join(", ")}.`;
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

// Client twin of src/sniper-decision.js's shared row adapter.
export function computeReversalTopRisk(row) {
  const reversal = computeReversalDetector({
    price: row?.price, hi52: row?.hi52, lo52: row?.lo52, rsi: row?.rsi,
    rvol: row?.volRatio, dayChangePct: row?.dayChangePct,
    weekChangePct: row?.weekChangePct, ma50: row?.ma50,
  });
  return !!reversal?.isTop;
}
