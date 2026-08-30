// Real tests for src/autopilot2-account.js's realFillPrice — the one pure,
// network-free function in this file (openPosition/closePosition/
// getAccountSnapshot all do real quote fetches + real file I/O against
// data/autopilot2-account.json, same "test the pure helpers, not the
// file/network-wrapped orchestration" convention this session already
// used for aplus-score-history.js/edge-decay-tracker.js — and the same
// reason server-autopilot.js/lightbox-autopilot-execute.js, this file's
// closest real precedents, have no dedicated unit test file either).
// Pure-function, synthetic-input, zero-network.
// Run: node test/autopilot2-account.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { realFillPrice, STARTING_CAPITAL, computePartialCloseQty } = require("../src/autopilot2-account");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking realFillPrice — real bid/ask-aware fills, honest degrade otherwise…");
ok("STARTING_CAPITAL is the real disclosed $100,000", () => {
  assert.strictEqual(STARTING_CAPITAL, 100_000);
});
ok("a real BUY fills at the real ask when the quote has one — never a naive mid-price fill", () => {
  const fill = realFillPrice({ regularMarketPrice: 100, bid: 99.5, ask: 100.5 }, "BUY");
  assert.strictEqual(fill, 100.5);
});
ok("a real SELL fills at the real bid when the quote has one", () => {
  const fill = realFillPrice({ regularMarketPrice: 100, bid: 99.5, ask: 100.5 }, "SELL");
  assert.strictEqual(fill, 99.5);
});
ok("no real bid/ask on the quote — BUY honestly degrades to price + a small disclosed default spread, never the bare mid", () => {
  const fill = realFillPrice({ regularMarketPrice: 100 }, "BUY");
  assert.ok(fill > 100, `expected a real fill above the bare mid price, got ${fill}`);
  assert.ok(fill < 100.1, `default spread should be small, got ${fill}`);
});
ok("no real bid/ask on the quote — SELL honestly degrades below the bare mid, mirroring BUY", () => {
  const fill = realFillPrice({ regularMarketPrice: 100 }, "SELL");
  assert.ok(fill < 100, `expected a real fill below the bare mid price, got ${fill}`);
});
ok("a zero/invalid real bid is ignored, not fabricated into a fill", () => {
  const fill = realFillPrice({ regularMarketPrice: 100, bid: 0, ask: 0 }, "SELL");
  assert.ok(fill < 100, "should fall through to the honest default-spread degrade, not use the invalid real 0 bid");
});
ok("no real quote at all returns honest null, never a guessed price", () => {
  assert.strictEqual(realFillPrice(null, "BUY"), null);
  assert.strictEqual(realFillPrice({ regularMarketPrice: 0 }, "BUY"), null);
});

console.log("\nChecking computePartialCloseQty — real fractional crypto qty vs. real whole-unit stock/call qty (2026-08-30)…");
ok("a STOCK position floors to a real whole share, minimum 1", () => {
  assert.strictEqual(computePartialCloseQty({ assetType: "STOCK", qty: 10 }, 0.5), 5);
  assert.strictEqual(computePartialCloseQty({ assetType: "STOCK", qty: 1 }, 0.5), 1, "must never round a real 1-share position down to 0");
});
ok("a real CRYPTO position keeps its real fractional precision — the bug this replaces: Math.max(1, Math.floor(...)) would have force-sold a WHOLE unit here", () => {
  const qty = computePartialCloseQty({ assetType: "CRYPTO", qty: 0.05 }, 0.5);
  assert.strictEqual(qty, 0.025);
  assert.ok(qty < 1, "must never force-round a real fractional crypto position up to a whole unit — that would oversell the real position");
});
ok("a real CRYPTO position rounds to 6 decimal places, not a raw float", () => {
  const qty = computePartialCloseQty({ assetType: "CRYPTO", qty: 0.1333335 }, 0.5);
  assert.strictEqual(qty, Math.floor(qty * 1e6) / 1e6);
});
ok("a CALL position (not CRYPTO) keeps the real whole-contract floor", () => {
  assert.strictEqual(computePartialCloseQty({ assetType: "CALL", qty: 4 }, 0.5), 2);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("AUTOPILOT2-ACCOUNT TEST FAILED"); else console.log("AUTOPILOT2-ACCOUNT TEST OK");
