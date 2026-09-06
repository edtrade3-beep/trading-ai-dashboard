// Real tests for the decision-vs-outcome taxonomy (platform-consolidation
// Part 13, 2026-09-06): src/trade-outcome-classifier.js's classifyTradeOutcome
// and src/trade-autopsy.js's tallyTradeOutcomes rollup. Same minimal
// no-framework style as test/news-divergence.test.js.
"use strict";
const assert = require("node:assert");
const { classifyExit, tallyTradeOutcomes } = require("../src/trade-autopsy");
const { classifyTradeOutcome, TRADE_OUTCOMES } = require("../src/trade-outcome-classifier");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

function trade(overrides) { return { symbol: "ZZZ", entry: 100, exit: 110, qty: 10, pnl: 100, openedAt: "2026-09-01T14:00:00Z", closedAt: "2026-09-02T14:00:00Z", ...overrides }; }
function planMatch(overrides) { return { symbol: "ZZZ", ts: Date.parse("2026-09-01T14:00:00Z"), entry: 100, stop: 95, target: 115, qty: 10, tier: "A", ...overrides }; }

console.log("Checking classifyTradeOutcome — real decision-vs-outcome taxonomy…");

ok("no real plan on file (untagged/manual entry) is honestly UNCLASSIFIED, never guessed", () => {
  const r = classifyTradeOutcome(trade(), null, null);
  assert.strictEqual(r.outcome, "UNCLASSIFIED");
});

ok("a real fill that violated the stop is EXECUTION_ERROR regardless of the entry tier", () => {
  const t = trade({ exit: 85, pnl: -150 }); // well past the real stop (95)
  const match = planMatch({ tier: "A" });
  const exit = classifyExit(t, match);
  assert.strictEqual(exit.verdict, "stop_violated");
  const r = classifyTradeOutcome(t, match, exit);
  assert.strictEqual(r.outcome, "EXECUTION_ERROR");
});

ok("a real Tier-A entry (good decision) with a real win is GOOD_TRADE_GOOD_OUTCOME", () => {
  const t = trade({ exit: 116, pnl: 160 }); // at/above target
  const match = planMatch({ tier: "A" });
  const exit = classifyExit(t, match);
  const r = classifyTradeOutcome(t, match, exit);
  assert.strictEqual(r.outcome, "GOOD_TRADE_GOOD_OUTCOME");
});

ok("a real Tier-A entry (good decision) that still lost (stop honored, not violated) is GOOD_TRADE_BAD_OUTCOME — a sound decision, unlucky outcome", () => {
  const t = trade({ exit: 96, pnl: -40 }); // near the real stop, honored not violated
  const match = planMatch({ tier: "A" });
  const exit = classifyExit(t, match);
  assert.strictEqual(exit.verdict, "stop_honored");
  const r = classifyTradeOutcome(t, match, exit);
  assert.strictEqual(r.outcome, "GOOD_TRADE_BAD_OUTCOME");
});

ok("a real Tier-B entry (weaker decision) with a real win is BAD_TRADE_GOOD_OUTCOME — lucky", () => {
  const t = trade({ exit: 116, pnl: 160 });
  const match = planMatch({ tier: "B" });
  const exit = classifyExit(t, match);
  const r = classifyTradeOutcome(t, match, exit);
  assert.strictEqual(r.outcome, "BAD_TRADE_GOOD_OUTCOME");
});

ok("a real Tier-B entry with a real loss (stop honored) is BAD_TRADE_BAD_OUTCOME", () => {
  const t = trade({ exit: 96, pnl: -40 });
  const match = planMatch({ tier: "B" });
  const exit = classifyExit(t, match);
  const r = classifyTradeOutcome(t, match, exit);
  assert.strictEqual(r.outcome, "BAD_TRADE_BAD_OUTCOME");
});

ok("an exact $0 breakeven close is a GOOD outcome, not a bad one (code review fix, 2026-09-06)", () => {
  const t = trade({ exit: 100, pnl: 0 });
  const match = planMatch({ tier: "A" });
  const exit = classifyExit(t, match);
  const r = classifyTradeOutcome(t, match, exit);
  assert.strictEqual(r.outcome, "GOOD_TRADE_GOOD_OUTCOME");
});

ok("an unrecognized/missing real tier (e.g. lightbox's 'DAYTRADE' tag) is honestly UNCLASSIFIED, never forced into GOOD or BAD", () => {
  const t = trade();
  const match = planMatch({ tier: "DAYTRADE" });
  const exit = classifyExit(t, match);
  const r = classifyTradeOutcome(t, match, exit);
  assert.strictEqual(r.outcome, "UNCLASSIFIED");
});

ok("SYSTEM_ERROR and MARKET_RANDOMNESS are real taxonomy members but are never automatically assigned — manual-only, disclosed scope limit", () => {
  assert.ok(TRADE_OUTCOMES.includes("SYSTEM_ERROR"));
  assert.ok(TRADE_OUTCOMES.includes("MARKET_RANDOMNESS"));
  // Sweep every combination this classifier can actually produce and
  // confirm neither manual-only label ever comes out of it.
  const tiers = ["A", "B", "DAYTRADE", undefined];
  const exits = [96, 85, 116];
  for (const tier of tiers) {
    for (const exit of exits) {
      const t = trade({ exit, pnl: exit - 100 });
      const match = tier ? planMatch({ tier }) : null;
      const c = match ? classifyExit(t, match) : null;
      const r = classifyTradeOutcome(t, match, c);
      assert.ok(r.outcome !== "SYSTEM_ERROR" && r.outcome !== "MARKET_RANDOMNESS");
    }
  }
});

console.log("\nChecking tallyTradeOutcomes — real rollup over closed trades + the setup-tagged journal…");

ok("an honest zero-count object when there are no real closed trades", () => {
  const counts = tallyTradeOutcomes([], []);
  assert.strictEqual(counts.GOOD_TRADE_GOOD_OUTCOME, 0);
  assert.strictEqual(counts.UNCLASSIFIED, 0);
});

ok("a real mixed batch tallies into the real matching buckets", () => {
  const journal = [
    { symbol: "AAA", ts: Date.parse("2026-09-01T14:00:00Z"), entry: 100, stop: 95, target: 115, qty: 10, tier: "A" },
    { symbol: "BBB", ts: Date.parse("2026-09-01T14:00:00Z"), entry: 50, stop: 47, target: 58, qty: 20, tier: "B" },
  ];
  const trades = [
    trade({ symbol: "AAA", exit: 116, pnl: 160, closedAt: "2026-09-02T14:00:00Z" }),           // GOOD_TRADE_GOOD_OUTCOME
    trade({ symbol: "BBB", exit: 47.5, pnl: -50, closedAt: "2026-09-02T15:00:00Z" }),           // BAD_TRADE_BAD_OUTCOME (near real stop, honored)
    trade({ symbol: "CCC", exit: 20, pnl: 10, closedAt: "2026-09-02T16:00:00Z" }),              // no journal match -> UNCLASSIFIED
  ];
  const counts = tallyTradeOutcomes(trades, journal);
  assert.strictEqual(counts.GOOD_TRADE_GOOD_OUTCOME, 1);
  assert.strictEqual(counts.BAD_TRADE_BAD_OUTCOME, 1);
  assert.strictEqual(counts.UNCLASSIFIED, 1);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TRADE-OUTCOME-CLASSIFIER TEST FAILED");
else console.log("TRADE-OUTCOME-CLASSIFIER TEST OK");
