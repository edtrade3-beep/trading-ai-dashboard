// Real tests for src/market-command-center.js's pure/composable pieces —
// A+ Market Intelligence V1.1 (see .claude/plans/proud-yawning-unicorn.md).
// This module is mostly an aggregator over already-tested engines
// (market-regime-engine.js, market-context-engine.js — see
// test/market-context-engine.test.js); these tests cover the genuinely
// new logic here: driver ranking, VIX risk banding, and the watchlist
// earnings lookup's real dte-bucketing.
"use strict";
const assert = require("node:assert");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }
async function okAsync(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking market-command-center.js — riskLevelFromVix, topDrivers, watchlist earnings lookup…");

const { topDrivers, riskLevelFromVix, findWatchlistEarnings } = require("../src/market-command-center");

ok("riskLevelFromVix bands a real low VIX as LOW", () => {
  assert.strictEqual(riskLevelFromVix(12).level, "LOW");
});
ok("riskLevelFromVix bands a real calm VIX as NORMAL", () => {
  assert.strictEqual(riskLevelFromVix(17).level, "NORMAL");
});
ok("riskLevelFromVix bands a real elevated VIX as ELEVATED", () => {
  assert.strictEqual(riskLevelFromVix(24).level, "ELEVATED");
});
ok("riskLevelFromVix bands a real high VIX as HIGH", () => {
  assert.strictEqual(riskLevelFromVix(30).level, "HIGH");
});
ok("riskLevelFromVix bands a real crisis VIX as EXTREME", () => {
  assert.strictEqual(riskLevelFromVix(40).level, "EXTREME");
});
ok("riskLevelFromVix is honest (UNKNOWN, never a fabricated band) when VIX is unavailable", () => {
  assert.strictEqual(riskLevelFromVix(null).level, "UNKNOWN");
  assert.strictEqual(riskLevelFromVix(NaN).level, "UNKNOWN");
});

ok("topDrivers ranks real sub-factors by |value| and returns real sentences, not raw labels", () => {
  const marketContext = {
    fedPressure: { value: 10, label: "DOVISH" },
    inflationPressure: { value: -60, label: "ELEVATED" },
    volatility: { value: 25, label: "CONTAINED" },
  };
  const drivers = topDrivers(marketContext, 2);
  assert.strictEqual(drivers.length, 2);
  assert.strictEqual(drivers[0], "Inflation pressure elevated"); // |−60| is the largest magnitude
});

ok("topDrivers never fabricates a driver for a sub-factor that's honestly null (missing real data)", () => {
  const drivers = topDrivers({ fedPressure: null, inflationPressure: { value: -30, label: "ELEVATED" } });
  assert.deepStrictEqual(drivers, ["Inflation pressure elevated"]);
});

ok("topDrivers returns an honest empty list when nothing is resolved, never guesses", () => {
  assert.deepStrictEqual(topDrivers({}), []);
});

(async () => {
  console.log("\nChecking findWatchlistEarnings — real dte bucketing (mocked Yahoo batch)…");

  // Same technique unified-autopilot-engine.test.js/alpaca-closed-trade-
  // feed.test.js already established: patch the module's own export
  // BEFORE the function under test does its own lazy require.
  const yahoo = require("../src/providers/yahoo");
  const now = Date.now();
  const daysFromNow = (d) => Math.round((now + d * 86400000) / 1000);

  await okAsync("real upcoming earnings (positive dte) is picked as the nearest one", async () => {
    yahoo.fetchYahooQuoteBatch = async () => [
      { symbol: "NVDA", earningsTimestamp: daysFromNow(10) },
      { symbol: "AAPL", earningsTimestamp: daysFromNow(2) },
      { symbol: "MSFT", earningsTimestamp: daysFromNow(20) },
    ];
    const { upcoming } = await findWatchlistEarnings(["NVDA", "AAPL", "MSFT"]);
    assert.strictEqual(upcoming.symbol, "AAPL");
    assert.ok(upcoming.dte >= 1 && upcoming.dte <= 3);
  });

  await okAsync("a real recently-past earnings (within 5 days) is picked for the expectation-gap candidate", async () => {
    yahoo.fetchYahooQuoteBatch = async () => [
      { symbol: "TSLA", earningsTimestamp: daysFromNow(-2) },
      { symbol: "AMD", earningsTimestamp: daysFromNow(-20) }, // too old, real 5-day window excludes it
    ];
    const { recentlyReported } = await findWatchlistEarnings(["TSLA", "AMD"]);
    assert.strictEqual(recentlyReported.symbol, "TSLA");
  });

  await okAsync("no real symbol has a resolvable earnings date -> honest nulls, never fabricated", async () => {
    yahoo.fetchYahooQuoteBatch = async () => [{ symbol: "XYZ" }];
    const r = await findWatchlistEarnings(["XYZ"]);
    assert.strictEqual(r.upcoming, null);
    assert.strictEqual(r.recentlyReported, null);
  });

  await okAsync("an empty watchlist is an honest no-op, never calls the broker", async () => {
    let called = false;
    yahoo.fetchYahooQuoteBatch = async () => { called = true; return []; };
    const r = await findWatchlistEarnings([]);
    assert.strictEqual(r.upcoming, null);
    assert.strictEqual(called, false);
  });

  await okAsync("a real fetch failure degrades to honest nulls, never throws", async () => {
    yahoo.fetchYahooQuoteBatch = async () => { throw new Error("network blip"); };
    const r = await findWatchlistEarnings(["NVDA"]);
    assert.strictEqual(r.upcoming, null);
    assert.strictEqual(r.recentlyReported, null);
  });

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("MARKET-COMMAND-CENTER TEST FAILED");
  else console.log("MARKET-COMMAND-CENTER TEST OK");
})();
