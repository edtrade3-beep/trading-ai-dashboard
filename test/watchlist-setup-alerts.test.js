// Real tests for watchlist-setup-alerts.js (2026-08-23, Master Build Spec
// phase 5) — migrated off the pre-unification computeAPlusScore threshold
// + raw atBuyPoint flag onto the real unified pipeline (computeEntryPlan +
// classifyDeepScanDecision + computeRedFlags). Pure-function,
// synthetic-input, zero-network — same discipline as
// test/entry-engine.test.js. Run: node test/watchlist-setup-alerts.test.js
// (or npm test).
const assert = require("node:assert");
const { buildEvFromRow, shouldAlert } = require("../src/watchlist-setup-alerts");
const { computeEntryPlan } = require("../src/entry-engine");
const { computeRedFlags } = require("../src/red-flag-engine");
const { classifyDeepScanDecision } = require("../src/btc-hpc-scan");
const { regimeToEntryVocabulary } = require("../src/trade-planner-scoring");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const CLEAN_ROW = {
  stage: "Stage 2 — Confirmed Uptrend", passCount: 7, entry: 100, stop: 95, price: 99, pivot: 100,
  abovePivotPct: -1, rsRating: 80, higherLows: true, tightening: true, vcpVerdict: "WATCHLIST",
  technicals: { vwap20: 95 }, breakoutConfirmed: false, extended: false, riskPct: 5,
  dollarVolume: 50_000_000, contractionLow: 90, target2: 110, // real 2R target (entry + 2*(entry-stop))
};

console.log("Checking buildEvFromRow — the real ev mapping for computeEntryPlan/computeRedFlags…");
ok("real 2R target2 produces a real, correct R:R (regression guard for a bug found during this phase)", () => {
  const ev = buildEvFromRow(CLEAN_ROW, "RISK_ON");
  assert.strictEqual(ev.rr, 2, "rr must be computed off row.target2 (the real 2R field), not a synthetic always-1.0 formula");
});
ok("target1 stays a real 1R conservative level, same convention as routes/market.js's other real target1 fields", () => {
  const ev = buildEvFromRow(CLEAN_ROW, "RISK_ON");
  assert.strictEqual(ev.target1, 105); // 100 + (100-95)
});
ok("dailyBias derives from stage/passCount — Stage 2 + passCount>=6 -> BULLISH", () => {
  const ev = buildEvFromRow(CLEAN_ROW, "RISK_ON");
  assert.strictEqual(ev.dailyBias, "BULLISH");
});
ok("Stage 4 -> BEARISH regardless of passCount", () => {
  const ev = buildEvFromRow({ ...CLEAN_ROW, stage: "Stage 4 — Decline", passCount: 2 }, "RISK_ON");
  assert.strictEqual(ev.dailyBias, "BEARISH");
});
ok("real riskPct/dollarVolume pass through unchanged for the Red Flag Engine", () => {
  const ev = buildEvFromRow(CLEAN_ROW, "RISK_ON");
  assert.strictEqual(ev.riskPct, 5);
  assert.strictEqual(ev.dollarVolume, 50_000_000);
});
ok("swing4hState/volTrend1h are honestly absent (undefined) — no MTF data at this scan tier, never fabricated", () => {
  const ev = buildEvFromRow(CLEAN_ROW, "RISK_ON");
  assert.strictEqual(ev.swing4hState, undefined);
  assert.strictEqual(ev.volTrend1h, undefined);
});

console.log("Checking the real end-to-end pipeline on a clean, qualifying setup…");
ok("a genuinely strong setup reaches an actionable BUY-family decision with zero critical red flags", () => {
  const ev = buildEvFromRow(CLEAN_ROW, "RISK_ON");
  const entryPlan = computeEntryPlan(ev);
  const redFlags = computeRedFlags(ev);
  const deep = classifyDeepScanDecision({ entryPlan, aPlusScore: 80 });
  assert.ok(["BUY", "A_PLUS_EARLY_BUY", "PULLBACK_BUY"].includes(deep.decision), `expected an actionable decision, got ${deep.decision}`);
  assert.strictEqual(redFlags.criticalCount, 0);
});
ok("a real critical red flag (e.g. poor R:R) survives into the pipeline even when the stage looks actionable", () => {
  const poorRR = { ...CLEAN_ROW, target2: 101 }; // rr = (101-100)/5 = 0.2, well below 1.5
  const ev = buildEvFromRow(poorRR, "RISK_ON");
  const redFlags = computeRedFlags(ev);
  assert.ok(redFlags.criticalFlags.some((f) => f.key === "unacceptableRR"));
});

console.log("Checking shouldAlert — the real alert-transition gate…");
ok("first-seen-per-symbol (no last state) never alerts — seeds silently", () => {
  assert.strictEqual(shouldAlert(null, "BUY", 0), false);
});
ok("transitioning from a non-actionable to an actionable decision, zero critical flags -> alerts", () => {
  assert.strictEqual(shouldAlert("WAIT", "BUY", 0), true);
  assert.strictEqual(shouldAlert("EXTENDED", "A_PLUS_EARLY_BUY", 0), true);
  assert.strictEqual(shouldAlert("AVOID", "PULLBACK_BUY", 0), true);
});
ok("already in an actionable state -> does not re-alert (no duplicate spam)", () => {
  assert.strictEqual(shouldAlert("BUY", "BUY", 0), false);
  assert.strictEqual(shouldAlert("PULLBACK_BUY", "A_PLUS_EARLY_BUY", 0), false);
});
ok("a real critical red flag suppresses the alert even on a genuine actionable transition — spec §8-9's own core rule, never hidden by a good decision", () => {
  assert.strictEqual(shouldAlert("WAIT", "BUY", 1), false);
});
ok("staying non-actionable never alerts", () => {
  assert.strictEqual(shouldAlert("WAIT", "AVOID", 0), false);
  assert.strictEqual(shouldAlert("EXTENDED", "WAIT", 0), false);
});

console.log("Checking regimeToEntryVocabulary (trade-planner-scoring.js, Master Build Spec phase 5)…");
ok("RED -> RISK_OFF", () => { assert.strictEqual(regimeToEntryVocabulary("RED"), "RISK_OFF"); });
ok("GREEN -> RISK_ON", () => { assert.strictEqual(regimeToEntryVocabulary("GREEN"), "RISK_ON"); });
ok("YELLOW -> NEUTRAL", () => { assert.strictEqual(regimeToEntryVocabulary("YELLOW"), "NEUTRAL"); });
ok("ORANGE -> NEUTRAL", () => { assert.strictEqual(regimeToEntryVocabulary("ORANGE"), "NEUTRAL"); });

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("WATCHLIST-SETUP-ALERTS TEST FAILED"); else console.log("WATCHLIST-SETUP-ALERTS TEST OK");
