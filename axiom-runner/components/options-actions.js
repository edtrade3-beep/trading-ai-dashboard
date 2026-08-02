// Unified calls-vs-puts directional vocabulary — options platform redesign
// (Phase 0, 2026-08-01). Distinct from ai-actions.js's AI_ACTIONS: that is a
// 9-tier *equity position-management* vocabulary (Strong Buy..Avoid, plus an
// EXIT/REDUCE/TAKE_PROFITS/WATCH subset for existing holdings). This module
// answers a different question — "should I buy calls, puts, or stay out" —
// with the 6-tier vocabulary the user's spec asked for.
//
// This app had 3 real, working, but fragmented calls-vs-puts implementations
// before this module: SmartScanTab.jsx's inline callScore/putScore card
// (~L1391-1476), TradePlannerTab.jsx's simpler EMA/RSI-only version
// (~L260-268), and /api/market/trade-signals' server-side classifier
// (src/routes/market.js ~L3676-3710) — the only one of the three that's
// genuinely IV-aware (it decides BUY CALLS vs SELL PUTS based on real IV
// level, not just direction). This module's `mapToOptionsAction` mirrors
// that function's own score/chgPct tier boundaries (68/85 for calls, 35/20
// for puts, 55/45 for watch) so it's a faithful port, not a new formula, and
// `optionsExecutionNote` extracts its IV-aware buy-vs-sell-premium sub-logic
// as a reusable pure function. SmartScanTab/TradePlannerTab's own cards
// become presentation-layer callers of this module in a later phase, not
// separate formulas — flag, don't silently reconcile, any case where this
// module's verdict disagrees with SmartScanTab's existing inline card for
// the same symbol.
export const OPTIONS_ACTIONS = {
  STRONG_CALL_BUY: { label: "Strong Call Buy", color: "#0d9465", tier: 6 },
  CALL_BUY:        { label: "Call Buy",        color: "#22a06b", tier: 5 },
  WATCH:           { label: "Watch",           color: "#94a3b8", tier: 4 },
  AVOID:           { label: "Avoid",           color: "#64748b", tier: 3 },
  PUT_BUY:         { label: "Put Buy",         color: "#c8282a", tier: 2 },
  STRONG_PUT_BUY:  { label: "Strong Put Buy",  color: "#8f1c1e", tier: 1 },
};

// `score` — a real 0-100 directional score on the same scale trade-signals
// and computeInstitutionalGrade already use. `chgPct` — real daily % change,
// used the same way trade-signals uses it (direction confirmation, not just
// the score alone). Zero new computation — every input is already real.
export function mapToOptionsAction({ score, chgPct = 0 } = {}) {
  const s = Number(score);
  if (!Number.isFinite(s)) return OPTIONS_ACTIONS.WATCH;

  if (s >= 68 && chgPct > 0) {
    return s >= 85 ? OPTIONS_ACTIONS.STRONG_CALL_BUY : OPTIONS_ACTIONS.CALL_BUY;
  }
  if (s <= 35 && chgPct < 0) {
    return s <= 20 ? OPTIONS_ACTIONS.STRONG_PUT_BUY : OPTIONS_ACTIONS.PUT_BUY;
  }
  if ((s >= 55 && chgPct > 0) || (s <= 45 && chgPct < 0)) return OPTIONS_ACTIONS.WATCH;
  return OPTIONS_ACTIONS.AVOID;
}

// Execution note — a direct extraction of the real IV-aware sub-decision
// already computed server-side in /api/market/trade-signals
// (src/routes/market.js ~L3685-3694): when IV is cheap, buy the option
// outright; when IV is rich, prefer selling premium instead. `ivProxy` must
// be a real computed IV read (trade-signals' own proxy, or a real chain IV);
// returns null rather than guessing when no real IV is available.
export function optionsExecutionNote({ ivProxy, direction } = {}) {
  const iv = Number(ivProxy);
  if (!Number.isFinite(iv)) return null;
  if (direction === "bullish") {
    if (iv < 40) return { strategy: "BUY CALLS", note: `IV ${iv} — options cheap` };
    if (iv > 65) return { strategy: "SELL PUTS", note: `IV ${iv} — sell puts to enter` };
    return { strategy: "CALLS or STOCK", note: `IV ${iv}` };
  }
  if (direction === "bearish") {
    if (iv < 40) return { strategy: "BUY PUTS", note: `IV ${iv} — puts cheap` };
    if (iv > 65) return { strategy: "SELL CALLS", note: `IV ${iv} — sell calls` };
    return { strategy: "PUTS or SHORT", note: `IV ${iv}` };
  }
  return null;
}
