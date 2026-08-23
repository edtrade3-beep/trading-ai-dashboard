// Real tests for market-auto-watchlist.js (2026-08-23, Legacy Verdict
// System migration) — migrated the GO/WATCH Telegram-announcement label off
// row.verdict/row.atBuyPoint (_buildTrendTemplate's own pre-unification
// formula) onto the real unified pipeline (buildEvFromRow ->
// computeEntryPlan -> computeRedFlags -> classifyDeepScanDecision), same
// pattern already proven for watchlist-setup-alerts.js/
// best-opportunities-alerts.js. isCandidate (the real symbol-gets-added
// gate) is untouched — this only re-derives the GO-vs-WATCH label.
// Pure-function, synthetic-input, zero-network. Run:
// node test/market-auto-watchlist.test.js (or npm test).
const assert = require("node:assert");
const { isUnifiedGo, isCandidate } = require("../src/market-auto-watchlist");
const { buildEvFromRow, ACTIONABLE_DECISIONS } = require("../src/watchlist-setup-alerts");
const { computeEntryPlan } = require("../src/entry-engine");
const { computeRedFlags } = require("../src/red-flag-engine");
const { classifyDeepScanDecision } = require("../src/btc-hpc-scan");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking isCandidate — the real, unchanged addition gate…");
ok("a valid stop + passCount>=6 + not extended qualifies", () => {
  assert.strictEqual(isCandidate({ entry: 100, stop: 95, passCount: 7, extended: false }), true);
});
ok("passCount below 6 does not qualify", () => {
  assert.strictEqual(isCandidate({ entry: 100, stop: 95, passCount: 5, extended: false }), false);
});
ok("extended does not qualify", () => {
  assert.strictEqual(isCandidate({ entry: 100, stop: 95, passCount: 7, extended: true }), false);
});
ok("invalid stop (entry <= stop) does not qualify", () => {
  assert.strictEqual(isCandidate({ entry: 90, stop: 95, passCount: 7, extended: false }), false);
});
ok("a row-level error never qualifies", () => {
  assert.strictEqual(isCandidate({ error: "failed", entry: 100, stop: 95, passCount: 7, extended: false }), false);
});

console.log("\nChecking isUnifiedGo — the real unified-pipeline GO label (pure)…");
ok("an actionable BUY-family decision with zero critical flags is GO", () => {
  assert.strictEqual(isUnifiedGo("BUY", 0), true);
});
ok("A_PLUS_EARLY_BUY / PULLBACK_BUY are also GO, matching ACTIONABLE_DECISIONS", () => {
  assert.strictEqual(isUnifiedGo("A_PLUS_EARLY_BUY", 0), true);
  assert.strictEqual(isUnifiedGo("PULLBACK_BUY", 0), true);
});
ok("an actionable decision with any critical red flag is NOT GO — a critical flag overrides a high score, never hidden", () => {
  assert.strictEqual(isUnifiedGo("BUY", 1), false);
});
ok("a non-actionable decision (AVOID/EXTENDED/WAIT) is never GO, even with zero critical flags", () => {
  assert.strictEqual(isUnifiedGo("AVOID", 0), false);
  assert.strictEqual(isUnifiedGo("EXTENDED", 0), false);
  assert.strictEqual(isUnifiedGo("WAIT", 0), false);
});

console.log("\nChecking the real end-to-end pipeline on a clean, qualifying setup produces GO…");
ok("a genuinely strong setup reaches isUnifiedGo === true through the real pipeline", () => {
  const row = {
    stage: "Stage 2 — Confirmed Uptrend", passCount: 7, entry: 100, stop: 95, price: 99, pivot: 100,
    abovePivotPct: -1, rsRating: 80, higherLows: true, tightening: true, vcpVerdict: "WATCHLIST",
    technicals: { vwap20: 95 }, breakoutConfirmed: false, extended: false, riskPct: 5,
    dollarVolume: 50_000_000, contractionLow: 90, target2: 110,
  };
  const ev = buildEvFromRow(row, "RISK_ON");
  const entryPlan = computeEntryPlan(ev);
  const redFlags = computeRedFlags(ev);
  const deep = classifyDeepScanDecision({ entryPlan, aPlusScore: 80 });
  assert.ok(ACTIONABLE_DECISIONS.has(deep.decision), `expected an actionable decision, got ${deep.decision}`);
  assert.strictEqual(isUnifiedGo(deep.decision, redFlags.criticalCount), true);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("MARKET-AUTO-WATCHLIST TEST FAILED"); else console.log("MARKET-AUTO-WATCHLIST TEST OK");
