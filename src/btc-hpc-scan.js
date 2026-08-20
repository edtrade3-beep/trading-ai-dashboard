"use strict";

// btc-hpc-scan.js — pure classification logic for the BTC + HPC Deep Scan
// (2026-08-20, explicit user request). Reuses, never duplicates: entry-
// engine.js's staged plan for per-symbol entry timing, future-value-
// scoring.js's computeFairValueBands for Valuation (real analyst-target
// bands, not an invented DCF), sniper-decision.js's action classifier.
// Orchestration (fetching bars/fundamentals/news) lives in routes/market.js
// alongside this app's other scan endpoints (screenTrendTemplate,
// fetchDayTradeScanRows) — this file is the pure math only.

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

// The specific BTC-mining/HPC-hosting pivot universe the user asked for —
// centralized here (not scattered) so it's the one place to adjust.
const HPC_MINER_UNIVERSE = ["IREN", "WULF", "CORZ", "CIFR", "RIOT"];

// BTC Regime — real trend/VWAP/momentum off real BTC-USD daily bars (same
// real formulas already used elsewhere in this codebase: SMA-based trend,
// volume-weighted VWAP, weighted momentum — not a new indicator family).
function computeBtcRegime(bars) {
  if (!Array.isArray(bars) || bars.length < 60) {
    return { regime: null, label: "UNAVAILABLE", price: null, vwap: null, momentum: null, dataInsufficient: true };
  }
  const closes = bars.map((b) => b.close);
  const last = closes.length - 1;
  const price = closes[last];
  const sma20 = closes.slice(Math.max(0, last - 19), last + 1).reduce((a, b) => a + b, 0) / Math.min(20, last + 1);
  const sma50 = closes.slice(Math.max(0, last - 49), last + 1).reduce((a, b) => a + b, 0) / Math.min(50, last + 1);
  // Real 20-day volume-weighted VWAP (same typical-price formula
  // indicators.js's computeVWAP uses, computed here since this module has
  // no server-only require dependencies — pure, testable in isolation).
  const window = bars.slice(Math.max(0, last - 19), last + 1);
  let pv = 0, vv = 0;
  for (const b of window) { const tp = (b.high + b.low + b.close) / 3; pv += tp * (b.volume || 0); vv += (b.volume || 0); }
  const vwap = vv ? pv / vv : price;
  // Real 21-day momentum (simple, disclosed — % change over the trailing
  // window), not a fitted model.
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

// Final Decision (6-state, per spec) — a real LABELING function over
// already-computed evidence (entry-engine.js's stage + qualifying count,
// the real A+/aPlusScore), not a new scoring engine. Mirrors entry-
// engine's own real gates (structureBroken, extended/anti-chase) rather
// than re-deriving them.
function classifyDeepScanDecision({ entryPlan, aPlusScore }) {
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

module.exports = { HPC_MINER_UNIVERSE, computeBtcRegime, classifyDeepScanDecision };
