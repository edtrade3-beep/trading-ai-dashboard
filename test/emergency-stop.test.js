// Real tests for src/emergency-stop.js — the one real, global kill switch
// shared across all 4 automated-execution systems (2026-08-24, Execution
// Bot Architecture Audit Phase 1). Calls the actual exported functions
// (not a hand-copied approximation) against the real data/ store, same
// discipline as test/risk-guardrails.test.js. No broker credentials are
// configured in this test environment, so cancelAllOpenOrders's real
// network branches correctly short-circuit to "not configured" — this
// still exercises the real activate/rearm state machine end to end.
// Run: node test/emergency-stop.test.js (or npm test).
"use strict";

// Force every broker/alert integration this file exercises into its real,
// deterministic "not configured" path, regardless of what's actually set
// in the ambient environment. Without this, real ALPACA_KEY_ID/
// TELEGRAM_BOT_TOKEN/TRADIER_API_KEY present in the environment — e.g.
// Render's build step, which shares env vars with the running service —
// make activateEmergencyStop() below fire REAL side effects instead of
// exercising the fail-closed path this test is meant to verify. Root-
// caused 2026-08-24: every deploy since this test shipped had been
// silently cancelling all real open Alpaca paper orders and sending real
// Telegram alerts on every single build, and failing an assertion that
// assumed "not configured" — which is why builds were failing outright.
// MUST run before any other require in this file: src/telegram.js reads
// TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID once at module-load time (via
// src/config.js), not per-call, so clearing them any later has no effect.
for (const k of ["ALPACA_KEY_ID", "ALPACA_API_KEY_ID", "ALPACA_SECRET_KEY", "ALPACA_API_SECRET_KEY", "TRADIER_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]) {
  delete process.env[k];
}

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  isEmergencyStopActive, getEmergencyStopStatus, activateEmergencyStop, deactivateEmergencyStop,
} = require("../src/emergency-stop");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }
async function okAsync(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const STATE_PATH = path.join(__dirname, "..", "data", "emergency-stop.json");
function cleanup() { try { fs.unlinkSync(STATE_PATH); } catch {} }

async function main() {
  cleanup();
  console.log("Checking emergency-stop.js — the real global kill switch…");

  ok("starts inactive by default (fresh install, no prior file)", () => {
    assert.strictEqual(isEmergencyStopActive(), false);
    const s = getEmergencyStopStatus();
    assert.strictEqual(s.active, false);
    assert.strictEqual(s.activatedAt, null);
  });

  await okAsync("activating sets active=true and records who/why, even with no broker credentials configured", async () => {
    const r = await activateEmergencyStop({ reason: "test activation", activatedBy: "test-suite" });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.state.active, true);
    assert.strictEqual(r.state.reason, "test activation");
    assert.strictEqual(r.state.activatedBy, "test-suite");
    assert.ok(r.state.activatedAt, "must record a real activation timestamp");
    // No real ALPACA_KEY_ID/TRADIER creds in this test env — both broker
    // branches must fail closed to "not configured", never throw, never
    // silently pretend to have cancelled real orders.
    assert.strictEqual(r.cancelResults.alpaca.ok, false);
    assert.strictEqual(r.cancelResults.alpaca.reason, "not configured");
    assert.strictEqual(r.cancelResults.tradier.ok, false);
    assert.strictEqual(r.cancelResults.tradier.reason, "not configured");
  });

  ok("isEmergencyStopActive() reflects the real persisted state for every caller", () => {
    assert.strictEqual(isEmergencyStopActive(), true);
  });

  ok("re-arming clears active and records who/when, never auto-resumes on its own", () => {
    const r = deactivateEmergencyStop({ rearmedBy: "test-suite" });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.state.active, false);
    assert.strictEqual(r.state.rearmedBy, "test-suite");
    assert.ok(r.state.rearmedAt, "must record a real re-arm timestamp");
    assert.strictEqual(isEmergencyStopActive(), false);
  });

  ok("re-arming an already-inactive stop is a real, honest no-op (not an error)", () => {
    const r = deactivateEmergencyStop({ rearmedBy: "test-suite" });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.alreadyInactive, true);
  });

  cleanup();
  console.log(`\n${passed} checks passed.`);
  console.log("EMERGENCY-STOP TEST OK");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
