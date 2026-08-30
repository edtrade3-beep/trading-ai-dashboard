// Real tests for strategy-ranking.js — the Options Strategy Ranking Engine
// (Trade Desk redesign Phase 2, spec §15). Synthetic ranked-contract pools
// (the exact real shape options-math.js's rankContracts produces), zero
// network — same "test the pure engine with synthetic inputs" convention
// as this session's other engine tests.
// Run: node test/strategy-ranking.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const {
  probabilityBeyond, computeStructurePop, computeRiskReward, scoreConstruction, rankAllStrategies,
} = require("../src/strategy-ranking");
const { buildLegs } = require("../src/strategy-selector");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

// A real-shaped synthetic ranked contract — every field rankContracts()
// actually attaches, so buildLegs()'s own leg() extraction (strike/expiry/
// premium/delta/pop/liquidityScore/iv/dte) has real data to read.
function contract({ strike, bid, ask, delta, iv = 30, dte = 30, liquidityScore = 80, pop = 50 }) {
  return { contractSymbol: `SYN${strike}`, strike, expiry: "2026-12-18", bid, ask, lastPrice: (bid + ask) / 2, volume: 500, openInterest: 2000, iv, delta, dte, pop, liquidityScore, rankScore: 70 };
}

console.log("Checking probabilityBeyond — real Black-Scholes N(d2) generalized to any real price level…");

ok("underlying well above the level -> a real high probability of finishing above it", () => {
  const p = probabilityBeyond({ level: 90, underlying: 120, iv: 30, dte: 30, direction: "above" });
  assert.ok(p > 70, `expected a high real probability, got ${p}`);
});

ok("underlying well below the level -> a real low probability of finishing above it", () => {
  const p = probabilityBeyond({ level: 150, underlying: 100, iv: 30, dte: 30, direction: "above" });
  assert.ok(p < 30, `expected a low real probability, got ${p}`);
});

ok("above + below probabilities for the same level sum to 100 — a real complementary pair", () => {
  const above = probabilityBeyond({ level: 105, underlying: 100, iv: 25, dte: 20, direction: "above" });
  const below = probabilityBeyond({ level: 105, underlying: 100, iv: 25, dte: 20, direction: "below" });
  assert.strictEqual(above + below, 100);
});

ok("missing real iv/dte -> honest null, never a guessed probability", () => {
  assert.strictEqual(probabilityBeyond({ level: 100, underlying: 100, iv: null, dte: 30, direction: "above" }), null);
});

console.log("Checking computeStructurePop — real breakeven-based POP per structure…");

ok("Long Calls POP uses the real breakeven (strike + premium), not the raw strike", () => {
  const calls = [contract({ strike: 100, bid: 4.8, ask: 5.2, delta: 0.5 })];
  const c = buildLegs("Long Calls", { calls, puts: [], underlying: 100 });
  assert.ok(c.available);
  const pop = computeStructurePop("Long Calls", c, 100);
  // breakeven = 105; underlying=100 is below breakeven, so real POP should be well under 50%.
  assert.ok(pop < 50, `expected POP under 50 (breakeven above spot), got ${pop}`);
});

ok("Bull Call Spread POP reflects the real net-debit-adjusted breakeven", () => {
  const calls = [contract({ strike: 100, bid: 4.8, ask: 5.2, delta: 0.55 }), contract({ strike: 110, bid: 1.8, ask: 2.2, delta: 0.25 })];
  const c = buildLegs("Bull Call Spread", { calls, puts: [], underlying: 105 });
  assert.ok(c.available);
  const pop = computeStructurePop("Bull Call Spread", c, 105);
  assert.ok(Number.isFinite(pop) && pop > 0 && pop < 100);
});

ok("Iron Condor POP is real probability of staying between the two real short strikes", () => {
  const calls = [contract({ strike: 110, bid: 1.8, ask: 2.2, delta: 0.20 }), contract({ strike: 115, bid: 0.8, ask: 1.0, delta: 0.10 })];
  const puts = [contract({ strike: 90, bid: 1.8, ask: 2.2, delta: -0.20 }), contract({ strike: 85, bid: 0.8, ask: 1.0, delta: -0.10 })];
  const c = buildLegs("Iron Condor", { calls, puts, underlying: 100 });
  assert.ok(c.available);
  const pop = computeStructurePop("Iron Condor", c, 100);
  assert.ok(Number.isFinite(pop) && pop > 0 && pop < 100);
});

console.log("Checking computeRiskReward — real capped ratio vs. real expected-move projection for naked longs…");

ok("a capped spread uses its own real maxProfit/maxLoss ratio", () => {
  const calls = [contract({ strike: 100, bid: 4.8, ask: 5.2, delta: 0.55 }), contract({ strike: 110, bid: 1.8, ask: 2.2, delta: 0.25 })];
  const c = buildLegs("Bull Call Spread", { calls, puts: [], underlying: 105 });
  const rr = computeRiskReward("Bull Call Spread", c, 105);
  assert.ok(Number.isFinite(rr.ratio) && rr.ratio > 0);
});

ok("a naked long call projects a real, bounded return at one real expected move — never an infinite/fabricated ratio", () => {
  const calls = [contract({ strike: 100, bid: 4.8, ask: 5.2, delta: 0.5, iv: 40, dte: 30 })];
  const c = buildLegs("Long Calls", { calls, puts: [], underlying: 100 });
  const rr = computeRiskReward("Long Calls", c, 100);
  assert.ok(Number.isFinite(rr.ratio), "expected a real finite projected return, not null/Infinity");
  assert.ok(Number.isFinite(rr.score) && rr.score >= 0 && rr.score <= 100);
});

console.log("Checking scoreConstruction — the one real composite (disclosed weights)…");

ok("a structure aligned with the real market bias scores its alignment component at 100", () => {
  const calls = [contract({ strike: 100, bid: 4.8, ask: 5.2, delta: 0.5 })];
  const c = buildLegs("Long Calls", { calls, puts: [], underlying: 100 });
  const s = scoreConstruction("Long Calls", c, { underlying: 100, bias: "Bullish", character: "Trending" });
  assert.strictEqual(s.alignment, 100);
});

ok("a structure fighting the real market bias scores its alignment component at 0", () => {
  const calls = [contract({ strike: 100, bid: 4.8, ask: 5.2, delta: 0.5 })];
  const c = buildLegs("Long Calls", { calls, puts: [], underlying: 100 });
  const s = scoreConstruction("Long Calls", c, { underlying: 100, bias: "Bearish", character: "Trending" });
  assert.strictEqual(s.alignment, 0);
});

console.log("Checking rankAllStrategies — real multi-structure ranking off one shared real chain…");

ok("ranks multiple real structures built from the same real chain, best first", () => {
  const calls = [contract({ strike: 100, bid: 4.8, ask: 5.2, delta: 0.55 }), contract({ strike: 110, bid: 1.8, ask: 2.2, delta: 0.25 })];
  const puts = [contract({ strike: 90, bid: 4.8, ask: 5.2, delta: -0.55 }), contract({ strike: 80, bid: 1.8, ask: 2.2, delta: -0.25 })];
  const r = rankAllStrategies({ calls, puts, underlying: 100, bias: "Bullish", character: "Trending" });
  assert.ok(r.ranked.length > 1, "expected more than one real structure to be buildable from this chain");
  for (let i = 1; i < r.ranked.length; i++) assert.ok(r.ranked[i - 1].composite >= r.ranked[i].composite, "ranked list must be sorted best-first");
  assert.strictEqual(r.best, r.ranked[0]);
});

ok("a structure the real chain can't support is reported in `unavailable`, never silently dropped", () => {
  const calls = [contract({ strike: 100, bid: 4.8, ask: 5.2, delta: 0.55 })]; // no OTM call to sell above it
  const r = rankAllStrategies({ calls, puts: [], underlying: 100, bias: "Bullish", character: "Trending" });
  assert.ok(r.unavailable.some((u) => u.strategy === "Bull Call Spread"));
  assert.ok(r.unavailable.some((u) => u.strategy === "Iron Condor"));
});

ok("real bug fix regression (2026-08-30): Iron Condor's netCredit/maxProfit/maxLoss are real finite numbers, never null, when the real chain can build it — buildLegs used to read .premium off the raw pre-leg() contract objects (which never had that field), silently round2()-ing every real Iron Condor's risk numbers to null while still reporting available:true", () => {
  const calls = [
    contract({ strike: 105, bid: 2.8, ask: 3.2, delta: 0.20 }),
    contract({ strike: 110, bid: 1.3, ask: 1.7, delta: 0.10 }),
  ];
  const puts = [
    contract({ strike: 95, bid: 2.8, ask: 3.2, delta: -0.20 }),
    contract({ strike: 90, bid: 1.3, ask: 1.7, delta: -0.10 }),
  ];
  const c = buildLegs("Iron Condor", { calls, puts, underlying: 100 });
  assert.strictEqual(c.available, true, "this real chain has both wings available on both sides — must build");
  assert.ok(Number.isFinite(c.netCredit), `netCredit must be a real finite number, got ${c.netCredit}`);
  assert.ok(Number.isFinite(c.maxProfit), `maxProfit must be a real finite number, got ${c.maxProfit}`);
  assert.ok(Number.isFinite(c.maxLoss), `maxLoss must be a real finite number, got ${c.maxLoss}`);
  // Real hand-computed check: netCredit = (short call premium - long call premium) + (short put premium - long put premium)
  // = (3.0 - 1.5) + (3.0 - 1.5) = 3.0
  assert.strictEqual(c.netCredit, 3.0);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("STRATEGY-RANKING TEST FAILED"); else console.log("STRATEGY-RANKING TEST OK");
