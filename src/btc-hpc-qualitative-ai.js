// btc-hpc-qualitative-ai.js — AI-extracted qualitative context (MW/
// contract/customer/execution risk) for the BTC+HPC Deep Scan, real news
// only, no invented facts. Extracted from routes/market.js (2026-09-01
// audit fix #5b).
"use strict";
const { callAnthropicApi, MODELS } = require("./anthropic");

const SYSTEM = `You extract real facts about a Bitcoin-mining/HPC-hosting company from real news headlines given to you. You NEVER invent a number, contract, or fact not explicitly present in the headlines. For each of these 5 topics, state the real fact if the headlines mention it, or say exactly "Not disclosed in recent coverage" if they don't: BTC MINING ECONOMICS (hash rate, cost per BTC), AI/HPC REVENUE (data center hosting/AI compute revenue), CONTRACTED/ENERGIZED/PIPELINE MW (power capacity deals), CONTRACT VALUE (deal dollar figures, counterparties), CUSTOMER QUALITY & EXECUTION RISK (who the customers are, delivery/build-out risk mentioned). Respond in exactly this format, one line per topic, under 120 words total:
BTC ECONOMICS: ...
AI/HPC REVENUE: ...
MW (CONTRACTED/ENERGIZED/PIPELINE): ...
CONTRACT VALUE: ...
CUSTOMER QUALITY & EXECUTION RISK: ...`;

// Returns null on any failure (no key, no headlines, AI call failure) —
// this is a best-effort enrichment, never blocks the rest of the deep-scan
// response.
async function extractQualitativeContext(symbol, headlines, key) {
  if (!key || !headlines.length) return null;
  try {
    const raw = await callAnthropicApi(`${symbol} — real recent headlines:\n${headlines.map((h) => `- ${h}`).join("\n")}\n\nExtract.`, key, { model: MODELS.haiku, maxTokens: 260, system: SYSTEM, cache: true });
    return (raw || "").trim() || null;
  } catch {
    return null;
  }
}

module.exports = { extractQualitativeContext };
