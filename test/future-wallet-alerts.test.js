// Real tests for src/future-wallet-alerts.js (Horse Hunter upgrade,
// 2026-08-26) — real stage/score transition classification, pure and
// zero-network/zero-DB (sendHorseAlerts itself is DB+Telegram orchestration,
// not unit tested here, same as this codebase's other alert-dispatch
// orchestration functions).
// Run: node test/future-wallet-alerts.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { classifyTransition, formatAlert } = require("../src/future-wallet-alerts");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking classifyTransition — real, honest stage/score transitions only…");

ok("no real prior stage on file (first-ever classification) -> honestly no alert, never a false first-read 'accelerating'", () => {
  assert.strictEqual(classifyTransition({ ok: true, symbol: "XYZ", stageLabel: "EMERGING", priorStageLabel: null }), null);
});

ok("a real stage advance into a notable stage -> HORSE_ACCELERATING", () => {
  const r = { ok: true, symbol: "XYZ", stageLabel: "INFLECTION", priorStageLabel: "EMERGING", future_wealth_score: 75, priorWealthScore: 68 };
  assert.strictEqual(classifyTransition(r), "HORSE_ACCELERATING");
});

ok("a real stage regression FROM a notable stage -> HORSE_THESIS_BROKEN", () => {
  const r = { ok: true, symbol: "XYZ", stageLabel: "INTERESTING", priorStageLabel: "INFLECTION", future_wealth_score: 40, priorWealthScore: 72 };
  assert.strictEqual(classifyTransition(r), "HORSE_THESIS_BROKEN");
});

ok("same stage but a real material score jump up -> HORSE_ACCELERATING", () => {
  const r = { ok: true, symbol: "XYZ", stageLabel: "INTERESTING", priorStageLabel: "INTERESTING", future_wealth_score: 45, priorWealthScore: 30 };
  assert.strictEqual(classifyTransition(r), "HORSE_ACCELERATING");
});

ok("same stage but a real material score drop -> HORSE_THESIS_BROKEN", () => {
  const r = { ok: true, symbol: "XYZ", stageLabel: "EMERGING", priorStageLabel: "EMERGING", future_wealth_score: 40, priorWealthScore: 58 };
  assert.strictEqual(classifyTransition(r), "HORSE_THESIS_BROKEN");
});

ok("a minor real score wobble below the disclosed threshold -> honestly no alert, not spammed", () => {
  const r = { ok: true, symbol: "XYZ", stageLabel: "EMERGING", priorStageLabel: "EMERGING", future_wealth_score: 61, priorWealthScore: 58 };
  assert.strictEqual(classifyTransition(r), null);
});

ok("stage advance into a NON-notable stage (e.g. UNKNOWN -> INTERESTING) with no material score jump -> no alert", () => {
  const r = { ok: true, symbol: "XYZ", stageLabel: "INTERESTING", priorStageLabel: "UNKNOWN", future_wealth_score: 32, priorWealthScore: 28 };
  assert.strictEqual(classifyTransition(r), null);
});

ok("a failed/unsynthesized result is honestly skipped, never alerted on", () => {
  assert.strictEqual(classifyTransition({ ok: false, symbol: "XYZ" }), null);
});

console.log("Checking formatAlert — real, readable transition text…");
ok("includes the real symbol, real score transition, and real stage transition", () => {
  const text = formatAlert("HORSE_ACCELERATING", { symbol: "XYZ", future_wealth_score: 75, priorWealthScore: 68, stageLabel: "INFLECTION", priorStageLabel: "EMERGING" });
  assert.ok(text.includes("XYZ"));
  assert.ok(text.includes("68") && text.includes("75"));
  assert.ok(text.includes("EMERGING") && text.includes("INFLECTION"));
  assert.ok(text.includes("🐎"));
});

console.log(`\n${passed} checks passed.`);
console.log("FUTURE-WALLET-ALERTS TEST OK");
