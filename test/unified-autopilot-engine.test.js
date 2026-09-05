// Real tests for src/unified-autopilot-engine.js — the shared execution
// tail server-autopilot.js and lightbox-autopilot-execute.js both now
// call (Unified Autopilot merge, Stage 7, real cutover, not shadow-only
// prep — see .claude/plans/proud-yawning-unicorn.md). This used to be
// two byte-for-byte-duplicated blocks (order build -> broker call ->
// transition log); these checks confirm the one shared function places
// a real bracket order under the real per-symbol lock, records the real
// state-machine transition, and only runs onFilled on a genuine broker
// success — never on a rejection, never twice.
const assert = require("node:assert");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }
async function okAsync(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking unified-autopilot-engine — real shared broker call + transition log…");

// Mock the ONE real network boundary (Alpaca's trading API) before this
// module (or its dependents) are ever required — the same technique
// alpaca-closed-trade-feed.test.js already established: patch the
// module's own export BEFORE anything destructures it, and route the
// patched function through a stable wrapper so later tests can swap
// behavior by reassigning a closed-over variable instead of having to
// re-require the module.
const alpacaClient = require("../src/providers/alpaca-client");
let mockImpl = async () => ({ ok: true, status: 200, data: { id: "mock-order-id" } });
alpacaClient.alpacaTradingRequest = (...args) => mockImpl(...args);

const { placeGatedBracketOrder } = require("../src/unified-autopilot-engine");
const { startOrder, transition, getOrder } = require("../src/autopilot-order-store");

(async () => {
  await okAsync("a real broker success places the order, logs FILLED, and runs onFilled exactly once", async () => {
    const rec = transition(startOrder({ symbol: "AAPL", source: "test" }).id, "VALIDATING");
    const approved = transition(rec.id, "RISK_APPROVED");
    mockImpl = async () => ({ ok: true, status: 200, data: { id: "order-123" } });
    let onFilledCalls = 0;
    const result = await placeGatedBracketOrder({
      symbol: "AAPL", side: "buy", qty: 10, entry: 100, stop: 95, target: 110,
      clientOrderId: "test-aapl-1", orderRecordId: approved.id,
      onFilled: async (res) => { onFilledCalls++; assert.strictEqual(res.data.id, "order-123"); },
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(onFilledCalls, 1);
    assert.strictEqual(getOrder(approved.id).currentState, "FILLED");
  });

  await okAsync("a real broker rejection is reported honestly, logs FAILED with a fixed code, and never calls onFilled", async () => {
    const rec = transition(startOrder({ symbol: "MSFT", source: "test" }).id, "VALIDATING");
    const approved = transition(rec.id, "RISK_APPROVED");
    mockImpl = async () => ({ ok: false, status: 422, data: { message: "insufficient buying power" } });
    let onFilledCalls = 0;
    const result = await placeGatedBracketOrder({
      symbol: "MSFT", side: "buy", qty: 10, entry: 100, stop: 95, target: 110,
      clientOrderId: "test-msft-1", orderRecordId: approved.id,
      onFilled: async () => { onFilledCalls++; },
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, "insufficient buying power");
    assert.strictEqual(onFilledCalls, 0);
    const final = getOrder(approved.id);
    assert.strictEqual(final.currentState, "FAILED");
    assert.strictEqual(final.history[final.history.length - 1].meta.code, "BROKER_ERROR");
  });

  await okAsync("a real network failure (broker call throws/returns null) is treated the same as a rejection, never thrown", async () => {
    mockImpl = async () => { throw new Error("network blip"); };
    const result = await placeGatedBracketOrder({
      symbol: "TSLA", side: "buy", qty: 5, entry: 200, stop: 190, target: 220,
      clientOrderId: "test-tsla-1", orderRecordId: null,
    });
    assert.strictEqual(result.ok, false);
  });

  await okAsync("orderRecordId is optional — omitting it never throws and still places/reports the real order", async () => {
    mockImpl = async () => ({ ok: true, status: 200, data: { id: "order-456" } });
    const result = await placeGatedBracketOrder({ symbol: "NVDA", side: "buy", qty: 3, entry: 500, stop: 480, target: 550, clientOrderId: "test-nvda-1" });
    assert.strictEqual(result.ok, true);
  });

  await okAsync("two concurrent calls for the SAME symbol still serialize — the per-symbol lock is real, not bypassed by this wrapper", async () => {
    const order = [];
    mockImpl = async () => { order.push("start"); await new Promise((r) => setTimeout(r, 20)); order.push("end"); return { ok: true, status: 200, data: { id: "x" } }; };
    await Promise.all([
      placeGatedBracketOrder({ symbol: "SAME", side: "buy", qty: 1, entry: 10, stop: 9, target: 12, clientOrderId: "a" }),
      placeGatedBracketOrder({ symbol: "SAME", side: "buy", qty: 1, entry: 10, stop: 9, target: 12, clientOrderId: "b" }),
    ]);
    assert.deepStrictEqual(order, ["start", "end", "start", "end"]);
  });

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("UNIFIED-AUTOPILOT-ENGINE TEST FAILED");
  else console.log("UNIFIED-AUTOPILOT-ENGINE TEST OK");
})();
