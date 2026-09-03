// Real tests for src/universe-builder.js — the dynamic, liquidity-filtered
// stock universe built for the Phase 0 audit's mega-cap-bias fix. Tests the
// pure filtering/ranking logic and the local rotation-cursor mechanism
// directly (no network — refreshDynamicUniverse() itself hits real Alpaca
// endpoints and is intentionally NOT unit-tested here, matching this
// codebase's existing convention that async/network-dependent fetch
// functions like fetchWatchlistCandidates/fetchDaytradeUniverseCandidates
// have no direct unit test either). Snapshot-reset-restore over the real
// dynamic-universe.json/dynamic-universe-cursor.json stores this file
// touches, same discipline as test/ignored-alert-tracker.test.js. Run:
// node test/universe-builder.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const fs = require("fs");
const { writeJsonAtomic, readJsonSafe } = require("../src/atomic-write");
const {
  filterTradableAssets, rankByLiquidity, getDynamicUniverse, getUniverseRotationBatch,
  MIN_PRICE, MIN_DOLLAR_VOLUME, MAX_UNIVERSE_SIZE, UNIVERSE_PATH, CURSOR_PATH,
} = require("../src/universe-builder");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

const originalUniverseExists = fs.existsSync(UNIVERSE_PATH);
const originalUniverse = originalUniverseExists ? readJsonSafe(UNIVERSE_PATH, null) : null;
const originalCursorExists = fs.existsSync(CURSOR_PATH);
const originalCursor = originalCursorExists ? readJsonSafe(CURSOR_PATH, null) : null;

try {
  console.log("Checking filterTradableAssets — real active/tradable/major-exchange/plain-ticker gate…");

  ok("a real tradable, active, NASDAQ common-stock-shaped row passes", () => {
    const out = filterTradableAssets([{ symbol: "AAPL", tradable: true, status: "active", exchange: "NASDAQ" }]);
    assert.deepStrictEqual(out, ["AAPL"]);
  });
  ok("non-tradable is excluded", () => {
    const out = filterTradableAssets([{ symbol: "AAPL", tradable: false, status: "active", exchange: "NASDAQ" }]);
    assert.deepStrictEqual(out, []);
  });
  ok("inactive status is excluded", () => {
    const out = filterTradableAssets([{ symbol: "AAPL", tradable: true, status: "inactive", exchange: "NASDAQ" }]);
    assert.deepStrictEqual(out, []);
  });
  ok("OTC/non-major exchange is excluded", () => {
    const out = filterTradableAssets([{ symbol: "AAPL", tradable: true, status: "active", exchange: "OTC" }]);
    assert.deepStrictEqual(out, []);
  });
  ok("a warrant/unit-style symbol (non-plain-ticker) is excluded", () => {
    const out = filterTradableAssets([{ symbol: "ABCD.WS", tradable: true, status: "active", exchange: "NASDAQ" }]);
    assert.deepStrictEqual(out, []);
  });
  ok("empty/missing input -> honest empty result, never a fabricated list", () => {
    assert.deepStrictEqual(filterTradableAssets([]), []);
    assert.deepStrictEqual(filterTradableAssets(null), []);
  });

  console.log("\nChecking rankByLiquidity — real dollar-volume gate and ranking, no hand-picked names…");

  ok("a row above both the price and dollar-volume floor is kept", () => {
    const out = rankByLiquidity([{ symbol: "XYZ", price: 10, volume: 1_000_000 }]); // $10M/day
    assert.deepStrictEqual(out.map((r) => r.symbol), ["XYZ"]);
  });
  ok(`a row below the $${MIN_DOLLAR_VOLUME.toLocaleString()} dollar-volume floor is dropped`, () => {
    const out = rankByLiquidity([{ symbol: "XYZ", price: 10, volume: 100 }]); // $1,000/day
    assert.deepStrictEqual(out, []);
  });
  ok(`a row below the $${MIN_PRICE} price floor is dropped even with real volume`, () => {
    const out = rankByLiquidity([{ symbol: "PENNY", price: 1, volume: 50_000_000 }]); // $50M/day but sub-$3
    assert.deepStrictEqual(out, []);
  });
  ok("real rows are ranked by dollar volume, highest first — no other ordering signal", () => {
    const out = rankByLiquidity([
      { symbol: "SMALL", price: 10, volume: 600_000 },   // $6M
      { symbol: "BIG", price: 100, volume: 10_000_000 }, // $1B
    ]);
    assert.deepStrictEqual(out.map((r) => r.symbol), ["BIG", "SMALL"]);
  });
  ok(`ranking caps at MAX_UNIVERSE_SIZE (${MAX_UNIVERSE_SIZE}) even with more real liquid rows available`, () => {
    const rows = Array.from({ length: MAX_UNIVERSE_SIZE + 50 }, (_, i) => ({ symbol: `S${i}`, price: 10, volume: 1_000_000 + i }));
    const out = rankByLiquidity(rows);
    assert.strictEqual(out.length, MAX_UNIVERSE_SIZE);
  });
  ok("a non-finite/missing price is dropped, never treated as zero-and-passing", () => {
    const out = rankByLiquidity([{ symbol: "BAD", price: null, volume: 10_000_000 }]);
    assert.deepStrictEqual(out, []);
  });

  console.log("\nChecking getDynamicUniverse — honest empty/stale reporting, no fabricated universe…");

  ok("no persisted universe yet -> honest empty result, marked stale", () => {
    if (fs.existsSync(UNIVERSE_PATH)) fs.unlinkSync(UNIVERSE_PATH);
    const { universe, stale } = getDynamicUniverse();
    assert.deepStrictEqual(universe, []);
    assert.strictEqual(stale, true);
  });
  ok("a freshly-persisted real universe is returned intact and not marked stale", () => {
    writeJsonAtomic(UNIVERSE_PATH, { universe: ["AAPL", "MSFT"], builtAt: Date.now(), sourceCount: 2, liquidCount: 2 });
    const { universe, stale } = getDynamicUniverse();
    assert.deepStrictEqual(universe, ["AAPL", "MSFT"]);
    assert.strictEqual(stale, false);
  });
  ok("a universe persisted long past the refresh window is honestly reported stale", () => {
    writeJsonAtomic(UNIVERSE_PATH, { universe: ["AAPL"], builtAt: Date.now() - 30 * 24 * 3600_000, sourceCount: 1, liquidCount: 1 });
    const { stale } = getDynamicUniverse();
    assert.strictEqual(stale, true);
  });

  console.log("\nChecking getUniverseRotationBatch — real coverage over several ticks, no single-tick blowup…");

  ok("a batch smaller than the universe returns exactly batchSize symbols, no duplicates within the batch", () => {
    writeJsonAtomic(UNIVERSE_PATH, { universe: ["A", "B", "C", "D", "E"], builtAt: Date.now(), sourceCount: 5, liquidCount: 5 });
    writeJsonAtomic(CURSOR_PATH, { cursor: 0 });
    const batch = getUniverseRotationBatch(2);
    assert.strictEqual(batch.length, 2);
    assert.strictEqual(new Set(batch).size, 2);
  });
  ok("consecutive calls advance the cursor so the full universe is covered over several ticks", () => {
    writeJsonAtomic(UNIVERSE_PATH, { universe: ["A", "B", "C", "D", "E"], builtAt: Date.now(), sourceCount: 5, liquidCount: 5 });
    writeJsonAtomic(CURSOR_PATH, { cursor: 0 });
    const seen = new Set();
    for (let i = 0; i < 3; i++) getUniverseRotationBatch(2).forEach((s) => seen.add(s));
    assert.strictEqual(seen.size, 5, "3 batches of 2 over a 5-symbol universe must cover all 5 real symbols");
  });
  ok("the cursor wraps around cleanly rather than erroring past the end of the universe", () => {
    writeJsonAtomic(UNIVERSE_PATH, { universe: ["A", "B", "C"], builtAt: Date.now(), sourceCount: 3, liquidCount: 3 });
    writeJsonAtomic(CURSOR_PATH, { cursor: 2 });
    const batch = getUniverseRotationBatch(2);
    assert.deepStrictEqual(batch, ["C", "A"]);
  });
  ok("no persisted universe -> honest empty batch, never a fabricated one", () => {
    if (fs.existsSync(UNIVERSE_PATH)) fs.unlinkSync(UNIVERSE_PATH);
    assert.deepStrictEqual(getUniverseRotationBatch(10), []);
  });
} finally {
  if (originalUniverseExists) writeJsonAtomic(UNIVERSE_PATH, originalUniverse);
  else if (fs.existsSync(UNIVERSE_PATH)) fs.unlinkSync(UNIVERSE_PATH);
  if (originalCursorExists) writeJsonAtomic(CURSOR_PATH, originalCursor);
  else if (fs.existsSync(CURSOR_PATH)) fs.unlinkSync(CURSOR_PATH);
}

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("UNIVERSE-BUILDER TEST FAILED"); else console.log("UNIVERSE-BUILDER TEST OK");
