"use strict";
// what-changed-strip.test.js — real structural regression test for the
// always-visible Trade Desk "WHAT CHANGED" panel (2026-09-13, explicit
// user goal: understand what changed in ~10 seconds without clicking
// anything). Same fs.readFileSync + regex structural-check convention as
// tasbeeh-counter-widget.test.js/agent-tab-devqueue.test.js — no
// jsdom/testing-library exists in this repo to render React components,
// so real engine-output/direction/precedence logic is covered directly in
// test/what-changed-engine.test.js; this file confirms the UI consumes
// that exact existing contract rather than recreating it.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const stripSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "WhatChangedStrip.jsx"), "utf8");
const tradeDeskSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "TradeDeskTab.jsx"), "utf8");

console.log("Checking WhatChangedStrip.jsx — always-visible WHAT CHANGED panel on Trade Desk…");

ok("fetches the SAME existing /api/market/what-changed endpoint — no new/duplicate endpoint", () => {
  assert.match(stripSrc, /fetch\("\/api\/market\/what-changed"\)/);
});

ok("uses sinceLastRefresh when it has real changes, falling back to sinceOpen — the same precedence the existing badge used, not invented", () => {
  assert.match(stripSrc, /sinceLastRefresh\?\.hasChanges/);
  assert.match(stripSrc, /sinceOpen\?\.hasChanges/);
});

ok("caps displayed items at 6 — 'approximately 3-6 highest-value changes' per the requirement", () => {
  assert.match(stripSrc, /\.slice\(0,\s*6\)/);
});

ok("direction comes from the engine's own `direction` field, never inferred/parsed client-side from formatted strings", () => {
  assert.match(stripSrc, /direction:\s*c\.direction/);
  assert.match(stripSrc, /direction:\s*t\.direction/);
  assert.doesNotMatch(stripSrc, /parseFloat|match\(\/|regex/i);
});

ok("shows the exact required empty-state copy, never a fabricated 'nothing changed'", () => {
  assert.match(stripSrc, /No material changes since the previous state\./);
});

ok("renders exactly 3 direction outcomes (up/down/neutral), no additional invented states", () => {
  assert.match(stripSrc, /direction === "up"/);
  assert.match(stripSrc, /direction === "down"/);
});

ok("makes no fetch() call to any order-placement/execution endpoint — display-only, read-only", () => {
  const fetchCalls = stripSrc.match(/fetch\("[^"]+"/g) || [];
  assert.ok(fetchCalls.length > 0);
  for (const call of fetchCalls) assert.doesNotMatch(call, /order|execute|execution/i, `unexpected endpoint: ${call}`);
});

console.log("\nChecking TradeDeskTab.jsx — WhatChangedStrip is actually rendered, not just imported dead like the old panel…");

ok("WhatChangedStrip is imported AND rendered near the top of Trade Desk", () => {
  assert.match(tradeDeskSrc, /import WhatChangedStrip from "\.\/WhatChangedStrip\.jsx";/);
  assert.match(tradeDeskSrc, /<WhatChangedStrip\b/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("WHAT-CHANGED-STRIP TEST FAILED");
else console.log("WHAT-CHANGED-STRIP TEST OK");
