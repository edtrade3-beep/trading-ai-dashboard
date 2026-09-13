"use strict";
// astra-cost-safeguard.test.js — real regression test for the explicit
// user request "i dont want to use money for ai agent" (2026-09-13). Astra
// must stay OFF by default (zero Anthropic spend) even when a real
// ANTHROPIC_API_KEY is present — ASTRA_ENABLED is a second, independent
// gate that defaults to off. This deliberately sets a real-looking API key
// (never a real one) and does NOT set ASTRA_ENABLED, proving the default
// posture is cost-safe. A separate process from astra-agent.test.js
// (module-level config.js reads env at require time) so the two never
// interfere.
process.env.ANTHROPIC_API_KEY = "sk-ant-fake-key-for-this-test-only";
delete process.env.ASTRA_ENABLED;

const assert = require("node:assert");
const astra = require("../src/astra-agent");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

console.log("Checking Astra's cost safeguard — disabled by default even with a real API key present…");

ok("isConfigured() is false when ANTHROPIC_API_KEY is set but ASTRA_ENABLED is not — never an accidental spend", () => {
  assert.strictEqual(astra.isConfigured(), false);
});

ok("offlineReason() names the real reason (disabled, not missing key) so the UI/Telegram message isn't misleading", () => {
  const reason = astra.offlineReason();
  assert.match(reason, /disabled/i);
  assert.match(reason, /ASTRA_ENABLED/);
});

(async () => {
  try {
    const plan = await astra.planTask({ id: "t_x", title: "Anything" });
    if (plan.configured !== false) { console.error("  ✗ planTask must never call the network when ASTRA_ENABLED is off"); process.exitCode = 1; }
    else { passed++; console.log("  ✓ planTask never calls the network when ASTRA_ENABLED is off, regardless of ANTHROPIC_API_KEY"); }
  } catch (e) {
    console.error(`  ✗ planTask must not throw/attempt a network call\n    ${e.message}`);
    process.exitCode = 1;
  }
  console.log(`\n${passed} check(s) passed.`);
})();
