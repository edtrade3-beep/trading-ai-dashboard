"use strict";
// agent-tab-devqueue.test.js — real structural regression test for the web
// AI Agent tab's new "Astra + Claude Dev Queue" sub-view (2026-09-13,
// explicit user request: "why i need to use telegram for this" — a web
// front door onto the same shared task queue the Telegram /astra and
// /claude commands use, without needing Telegram). Same fs.readFileSync +
// regex structural-check convention as tasbeeh-counter-widget.test.js —
// these are React components with no exported pure logic worth extracting
// just to unit-test.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

const agentTabSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "AgentTab.jsx"), "utf8");
const devQueueSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "AstraDevQueue.jsx"), "utf8");

console.log("Checking AgentTab.jsx + AstraDevQueue.jsx — web front door onto the Astra/Claude dev-task queue…");

ok("AgentTab.jsx defaults to the existing Copilot view — the pre-existing behavior is unchanged unless the new toggle is clicked", () => {
  assert.match(agentTabSrc, /const \[subView, setSubView\] = useState\("copilot"\);/);
});

ok("AgentTab.jsx renders AstraDevQueue only when the new toggle is selected, not unconditionally", () => {
  assert.match(agentTabSrc, /\{subView === "devqueue" && <AstraDevQueue C=\{C\} MONO=\{MONO\} SANS=\{SANS\} \/>\}/);
});

ok("AgentTab.jsx's existing Copilot markup (prompt box, RUN AGENT) is still gated behind the copilot sub-view, not deleted", () => {
  assert.match(agentTabSrc, /\{subView === "copilot" && \(/);
  assert.match(agentTabSrc, /RUN AGENT/);
  assert.match(agentTabSrc, /AGENT OUTPUT/);
});

ok("AstraDevQueue.jsx submits a task to the real shared-state route, not a new/duplicate endpoint", () => {
  assert.match(devQueueSrc, /fetch\("\/api\/agents\/astra", \{/);
  assert.match(devQueueSrc, /fetch\("\/api\/agents\/status"\)/);
  assert.match(devQueueSrc, /fetch\("\/api\/agents\/tasks\?limit=20"\)/);
});

ok("AstraDevQueue.jsx makes no fetch() call to any order-placement/execution API route — read-only + plan/review text only", () => {
  const fetchCalls = devQueueSrc.match(/fetch\("[^"]+"/g) || [];
  assert.ok(fetchCalls.length > 0, "expected at least one real fetch() call");
  for (const call of fetchCalls) assert.doesNotMatch(call, /order|execute|execution/i, `unexpected order/execution endpoint: ${call}`);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("AGENT-TAB-DEVQUEUE TEST FAILED");
else console.log("AGENT-TAB-DEVQUEUE TEST OK");
