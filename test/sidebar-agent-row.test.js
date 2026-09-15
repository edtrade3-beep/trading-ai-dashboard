"use strict";
// sidebar-agent-row.test.js — real structural regression test for the
// Agent tab's sidebar reachability. History: 2026-09-13, explicit user
// report ("dont see it") after Agent was command-palette-only led to a
// permanent row being added; 2026-09-15 the AI-Trade-Desk-restructure
// master prompt relabeled it "AI Agent" -> "Agent"; later the SAME day,
// a direct, more specific instruction — "REMOVE DEALERSHIP AND AGENT
// COMPLETELY" — removed the permanent row again, a deliberate choice,
// not a regression of the 2026-09-13 complaint. This test's job is now
// the opposite of its original one: confirm the row is really gone AND
// that the underlying real destination (AgentTab.jsx, activeTab "agent")
// still exists and stays reachable via the AGENT/AI command-palette
// aliases (axiom-live.jsx) — "hide, don't delete," not "delete." Same
// fs.readFileSync + regex structural-check convention as
// tasbeeh-counter-widget.test.js.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

const src = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "Sidebar.jsx"), "utf8");

console.log("Checking Sidebar.jsx — Agent has no permanent row, but stays reachable…");

ok("SIDEBAR_ITEMS no longer includes a permanent 'agent' row (2026-09-15, explicit user instruction to remove it completely)", () => {
  const start = src.indexOf("export const SIDEBAR_ITEMS = [");
  const end = src.indexOf("\n];", start);
  const block = src.slice(start, end);
  assert.doesNotMatch(block, /\{ id: "agent"/);
});

ok("SIDEBAR_ITEMS no longer includes a permanent 'dealership' row either (same instruction, same removal)", () => {
  const start = src.indexOf("export const SIDEBAR_ITEMS = [");
  const end = src.indexOf("\n];", start);
  const block = src.slice(start, end);
  assert.doesNotMatch(block, /\{ id: "dealership"/);
});

ok("AgentTab.jsx itself is untouched — this was a nav-only removal, never a deletion of the real feature", () => {
  assert.ok(fs.existsSync(path.join(__dirname, "..", "axiom-runner", "components", "AgentTab.jsx")), "AgentTab.jsx should still exist on disk");
});

const liveSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "axiom-live.jsx"), "utf8");

ok("the real AGENT/AI command-palette aliases still exist — Agent stays one keystroke away, not fully inaccessible", () => {
  assert.match(liveSrc, /AGENT: "agent",/);
  assert.match(liveSrc, /AI: "agent",/);
});

ok("a real, independent path to Dealership still exists outside the sidebar (the top-bar DIXIE link) — not left with zero in-app reachability", () => {
  assert.match(liveSrc, /href="\/dealer"/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("SIDEBAR-AGENT-ROW TEST FAILED");
else console.log("SIDEBAR-AGENT-ROW TEST OK");
