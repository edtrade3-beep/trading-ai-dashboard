"use strict";

// decision-priority.js — the ONE canonical priority ordering (Unified
// Trading System spec §13, 2026-08-21): "Market Regime -> Risk/
// Invalidation -> Market Structure -> Trend -> Entry Quality ->
// Momentum/Volume -> Relative Strength -> Fundamentals -> Options/
// Institutional Flow -> News/Catalyst." When more than one real factor
// needs explaining together (e.g. simple-decision.js's WAIT reason, which
// real conditions are missing), this is the one place that order is
// defined — not an ad-hoc push-order baked separately into each caller,
// which is exactly how simple-decision.js's own "missing" list drifted
// out of sync with this ordering before this file existed (it listed
// Trend before Market Structure; the spec's order is the reverse).
//
// Pure, dependency-free — same hand-ported-twin discipline as
// entry-engine.js/simple-decision.js. Keep in sync with
// axiom-runner/components/decision-priority.js.

const DECISION_PRIORITY_ORDER = [
  "MARKET_REGIME",
  "RISK_INVALIDATION",
  "MARKET_STRUCTURE",
  "TREND",
  "ENTRY_QUALITY",
  "MOMENTUM_VOLUME",
  "RELATIVE_STRENGTH",
  "FUNDAMENTALS",
  "OPTIONS_FLOW",
  "NEWS_CATALYST",
];

const PRIORITY_RANK = Object.fromEntries(DECISION_PRIORITY_ORDER.map((key, i) => [key, i]));

// factors: array of objects carrying a `key` from DECISION_PRIORITY_ORDER
// (any other shape is preserved untouched). A key this module doesn't
// recognize sinks to the end rather than throwing — an honest "unranked,"
// never a crash on a caller's own custom factor.
function sortByPriority(factors) {
  return [...factors].sort((a, b) => {
    const ra = PRIORITY_RANK[a?.key] ?? Infinity;
    const rb = PRIORITY_RANK[b?.key] ?? Infinity;
    return ra - rb;
  });
}

module.exports = { DECISION_PRIORITY_ORDER, sortByPriority };
