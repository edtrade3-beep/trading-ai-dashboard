// Real tests for the "5-Second Rule" simplification layer
// (src/simple-decision.js, 2026-08-20) — reduces the existing engines to
// one decision/one reason/one action. Pure-function, synthetic-input,
// zero-network, same discipline as test/entry-engine.test.js. Covers both
// of the spec's own explicit worked examples verbatim, plus the post-
// entry reuse of position-decision-engine.js's real state. Run:
// node test/simple-decision.test.js (or npm test).
const assert = require("node:assert");
const { computeSimpleDecision, classifyStructure4h, classifySetup1h, classifyTiming15m } = require("../src/simple-decision");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking the 4 timeframe classifiers…");
ok("4H: STRONG/DEVELOPING -> HEALTHY, WEAK -> REPAIRING, BROKEN -> BROKEN", () => {
  assert.strictEqual(classifyStructure4h("STRONG"), "HEALTHY");
  assert.strictEqual(classifyStructure4h("DEVELOPING"), "HEALTHY");
  assert.strictEqual(classifyStructure4h("WEAK"), "REPAIRING");
  assert.strictEqual(classifyStructure4h("BROKEN"), "BROKEN");
  assert.strictEqual(classifyStructure4h(null), null);
});
ok("1H: strong score or accelerating-up RSI -> READY; plain up or moderate score -> IMPROVING; else WEAK", () => {
  assert.strictEqual(classifySetup1h({ score: 70 }), "READY");
  assert.strictEqual(classifySetup1h({ score: 20, rsiTrend: { direction: "up", accelerating: true } }), "READY");
  assert.strictEqual(classifySetup1h({ score: 40, rsiTrend: { direction: "up", accelerating: false } }), "IMPROVING");
  assert.strictEqual(classifySetup1h({ score: 10, rsiTrend: { direction: "down" } }), "WEAK");
  assert.strictEqual(classifySetup1h(null), null);
});
ok("15M: only a real CONFIRMED reads as READY — APPROACHING/NOT_READY/INVALIDATED all read NOT_READY", () => {
  assert.strictEqual(classifyTiming15m("CONFIRMED"), "READY");
  assert.strictEqual(classifyTiming15m("APPROACHING"), "NOT_READY");
  assert.strictEqual(classifyTiming15m("NOT_READY"), "NOT_READY");
  assert.strictEqual(classifyTiming15m("INVALIDATED"), "NOT_READY");
  assert.strictEqual(classifyTiming15m(null), null);
});

console.log("Checking the spec's own two worked examples…");

ok("EXAMPLE 1 (spec verbatim): 1D bullish, 4H BROKEN, 1H weak, 15M not ready -> WAIT, entry BLOCKED, never START SMALL", () => {
  const d = computeSimpleDecision({
    dailyBias: "BULLISH", swing4hState: "BROKEN",
    early1h: { score: 15, rsiTrend: { direction: "down" } },
    entry15mStatus: "NOT_READY", rr: 2,
    entryPlan: { entryPrice: 216.90, pivot: 227.90, stop: 209.69, target1: 246.15, earlyEntryZone: [215.03, 218.77], doNotChaseZone: { band: "NORMAL" }, stage: "EARLY" },
  });
  assert.strictEqual(d.decision, "WAIT", "the spec's own explicit rule: never START SMALL just because price sits inside the calculated Early Entry Zone");
  assert.strictEqual(d.entryZone, "BLOCKED");
  assert.match(d.why, /4H/i);
  assert.strictEqual(d.structure, "BROKEN");
});

ok("EXAMPLE 2 (spec verbatim): 1D bullish, 4H healthy, 1H improving, 15M ready, not extended -> START SMALL with a real entry zone", () => {
  const d = computeSimpleDecision({
    dailyBias: "BULLISH", swing4hState: "STRONG",
    early1h: { score: 65, rsiTrend: { direction: "up", accelerating: true } },
    entry15mStatus: "CONFIRMED", rr: 2,
    entryPlan: { entryPrice: 216.90, pivot: 227.90, stop: 209.69, target1: 246.15, earlyEntryZone: [215.03, 218.77], doNotChaseZone: { band: "NORMAL" }, stage: "EARLY" },
  });
  assert.strictEqual(d.decision, "START_SMALL");
  assert.strictEqual(d.entryZone, "$215.03–$218.77");
  assert.strictEqual(d.trend, "BULLISH");
  assert.strictEqual(d.structure, "HEALTHY");
  assert.strictEqual(d.setup, "READY");
  assert.strictEqual(d.timing, "READY");
});

console.log("Checking anti-chase and missing-conditions WAIT reasoning…");
ok("extended/do-not-chase blocks START SMALL even with everything else aligned", () => {
  const d = computeSimpleDecision({
    dailyBias: "BULLISH", swing4hState: "STRONG",
    early1h: { score: 80, rsiTrend: { direction: "up", accelerating: true } },
    entry15mStatus: "CONFIRMED", rr: 3,
    entryPlan: { entryPrice: 250, pivot: 227, stop: 209, target1: 280, doNotChaseZone: { band: "DO_NOT_CHASE" }, stage: "BREAKOUT" },
  });
  assert.strictEqual(d.decision, "WAIT");
  assert.strictEqual(d.entryZone, "BLOCKED");
  assert.match(d.why, /extend|chase/i);
});
ok("WAIT names exactly what's missing, not a bare wait (4H = REPAIRING is acceptable per spec, so it's correctly absent here)", () => {
  const d = computeSimpleDecision({
    dailyBias: "NEUTRAL", swing4hState: "WEAK", // REPAIRING — acceptable per spec ("4H = HEALTHY or clearly REPAIRING")
    early1h: { score: 20, rsiTrend: { direction: "down" } },
    entry15mStatus: "NOT_READY", rr: 1.0,
    entryPlan: { entryPrice: null, pivot: 227, stop: 209, target1: 246, doNotChaseZone: { band: "NORMAL" }, stage: "FOUNDATION" },
  });
  assert.strictEqual(d.decision, "WAIT");
  assert.strictEqual(d.structure, "REPAIRING");
  assert.doesNotMatch(d.why, /4H structure to repair/, "REPAIRING already satisfies the structure gate — it must not also appear as a missing condition");
  assert.match(d.why, /1H setup to improve/);
  assert.match(d.why, /15M confirmation/);
  assert.match(d.why, /risk\/reward/);
});
ok("a genuinely BROKEN 4H short-circuits to its own dedicated message, not the generic missing-conditions list", () => {
  const d = computeSimpleDecision({
    dailyBias: "BULLISH", swing4hState: "BROKEN",
    early1h: { score: 80, rsiTrend: { direction: "up", accelerating: true } },
    entry15mStatus: "CONFIRMED", rr: 3,
    entryPlan: { entryPrice: 175, pivot: 227, stop: 165, target1: 200, earlyEntryZone: [172, 178], doNotChaseZone: { band: "NORMAL" }, stage: "EARLY" },
  });
  assert.strictEqual(d.decision, "WAIT");
  assert.strictEqual(d.why, "4H structure is broken.");
  assert.strictEqual(d.entryZone, "BLOCKED", "even with a real earlyEntryZone computed, it must not be surfaced as usable while 4H is broken");
});

console.log("Checking Market Regime as a real, named priority factor (Unified Trading System phase 7, spec §13)…");
ok("a real RISK_OFF regime blocks START SMALL even when every other real condition aligns, and names it first in the WAIT reason", () => {
  const d = computeSimpleDecision({
    dailyBias: "BULLISH", swing4hState: "STRONG",
    early1h: { score: 80, rsiTrend: { direction: "up", accelerating: true } },
    entry15mStatus: "CONFIRMED", rr: 3, marketRegime: "RISK_OFF",
    entryPlan: { entryPrice: 216.90, pivot: 227.90, stop: 209.69, target1: 246.15, earlyEntryZone: [215.03, 218.77], doNotChaseZone: { band: "NORMAL" }, stage: "EARLY" },
  });
  assert.strictEqual(d.decision, "WAIT", "a real risk-off tape must not be silently ignored just because every other condition aligns");
  assert.match(d.why, /market regime/i);
});
ok("real RISK_ON/NEUTRAL regime, or no regime data at all, never blocks — same START SMALL as before this phase", () => {
  const base = {
    dailyBias: "BULLISH", swing4hState: "STRONG",
    early1h: { score: 80, rsiTrend: { direction: "up", accelerating: true } },
    entry15mStatus: "CONFIRMED", rr: 3,
    entryPlan: { entryPrice: 216.90, pivot: 227.90, stop: 209.69, target1: 246.15, earlyEntryZone: [215.03, 218.77], doNotChaseZone: { band: "NORMAL" }, stage: "EARLY" },
  };
  assert.strictEqual(computeSimpleDecision({ ...base, marketRegime: "RISK_ON" }).decision, "START_SMALL");
  assert.strictEqual(computeSimpleDecision({ ...base, marketRegime: "NEUTRAL" }).decision, "START_SMALL");
  assert.strictEqual(computeSimpleDecision(base).decision, "START_SMALL", "no marketRegime supplied at all must be an honest no-op, not a fabricated block");
});
ok("the WAIT reason lists real missing factors in spec §13's actual priority order — Market Structure before Trend (previously reversed)", () => {
  const d = computeSimpleDecision({
    // No swing4hState at all -> structure stays null -> structureOk false
    // WITHOUT tripping the dedicated "4H structure is broken" hard-gate
    // short-circuit (that only fires on a real BROKEN read), so this
    // genuinely exercises Market Structure's place in the soft-missing
    // list alongside every other real missing factor.
    dailyBias: "BEARISH",
    early1h: { score: 20, rsiTrend: { direction: "down" } },
    entry15mStatus: "NOT_READY", rr: 1.0, marketRegime: "RISK_OFF",
    entryPlan: { entryPrice: null, pivot: 227, stop: 209, target1: 246, doNotChaseZone: { band: "NORMAL" }, stage: "FOUNDATION" },
  });
  const regimeIdx = d.why.indexOf("market regime");
  const rrIdx = d.why.indexOf("risk/reward");
  const structureIdx = d.why.indexOf("4H structure");
  const trendIdx = d.why.indexOf("daily trend");
  const setupIdx = d.why.indexOf("1H setup");
  assert.ok(regimeIdx >= 0 && regimeIdx < rrIdx, "Market Regime must be named before Risk/Invalidation");
  assert.ok(rrIdx >= 0 && rrIdx < structureIdx, "Risk/Invalidation must be named before Market Structure");
  assert.ok(structureIdx >= 0 && structureIdx < trendIdx, "Market Structure must be named before Trend — the spec's real order, previously reversed in this list");
  assert.ok(trendIdx >= 0 && trendIdx < setupIdx, "Trend must be named before Entry Quality (1H/15M)");
});

console.log("Checking the Red Flag Engine's critical-flag gate (Master Build Spec §8-9, 2026-08-22)…");
const CLEAN_ENTRY_PLAN = { entryPrice: 216.90, pivot: 227.90, stop: 209.69, target1: 246.15, earlyEntryZone: [215.03, 218.77], doNotChaseZone: { band: "NORMAL" }, stage: "EARLY" };
const CLEAN_INPUTS = {
  dailyBias: "BULLISH", swing4hState: "STRONG",
  early1h: { score: 80, rsiTrend: { direction: "up", accelerating: true } },
  entry15mStatus: "CONFIRMED", rr: 3, entryPlan: CLEAN_ENTRY_PLAN,
};
ok("a real critical red flag blocks START SMALL even when every other real condition aligns — spec's own worked example (score high, critical flag true -> the flag wins)", () => {
  const d = computeSimpleDecision({
    ...CLEAN_INPUTS,
    redFlags: [{ key: "poorLiquidity", label: "Poor Liquidity", critical: true, reason: "Real dollar volume is $2.0M/day, below the $5M floor." }],
  });
  assert.strictEqual(d.decision, "WAIT", "a critical flag must override an otherwise-qualifying setup, never hidden by a good score");
  assert.match(d.why, /Poor Liquidity/);
  assert.strictEqual(d.entryZone, "BLOCKED");
});
ok("multiple real critical flags are all named in the reason, not just the first", () => {
  const d = computeSimpleDecision({
    ...CLEAN_INPUTS,
    redFlags: [
      { key: "unacceptableRR", label: "Risk/Reward Unacceptable", critical: true, reason: "Real R:R is 1.1:1." },
      { key: "poorLiquidity", label: "Poor Liquidity", critical: true, reason: "Real dollar volume is $2.0M/day." },
    ],
  });
  assert.match(d.why, /Risk\/Reward Unacceptable/);
  assert.match(d.why, /Poor Liquidity/);
});
ok("regular (non-critical) flags do NOT block START SMALL, but appear in the WAIT reasoning when something else already blocks", () => {
  const started = computeSimpleDecision({
    ...CLEAN_INPUTS,
    redFlags: [{ key: "belowVwap", label: "Below VWAP", critical: false, reason: "Price is below the 20-day VWAP." }],
  });
  assert.strictEqual(started.decision, "START_SMALL", "a regular flag alone must never block an otherwise-qualifying setup");

  const waiting = computeSimpleDecision({
    ...CLEAN_INPUTS, dailyBias: "BEARISH",
    redFlags: [{ key: "fallingRS", label: "Falling Relative Strength", critical: false, reason: "RS Rating 45 is below the 60 leader threshold." }],
  });
  assert.strictEqual(waiting.decision, "WAIT");
  assert.match(waiting.why, /relative strength to improve/, "regular flags must feed the real missing-factors list, mapped through decision-priority.js");
});
ok("no redFlags passed at all -> identical behavior to before this phase (honest no-op, not a fabricated pass or fail)", () => {
  const d = computeSimpleDecision(CLEAN_INPUTS);
  assert.strictEqual(d.decision, "START_SMALL");
  assert.strictEqual(d.redFlagCount, 0);
  assert.strictEqual(d.criticalFlagCount, 0);
});
ok("redFlagCount/criticalFlagCount/redFlags are always present on the returned object, even when zero", () => {
  const d = computeSimpleDecision(CLEAN_INPUTS);
  assert.deepStrictEqual(d.redFlags, []);
});

console.log("Checking post-entry states reuse position-decision-engine.js's real read, never recomputed…");
ok("real EXIT state passes through as EXIT with the real reason", () => {
  const d = computeSimpleDecision({ hasPosition: true, dayTradeState: "EXIT", dayTradeReason: "Weighted evidence has turned against this position.", entryPlan: {} });
  assert.strictEqual(d.decision, "EXIT");
  assert.strictEqual(d.why, "Weighted evidence has turned against this position.");
});
ok("real TAKE_PARTIAL folds into REDUCE", () => {
  const d = computeSimpleDecision({ hasPosition: true, dayTradeState: "TAKE_PARTIAL", dayTradeReason: "Target reached.", entryPlan: {} });
  assert.strictEqual(d.decision, "REDUCE");
});
ok("real TRAIL folds into HOLD", () => {
  const d = computeSimpleDecision({ hasPosition: true, dayTradeState: "TRAIL", dayTradeReason: "+5% and trend remains strong.", entryPlan: {} });
  assert.strictEqual(d.decision, "HOLD");
});
ok("no real day-trade data for the position -> honest structural fallback, 4H broken -> EXIT", () => {
  const d = computeSimpleDecision({ hasPosition: true, dayTradeState: null, swing4hState: "BROKEN", entryPlan: {} });
  assert.strictEqual(d.decision, "EXIT");
  assert.match(d.why, /4H/i);
});
ok("no real day-trade data, structure healthy, not extended -> HOLD", () => {
  const d = computeSimpleDecision({ hasPosition: true, dayTradeState: null, swing4hState: "STRONG", entryPlan: { doNotChaseZone: { band: "NORMAL" } } });
  assert.strictEqual(d.decision, "HOLD");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("SIMPLE-DECISION TEST FAILED"); else console.log("SIMPLE-DECISION TEST OK");
