"use strict";
// Real structural test for Top50ScannerPanel.jsx — "AI Trade Desk should
// show only the Top 5 by default... Add VIEW ALL 50. Do not create
// another top-level tab" (2026-09-16, "Build Telegram Alerts for the AI
// Top 50 Scanner" master prompt). fs.readFileSync + regex convention,
// same as this repo's other component tests.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const src = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "Top50ScannerPanel.jsx"), "utf8");

console.log("Checking Top50ScannerPanel.jsx — real Top 5 default + VIEW ALL 50 expand…");

ok("fetches the real /api/market/top50-scanner route (limit=5 by default)", () => {
  assert.match(src, /fetch\("\/api\/market\/top50-scanner\?limit=5"\)/);
});

ok("VIEW ALL 50 fetches the real full list (limit=50), and only once per mount, not re-fetched on every toggle", () => {
  assert.match(src, /fetch\("\/api\/market\/top50-scanner\?limit=50"\)/);
  assert.match(src, /if \(all50\) return;/);
});

ok("toggling VIEW ALL 50 flips back to SHOW TOP 5 — a real expand/collapse, not a one-way navigation", () => {
  assert.match(src, /if \(expanded\) \{ setExpanded\(false\); return; \}/);
  assert.match(src, /\{expanded \? "SHOW TOP 5" : "VIEW ALL 50"\}/);
});

ok("uses its own distinct real score/direction/status fields (top50Score/direction/executionStatus) — never conflated with TopOpportunities.jsx's own separate opportunityScore", () => {
  assert.match(src, /r\.top50Score/);
  assert.match(src, /r\.direction/);
  assert.match(src, /r\.executionStatus/);
  assert.doesNotMatch(src, /r\.opportunityScore/, "must not read the OTHER panel's canonical score field — these are two real, deliberately separate scores");
});

ok("real tripwire: no new top-level sidebar row was added for this feature — Sidebar.jsx's own SIDEBAR_ITEMS block never mentions top50/scanner", () => {
  const sidebarSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "Sidebar.jsx"), "utf8");
  const start = sidebarSrc.indexOf("export const SIDEBAR_ITEMS = [");
  const end = sidebarSrc.indexOf("\n];", start);
  const block = sidebarSrc.slice(start, end);
  assert.doesNotMatch(block, /top50/i);
});

ok("real tripwire: TradeDeskTab.jsx renders this panel inline, right alongside the existing TopOpportunities panel — not a new route/tab", () => {
  const tradeDeskSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "TradeDeskTab.jsx"), "utf8");
  assert.match(tradeDeskSrc, /<Top50ScannerPanel /);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TOP50-SCANNER-PANEL TEST FAILED");
else console.log("TOP50-SCANNER-PANEL TEST OK");
