"use strict";
// astra-agent.js — Astra: lead architect, auditor, planner, and QA
// reviewer for the Astra/Claude dev-task system (2026-09-13, "remote
// development architecture" build).
//
// This is a SEPARATE Anthropic consumer from the Master Agent's chat layer
// (telegram-bot.js's askAgent()/ai-copilot path), which stays exactly as
// it was — deterministic-first, zero incremental Claude calls for its
// existing triggers — per the explicit 2026-09-11 request ("I dont want to
// use anthropic api... for master agent", see docs/PLATFORM_ARCHITECTURE.md
// section 3). Astra is invoked only through new, explicit /astra commands,
// never from the existing Master Agent dispatch path.
//
// Astra only ever produces TEXT — a plan or a review. It never edits
// files, runs shell commands, places/cancels orders, or touches any
// execution-authority path. Same honest NOT_CONFIGURED discipline as every
// other AI feature in this app (see src/routes/agent.js) when no
// ANTHROPIC_API_KEY is set — an offline fallback, never a fabricated plan.
const { callAnthropicApi, MODELS } = require("./anthropic");
const { ANTHROPIC_API_KEY, ASTRA_ENABLED } = require("./config");

const SYSTEM_PROMPT = `You are Astra, the lead architect, auditor, planner, and QA reviewer for the "AM Trading Platform" codebase (a Node.js/CommonJS backend + React frontend trading dashboard, single-user, real brokerage data). Claude Code is the implementer — a separate coding worker that reads your plan and writes the actual code; you never write code yourself.

Your job, depending on what you're asked:
- PLAN a task: a short, concrete implementation plan — likely files touched, the approach, risks, and an explicit QA checklist. No code.
- REVIEW completed work: audit the implementation summary against the original task and your plan. Flag correctness bugs, scope creep, missing tests, and anything that could put real money, real user data, or real trade execution at risk. Be specific and concise — a few sentences or a short bulleted list, not an essay.

Hard rules: never fabricate data or test results, never claim something was verified if you don't know it was, and always call out explicitly when a task touches real trade execution or real money — those need extra scrutiny before anyone merges or deploys them.`;

// Two independent gates, both must pass: a real key AND explicit opt-in.
// ASTRA_ENABLED defaults OFF — real cost, never spent by accident.
function isConfigured() { return Boolean(ANTHROPIC_API_KEY) && ASTRA_ENABLED; }

function offlineReason() {
  if (!ASTRA_ENABLED) return "Astra is disabled (ASTRA_ENABLED is not set) — no cost, by design. Set ASTRA_ENABLED=true to turn it on.";
  return "ANTHROPIC_API_KEY not set.";
}

function fallbackPlan(task) {
  return [
    `PLAN (offline fallback — ${offlineReason()})`,
    `Task: ${task.title}`,
    ``,
    `This is a placeholder plan only, no Claude call was made:`,
    `1. Read the task description and identify the files it touches.`,
    `2. Make the smallest change that satisfies it.`,
    `3. Add or adjust a test if the change is behavioral.`,
    `4. Re-run this task through Astra's review once it's enabled.`,
  ].join("\n");
}

function fallbackReview(task) {
  return `REVIEW (offline fallback — ${offlineReason()})\nAstra can't audit "${task.title}" right now. The implementation is recorded but UNREVIEWED — treat it as such until a real Astra pass runs.`;
}

async function planTask(task) {
  if (!isConfigured()) return { ok: true, configured: false, text: fallbackPlan(task), generatedAt: new Date().toISOString() };
  const prompt = `Plan this task:\n\nTITLE: ${task.title}\n\nDETAILS: ${task.body || "(no further details given)"}`;
  const text = await callAnthropicApi(prompt, ANTHROPIC_API_KEY, {
    model: MODELS.sonnet, maxTokens: 1200, system: SYSTEM_PROMPT, cache: true, feature: "astra-plan",
  });
  return { ok: true, configured: true, text, generatedAt: new Date().toISOString() };
}

async function reviewTask(task) {
  if (!isConfigured()) return { ok: true, configured: false, text: fallbackReview(task), generatedAt: new Date().toISOString() };
  const impl = task.implementation;
  const prompt = [
    `Review this completed task:`,
    ``,
    `TITLE: ${task.title}`,
    `ORIGINAL REQUEST: ${task.body || "(none)"}`,
    task.plan?.text ? `\nASTRA'S ORIGINAL PLAN:\n${task.plan.text}` : "",
    `\nIMPLEMENTATION SUMMARY (from Claude):\n${impl?.summary || "(no summary given)"}`,
    impl?.filesChanged?.length ? `\nFILES CHANGED: ${impl.filesChanged.join(", ")}` : "",
  ].filter(Boolean).join("\n");
  const text = await callAnthropicApi(prompt, ANTHROPIC_API_KEY, {
    model: MODELS.sonnet, maxTokens: 1200, system: SYSTEM_PROMPT, cache: true, feature: "astra-review",
  });
  return { ok: true, configured: true, text, generatedAt: new Date().toISOString() };
}

module.exports = { isConfigured, offlineReason, planTask, reviewTask, SYSTEM_PROMPT };
