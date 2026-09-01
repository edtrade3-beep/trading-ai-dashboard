// ai-setup-review-ai.js — AI second-opinion on a Green Light setup, cheap
// (Haiku) + cached trader persona. Extracted from routes/market.js
// (2026-09-01 audit fix #5b: "13 inline AI call sites hardcoded directly
// in routes/market.js"), matching the one-file-per-feature convention
// every other real AI feature in this app already follows.
"use strict";
const { callAnthropicApi, MODELS } = require("./anthropic");

const SYSTEM = `You are a disciplined institutional swing-trader reviewing a long setup from a rules-based scanner. Be concise and honest — your job is to critique, not cheerlead. Rules you trade by: trade only A+ setups (score ≥90) in a green market regime, in strong sectors, at the buy zone (not extended); risk 1% per trade; reward:risk must be ≥2:1; cut losers fast, let winners run; when in doubt, stay in cash. Respond in 3 short parts:
VERDICT: BUY / WAIT / PASS (one word)
WHY: one tight sentence.
RISKS: 1-2 specific risks to watch.
No preamble, no disclaimers, under 70 words total.`;

async function reviewSetup(sym, s, key) {
  const prompt = `Setup for ${sym}:\n- Price $${s.px} (${s.chg >= 0 ? "+" : ""}${s.chg}% today)\n- A+ Score ${s.aScore}/100 (grade ${s.grade})\n- Market regime ${s.marketScore}/100 ${s.marketPass ? "(green)" : "(not green)"}\n- Sector ${s.sector || "?"} ${s.strongSector ? "(strong)" : "(weak/unknown)"}\n- Relative strength vs SPY: ${s.relStrength}%\n- RVOL ${s.rvol}x\n- Entry $${s.bestEntry}, stop $${s.stop}, R:R ${s.rr}:1\n- At buy zone: ${s.atEntry ? "yes" : "no (extended/pullback)"}\nGive your review.`;
  const review = await callAnthropicApi(prompt, key, { model: MODELS.haiku, maxTokens: 220, system: SYSTEM, cache: true });
  return (review || "").trim();
}

module.exports = { reviewSetup };
