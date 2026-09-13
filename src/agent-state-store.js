"use strict";
// agent-state-store.js — the ONE shared project state for the Astra /
// Claude / Market-Agent dev-task system (2026-09-13, "remote development
// architecture" build). Every agent in that system — the Router, Astra,
// the Claude task-queue worker (scripts/agent-worker.js), and Market
// Agents — reads and writes this single state object. Same atomic-write/
// Postgres-backed convention as every other store in this app (see
// tasbeeh-store.js's own header for why: single-user platform, one real
// global state file is enough, and atomic-write.js gives it Postgres
// persistence for free when DATABASE_URL is set).
//
// This is deliberately separate from every trading-decision store
// (decision-store.js, autopilot*-state.json, etc.) — it holds dev-task
// state only, never a trading verdict, position, or order.
const path = require("node:path");
const crypto = require("node:crypto");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STATE_PATH = path.join(ROOT, "data", "agent-state.json");

const TASK_STATUSES = ["queued", "planned", "in_progress", "review", "done", "rejected"];

function defaultState() {
  return {
    version: 1,
    tasks: [],
    agents: {
      router: { lastRunAt: null, lastIntent: null, lastText: null, lastTaskId: null },
      astra:  { lastRunAt: null, lastAction: null, lastTaskId: null },
      claude: { lastRunAt: null, lastAction: null, lastTaskId: null },
      market: { lastRunAt: null, lastAction: null },
    },
  };
}

function loadState() {
  const s = readJsonSafe(STATE_PATH, null);
  const def = defaultState();
  if (!s || typeof s !== "object" || !Array.isArray(s.tasks)) return def;
  return { ...def, ...s, agents: { ...def.agents, ...(s.agents || {}) } };
}

function saveState(state) { writeJsonAtomic(STATE_PATH, state); return state; }

function newTaskId() { return `t_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`; }

function logHistory(task, actor, event, note) {
  task.history = task.history || [];
  task.history.push({ ts: new Date().toISOString(), actor, event, note: note || null });
  if (task.history.length > 100) task.history = task.history.slice(-100);
}

function createTask({ title, body, source = "telegram" } = {}) {
  const state = loadState();
  const task = {
    id: newTaskId(),
    title: String(title || "").slice(0, 200) || "Untitled task",
    body: String(body || "").slice(0, 4000),
    status: "queued",
    source,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    plan: null,
    review: null,
    implementation: null,
    history: [],
  };
  logHistory(task, "router", "created", null);
  state.tasks.push(task);
  saveState(state);
  return task;
}

function getTask(id) {
  const state = loadState();
  return state.tasks.find((t) => t.id === id) || null;
}

// Merges `patch` into the task and always bumps updatedAt; pass actor+event
// to also append a real history entry (every state transition — planned,
// started, completed, reviewed — is auditable after the fact).
function updateTask(id, patch, actor, event, note) {
  const state = loadState();
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return null;
  Object.assign(task, patch, { updatedAt: new Date().toISOString() });
  if (actor && event) logHistory(task, actor, event, note);
  saveState(state);
  return task;
}

function listTasks({ status = null, limit = 20 } = {}) {
  const state = loadState();
  let tasks = state.tasks.slice().reverse();
  if (status) tasks = tasks.filter((t) => t.status === status);
  return tasks.slice(0, limit);
}

// The next task a human/Claude session should pick up — a planned task
// (Astra already produced a plan) takes priority over a merely-queued one.
function nextQueuedTask() {
  const state = loadState();
  return state.tasks.find((t) => t.status === "planned") || state.tasks.find((t) => t.status === "queued") || null;
}

function touchAgent(name, patch = {}) {
  const state = loadState();
  if (!state.agents[name]) state.agents[name] = {};
  Object.assign(state.agents[name], patch, { lastRunAt: new Date().toISOString() });
  saveState(state);
  return state.agents[name];
}

function getAgentStatus(name) {
  const state = loadState();
  return state.agents[name] || null;
}

function summary() {
  const state = loadState();
  const counts = {};
  for (const s of TASK_STATUSES) counts[s] = 0;
  for (const t of state.tasks) counts[t.status] = (counts[t.status] || 0) + 1;
  return { totalTasks: state.tasks.length, counts, agents: state.agents };
}

module.exports = {
  STATE_PATH, TASK_STATUSES, defaultState, loadState, saveState,
  createTask, getTask, updateTask, listTasks, nextQueuedTask,
  touchAgent, getAgentStatus, summary,
};
