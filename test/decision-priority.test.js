// Real tests for the canonical decision-priority ordering
// (src/decision-priority.js, 2026-08-21, Unified Trading System phase 7,
// spec §13). Pure-function, synthetic-input, zero-network — same
// discipline as test/entry-engine.test.js. Run: node
// test/decision-priority.test.js (or npm test).
const assert = require("node:assert");
const { DECISION_PRIORITY_ORDER, sortByPriority } = require("../src/decision-priority");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking DECISION_PRIORITY_ORDER matches the spec's own §13 ordering verbatim…");
ok("spec order: Market Regime -> Risk/Invalidation -> Market Structure -> Trend -> Entry Quality -> Momentum/Volume -> Relative Strength -> Fundamentals -> Options/Institutional Flow -> News/Catalyst", () => {
  assert.deepStrictEqual(DECISION_PRIORITY_ORDER, [
    "MARKET_REGIME", "RISK_INVALIDATION", "MARKET_STRUCTURE", "TREND",
    "ENTRY_QUALITY", "MOMENTUM_VOLUME", "RELATIVE_STRENGTH",
    "FUNDAMENTALS", "OPTIONS_FLOW", "NEWS_CATALYST",
  ]);
});

console.log("Checking sortByPriority…");
ok("reorders factors given in an arbitrary order into the canonical spec order", () => {
  const factors = [
    { key: "NEWS_CATALYST", label: "news" },
    { key: "TREND", label: "trend" },
    { key: "MARKET_REGIME", label: "regime" },
    { key: "OPTIONS_FLOW", label: "options" },
  ];
  const sorted = sortByPriority(factors).map((f) => f.key);
  assert.deepStrictEqual(sorted, ["MARKET_REGIME", "TREND", "OPTIONS_FLOW", "NEWS_CATALYST"]);
});
ok("an unrecognized key sinks to the end rather than throwing — honest 'unranked,' never a crash", () => {
  const factors = [
    { key: "SOME_CUSTOM_FACTOR", label: "custom" },
    { key: "MARKET_REGIME", label: "regime" },
  ];
  const sorted = sortByPriority(factors).map((f) => f.key);
  assert.deepStrictEqual(sorted, ["MARKET_REGIME", "SOME_CUSTOM_FACTOR"]);
});
ok("never mutates the input array", () => {
  const factors = [{ key: "TREND" }, { key: "MARKET_REGIME" }];
  const original = [...factors];
  sortByPriority(factors);
  assert.deepStrictEqual(factors, original);
});
ok("empty input -> empty output, no crash", () => {
  assert.deepStrictEqual(sortByPriority([]), []);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("DECISION-PRIORITY TEST FAILED"); else console.log("DECISION-PRIORITY TEST OK");
