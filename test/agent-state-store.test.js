"use strict";
// agent-state-store.test.js — the ONE shared project state for the
// Astra/Claude/Market-Agent dev-task system (2026-09-13, "remote
// development architecture" build). Real file-backed store (same
// atomic-write.js convention as tasbeeh-store.test.js) — resets the real
// state file before/after so this never leaves stray state for a real run.
const assert = require("node:assert");
const fs = require("node:fs");
const store = require("../src/agent-state-store");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

function resetFile() { try { fs.unlinkSync(store.STATE_PATH); } catch {} }

console.log("Checking agent-state-store — the shared Astra/Claude/Market-Agent project state…");

resetFile();

ok("loadState returns real documented defaults when no state file exists yet", () => {
  const s = store.loadState();
  assert.deepStrictEqual(s, store.defaultState());
});

ok("createTask persists a real queued task with a real id", () => {
  const t = store.createTask({ title: "Add a widget", body: "Details here", source: "telegram" });
  assert.ok(t.id && t.id.startsWith("t_"));
  assert.strictEqual(t.status, "queued");
  assert.strictEqual(t.title, "Add a widget");
  assert.strictEqual(t.history.length, 1);
  const reloaded = store.getTask(t.id);
  assert.deepStrictEqual(reloaded, t);
});

ok("updateTask merges a real patch, bumps updatedAt, and logs real history", () => {
  const t = store.createTask({ title: "Task A", body: "x" });
  const before = t.updatedAt;
  const updated = store.updateTask(t.id, { status: "planned", plan: { text: "do X" } }, "astra", "planned", null);
  assert.strictEqual(updated.status, "planned");
  assert.strictEqual(updated.plan.text, "do X");
  assert.ok(updated.updatedAt >= before);
  assert.strictEqual(updated.history.length, 2);
  assert.strictEqual(updated.history[1].actor, "astra");
});

ok("updateTask on an unknown id returns null, no throw", () => {
  assert.strictEqual(store.updateTask("nope", { status: "done" }, "x", "y"), null);
});

ok("listTasks filters by real status and returns most-recent-first", () => {
  resetFile();
  const t1 = store.createTask({ title: "First" });
  const t2 = store.createTask({ title: "Second" });
  store.updateTask(t2.id, { status: "done" }, "claude", "completed");
  const all = store.listTasks();
  assert.strictEqual(all[0].id, t2.id);
  assert.strictEqual(all[1].id, t1.id);
  const doneOnly = store.listTasks({ status: "done" });
  assert.strictEqual(doneOnly.length, 1);
  assert.strictEqual(doneOnly[0].id, t2.id);
});

ok("nextQueuedTask prefers a real planned task over a merely-queued one", () => {
  resetFile();
  const queued = store.createTask({ title: "Queued only" });
  const planned = store.createTask({ title: "Planned" });
  store.updateTask(planned.id, { status: "planned" }, "astra", "planned");
  const next = store.nextQueuedTask();
  assert.strictEqual(next.id, planned.id);
  void queued;
});

ok("nextQueuedTask returns null when nothing is queued or planned", () => {
  resetFile();
  assert.strictEqual(store.nextQueuedTask(), null);
});

ok("touchAgent + getAgentStatus persist real per-agent state", () => {
  resetFile();
  store.touchAgent("astra", { lastAction: "planned", lastTaskId: "t_1" });
  const s = store.getAgentStatus("astra");
  assert.strictEqual(s.lastAction, "planned");
  assert.strictEqual(s.lastTaskId, "t_1");
  assert.ok(s.lastRunAt);
});

ok("summary reports real task counts by status across all agents", () => {
  resetFile();
  const t1 = store.createTask({ title: "A" });
  const t2 = store.createTask({ title: "B" });
  store.updateTask(t2.id, { status: "done" }, "claude", "completed");
  const s = store.summary();
  assert.strictEqual(s.totalTasks, 2);
  assert.strictEqual(s.counts.queued, 1);
  assert.strictEqual(s.counts.done, 1);
  assert.ok(s.agents.astra && s.agents.claude && s.agents.router && s.agents.market);
  void t1;
});

resetFile();

console.log(`\n${passed} check(s) passed.`);
