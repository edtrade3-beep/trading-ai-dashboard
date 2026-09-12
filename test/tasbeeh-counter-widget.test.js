"use strict";
// tasbeeh-counter-widget.test.js — real structural regression test for the
// web Islamic tab's Tasbeeh counter (axiom-runner/components/
// TasbeehCounter.jsx — a real, pre-existing localStorage-persisted widget,
// entirely separate from the Telegram bot's own /tasbeeh feature). Covers
// the 2026-09-12 explicit user request: "In islamic tab set goal in
// tasbih add الصلاة على رسول الله" — a new Salawat phrase, and a real
// per-phrase editable/persisted goal (previously only the blank "Custom"
// phrase had one). Same fs.readFileSync + regex structural-check
// convention as trading-copilot-agent-features.test.js — this is a React
// component with no exported pure logic worth extracting just to unit-test.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

const src = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "TasbeehCounter.jsx"), "utf8");

console.log("Checking TasbeehCounter.jsx — real Salawat phrase + real per-phrase editable goal…");

ok("PHRASES includes a real Salawat entry with real, non-empty Arabic text", () => {
  const start = src.indexOf("const PHRASES = [");
  const end = src.indexOf("];", start);
  const block = src.slice(start, end);
  assert.match(block, /id: "salawat"/);
  assert.match(block, /ar: "الصلاة على رسول الله"/);
});

ok("the goal control is real and shared by every phrase — not special-cased to only the blank \"Custom\" phrase anymore", () => {
  assert.doesNotMatch(src, /phraseId === "custom" &&/, "the old Custom-only goal input must be removed, not left alongside the new generic one");
  assert.match(src, /<label[^>]*>Goal: <\/label>/);
});

ok("the real target comes from the persisted per-phrase targets state, falling back to that phrase's own documented default", () => {
  assert.match(src, /const target = targets\[phraseId\] \?\? phrase\.target;/);
});

ok("targets are real and persisted to their own localStorage key, distinct from the counts key", () => {
  assert.match(src, /const TARGETS_KEY = "islamic_tasbeeh_targets";/);
  assert.match(src, /function loadTargets\(\)/);
  assert.match(src, /function saveTargets\(t\)/);
  assert.match(src, /useEffect\(\(\) => \{ saveTargets\(targets\); \}, \[targets\]\);/);
});

ok("setGoal clamps to a real minimum of 1, never accepts 0/negative/NaN", () => {
  assert.match(src, /const setGoal = \(val\) => setTargets\(\(t\) => \(\{ \.\.\.t, \[phraseId\]: Math\.max\(1, Number\(val\) \|\| 1\) \}\)\);/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TASBEEH-COUNTER-WIDGET TEST FAILED");
else console.log("TASBEEH-COUNTER-WIDGET TEST OK");
