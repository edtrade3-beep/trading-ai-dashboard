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
