// Real tests for src/routes/under10.js's scoreStock price gate —
// previously ZERO test coverage (confirmed before writing this). Covers
// the 2026-08-26 change: the old hard-coded `price > 50` gate became a
// real, disclosed $20 default, overridable via a real `maxPrice` param
// (never silently changing behavior for a caller who passes its own
// value). Pure-function, synthetic-input, zero-network.
// Run: node test/under10-price-gate.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { scoreStock, DEFAULT_MAX_PRICE } = require("../src/routes/under10");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

// Real-shaped synthetic bars: a mild 90-day uptrend with a real volume
// build-up in the last 5 days (drives volTrend/rvol) — enough for a
// genuinely strong `total` score so a null result in these tests can only
// be attributed to the price gate, not the unrelated quality filters.
function makeBars(startPrice, days = 90) {
  const bars = [];
  let price = startPrice;
  for (let i = 0; i < days; i++) {
    const drift = 1 + (i % 7 === 0 ? -0.01 : 0.006);
    price = price * drift;
    const inLastWeek = i >= days - 5;
    const vol = inLastWeek ? 450_000 : 200_000;
    bars.push({ c: price, h: price * 1.02, l: price * 0.98, v: vol });
  }
  return bars;
}

console.log("Checking scoreStock — real price gate, real disclosed default…");
ok(`DEFAULT_MAX_PRICE is the real disclosed $20 ceiling`, () => {
  assert.strictEqual(DEFAULT_MAX_PRICE, 20);
});
ok("a real $15 stock passes the default $20 gate", () => {
  const bars = makeBars(10);
  const price = 15;
  const quoteRow = { regularMarketPrice: price, fiftyTwoWeekHigh: price * 1.6, fiftyTwoWeekLow: price * 0.7, regularMarketVolume: 450_000 };
  const r = scoreStock("TEST", quoteRow, {}, bars);
  assert.ok(r, "expected a real scored result under the default $20 ceiling");
  assert.strictEqual(r.price, price);
});
ok("a real $25 stock is excluded under the default $20 ceiling", () => {
  const bars = makeBars(18);
  const quoteRow = { regularMarketPrice: 25, fiftyTwoWeekHigh: 40, fiftyTwoWeekLow: 17, regularMarketVolume: 450_000 };
  const r = scoreStock("TEST", quoteRow, {}, bars);
  assert.strictEqual(r, null, "a $25 stock must not pass the real $20 default gate");
});
ok("a real $25 stock passes when the caller explicitly raises maxPrice — never silently overridden", () => {
  const bars = makeBars(18);
  const quoteRow = { regularMarketPrice: 25, fiftyTwoWeekHigh: 40, fiftyTwoWeekLow: 17, regularMarketVolume: 450_000 };
  const r = scoreStock("TEST", quoteRow, {}, bars, 30);
  assert.ok(r, "expected a real scored result once the caller raises maxPrice to 30");
  assert.strictEqual(r.price, 25);
});
ok("a real $15 stock is excluded when the caller explicitly lowers maxPrice — never silently ignored", () => {
  const bars = makeBars(10);
  const quoteRow = { regularMarketPrice: 15, fiftyTwoWeekHigh: 24, fiftyTwoWeekLow: 10, regularMarketVolume: 450_000 };
  const r = scoreStock("TEST", quoteRow, {}, bars, 10);
  assert.strictEqual(r, null, "a $15 stock must not pass a real caller-supplied $10 ceiling");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("UNDER10-PRICE-GATE TEST FAILED"); else console.log("UNDER10-PRICE-GATE TEST OK");
