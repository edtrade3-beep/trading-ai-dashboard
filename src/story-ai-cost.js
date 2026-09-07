"use strict";

// story-ai-cost.js — Cost Tracking (spec §"COST TRACKING" + "BUDGET
// CONTROLS"). Real Claude cost is never estimated — every agent call
// already returns its own real costUSD (story-ai-claude.js, from
// Claude's own real usage object via anthropic-pricing.js's real rate
// table), and story-ai-store.js accumulates those into each project's
// costLedger. Image/TTS costs ARE estimates (clearly labeled) since
// neither provider integration has been exercised against a real,
// billed account in this environment — using a configurable table
// rather than inventing false per-call precision, per spec's own
// explicit "do not invent precise provider cost" instruction.

const MAX_COST_PER_VIDEO_USD_DEFAULT = Number(process.env.STORY_AI_MAX_COST_USD) || 1.5;
const ESTIMATED_IMAGE_COST_USD = Number(process.env.STORY_AI_EST_IMAGE_COST_USD) || 0.04;
const ESTIMATED_TTS_COST_PER_1K_CHARS_USD = Number(process.env.STORY_AI_EST_TTS_COST_PER_1K_USD) || 0.18;
const ESTIMATED_CLAUDE_COST_PER_PROJECT_USD = 0.06; // rough pre-generation estimate only — real per-project Claude cost is tracked exactly once agents actually run

function estimateImageCostUSD(sceneCount) {
  return Math.round(Math.max(0, sceneCount) * ESTIMATED_IMAGE_COST_USD * 100) / 100;
}
function estimateTtsCostUSD(charCount) {
  return Math.round((Math.max(0, charCount) / 1000) * ESTIMATED_TTS_COST_PER_1K_CHARS_USD * 100) / 100;
}

// Pre-generation estimate shown to the user before spending anything —
// explicitly labeled ESTIMATED everywhere it's surfaced (never presented
// as the real charge).
function estimateProjectCost({ sceneCount = 16, narrationCharCount = 600, imageConfigured = false, ttsConfigured = false }) {
  const claudeEstUSD = ESTIMATED_CLAUDE_COST_PER_PROJECT_USD;
  const imageEstUSD = imageConfigured ? estimateImageCostUSD(sceneCount) : 0;
  const ttsEstUSD = ttsConfigured ? estimateTtsCostUSD(narrationCharCount) : 0;
  const totalEstUSD = Math.round((claudeEstUSD + imageEstUSD + ttsEstUSD) * 100) / 100;
  return { claudeEstUSD, imageEstUSD, ttsEstUSD, totalEstUSD };
}

function exceedsBudget(estimate, maxUSD = MAX_COST_PER_VIDEO_USD_DEFAULT) {
  return estimate.totalEstUSD > maxUSD;
}

// Real running ledger for one project — appended to as each real agent
// call / provider call completes. Never an estimate once an entry exists
// here; entries only ever record a real, already-incurred cost.
function newCostLedger() { return { entries: [], totalUSD: 0 }; }
function addCostEntry(ledger, { stage, provider, costUSD, note }) {
  const entry = { stage, provider, costUSD: Math.round((Number(costUSD) || 0) * 1_000_000) / 1_000_000, note: note || null, at: new Date().toISOString() };
  ledger.entries.push(entry);
  ledger.totalUSD = Math.round(ledger.entries.reduce((s, e) => s + e.costUSD, 0) * 1_000_000) / 1_000_000;
  return ledger;
}

module.exports = {
  MAX_COST_PER_VIDEO_USD_DEFAULT, estimateImageCostUSD, estimateTtsCostUSD,
  estimateProjectCost, exceedsBudget, newCostLedger, addCostEntry,
};
