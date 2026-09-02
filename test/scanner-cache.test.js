"use strict";
const assert = require("node:assert");
const { cached } = require("../src/utils");
const { normalizeWatchlistScreenSymbols } = require("../src/routes/market");

let passed = 0;
async function ok(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { console.error(`  ✗ ${name}\n    ${err.message}`); process.exitCode = 1; }
}

(async () => {
  console.log("Checking scanner-cache invariants…");

  await ok("symbol-list cache keys are case/order/duplicate insensitive", () => {
    assert.deepStrictEqual(normalizeWatchlistScreenSymbols([" msft ", "AAPL", "msft", "", null]), ["AAPL", "MSFT"]);
    assert.deepStrictEqual(normalizeWatchlistScreenSymbols(null), []);
  });

  await ok("simultaneous cache misses share one in-flight computation", async () => {
    let calls = 0;
    const key = `scanner-cache:inflight:${Date.now()}`;
    const fn = async () => { calls++; await new Promise((resolve) => setTimeout(resolve, 10)); return { rows: [1] }; };
    const [a, b] = await Promise.all([cached(key, 1000, fn), cached(key, 1000, fn)]);
    assert.strictEqual(calls, 1);
    assert.deepStrictEqual(a, b);
  });

  await ok("a settled value is reused inside TTL and recomputed after expiry", async () => {
    let calls = 0;
    const key = `scanner-cache:ttl:${Date.now()}`;
    const fn = () => ++calls;
    assert.strictEqual(await cached(key, 15, fn), 1);
    assert.strictEqual(await cached(key, 15, fn), 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.strictEqual(await cached(key, 15, fn), 2);
  });

  await ok("a rejected computation is evicted immediately", async () => {
    let calls = 0;
    const key = `scanner-cache:reject:${Date.now()}`;
    await assert.rejects(cached(key, 1000, () => { calls++; throw new Error("expected"); }));
    assert.strictEqual(await cached(key, 1000, () => { calls++; return "recovered"; }), "recovered");
    assert.strictEqual(calls, 2);
  });

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("SCANNER-CACHE TEST FAILED");
  else console.log("SCANNER-CACHE TEST OK");
})();
