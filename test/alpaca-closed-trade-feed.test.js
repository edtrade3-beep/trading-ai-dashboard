// Real tests for src/alpaca-closed-trade-feed.js — Unified Autopilot
// merge, Stage 4. Mocks routes/alpaca.js's own getClosedTrades (a real
// network call) rather than hitting a live Alpaca account; everything
// downstream (trade-gps-audit-store.js persistence, dedup) is real.
const assert = require("node:assert");
const fs = require("node:fs");
const { STORE_PATH } = require("../src/trade-gps-audit-store");
const alpacaRoutes = require("../src/routes/alpaca");
const { syncAlpacaClosedTrades } = require("../src/alpaca-closed-trade-feed");
const { getRecentClosedTrades, getRawRecordsBySource } = require("../src/trade-gps-audit-store");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }
async function okAsync(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

function resetStore() { try { fs.writeFileSync(STORE_PATH, JSON.stringify({ records: [] })); } catch {} }

const realTrade = { symbol: "AAPL", side: "long", qty: 10, entry: 200, exit: 210, pnl: 100, openedAt: "2026-09-01T14:00:00Z", closedAt: "2026-09-02T15:00:00Z" };

console.log("Checking syncAlpacaClosedTrades — real dedup + source tagging, mocked broker call…");

async function run() {
  resetStore();

  await okAsync("a real closed trade gets recorded once, tagged source:alpaca-real", async () => {
    alpacaRoutes.getClosedTrades = async () => ({ ok: true, trades: [realTrade] });
    const result = await syncAlpacaClosedTrades();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.synced, 1);
    const tagged = getRawRecordsBySource("alpaca-real");
    assert.strictEqual(tagged.length, 1);
    assert.strictEqual(tagged[0].symbol, "AAPL");
    assert.strictEqual(tagged[0].outcome.pnl, 100);
  });

  await okAsync("re-running with the SAME real trade never double-records it", async () => {
    alpacaRoutes.getClosedTrades = async () => ({ ok: true, trades: [realTrade] });
    const result = await syncAlpacaClosedTrades();
    assert.strictEqual(result.synced, 0);
    assert.strictEqual(getRawRecordsBySource("alpaca-real").length, 1);
  });

  await okAsync("a genuinely new real trade for the same symbol IS recorded (real dedup key includes closedAt/qty/exit, not just symbol)", async () => {
    const secondTrade = { ...realTrade, exit: 220, pnl: 200, closedAt: "2026-09-03T15:00:00Z" };
    alpacaRoutes.getClosedTrades = async () => ({ ok: true, trades: [realTrade, secondTrade] });
    const result = await syncAlpacaClosedTrades();
    assert.strictEqual(result.synced, 1);
    assert.strictEqual(getRawRecordsBySource("alpaca-real").length, 2);
  });

  await okAsync("a real broker failure is reported honestly, never silently swallowed as zero trades", async () => {
    alpacaRoutes.getClosedTrades = async () => ({ ok: false, error: "activities error" });
    const result = await syncAlpacaClosedTrades();
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, "activities error");
  });

  ok("getRecentClosedTrades(source:'alpaca-real') never includes Autopilot 2.0's own source:null records", () => {
    resetStore();
    const { recordSetupEvent } = require("../src/trade-gps-audit-store");
    recordSetupEvent({ symbol: "TSLA", outcome: { pnl: -50 }, source: null }); // Autopilot 2.0 convention
    recordSetupEvent({ symbol: "TSLA", outcome: { pnl: 75 }, source: "alpaca-real" });
    const alpacaOnly = getRecentClosedTrades({ window: 20, source: "alpaca-real" });
    assert.strictEqual(alpacaOnly.length, 1);
    assert.strictEqual(alpacaOnly[0].pnl, 75);
    const autopilot2Only = getRecentClosedTrades({ window: 20, source: null });
    assert.strictEqual(autopilot2Only.length, 1);
    assert.strictEqual(autopilot2Only[0].pnl, -50);
  });

  resetStore();
  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("ALPACA-CLOSED-TRADE-FEED TEST FAILED");
  else console.log("ALPACA-CLOSED-TRADE-FEED TEST OK");
}

run();
