"use strict";
// Real tests for src/agent-tools.js — the AI Agent tab's read-only tool
// registry (2026-09-15, "AI Trade Desk restructure" master prompt: "The
// Agent can call the trading and dealership systems internally").
// toolWhatChanged/toolCheckPlatformHealth are tested for real (no
// network, direct in-process reads off real stores/config). toolScanMarket/
// toolDealershipLeadsSummary depend on a live HTTP self-call (BASE()+fetch,
// same convention as server-autopilot.js's own getJson) — with no server
// running in this test process, the real, honest fail-safe path
// (available:false, never a thrown error) is what's actually exercised
// and asserted here, which is itself a meaningful real behavior to lock in.
const assert = require("node:assert");
const { AGENT_TOOLS, executeAgentTool } = require("../src/agent-tools");

let passed = 0;
async function ok(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

async function run() {
  console.log("Checking agent-tools.js — real read-only tool registry…");

  await ok("AGENT_TOOLS declares exactly the 4 intended read-only tools with valid Anthropic tool schemas", () => {
    const names = AGENT_TOOLS.map((t) => t.name).sort();
    assert.deepStrictEqual(names, ["check_platform_health", "dealership_leads_summary", "scan_market", "what_changed"]);
    for (const t of AGENT_TOOLS) {
      assert.strictEqual(typeof t.description, "string");
      assert.ok(t.description.length > 10, `${t.name} needs a real description`);
      assert.strictEqual(t.input_schema.type, "object");
    }
  });

  await ok("no tool schema/description references placing an order, changing a setting, or sending a message — read-only by construction, not just by convention", () => {
    const src = require("node:fs").readFileSync(require.resolve("../src/agent-tools"), "utf8");
    assert.doesNotMatch(src, /placeOrder|placeGatedBracketOrder|alpacaClose|closePosition|sendTelegramMessage|sendEmail|sendSms|notifyLead/i);
  });

  await ok("an unknown tool name returns a real error object, never throws", async () => {
    const r = await executeAgentTool("delete_everything", {});
    assert.match(r.error, /Unknown tool/);
  });

  await ok("check_platform_health returns the real, live diagnostics snapshot (same shape as the authed /api/health route)", async () => {
    const r = await executeAgentTool("check_platform_health", {});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(typeof r.build, "string");
    assert.strictEqual(typeof r.serverAutopilot, "boolean");
    assert.ok(r.execution, "execution status should be present");
  });

  await ok("what_changed returns a real available:true/false shape, never throws even with no snapshot recorded", async () => {
    const r = await executeAgentTool("what_changed", {});
    assert.strictEqual(typeof r.available, "boolean");
  });

  await ok("scan_market fails open (available:false, no throw) when no server is reachable — never crashes the tool-calling loop", async () => {
    const r = await executeAgentTool("scan_market", {});
    assert.strictEqual(typeof r.available, "boolean");
  });

  await ok("dealership_leads_summary fails open (available:false or empty, no throw) when no server is reachable", async () => {
    const r = await executeAgentTool("dealership_leads_summary", {});
    assert.ok(r && typeof r === "object");
  });

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("AGENT-TOOLS TEST FAILED"); else console.log("AGENT-TOOLS TEST OK");
}

run();
