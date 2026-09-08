"use strict";
const assert = require("node:assert");
const { buildRobinhoodOrderTicket, classifyEntryTiming, computeBreakevens, slippageBuffer } = require("../src/options-buy-assistant");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking computeBreakevens — real per-structure options math…");

ok("Long Calls: breakeven = strike + premium", () => {
  const be = computeBreakevens("Long Calls", { legs: [{ strike: 450, premium: 12 }] });
  assert.deepStrictEqual(be, [462]);
});
ok("Long Puts: breakeven = strike - premium", () => {
  const be = computeBreakevens("Long Puts", { legs: [{ strike: 450, premium: 12 }] });
  assert.deepStrictEqual(be, [438]);
});
ok("Bull Call Spread: breakeven = long strike + net debit", () => {
  const be = computeBreakevens("Bull Call Spread", { legs: [{ strike: 450 }, { strike: 470 }], netDebit: 5.2 });
  assert.deepStrictEqual(be, [455.2]);
});
ok("Bear Put Spread: breakeven = long strike - net debit", () => {
  const be = computeBreakevens("Bear Put Spread", { legs: [{ strike: 450 }, { strike: 430 }], netDebit: 5.2 });
  assert.deepStrictEqual(be, [444.8]);
});
ok("Iron Condor: two real breakevens, sorted ascending", () => {
  const be = computeBreakevens("Iron Condor", {
    legs: [{ strike: 470 }, { strike: 480 }, { strike: 430 }, { strike: 420 }], netCredit: 2.5,
  });
  assert.deepStrictEqual(be, [427.5, 472.5]);
});
ok("missing real legs/price data -> honest empty array, never a fabricated breakeven", () => {
  assert.deepStrictEqual(computeBreakevens("Bull Call Spread", { legs: [] }), []);
  assert.deepStrictEqual(computeBreakevens("Long Calls", {}), []);
});

console.log("\nChecking slippageBuffer — real, disclosed order-entry tolerance…");
ok("scales with the real target price", () => {
  assert.ok(slippageBuffer(5.20) > slippageBuffer(1.00));
});
ok("floors at $0.05 for a very cheap option", () => {
  assert.strictEqual(slippageBuffer(0.10), 0.05);
});
ok("honest fallback for invalid input", () => {
  assert.strictEqual(slippageBuffer(null), 0.05);
  assert.strictEqual(slippageBuffer(-1), 0.05);
});

console.log("\nChecking buildRobinhoodOrderTicket — the one combined real order-entry card…");

const bullCallSpreadStrategy = {
  strategy: "Bull Call Spread", pop: 62, riskReward: 2.85,
  construction: {
    available: true,
    legs: [
      { action: "BUY", type: "call", strike: 450, expiry: "2026-10-16", premium: 8.4 },
      { action: "SELL", type: "call", strike: 470, expiry: "2026-10-16", premium: 3.2 },
    ],
    netDebit: 5.2, maxProfit: 14.8, maxLoss: 5.2,
  },
};

ok("a real unavailable construction is honestly reported, never a fabricated ticket", () => {
  const r = buildRobinhoodOrderTicket({ symbol: "AAPL", rankedStrategy: { construction: { available: false, reason: "no real chain" } } });
  assert.strictEqual(r.available, false);
});
ok("a real Bull Call Spread produces the exact spec-shaped ticket", () => {
  const r = buildRobinhoodOrderTicket({ symbol: "TSLA", rankedStrategy: bullCallSpreadStrategy });
  assert.strictEqual(r.available, true);
  assert.strictEqual(r.direction.label, "BULLISH");
  assert.strictEqual(r.expiration, "2026-10-16");
  assert.strictEqual(r.quantity, "1 Spread");
  assert.strictEqual(r.orderType, "LIMIT");
  assert.strictEqual(r.isCredit, false);
  assert.strictEqual(r.targetPrice, 5.2);
  assert.ok(r.boundaryPrice > r.targetPrice, "a debit strategy's boundary must be a real MAXIMUM (higher than target), never a minimum");
  assert.strictEqual(r.estimatedCost, 520);
  assert.strictEqual(r.maxLoss, 520);
  assert.strictEqual(r.maxProfit, 1480);
  assert.deepStrictEqual(r.breakevens, [455.2]);
});
ok("a real debit ticket never exceeds its own disclosed boundary in the instructions text", () => {
  const r = buildRobinhoodOrderTicket({ symbol: "TSLA", rankedStrategy: bullCallSpreadStrategy });
  const exceedStep = r.instructions.find((s) => s.startsWith("Do not exceed"));
  assert.ok(exceedStep.includes(r.boundaryPrice.toFixed(2)));
});
ok("a real credit strategy's boundary is a real MINIMUM (lower than target), opposite direction from a debit ticket", () => {
  const ironCondor = {
    strategy: "Iron Condor", pop: 68, riskReward: 0.42,
    construction: {
      available: true,
      legs: [
        { action: "SELL", type: "call", strike: 470, expiry: "2026-10-16", premium: 4.0 },
        { action: "BUY", type: "call", strike: 480, expiry: "2026-10-16", premium: 1.5 },
        { action: "SELL", type: "put", strike: 430, expiry: "2026-10-16", premium: 3.8 },
        { action: "BUY", type: "put", strike: 420, expiry: "2026-10-16", premium: 1.6 },
      ],
      netCredit: 4.7, maxProfit: 4.7, maxLoss: 5.3,
    },
  };
  const r = buildRobinhoodOrderTicket({ symbol: "SPY", rankedStrategy: ironCondor });
  assert.strictEqual(r.isCredit, true);
  assert.ok(r.boundaryPrice < r.targetPrice, "a credit strategy's boundary must be a real MINIMUM (lower than target)");
  const minStep = r.instructions.find((s) => s.startsWith("Do not accept less than"));
  assert.ok(minStep);
});
ok("the real instructions list matches the spec's own numbered steps for a 2-leg spread", () => {
  const r = buildRobinhoodOrderTicket({ symbol: "TSLA", rankedStrategy: bullCallSpreadStrategy });
  assert.ok(r.instructions[0].includes("Open Robinhood"));
  assert.ok(r.instructions.some((s) => s.includes("$450 Call as BUY")));
  assert.ok(r.instructions.some((s) => s.includes("$470 Call as SELL")));
  assert.ok(r.instructions.some((s) => s.includes("1 spread")));
  assert.ok(r.instructions[r.instructions.length - 1].includes("READY"));
});
ok("the real verify-before-submitting checklist reflects the exact same real ticket numbers", () => {
  const r = buildRobinhoodOrderTicket({ symbol: "TSLA", rankedStrategy: bullCallSpreadStrategy });
  assert.strictEqual(r.verify.ticker, "TSLA");
  assert.strictEqual(r.verify.maxRisk, "$520");
});

// Regression (found live against a real Polygon chain, 2026-09-07):
// strategy-selector.js's buildLegs() never sets maxProfit/maxLoss for the
// two single-leg structures (Long Calls/Long Puts) — only the spreads —
// so this ticket showed a blank Max Loss for the single most common
// real structure until real options math was added here.
ok("a real single-leg Long Put: max loss = premium paid, max profit = real capped value (strike - premium), never blank", () => {
  const longPut = { strategy: "Long Puts", pop: 44, riskReward: 0.7, construction: { available: true, legs: [{ action: "BUY", type: "put", strike: 507.5, expiry: "2026-09-09", premium: 9.23 }], netDebit: 9.23 } };
  const r = buildRobinhoodOrderTicket({ symbol: "MSFT", rankedStrategy: longPut });
  assert.strictEqual(r.maxLoss, 923);
  assert.strictEqual(r.maxProfit, 49827); // (507.5 - 9.23) * 100
  assert.strictEqual(r.verify.maxRisk, "$923");
});
ok("a real single-leg Long Call: max loss = premium paid, max profit is honestly 'Uncapped', never a fabricated ceiling", () => {
  const longCall = { strategy: "Long Calls", pop: 52, riskReward: 1.2, construction: { available: true, legs: [{ action: "BUY", type: "call", strike: 450, expiry: "2026-10-16", premium: 12.4 }], netDebit: 12.4 } };
  const r = buildRobinhoodOrderTicket({ symbol: "TSLA", rankedStrategy: longCall });
  assert.strictEqual(r.maxLoss, 1240);
  assert.strictEqual(r.maxProfit, "Uncapped");
});

console.log("\nChecking classifyEntryTiming — real Party-Stage re-mapping onto the spec's own 6-label vocabulary…");
ok("re-maps every real party stage 0-6, never fabricating a 7th state", () => {
  for (let stage = 0; stage <= 6; stage++) {
    const t = classifyEntryTiming({ partyStage: stage });
    assert.strictEqual(t.stage, stage);
    assert.ok(t.label);
  }
});
ok("Stage 4 (Breakout Underway) maps to this section's own 'MOVE ALREADY STARTED' label, distinct from the base engine's own wording", () => {
  assert.strictEqual(classifyEntryTiming({ partyStage: 4 }).label, "MOVE ALREADY STARTED");
});
ok("no real party-stage data -> honest UNKNOWN, never a guessed timing", () => {
  const t = classifyEntryTiming({});
  assert.strictEqual(t.stage, null);
  assert.ok(/unknown/i.test(t.label));
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("OPTIONS-BUY-ASSISTANT TEST FAILED");
else console.log("OPTIONS-BUY-ASSISTANT TEST OK");
