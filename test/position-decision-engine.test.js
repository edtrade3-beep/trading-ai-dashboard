// Real tests for position-decision-engine.js's computePositionState
// (2026-08-22, Master Build Spec §18 — WARNING + HARD EXIT tiers). Pure
// function, synthetic-input, zero-network — same discipline as
// test/entry-engine.test.js. No test file existed for this module before
// this phase. Run: node test/position-decision-engine.test.js (or npm
// test).
const assert = require("node:assert");
const { computePositionState } = require("../src/position-decision-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking HARD_EXIT — a real, objective stop breach (Master Build Spec §18)…");
ok("long position, price at/below the real stop -> HARD_EXIT, real stop price named in the reason", () => {
  const d = computePositionState({ side: "long", currentPrice: 95, stopPrice: 98, mixedVerdict: "BULLISH", mixedReason: "still bullish" });
  assert.strictEqual(d.state, "HARD_EXIT");
  assert.match(d.reason, /\$98\.00/);
});
ok("short position, price at/above the real stop -> HARD_EXIT", () => {
  const d = computePositionState({ side: "short", currentPrice: 105, stopPrice: 102, mixedVerdict: "BEARISH", mixedReason: "still bearish" });
  assert.strictEqual(d.state, "HARD_EXIT");
});
ok("HARD_EXIT fires even with NO mixedVerdict at all — a stop breach is objective, doesn't need a fresh weighted read to justify exiting", () => {
  const d = computePositionState({ side: "long", currentPrice: 95, stopPrice: 98, mixedVerdict: null });
  assert.strictEqual(d.state, "HARD_EXIT", "a real risk-limit breach must never be masked by 'no real day-trade data'");
});
ok("price still above a long's stop -> no HARD_EXIT, normal evaluation continues", () => {
  const d = computePositionState({ side: "long", currentPrice: 105, stopPrice: 98, mixedVerdict: "BULLISH", mixedReason: "still bullish" });
  assert.notStrictEqual(d.state, "HARD_EXIT");
});
ok("no currentPrice/stopPrice supplied at all -> honest no-op, unchanged behavior from before this phase", () => {
  const d = computePositionState({ side: "long", mixedVerdict: "BULLISH", mixedReason: "still bullish" });
  assert.notStrictEqual(d.state, "HARD_EXIT");
  assert.strictEqual(d.state, "HOLD");
});

console.log("Checking WARNING — real, distinct mixed-evidence tier (Master Build Spec §18)…");
ok("long position, thesis not invalidated but evidence genuinely MIXED -> WARNING, not a bare HOLD", () => {
  const d = computePositionState({ side: "long", gainPct: 1, mixedVerdict: "MIXED", mixedReason: "mixed signals" });
  assert.strictEqual(d.state, "WARNING");
  assert.match(d.reason, /mixed/i);
});
ok("long position, thesis strongly confirmed (BULLISH) -> clean HOLD, not WARNING", () => {
  const d = computePositionState({ side: "long", gainPct: 1, mixedVerdict: "BULLISH", mixedReason: "still bullish" });
  assert.strictEqual(d.state, "HOLD");
});
ok("short position, thesis strongly confirmed (BEARISH) -> clean HOLD, not WARNING", () => {
  const d = computePositionState({ side: "short", gainPct: 1, mixedVerdict: "BEARISH", mixedReason: "still bearish" });
  assert.strictEqual(d.state, "HOLD");
});

console.log("Checking existing EXIT/TAKE_PARTIAL/TRAIL behavior is unchanged (regression guard)…");
ok("thesis fully flipped -> EXIT, still takes priority over WARNING", () => {
  const d = computePositionState({ side: "long", mixedVerdict: "BEARISH", mixedReason: "flipped bearish" });
  assert.strictEqual(d.state, "EXIT");
});
ok("real target reached -> TAKE_PARTIAL, still takes priority over WARNING", () => {
  const d = computePositionState({ side: "long", mixedVerdict: "MIXED", mixedReason: "mixed", rNow: 2.5, rTarget: 2 });
  assert.strictEqual(d.state, "TAKE_PARTIAL");
});
ok("2R+ extended with fading conviction -> TAKE_PARTIAL", () => {
  const d = computePositionState({ side: "long", mixedVerdict: "MIXED", mixedReason: "mixed", rNow: 2.5, rTarget: null });
  assert.strictEqual(d.state, "TAKE_PARTIAL");
});

console.log("Checking partialTaken — real one-time-partial memory (2026-09-01 audit fix, directly found: a position sitting at/above target for several ticks in a row re-fired TAKE_PARTIAL every tick, whittling the real remainder 50%->25%->12.5%->... instead of banking size once)…");
ok("real target reached with partialTaken:true -> does NOT re-fire TAKE_PARTIAL", () => {
  const d = computePositionState({ side: "long", mixedVerdict: "MIXED", mixedReason: "mixed", rNow: 2.5, rTarget: 2, partialTaken: true });
  assert.notStrictEqual(d.state, "TAKE_PARTIAL");
});
ok("real target still reached, still sitting above it a tick later, but partialTaken:true -> falls through to a real WARNING/HOLD read instead of a repeated partial", () => {
  const d = computePositionState({ side: "long", mixedVerdict: "BULLISH", mixedReason: "still bullish", rNow: 3, rTarget: 2, partialTaken: true });
  assert.strictEqual(d.state, "HOLD", "thesis still strongly confirmed and already partialed once -> a clean HOLD, not another partial");
});
ok("2R+ extended with fading conviction, partialTaken:true -> does NOT re-fire TAKE_PARTIAL either (the second real TAKE_PARTIAL condition gets the same gate)", () => {
  const d = computePositionState({ side: "long", mixedVerdict: "MIXED", mixedReason: "mixed", rNow: 2.5, rTarget: null, partialTaken: true });
  assert.notStrictEqual(d.state, "TAKE_PARTIAL");
});
ok("partialTaken defaults to false when omitted -> exact unchanged behavior from before this fix", () => {
  const d = computePositionState({ side: "long", mixedVerdict: "MIXED", mixedReason: "mixed", rNow: 2.5, rTarget: 2 });
  assert.strictEqual(d.state, "TAKE_PARTIAL");
});
ok("real gain, trend strongly confirmed -> TRAIL", () => {
  const d = computePositionState({ side: "long", gainPct: 5, mixedVerdict: "BULLISH", mixedReason: "still bullish" });
  assert.strictEqual(d.state, "TRAIL");
});
ok("no real mixedVerdict, no currentPrice/stopPrice -> honest null state (no opinion), unchanged from before this phase", () => {
  const d = computePositionState({ side: "long", mixedVerdict: null });
  assert.strictEqual(d.state, null);
  assert.strictEqual(d.reason, null);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("POSITION-DECISION-ENGINE TEST FAILED"); else console.log("POSITION-DECISION-ENGINE TEST OK");
