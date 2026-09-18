"use strict";
// mobile-home-usability.test.js (2026-09-18, explicit user report: "App on
// phone hard to use" — text/buttons too small, layout cramped, navigation
// confusing on the Mobile Home screen). Real structural checks — no
// jsdom/testing-library in this repo, same fs.readFileSync + regex
// convention as tasbeeh-counter-widget.test.js.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const gridSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "MobileHomeGrid.jsx"), "utf8");
const navSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "MobileBottomNav.jsx"), "utf8");

console.log("Checking MobileHomeGrid.jsx — real usability fix…");

ok("PRIME is now a real, reachable featured card — it's axiom-live.jsx's own default landing tab and had zero presence on mobile Home before this fix", () => {
  assert.match(gridSrc, /tab: "prime"/);
  assert.match(gridSrc, /setActiveTab\(PRIME_CARD\.tab\)/);
});

ok("outer page padding is real (not the old near-zero 2px side margin that pinned content to the screen edge)", () => {
  assert.doesNotMatch(gridSrc, /padding: "4px 2px 90px"/);
  assert.match(gridSrc, /padding: "12px 12px 90px"/);
});

ok("nav card description text was bumped up from the old 10.5px (real readability fix)", () => {
  assert.doesNotMatch(gridSrc, /fontSize: 10\.5, color: C\.textDim, lineHeight: 1\.3/);
  assert.match(gridSrc, /fontSize: 11\.5, color: C\.textDim, lineHeight: 1\.35/);
});

ok("nav card tap target grew (minHeight 88 -> 100) for easier thumb accuracy", () => {
  assert.doesNotMatch(gridSrc, /minHeight: 88/);
  assert.match(gridSrc, /minHeight: 100/);
});

console.log("\nChecking MobileBottomNav.jsx — real usability fix…");

ok("bottom-bar icon/label sizes grew (19px->21px icon, 9.5px->10.5px label) and each item has a real minHeight tap target", () => {
  assert.match(navSrc, /fontSize: 21, lineHeight: 1/);
  assert.match(navSrc, /fontFamily: SANS, fontSize: 10\.5, fontWeight: active \? 800 : 600/);
  assert.match(navSrc, /minHeight: 48/);
});

ok("MOBILE_BOTTOM_NAV_H grew to fit the larger sizing (62 -> 66) — stays a single exported constant every consumer (axiom-live.jsx) reads, never hardcoded twice", () => {
  assert.match(navSrc, /export const MOBILE_BOTTOM_NAV_H = 66/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("MOBILE-HOME-USABILITY TEST FAILED");
else console.log("MOBILE-HOME-USABILITY TEST OK");
