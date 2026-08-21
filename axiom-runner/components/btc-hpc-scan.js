// btc-hpc-scan.js — client-side twin of src/btc-hpc-scan.js. Pure,
// dependency-free math, hand-ported here rather than fetched — same
// "small, stable, kept in sync via this header comment" discipline as
// entry-engine.js's own client twin. KEEP IN SYNC: any formula change
// goes in both files.
//
// classifyDeepScanDecision started as the BTC+HPC Deep Scan's Final
// Decision label (2026-08-20) and is now also reused by SmartScanTab.jsx's
// deep-dive verdict (2026-08-20, "ONE ENGINE" unification) — the same
// real labeling function over entry-engine.js's staged plan, not a
// second one per screen.

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

export const HPC_MINER_UNIVERSE = ["IREN", "WULF", "CORZ", "CIFR", "RIOT", "MARA", "CLSK", "HUT", "BITF", "HIVE", "APLD", "BTBT"];

export function computeBtcRegime(bars) {
  if (!Array.isArray(bars) || bars.length < 60) {
    return { regime: null, label: "UNAVAILABLE", price: null, vwap: null, momentum: null, dataInsufficient: true };
  }
  const closes = bars.map((b) => b.close);
  const last = closes.length - 1;
  const price = closes[last];
  const sma20 = closes.slice(Math.max(0, last - 19), last + 1).reduce((a, b) => a + b, 0) / Math.min(20, last + 1);
  const sma50 = closes.slice(Math.max(0, last - 49), last + 1).reduce((a, b) => a + b, 0) / Math.min(50, last + 1);
  const window = bars.slice(Math.max(0, last - 19), last + 1);
  let pv = 0, vv = 0;
  for (const b of window) { const tp = (b.high + b.low + b.close) / 3; pv += tp * (b.volume || 0); vv += (b.volume || 0); }
  const vwap = vv ? pv / vv : price;
  const momBase = closes[Math.max(0, last - 21)];
  const momentum = momBase ? round2(((price - momBase) / momBase) * 100) : null;

  let regime, label;
  if (price > sma20 && sma20 > sma50 && Number.isFinite(momentum) && momentum > 0) { regime = "BULLISH"; label = "BULLISH"; }
  else if (price < sma20 && sma20 < sma50 && Number.isFinite(momentum) && momentum < 0) { regime = "BEARISH"; label = "BEARISH"; }
  else { regime = "NEUTRAL"; label = "NEUTRAL"; }

  return {
    regime, label, price: round2(price), sma20: round2(sma20), sma50: round2(sma50),
    vwap: round2(vwap), aboveVwap: price >= vwap, momentum, dataInsufficient: false,
  };
}

export function classifyDeepScanDecision({ entryPlan, aPlusScore }) {
  if (!entryPlan) return { decision: "WAIT", icon: "🟡", color: "#d6a312", reason: "Not enough real data yet." };
  const stage = entryPlan.stage;
  const strongQuality = Number.isFinite(aPlusScore) && aPlusScore >= 70;

  if (stage === "STRUCTURE_BROKEN") return { decision: "AVOID", icon: "🔴", color: "#c8282a", reason: "4H structure broken." };
  if (stage === "FAILED_BREAKOUT") return { decision: "AVOID", icon: "🔴", color: "#c8282a", reason: "Breakout failed." };
  if (stage === "BREAKOUT" && entryPlan.entryPrice == null) return { decision: "EXTENDED", icon: "🟠", color: "#e08a1e", reason: "Breakout confirmed but extended — do not chase." };
  if (stage === "BREAKOUT" && entryPlan.entryPrice != null) return { decision: "BUY", icon: "🟢", color: "#0d9465", reason: "Breakout confirmed on volume." };
  if (stage === "RETEST" && entryPlan.entryPrice != null) return { decision: "PULLBACK_BUY", icon: "🟡", color: "#d6a312", reason: "Retest holding — former resistance now support." };
  if (stage === "CONFIRMATION" && entryPlan.entryPrice != null) return { decision: "BUY", icon: "🟢", color: "#0d9465", reason: "Structure confirming as price approaches the pivot." };
  if (stage === "EARLY" && entryPlan.entryPrice != null && strongQuality) return { decision: "A_PLUS_EARLY_BUY", icon: "🟢", color: "#0d9465", reason: "Real qualifying evidence + strong quality, before the pivot." };
  if (stage === "EARLY" && entryPlan.entryPrice != null) return { decision: "PULLBACK_BUY", icon: "🟡", color: "#d6a312", reason: "Developing, not yet fully confirmed." };
  return { decision: "WAIT", icon: "🟡", color: "#d6a312", reason: entryPlan.recommendedAction || "Not enough real evidence yet." };
}

// Real, human-readable labels for classifyDeepScanDecision's decision key
// — centralized so every consumer (BtcHpcScanCard.jsx, SmartScanTab.jsx)
// shows the EXACT SAME words for the exact same decision (the whole point
// of "ONE ENGINE" — Smart Scan's own prior wording, e.g. "A+ LONG"/
// "NEUTRAL", is retired in favor of this one real vocabulary).
export const DECISION_LABELS = {
  A_PLUS_EARLY_BUY: "A+ EARLY BUY", BUY: "BUY", PULLBACK_BUY: "PULLBACK BUY",
  WAIT: "WAIT", EXTENDED: "EXTENDED — DON'T CHASE", AVOID: "AVOID",
};
