// Real tests for src/trade-lane-classifier.js — Trade Navigator's
// A-Trade/Quick Trade/Developing lane relabeling. Thin, pure, no new
// decision math. Run: node test/trade-lane-classifier.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { classifyTradeLane, QUICK_TRADE_SIZE_MULTIPLIER } = require("../src/trade-lane-classifier");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking classifyTradeLane — real thin relabeling, no new decisions…");

ok("real ACTIONABLE tier + PRIMARY band + ENTER_NOW state -> A_TRADE, real size multiplier 1", () => {
  const r = classifyTradeLane({ tier: "ACTIONABLE", band: "PRIMARY", signalState: "ENTER_NOW" });
  assert.strictEqual(r.lane, "A_TRADE");
  assert.strictEqual(r.sizeMultiplier, 1);
});
ok("real ACTIONABLE tier + PRIMARY band + ARMED state also qualifies as A_TRADE (waiting on the real trigger, still full conviction)", () => {
  const r = classifyTradeLane({ tier: "ACTIONABLE", band: "PRIMARY", signalState: "ARMED" });
  assert.strictEqual(r.lane, "A_TRADE");
});
ok("real ACTIONABLE tier alone, without a real PRIMARY band, does NOT qualify as A_TRADE — full conviction requires both", () => {
  const r = classifyTradeLane({ tier: "ACTIONABLE", band: "WATCH", signalState: "ENTER_NOW" });
  assert.notStrictEqual(r.lane, "A_TRADE");
});

ok("real DEVELOPING tier -> DEVELOPING lane, real size multiplier 0 (alert only)", () => {
  const r = classifyTradeLane({ tier: "DEVELOPING" });
  assert.strictEqual(r.lane, "DEVELOPING");
  assert.strictEqual(r.sizeMultiplier, 0);
});
ok("real SETUP_FORMING signal state alone also qualifies as DEVELOPING", () => {
  const r = classifyTradeLane({ signalState: "SETUP_FORMING" });
  assert.strictEqual(r.lane, "DEVELOPING");
});
ok("real WATCH band alone also qualifies as DEVELOPING", () => {
  const r = classifyTradeLane({ band: "WATCH" });
  assert.strictEqual(r.lane, "DEVELOPING");
});

ok("a real qualifying dayTradeSignal (qualifiesAPlus: true) -> QUICK_TRADE, real reduced size multiplier", () => {
  const r = classifyTradeLane({ dayTradeSignal: { qualifiesAPlus: true } });
  assert.strictEqual(r.lane, "QUICK_TRADE");
  assert.strictEqual(r.sizeMultiplier, QUICK_TRADE_SIZE_MULTIPLIER);
  assert.ok(r.sizeMultiplier < 1, "a real Quick Trade must size smaller than a real A-Trade, never the same or larger");
});
ok("a real non-qualifying dayTradeSignal (qualifiesAPlus: false) never forces QUICK_TRADE", () => {
  const r = classifyTradeLane({ dayTradeSignal: { qualifiesAPlus: false }, tier: "ACTIONABLE", band: "PRIMARY", signalState: "ENTER_NOW" });
  assert.strictEqual(r.lane, "A_TRADE");
});
ok("a real qualifying dayTradeSignal takes priority even over a real A-Trade-qualifying tier/band/state", () => {
  const r = classifyTradeLane({ dayTradeSignal: { qualifiesAPlus: true }, tier: "ACTIONABLE", band: "PRIMARY", signalState: "ENTER_NOW" });
  assert.strictEqual(r.lane, "QUICK_TRADE");
});

ok("no real qualifying signal at all -> honest null lane, never a fabricated classification", () => {
  const r = classifyTradeLane({});
  assert.strictEqual(r.lane, null);
  assert.strictEqual(r.sizeMultiplier, null);
});
ok("real REJECT band / AVOID-style inputs never qualify for any lane", () => {
  const r = classifyTradeLane({ tier: "INVALIDATED", band: "REJECT", signalState: "CANCELLED" });
  assert.strictEqual(r.lane, null);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TRADE-LANE-CLASSIFIER TEST FAILED"); else console.log("TRADE-LANE-CLASSIFIER TEST OK");
