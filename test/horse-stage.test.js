// Real tests for src/horse-stage.js (Horse Hunter upgrade, 2026-08-26) —
// the 8-stage lifecycle classifier over Future Wallet's already-real
// synthesized scores. Pure-function, synthetic-input, zero-network.
// Run: node test/horse-stage.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { classifyHorseStage, STAGE_LABELS } = require("../src/horse-stage");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking classifyHorseStage — real 8-stage lifecycle…");

ok("no real Future Wealth Score at all -> honest STAGE 0 UNKNOWN", () => {
  const r = classifyHorseStage({});
  assert.strictEqual(r.stage, 0);
  assert.strictEqual(r.label, "UNKNOWN");
});

ok("a weak but real score with no other signal -> STAGE 1 INTERESTING, not UNKNOWN", () => {
  const r = classifyHorseStage({ futureWealthScore: 30 });
  assert.strictEqual(r.stage, 1);
  assert.strictEqual(r.label, "INTERESTING");
});

ok("real accelerating revenue growth + a building technical base -> STAGE 2 EMERGING", () => {
  const r = classifyHorseStage({ futureWealthScore: 50, revenueGrowth: 0.28, breakoutStatus: "SETUP_READY" });
  assert.strictEqual(r.stage, 2);
  assert.strictEqual(r.label, "EMERGING");
});

ok("a real material Wealth Score jump vs. the prior real journal entry -> STAGE 3 INFLECTION", () => {
  const r = classifyHorseStage({ futureWealthScore: 70, priorWealthScore: 58 });
  assert.strictEqual(r.stage, 3);
  assert.strictEqual(r.label, "INFLECTION");
  assert.ok(r.reasons[0].includes("+12"));
});

ok("no prior score on file -> INFLECTION is honestly never guessed, even with a high current score", () => {
  const r = classifyHorseStage({ futureWealthScore: 70, priorWealthScore: null });
  assert.notStrictEqual(r.label, "INFLECTION");
});

ok("a real confirmed technical breakout + strong Wealth Score -> STAGE 4 EARLY_LEADER", () => {
  const r = classifyHorseStage({ futureWealthScore: 65, breakoutStatus: "CONFIRMED" });
  assert.strictEqual(r.stage, 4);
  assert.strictEqual(r.label, "EARLY_LEADER");
});

ok("real high institution score + strong Wealth Score -> STAGE 5 INSTITUTIONAL_RECOGNITION", () => {
  const r = classifyHorseStage({ futureWealthScore: 65, institutionScore: 82 });
  assert.strictEqual(r.stage, 5);
  assert.strictEqual(r.label, "INSTITUTIONAL_RECOGNITION");
});

ok("real mega-cap market cap + strong sustained Wealth Score -> STAGE 6 MARKET_LEADER", () => {
  const r = classifyHorseStage({ futureWealthScore: 65, marketCap: 300_000_000_000 });
  assert.strictEqual(r.stage, 6);
  assert.strictEqual(r.label, "MARKET_LEADER");
});

ok("real mega-cap + real growth deceleration -> STAGE 7 MATURE, overriding MARKET_LEADER", () => {
  const r = classifyHorseStage({ futureWealthScore: 65, marketCap: 300_000_000_000, revenueGrowth: 0.03, epsGrowth: 0.02 });
  assert.strictEqual(r.stage, 7);
  assert.strictEqual(r.label, "MATURE");
});

ok("STAGE_LABELS is the real ordered 0-7 vocabulary", () => {
  assert.deepStrictEqual(STAGE_LABELS, ["UNKNOWN", "INTERESTING", "EMERGING", "INFLECTION", "EARLY_LEADER", "INSTITUTIONAL_RECOGNITION", "MARKET_LEADER", "MATURE"]);
});

console.log(`\n${passed} checks passed.`);
console.log("HORSE-STAGE TEST OK");
