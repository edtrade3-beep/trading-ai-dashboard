// btc-hpc-scan.js — client-side twin of src/btc-hpc-scan.js. Pure,
// dependency-free math, hand-ported here rather than fetched — same
// "small, stable, kept in sync via this header comment" discipline as
// entry-engine.js's own client twin. KEEP IN SYNC: any formula change
// goes in both files.
//
// classifyDeepScanDecision (One Engine Migration Phase 6, 2026-08-23):
// retired here too — was the BTC+HPC Deep Scan's Final Decision label,
// also reused by SmartScanTab.jsx's deep-dive verdict, and by the server
// twin's own real consumers (all migrated this same phase). Both now
// import computeCoreScore/classifyCoreVerdict/CORE_VERDICT_META from
// ./am-core-engine.js directly — the same real verdict engine driving the
// Workspace Decision banner and Scanner grade, so this screen can no
// longer disagree with those.

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

// Real, human-readable labels for classifyCoreVerdict's verdict key —
// centralized so every consumer (BtcHpcScanCard.jsx, SmartScanTab.jsx)
// shows the EXACT SAME words for the exact same verdict. One Engine
// Migration Phase 6: mirrors am-core-engine.js's CORE_VERDICT_META.label
// (kept as a separate flat map here since existing callers index by
// plain string, not the {icon,label,color} object).
export const DECISION_LABELS = {
  EARLY_BUY: "EARLY BUY", BUY: "BUY", WATCH: "WATCH", WAIT: "WAIT",
  AVOID_LONG: "AVOID", HOLD: "HOLD", TAKE_PROFIT: "TAKE PROFIT", EXIT: "EXIT",
};
