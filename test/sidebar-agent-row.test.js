"use strict";
// sidebar-agent-row.test.js — real structural regression test confirming
// the "AI Agent" tab has a permanent, visible sidebar row (2026-09-13,
// explicit user report: after adding the Astra/Claude Dev Queue toggle
// inside AgentTab.jsx, the tab itself turned out to be command-palette-only
// since before the 2026-09-05 nav consolidation — "dont see it"). Same
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

console.log("Checking Sidebar.jsx — the AI Agent tab has a real, permanent sidebar row…");

ok("SIDEBAR_ITEMS includes a real 'agent' entry pointing at activeTab \"agent\"", () => {
  const start = src.indexOf("export const SIDEBAR_ITEMS = [");
  const end = src.indexOf("\n];", start);
  const block = src.slice(start, end);
  assert.match(block, /\{ id: "agent", label: "AI Agent", icon: "[^"]+", tab: "agent" \}/);
});

ok("no other SIDEBAR_ITEMS row shares the same icon as the new agent row (real, not accidentally duplicated)", () => {
  const start = src.indexOf("export const SIDEBAR_ITEMS = [");
  const end = src.indexOf("\n];", start);
  const block = src.slice(start, end);
  const iconMatch = block.match(/\{ id: "agent"[^}]*icon: "([^"]+)"/);
  assert.ok(iconMatch, "agent row not found");
  const icon = iconMatch[1];
  const allIcons = [...block.matchAll(/icon: "([^"]+)"/g)].map((m) => m[1]);
  const count = allIcons.filter((i) => i === icon).length;
  assert.strictEqual(count, 1, `icon "${icon}" is used ${count} times, expected 1`);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("SIDEBAR-AGENT-ROW TEST FAILED");
else console.log("SIDEBAR-AGENT-ROW TEST OK");
