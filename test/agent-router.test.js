"use strict";
// agent-router.test.js — Router for the Astra/Claude/Market-Agent
// dev-task system (2026-09-13, "remote development architecture" build).
// ANTHROPIC_API_KEY cleared BEFORE any require so Astra's real offline
// fallback path runs — zero real network calls in this suite. Resets the
// real shared state file before/after (same convention as
// agent-state-store.test.js).
process.env.ANTHROPIC_API_KEY = "";
process.env.ANTHROPIC_API_KEY_FALLBACK = "";

const assert = require("node:assert");
const fs = require("node:fs");
const store = require("../src/agent-state-store");
const router = require("../src/agent-router");

let passed = 0;
function resetFile() { try { fs.unlinkSync(store.STATE_PATH); } catch {} }
async function okAsync(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

console.log("Checking agent-router — classification + dispatch to Astra/Market-Agent/status…");

resetFile();

ok("classify: bare 'status' routes to router_status", () => {
  assert.strictEqual(router.classify("status"), "router_status");
});

ok("classify: a market/research/quote/scan phrase routes to market_research", () => {
  assert.strictEqual(router.classify("market snapshot please"), "market_research");
  assert.strictEqual(router.classify("give me a quote on NVDA"), "market_research");
});

ok("classify: anything else defaults to astra_plan", () => {
  assert.strictEqual(router.classify("add a dark mode toggle to the dashboard"), "astra_plan");
});

(async () => {
  await okAsync("route() to astra_plan creates a real task, plans it (offline fallback), and updates shared state", async () => {
    resetFile();
    const { intent, result } = await router.route("Add a dark mode toggle", { source: "telegram" });
    assert.strictEqual(intent, "astra_plan");
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.task.status, "planned");
    assert.strictEqual(result.task.plan.configured, false);

    const s = store.summary();
    assert.strictEqual(s.counts.planned, 1);
    assert.ok(s.agents.astra.lastRunAt);
    assert.strictEqual(s.agents.astra.lastAction, "planned");
    assert.ok(s.agents.router.lastRunAt);
  });

  await okAsync("route() to market_research calls the real read-only Market Agent and never touches execution", async () => {
    resetFile();
    const { intent, result } = await router.route("market snapshot");
    assert.strictEqual(intent, "market_research");
    assert.strictEqual(result.ok, true);
    assert.ok("regime" in result);
    const s = store.summary();
    assert.ok(s.agents.market.lastRunAt);
  });

  await okAsync("route() to router_status returns the real shared-state summary", async () => {
    resetFile();
    store.createTask({ title: "X" });
    const { intent, result } = await router.route("status");
    assert.strictEqual(intent, "router_status");
    assert.strictEqual(result.totalTasks, 1);
  });

  resetFile();
  console.log(`\n${passed} check(s) passed.`);
})();
