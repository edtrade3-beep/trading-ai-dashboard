"use strict";
// astra-agent.test.js — Astra (lead architect/auditor/planner/QA reviewer,
// 2026-09-13 "remote development architecture" build). Forces the real
// offline-fallback path (ANTHROPIC_API_KEY cleared BEFORE any require, so
// config.js's module-level read picks up the empty value) — this test
// suite makes zero real network calls, same discipline as
// emergency-stop.test.js's own env-clearing header.
process.env.ANTHROPIC_API_KEY = "";
process.env.ANTHROPIC_API_KEY_FALLBACK = "";

const assert = require("node:assert");
const astra = require("../src/astra-agent");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}
async function okAsync(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

console.log("Checking astra-agent — offline fallback path (no ANTHROPIC_API_KEY, zero network calls)…");

ok("isConfigured is false with no ANTHROPIC_API_KEY", () => {
  assert.strictEqual(astra.isConfigured(), false);
});

(async () => {
  await okAsync("planTask returns a real offline fallback plan, never throws / never calls the network", async () => {
    const task = { id: "t_1", title: "Add a button", body: "Add a button to the UI" };
    const plan = await astra.planTask(task);
    assert.strictEqual(plan.ok, true);
    assert.strictEqual(plan.configured, false);
    assert.ok(plan.text.includes("offline fallback"));
    assert.ok(plan.text.includes("Add a button"));
  });

  await okAsync("reviewTask returns a real offline fallback review, never throws / never calls the network", async () => {
    const task = {
      id: "t_2", title: "Add a button", body: "Add a button",
      plan: { text: "1. add it" },
      implementation: { summary: "Added the button", filesChanged: ["a.jsx"] },
    };
    const review = await astra.reviewTask(task);
    assert.strictEqual(review.ok, true);
    assert.strictEqual(review.configured, false);
    assert.ok(review.text.includes("UNREVIEWED"));
  });

  console.log(`\n${passed} check(s) passed.`);
})();
