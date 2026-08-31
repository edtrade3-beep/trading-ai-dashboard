// Real tests for src/curbline-intel-engine.js's pure sanitizers — the
// daily 8:30 AM ET Curbline Intel scan (explicit user request,
// 2026-08-31). Pure-function, synthetic-input, zero-network — the AI
// call itself (curbline-intel-ai.js) is untested by design, same
// precedent as market-wrap-ai.js/research-intel-ai.js in this codebase.
"use strict";
const assert = require("node:assert");
const {
  sanitizeSummary, sanitizeCompetitors, sanitizeSpendNote,
  sanitizePricingRecommendation, sanitizeOpportunities, sanitizeRisks, sanitizeWatchFor,
} = require("../src/curbline-intel-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking sanitizeSummary — bounded string, honest default…");
ok("a real string round-trips, trimmed", () => {
  assert.strictEqual(sanitizeSummary("  Real market read.  "), "Real market read.");
});
ok("malformed input returns an honest empty string, never fabricated", () => {
  assert.strictEqual(sanitizeSummary(null), "");
  assert.strictEqual(sanitizeSummary(undefined), "");
  assert.strictEqual(sanitizeSummary(42), "");
});
ok("caps at 900 chars", () => {
  assert.strictEqual(sanitizeSummary("x".repeat(2000)).length, 900);
});

console.log("\nChecking sanitizeCompetitors — real name required, capped, malformed dropped…");
ok("a well-formed competitor round-trips", () => {
  const c = sanitizeCompetitors([{ name: "AutoRaptor", whatTheyDo: "CRM for dealers", pricingNote: "$300/mo", strength: "Established", weakness: "No ad generation" }]);
  assert.strictEqual(c.length, 1);
  assert.strictEqual(c[0].name, "AutoRaptor");
  assert.strictEqual(c[0].pricingNote, "$300/mo");
});
ok("a competitor with no name is dropped", () => {
  assert.strictEqual(sanitizeCompetitors([{ whatTheyDo: "x" }]).length, 0);
});
ok("caps at 8 real items, never unbounded", () => {
  const raw = Array.from({ length: 20 }, (_, i) => ({ name: `Comp ${i}` }));
  assert.strictEqual(sanitizeCompetitors(raw).length, 8);
});
ok("malformed input (not an array) returns an honest empty list", () => {
  assert.deepStrictEqual(sanitizeCompetitors(null), []);
  assert.deepStrictEqual(sanitizeCompetitors("not an array"), []);
});

console.log("\nChecking sanitizeSpendNote — bounded note + range…");
ok("a well-formed spend note round-trips", () => {
  const s = sanitizeSpendNote({ note: "Small dealers typically spend...", typicalMonthlyRange: "$500-1500/mo" });
  assert.strictEqual(s.typicalMonthlyRange, "$500-1500/mo");
});
ok("malformed input returns an honest empty default, never fabricated", () => {
  assert.deepStrictEqual(sanitizeSpendNote(null), { note: "", typicalMonthlyRange: "" });
});

console.log("\nChecking sanitizePricingRecommendation — bounded note + suggested price…");
ok("a well-formed recommendation round-trips", () => {
  const p = sanitizePricingRecommendation({ note: "Positioned well.", suggestedPrice: "no change" });
  assert.strictEqual(p.suggestedPrice, "no change");
});
ok("malformed input returns an honest empty default, never fabricated", () => {
  assert.deepStrictEqual(sanitizePricingRecommendation(undefined), { note: "", suggestedPrice: "" });
});

console.log("\nChecking sanitizeOpportunities / sanitizeRisks — capped idea+reason lists…");
ok("a well-formed opportunity round-trips", () => {
  const o = sanitizeOpportunities([{ idea: "Bundle CarFax parsing", reason: "Dealers already paste CarFax elsewhere" }]);
  assert.strictEqual(o.length, 1);
  assert.strictEqual(o[0].idea, "Bundle CarFax parsing");
});
ok("an opportunity with no idea is dropped", () => {
  assert.strictEqual(sanitizeOpportunities([{ reason: "x" }]).length, 0);
});
ok("opportunities cap at 6 real items", () => {
  const raw = Array.from({ length: 15 }, (_, i) => ({ idea: `Idea ${i}` }));
  assert.strictEqual(sanitizeOpportunities(raw).length, 6);
});
ok("a well-formed risk round-trips", () => {
  const r = sanitizeRisks([{ risk: "Agencies undercut on price", reason: "Some already bundle ads free with retainers" }]);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].risk, "Agencies undercut on price");
});
ok("risks cap at 6 real items", () => {
  const raw = Array.from({ length: 15 }, (_, i) => ({ risk: `Risk ${i}` }));
  assert.strictEqual(sanitizeRisks(raw).length, 6);
});

console.log("\nChecking sanitizeWatchFor — bounded string list…");
ok("a well-formed list round-trips, blanks dropped", () => {
  assert.deepStrictEqual(sanitizeWatchFor(["Competitor X pricing change", "", "New entrant"]), ["Competitor X pricing change", "New entrant"]);
});
ok("malformed input returns an honest empty list", () => {
  assert.deepStrictEqual(sanitizeWatchFor(null), []);
  assert.deepStrictEqual(sanitizeWatchFor("not an array"), []);
});
ok("caps at 6 real items", () => {
  const raw = Array.from({ length: 12 }, (_, i) => `item ${i}`);
  assert.strictEqual(sanitizeWatchFor(raw).length, 6);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("CURBLINE-INTEL-ENGINE TEST FAILED"); else console.log("CURBLINE-INTEL-ENGINE TEST OK");
