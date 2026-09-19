"use strict";
// fajr-bot.test.js (2026-09-19, "Fajr & Tasbeeh bot for 200+ users") —
// real tests for the pure, network-free pieces of the new multi-user
// Fajr bot: exact literal message text (the spec's own required Arabic
// strings), the tasbeeh reminder slot-matching logic, and reuse-
// discipline source-inspection tripwires (own token/store, never the
// existing single-user telegram.js's hardcoded TELEGRAM_CHAT_ID; real
// TTS reuse via story-ai-tts-provider.js, never a second TTS
// integration). No network/DB — isConfigured() is false without real
// env vars, which every exported function checks first.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { fajrMessageFor, fajrVoiceTextFor, stageMessageFor, isConfigured, slotsDueNow } = require("../src/fajr-bot");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking the spec's own exact required message text (#5, #6)…");

ok("fajrMessageFor produces the exact literal Arabic text the spec requires, with {{first_name}} substituted", () => {
  assert.strictEqual(fajrMessageFor("Ahmad"), "Ahmad، حي على الصلاة، حي على الفلاح 🌙 حان وقت صلاة الفجر. قم وتوضأ وصلِّ الفجر.");
});

ok("fajrVoiceTextFor produces the exact literal TTS text the spec requires — a real, deliberately different (shorter, no emoji) string from the text message, matching the spec's own two separate literal blocks", () => {
  assert.strictEqual(fajrVoiceTextFor("Ahmad"), "Ahmad، حي على الصلاة، حي على الفلاح. حان وقت صلاة الفجر.");
  assert.notStrictEqual(fajrVoiceTextFor("Ahmad"), fajrMessageFor("Ahmad"));
});

ok("stageMessageFor's 'fajr' stage reuses fajrMessageFor exactly — never a second copy of the spec's own literal text", () => {
  assert.strictEqual(stageMessageFor("fajr", "Sara"), fajrMessageFor("Sara"));
});

ok("stageMessageFor produces a real, distinct message for each of the other 3 escalation stages", () => {
  const early = stageMessageFor("early", "Sara");
  const f1 = stageMessageFor("followup1", "Sara");
  const f2 = stageMessageFor("followup2", "Sara");
  assert.ok(early.includes("Sara") && early !== fajrMessageFor("Sara"));
  assert.ok(f1.includes("Sara") && f1 !== fajrMessageFor("Sara"));
  assert.ok(f2.includes("Sara") && f2 !== fajrMessageFor("Sara"));
  assert.notStrictEqual(f1, f2);
});

console.log("\nChecking isConfigured — honestly false without real FAJR_BOT_TOKEN + a real ready Postgres store…");

ok("isConfigured() is false in this test environment (no real token/DB) — never assumes configured", () => {
  assert.strictEqual(isConfigured(), false);
});

console.log("\nChecking slotsDueNow — real Tasbeeh reminder frequency slot matching (#9: Off/1/2/3 per day)…");

ok("freq=1 has exactly one real daily slot, matched only at its own hour", () => {
  assert.deepStrictEqual(slotsDueNow(1, new Date(2026, 0, 15, 12, 5)), [0]);
  assert.deepStrictEqual(slotsDueNow(1, new Date(2026, 0, 15, 9, 5)), []);
});

ok("freq=3 has exactly 3 real daily slots, only the matching hour fires", () => {
  assert.deepStrictEqual(slotsDueNow(3, new Date(2026, 0, 15, 9, 0)), [0]);
  assert.deepStrictEqual(slotsDueNow(3, new Date(2026, 0, 15, 13, 0)), [1]);
  assert.deepStrictEqual(slotsDueNow(3, new Date(2026, 0, 15, 18, 0)), [2]);
});

ok("freq=0 (Off) has zero real slots — never fires", () => {
  assert.deepStrictEqual(slotsDueNow(0, new Date(2026, 0, 15, 12, 0)), []);
});

console.log("\nChecking reuse discipline (source-inspection tripwire) — ONE-ENGINE RULE, real separate bot identity…");

const botSrc = fs.readFileSync(require.resolve("../src/fajr-bot"), "utf8");

ok("uses its own real FAJR_BOT_TOKEN — never actually reads/imports the existing single-user TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID (that bot's own telegram.js is hardcoded to one fixed chat id and is not safe to reuse for 200+ distinct users; a comment explaining this design choice is fine, real usage is not)", () => {
  assert.match(botSrc, /FAJR_BOT_TOKEN/);
  assert.doesNotMatch(botSrc, /require\("\.\/config"\)[^;]*TELEGRAM_CHAT_ID|require\("\.\/telegram"\)/, "must not import the existing single-chat-id bot's own token/chat-id/send module");
});

ok("reuses the real story-ai-tts-provider.js for voice generation — never a second TTS provider integration", () => {
  assert.match(botSrc, /require\("\.\/story-ai-tts-provider"\)/);
  assert.match(botSrc, /generateSpeech/);
});

ok("reuses fajr-bot-times.js's real fetchFajrTimeForUser (same Aladhan API prayer-times.js already calls) — no second prayer-time calculation declared here", () => {
  assert.match(botSrc, /require\("\.\/fajr-bot-times"\)/);
  assert.doesNotMatch(botSrc, /api\.aladhan\.com/, "must not call Aladhan directly — always through fajr-bot-times.js");
});

ok("reuses fajr-bot-escalation.js's real determineDueStage — no second escalation state machine declared here", () => {
  assert.match(botSrc, /require\("\.\/fajr-bot-escalation"\)/);
  assert.match(botSrc, /determineDueStage/);
});

ok("every real reminder send goes through store.claimReminderStage's real idempotent DB claim before sending — never sends first and claims after (which would defeat the real idempotency guarantee)", () => {
  const tickFn = botSrc.slice(botSrc.indexOf("async function runFajrEscalationTick"), botSrc.indexOf("async function runFajrDailyRecalcTick"));
  const claimIdx = tickFn.indexOf("claimReminderStage");
  const sendIdx = tickFn.indexOf("sendMessage(user.telegram_id, stageMessageFor");
  assert.ok(claimIdx > 0 && sendIdx > 0 && claimIdx < sendIdx, "claim must happen before send");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("FAJR-BOT TEST FAILED");
else console.log("FAJR-BOT TEST OK");
