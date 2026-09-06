// Real tests for the P0-P3 alert priority taxonomy (platform-consolidation
// Part 17, 2026-09-06): src/telegram.js's evaluateGlobalThrottle (the one
// real choke point every sendTelegramMessage call funnels through) and
// src/telegram-bot.js's priorityFor/shouldSendAlert. Same hermetic-env
// discipline as test/trade-gps-notifier.test.js — clear both real Telegram
// env vars BEFORE requiring anything that resolves to config.js, so this
// never attempts a real network send in any real environment (including a
// Render deploy where these are real secrets).
"use strict";
process.env.TELEGRAM_BOT_TOKEN = "";
process.env.TELEGRAM_CHAT_ID = "";
const assert = require("node:assert");
const { evaluateGlobalThrottle, shouldConsumeGlobalBudget, isConfigured } = require("../src/telegram");
const { shouldSendAlert, priorityFor, ALERT_PRIORITY } = require("../src/telegram-bot");

if (isConfigured()) {
  throw new Error("real Telegram config leaked into this test process — refusing to run (would risk a real send)");
}

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking evaluateGlobalThrottle — the one real choke point every Telegram send funnels through…");

ok("a normal (non-P0) send at/under both real limits is allowed", () => {
  const r = evaluateGlobalThrottle({ priority: null, dailyCount: 0, lastSentAt: 0, now: 10_000_000, maxDailyTotal: 40, minIntervalMs: 60_000 });
  assert.strictEqual(r.allowed, true);
});

ok("a normal send inside the real cooldown window is dropped, with a real retry hint", () => {
  const now = 100_000;
  const r = evaluateGlobalThrottle({ priority: null, dailyCount: 0, lastSentAt: now - 1000, now, maxDailyTotal: 40, minIntervalMs: 60_000 });
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, "cooldown");
  assert.strictEqual(r.retryInMs, 59_000);
});

ok("a normal send at/above the real daily cap is dropped", () => {
  const r = evaluateGlobalThrottle({ priority: null, dailyCount: 40, lastSentAt: 0, now: 10_000_000, maxDailyTotal: 40, minIntervalMs: 60_000 });
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, "daily-cap");
});

ok("priority:'P0' bypasses BOTH the real cooldown and the real daily cap — a genuine emergency must never be silently dropped", () => {
  const r = evaluateGlobalThrottle({ priority: "P0", dailyCount: 999, lastSentAt: Date.now(), now: Date.now(), maxDailyTotal: 40, minIntervalMs: 60_000 });
  assert.strictEqual(r.allowed, true);
});

ok("only the exact string 'P0' bypasses — a typo'd or lower priority still gets the real gate", () => {
  const r = evaluateGlobalThrottle({ priority: "p0", dailyCount: 40, lastSentAt: 0, now: 10_000_000 });
  assert.strictEqual(r.allowed, false);
});

ok("shouldConsumeGlobalBudget: a P0 send never consumes the shared budget — code-review regression (2026-09-06); sendTelegramMessage itself can't be unit-tested for this without a real token since it short-circuits on isConfigured() first", () => {
  assert.strictEqual(shouldConsumeGlobalBudget("P0"), false);
  assert.strictEqual(shouldConsumeGlobalBudget("P1"), true);
  assert.strictEqual(shouldConsumeGlobalBudget(undefined), true);
});

console.log("\nChecking priorityFor / ALERT_PRIORITY — real P0-P3 category taxonomy…");

ok("genuine account-safety categories are classified P0", () => {
  assert.strictEqual(priorityFor("portfolio-risk"), "P0");
  assert.strictEqual(priorityFor("auto-exec"), "P0");
  assert.strictEqual(priorityFor("trade-gps-critical"), "P0");
  assert.strictEqual(priorityFor("emergency-stop"), "P0");
  assert.strictEqual(priorityFor("job-stalled"), "P0");
});

ok("time-sensitive trading events are classified P1", () => {
  assert.strictEqual(priorityFor("opportunity"), "P1");
  assert.strictEqual(priorityFor("stop-trigger"), "P1");
  assert.strictEqual(priorityFor("target-hit"), "P1");
  assert.strictEqual(priorityFor("regime-change"), "P1");
});

ok("an unrecognized/routine category honestly defaults to P3, never a fabricated higher tier", () => {
  assert.strictEqual(priorityFor("ai-coach"), "P3");
  assert.strictEqual(priorityFor("some-made-up-category"), "P3");
});

ok("every category in ALERT_PRIORITY maps to a real P0-P3 value, nothing else", () => {
  const valid = new Set(["P0", "P1", "P2", "P3"]);
  for (const [cat, p] of Object.entries(ALERT_PRIORITY)) {
    assert.ok(valid.has(p), `${cat} maps to invalid priority ${p}`);
  }
});

console.log("\nChecking shouldSendAlert — P0 categories are never rate-limited, even after the shared priority budget is exhausted…");

ok("a P0 category (auto-exec) keeps returning true well past the 20/day priority budget that a P1 category would hit", () => {
  let allowed = 0;
  for (let i = 0; i < 40; i++) { if (shouldSendAlert({ category: "auto-exec" })) allowed++; }
  assert.strictEqual(allowed, 40, "a genuine P0 account-safety alert must never be dropped for volume reasons");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("ALERT-PRIORITY-TIERS TEST FAILED");
else console.log("ALERT-PRIORITY-TIERS TEST OK");
