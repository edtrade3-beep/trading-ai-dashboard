// trade-coach-ondemand-ai.js — AI Trade Coach: one batched call, review
// today's closed trades → honest feedback. On-demand HTTP version, POSTed
// client-supplied trades — distinct from ai-coach.js's scheduled
// runTradeCoach, which gathers its own real data and sends to Telegram.
// Extracted from routes/market.js (2026-09-01 audit fix #5b).
"use strict";
const { callAnthropicApi, MODELS } = require("./anthropic");

const SYSTEM = `You are a tough-but-fair trading coach reviewing a trader's CLOSED trades for the day. Be specific and honest — praise good discipline, call out mistakes (cutting winners early, holding losers, oversizing, revenge trades). Max 80 words. Format:
WENT WELL: one line.
FIX: 1-2 specific things.
TOMORROW: one focus.`;

async function coachTrades(trades, key) {
  const rows = trades.map(t => `${t.symbol} ${t.side || "long"}: entry $${t.entry} → exit $${t.exit}, P&L $${Math.round(t.pnl)}, held ${t.held || "?"}`).join("\n");
  const prompt = `Today's closed trades:\n${rows}\n\nCoach me.`;
  const coach = await callAnthropicApi(prompt, key, { model: MODELS.haiku, maxTokens: 250, system: SYSTEM, cache: true });
  return (coach || "").trim();
}

module.exports = { coachTrades };
