// Real tests for src/why-now-engine.js — Trade Navigator's "Why is this
// moving right now?" picker. Pure aggregator over already-computed real
// signals, never a second scoring engine. Run: node test/why-now-engine.test.js
// (or npm test).
"use strict";
const assert = require("node:assert");
const { computeWhyNow, technicalRead } = require("../src/why-now-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const BREAKDOWN_MAX = { regime: 13, trend: 13, momentum: 7, volume: 8, relativeStrength: 8, catalyst: 3, optionsConfirmation: 10 };

console.log("Checking technicalRead — real anti-chase band + entry stage…");
ok("a real BREAKOUT stage with a real NORMAL anti-chase band -> a real, high-confidence read", () => {
  const r = technicalRead({ antiChaseBand: "NORMAL", entryStage: "BREAKOUT" });
  assert.strictEqual(r.label, "breakout");
  assert.ok(r.magnitude >= 70);
});
ok("a real BREAKOUT stage but a real DO_NOT_CHASE band -> still real, but a real lower magnitude (too extended to lead with)", () => {
  const r = technicalRead({ antiChaseBand: "DO_NOT_CHASE", entryStage: "BREAKOUT" });
  assert.ok(r.magnitude < 50);
});
ok("no real recognized entryStage -> honest null, never a fabricated technical read", () => {
  assert.strictEqual(technicalRead({ antiChaseBand: "NORMAL", entryStage: "FOUNDATION" }), null);
  assert.strictEqual(technicalRead({}), null);
});

console.log("\nChecking computeWhyNow — real ranking by real magnitude, honest gaps…");
ok("real breakdown buckets are ranked, highest real magnitude wins as primary", () => {
  const r = computeWhyNow({
    breakdown: { trend: 13, momentum: 7, relativeStrength: 2, regime: 5, optionsConfirmation: 3, volume: 4, catalyst: 1 },
    breakdownMax: BREAKDOWN_MAX,
  });
  assert.strictEqual(r.primary.category, "trend", "trend/momentum both maxed out -> the highest real normalized magnitude");
});
ok("a real technical breakout read can outrank a weaker real breakdown bucket", () => {
  const r = computeWhyNow({
    breakdown: { relativeStrength: 1, regime: 1 },
    breakdownMax: BREAKDOWN_MAX,
    antiChaseBand: "NORMAL", entryStage: "BREAKOUT",
  });
  assert.strictEqual(r.primary.category, "technical");
});
ok("secondary carries up to 2 real runners-up, never more", () => {
  const r = computeWhyNow({
    breakdown: { trend: 13, momentum: 7, relativeStrength: 8, regime: 13, optionsConfirmation: 10, volume: 8, catalyst: 3 },
    breakdownMax: BREAKDOWN_MAX,
  });
  assert.ok(r.secondary.length <= 2);
});
ok("no real inputs at all -> honest null primary, empty secondary, never fabricated", () => {
  const r = computeWhyNow({});
  assert.strictEqual(r.primary, null);
  assert.deepStrictEqual(r.secondary, []);
});
ok("a missing individual real bucket (undefined) is simply excluded, never treated as 0 and never crashes", () => {
  const r = computeWhyNow({ breakdown: { trend: 13 }, breakdownMax: BREAKDOWN_MAX });
  assert.strictEqual(r.primary.category, "trend");
});
ok("real future-ready slots (news/sectorRotation/institutional) rank normally once a real caller supplies them", () => {
  const r = computeWhyNow({
    breakdown: { relativeStrength: 1 }, breakdownMax: BREAKDOWN_MAX,
    newsSignal: { magnitude: 95, summary: "guidance raise" },
  });
  assert.strictEqual(r.primary.category, "news");
  assert.match(r.primary.label, /guidance raise/);
});
ok("real future-ready slots left null (today's honest default) never appear in the ranking", () => {
  const r = computeWhyNow({ breakdown: { relativeStrength: 5 }, breakdownMax: BREAKDOWN_MAX, newsSignal: null, sectorRotation: null, institutionalRead: null });
  assert.ok(!r.secondary.some((c) => c.category === "news" || c.category === "sectorRotation" || c.category === "institutional"));
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("WHY-NOW-ENGINE TEST FAILED"); else console.log("WHY-NOW-ENGINE TEST OK");
