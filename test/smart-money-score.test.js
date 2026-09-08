"use strict";
const assert = require("node:assert");
const {
  DEFAULT_WEIGHTS, scoreInsider, scoreInstitutional, scoreOptions, scoreAnalyst, computeSmartMoneyScore,
} = require("../src/smart-money-score");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking DEFAULT_WEIGHTS — matches the user's own explicit spec exactly…");
ok("weights sum to 100", () => {
  const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.strictEqual(sum, 100);
});
ok("weights match the spec's exact named percentages", () => {
  assert.deepStrictEqual(DEFAULT_WEIGHTS, { insider: 20, institutional: 20, options: 15, analyst: 10, technical: 15, fundamental: 10, catalyst: 10 });
});

console.log("Checking scoreInsider — real buy$/sell$ ratio + multiple-buyer bonus…");
ok("no real transactions -> honest null, never a guessed neutral", () => {
  assert.strictEqual(scoreInsider({ transactions: [] }).score, null);
});
ok("heavy real buying, single buyer -> high score, no bonus", () => {
  const r = scoreInsider({ transactions: [{ type: "BUY", value: 1_000_000, owner: "Jane Doe" }] });
  assert.strictEqual(r.score, 100);
});
ok("heavy real selling -> low score", () => {
  const r = scoreInsider({ transactions: [{ type: "SELL", value: 1_000_000, owner: "Jane Doe" }] });
  assert.strictEqual(r.score, 0);
});
ok("3+ distinct real buyers -> real +10 bonus, capped at 100", () => {
  const r = scoreInsider({ transactions: [
    { type: "BUY", value: 500_000, owner: "A" }, { type: "BUY", value: 500_000, owner: "B" }, { type: "BUY", value: 500_000, owner: "C" },
  ] });
  assert.strictEqual(r.score, 100);
});

console.log("Checking scoreInstitutional — real net-share-change ratio…");
ok("no real institutional rows -> honest null", () => {
  assert.strictEqual(scoreInstitutional({ institutions: [] }).score, null);
});
ok("net real accumulation -> score above 50", () => {
  const r = scoreInstitutional({ institutions: [{ change: 100000 }, { change: 50000 }, { change: -10000 }] });
  assert.ok(r.score > 50);
});
ok("net real distribution -> score below 50", () => {
  const r = scoreInstitutional({ institutions: [{ change: -100000 }, { change: -50000 }, { change: 10000 }] });
  assert.ok(r.score < 50);
});

console.log("Checking scoreOptions — real call/put notional ratio + unusual-flow nudge…");
ok("no real flow -> honest null", () => {
  assert.strictEqual(scoreOptions({ callNotional: 0, putNotional: 0 }, []).score, null);
});
ok("real call-heavy flow -> high score", () => {
  const r = scoreOptions({ callNotional: 9_000_000, putNotional: 1_000_000 }, []);
  assert.strictEqual(r.score, 90);
});
ok("real unusual call cluster nudges score up further", () => {
  const base = scoreOptions({ callNotional: 5_000_000, putNotional: 5_000_000 }, []).score;
  const nudged = scoreOptions({ callNotional: 5_000_000, putNotional: 5_000_000 }, [
    { side: "CALL" }, { side: "CALL" }, { side: "CALL" },
  ]).score;
  assert.ok(nudged > base);
});

console.log("Checking scoreAnalyst — real upgrade/downgrade balance + real implied upside…");
ok("no real recent activity or targets -> honest null", () => {
  assert.strictEqual(scoreAnalyst({ history: [] }).score, null);
});
ok("real recent upgrades + real positive upside -> score above 50", () => {
  const r = scoreAnalyst({
    history: [{ action: "up", date: new Date().toISOString() }],
    targetMean: 150, currentPrice: 100,
  });
  assert.ok(r.score > 50);
});
ok("real recent downgrades + real negative upside -> score below 50", () => {
  const r = scoreAnalyst({
    history: [{ action: "down", date: new Date().toISOString() }],
    targetMean: 80, currentPrice: 100,
  });
  assert.ok(r.score < 50);
});

console.log("Checking computeSmartMoneyScore — real renormalization across missing components…");
ok("all 7 components present -> real weighted blend", () => {
  const r = computeSmartMoneyScore({
    insider: { score: 100, reason: "x" }, institutional: { score: 100, reason: "x" },
    options: { score: 100, reason: "x" }, analyst: { score: 100, reason: "x" },
    technical: { score: 100, reason: "x" }, fundamental: { score: 100, reason: "x" }, catalyst: { score: 100, reason: "x" },
  });
  assert.strictEqual(r.score, 100);
  assert.strictEqual(r.band, "STRONG_BUY");
  assert.deepStrictEqual(r.missing, []);
});
ok("only some components present -> real renormalized weighted blend, never anchored to 50 by missing ones", () => {
  const r = computeSmartMoneyScore({
    insider: { score: 100, reason: "x" }, institutional: null, options: null,
    analyst: null, technical: null, fundamental: null, catalyst: null,
  });
  // Only insider has real evidence -> its weight becomes 100% of the total.
  assert.strictEqual(r.score, 100);
  assert.strictEqual(r.missing.length, 6);
});
ok("zero real components -> honest UNAVAILABLE, never a fabricated 50", () => {
  const r = computeSmartMoneyScore({});
  assert.strictEqual(r.score, null);
  assert.strictEqual(r.band, "UNAVAILABLE");
});
ok("real band thresholds match the spec's own 5-tier vocabulary", () => {
  const mk = (s) => computeSmartMoneyScore({ insider: { score: s, reason: "x" } }).band;
  assert.strictEqual(mk(85), "STRONG_BUY");
  assert.strictEqual(mk(70), "BUY");
  assert.strictEqual(mk(50), "WATCH");
  assert.strictEqual(mk(30), "AVOID");
  assert.strictEqual(mk(10), "SELL");
});
ok("configurable weights are honored, not hardcoded", () => {
  const customWeights = { insider: 100, institutional: 0, options: 0, analyst: 0, technical: 0, fundamental: 0, catalyst: 0 };
  const r = computeSmartMoneyScore({
    insider: { score: 0, reason: "x" }, institutional: { score: 100, reason: "x" },
    weights: customWeights,
  });
  assert.strictEqual(r.score, 0);
});

console.log(`${passed} checks passed.`);
console.log("SMART-MONEY-SCORE TEST OK");
