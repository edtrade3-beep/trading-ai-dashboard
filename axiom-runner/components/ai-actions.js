// Unified AI Actions vocabulary — institutional redesign (2026-07-29,
// explicit user spec: "Replace generic Buy/Sell signals with AI Actions").
//
// This app had accumulated ~7 independently-defined Buy/Sell/Watch enums
// across RhProScanner/AdvisorAiTab/GreenLightTab/TerminalWorkspace/
// SmartScanTab/RealityCheckWidget/DayTradeTab, several with real semantic
// overlap (three separate GO/WAIT/AVOID-style enums, three separate
// BUY/WATCH/AVOID-style enums). This module is the one shared source of
// truth going forward — `mapToAiAction` reduces the app's existing real
// verdict/score outputs to one of the 9 labels below rather than each
// screen inventing its own mapping. Modeled on AdvisorAiTab.jsx's
// `ACTION_META` shape (closest existing match to the requested vocabulary).
//
// Color follows the app's 4-color status system (green=bullish,
// yellow=caution, red=bearish, gray=neutral) — tier is a 1-9 ordinal for
// sorting by conviction (9 = most bullish new-entry call, 1 = most bearish).
// ROTATE (Green Light AI spec gap, 2026-08-03) — a real position-management
// verdict for an existing holding that's the weakest link in the real
// Portfolio Rotation Engine's comparison (portfolio-rotation-engine.js's
// evaluateRotation/findWeakestPosition), closed only because a genuinely
// stronger real opportunity exists — never a plain sell signal on its own
// merit. Tier 2.5, between Exit and Take Profits — a rotation is closer to
// "this position isn't wrong, something else is just better right now"
// than an outright Exit.
export const AI_ACTIONS = {
  STRONG_BUY:   { label: "Strong Buy",   color: "#0d9465", tier: 9 },
  BUY:          { label: "Buy",          color: "#22a06b", tier: 8 },
  ACCUMULATE:   { label: "Accumulate",   color: "#22a06b", tier: 7 },
  WATCH:        { label: "Watch",        color: "#94a3b8", tier: 6 },
  WAIT:         { label: "Wait",         color: "#d6a312", tier: 5 },
  REDUCE:       { label: "Reduce",       color: "#d6a312", tier: 4 },
  TAKE_PROFITS: { label: "Take Profits", color: "#d6a312", tier: 3 },
  ROTATE:       { label: "Rotate",       color: "#6d5dd3", tier: 2.5 },
  EXIT:         { label: "Exit",         color: "#c8282a", tier: 2 },
  AVOID:        { label: "Avoid",        color: "#c8282a", tier: 1 },
};

// Reduces the app's existing real outputs to one AI_ACTIONS entry —
// zero new computation, this only relabels numbers/verdicts that already
// exist elsewhere in the app (institutionalRecommendation's own score
// bands, computeNextAction's verdict, TrendSetupPanel/su.verdict's
// GO/WAIT/AVOID, or an existing-position management verdict).
//
// `positionState` is for EXISTING holdings only (e.g. RealityCheckWidget's
// EXIT/REDUCE/TIGHTEN STOP/WATCH CLOSELY/HOLD) — deliberately restricted to
// the EXIT/REDUCE/TAKE_PROFITS/WATCH subset, since "Strong Buy"/"Accumulate"
// don't make sense as a verdict about a position you already own.
export function mapToAiAction({ institutionalScore, verdict, nextAction, positionState } = {}) {
  if (positionState) {
    const p = String(positionState).toUpperCase();
    if (p.includes("ROTATE")) return AI_ACTIONS.ROTATE;
    if (p.includes("EXIT")) return AI_ACTIONS.EXIT;
    if (p.includes("REDUCE") || p.includes("TIGHTEN")) return AI_ACTIONS.REDUCE;
    if (p.includes("TAKE PROFIT") || p.includes("TAKE_PROFIT")) return AI_ACTIONS.TAKE_PROFITS;
    if (p.includes("WATCH") || p.includes("HOLD")) return AI_ACTIONS.WATCH;
  }

  const v = verdict ? String(verdict).toUpperCase() : null;
  const na = nextAction ? String(nextAction).toUpperCase() : null;

  if (v === "AVOID" || na === "AVOID") return AI_ACTIONS.AVOID;
  if (na === "BUY") return AI_ACTIONS.BUY;
  if (na === "BREAKOUT" || na === "WATCH") return AI_ACTIONS.WATCH;
  if (na === "WAIT" || v === "WAIT") return AI_ACTIONS.WAIT;

  // Fall back to the real Institutional Grade score, reusing
  // institutionalRecommendation's own 85/70/45/25 thresholds
  // (market-helpers.js) with two extra labels slotted at natural
  // subdivisions of that same scale (Accumulate between Hold and Buy,
  // Reduce splitting the old Sell band) rather than new boundaries.
  const s = Number(institutionalScore);
  if (Number.isFinite(s)) {
    if (s >= 85) return AI_ACTIONS.STRONG_BUY;
    if (s >= 70) return AI_ACTIONS.BUY;
    if (s >= 55) return AI_ACTIONS.ACCUMULATE;
    if (s >= 45) return AI_ACTIONS.WATCH;
    if (s >= 25) return AI_ACTIONS.REDUCE;
    return AI_ACTIONS.AVOID;
  }
  return AI_ACTIONS.WATCH;
}
