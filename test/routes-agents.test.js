"use strict";
// routes-agents.test.js — src/routes/agents.js, the HTTP front door the web
// dashboard's AstraDevQueue.jsx uses (2026-09-13, explicit user request:
// "why i need to use telegram for this"). Same shared state as the
// Telegram /astra and /claude commands (agent-state-store.js) — this is a
// second front door onto one system, not a second system. ANTHROPIC_API_KEY
// cleared BEFORE any require so Astra's real offline fallback runs — zero
// network calls in this suite. Mocks req/res as plain Node EventEmitter/
// object stand-ins (readRequestBody uses req.on("data"/"end"/"error")).
process.env.ANTHROPIC_API_KEY = "";
process.env.ANTHROPIC_API_KEY_FALLBACK = "";

const assert = require("node:assert");
const fs = require("node:fs");
const { EventEmitter } = require("node:events");
const store = require("../src/agent-state-store");
const { handleAgents } = require("../src/routes/agents");

let passed = 0;
function resetFile() { try { fs.unlinkSync(store.STATE_PATH); } catch {} }
async function okAsync(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

function mockReq(method, body) {
  const req = new EventEmitter();
  req.method = method;
  req.headers = {};
  setImmediate(() => {
    if (body !== undefined) req.emit("data", Buffer.from(JSON.stringify(body)));
    req.emit("end");
  });
  return req;
}
function mockRes() {
  const res = { statusCode: null, body: null };
  res.writeHead = (code) => { res.statusCode = code; return res; };
  res.end = (b) => { res.body = b; return res; };
  return res;
}
function json(res) { return JSON.parse(res.body); }

console.log("Checking routes/agents.js — the web front door onto the shared Astra/Claude dev-task queue…");

resetFile();

(async () => {
  await okAsync("GET /api/agents/status returns the real shared-state summary + Astra config flag", async () => {
    const res = mockRes();
    await handleAgents(mockReq("GET"), res, new URL("http://x/api/agents/status"));
    const j = json(res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(j.ok, true);
    assert.strictEqual(j.astraConfigured, false);
    assert.strictEqual(j.totalTasks, 0);
  });

  await okAsync("POST /api/agents/astra creates + plans a real task via the real Router, same as /astra on Telegram", async () => {
    resetFile();
    const res = mockRes();
    await handleAgents(mockReq("POST", { text: "Add a settings toggle" }), res, new URL("http://x/api/agents/astra"));
    const j = json(res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(j.ok, true);
    assert.strictEqual(j.task.status, "planned");
    assert.strictEqual(j.task.source, "web");
  });

  await okAsync("POST /api/agents/astra with no text is a real 400, not a silently-created empty task", async () => {
    resetFile();
    const res = mockRes();
    await handleAgents(mockReq("POST", { text: "" }), res, new URL("http://x/api/agents/astra"));
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(store.summary().totalTasks, 0);
  });

  await okAsync("GET /api/agents/tasks lists real tasks, newest first, respecting ?status filter", async () => {
    resetFile();
    store.createTask({ title: "A" });
    const t2 = store.createTask({ title: "B" });
    store.updateTask(t2.id, { status: "done" }, "claude", "completed");
    const res = mockRes();
    await handleAgents(mockReq("GET"), res, new URL("http://x/api/agents/tasks?status=done"));
    const j = json(res);
    assert.strictEqual(j.tasks.length, 1);
    assert.strictEqual(j.tasks[0].id, t2.id);
  });

  await okAsync("an unknown /api/agents/* path is a real 404, not a hung response", async () => {
    const res = mockRes();
    await handleAgents(mockReq("GET"), res, new URL("http://x/api/agents/nope"));
    assert.strictEqual(res.statusCode, 404);
  });

  resetFile();
  console.log(`\n${passed} check(s) passed.`);
})();
