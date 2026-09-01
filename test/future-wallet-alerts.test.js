// Real tests for src/future-wallet-alerts.js (Horse Hunter upgrade,
// 2026-08-26) — real stage/score transition classification, pure and
// zero-network/zero-DB (sendHorseAlerts itself is DB+Telegram orchestration,
// not unit tested here, same as this codebase's other alert-dispatch
// orchestration functions).
// Run: node test/future-wallet-alerts.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { classifyTransition, formatAlert, summarizeSwarmResults, formatSwarmAlert } = require("../src/future-wallet-alerts");

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

console.log("Checking summarizeSwarmResults — real per-symbol avg score, honest exclusions…");

ok("averages only real, non-null scores across a symbol's agents", () => {
  const results = [
    { symbol: "XYZ", agent: "Moat", ok: true, score: 80 },
    { symbol: "XYZ", agent: "Market", ok: true, score: 60 },
  ];
  const s = summarizeSwarmResults(results);
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].symbol, "XYZ");
  assert.strictEqual(s[0].avgScore, 70);
  assert.strictEqual(s[0].agentCount, 2);
});

ok("a failed agent call is honestly excluded, never counted as a 0", () => {
  const results = [
    { symbol: "XYZ", agent: "Moat", ok: true, score: 90 },
    { symbol: "XYZ", agent: "Market", ok: false, score: null },
  ];
  const s = summarizeSwarmResults(results);
  assert.strictEqual(s[0].avgScore, 90);
  assert.strictEqual(s[0].agentCount, 1);
});

ok("a real null score (agent honestly couldn't score it) is excluded, never counted as a 0", () => {
  const results = [{ symbol: "XYZ", agent: "Moat", ok: true, score: null }];
  const s = summarizeSwarmResults(results);
  assert.strictEqual(s.length, 0);
});

ok("real symbols sort by real avg score, highest first", () => {
  const results = [
    { symbol: "LOW", agent: "Moat", ok: true, score: 40 },
    { symbol: "HIGH", agent: "Moat", ok: true, score: 95 },
  ];
  const s = summarizeSwarmResults(results);
  assert.strictEqual(s[0].symbol, "HIGH");
  assert.strictEqual(s[1].symbol, "LOW");
});

ok("empty/malformed input returns an honest empty list, never a crash", () => {
  assert.deepStrictEqual(summarizeSwarmResults(null), []);
  assert.deepStrictEqual(summarizeSwarmResults([]), []);
});

console.log("Checking formatSwarmAlert — real, readable weekly summary…");

ok("includes real call counts and top symbols with their real avg scores", () => {
  const swarmResult = { totalCalls: 12, succeeded: 10, candidates: ["A", "B"] };
  const summaries = [{ symbol: "A", avgScore: 88, agentCount: 6 }, { symbol: "B", avgScore: 55, agentCount: 6 }];
  const text = formatSwarmAlert(swarmResult, summaries);
  assert.ok(text.includes("10/12"));
  assert.ok(text.includes("A") && text.includes("88"));
  assert.ok(text.includes("B") && text.includes("55"));
  assert.ok(text.includes("🐎"));
});

ok("zero real candidates clearing a score is disclosed honestly, not a fabricated top list", () => {
  const text = formatSwarmAlert({ totalCalls: 6, succeeded: 0, candidates: ["A"] }, []);
  assert.ok(text.toLowerCase().includes("no candidate"));
});

console.log(`\n${passed} checks passed.`);
console.log("FUTURE-WALLET-ALERTS TEST OK");
