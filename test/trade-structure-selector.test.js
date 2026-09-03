// Real tests for src/trade-structure-selector.js — Trade GPS's
// stock-vs-option structure selector (2026-09-03 spec). Pure-function,
// synthetic-input, zero-network. Run: node test/trade-structure-selector.test.js
// (or npm test).
"use strict";
const assert = require("node:assert");
const { selectTradeStructure } = require("../src/trade-structure-selector");

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

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TRADE-STRUCTURE-SELECTOR TEST FAILED"); else console.log("TRADE-STRUCTURE-SELECTOR TEST OK");
