"use strict";
// Structural regression checks for the 2026-09-02 Trade Desk layout fixes
// — same fs.readFileSync + regex convention as
// test/client-server-twin-sync.test.js's "authoritative client consumption"
// checks, since these are real bugs in fetch/CSS wiring, not pure
// functions worth extracting just to unit-test.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");

console.log("Checking Trade Desk request timeouts (Cortex 'Analyzing…' / opportunities 'Scanning…' must never hang forever)…");

const cortexSrc = read("axiom-runner", "components", "CortexMiniPanel.jsx");
ok("CortexMiniPanel.jsx's news fetch (the one real fetch it still owns solely) uses an AbortController with a timeout", () => {
  assert.match(cortexSrc, /new AbortController\(\)/);
  assert.match(cortexSrc, /setTimeout\(\(\) => controller\.abort\(\), 15_000\)/);
  assert.match(cortexSrc, /signal:\s*controller\.signal/);
});
ok("CortexMiniPanel.jsx's decision fetch (shared via decision-store.js, 2026-09-05 perf fix) never hangs forever either — raced against a 15s timeout instead of an AbortController, since aborting the shared in-flight fetch would wrongly cancel it for other consumers (e.g. TradeDeskTab.jsx) too", () => {
  assert.match(cortexSrc, /Promise\.race\(\[\s*fetchDecision\(symbol\)/);
  assert.match(cortexSrc, /setTimeout\(\(\) => reject\(new Error\("timeout"\)\), 15_000\)/);
});
ok("CortexMiniPanel.jsx surfaces a Retry action on error, not a permanent 'Analyzing…'", () => {
  assert.match(cortexSrc, /setRetryTick/);
  assert.match(cortexSrc, />Retry</);
});

const searchPanelSrc = read("axiom-runner", "components", "CommandSearchPanel.jsx");
ok("CommandSearchPanel.jsx's opportunities fetch uses an AbortController with a timeout", () => {
  assert.match(searchPanelSrc, /new AbortController\(\)/);
  assert.match(searchPanelSrc, /setTimeout\(\(\) => controller\.abort\(\), 15_000\)/);
  assert.match(searchPanelSrc, /signal:\s*controller\.signal/);
});
ok("CommandSearchPanel.jsx surfaces a Retry action on error, not a permanent 'Scanning…'", () => {
  assert.match(searchPanelSrc, />Retry</);
});

console.log("\nChecking root layout (white-frame flash / theme sync)…");

const indexHtml = read("axiom-runner", "index.html");
ok("index.html no longer hardcodes a static body background that can mismatch the live theme", () => {
  assert.doesNotMatch(indexHtml, /body\s*\{\s*background:\s*#[0-9a-fA-F]{3,6}/);
});
ok("index.html reads the same cached settings key axiom-live.jsx persists, before first paint", () => {
  assert.match(indexHtml, /axiom_local_config_v1/);
  assert.match(indexHtml, /document\.documentElement\.style\.background/);
});
ok("html/body/#root have no default margin/padding and fill the viewport width", () => {
  assert.match(indexHtml, /html,\s*body,\s*#root\s*\{[^}]*width:\s*100%/);
  assert.match(indexHtml, /html,\s*body,\s*#root\s*\{[^}]*margin:\s*0/);
});

const axiomLiveSrc = read("axiom-runner", "axiom-live.jsx");
ok("axiom-live.jsx's theme effect keeps <html> in sync, not just <body>", () => {
  assert.match(axiomLiveSrc, /document\.documentElement\.style\.background = C\.bg/);
  assert.match(axiomLiveSrc, /document\.body\.style\.background = C\.bg/);
});
ok("themeMode's unconfigured fallback matches DEFAULT_SETTINGS' documented dark default", () => {
  assert.match(axiomLiveSrc, /themeMode: "dark", \/\/ permanent default/);
  assert.match(axiomLiveSrc, /settings\.themeMode \|\| "dark"/);
});

console.log("\nChecking Trade Desk tablet breakpoint (isTablet was computed but never used)…");
const tradeDeskSrc = read("axiom-runner", "components", "TradeDeskTab.jsx");
ok("TradeDeskTab.jsx's grid columns default to a distinct width at tablet width (2026-09-04: now real, draggable, user-resizable state — isTablet only sets the real starting default, not a fixed layout)", () => {
  assert.match(tradeDeskSrc, /isTablet\s*\?\s*160\s*:\s*220/);
  assert.match(tradeDeskSrc, /isTablet\s*\?\s*220\s*:\s*280/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TRADE-DESK-LAYOUT TEST FAILED");
else console.log("TRADE-DESK-LAYOUT TEST OK");
