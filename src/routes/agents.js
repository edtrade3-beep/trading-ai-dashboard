"use strict";
// routes/agents.js — HTTP surface for the Astra/Claude dev-task queue
// (2026-09-13). Exposes the exact same shared state + Router/Astra calls
// the Telegram /astra and /claude commands use — this route is a second
// front door onto the same one shared state (data/agent-state.json), not a
// second system. Added so the web dashboard's AgentTab.jsx can show/submit
// dev tasks without needing Telegram (explicit user request: "why i need
// to use telegram for this").
const { writeJson, readRequestBody } = require("../utils");
const store = require("../agent-state-store");
const { routeToAstra } = require("../agent-router");
const astra = require("../astra-agent");

async function handleAgents(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;

  if (pathname === "/api/agents/status" && req.method === "GET") {
    const s = store.summary();
    const configured = astra.isConfigured();
    return writeJson(res, 200, { ok: true, ...s, astraConfigured: configured, astraOfflineReason: configured ? null : astra.offlineReason() });
  }

  if (pathname === "/api/agents/tasks" && req.method === "GET") {
    const status = searchParams.get("status") || null;
    const limit = Math.max(1, Math.min(50, Number(searchParams.get("limit")) || 20));
    return writeJson(res, 200, { ok: true, tasks: store.listTasks({ status, limit }) });
  }

  // POST /api/agents/astra { text } — same routeToAstra() call the
  // Telegram /astra command runs; text-only (Astra's own plan call), never
  // executes code, never touches the broker.
  if (pathname === "/api/agents/astra" && req.method === "POST") {
    let body;
    try { body = JSON.parse(await readRequestBody(req)); } catch { return writeJson(res, 400, { ok: false, error: "bad json" }); }
    const text = String(body?.text || "").trim();
    if (!text) return writeJson(res, 400, { ok: false, error: "Missing text" });
    const result = await routeToAstra(text, { source: "web" });
    return writeJson(res, 200, result);
  }

  return writeJson(res, 404, { ok: false, error: "Unknown agents endpoint." });
}

module.exports = { handleAgents };
