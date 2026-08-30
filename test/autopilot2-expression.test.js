// Real tests for src/autopilot2-expression.js's decideFromChain (the pure
// STOCK/CALL decision core, extracted from chooseExpression's real chain
// fetch for direct synthetic testing) and src/autopilot2-engine.js's
// sizeOptionEntry — same "test the pure helpers, not the network-wrapped
// orchestration" convention as this session's other engine tests.
// Pure-function, synthetic-input, zero-network.
// Run: node test/autopilot2-expression.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { decideFromChain, DELTA_MIN, DELTA_MAX, MAX_SPREAD_PCT } = require("../src/autopilot2-expression");
const { MIN_LIQUIDITY } = require("../src/strategy-selector");
const { sizeOptionEntry } = require("../src/autopilot2-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const OPP = { symbol: "AAPL", score: 80, price: 200 };

// A real, liquid, in-band contract — tight spread, real OI/volume.
function liquidCall(overrides = {}) {
  return { contractSymbol: "AAPL240119C00200000", strike: 200, delta: 0.70, bid: 9.8, ask: 10.0, openInterest: 3000, volume: 1500, iv: 30, expiry: "2026-10-16", ...overrides };
}

console.log("Checking decideFromChain — real STOCK/CALL decision, honest fallback…");
ok("no real chain at all -> STOCK, never a guess", () => {
  const r = decideFromChain(OPP, null, null);
  assert.strictEqual(r.expression, "STOCK");
});
ok("a real chain with zero calls -> STOCK", () => {
  const r = decideFromChain(OPP, { underlying: 200, calls: [] }, "2026-10-16");
  assert.strictEqual(r.expression, "STOCK");
});
ok(`no real call inside the ${DELTA_MIN}-${DELTA_MAX} delta band -> STOCK`, () => {
  const r = decideFromChain(OPP, { underlying: 200, calls: [liquidCall({ delta: 0.20 })] }, "2026-10-16");
  assert.strictEqual(r.expression, "STOCK");
});
ok("a real liquid, tight-spread, in-band call -> CALL, with the real contract attached", () => {
  const r = decideFromChain(OPP, { underlying: 200, calls: [liquidCall()] }, "2026-10-16");
  assert.strictEqual(r.expression, "CALL");
  assert.strictEqual(r.contract.contractSymbol, "AAPL240119C00200000");
});
ok(`Good Stock / Bad Option: liquidity below the real ${MIN_LIQUIDITY} floor -> STOCK, not a fabricated CALL`, () => {
  // Wide spread + thin OI/volume -> a real low liquidityScore.
  const r = decideFromChain(OPP, { underlying: 200, calls: [liquidCall({ bid: 5, ask: 15, openInterest: 1, volume: 0 })] }, "2026-10-16");
  assert.strictEqual(r.expression, "STOCK");
  assert.match(r.reason, /Good Stock \/ Bad Option/);
});
ok(`Good Stock / Bad Option: real spread% over the ${MAX_SPREAD_PCT}% ceiling -> STOCK`, () => {
  // Decent OI/volume (keeps liquidityScore's other components high) but a
  // real wide spread on its own should still trip the spread ceiling.
  const r = decideFromChain(OPP, { underlying: 200, calls: [liquidCall({ bid: 8, ask: 10, openInterest: 5000, volume: 3000 })] }, "2026-10-16");
  // bid/ask=8/10 -> spread% = (10-8)/9*100 ≈ 22.2%, over the real ceiling.
  assert.strictEqual(r.expression, "STOCK");
});
ok("a real contract with no real ask price refuses rather than fabricates an entry premium", () => {
  const r = decideFromChain(OPP, { underlying: 200, calls: [liquidCall({ ask: 0 })] }, "2026-10-16");
  assert.strictEqual(r.expression, "STOCK");
});
ok("a real provider-supplied delta is tagged deltaSource:provider, never re-estimated", () => {
  const r = decideFromChain(OPP, { underlying: 200, calls: [liquidCall()] }, "2026-10-16");
  assert.strictEqual(r.expression, "CALL");
  assert.strictEqual(r.contract.deltaSource, "provider");
});

console.log("\nChecking the real Black-Scholes delta-estimation fallback (2026-08-30 fix — Yahoo's free chain has no real greeks, delta:null, which previously meant CALL could never be selected without a POLYGON_API_KEY)…");
// Same shape providers/yahoo.js's fetchYahooOptionsChain actually returns:
// delta explicitly null, but real iv/strike/expiry present.
function yahooShapedCall(overrides = {}) {
  return { contractSymbol: "AAPL240119C00200000", strike: 195, delta: null, bid: 9.8, ask: 10.0, openInterest: 3000, volume: 1500, iv: 30, dte: 30, expiry: "2026-10-16", ...overrides };
}
ok("a real Yahoo-shaped chain (delta:null, real iv/strike) still selects CALL via the estimated delta", () => {
  const r = decideFromChain(OPP, { underlying: 200, calls: [yahooShapedCall()] }, "2026-10-16");
  assert.strictEqual(r.expression, "CALL", r.reason);
  assert.strictEqual(r.contract.deltaSource, "estimated");
  assert.ok(r.contract.delta >= DELTA_MIN && r.contract.delta <= DELTA_MAX, `estimated delta ${r.contract.delta} should land in-band for a real $195 strike vs $200 underlying`);
  assert.match(r.reason, /estimated via Black-Scholes/);
});
ok("a Yahoo-shaped deep OTM call (delta:null) estimates a real LOW delta and is correctly excluded, not forced into range", () => {
  const r = decideFromChain(OPP, { underlying: 200, calls: [yahooShapedCall({ strike: 260 })] }, "2026-10-16");
  assert.strictEqual(r.expression, "STOCK");
});
ok("delta:null AND no real iv (nothing to estimate from) honestly falls back to STOCK, never a guessed delta", () => {
  const r = decideFromChain(OPP, { underlying: 200, calls: [yahooShapedCall({ iv: null })] }, "2026-10-16");
  assert.strictEqual(r.expression, "STOCK");
});

console.log("Checking sizeOptionEntry — real contract-count sizing, same real risk budget as a stock trade…");
ok("real risk budget / (premium x 100) determines contract count", () => {
  // 0.5% of 100k = $500 risk budget; $2.00 premium x 100 = $200/contract -> 2 contracts.
  const { qty } = sizeOptionEntry({ equity: 100_000, cash: 100_000, entryPremium: 2.00 });
  assert.strictEqual(qty, 2);
});
ok("insufficient real cash caps contract count below the risk-budget math alone", () => {
  const { qty } = sizeOptionEntry({ equity: 100_000, cash: 150, entryPremium: 2.00 });
  assert.ok(qty <= 0, `only $150 real cash at $200/contract should allow 0 contracts, got ${qty}`);
});
ok("no real premium is honestly rejected, never a fabricated size", () => {
  const { qty, reason } = sizeOptionEntry({ equity: 100_000, cash: 100_000, entryPremium: 0 });
  assert.strictEqual(qty, 0);
  assert.ok(reason);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("AUTOPILOT2-EXPRESSION TEST FAILED"); else console.log("AUTOPILOT2-EXPRESSION TEST OK");
