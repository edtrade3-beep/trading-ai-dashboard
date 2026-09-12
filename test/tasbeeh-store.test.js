"use strict";
// tasbeeh-store.test.js — real, persisted state for the Telegram /tasbeeh
// interactive counter (2026-09-12 command-table update). Uses the real
// atomic-write.js file-backed store (same convention as
// story-ai-core.test.js's Project Store checks) — resets the real state
// file before/after so this never leaves stray state for a real run.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("../src/config");
const {
  DHIKR_LIST, TARGETS, defaultState, loadTasbeeh, saveTasbeeh,
  increment, undo, reset, setDhikr, setTarget,
} = require("../src/tasbeeh-store");

const STATE_PATH = path.join(ROOT, "data", "tasbeeh-state.json");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

function resetFile() { try { fs.unlinkSync(STATE_PATH); } catch {} }

console.log("Checking tasbeeh-store — real, persisted interactive-counter state…");

resetFile();

ok("loadTasbeeh returns the real documented defaults when no state file exists yet", () => {
  const s = loadTasbeeh();
  assert.deepStrictEqual(s, defaultState());
});

ok("increment saves a real, larger count and records real undo history", () => {
  let s = loadTasbeeh();
  s = increment(s);
  s = increment(s);
  assert.strictEqual(s.count, 2);
  assert.deepStrictEqual(s.history, [0, 1]);
  const reloaded = loadTasbeeh();
  assert.strictEqual(reloaded.count, 2, "increment must really persist to disk, not just in memory");
});

ok("undo reverts to the real previous count, never goes below what history actually recorded", () => {
  let s = loadTasbeeh();
  s = undo(s);
  assert.strictEqual(s.count, 1);
  s = undo(s);
  assert.strictEqual(s.count, 0);
});

ok("undo with empty history is a real no-op, never throws or goes negative", () => {
  let s = loadTasbeeh();
  assert.strictEqual(s.count, 0);
  s = undo(s);
  assert.strictEqual(s.count, 0);
  assert.deepStrictEqual(s.history, []);
});

ok("reset zeroes the real count and clears history, without touching dhikr/target", () => {
  let s = loadTasbeeh();
  s = setDhikr(s, 2);
  s = increment(s);
  s = increment(s);
  s = reset(s);
  assert.strictEqual(s.count, 0);
  assert.deepStrictEqual(s.history, []);
  assert.strictEqual(s.dhikrIndex, 2, "reset must not change the selected dhikr");
});

ok("setDhikr changes the real selected dhikr and honestly restarts the count for the new dhikr", () => {
  let s = loadTasbeeh();
  s = increment(s);
  s = setDhikr(s, 1);
  assert.strictEqual(s.dhikrIndex, 1);
  assert.strictEqual(s.count, 0, "switching dhikr should not carry over a count from a different dhikr");
});

ok("setDhikr rejects a real out-of-range index, never crashes or silently corrupts state", () => {
  let s = loadTasbeeh();
  const before = { ...s };
  s = setDhikr(s, 999);
  assert.deepStrictEqual(s, before);
  s = setDhikr(s, -1);
  assert.deepStrictEqual(s, before);
});

ok("setTarget accepts every real documented target and 'no target' (null), rejects anything else", () => {
  let s = loadTasbeeh();
  for (const t of TARGETS) {
    s = setTarget(s, t);
    assert.strictEqual(s.target, t);
  }
  s = setTarget(s, null);
  assert.strictEqual(s.target, null);
  const before = { ...s };
  s = setTarget(s, 12345);
  assert.deepStrictEqual(s, before, "an unrecognized target must be rejected, never silently accepted");
});

ok("DHIKR_LIST entries all carry real, non-empty Arabic text and a real English label", () => {
  for (const d of DHIKR_LIST) {
    assert.ok(typeof d.ar === "string" && d.ar.trim().length > 0);
    assert.ok(typeof d.label === "string" && d.label.trim().length > 0);
  }
});

resetFile();

console.log(`\n${passed} checks passed.`);
if (!process.exitCode) console.log("TASBEEH-STORE TEST OK");
