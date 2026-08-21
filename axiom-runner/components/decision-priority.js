// decision-priority.js — client-side twin of src/decision-priority.js.
// Pure, dependency-free — hand-ported here rather than fetched, same
// discipline as entry-engine.js/simple-decision.js's own client twins.
// KEEP IN SYNC: any ordering change goes in both files. See
// src/decision-priority.js for the full design rationale (spec §13).

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

function sortByPriority(factors) {
  return [...factors].sort((a, b) => {
    const ra = PRIORITY_RANK[a?.key] ?? Infinity;
    const rb = PRIORITY_RANK[b?.key] ?? Infinity;
    return ra - rb;
  });
}

export { DECISION_PRIORITY_ORDER, sortByPriority };
