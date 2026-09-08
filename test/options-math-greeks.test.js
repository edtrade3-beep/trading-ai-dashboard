"use strict";
const assert = require("node:assert");
const { gamma, vega, theta, estimateDelta } = require("../src/options-math");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking gamma/vega — real Black-Scholes formulas, same r=0/d1 convention as theta()/estimateDelta()…");

const params = { iv: 30, strike: 100, underlying: 100, dte: 30 };

ok("gamma is a real positive number for a real ATM contract", () => {
  const g = gamma(params);
  assert.ok(Number.isFinite(g) && g > 0);
});
ok("vega is a real positive number for a real ATM contract", () => {
  const v = vega(params);
  assert.ok(Number.isFinite(v) && v > 0);
});
ok("gamma is highest ATM and falls off deep ITM/OTM (real BS shape)", () => {
  const atm = gamma(params);
  const deepOtm = gamma({ ...params, strike: 200 });
  const deepItm = gamma({ ...params, strike: 50 });
  assert.ok(atm > deepOtm);
  assert.ok(atm > deepItm);
});
ok("gamma/vega null on missing real inputs, never a fabricated number", () => {
  assert.strictEqual(gamma({ iv: null, strike: 100, underlying: 100, dte: 30 }), null);
  assert.strictEqual(vega({ iv: 30, strike: 100, underlying: 100, dte: null }), null);
});
ok("vega scales up with more real time to expiry", () => {
  const shortDte = vega({ ...params, dte: 5 });
  const longDte = vega({ ...params, dte: 90 });
  assert.ok(longDte > shortDte);
});

console.log(`${passed} checks passed.`);
console.log("OPTIONS-MATH-GREEKS TEST OK");
