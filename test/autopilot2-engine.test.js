// Real tests for src/autopilot2-engine.js's sizeEntry — the one pure
// sizing calculation in this file (tick/managePositions/tryEnter all do
// real network scans + real account I/O, same "test the pure helpers"
// convention as the rest of this session's engine tests). Covers spec
// §17's exact real defaults: 0.5% risk/trade, $500 max real risk/trade,
// reusing risk-guardrails.js's own sizePositionByRisk (not a re-derived
// copy) with a real dollar ceiling layered on top since that function
// only knows percentages. Pure-function, synthetic-input, zero-network.
// Run: node test/autopilot2-engine.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { sizeEntry, RISK_PCT_PER_TRADE, MAX_TRADE_RISK_DOLLARS } = require("../src/autopilot2-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking sizeEntry — real risk-% sizing, real $ cap layered on top…");
ok(`real spec defaults: ${RISK_PCT_PER_TRADE}% risk/trade, $${MAX_TRADE_RISK_DOLLARS} max/trade`, () => {
  assert.strictEqual(RISK_PCT_PER_TRADE, 0.5);
  assert.strictEqual(MAX_TRADE_RISK_DOLLARS, 500);
});
ok("a real $100k account, tight stop -> the real 20% max-name-concentration cap binds before risk-pct or the $ cap do", () => {
  // 0.5% of 100k = $500 risk budget / $1 risk-per-share = 500 sh by
  // risk-pct alone, and the $500 cap ALSO allows 500 sh here — but
  // sizePositionByRisk's own real maxNamePct (default 20%) caps position
  // VALUE to $20,000, which at $50/share is only 400 sh — the real
  // binding constraint in this scenario, proving all 3 real caps are
  // actually enforced together, not just the two this file adds.
  const { qty } = sizeEntry({ equity: 100_000, cash: 100_000, entry: 50, stop: 49 });
  assert.strictEqual(qty, 400);
});
ok("a real wide stop -> the $500 dollar cap binds tighter than the % math, real risk never exceeds $500", () => {
  // 0.5% of 100k = $500 risk budget / $10 risk-per-share = 50 sh by
  // risk-pct; that's already within the $500 cap (50*10=$500) — use a
  // scenario where risk-pct alone would authorize MORE than $500 of real
  // risk to prove the dollar cap is the one that actually binds.
  const { qty, riskPerShare } = sizeEntry({ equity: 500_000, cash: 500_000, entry: 100, stop: 98 });
  // 0.5% of 500k = $2500 risk budget / $2 risk-per-share = 1250 sh by
  // risk-pct alone -> $2500 real risk, way over the real $500 ceiling.
  assert.ok(qty * riskPerShare <= MAX_TRADE_RISK_DOLLARS + 1e-9, `real dollar risk ${qty * riskPerShare} must never exceed the real $${MAX_TRADE_RISK_DOLLARS} cap`);
  assert.strictEqual(qty, 250, "expected the $500 cap / $2 risk-per-share = 250 sh to be the real binding constraint");
});
ok("insufficient real cash caps sizing below what the risk-pct math alone would allow", () => {
  const { qty } = sizeEntry({ equity: 100_000, cash: 200, entry: 50, stop: 49 });
  assert.ok(qty <= 4, `only $200 real cash at $50/share should cap qty to 4, got ${qty}`);
});
ok("an invalid stop (>= entry) is honestly rejected, never a fabricated size", () => {
  const { qty, reason } = sizeEntry({ equity: 100_000, cash: 100_000, entry: 50, stop: 51 });
  assert.strictEqual(qty, 0);
  assert.ok(reason);
});
ok("a real setup that risks less than $500 at the % sizing is never artificially shrunk further by the $ cap", () => {
  // 0.5% of 10k = $50 risk budget / $5 risk-per-share = 10 sh -> $50 real
  // risk, already well under the $500 cap — the cap must not bind here.
  const { qty } = sizeEntry({ equity: 10_000, cash: 10_000, entry: 50, stop: 45 });
  assert.strictEqual(qty, 10);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("AUTOPILOT2-ENGINE TEST FAILED"); else console.log("AUTOPILOT2-ENGINE TEST OK");
