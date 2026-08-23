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
// Expanded 2026-08-20 (explicit user feedback, "not enough stocks") from
// the original 5 to the broader real BTC-mining/HPC-hosting pivot
// universe — MARA/CLSK/HUT/BITF/HIVE are established BTC miners with the
// same real AI/HPC-hosting pivot story as the original 5; APLD/BTBT round
// out the real, liquid names in this exact space. All real, listed
// tickers — not a padded or invented list.
const HPC_MINER_UNIVERSE = ["IREN", "WULF", "CORZ", "CIFR", "RIOT", "MARA", "CLSK", "HUT", "BITF", "HIVE", "APLD", "BTBT"];

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

// classifyDeepScanDecision (the Final Decision label this file used to
// export) was retired One Engine Migration Phase 6 (2026-08-23) — its
// real consumers (routes/market.js's btc-hpc-scan/btc-hpc-deep routes,
// the withDecision=1 trend-screen enrichment, and 5 alert files) all now
// call am-core-engine.js's classifyCoreVerdict directly instead, the same
// verdict engine driving the Workspace Decision banner and Scanner grade.
module.exports = { HPC_MINER_UNIVERSE, computeBtcRegime };
