"use strict";
// fajr-bot-escalation.test.js (2026-09-19, "Fajr & Tasbeeh bot for 200+
// users") — real pure-function tests for the escalation state machine
// (#7: optional 15-min early -> Fajr -> 5-min follow-up -> final
// follow-up -> stop on acknowledgement).
const assert = require("node:assert");
const { determineDueStage } = require("../src/fajr-bot-escalation");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const FAJR = new Date("2026-01-15T11:00:00.000Z");
const min = (n) => new Date(FAJR.getTime() + n * 60_000);

console.log("Checking determineDueStage — real escalation ladder, one stage at a time…");

ok("nothing due before the early-reminder window opens", () => {
  assert.strictEqual(determineDueStage({ fajrAt: FAJR, now: min(-20), earlyReminderEnabled: true, sentStages: [] }), null);
});

ok("early fires at exactly -15 minutes when enabled", () => {
  assert.strictEqual(determineDueStage({ fajrAt: FAJR, now: min(-15), earlyReminderEnabled: true, sentStages: [] }), "early");
});

ok("early is SKIPPED entirely when the user disabled it — fajr is the first real stage instead", () => {
  assert.strictEqual(determineDueStage({ fajrAt: FAJR, now: min(-15), earlyReminderEnabled: false, sentStages: [] }), null);
  assert.strictEqual(determineDueStage({ fajrAt: FAJR, now: min(0), earlyReminderEnabled: false, sentStages: [] }), "fajr");
});

ok("fajr fires at 0 minutes once early is already sent", () => {
  assert.strictEqual(determineDueStage({ fajrAt: FAJR, now: min(0), earlyReminderEnabled: true, sentStages: ["early"] }), "fajr");
});

ok("a stage already in sentStages is never returned again, even if still due", () => {
  assert.strictEqual(determineDueStage({ fajrAt: FAJR, now: min(0), earlyReminderEnabled: true, sentStages: ["early", "fajr"] }), null);
});

ok("followup1 (5-minute follow-up) fires at +5, followup2 (final) at +15", () => {
  assert.strictEqual(determineDueStage({ fajrAt: FAJR, now: min(5), earlyReminderEnabled: true, sentStages: ["early", "fajr"] }), "followup1");
  assert.strictEqual(determineDueStage({ fajrAt: FAJR, now: min(15), earlyReminderEnabled: true, sentStages: ["early", "fajr", "followup1"] }), "followup2");
});

ok("real acknowledgement stops ALL further stages immediately, regardless of how many are still overdue", () => {
  assert.strictEqual(determineDueStage({ fajrAt: FAJR, now: min(30), earlyReminderEnabled: true, sentStages: ["early"], acknowledged: true }), null);
});

ok("nothing left once every real stage has already been sent", () => {
  assert.strictEqual(determineDueStage({ fajrAt: FAJR, now: min(60), earlyReminderEnabled: true, sentStages: ["early", "fajr", "followup1", "followup2"] }), null);
});

ok("a long outage (bot down for hours) still only returns ONE due stage per call — the earliest unsent one — never bursts every missed stage at once", () => {
  const result = determineDueStage({ fajrAt: FAJR, now: min(600), earlyReminderEnabled: true, sentStages: [] });
  assert.strictEqual(result, "early", "must resume from the earliest real unsent stage, not jump straight to the latest");
});

ok("an invalid/missing fajrAt never crashes, honestly returns null", () => {
  assert.strictEqual(determineDueStage({ fajrAt: null, now: new Date() }), null);
  assert.strictEqual(determineDueStage({ fajrAt: new Date("invalid"), now: new Date() }), null);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("FAJR-BOT-ESCALATION TEST FAILED");
else console.log("FAJR-BOT-ESCALATION TEST OK");
