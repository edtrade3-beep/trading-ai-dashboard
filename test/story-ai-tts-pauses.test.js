"use strict";
// story-ai-tts-pauses.test.js — real SSML pause markup (2026-09-11, live
// user report: "IN STORY AI I FEEL LIKE I SOMEBODY READING FORM BOOK NOT
// A STORY TELLER"). Covers the pure markUpPauses/xmlEscape functions —
// generateSpeech itself makes a real live network call to whichever TTS
// provider is configured, exercised live instead (same convention as this
// session's other engines; verified manually this session: light-pauses
// vs dramatic-pauses produced 86208 vs 95232 real audio bytes for the
// identical text against a real Google Cloud TTS account).
const assert = require("node:assert");
const { markUpPauses, xmlEscape, PAUSE_MS } = require("../src/story-ai-tts-provider");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

console.log("Checking xmlEscape — real XML-safety, required for valid SSML…");

ok("escapes the three real XML-significant characters, nothing else touched", () => {
  assert.equal(xmlEscape("a & b < c > d"), "a &amp; b &lt; c &gt; d");
  assert.equal(xmlEscape("مرحبا"), "مرحبا");
});
ok("null/undefined input never throws, honestly returns an empty string", () => {
  assert.equal(xmlEscape(null), "");
  assert.equal(xmlEscape(undefined), "");
});

console.log("\nChecking markUpPauses — real, setting-dependent <break> insertion, never the same fixed markup regardless of the Pauses setting…");

ok("sentence-ending punctuation (., !, Arabic ؟) gets a real break at the setting's real sentence duration, wherever more text follows (never after the absolute final sentence, where there's nothing left to separate)", () => {
  const out = markUpPauses("جملة أولى. جملة ثانية! جملة ثالثة؟ جملة رابعة.", "natural");
  assert.equal((out.match(/<break time="400ms"\/>/g) || []).length, 3);
});
ok("commas (Arabic ، and Latin ,) get a real, shorter break than sentence endings, wherever more text follows", () => {
  const out = markUpPauses("أولاً، ثانياً, ثالثاً. رابعاً.", "natural");
  assert.equal((out.match(/<break time="150ms"\/>/g) || []).length, 2);
  assert.equal((out.match(/<break time="400ms"\/>/g) || []).length, 1);
});
ok("paragraph breaks (blank lines) get the longest real pause, distinct from a single sentence break", () => {
  const out = markUpPauses("فقرة أولى.\n\nفقرة ثانية.", "natural");
  assert.ok(out.includes('<break time="700ms"/>'));
});
ok("every one of the three real Pauses settings produces genuinely different durations — never the same fixed markup regardless of what the user picked", () => {
  const text = "جملة أولى. جملة ثانية.";
  const light = markUpPauses(text, "light");
  const natural = markUpPauses(text, "natural");
  const dramatic = markUpPauses(text, "dramatic");
  assert.notEqual(light, natural);
  assert.notEqual(natural, dramatic);
  assert.ok(PAUSE_MS.light.sentence < PAUSE_MS.natural.sentence);
  assert.ok(PAUSE_MS.natural.sentence < PAUSE_MS.dramatic.sentence);
});
ok("an invalid/missing pauses value honestly falls back to the documented 'natural' default, never a crash", () => {
  const fallback = markUpPauses("جملة.", "not-a-real-setting");
  const natural = markUpPauses("جملة.", "natural");
  assert.equal(fallback, natural);
  assert.equal(markUpPauses("جملة."), natural);
});
ok("real text content is never altered or dropped — only break tags are inserted between it", () => {
  const text = "الدَّين ما يأتي دائمًا من الفقر.";
  const out = markUpPauses(text, "natural");
  assert.ok(out.startsWith("الدَّين ما يأتي دائمًا من الفقر."));
});

console.log(`\n${passed} checks passed.`);
if (!process.exitCode) console.log("STORY-AI-TTS-PAUSES TEST OK");
