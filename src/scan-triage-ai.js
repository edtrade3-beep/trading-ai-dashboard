// scan-triage-ai.js — one cheap batched call: rank the day's setups + a
// market read, far cheaper than per-stock. Extracted from routes/market.js
// (2026-09-01 audit fix #5b).
"use strict";
const { callAnthropicApi, MODELS } = require("./anthropic");

const SYSTEM = `You are a disciplined institutional swing-trader doing a quick scan triage. Be concise and honest — your job is to focus the trader on the best 1-3 names and warn off weak ones. Rules: only A+ (score ≥90) in a green market, strong sector, at the buy zone, reward:risk ≥2:1; cut losers fast, let winners run; cash is a position. Format:
MARKET: one short line on whether to be aggressive, selective, or in cash given the regime.
TOP PICKS: up to 3 tickers, one tight reason each (best first).
AVOID: any names that look weak/extended, one phrase each (or "none").
Keep the whole thing under 120 words. No preamble.`;

async function triageScan(setups, regime, key) {
  const rows = setups.map(s => `${s.symbol}: A+${s.aScore}/100 (${s.grade}), R:R ${s.rr}:1, RVOL ${s.rvol}x, RS ${s.relStrength}% vs SPY, sector ${s.sector || "?"}, ${s.atEntry ? "at entry" : "extended"}`).join("\n");
  const prompt = `Market regime ${regime}/100. Today's scanned setups:\n${rows}\n\nTriage them.`;
  const analysis = await callAnthropicApi(prompt, key, { model: MODELS.haiku, maxTokens: 350, system: SYSTEM, cache: true });
  return (analysis || "").trim();
}

module.exports = { triageScan };
