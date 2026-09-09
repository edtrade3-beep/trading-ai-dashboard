"use strict";
// Structural regression checks for the 2026-09-09 Light Box Assist fix
// (live user report: screenshot showing "Today: 0 trades" next to
// "Open: 117" — impossible together if "Open" meant real live exposure).
// Same fs.readFileSync + regex convention as test/trade-desk-layout.test.js,
// since this is a real filter-logic bug in a presentational component, not
// a pure function worth extracting just to unit-test.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");

console.log("Checking AutopilotPanel.jsx (Light Box Assist) — real open-position count, not a never-pruned all-time total…");

const panelSrc = read("axiom-runner", "components", "AutopilotPanel.jsx");
ok("openCount counts real ORDER_PLACED positions only, not the old dead \"EXITED\" exclusion-list filter", () => {
  assert.match(panelSrc, /const openCount = positions\.filter\(\(p\) => p\.state === "ORDER_PLACED"\)\.length/);
  assert.doesNotMatch(panelSrc, /\["EXITED", "ENTRY_MISSED"\]\.includes/);
});
ok('"EXITED" is confirmed dead as an actual written value everywhere else too — the real states this store ever writes are ENTRY_READY/ENTRY_MISSED/ORDER_PLACED/FLATTENED', () => {
  const engineSrc = read("src", "autopilot-engine.js");
  const execSrc = read("src", "lightbox-autopilot-execute.js");
  assert.doesNotMatch(engineSrc, /state:\s*"EXITED"/);
  assert.doesNotMatch(execSrc, /state:\s*"EXITED"/);
});
ok("the ENTRY_READY \"tap to preview\" list is gated to the server's own today (status.dailyStats.date), so a real stale signal from a prior day can't sit there forever", () => {
  assert.match(panelSrc, /p\.detectedAt\.slice\(0, 10\) === status\.dailyStats\.date/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("LIGHTBOX-ASSIST-PANEL TEST FAILED");
else console.log("LIGHTBOX-ASSIST-PANEL TEST OK");
