"use strict";
// Real structural test for TradeDeskTabs.jsx's "Deep Analysis" dropdown
// (2026-09-15, "AI Trade Desk restructure" master prompt's own explicit
// closing recommendation: collapse the always-visible 7-button
// Overview/Technicals/Options/News/Fundamentals/Cortex/Journal strip into
// one expandable "Deep Analysis" section). .jsx source-inspection
// convention (fs.readFileSync + regex), same as this repo's other
// component tests — no JSX runtime needed. Regression guard: same 7
// destinations, same real target values, so no destination silently
// disappears in the chrome-only refactor.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const src = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "TradeDeskTabs.jsx"), "utf8");

console.log("Checking TradeDeskTabs.jsx — collapsed into a single Deep Analysis dropdown…");

ok("all 7 real destinations survive the refactor, same real target values — no destination silently dropped", () => {
  assert.match(src, /\["Overview", "overview"\], \["Technicals", "vcp"\], \["Options", "options"\], \["News", "news"\],/);
  assert.match(src, /\["Fundamentals", "discover"\], \["Cortex", "cortex"\], \["Journal", "journal"\],/);
});

ok("no permanent 7-button row remains — real single toggle, dropdown only rendered when open", () => {
  assert.match(src, /Deep Analysis/);
  assert.match(src, /useState\(false\)/);
  assert.match(src, /\{open && \(/);
});

ok("selecting a menu item still calls the same real onOpen(target) contract and closes the menu", () => {
  assert.match(src, /onClick=\{\(\) => \{ onOpen\(target\); setOpen\(false\); \}\}/);
});

ok("the toggle button's own label reflects the real active destination, not a static 'Deep Analysis' with no context", () => {
  assert.match(src, /const active = TABS\.find\(\(\[, target\]\) => target === activeKey\);/);
  assert.match(src, /activeLabel !== "Overview"/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TRADE-DESK-TABS-DEEP-ANALYSIS TEST FAILED");
else console.log("TRADE-DESK-TABS-DEEP-ANALYSIS TEST OK");
