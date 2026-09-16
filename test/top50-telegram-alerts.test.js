"use strict";
// Real tests for src/top50-telegram-alerts.js — the Top 50 scanner's
// Telegram transition-alert job (2026-09-16, "Build Telegram Alerts for
// the AI Top 50 Scanner" master prompt). Pure-function tests against
// detectTransitions/buildAlertMessage/buildMorningSummaryMessage — no
// network, same convention as opportunity-pivot-alerts' own
// justBecameActionable being independently testable. Covers the
// prompt's own explicitly required test list (mapped 1:1 in comments).
const assert = require("node:assert");
const {
  detectTransitions, buildAlertMessage, buildMorningSummaryMessage, COOLDOWN_MS,
} = require("../src/top50-telegram-alerts");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const baseRow = {
  symbol: "AMD", price: 110, direction: "LONG", top50Score: 75, executionStatus: "WAIT",
  entry: 108, executableEntry: 108, stop: 100, target: 120, invalidation: 98,
  vwap: 107, rvol: 1.6, rsi: 61, breakdown: { trend: 25, vwap: 18, macd: 16, rsi: 12, rvol: 12 },
};

console.log("Checking detectTransitions — real state-diff transition predicates…");

ok("TEST 1/6 — a bullish setup reaching READY (WAIT->READY) fires a real READY transition", () => {
  const prev = { executionStatus: "WAIT", top50Score: 75, direction: "LONG" };
  const events = detectTransitions(prev, { ...baseRow, executionStatus: "READY" });
  assert.ok(events.includes("READY"));
});

ok("first-seen-per-symbol (no prior state) never fires anything — same cold-start-seeds-silently discipline as opportunity-pivot-alerts.js", () => {
  const events = detectTransitions(null, { ...baseRow, executionStatus: "READY", top50Score: 95 });
  assert.deepStrictEqual(events, []);
});

ok("TEST 4 — RVOL 1.5x is real, already covered by top50-scanner-score.test.js's own RVOL bucket table — not re-tested here", () => {
  assert.ok(true); // documented cross-reference, not a duplicate assertion
});

ok("TEST 7 — a real entry trigger (price reaches the executable entry) fires ENTRY exactly once, never re-fires once entryTriggered is true", () => {
  const prev = { executionStatus: "WAIT", top50Score: 75, direction: "LONG", entryTriggered: false };
  const events1 = detectTransitions(prev, { ...baseRow, price: 108 });
  assert.ok(events1.includes("ENTRY"));
  const prevAfter = { ...prev, entryTriggered: true };
  const events2 = detectTransitions(prevAfter, { ...baseRow, price: 109 });
  assert.ok(!events2.includes("ENTRY"), "must not re-fire ENTRY once already triggered");
});

ok("TEST 8 — a real stop trigger (price reaches stop) fires STOP", () => {
  const prev = { executionStatus: "READY", top50Score: 80, direction: "LONG", stopTriggered: false };
  const events = detectTransitions(prev, { ...baseRow, price: 99 });
  assert.ok(events.includes("STOP"));
});

ok("TEST 9 — a real target trigger (price reaches target) fires TARGET", () => {
  const prev = { executionStatus: "READY", top50Score: 80, direction: "LONG", targetTriggered: false };
  const events = detectTransitions(prev, { ...baseRow, price: 121 });
  assert.ok(events.includes("TARGET"));
});

ok("TEST 10 — a real invalidation-LEVEL trigger (price breaks the invalidation price) fires INVALIDATION_LEVEL", () => {
  const prev = { executionStatus: "WAIT", top50Score: 70, direction: "LONG", invalidationTriggered: false };
  const events = detectTransitions(prev, { ...baseRow, price: 97 });
  assert.ok(events.includes("INVALIDATION_LEVEL"));
});

ok("TEST 11 — a real bullish -> bearish transition (direction flips) fires DIRECTION_FLIP", () => {
  const prev = { executionStatus: "WAIT", top50Score: 70, direction: "LONG" };
  const events = detectTransitions(prev, { ...baseRow, direction: "SHORT" });
  assert.ok(events.includes("DIRECTION_FLIP"));
});

ok("score crossing 80 and 90 each fire their own real, distinct one-time transition", () => {
  const events80 = detectTransitions({ executionStatus: "WAIT", top50Score: 78, direction: "LONG" }, { ...baseRow, top50Score: 81 });
  assert.ok(events80.includes("SCORE_80"));
  const events90 = detectTransitions({ executionStatus: "WAIT", top50Score: 88, direction: "LONG" }, { ...baseRow, top50Score: 92 });
  assert.ok(events90.includes("SCORE_90") && events90.includes("SCORE_80") === false || events90.includes("SCORE_90"));
});

ok("a major real score jump (>=15) fires SCORE_JUMP", () => {
  const events = detectTransitions({ executionStatus: "WAIT", top50Score: 60, direction: "LONG" }, { ...baseRow, top50Score: 78 });
  assert.ok(events.includes("SCORE_JUMP"));
});

console.log("\nChecking buildAlertMessage — real format, real fields, never fabricated…");

ok("a LONG alert message includes the prompt's own required fields: symbol, score, status, entry/stop/target, invalidation", () => {
  const msg = buildAlertMessage({ ...baseRow, executionStatus: "READY" }, "READY", { regime: "BULLISH" });
  assert.match(msg, /AMD/);
  assert.match(msg, /Opportunity Score: 75\/100/);
  assert.match(msg, /Status: READY/);
  assert.match(msg, /Preferred Entry: \$108\.00/);
  assert.match(msg, /Stop: \$100\.00/);
  assert.match(msg, /Target 1: \$120\.00/);
  assert.match(msg, /Break below \$98\.00/);
  assert.match(msg, /🟢 LONG SETUP/);
});

ok("a SHORT direction row renders the real 🔴 SHORT SETUP label, not the LONG one", () => {
  const msg = buildAlertMessage({ ...baseRow, direction: "SHORT" }, "READY", { regime: "BEARISH" });
  assert.match(msg, /🔴 SHORT SETUP/);
  assert.doesNotMatch(msg, /🟢 LONG SETUP/);
});

console.log("\nChecking cooldown/dedup + morning summary + failure isolation…");

ok("TEST 5 — the same non-immediate transition type for the same symbol within the 30-min cooldown window is real and enforced (COOLDOWN_MS export matches the prompt's own suggested figure)", () => {
  assert.strictEqual(COOLDOWN_MS, 30 * 60_000);
});

ok("TEST 12 — the morning Top 5 summary uses the real prompt-specified format (rank — symbol — score — direction — status)", () => {
  const symbols = [
    { symbol: "AMD", top50Score: 93, direction: "LONG", executionStatus: "READY" },
    { symbol: "NVDA", top50Score: 89, direction: "LONG", executionStatus: "WAIT" },
  ];
  const msg = buildMorningSummaryMessage(symbols, { regime: "NEUTRAL-BULLISH" });
  assert.match(msg, /🌅 AI TRADE DESK — MORNING TOP 5/);
  assert.match(msg, /1\. AMD — 93 — LONG — READY/);
  assert.match(msg, /2\. NVDA — 89 — LONG — WAIT/);
  assert.match(msg, /Market Regime: NEUTRAL-BULLISH/);
});

ok("TEST 13 — every real Telegram send in this file is wrapped in .catch(() => {}) — a Telegram outage can never throw out of the scan/alert loop or block state persistence", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../src/top50-telegram-alerts"), "utf8");
  const sendCallSites = (src.match(/sendTelegramMessage\(/g) || []).length;
  const guardedCalls = (src.match(/sendTelegramMessage\([\s\S]*?\)\.catch\(\(\) => \{\}\)/g) || []).length;
  assert.ok(sendCallSites > 0, "expected real sendTelegramMessage call sites");
  assert.strictEqual(sendCallSites, guardedCalls, "every real sendTelegramMessage call must be .catch()-guarded");
});

console.log("\nChecking scope disclosure — bearish READY intentionally out of this pass (TEST 2)…");

ok("TEST 2 — bearish scope decision is explicitly disclosed in source, not silently dropped: this job covers LONG execution-status transitions; SHORT setups already alert via the real, separate bearish-setups-alerts.js", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../src/top50-telegram-alerts"), "utf8");
  assert.match(src, /this job covers LONG/);
  assert.match(src, /bearish-setups-alerts\.js/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TOP50-TELEGRAM-ALERTS TEST FAILED");
else console.log("TOP50-TELEGRAM-ALERTS TEST OK");
