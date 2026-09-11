"use strict";
// prayer-query-engine.test.js — Master Agent, single-prayer time query
// ("معاش صلاة الظهر أو العصر أو الصبح أو المغرب أو العشاء"). Covers
// resolvePrayerKey only (pure) — answerPrayerTimeQuery itself makes a real
// live network call via prayer-times.js's Aladhan fetch, exercised live
// instead of mocked (same convention as this session's other engines).
const assert = require("node:assert");
const { resolvePrayerKey } = require("../src/prayer-query-engine");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

console.log("Checking resolvePrayerKey — real dialect-aware prayer-name resolution, no false positives…");

ok("every real prayer name the user asked for resolves to its real canonical key", () => {
  assert.strictEqual(resolvePrayerKey("معاش صلاة الظهر"), "Dhuhr");
  assert.strictEqual(resolvePrayerKey("معاش صلاة العصر"), "Asr");
  assert.strictEqual(resolvePrayerKey("معاش صلاة المغرب"), "Maghrib");
  assert.strictEqual(resolvePrayerKey("معاش صلاة العشاء"), "Isha");
});
ok("the colloquial \"الصبح\" (real common Maghrebi/Gulf alternative for Fajr) resolves to Fajr, same as \"الفجر\"", () => {
  assert.strictEqual(resolvePrayerKey("معاش صلاة الصبح"), "Fajr");
  assert.strictEqual(resolvePrayerKey("معاش صلاة الفجر"), "Fajr");
});
ok("unrelated text (including the other Arabic triggers) returns null, never a false-positive prayer match", () => {
  assert.strictEqual(resolvePrayerKey("مرحبا عدول"), null);
  assert.strictEqual(resolvePrayerKey("كيف داير السوق اليوم"), null);
  assert.strictEqual(resolvePrayerKey("كيف داير الجو اليوم"), null);
  assert.strictEqual(resolvePrayerKey("good morning"), null);
  assert.strictEqual(resolvePrayerKey(""), null);
});

console.log(`\n${passed} checks passed.`);
if (!process.exitCode) console.log("PRAYER-QUERY-ENGINE TEST OK");
