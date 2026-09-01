// gameplan-ondemand-ai.js — AI Morning Game Plan: one batched call,
// regime + top setups → a 1-paragraph plan. On-demand HTTP version, POSTed
// client-supplied data — distinct from ai-coach.js's scheduled
// runMorningGamePlan, which gathers its own real data and sends to
// Telegram. Extracted from routes/market.js (2026-09-01 audit fix #5b).
"use strict";
const { callAnthropicApi, MODELS } = require("./anthropic");

const SYSTEM = `You are a head trader writing the team's morning game plan in ONE short paragraph (max 60 words). Be direct and actionable. Cover: today's stance (aggressive long / selective / cash) given the regime, the 1-3 best tickers to focus on, and one risk to respect. No fluff, no disclaimers.`;

async function buildGamePlan(regime, setups, key) {
  const rows = setups.length ? setups.map(s => `${s.symbol} (A+${s.aScore}, ${s.sector || "?"}, ${s.atEntry ? "at entry" : "extended"})`).join(", ") : "none qualify";
  const prompt = `Date: ${new Date().toDateString()}. Market regime ${regime}/100. Top A+ setups today: ${rows}. Write the morning game plan.`;
  const plan = await callAnthropicApi(prompt, key, { model: MODELS.haiku, maxTokens: 200, system: SYSTEM, cache: true });
  return (plan || "").trim();
}

module.exports = { buildGamePlan };
