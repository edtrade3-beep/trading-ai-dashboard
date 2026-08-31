// Real tests for src/money-ideas-engine.js's pure sanitizers — the
// Curbline "Money Ideas" scan (explicit user request, 2026-08-31). Same
// zero-network, pure-function convention as curbline-intel-engine.test.js
// — the AI call itself (money-ideas-ai.js) is untested by design.
"use strict";
const assert = require("node:assert");
const {
  DIFFICULTIES, sanitizeDifficulty, sanitizeIdeas, sanitizeTrends, sanitizeWatchFor,
} = require("../src/money-ideas-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking sanitizeDifficulty — bounded enum, honest default…");
ok("a real, in-enum difficulty round-trips", () => {
  assert.strictEqual(sanitizeDifficulty("LOW"), "LOW");
});
ok("case-insensitive", () => {
  assert.strictEqual(sanitizeDifficulty("high"), "HIGH");
});
ok("an out-of-enum value honestly degrades to MEDIUM", () => {
  assert.strictEqual(sanitizeDifficulty("BOGUS"), "MEDIUM");
});
ok("every real DIFFICULTIES entry is accepted", () => {
  for (const d of DIFFICULTIES) assert.strictEqual(sanitizeDifficulty(d), d);
});

console.log("\nChecking sanitizeIdeas — real idea required, capped, malformed dropped…");
ok("a well-formed idea round-trips", () => {
  const ideas = sanitizeIdeas([{ idea: "AI-assisted video editing for creators", whyNow: "Demand outpacing supply", howToStart: "List on Upwork", realExample: "x", difficulty: "LOW", timeToFirstDollar: "1-2 weeks" }]);
  assert.strictEqual(ideas.length, 1);
  assert.strictEqual(ideas[0].idea, "AI-assisted video editing for creators");
  assert.strictEqual(ideas[0].difficulty, "LOW");
});
ok("an idea with no idea text is dropped", () => {
  assert.strictEqual(sanitizeIdeas([{ whyNow: "x" }]).length, 0);
});
ok("caps at 8 real items, never unbounded", () => {
  const raw = Array.from({ length: 20 }, (_, i) => ({ idea: `Idea ${i}` }));
  assert.strictEqual(sanitizeIdeas(raw).length, 8);
});
ok("malformed input (not an array) returns an honest empty list", () => {
  assert.deepStrictEqual(sanitizeIdeas(null), []);
  assert.deepStrictEqual(sanitizeIdeas("not an array"), []);
});
ok("missing difficulty honestly defaults to MEDIUM, never crashes", () => {
  assert.strictEqual(sanitizeIdeas([{ idea: "x" }])[0].difficulty, "MEDIUM");
});

console.log("\nChecking sanitizeTrends — capped trend+note pairs…");
ok("a well-formed trend round-trips", () => {
  const t = sanitizeTrends([{ trend: "AI agents doing freelance work", note: "New marketplaces emerging" }]);
  assert.strictEqual(t.length, 1);
  assert.strictEqual(t[0].trend, "AI agents doing freelance work");
});
ok("a trend with no trend text is dropped", () => {
  assert.strictEqual(sanitizeTrends([{ note: "x" }]).length, 0);
});
ok("caps at 6 real items", () => {
  const raw = Array.from({ length: 15 }, (_, i) => ({ trend: `Trend ${i}` }));
  assert.strictEqual(sanitizeTrends(raw).length, 6);
});

console.log("\nChecking sanitizeWatchFor — bounded string list…");
ok("a well-formed list round-trips, blanks dropped", () => {
  assert.deepStrictEqual(sanitizeWatchFor(["Platform X pricing change", "", "New entrant"]), ["Platform X pricing change", "New entrant"]);
});
ok("malformed input returns an honest empty list", () => {
  assert.deepStrictEqual(sanitizeWatchFor(null), []);
});
ok("caps at 6 real items", () => {
  const raw = Array.from({ length: 12 }, (_, i) => `item ${i}`);
  assert.strictEqual(sanitizeWatchFor(raw).length, 6);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("MONEY-IDEAS-ENGINE TEST FAILED"); else console.log("MONEY-IDEAS-ENGINE TEST OK");
