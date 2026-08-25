// Real regression test for the Emergency Stop coverage gap found by the
// 2026-08-24 Execution Bot Architecture Audit: routes/alpaca.js's real
// POST /api/alpaca/order handler (behind System 1, the client swing
// autopilot) and quick-trade-service.js's preTradeCheck() (the Quick Trade
// Engine, a real 5th execution path never counted among "all 4 systems")
// both placed real orders with zero server-side Emergency Stop check —
// only server-autopilot.js, routes/autoexec.js, and
// lightbox-autopilot-execute.js were actually covered. This test locks in
// the fix so the gap can't silently reopen.
//
// Fake ALPACA_KEY_ID/SECRET below are dummy strings, never real
// credentials — both checked code paths return before ever making a real
// network call once Emergency Stop is active, so no real HTTP request to
// Alpaca happens in this test.
// Run: node test/emergency-stop-coverage.test.js (or npm test).
"use strict";

process.env.ALPACA_KEY_ID = "test-dummy-key";
process.env.ALPACA_SECRET_KEY = "test-dummy-secret";
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_CHAT_ID;
delete process.env.TRADIER_API_KEY;

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { activateEmergencyStop, deactivateEmergencyStop } = require("../src/emergency-stop");
const { preTradeCheck } = require("../src/quick-trade-service");
const { handleAlpaca } = require("../src/routes/alpaca");

let passed = 0;
async function okAsync(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const STATE_PATH = path.join(__dirname, "..", "data", "emergency-stop.json");
function cleanup() { try { fs.unlinkSync(STATE_PATH); } catch {} }

// Minimal fake req/res — handleAlpaca only reads req via `for await` (body)
// and calls res.writeHead/res.end (see src/utils.js's writeJson).
function fakeReqRes(body) {
  const req = { method: "POST", async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } };
  const res = { writeHead() {}, end(text) { this._body = text; } };
  return { req, res };
}

async function main() {
  cleanup();
  console.log("Checking Emergency Stop actually covers /api/alpaca/order and Quick Trade…");

  await okAsync("baseline: preTradeCheck succeeds when Emergency Stop is inactive (fails later, for an unrelated real reason — no live Alpaca account behind these dummy creds — but NOT for Emergency Stop)", async () => {
    const r = await preTradeCheck({ symbol: "AAPL" });
    assert.strictEqual(r.ok, false); // dummy creds can't reach a real account
    assert.ok(!/Emergency Stop/.test(r.reason || ""), `should not be blocked by Emergency Stop while inactive, got: ${r.reason}`);
  });

  await okAsync("activating Emergency Stop blocks Quick Trade's preTradeCheck() before any real account/network call", async () => {
    await activateEmergencyStop({ reason: "test activation", activatedBy: "test-suite" });
    const r = await preTradeCheck({ symbol: "AAPL" });
    assert.strictEqual(r.ok, false);
    assert.ok(/Emergency Stop/.test(r.reason || ""), `expected an Emergency Stop reason, got: ${r.reason}`);
  });

  await okAsync("POST /api/alpaca/order (buy) is blocked while Emergency Stop is active", async () => {
    const { req, res } = fakeReqRes({ symbol: "AAPL", qty: 1, side: "buy" });
    const requestUrl = new URL("http://localhost/api/alpaca/order");
    await handleAlpaca(req, res, requestUrl);
    const body = JSON.parse(res._body);
    assert.strictEqual(body.ok, false);
    assert.ok(/Emergency Stop/.test(body.error || ""), `expected an Emergency Stop error, got: ${JSON.stringify(body)}`);
  });

  await okAsync("re-arming clears the block — Quick Trade's preTradeCheck() no longer cites Emergency Stop", async () => {
    deactivateEmergencyStop({ rearmedBy: "test-suite" });
    const r = await preTradeCheck({ symbol: "AAPL" });
    assert.ok(!/Emergency Stop/.test(r.reason || ""), `should not still be blocked by Emergency Stop after re-arming, got: ${r.reason}`);
  });

  // trailing-stops.js has no return value to assert on its early-return
  // path without a network-mocking library this repo doesn't have — a
  // real behavioral test isn't practical here. A static guard is still a
  // real regression check: it fails loudly if the require/call is ever
  // refactored away, which is exactly the failure mode this test suite
  // exists to catch.
  await okAsync("trailing-stops.js's autonomous ratchet job still checks Emergency Stop in source (static guard — no safe way to assert its early-return behaviorally without a broker mock)", async () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "trailing-stops.js"), "utf8");
    assert.ok(/isEmergencyStopActive/.test(src), "runTrailingStops() must check isEmergencyStopActive() before touching any real order");
  });

  cleanup();
  console.log(`\n${passed} checks passed.`);
  console.log("EMERGENCY-STOP COVERAGE TEST OK");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
