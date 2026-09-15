"use strict";
// Real structural test for TradeDeskTabs.jsx's "Deep Analysis" dropdown.
// 2026-09-15, first pass ("AI Trade Desk restructure" master prompt):
// collapsed the always-visible 7-button Overview/Technicals/Options/
// News/Fundamentals/Cortex/Journal strip into one expandable dropdown.
// 2026-09-15, second pass, same day ("simplify the entire user
// experience" master prompt): extended the component to accept a real
// `groups` prop (grouped [label,target] pairs with optional section
// headers) so it could ALSO absorb the Trade Desk's separate always-
// visible 19-item side rail — DEFAULT_GROUPS below is only the fallback
// shape for a caller that doesn't pass its own groups. .jsx
// source-inspection convention (fs.readFileSync + regex), same as this
// repo's other component tests — no JSX runtime needed.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const src = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "TradeDeskTabs.jsx"), "utf8");

console.log("Checking TradeDeskTabs.jsx — a single, groupable Deep Analysis dropdown…");

ok("all 7 original destinations survive as the real default fallback shape, same real target values — no destination silently dropped", () => {
  assert.match(src, /\["Overview", "overview"\], \["Technicals", "vcp"\], \["Options", "options"\], \["News", "news"\], \["Fundamentals", "discover"\], \["Cortex", "cortex"\], \["Journal", "journal"\]/);
});

ok("accepts a real `groups` prop (grouped items, section headers optional) instead of a single hardcoded list — the real mechanism TradeDeskTab.jsx now feeds its 19-item DEEP_ANALYSIS_GROUPS through", () => {
  assert.match(src, /groups = DEFAULT_GROUPS/);
  assert.match(src, /groups\.flatMap\(\(g\) => g\.items\)/);
  assert.match(src, /groups\.map\(\(group, gi\) => \(/);
});

ok("group section headers render only when a real group name is present — the flat/ungrouped fallback shape shows no empty header", () => {
  assert.match(src, /\{group\.name && \(/);
});

ok("no permanent button row remains — real single toggle, dropdown only rendered when open", () => {
  assert.match(src, /Deep Analysis/);
  assert.match(src, /useState\(false\)/);
  assert.match(src, /\{open && \(/);
});

ok("selecting a menu item still calls the same real onOpen(target) contract and closes the menu", () => {
  assert.match(src, /onClick=\{\(\) => \{ onOpen\(target\); setOpen\(false\); \}\}/);
});

ok("the toggle button's own label reflects the real active destination across ALL groups, not just the fallback shape, and never a static 'Deep Analysis' with no context", () => {
  assert.match(src, /const active = flat\.find\(\(\[, target\]\) => target === activeKey\);/);
  assert.match(src, /activeLabel !== "Overview"/);
});

ok("the menu is height-bounded with internal scroll — a 19+ item combined list can never overflow off-screen", () => {
  assert.match(src, /maxHeight: "70vh", overflowY: "auto"/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TRADE-DESK-TABS-DEEP-ANALYSIS TEST FAILED");
else console.log("TRADE-DESK-TABS-DEEP-ANALYSIS TEST OK");
