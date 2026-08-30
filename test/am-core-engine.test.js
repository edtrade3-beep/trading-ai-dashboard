// Real tests for am-core-engine.js (One Engine Migration, Phase 1-2,
// 2026-08-23) — the real AM Core Engine (one score, one verdict).
// Phase 2 wires this into MarketTerminalTab.jsx/RhProScanner.jsx and
// adds: a sector dimension (real sectorInfo was available on both
// consumer pages but missing from Phase 1's score), classifyCoreVerdict
// returning { verdict, reason } instead of a bare string (so a caller
// never has to stitch this engine's verdict together with a DIFFERENT
// engine's own reason text), and CORE_VERDICT_META (supersedes the now-
// retired final-trade-gate.js). Pure-function, synthetic-input,
// zero-network, same discipline as test/simple-decision.test.js. Run:
// node test/am-core-engine.test.js (or npm test).
const assert = require("node:assert");
const { AM_CORE_SETUP, CORE_VERDICT_META, computeCoreScore, classifyCoreVerdict } = require("../src/am-core-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const STRONG_INPUT = {
  passCount: 8, rsRating: 90, momentum: 0.3, volRatio: 1.8,
  regime: { score: 85, label: "GREEN" },
  vcpScore: 90, riskPct: 4, dollarVolume: 500_000_000,
  antiChase: { band: "NORMAL" }, epsGrowth: 15,
  optionsFlow: { callNotional: 800_000, putNotional: 200_000 },
  adx: { strength: "Strong", direction: "Bullish" },
  smc: { bos: { type: "BULL_BOS" } },
  sectorInfo: { rank: 1, of: 11 },
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
ok("breakdown sums to the total score, all 12 named categories present (optionsConfirmation added Central Opportunity & Options Engine goal, 2026-08-30)", () => {
  const r = computeCoreScore(STRONG_INPUT);
  const sum = Object.values(r.breakdown).reduce((a, b) => a + b, 0);
  assert.strictEqual(Math.round(sum), r.score);
  for (const k of ["regime", "trend", "structure", "momentum", "optionsConfirmation", "volume", "relativeStrength", "setupQuality", "entryQuality", "sector", "liquidity", "catalyst"]) {
    assert.ok(k in r.breakdown, `missing breakdown category: ${k}`);
  }
});
ok("the 12 real bucket ceilings sum to exactly 100 — every real point accounted for, none double-counted", () => {
  const allMax = computeCoreScore({
    passCount: 8, rsRating: 99, momentum: 10, volRatio: 10,
    regime: { score: 100 }, vcpScore: 100, riskPct: 1, dollarVolume: 10e9,
    antiChase: { band: "NORMAL" }, epsGrowth: 100,
    optionsFlow: { callNotional: 1, putNotional: 0 },
    adx: { strength: "Strong", direction: "Bullish" }, smc: { bos: { type: "BULL_BOS" } },
    sectorInfo: { rank: 1, of: 11 },
  });
  assert.strictEqual(allMax.score, 100);
});
ok("score is always clamped 0-100 even with out-of-range inputs", () => {
  const r = computeCoreScore({ ...STRONG_INPUT, regime: { score: 999 }, volRatio: 50 });
  assert.ok(r.score <= 100);
});
ok("real sector rank #1 of 11 scores near the sector bucket's max; unranked degrades to an honest mid-point", () => {
  const ranked = computeCoreScore({ ...STRONG_INPUT, sectorInfo: { rank: 1, of: 11 } });
  const unranked = computeCoreScore({ ...STRONG_INPUT, sectorInfo: undefined });
  assert.ok(ranked.breakdown.sector > unranked.breakdown.sector, "a real #1 sector rank must score higher than an honest unranked default");
  assert.strictEqual(unranked.breakdown.sector, 3.5, "unranked default should be the documented mid-point (half of the 7pt bucket)");
});

console.log("\nChecking computeCoreScore's real antiChase band names — regression for the 2026-08-26 'unify the swing/entry-decision verdict' bug fix…");
ok("real bands NOT_YET_BROKEN_OUT/NORMAL score the SAME (both genuinely no chase risk) — the max entryQuality sub-score", () => {
  const notYet = computeCoreScore({ ...STRONG_INPUT, antiChase: { band: "NOT_YET_BROKEN_OUT" } });
  const normal = computeCoreScore({ ...STRONG_INPUT, antiChase: { band: "NORMAL" } });
  assert.strictEqual(notYet.breakdown.entryQuality, normal.breakdown.entryQuality);
});
ok("real bands CAUTION < NORMAL < ... and EXTENDED < CAUTION and DO_NOT_CHASE < EXTENDED — entryQuality strictly decreases with real chase risk", () => {
  const scoreFor = (band) => computeCoreScore({ ...STRONG_INPUT, antiChase: { band } }).breakdown.entryQuality;
  const normal = scoreFor("NORMAL"), caution = scoreFor("CAUTION"), extended = scoreFor("EXTENDED"), doNotChase = scoreFor("DO_NOT_CHASE");
  assert.ok(normal > caution, `NORMAL (${normal}) must score above CAUTION (${caution})`);
  assert.ok(caution > extended, `CAUTION (${caution}) must score above EXTENDED (${extended})`);
  assert.ok(extended > doNotChase, `EXTENDED (${extended}) must score above DO_NOT_CHASE (${doNotChase})`);
});
ok("regression: the invented band names 'IDEAL'/'ACCEPTABLE'/'STRETCHED' (the real pre-fix bug) are honestly treated as unrecognized, not silently matched", () => {
  const invented = computeCoreScore({ ...STRONG_INPUT, antiChase: { band: "IDEAL" } }).breakdown.entryQuality;
  const unavailable = computeCoreScore({ ...STRONG_INPUT, antiChase: undefined }).breakdown.entryQuality;
  assert.strictEqual(invented, unavailable, "an unrecognized band name must fall through to the same honest 'unavailable' default, never accidentally scored as real");
});

console.log("\nChecking optionsConfirmation — its own real 10pt bucket (Central Opportunity & Options Engine goal, 2026-08-30, promoted out of a shared Catalyst bucket)…");
ok("real, heavily call-weighted flow scores near the bucket's real 10pt max", () => {
  const r = computeCoreScore({ ...STRONG_INPUT, optionsFlow: { callNotional: 900_000, putNotional: 100_000 } });
  assert.ok(r.breakdown.optionsConfirmation >= 8, `expected a high real score for 90% call-weighted flow, got ${r.breakdown.optionsConfirmation}`);
});
ok("real, heavily put-weighted flow scores near the bucket's real floor", () => {
  const r = computeCoreScore({ ...STRONG_INPUT, optionsFlow: { callNotional: 100_000, putNotional: 900_000 } });
  assert.ok(r.breakdown.optionsConfirmation <= 2, `expected a low real score for 90% put-weighted flow, got ${r.breakdown.optionsConfirmation}`);
});
ok("no real options flow data -> the honest 5pt midpoint, never a fabricated confirmation either direction", () => {
  const r = computeCoreScore({ ...STRONG_INPUT, optionsFlow: undefined });
  assert.strictEqual(r.breakdown.optionsConfirmation, 5);
});
ok("this bucket alone can meaningfully move the total score — confirms it carries its own real 10pt weight, not the old ~2.5pt shared fraction", () => {
  const bullishFlow = computeCoreScore({ ...STRONG_INPUT, optionsFlow: { callNotional: 950_000, putNotional: 50_000 } }).score;
  const bearishFlow = computeCoreScore({ ...STRONG_INPUT, optionsFlow: { callNotional: 50_000, putNotional: 950_000 } }).score;
  assert.ok(bullishFlow - bearishFlow >= 7, `expected at least a real ~8-9pt swing between heavily call- vs put-weighted flow, got ${bullishFlow - bearishFlow}`);
});

console.log("\nChecking AM_CORE_SETUP — the one canonical threshold config…");
ok("thresholds match spec Rule #3 exactly (85/70/60/50)", () => {
  assert.strictEqual(AM_CORE_SETUP.aPlusThreshold, 85);
  assert.strictEqual(AM_CORE_SETUP.buyThreshold, 70);
  assert.strictEqual(AM_CORE_SETUP.watchThreshold, 60);
  assert.strictEqual(AM_CORE_SETUP.waitThreshold, 50);
});

console.log("\nChecking CORE_VERDICT_META — the one real display meta per verdict (supersedes final-trade-gate.js)…");
ok("every verdict classifyCoreVerdict can return has a real icon/label/color entry", () => {
  for (const v of ["EARLY_BUY", "BUY", "WATCH", "WAIT", "AVOID_LONG", "HOLD", "TAKE_PROFIT", "EXIT"]) {
    assert.ok(CORE_VERDICT_META[v], `missing display meta for ${v}`);
    assert.ok(CORE_VERDICT_META[v].icon && CORE_VERDICT_META[v].label && CORE_VERDICT_META[v].color);
  }
});
ok("EXIT gets its own distinct color from AVOID_LONG (pre-entry AVOID and has-position EXIT are mutually exclusive branches, no ambiguity)", () => {
  assert.notStrictEqual(CORE_VERDICT_META.EXIT.color, CORE_VERDICT_META.AVOID_LONG.color);
});

console.log("\nChecking classifyCoreVerdict — returns { verdict, reason }, score alone never implies a verdict (spec Rule #3)…");
const CLEAN_ENTRY_PLAN = { entryPrice: 100, stage: "BREAKOUT", doNotChaseZone: { band: "NORMAL" } };
const CLEAN_RED_FLAGS = { criticalCount: 0, flags: [] };

ok("score >= aPlusThreshold with a real entry and zero gate failures -> EARLY_BUY, with a real matching reason", () => {
  const r = classifyCoreVerdict({ score: 90, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS });
  assert.strictEqual(r.verdict, "EARLY_BUY");
  assert.match(r.reason, /90/, "the reason text must cite the real score, not a generic message");
});
ok("score >= buyThreshold (70-84) with a real entry -> BUY", () => {
  assert.strictEqual(classifyCoreVerdict({ score: 78, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS }).verdict, "BUY");
});
ok("score exactly at buyThreshold (70) qualifies (>=, inclusive)", () => {
  assert.strictEqual(classifyCoreVerdict({ score: 70, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS }).verdict, "BUY");
});
ok("score 69 (just below buyThreshold) -> WATCH, not BUY", () => {
  assert.strictEqual(classifyCoreVerdict({ score: 69, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS }).verdict, "WATCH");
});
ok("score 60-69 -> WATCH; 50-59 -> WAIT; <50 -> AVOID_LONG", () => {
  assert.strictEqual(classifyCoreVerdict({ score: 65, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS }).verdict, "WATCH");
  assert.strictEqual(classifyCoreVerdict({ score: 55, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS }).verdict, "WAIT");
  assert.strictEqual(classifyCoreVerdict({ score: 30, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS }).verdict, "AVOID_LONG");
});
ok("a real entry price is required for BUY/EARLY_BUY even at a qualifying score — no executable entry means WATCH at best", () => {
  const r = classifyCoreVerdict({ score: 90, entryPlan: { entryPrice: null, stage: "FOUNDATION" }, redFlagResult: CLEAN_RED_FLAGS });
  assert.strictEqual(r.verdict, "WATCH");
  assert.match(r.reason, /no real executable entry/i);
});

console.log("\nChecking the hard-gate cascade — a real disqualification always wins over a high score (spec's own TSLA-shaped example)…");
ok("STRUCTURE_BROKEN forces AVOID_LONG even at a high score", () => {
  const r = classifyCoreVerdict({ score: 95, entryPlan: { entryPrice: 100, stage: "STRUCTURE_BROKEN" }, redFlagResult: CLEAN_RED_FLAGS });
  assert.strictEqual(r.verdict, "AVOID_LONG");
  assert.match(r.reason, /structure/i);
});
ok("DO_NOT_CHASE (extended) forces AVOID_LONG even at a high score", () => {
  const r = classifyCoreVerdict({ score: 95, entryPlan: { entryPrice: 100, doNotChaseZone: { band: "DO_NOT_CHASE" } }, redFlagResult: CLEAN_RED_FLAGS });
  assert.strictEqual(r.verdict, "AVOID_LONG");
  assert.match(r.reason, /chase/i);
});
ok("regression (2026-08-26, real live bug reported by the user): EXTENDED (not yet terminal DO_NOT_CHASE) also forces AVOID_LONG, not BUY — this is the exact contradiction the reported screenshot showed", () => {
  const r = classifyCoreVerdict({ score: 95, entryPlan: { entryPrice: 100, doNotChaseZone: { band: "EXTENDED" } }, redFlagResult: CLEAN_RED_FLAGS });
  assert.strictEqual(r.verdict, "AVOID_LONG");
  assert.match(r.reason, /pullback|extended|stretched/i);
});
ok("NORMAL/CAUTION/NOT_YET_BROKEN_OUT bands do NOT trip the hard gate — only EXTENDED/DO_NOT_CHASE block", () => {
  for (const band of ["NORMAL", "CAUTION", "NOT_YET_BROKEN_OUT"]) {
    const r = classifyCoreVerdict({ score: 95, entryPlan: { entryPrice: 100, doNotChaseZone: { band } }, redFlagResult: CLEAN_RED_FLAGS });
    assert.notStrictEqual(r.verdict, "AVOID_LONG", `band ${band} should not trip the anti-chase hard gate`);
  }
});
ok("a critical red flag forces AVOID_LONG even at a high score, real flag label named in the reason", () => {
  const r = classifyCoreVerdict({ score: 95, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: { criticalCount: 1, flags: [{ critical: true, label: "Daily Trend Breakdown" }] } });
  assert.strictEqual(r.verdict, "AVOID_LONG");
  assert.match(r.reason, /Daily Trend Breakdown/);
});
ok("Stage 4 forces AVOID_LONG even at a high score", () => {
  const r = classifyCoreVerdict({ score: 88, stage: "Stage 4 — Downtrend", entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS });
  assert.strictEqual(r.verdict, "AVOID_LONG");
  assert.match(r.reason, /Stage 4/);
});
ok("bearish daily trend forces AVOID_LONG even at a high score", () => {
  const r = classifyCoreVerdict({ score: 88, dailyBias: "BEARISH", entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS });
  assert.strictEqual(r.verdict, "AVOID_LONG");
  assert.match(r.reason, /bearish/i);
});
ok("Entry Score below the floor forces AVOID_LONG even at a high overall score (Setup Quality=90, Entry Quality=40 -> AVOID)", () => {
  const r = classifyCoreVerdict({ score: 90, entryScore: 40, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS });
  assert.strictEqual(r.verdict, "AVOID_LONG");
  assert.match(r.reason, /Entry Score 40/);
});
ok("Entry Score exactly at the floor (75) does not block (>=, inclusive)", () => {
  const r = classifyCoreVerdict({ score: 90, entryScore: 75, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS });
  assert.notStrictEqual(r.verdict, "AVOID_LONG");
});

console.log("\nChecking the reported TSLA case (spec's own worked example) — real regression guard…");
ok("Stage 4, Entry Score 35/100, bearish bias, high raw score -> AVOID_LONG, never BUY/EARLY_BUY/WAIT", () => {
  const r = classifyCoreVerdict({
    score: 72, stage: "Stage 4 — Downtrend", dailyBias: "BEARISH", entryScore: 35,
    entryPlan: { entryPrice: null, stage: "FOUNDATION" }, redFlagResult: CLEAN_RED_FLAGS,
  });
  assert.strictEqual(r.verdict, "AVOID_LONG");
  assert.notStrictEqual(r.verdict, "BUY");
  assert.notStrictEqual(r.verdict, "EARLY_BUY");
  assert.notStrictEqual(r.verdict, "WAIT", "must never land on the same soft label as a merely-not-yet-confirmed setup");
});

console.log("\nChecking has-position relabeling — reuses position-decision-engine.js's real state, never recomputes it…");
ok("real EXIT/HARD_EXIT states pass through as EXIT, with the real positionReason preserved", () => {
  assert.strictEqual(classifyCoreVerdict({ hasPosition: true, positionState: "EXIT", positionReason: "Weighted evidence has turned against this position." }).verdict, "EXIT");
  const r = classifyCoreVerdict({ hasPosition: true, positionState: "HARD_EXIT", positionReason: "Real stop price breached." });
  assert.strictEqual(r.verdict, "EXIT");
  assert.strictEqual(r.reason, "Real stop price breached.");
});
ok("real TAKE_PARTIAL -> TAKE_PROFIT", () => {
  assert.strictEqual(classifyCoreVerdict({ hasPosition: true, positionState: "TAKE_PARTIAL" }).verdict, "TAKE_PROFIT");
});
ok("real TRAIL/WARNING/HOLD all -> HOLD", () => {
  assert.strictEqual(classifyCoreVerdict({ hasPosition: true, positionState: "TRAIL" }).verdict, "HOLD");
  assert.strictEqual(classifyCoreVerdict({ hasPosition: true, positionState: "WARNING" }).verdict, "HOLD");
  assert.strictEqual(classifyCoreVerdict({ hasPosition: true, positionState: "HOLD" }).verdict, "HOLD");
});
ok("a held position's score is irrelevant to the verdict — position management reads positionState only, matching computeSimpleDecision's own real design", () => {
  assert.strictEqual(classifyCoreVerdict({ hasPosition: true, positionState: "HOLD", score: 10 }).verdict, "HOLD");
});
ok("no real positionReason supplied -> an honest generic fallback, never fabricated specifics", () => {
  const r = classifyCoreVerdict({ hasPosition: true, positionState: "HOLD" });
  assert.strictEqual(r.reason, "Structure and thesis intact.");
});

console.log("\nChecking short-side is honestly deferred, not guessed…");
ok("a SHORT-direction request returns null — Phase 1/2 is long-side only, disclosed, not silently approximated", () => {
  assert.strictEqual(classifyCoreVerdict({ direction: "SHORT", score: 90 }), null);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("AM-CORE-ENGINE TEST FAILED"); else console.log("AM-CORE-ENGINE TEST OK");
