// Real tests for src/routes/photo-banner.js's sanitizeSuggestion — the
// real, disclosed validation layer between Claude's raw JSON output and
// what the client ever renders. Never trust a model's output shape
// blindly: any field outside the real allowed vocabulary must fall back
// to an honest, clearly-labeled default rather than passing through and
// breaking the Canvas draw or rendering an unreadable banner.
// Pure-function, synthetic-input, zero-network.
// Run: node test/photo-banner.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { sanitizeSuggestion } = require("../src/routes/photo-banner");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking sanitizeSuggestion — real validation of Claude's raw output…");

ok("a real, well-formed suggestion passes through unchanged", () => {
  const r = sanitizeSuggestion({ bannerText: "SALE", position: "top", bgColor: "#c8282a", textColor: "#ffffff", reasoning: "High contrast against the dark background." });
  assert.deepStrictEqual(r, { bannerText: "SALE", position: "top", bgColor: "#c8282a", textColor: "#ffffff", reasoning: "High contrast against the dark background." });
});

ok("empty/missing bannerText -> honestly null, never a fabricated placeholder banner", () => {
  assert.strictEqual(sanitizeSuggestion({ bannerText: "", position: "top" }), null);
  assert.strictEqual(sanitizeSuggestion({ position: "top" }), null);
  assert.strictEqual(sanitizeSuggestion(null), null);
});

ok("bannerText is trimmed and capped at 40 chars — never an unbounded banner", () => {
  const r = sanitizeSuggestion({ bannerText: "  " + "X".repeat(60) + "  " });
  assert.strictEqual(r.bannerText.length, 40);
  assert.ok(!r.bannerText.startsWith(" "));
});

ok("an invalid position falls back to the honest default 'top', never passed through raw", () => {
  const r = sanitizeSuggestion({ bannerText: "SALE", position: "diagonal-corner-ribbon" });
  assert.strictEqual(r.position, "top");
});

ok("both real valid positions ('top' and 'bottom') are honored exactly", () => {
  assert.strictEqual(sanitizeSuggestion({ bannerText: "SALE", position: "top" }).position, "top");
  assert.strictEqual(sanitizeSuggestion({ bannerText: "SALE", position: "bottom" }).position, "bottom");
});

ok("an invalid/missing hex color falls back to the honest default, never a broken CSS value reaching the client", () => {
  const r1 = sanitizeSuggestion({ bannerText: "SALE", bgColor: "red", textColor: "not-a-color" });
  assert.strictEqual(r1.bgColor, "#c8282a");
  assert.strictEqual(r1.textColor, "#ffffff");
  const r2 = sanitizeSuggestion({ bannerText: "SALE" });
  assert.strictEqual(r2.bgColor, "#c8282a");
  assert.strictEqual(r2.textColor, "#ffffff");
});

ok("a real valid hex color (any case) is honored exactly", () => {
  const r = sanitizeSuggestion({ bannerText: "SALE", bgColor: "#0D9465", textColor: "#000000" });
  assert.strictEqual(r.bgColor, "#0D9465");
  assert.strictEqual(r.textColor, "#000000");
});

ok("missing/non-string reasoning degrades to an honest empty string, never fabricated", () => {
  assert.strictEqual(sanitizeSuggestion({ bannerText: "SALE", reasoning: 12345 }).reasoning, "");
  assert.strictEqual(sanitizeSuggestion({ bannerText: "SALE" }).reasoning, "");
});

console.log(`\n${passed} checks passed.`);
console.log("PHOTO-BANNER TEST OK");
