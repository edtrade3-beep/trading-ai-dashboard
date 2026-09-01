// mtf-explain-ai.js — AI Explanation Layer (MTF Decision System Phase 6,
// 2026-08-20): cheap (Haiku), cached system prompt, the model explains a
// fully pre-computed deterministic read, never originates a technical
// signal. The spec's own explicit rule: "AI must never invent a
// technical condition." Every number in the prompt is already real and
// already shown in the Decision Workspace UI — this just translates it
// to plain English. Extracted from routes/market.js (2026-09-01 audit
// fix #5b).
"use strict";
const { callAnthropicApi, MODELS } = require("./anthropic");

const SYSTEM = `You explain a deterministic trading-decision engine's output in plain English for a retail investor. You do NOT have opinions of your own, you do NOT invent technical conditions, and you NEVER say a stock will go up or down — every fact you use is given to you below; only explain and connect them. Translate jargon into plain language (examples: "ADX rising" -> "trend strength is starting to increase"; "RVOL 1.2x" -> "trading volume is 20% above normal"; "MTF conflict" -> "short-term strength is fighting against the larger trend"). Respond in exactly this format, under 90 words total, no preamble:
WHY: 1-2 sentences on why the state is what it is.
WHAT'S MISSING: what specifically still needs to happen (skip this line if nothing is missing).
INVALIDATION: what would break this setup.`;

async function explainMtfState(sym, b, key) {
  const g = b.gate || {};
  const gateLine = Array.isArray(g.checks) ? g.checks.map((c) => `${c.pass ? "PASS" : "FAIL"} ${c.label} (${c.detail})`).join("; ") : "not available";
  const prompt = `Symbol: ${sym}
Confirmed state: ${b.state || "unknown"}
Quality score: ${b.quality ?? "?"}/100
Setup (4H): ${b.swingState || "unknown"}
Early development (1H): ${b.earlyScore ?? "?"}/100
Entry trigger: ${b.entryAction || "unknown"}
Exit risk: ${b.exitRiskState || "unknown"}
MTF alignment: ${b.mtfScore ?? "?"}/100${b.mtfConflict ? ` — CONFLICT: ${b.mtfConflict}` : ""}
A+ Quality Gate: ${gateLine}
Sniper reason: ${b.sniperReason || "n/a"}
Waiting for: ${b.waitingFor || "n/a"}
Heat risk reason: ${b.heatReason || "n/a"}

Explain this.`;
  const explanation = await callAnthropicApi(prompt, key, { model: MODELS.haiku, maxTokens: 220, system: SYSTEM, cache: true });
  return (explanation || "").trim();
}

module.exports = { explainMtfState };
