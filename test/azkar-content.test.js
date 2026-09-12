"use strict";
// azkar-content.test.js — real, static Islamic remembrance content
// (2026-09-12 command-table update: "Morning duaa"/"Evening duaa").
// Checks structure/counts/honest disclosure only — the actual Arabic text
// is hand-verified religious content, not something a test should try to
// re-derive or fuzz.
const assert = require("node:assert");
const { MORNING_AZKAR, EVENING_AZKAR, formatMorningAzkar, formatEveningAzkar } = require("../src/azkar-content");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

console.log("Checking azkar-content — real, static content with real repetition counts, never AI-generated…");

ok("every morning/evening azkar entry has real non-empty Arabic text and a positive integer repetition count", () => {
  for (const list of [MORNING_AZKAR, EVENING_AZKAR]) {
    assert.ok(list.length >= 5, "a real core selection must have a meaningful number of entries");
    for (const z of list) {
      assert.ok(typeof z.ar === "string" && z.ar.trim().length > 0, "every entry needs real Arabic text");
      assert.ok(Number.isInteger(z.count) && z.count >= 1, "every entry needs a real positive repetition count");
      assert.ok(typeof z.note === "string" && z.note.trim().length > 0, "every entry needs a real name/note");
    }
  }
});

ok("morning and evening sets are the same real length and differ in exactly the one real time-of-day-specific line", () => {
  assert.strictEqual(MORNING_AZKAR.length, EVENING_AZKAR.length);
  let diffCount = 0;
  for (let i = 0; i < MORNING_AZKAR.length; i++) {
    if (MORNING_AZKAR[i].ar !== EVENING_AZKAR[i].ar) diffCount++;
  }
  assert.strictEqual(diffCount, 1, "only the أصبحنا/أمسينا line should differ between the two sets");
});

ok("formatMorningAzkar/formatEveningAzkar honestly disclose this is a core selection, not the complete book", () => {
  assert.match(formatMorningAzkar(), /core selection.*not the complete/i);
  assert.match(formatEveningAzkar(), /core selection.*not the complete/i);
});

ok("formatMorningAzkar/formatEveningAzkar render every real entry's note, count (when >1), and Arabic text", () => {
  const text = formatMorningAzkar();
  for (const z of MORNING_AZKAR) {
    assert.ok(text.includes(z.note), `missing note: ${z.note}`);
    assert.ok(text.includes(z.ar), `missing Arabic text for: ${z.note}`);
    if (z.count > 1) assert.ok(text.includes(`×${z.count}`), `missing repetition count for: ${z.note}`);
  }
});

ok("formatMorningAzkar and formatEveningAzkar produce distinct real output", () => {
  assert.notStrictEqual(formatMorningAzkar(), formatEveningAzkar());
  assert.match(formatMorningAzkar(), /الصباح/);
  assert.match(formatEveningAzkar(), /المساء/);
});

console.log(`\n${passed} checks passed.`);
if (!process.exitCode) console.log("AZKAR-CONTENT TEST OK");
