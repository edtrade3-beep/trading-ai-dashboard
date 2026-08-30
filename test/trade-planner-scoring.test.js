// Real tests for src/trade-planner-scoring.js's computeAPlusScore and
// computeNextAction — previously ZERO test coverage (confirmed before
// writing this). Covers the 2026-08-26 "Trade Desk Tier 3a" bug fix:
// neither function had any real awareness of Stage 4 downtrend or real
// anti-chase extension, the same real hard gates just fixed in
// classifyCoreVerdict (am-core-engine.js) for the reported Market Terminal
// contradiction. Pure-function, synthetic-input, zero-network.
// Run: node test/trade-planner-scoring.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { computeAPlusScore, computeNextAction } = require("../src/trade-planner-scoring");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const REGIME = { label: "GREEN", score: 85 };
const STRONG_ROW = {
  passCount: 8, abovePivotPct: 1, verdict: "GO", atBuyPoint: true, volConfirmed: true,
  confidence: 90, actionable: true, volRatio: 1.8, riskPct: 4, pctFromHigh: -2,
  vcpScore: 90, vcpVerdict: "VALID VCP", stage: "Stage 2 — Confirmed",
};

console.log("Checking computeAPlusScore — real inputs, honest degrade when absent…");
ok("a genuinely strong, non-gated setup scores high (>=70)", () => {
  const r = computeAPlusScore(STRONG_ROW, REGIME);
  assert.ok(r.score >= 70, `expected >=70, got ${r.score}`);
  assert.strictEqual(r.cautions.length, 0);
});

console.log("Checking computeAPlusScore — real Stage-4/anti-chase hard gate (regression, 2026-08-26)…");
ok("Stage 4 downtrend caps the score to a real low ceiling even with otherwise-strong inputs", () => {
  const r = computeAPlusScore({ ...STRONG_ROW, stage: "Stage 4 — Declining" }, REGIME);
  assert.ok(r.score <= 20, `expected a capped score <=20, got ${r.score}`);
  assert.ok(r.cautions.some((c) => /stage 4/i.test(c)), "must disclose the real reason in cautions");
});
ok("real anti-chase EXTENDED band caps the score even with otherwise-strong inputs", () => {
  const r = computeAPlusScore({ ...STRONG_ROW, abovePivotPct: 6 }, REGIME); // > cautionMax(5), <= extendedMax(8) -> EXTENDED
  assert.ok(r.score <= 20, `expected a capped score <=20, got ${r.score}`);
  assert.ok(r.cautions.some((c) => /extended|chase/i.test(c)), "must disclose the real reason in cautions");
});
ok("real anti-chase DO_NOT_CHASE band caps the score too", () => {
  const r = computeAPlusScore({ ...STRONG_ROW, abovePivotPct: 12 }, REGIME); // > extendedMax(8) -> DO_NOT_CHASE
  assert.ok(r.score <= 20, `expected a capped score <=20, got ${r.score}`);
});
ok("a normal (not extended, not Stage 4) row is never gated even at the same real inputs otherwise", () => {
  const r = computeAPlusScore(STRONG_ROW, REGIME);
  assert.strictEqual(r.cautions.length, 0);
});

console.log("Checking computeNextAction — real Stage-4/anti-chase hard gate, ordered before a bullish signal (regression, 2026-08-26)…");
ok("a real confirmed breakout still reads BUY when nothing is gated", () => {
  assert.strictEqual(computeNextAction(STRONG_ROW).action, "BUY");
});
ok("regression: Stage 4 forces AVOID even with verdict GO + volume confirmed (the real pre-fix bug — isGo was checked BEFORE Stage 4)", () => {
  const r = computeNextAction({ ...STRONG_ROW, stage: "Stage 4 — Declining" });
  assert.strictEqual(r.action, "AVOID");
  assert.match(r.reason, /stage 4/i);
});
ok("regression: real anti-chase EXTENDED/DO_NOT_CHASE forces AVOID even with verdict GO + volume confirmed", () => {
  const r1 = computeNextAction({ ...STRONG_ROW, abovePivotPct: 6 });
  assert.strictEqual(r1.action, "AVOID");
  assert.match(r1.reason, /extended|chase/i);
  const r2 = computeNextAction({ ...STRONG_ROW, abovePivotPct: 12 });
  assert.strictEqual(r2.action, "AVOID");
});
ok("no real anti-chase data available (abovePivotPct missing) never fabricates a gate", () => {
  const { abovePivotPct, ...rest } = STRONG_ROW;
  const r = computeNextAction(rest);
  assert.strictEqual(r.action, "BUY");
});

console.log("Checking computeNextAction — defers to a real row.coreVerdict when present (One Engine consolidation, Phase 2.2)…");
ok("a real coreVerdict AVOID_LONG wins even when the row's own lighter-weight fields would otherwise read BUY", () => {
  const r = computeNextAction({ ...STRONG_ROW, coreVerdict: "AVOID_LONG" });
  assert.strictEqual(r.action, "AVOID");
});
ok("a real coreVerdict EARLY_BUY maps to BUY, not a separate label", () => {
  const r = computeNextAction({ ...STRONG_ROW, coreVerdict: "EARLY_BUY" });
  assert.strictEqual(r.action, "BUY");
});
ok("a real coreVerdict WATCH maps to WATCH", () => {
  const r = computeNextAction({ ...STRONG_ROW, coreVerdict: "WATCH", actionable: true });
  assert.strictEqual(r.action, "WATCH");
});
ok("an unrecognized/position-only coreVerdict (e.g. HOLD) is honestly ignored, falls back to the real gate cascade", () => {
  const r = computeNextAction({ ...STRONG_ROW, coreVerdict: "HOLD" });
  assert.strictEqual(r.action, "BUY"); // falls through to the same real fallback as no coreVerdict at all
});

console.log(`\n${passed} checks passed.`);
console.log("TRADE-PLANNER-SCORING TEST OK");
