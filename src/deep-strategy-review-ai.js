// deep-strategy-review-ai.js — DEEP STRATEGY REVIEW: top-tier Fable model
// reads your real track record and judges whether the autopilot actually
// has an edge + what to change. On-demand. Extracted from routes/market.js
// (2026-09-01 audit fix #5b).
"use strict";
const { callAnthropicApi, MODELS } = require("./anthropic");

const SYSTEM = `You are a hedge-fund risk manager doing a rigorous, skeptical review of an automated trading strategy's REAL track record. Be brutally honest — most retail strategies have no edge. Assess: (1) is there a statistically meaningful edge yet, or is the sample too small? (2) what's the biggest weakness in the numbers? (3) 2-3 concrete parameter changes to test. Do NOT be encouraging for its own sake. Max 220 words. End with a one-line verdict: KEEP / TUNE / STOP.`;

function computeStats(trades) {
  const wins = trades.filter(t => Number(t.pnl) > 0), losses = trades.filter(t => Number(t.pnl) <= 0);
  const net = trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const gp = wins.reduce((s, t) => s + Number(t.pnl), 0), gl = Math.abs(losses.reduce((s, t) => s + Number(t.pnl), 0));
  const pf = gl > 0 ? (gp / gl) : (gp > 0 ? 99 : 0);
  return { wins, gp, gl, stats: `${trades.length} trades · ${Math.round(wins.length / trades.length * 100)}% win · net $${Math.round(net)} · profit factor ${pf.toFixed(2)} · avg win $${wins.length ? Math.round(gp / wins.length) : 0} · avg loss $${losses.length ? Math.round(gl / losses.length) : 0}` };
}

async function deepReviewStrategy(trades, key) {
  const { stats } = computeStats(trades);
  const rows = trades.map(t => `${t.symbol} ${t.side || "long"}: $${t.entry}→$${t.exit}, P&L $${Math.round(t.pnl)}`).join("\n");
  const review = await callAnthropicApi(`Track record: ${stats}\n\nTrades:\n${rows}\n\nDoes this strategy have a real edge? Be honest.`, key, { model: MODELS.fable, maxTokens: 700, system: SYSTEM, cache: true, timeout: 150000 });
  return { review: (review || "").trim(), stats };
}

module.exports = { deepReviewStrategy };
