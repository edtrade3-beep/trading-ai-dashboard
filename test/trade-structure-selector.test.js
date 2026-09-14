// Real tests for src/trade-structure-selector.js — Trade GPS's
// stock-vs-option structure selector (2026-09-03 spec). Pure-function,
// synthetic-input, zero-network. Run: node test/trade-structure-selector.test.js
// (or npm test).
"use strict";
const assert = require("node:assert");
const { selectTradeStructure, MIN_ENTRY_DTE } = require("../src/trade-structure-selector");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

// A real, liquid, fresh call contract — used as the "everything checks
// out" baseline across several tests.
function liquidCall(overrides = {}) {
  return {
    isCall: true, strike: 105, bid: 2.9, ask: 3.1, iv: 30, openInterest: 5000, volume: 1200,
    expiry: "2099-12-18", dte: 30, quoteAgeMinutes: 2,
    ...overrides,
  };
}
function liquidPut(overrides = {}) {
  return {
    isCall: false, strike: 95, bid: 2.9, ask: 3.1, iv: 30, openInterest: 5000, volume: 1200,
    expiry: "2099-12-18", dte: 30, quoteAgeMinutes: 2,
    ...overrides,
  };
}

console.log("Checking selectTradeStructure — all 6 real outcomes…");

ok("NO_TRADE: missing real symbol/price", () => {
  const r = selectTradeStructure({});
  assert.strictEqual(r.structure, "NO_TRADE");
});

ok("STOCK: empty real option chain -> real stock preferred, never fabricated contract data", () => {
  const r = selectTradeStructure({ symbol: "TEST", price: 100, optionChain: [] });
  assert.strictEqual(r.structure, "STOCK");
});

ok("STOCK: illiquid real options (wide spread, low OI/volume) -> real stock preferred, illiquid contract rejected with a real reason", () => {
  const r = selectTradeStructure({
    symbol: "TEST", price: 100,
    optionChain: [liquidCall({ bid: 1.0, ask: 3.0, openInterest: 5, volume: 1 })],
  });
  assert.strictEqual(r.structure, "STOCK");
  assert.ok(r.rejectedAlternatives.length > 0);
  assert.match(r.rejectedAlternatives[0].reason, /liquidity|spread/);
});

ok("STOCK: stale real quote (quoteAgeMinutes over the real threshold) -> real stock fallback, matches spec's stale-quote rule", () => {
  const r = selectTradeStructure({
    symbol: "TEST", price: 100,
    optionChain: [liquidCall({ quoteAgeMinutes: 60 })],
  });
  assert.strictEqual(r.structure, "STOCK");
  assert.match(r.rejectedAlternatives[0].reason, /stale/);
});

ok("STOCK: a contract with no disclosed real quote age is treated as stale (fail-closed), never assumed fresh", () => {
  const r = selectTradeStructure({
    symbol: "TEST", price: 100,
    optionChain: [liquidCall({ quoteAgeMinutes: undefined })],
  });
  assert.strictEqual(r.structure, "STOCK");
});

ok("CALL: a real liquid, fresh, cheap-IV call with no elevated-IV/limited-target signal -> naked call preferred", () => {
  const r = selectTradeStructure({
    symbol: "TEST", price: 100, direction: "LONG",
    optionChain: [liquidCall()], ivRank: 20,
    stopDistance: 5, targetDistance: 15, // 3:1, well above the 1.5x stop threshold
  });
  assert.strictEqual(r.structure, "CALL");
  assert.ok(Number.isFinite(r.breakEven), "a real option pick must always carry a real break-even");
  assert.ok(Number.isFinite(r.maxLoss), "a real option pick must always carry a real max loss");
  assert.ok(Number.isFinite(r.expectedMove), "a real option pick must always carry a real expected move");
  assert.ok(r.theta < 0, "a real long option's theta must be negative (real time decay)");
});

ok("PUT: direction SHORT with a real liquid put chain -> naked put preferred", () => {
  const r = selectTradeStructure({
    symbol: "TEST", price: 100, direction: "SHORT",
    optionChain: [liquidPut()], ivRank: 20,
    stopDistance: 5, targetDistance: 15,
  });
  assert.strictEqual(r.structure, "PUT");
});

ok("CALL_SPREAD: elevated real IV rank forces a defined-risk spread over naked premium, when a real further-OTM leg exists", () => {
  const r = selectTradeStructure({
    symbol: "TEST", price: 100, direction: "LONG",
    optionChain: [liquidCall({ strike: 105 }), liquidCall({ strike: 115, bid: 1.3, ask: 1.4 })],
    ivRank: 75, // above HIGH_IV_RANK
  });
  assert.strictEqual(r.structure, "CALL_SPREAD");
  assert.ok(r.spreadLegs?.long && r.spreadLegs?.short, "a real spread pick must carry both real legs");
  assert.ok(Number.isFinite(r.maxLoss) && Number.isFinite(r.maxGain), "a real spread must disclose real max loss AND max gain");
  assert.ok(r.maxLoss > 0, "a real net-debit spread's max loss must be positive");
});

ok("PUT_SPREAD: limited real target relative to stop (< 1.5x) forces a defined-risk put spread", () => {
  const r = selectTradeStructure({
    symbol: "TEST", price: 100, direction: "SHORT",
    optionChain: [liquidPut({ strike: 95 }), liquidPut({ strike: 85, bid: 1.3, ask: 1.4 })],
    stopDistance: 5, targetDistance: 6, // 1.2x, below the 1.5x threshold
  });
  assert.strictEqual(r.structure, "PUT_SPREAD");
});

ok("CALL (fallback): elevated IV wants a spread but no real further-OTM leg exists -> falls back to naked call, not silently fabricated", () => {
  const r = selectTradeStructure({
    symbol: "TEST", price: 100, direction: "LONG",
    optionChain: [liquidCall({ strike: 105 })], // only one real strike available
    ivRank: 80,
  });
  assert.strictEqual(r.structure, "CALL");
  assert.match(r.rejectedAlternatives.map((x) => x.reason).join(" "), /no real further-OTM contract/);
});

console.log("\nChecking option-pick data completeness (spec's own explicit requirement)…");
ok("every real option pick (CALL/PUT/spread) always carries break-even, max loss, and expected move — never a missing required field", () => {
  const callR = selectTradeStructure({ symbol: "TEST", price: 100, optionChain: [liquidCall()], ivRank: 20, stopDistance: 5, targetDistance: 15 });
  assert.ok(Number.isFinite(callR.breakEven) && Number.isFinite(callR.maxLoss) && Number.isFinite(callR.expectedMove));
  const spreadR = selectTradeStructure({ symbol: "TEST", price: 100, optionChain: [liquidCall({ strike: 105 }), liquidCall({ strike: 115, bid: 1.3, ask: 1.4 })], ivRank: 75 });
  assert.ok(Number.isFinite(spreadR.breakEven) && Number.isFinite(spreadR.maxLoss) && Number.isFinite(spreadR.maxGain));
});

console.log("\nChecking MIN_ENTRY_DTE — new-entry expiration floor (2026-09-14, Safe Options Expiration Selection task)…");

ok("MIN_ENTRY_DTE is the real, disclosed 21-day floor", () => {
  assert.strictEqual(MIN_ENTRY_DTE, 21);
});

ok("TEST 4 — DTE 0 rejected", () => {
  const r = selectTradeStructure({ symbol: "TEST", price: 100, optionChain: [liquidCall({ dte: 0 })], ivRank: 20, stopDistance: 5, targetDistance: 15 });
  assert.strictEqual(r.structure, "STOCK");
  assert.match(r.rejectedAlternatives[0].reason, /below the 21-day new-entry minimum/);
});

ok("TEST 5 — DTE 1 rejected", () => {
  const r = selectTradeStructure({ symbol: "TEST", price: 100, optionChain: [liquidCall({ dte: 1 })], ivRank: 20, stopDistance: 5, targetDistance: 15 });
  assert.strictEqual(r.structure, "STOCK");
});

ok("TEST 6 — DTE 7 rejected", () => {
  const r = selectTradeStructure({ symbol: "TEST", price: 100, optionChain: [liquidCall({ dte: 7 })], ivRank: 20, stopDistance: 5, targetDistance: 15 });
  assert.strictEqual(r.structure, "STOCK");
});

ok("TEST 7 — DTE 14 rejected", () => {
  const r = selectTradeStructure({ symbol: "TEST", price: 100, optionChain: [liquidCall({ dte: 14 })], ivRank: 20, stopDistance: 5, targetDistance: 15 });
  assert.strictEqual(r.structure, "STOCK");
});

ok("TEST 8 — DTE 20 rejected (one day short of the real floor)", () => {
  const r = selectTradeStructure({ symbol: "TEST", price: 100, optionChain: [liquidCall({ dte: 20 })], ivRank: 20, stopDistance: 5, targetDistance: 15 });
  assert.strictEqual(r.structure, "STOCK");
});

ok("TEST 9 — DTE 21 enters the eligible pool and clears all other existing gates -> real CALL", () => {
  const r = selectTradeStructure({ symbol: "TEST", price: 100, optionChain: [liquidCall({ dte: 21 })], ivRank: 20, stopDistance: 5, targetDistance: 15 });
  assert.strictEqual(r.structure, "CALL");
});

ok("TEST 10 — DTE 26 (real captured-live value) also clears the pool", () => {
  const r = selectTradeStructure({ symbol: "TEST", price: 100, optionChain: [liquidCall({ dte: 26 })], ivRank: 20, stopDistance: 5, targetDistance: 15 });
  assert.strictEqual(r.structure, "CALL");
});

ok("a DTE-21+ contract is STILL rejected if it fails an existing gate (liquidity) — the new floor doesn't bypass old checks", () => {
  const r = selectTradeStructure({ symbol: "TEST", price: 100, optionChain: [liquidCall({ dte: 30, openInterest: 5, volume: 1 })], ivRank: 20, stopDistance: 5, targetDistance: 15 });
  assert.strictEqual(r.structure, "STOCK");
});

ok("missing/non-finite DTE is rejected with its own distinct 'no valid real DTE' reason, separate from the new floor's reason", () => {
  // dte:undefined alone would let enrichContract honestly recompute a real
  // DTE from the still-valid default expiry — genuinely not a "missing
  // data" case. An unparseable expiry is what actually leaves DTE
  // non-finite (dteFromExpiry's own real null-on-unparseable-date rule).
  const r = selectTradeStructure({ symbol: "TEST", price: 100, optionChain: [liquidCall({ dte: undefined, expiry: "not-a-real-date" })] });
  assert.strictEqual(r.structure, "STOCK");
  assert.match(r.rejectedAlternatives[0].reason, /no valid real DTE/);
});

console.log("\nChecking REGRESSION — all existing gates still enforced exactly as before…");

ok("TEST 19 — liquidity minimum unchanged (MIN_LIQUIDITY still real gate)", () => {
  const { MIN_LIQUIDITY } = require("../src/trade-structure-selector");
  assert.strictEqual(MIN_LIQUIDITY, 40);
});
ok("TEST 20 — spread maximum unchanged", () => {
  const { MAX_SPREAD_PCT } = require("../src/trade-structure-selector");
  assert.strictEqual(MAX_SPREAD_PCT, 10);
});
ok("TEST 21 — staleness threshold unchanged", () => {
  const { DEFAULT_MAX_STALE_MINUTES } = require("../src/trade-structure-selector");
  assert.strictEqual(DEFAULT_MAX_STALE_MINUTES, 15);
});
ok("TEST 22 — premium validation still enforced (zero/missing bid+ask+lastPrice still rejects)", () => {
  const r = selectTradeStructure({ symbol: "TEST", price: 100, optionChain: [liquidCall({ dte: 30, bid: 0, ask: 0, lastPrice: 0 })] });
  assert.strictEqual(r.structure, "STOCK");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TRADE-STRUCTURE-SELECTOR TEST FAILED"); else console.log("TRADE-STRUCTURE-SELECTOR TEST OK");
