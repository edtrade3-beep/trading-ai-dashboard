// Real tests for ai-actions.js's deepScanDecisionToAiAction/
// simpleDecisionToAiAction (2026-08-20, Discover/Smart Scan/Workspace
// unification) — the two mapping tables that keep classifyDeepScanDecision
// (Smart Scan/Discover) and simple-decision.js (Workspace) from ever
// contradicting AI_ACTIONS' 9-tier scale. ai-actions.js is an ES module
// (browser-only, no CommonJS twin), loaded here via dynamic import — same
// pure-function, synthetic-input, zero-network discipline as
// test/btc-hpc-scan.test.js. Run: node test/ai-actions.test.js (or npm test).
const assert = require("node:assert");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

(async () => {
  const { AI_ACTIONS, deepScanDecisionToAiAction, simpleDecisionToAiAction } = await import("../axiom-runner/components/ai-actions.js");

  console.log("Checking deepScanDecisionToAiAction never crosses polarity…");
  ok("A_PLUS_EARLY_BUY -> a bullish tier (Strong Buy)", () => {
    assert.strictEqual(deepScanDecisionToAiAction("A_PLUS_EARLY_BUY"), AI_ACTIONS.STRONG_BUY);
  });
  ok("BUY -> Buy", () => {
    assert.strictEqual(deepScanDecisionToAiAction("BUY"), AI_ACTIONS.BUY);
  });
  ok("PULLBACK_BUY -> Accumulate (bullish, not full conviction)", () => {
    assert.strictEqual(deepScanDecisionToAiAction("PULLBACK_BUY"), AI_ACTIONS.ACCUMULATE);
  });
  ok("EXTENDED -> Watch, never Buy just because quality is high (anti-chase)", () => {
    const a = deepScanDecisionToAiAction("EXTENDED");
    assert.strictEqual(a, AI_ACTIONS.WATCH);
    assert.ok(a.tier < AI_ACTIONS.BUY.tier, "EXTENDED must rank below BUY");
  });
  ok("WAIT -> Wait, a real caution tier, never a bullish one", () => {
    const a = deepScanDecisionToAiAction("WAIT");
    assert.strictEqual(a, AI_ACTIONS.WAIT);
    assert.ok(a.tier < AI_ACTIONS.ACCUMULATE.tier);
  });
  ok("AVOID -> never a bullish tier (the hard case a mislabeled mapping would get wrong)", () => {
    const a = deepScanDecisionToAiAction("AVOID");
    assert.strictEqual(a, AI_ACTIONS.AVOID);
    assert.ok(a.tier < AI_ACTIONS.WAIT.tier, "AVOID must rank below WAIT");
  });
  ok("unknown/null decision -> null, never a guessed tier", () => {
    assert.strictEqual(deepScanDecisionToAiAction(null), null);
    assert.strictEqual(deepScanDecisionToAiAction("SOMETHING_ELSE"), null);
  });
  ok("never produces ROTATE or TAKE_PROFITS — entry-only, no position concept", () => {
    for (const d of ["A_PLUS_EARLY_BUY", "BUY", "PULLBACK_BUY", "EXTENDED", "WAIT", "AVOID"]) {
      const a = deepScanDecisionToAiAction(d);
      assert.notStrictEqual(a, AI_ACTIONS.ROTATE);
      assert.notStrictEqual(a, AI_ACTIONS.TAKE_PROFITS);
    }
  });

  console.log("Checking simpleDecisionToAiAction never crosses polarity…");
  ok("START_SMALL -> Buy", () => {
    assert.strictEqual(simpleDecisionToAiAction("START_SMALL"), AI_ACTIONS.BUY);
  });
  ok("ADD -> Accumulate", () => {
    assert.strictEqual(simpleDecisionToAiAction("ADD"), AI_ACTIONS.ACCUMULATE);
  });
  ok("HOLD -> Watch (neutral-to-positive, not a new-entry Buy)", () => {
    const a = simpleDecisionToAiAction("HOLD");
    assert.strictEqual(a, AI_ACTIONS.WATCH);
    assert.ok(a.tier < AI_ACTIONS.BUY.tier);
  });
  ok("WAIT -> Wait", () => {
    assert.strictEqual(simpleDecisionToAiAction("WAIT"), AI_ACTIONS.WAIT);
  });
  ok("REDUCE -> Reduce, never a bullish tier", () => {
    const a = simpleDecisionToAiAction("REDUCE");
    assert.strictEqual(a, AI_ACTIONS.REDUCE);
    assert.ok(a.tier < AI_ACTIONS.WATCH.tier);
  });
  ok("EXIT -> never Buy — the hard case a mislabeled mapping would get wrong", () => {
    const a = simpleDecisionToAiAction("EXIT");
    assert.strictEqual(a, AI_ACTIONS.EXIT);
    assert.ok(a.tier < AI_ACTIONS.REDUCE.tier, "EXIT must rank below REDUCE");
    assert.notStrictEqual(a, AI_ACTIONS.BUY);
    assert.notStrictEqual(a, AI_ACTIONS.STRONG_BUY);
  });
  ok("AVOID -> never a bullish tier (Final Trade Validation Engine, 2026-08-23 addition)", () => {
    const a = simpleDecisionToAiAction("AVOID");
    assert.strictEqual(a, AI_ACTIONS.AVOID);
    assert.ok(a.tier < AI_ACTIONS.WAIT.tier, "AVOID must rank below WAIT");
    assert.notStrictEqual(a, AI_ACTIONS.BUY);
    assert.notStrictEqual(a, AI_ACTIONS.STRONG_BUY);
  });
  ok("unknown/null decision -> null, never a guessed tier", () => {
    assert.strictEqual(simpleDecisionToAiAction(undefined), null);
    assert.strictEqual(simpleDecisionToAiAction("NOT_A_STATE"), null);
  });

  console.log(`\n${passed} checks passed.`);
  console.log("AI-ACTIONS TEST " + (process.exitCode ? "FAILED" : "OK"));
})();
