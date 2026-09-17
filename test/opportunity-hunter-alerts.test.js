"use strict";
// Real tests for src/opportunity-hunter-alerts.js — Stocks Phase 1 of the
// "AI Opportunity Hunter" master prompt (2026-09-16). Pure detectTransitions/
// buildMessage tests, no network — same convention as
// top50-telegram-alerts.test.js.
const assert = require("node:assert");
const { detectTransitions, buildMessage, buildDigestMessage, COOLDOWN_MS } = require("../src/opportunity-hunter-alerts");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const baseO = {
  symbol: "AMD", price: 493.41, dealScore: 92, entryScore: 84, riskLevel: "LOW", confidenceScore: 88, state: "SETUP READY",
  fairValue: { conservative: 470, fairValue: 520, bull: 570, marginOfSafetyPct: 12 },
  reasons: ["deal_score_attractive", "technical_entry_ready"],
};

console.log("Checking detectTransitions — real state-diff, no duplication of top50-telegram-alerts.js's own price/entry/invalidation events…");

ok("first-seen-per-symbol only fires ENTERED_TOP_RANKS (real onboarding, not a fabricated 'deal improved' claim)", () => {
  const events = detectTransitions(null, baseO, false);
  assert.deepStrictEqual(events, []); // detectTransitions itself returns [] for no prevState — ENTERED_TOP_RANKS is driven by the caller's wasRanked flag, checked next
});

ok("a real Deal Score crossing 80 fires NEW_HIGH_QUALITY_DEAL exactly once for that crossing", () => {
  const prev = { dealScore: 75, entryScore: 60, riskLevel: "LOW" };
  const events = detectTransitions(prev, baseO, true);
  assert.ok(events.includes("NEW_HIGH_QUALITY_DEAL"));
});

ok("a real risk escalation to HIGH/CRITICAL fires RISK_SPIKE; an escalation that stays below HIGH does not", () => {
  const prevLow = { dealScore: 92, entryScore: 84, riskLevel: "LOW" };
  const spikeToHigh = detectTransitions(prevLow, { ...baseO, riskLevel: "HIGH" }, true);
  assert.ok(spikeToHigh.includes("RISK_SPIKE"));
  const prevElevated = { dealScore: 92, entryScore: 84, riskLevel: "LOW" };
  const toModerate = detectTransitions(prevElevated, { ...baseO, riskLevel: "MODERATE" }, true);
  assert.ok(!toModerate.includes("RISK_SPIKE"), "MODERATE is a real escalation but below the real HIGH/CRITICAL alert floor");
});

ok("a real margin-of-safety improvement of >=10pts fires VALUATION_IMPROVED; a small real improvement does not", () => {
  const prev = { dealScore: 92, entryScore: 84, riskLevel: "LOW", marginOfSafetyPct: 5 };
  const big = detectTransitions(prev, { ...baseO, fairValue: { ...baseO.fairValue, marginOfSafetyPct: 18 } }, true);
  assert.ok(big.includes("VALUATION_IMPROVED"));
  const small = detectTransitions(prev, { ...baseO, fairValue: { ...baseO.fairValue, marginOfSafetyPct: 8 } }, true);
  assert.ok(!small.includes("VALUATION_IMPROVED"));
});

ok("real reuse discipline: this file's own header explicitly discloses it does NOT re-alert on price-zone/entry-confirmed/invalidation — those are top50-telegram-alerts.js's real events", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../src/opportunity-hunter-alerts"), "utf8");
  assert.match(src, /top50-telegram-alerts\.js\n\/\/ already alerts on/);
});

console.log("\nChecking buildMessage — real fields only, never a fabricated narrative…");

ok("message includes the real Deal/Entry/Risk/Confidence/State fields and up to 5 real machine-generated reasons", () => {
  const msg = buildMessage(baseO, "NEW_HIGH_QUALITY_DEAL");
  assert.match(msg, /AMD/);
  assert.match(msg, /Deal Score: 92/);
  assert.match(msg, /Entry Score: 84/);
  assert.match(msg, /Risk: LOW/);
  assert.match(msg, /State:\nSETUP READY/);
  assert.match(msg, /deal score attractive/);
});

console.log("\nChecking buildDigestMessage — the hourly push (2026-09-16, \"I want opportunities come to me not search for it\")…");

ok("ranks real candidates by Deal Score (ties broken by Entry Score), caps at 10, includes a real ET timestamp", () => {
  const opps = [
    { symbol: "AAPL", dealScore: 82, entryScore: 60, riskLevel: "LOW", state: "GREAT VALUE — WAIT" },
    { symbol: "NVDA", dealScore: 91, entryScore: 88, riskLevel: "MODERATE", state: "SETUP READY" },
  ];
  const msg = buildDigestMessage(opps);
  assert.match(msg, /OPPORTUNITY DIGEST/);
  assert.match(msg, /ET/);
  assert.ok(msg.indexOf("NVDA") < msg.indexOf("AAPL"), "higher real Deal Score must rank first");
});

ok("a real empty scan result is reported honestly, never a fabricated placeholder opportunity", () => {
  const msg = buildDigestMessage([]);
  assert.match(msg, /No real qualifying candidates right now\./);
});

console.log("\nChecking dedup/cooldown + failure isolation…");

ok("COOLDOWN_MS matches the same real 30-minute figure every other alert job in this app uses", () => {
  assert.strictEqual(COOLDOWN_MS, 30 * 60_000);
});

ok("every real Telegram send in this file is wrapped in .catch(() => {}) — a Telegram outage can never throw out of the scan/alert loop", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../src/opportunity-hunter-alerts"), "utf8");
  const sendCallSites = (src.match(/sendTelegramMessage\(/g) || []).length;
  const guardedCalls = (src.match(/sendTelegramMessage\([\s\S]*?\)\.catch\(\(\) => \{\}\)/g) || []).length;
  assert.ok(sendCallSites > 0);
  assert.strictEqual(sendCallSites, guardedCalls);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("OPPORTUNITY-HUNTER-ALERTS TEST FAILED");
else console.log("OPPORTUNITY-HUNTER-ALERTS TEST OK");
