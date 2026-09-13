"use strict";
// agent-router.js — Router for the Astra / Claude / Market-Agent dev-task
// system (2026-09-13, "remote development architecture" build).
//
// Deterministic, keyword-based classification — the Router itself never
// calls Claude (only Astra's own plan/review calls spend Anthropic
// budget), keeping routing free and instant. Owns every write to the one
// shared project state (agent-state-store.js) on behalf of the agents it
// dispatches to: Astra plans/reviews, the Claude task queue is updated by
// scripts/agent-worker.js, Market Agents report research.
//
// This is a NEW, separate dispatcher from the existing Master Agent chat
// path in telegram-bot.js (askAgent/dispatch) — it does not replace or
// duplicate it. It's reached only through the new /astra Telegram command.
const stateStore = require("./agent-state-store");
const astra = require("./astra-agent");
const marketAgent = require("./market-agent");

const INTENTS = ["astra_plan", "market_research", "router_status"];

function classify(text) {
  const t = String(text || "").trim().toLowerCase();
  if (/^(status|router status)$/.test(t)) return "router_status";
  if (/^market\b/.test(t) || /\b(research|quote|scan)\b/.test(t)) return "market_research";
  return "astra_plan";
}

// Astra's planning call is text-only (no code execution, no file writes,
// no broker access) — safe to run synchronously the moment a task is
// enqueued. This is the one place in this system that calls out to Claude
// automatically.
async function routeToAstra(text, { source = "telegram" } = {}) {
  const title = String(text || "").slice(0, 120) || "Untitled task";
  const task = stateStore.createTask({ title, body: text, source });
  stateStore.touchAgent("router", { lastIntent: "astra_plan", lastText: title, lastTaskId: task.id });
  try {
    const plan = await astra.planTask(task);
    stateStore.updateTask(task.id, { status: "planned", plan }, "astra", "planned", plan.configured ? null : "offline fallback plan");
    stateStore.touchAgent("astra", { lastAction: "planned", lastTaskId: task.id });
    return { ok: true, task: stateStore.getTask(task.id) };
  } catch (err) {
    stateStore.updateTask(task.id, {}, "astra", "plan_failed", err.message);
    return { ok: false, error: err.message, task: stateStore.getTask(task.id) };
  }
}

async function routeToMarketAgent(text) {
  stateStore.touchAgent("router", { lastIntent: "market_research", lastText: String(text || "").slice(0, 200) });
  const snap = await marketAgent.marketSnapshot();
  stateStore.touchAgent("market", { lastAction: "snapshot" });
  return snap;
}

async function route(text, opts = {}) {
  const intent = classify(text);
  if (intent === "market_research") return { intent, result: await routeToMarketAgent(text) };
  if (intent === "router_status") {
    stateStore.touchAgent("router", { lastIntent: intent, lastText: String(text || "").slice(0, 200) });
    return { intent, result: stateStore.summary() };
  }
  return { intent: "astra_plan", result: await routeToAstra(text, opts) };
}

module.exports = { classify, route, routeToAstra, routeToMarketAgent, INTENTS };
