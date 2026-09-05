// Real tests for src/autopilot-reconciliation.js — Unified Autopilot
// merge, Stage 8 (see .claude/plans/proud-yawning-unicorn.md). Confirms
// the one-time boot check finds real ORDER_PENDING records stuck by a
// crash/redeploy, resolves them against a real (mocked) broker response,
// and — critically — NEVER touches anything when the broker can't be
// read, rather than risk mass-marking real fills as failed.
const assert = require("node:assert");
const fs = require("node:fs");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }
async function okAsync(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking autopilot-reconciliation — real boot-time broker cross-check…");

// Same technique unified-autopilot-engine.test.js already established:
// patch the module's own export BEFORE anything destructures it, routed
// through a stable wrapper so later tests can swap behavior.
const alpacaClient = require("../src/providers/alpaca-client");
let mockImpl = async () => ({ ok: true, status: 200, data: [] });
alpacaClient.alpacaTradingRequest = (...args) => mockImpl(...args);

const { reconcileOnBoot, getLastReconciliationResult } = require("../src/autopilot-reconciliation");
const { startOrder, transition, getOrder, STORE_PATH } = require("../src/autopilot-order-store");

// This is a real, shared, file-backed store other test files also write
// real records into within the same `npm test` run — back it up and
// start from a real known-empty state so "zero stuck records" can be
// asserted deterministically, not by hoping no other test left one
// behind. Restored at the end regardless of pass/fail.
let _storeBackup = null;
try { _storeBackup = fs.readFileSync(STORE_PATH, "utf8"); } catch { _storeBackup = null; }
fs.writeFileSync(STORE_PATH, JSON.stringify({ records: [] }));

function mockBroker({ positions = [], openOrders = [] } = {}) {
  mockImpl = async (path) => {
    if (path.startsWith("/v2/positions")) return { ok: true, status: 200, data: positions };
    if (path.startsWith("/v2/orders")) return { ok: true, status: 200, data: openOrders };
    return { ok: true, status: 200, data: [] };
  };
}

(async () => {
  await okAsync("no stuck ORDER_PENDING records -> an honest no-op, never calls the broker", async () => {
    let called = false;
    mockImpl = async () => { called = true; return { ok: true, status: 200, data: [] }; };
    const result = await reconcileOnBoot({ window: 500 });
    assert.strictEqual(result.ran, true);
    assert.strictEqual(result.checked, 0);
    assert.strictEqual(called, false);
  });

  await okAsync("a stuck record with a real matching broker position resolves to FILLED", async () => {
    const rec = transition(startOrder({ symbol: "RCNTEST1", source: "test" }).id, "VALIDATING");
    const approved = transition(rec.id, "RISK_APPROVED");
    const pending = transition(approved.id, "ORDER_PENDING");
    mockBroker({ positions: [{ symbol: "RCNTEST1", qty: "10" }], openOrders: [] });

    const result = await reconcileOnBoot({ window: 500 });
    assert.strictEqual(result.ran, true);
    assert.ok(result.resolved.some((r) => r.id === pending.id && r.to === "FILLED"));
    assert.strictEqual(getOrder(pending.id).currentState, "FILLED");
  });

  await okAsync("a stuck record with NO matching broker position or open order resolves to FAILED, with a real disclosed reason", async () => {
    const rec = transition(startOrder({ symbol: "RCNTEST2", source: "test" }).id, "VALIDATING");
    const approved = transition(rec.id, "RISK_APPROVED");
    const pending = transition(approved.id, "ORDER_PENDING");
    mockBroker({ positions: [], openOrders: [] });

    const result = await reconcileOnBoot({ window: 500 });
    assert.ok(result.resolved.some((r) => r.id === pending.id && r.to === "FAILED"));
    const final = getOrder(pending.id);
    assert.strictEqual(final.currentState, "FAILED");
    assert.strictEqual(final.history[final.history.length - 1].meta.code, "RECONCILIATION_NO_MATCH");
  });

  await okAsync("a real matching OPEN ORDER (not yet a position) also resolves to FILLED, not just a held position", async () => {
    const rec = transition(startOrder({ symbol: "RCNTEST3", source: "test" }).id, "VALIDATING");
    const approved = transition(rec.id, "RISK_APPROVED");
    const pending = transition(approved.id, "ORDER_PENDING");
    mockBroker({ positions: [], openOrders: [{ symbol: "RCNTEST3", client_order_id: "x" }] });

    const result = await reconcileOnBoot({ window: 500 });
    assert.ok(result.resolved.some((r) => r.id === pending.id && r.to === "FILLED"));
  });

  await okAsync("a broker-unreachable run touches NOTHING — never mass-fails stuck records just because the account couldn't be read", async () => {
    const rec = transition(startOrder({ symbol: "RCNTEST4", source: "test" }).id, "VALIDATING");
    const approved = transition(rec.id, "RISK_APPROVED");
    const pending = transition(approved.id, "ORDER_PENDING");
    mockImpl = async () => { throw new Error("network blip"); };

    const result = await reconcileOnBoot({ window: 500 });
    assert.strictEqual(result.ran, false);
    assert.ok(/unreachable/i.test(result.reason));
    assert.strictEqual(getOrder(pending.id).currentState, "ORDER_PENDING");
  });

  await okAsync("getLastReconciliationResult reflects the most recent real run", async () => {
    const last = getLastReconciliationResult();
    assert.strictEqual(last.ran, false); // the broker-unreachable run above was last
  });

  if (_storeBackup != null) fs.writeFileSync(STORE_PATH, _storeBackup);
  else { try { fs.unlinkSync(STORE_PATH); } catch {} }

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("AUTOPILOT-RECONCILIATION TEST FAILED");
  else console.log("AUTOPILOT-RECONCILIATION TEST OK");
})();
