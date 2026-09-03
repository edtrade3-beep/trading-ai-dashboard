// Real tests for src/trade-gps-notifier.js — Trade GPS's material-state-
// change notifier, reusing the existing real Telegram system end-to-end
// (2026-09-03 spec). Real bug fixed 2026-09-03: this test used to assume
// Telegram is never configured in ANY environment this runs in — true on
// a dev machine, false on Render, where TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID
// are real deploy secrets. That false assumption made this file (a) fail
// the real `npm test` step of every Render build since Stage 7 (a real
// send hit the real cross-call cooldown instead of the expected
// "not-configured" branch, so the exact reason string didn't match) and,
// worse, (b) actually attempt real Telegram sends during CI. Fixed by
// forcibly clearing both real env vars BEFORE requiring anything that
// resolves to config.js (which reads them once, at require time) — this
// test must be hermetic and network-free in every real environment, not
// just the one it happened to be written in.
"use strict";
process.env.TELEGRAM_BOT_TOKEN = "";
process.env.TELEGRAM_CHAT_ID = "";
const assert = require("node:assert");
const { writeJsonAtomic, readJsonSafe } = require("../src/atomic-write");
const {
  notifyMaterialStateChange, MATERIAL_STATES, ALWAYS_ALLOW_STATES, categoryFor, STATE_PATH,
} = require("../src/trade-gps-notifier");
const { shouldSendAlert } = require("../src/telegram-bot");
const { isConfigured } = require("../src/telegram");

if (isConfigured()) {
  throw new Error("real Telegram config leaked into this test process — refusing to run (would risk a real send)");
}

let passed = 0;
async function ok(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

// Same snapshot-reset-restore discipline as test/signal-lifecycle.test.js.
const originalState = readJsonSafe(STATE_PATH, {});
writeJsonAtomic(STATE_PATH, {});

(async () => {
  console.log("Checking categoryFor — real ALWAYS_ALLOW vs. shared-info-budget routing…");

  await ok("MATERIAL_STATES matches the real spec list exactly", () => {
    assert.deepStrictEqual([...MATERIAL_STATES].sort(), ["CANCELLED", "DAILY_RISK_LOCKED", "ENTER_NOW", "EXIT", "HARD_EXIT", "SETUP_FORMING", "TAKE_PARTIAL", "TRAIL"]);
  });

  await ok("ENTER_NOW/EXIT/HARD_EXIT/DAILY_RISK_LOCKED route to the always-allow category (spec: never miss a real entry/exit/risk-lock)", () => {
    assert.strictEqual(categoryFor("ENTER_NOW"), "trade-gps-critical");
    assert.strictEqual(categoryFor("EXIT"), "trade-gps-critical");
    assert.strictEqual(categoryFor("HARD_EXIT"), "trade-gps-critical");
    assert.strictEqual(categoryFor("DAILY_RISK_LOCKED"), "trade-gps-critical");
  });

  await ok("SETUP_FORMING/CANCELLED/TRAIL/TAKE_PARTIAL route through the shared informational budget", () => {
    assert.strictEqual(categoryFor("SETUP_FORMING"), "trade-gps-info");
    assert.strictEqual(categoryFor("CANCELLED"), "trade-gps-info");
    assert.strictEqual(categoryFor("TRAIL"), "trade-gps-info");
    assert.strictEqual(categoryFor("TAKE_PARTIAL"), "trade-gps-info");
  });

  await ok("real Telegram category budgets are already wired — trade-gps-critical clears more calls than the 10/day info budget would allow", () => {
    let allowed = 0;
    for (let i = 0; i < 15; i++) { if (shouldSendAlert({ category: "trade-gps-critical" })) allowed++; }
    assert.ok(allowed >= 11, `expected trade-gps-critical to clear more than the shared info budget (got ${allowed}/15) — ALWAYS_ALLOW_CATEGORIES wiring may be missing`);
  });

  console.log("\nChecking notifyMaterialStateChange — real material-change gating, honest skips…");

  await ok("a non-material state is never sent, no budget consumed", async () => {
    const r = await notifyMaterialStateChange({ symbol: "ZZZ", newState: "SCANNING" });
    assert.strictEqual(r.sent, false);
    assert.strictEqual(r.reason, "not-material");
  });

  await ok("a missing real symbol is never sent", async () => {
    const r = await notifyMaterialStateChange({ newState: "ENTER_NOW" });
    assert.strictEqual(r.sent, false);
    assert.strictEqual(r.reason, "not-material");
  });

  await ok("newState identical to the caller's own prevState is skipped in-call, never even checks persisted dedup", async () => {
    const r = await notifyMaterialStateChange({ symbol: "AAA", prevState: "ENTER_NOW", newState: "ENTER_NOW" });
    assert.strictEqual(r.sent, false);
    assert.strictEqual(r.reason, "unchanged");
  });

  await ok("a genuine first-time real material state change attempts a real send (honestly fails: Telegram not configured in this test env)", async () => {
    const r = await notifyMaterialStateChange({ symbol: "BBB", newState: "SETUP_FORMING", decision: { reasonOneLine: "real breakout forming" } });
    assert.strictEqual(r.sent, false);
    assert.strictEqual(r.reason, "not-configured", "must reach the real send attempt, not get gated earlier");
  });

  await ok("the same symbol+state observed again is blocked by real persisted dedup, never re-sent", async () => {
    const r = await notifyMaterialStateChange({ symbol: "BBB", newState: "SETUP_FORMING" });
    assert.strictEqual(r.sent, false);
    assert.strictEqual(r.reason, "duplicate");
  });

  await ok("the SAME symbol moving to a genuinely DIFFERENT real material state clears dedup and attempts a real send again", async () => {
    const r = await notifyMaterialStateChange({ symbol: "BBB", newState: "ENTER_NOW" });
    assert.strictEqual(r.sent, false);
    assert.strictEqual(r.reason, "not-configured");
  });

  await ok("real persisted dedup state survives a fresh read from disk (matches signal-lifecycle.js's own store discipline)", () => {
    const stored = readJsonSafe(STATE_PATH, {});
    assert.strictEqual(stored.BBB?.lastState, "ENTER_NOW");
  });

  await ok("DAILY_RISK_LOCKED (account-level, not a real per-symbol state) is a real material state and is gated identically", async () => {
    const r = await notifyMaterialStateChange({ symbol: "ACCOUNT", newState: "DAILY_RISK_LOCKED", decision: { reasonOneLine: "daily loss limit reached" } });
    assert.strictEqual(r.sent, false);
    assert.strictEqual(r.reason, "not-configured");
  });

  writeJsonAtomic(STATE_PATH, originalState);

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("TRADE-GPS-NOTIFIER TEST FAILED"); else console.log("TRADE-GPS-NOTIFIER TEST OK");
})();
