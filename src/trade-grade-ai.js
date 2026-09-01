// trade-grade-ai.js — ROBINHOOD PRO: grade ONE manual trade (A+ to F)
// with specific feedback. Extracted from routes/market.js (2026-09-01
// audit fix #5b).
"use strict";
const { callAnthropicApi, MODELS } = require("./anthropic");

const SYSTEM = `You are a tough, specific trading coach grading a SINGLE completed trade. Assign one letter grade (A+, A, B, C, D, or F). Judge: entry quality, exit quality, risk management (was size/stop sane?), timing, and emotional discipline. Reward process over outcome — a small planned loss can be an A; a lucky oversized win can be a C. Be concise and concrete. Format EXACTLY:
GRADE: <letter>
ENTRY: <one line>
EXIT: <one line>
RISK: <one line>
EMOTION: <one line>
FIX: <one specific improvement>`;

async function gradeTrade(t, key) {
  const prompt = `Trade: ${t.symbol} ${t.side || "long"} · ${t.shares} sh · entry $${t.entry} → exit $${t.exit} · P&L $${Math.round(Number(t.pnl) || 0)}${t.aiScore ? ` · AI setup score ${t.aiScore}` : ""}\nTrader notes: ${t.notes || "none"}\nMistakes noted: ${t.mistakes || "none"}\nEmotional state: ${t.emotion || "not recorded"}\n\nGrade this trade.`;
  const out = await callAnthropicApi(prompt, key, { model: MODELS.haiku, maxTokens: 300, system: SYSTEM, cache: true });
  const m = (out || "").match(/GRADE:\s*([A-F][+-]?)/i);
  return { grade: m ? m[1].toUpperCase() : "?", feedback: (out || "").trim() };
}

module.exports = { gradeTrade };
