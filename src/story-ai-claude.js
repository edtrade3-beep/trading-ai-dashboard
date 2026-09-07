"use strict";

// story-ai-claude.js — the ONE place every Story AI agent calls Claude
// through (Story Agent, Verification Agent, Director Agent, Social
// Metadata Agent) — no scattered direct API calls, per spec. Built on top
// of src/anthropic.js, the trading platform's own existing central Claude
// service (already used by ai-coach.js/ceo-ai.js/advisor-ai.js/etc.) —
// this does NOT duplicate it, it adds Story AI's own model-override and
// strict-JSON-extraction behavior on top of the same real HTTP call, real
// usage logging, real fallback-key retry, and real budget-warning alerts
// every other AI feature in this app already gets for free.
const { anthropicRequest, MODELS } = require("./anthropic");
const { computeCallCost } = require("./anthropic-pricing");
const { ANTHROPIC_MODEL } = require("./story-ai-config");

// Resolves the real model id: an explicit ANTHROPIC_MODEL env override
// (e.g. "claude-sonnet-5") wins; otherwise falls back to the same named
// tier every other AI feature already uses. Additive-only — never
// mutates MODELS or affects any other caller in this codebase.
function resolveModel(tier = "sonnet") {
  return ANTHROPIC_MODEL || MODELS[tier] || MODELS.sonnet;
}

// Real, tolerant JSON extraction — Claude sometimes wraps JSON in a
// ```json fence or adds a stray sentence before/after it (same real-world
// behavior advisor-ai.js/research-intel-ai.js/command-center-ai.js already
// handle their own way). Pure function, no I/O — directly unit-testable.
function extractJson(text) {
  if (!text || typeof text !== "string") return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

// Calls Claude expecting a JSON object back, real cost included in the
// response (from Claude's own real usage object, not an estimate) — the
// per-project cost ledger (story-ai-store.js) records this exact number.
// Uses anthropicRequest directly (not the higher-level callAnthropicApi)
// specifically to keep the real `usage` object, which callAnthropicApi
// discards after extracting text.
async function callStoryAiJson({ system, prompt, apiKey, tier = "sonnet", maxTokens = 2500, feature = "story-ai", timeoutMs = 60000 }) {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set.");
  const model = resolveModel(tier);
  const payload = { model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] };
  if (system) payload.system = system;
  const resp = await anthropicRequest(payload, apiKey, timeoutMs, feature);
  const text = (resp.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const json = extractJson(text);
  if (!json) {
    // Real bug found live (2026-09-07, real user generation): a genuine
    // JSON parse failure is frequently actually TRUNCATION — Claude hit
    // maxTokens mid-object (stop_reason:"max_tokens"), so there's no real
    // closing brace to find, not genuinely malformed output. The old
    // generic message gave no way to tell truncation from a real
    // malformed-JSON case; this makes the real cause visible in the UI
    // (job.steps.<step>.reason) and in logs, so raising maxTokens for the
    // specific agent that's actually running long is an informed fix, not
    // a guess next time this happens for a different step/duration.
    const truncated = resp.stop_reason === "max_tokens";
    const err = new Error(truncated
      ? `Claude's response was cut off before finishing (hit the ${maxTokens}-token limit for this step) — the output was too long to complete, not malformed.`
      : "Claude returned no valid JSON for this step.");
    err.rawText = text.slice(0, 500);
    err.truncated = truncated;
    throw err;
  }
  const costUSD = computeCallCost({ model, usage: resp.usage });
  return { json, costUSD, model, usage: resp.usage || null };
}

module.exports = { resolveModel, extractJson, callStoryAiJson };
