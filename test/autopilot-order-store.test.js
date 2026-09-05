// Real tests for src/autopilot-order-store.js — persisted transition log,
// same {records:[]}/atomic-write.js pattern as trade-gps-audit-store.js.
// Unified Autopilot merge, Stage 3.
const assert = require("node:assert");
const fs = require("node:fs");
const { startOrder, transition, getOrder, getRecentOrders, STORE_PATH } = require("../src/autopilot-order-store");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

function resetStore() { try { fs.writeFileSync(STORE_PATH, JSON.stringify({ records: [] })); } catch {} }

console.log("Checking autopilot-order-store — real persisted transition log…");

resetStore();

ok("startOrder persists a real RECEIVED record and returns it", () => {
  const rec = startOrder({ symbol: "AAPL", source: "test" });
  assert.strictEqual(rec.symbol, "AAPL");
  assert.strictEqual(rec.currentState, "RECEIVED");
  const reloaded = getOrder(rec.id);
  assert.ok(reloaded);
  assert.strictEqual(reloaded.currentState, "RECEIVED");
});

ok("transition() persists a real, validated state change", () => {
  const rec = startOrder({ symbol: "MSFT", source: "test" });
  const updated = transition(rec.id, "VALIDATING", { reason: "eligible" });
  assert.strictEqual(updated.currentState, "VALIDATING");
  const reloaded = getOrder(rec.id);
  assert.strictEqual(reloaded.currentState, "VALIDATING");
  assert.strictEqual(reloaded.history.length, 2);
});

ok("transition() throws on a real invalid jump and never persists it", () => {
  const rec = startOrder({ symbol: "TSLA", source: "test" });
  assert.throws(() => transition(rec.id, "CLOSED"));
  const reloaded = getOrder(rec.id);
  assert.strictEqual(reloaded.currentState, "RECEIVED"); // unchanged
});

ok("transition() on an unknown id is an honest no-op, never fabricates a record", () => {
  const result = transition("does-not-exist", "VALIDATING");
  assert.strictEqual(result, null);
});

ok("getRecentOrders filters by symbol and source, real data only", () => {
  resetStore();
  startOrder({ symbol: "AAPL", source: "server-autopilot" });
  startOrder({ symbol: "AAPL", source: "lightbox" });
  startOrder({ symbol: "NVDA", source: "server-autopilot" });
  const bySymbol = getRecentOrders({ symbol: "AAPL" });
  assert.strictEqual(bySymbol.length, 2);
  const bySource = getRecentOrders({ source: "server-autopilot" });
  assert.strictEqual(bySource.length, 2);
});

resetStore();
console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("AUTOPILOT-ORDER-STORE TEST FAILED");
else console.log("AUTOPILOT-ORDER-STORE TEST OK");
