// Real tests for am-core-engine.js (One Engine Migration, Phase 1,
// 2026-08-23) — the real AM Core Engine (one score, one verdict),
// standalone this phase, wired into nothing yet. Pure-function,
// synthetic-input, zero-network, same discipline as
// test/simple-decision.test.js / test/final-trade-gate.test.js. Run:
// node test/am-core-engine.test.js (or npm test).
const assert = require("node:assert");
const { AM_CORE_SETUP, computeCoreScore, classifyCoreVerdict } = require("../src/am-core-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const STRONG_INPUT = {
  passCount: 8, rsRating: 90, momentum: 0.3, volRatio: 1.8,
  regime: { score: 85, label: "GREEN" },
  vcpScore: 90, riskPct: 4, dollarVolume: 500_000_000,
  antiChase: { band: "IDEAL" }, epsGrowth: 15,
  optionsFlow: { callNotional: 800_000, putNotional: 200_000 },
  adx: { strength: "Strong", direction: "Bullish" },
  smc: { bos: { type: "BULL_BOS" } },
};

console.log("Checking computeCoreScore — real inputs, honest degrade when absent…");
ok("a genuinely strong setup across every real dimension scores high (>=85)", () => {
  const r = computeCoreScore(STRONG_INPUT);
  assert.ok(r.score >= 85, `expected >=85, got ${r.score}`);
});
ok("no real inputs at all -> an honest low-mid score from documented neutral defaults, never a fabricated high number", () => {
  const r = computeCoreScore({});
  assert.ok(r.score > 0 && r.score < 60, `expected a modest honest-default score, got ${r.score}`);
});
ok("breakdown sums to the total score, all 10 named categories present", () => {
  const r = computeCoreScore(STRONG_INPUT);
  const sum = Object.values(r.breakdown).reduce((a, b) => a + b, 0);
  assert.strictEqual(Math.round(sum), r.score);
  for (const k of ["regime", "trend", "structure", "momentum", "volume", "relativeStrength", "setupQuality", "entryQuality", "liquidity", "catalyst"]) {
    assert.ok(k in r.breakdown, `missing breakdown category: ${k}`);
  }
});
ok("score is always clamped 0-100 even with out-of-range inputs", () => {
  const r = computeCoreScore({ ...STRONG_INPUT, regime: { score: 999 }, volRatio: 50 });
  assert.ok(r.score <= 100);
});

console.log("\nChecking AM_CORE_SETUP — the one canonical threshold config…");
ok("thresholds match spec Rule #3 exactly (85/70/60/50)", () => {
  assert.strictEqual(AM_CORE_SETUP.aPlusThreshold, 85);
  assert.strictEqual(AM_CORE_SETUP.buyThreshold, 70);
  assert.strictEqual(AM_CORE_SETUP.watchThreshold, 60);
  assert.strictEqual(AM_CORE_SETUP.waitThreshold, 50);
});

console.log("\nChecking classifyCoreVerdict — score alone never implies a verdict (spec Rule #3)…");
const CLEAN_ENTRY_PLAN = { entryPrice: 100, stage: "BREAKOUT", doNotChaseZone: { band: "NORMAL" } };
const CLEAN_RED_FLAGS = { criticalCount: 0, flags: [] };

ok("score >= aPlusThreshold with a real entry and zero gate failures -> EARLY_BUY", () => {
  const v = classifyCoreVerdict({ score: 90, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS });
  assert.strictEqual(v, "EARLY_BUY");
});
ok("score >= buyThreshold (70-84) with a real entry -> BUY", () => {
  const v = classifyCoreVerdict({ score: 78, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS });
  assert.strictEqual(v, "BUY");
});
ok("score exactly at buyThreshold (70) qualifies (>=, inclusive)", () => {
  const v = classifyCoreVerdict({ score: 70, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS });
  assert.strictEqual(v, "BUY");
});
ok("score 69 (just below buyThreshold) -> WATCH, not BUY", () => {
  const v = classifyCoreVerdict({ score: 69, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS });
  assert.strictEqual(v, "WATCH");
});
ok("score 60-69 -> WATCH; 50-59 -> WAIT; <50 -> AVOID_LONG", () => {
  assert.strictEqual(classifyCoreVerdict({ score: 65, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS }), "WATCH");
  assert.strictEqual(classifyCoreVerdict({ score: 55, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS }), "WAIT");
  assert.strictEqual(classifyCoreVerdict({ score: 30, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS }), "AVOID_LONG");
});
ok("a real entry price is required for BUY/EARLY_BUY even at a qualifying score — no executable entry means WATCH at best", () => {
  const v = classifyCoreVerdict({ score: 90, entryPlan: { entryPrice: null, stage: "FOUNDATION" }, redFlagResult: CLEAN_RED_FLAGS });
  assert.strictEqual(v, "WATCH");
});

console.log("\nChecking the hard-gate cascade — a real disqualification always wins over a high score (spec's own TSLA-shaped example)…");
ok("STRUCTURE_BROKEN forces AVOID_LONG even at a high score", () => {
  const v = classifyCoreVerdict({ score: 95, entryPlan: { entryPrice: 100, stage: "STRUCTURE_BROKEN" }, redFlagResult: CLEAN_RED_FLAGS });
  assert.strictEqual(v, "AVOID_LONG");
});
ok("DO_NOT_CHASE (extended) forces AVOID_LONG even at a high score", () => {
  const v = classifyCoreVerdict({ score: 95, entryPlan: { entryPrice: 100, doNotChaseZone: { band: "DO_NOT_CHASE" } }, redFlagResult: CLEAN_RED_FLAGS });
  assert.strictEqual(v, "AVOID_LONG");
});
ok("a critical red flag forces AVOID_LONG even at a high score", () => {
  const v = classifyCoreVerdict({ score: 95, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: { criticalCount: 1, flags: [{ critical: true, label: "Daily Trend Breakdown" }] } });
  assert.strictEqual(v, "AVOID_LONG");
});
ok("Stage 4 forces AVOID_LONG even at a high score", () => {
  const v = classifyCoreVerdict({ score: 88, stage: "Stage 4 — Downtrend", entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS });
  assert.strictEqual(v, "AVOID_LONG");
});
ok("bearish daily trend forces AVOID_LONG even at a high score", () => {
  const v = classifyCoreVerdict({ score: 88, dailyBias: "BEARISH", entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS });
  assert.strictEqual(v, "AVOID_LONG");
});
ok("Entry Score below the floor forces AVOID_LONG even at a high overall score (Setup Quality=90, Entry Quality=40 -> AVOID)", () => {
  const v = classifyCoreVerdict({ score: 90, entryScore: 40, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS });
  assert.strictEqual(v, "AVOID_LONG");
});
ok("Entry Score exactly at the floor (75) does not block (>=, inclusive)", () => {
  const v = classifyCoreVerdict({ score: 90, entryScore: 75, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS });
  assert.notStrictEqual(v, "AVOID_LONG");
});

console.log("\nChecking the reported TSLA case (spec's own worked example) — real regression guard…");
ok("Stage 4, Entry Score 35/100, bearish bias, high raw score -> AVOID_LONG, never BUY/EARLY_BUY/WAIT", () => {
  const v = classifyCoreVerdict({
    score: 72, stage: "Stage 4 — Downtrend", dailyBias: "BEARISH", entryScore: 35,
    entryPlan: { entryPrice: null, stage: "FOUNDATION" }, redFlagResult: CLEAN_RED_FLAGS,
  });
  assert.strictEqual(v, "AVOID_LONG");
  assert.notStrictEqual(v, "BUY");
  assert.notStrictEqual(v, "EARLY_BUY");
  assert.notStrictEqual(v, "WAIT", "must never land on the same soft label as a merely-not-yet-confirmed setup");
});

console.log("\nChecking has-position relabeling — reuses position-decision-engine.js's real state, never recomputes it…");
ok("real EXIT/HARD_EXIT states pass through as EXIT", () => {
  assert.strictEqual(classifyCoreVerdict({ hasPosition: true, positionState: "EXIT" }), "EXIT");
  assert.strictEqual(classifyCoreVerdict({ hasPosition: true, positionState: "HARD_EXIT" }), "EXIT");
});
ok("real TAKE_PARTIAL -> TAKE_PROFIT", () => {
  assert.strictEqual(classifyCoreVerdict({ hasPosition: true, positionState: "TAKE_PARTIAL" }), "TAKE_PROFIT");
});
ok("real TRAIL/WARNING/HOLD all -> HOLD", () => {
  assert.strictEqual(classifyCoreVerdict({ hasPosition: true, positionState: "TRAIL" }), "HOLD");
  assert.strictEqual(classifyCoreVerdict({ hasPosition: true, positionState: "WARNING" }), "HOLD");
  assert.strictEqual(classifyCoreVerdict({ hasPosition: true, positionState: "HOLD" }), "HOLD");
});
ok("a held position's score is irrelevant to the verdict — position management reads positionState only, matching computeSimpleDecision's own real design", () => {
  const v = classifyCoreVerdict({ hasPosition: true, positionState: "HOLD", score: 10 });
  assert.strictEqual(v, "HOLD");
});

console.log("\nChecking short-side is honestly deferred, not guessed…");
ok("a SHORT-direction request returns null — Phase 1 is long-side only, disclosed, not silently approximated", () => {
  assert.strictEqual(classifyCoreVerdict({ direction: "SHORT", score: 90 }), null);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("AM-CORE-ENGINE TEST FAILED"); else console.log("AM-CORE-ENGINE TEST OK");
