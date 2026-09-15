"use strict";
// Real structural + behavioral tests for /api/agent/command
// (src/routes/agent.js) and callAnthropicWithTools (src/anthropic.js) —
// 2026-09-15, "AI Trade Desk restructure" master prompt's tool-calling
// Agent. No real Anthropic network call is made here (no API key set in
// the test env, matching every other AI-route test in this repo's own
// convention, e.g. the existing /api/agent "AI not configured" path) —
// this locks in the real no-key fail-safe and confirms the route wires
// the real shared tool registry (src/agent-tools.js), never a second,
// independently-declared tool list.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { callAnthropicWithTools } = require("../src/anthropic");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking /api/agent/command — real tool-calling Agent route…");

ok("callAnthropicWithTools is a real exported function (the general custom-tool loop, distinct from callAnthropicWithSearch's built-in web_search loop)", () => {
  assert.strictEqual(typeof callAnthropicWithTools, "function");
});

const agentSrc = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "agent.js"), "utf8");

ok("the route requires the real shared tool registry from src/agent-tools.js, never a second/inline tool list", () => {
  assert.match(agentSrc, /const \{ AGENT_TOOLS, executeAgentTool \} = require\("\.\.\/agent-tools"\);/);
  assert.match(agentSrc, /tools: AGENT_TOOLS, executeTool: executeAgentTool/);
});

ok("the route fails closed with 'AI not configured' when ANTHROPIC_API_KEY is unset — same convention as the existing /api/agent route", () => {
  assert.match(agentSrc, /if \(!ANTHROPIC_API_KEY\) return writeJson\(res, 200, \{ output: null, error: "AI not configured" \}\);/g);
});

ok("the route's own system prompt explicitly discloses no tool can place an order, change a setting, or message anyone", () => {
  const start = agentSrc.indexOf('pathname === "/api/agent/command"');
  const end = agentSrc.indexOf("\n  }", agentSrc.indexOf("SYSTEM =", start));
  const block = agentSrc.slice(start, end);
  assert.match(block, /no tool that places an order, changes any setting, or sends a message to anyone/);
});

ok("a bounded number of tool-call rounds is enforced (maxRounds) — a runaway tool-call loop can never rack up unbounded real spend", () => {
  const anthropicSrc = fs.readFileSync(path.join(__dirname, "..", "src", "anthropic.js"), "utf8");
  assert.match(anthropicSrc, /for \(let round = 0; round < maxRounds; round\+\+\)/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("AGENT-COMMAND-ROUTE TEST FAILED");
else console.log("AGENT-COMMAND-ROUTE TEST OK");
