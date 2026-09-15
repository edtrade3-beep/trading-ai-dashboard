"use strict";
// agent-tools.js — real, read-only tool registry for the AI Agent tab's
// tool-calling loop (2026-09-15, "AI Trade Desk restructure" master
// prompt: "The Agent can call the trading and dealership systems
// internally... should invoke existing platform capabilities rather than
// duplicate their UI"). Every tool below reads a REAL, already-canonical
// engine/store this app already has — never a re-implementation, per
// this repo's own "no second engine" discipline.
//
// Deliberately READ-ONLY in this first pass. "Follow up with dealership
// leads" (the master prompt's own example prompt) is intentionally NOT a
// tool that sends anything — a tool capable of emailing/texting a real
// customer is a genuinely different, much higher-blast-radius capability
// (an autonomous LLM taking a real external action on a real person, not
// a paper-trading simulation) than everything else in this registry, and
// deserves its own explicit, separate approval before it exists at all.
// dealership_leads_summary below only surfaces real lead data for the
// user to act on themselves.
const { PORT } = require("./config");

const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
async function getJson(path) {
  try { const r = await fetch(`${BASE()}${path}`); return await r.json(); }
  catch (err) { return { ok: false, error: err instanceof Error ? err.message : "fetch failed" }; }
}

// Anthropic messages-API tool schemas — passed verbatim as the `tools`
// array to callAnthropicWithTools (src/anthropic.js).
const AGENT_TOOLS = [
  {
    name: "scan_market",
    description: "Scan the market and return today's real ranked trading opportunities — tiered by real opportunity stage (actionable = ready now, developing = building but not confirmed, wait = not yet timing-ready), same real ranked scan Trade Desk's own Today's Opportunities panel shows. Use this to answer 'what should I focus on today' / 'find the best opportunity' / 'what's actionable right now'.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "what_changed",
    description: "Return what materially changed since the last scan (regime shift, VIX move, a symbol's tier/score transition) — the same real diff engine Trade Desk's What Changed strip shows. Use this to answer 'what changed' / 'anything new I should know about'.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "check_platform_health",
    description: "Return real platform diagnostics: build/version, which automated execution systems are active (server autopilot, Lightbox Assist, Autopilot 2.0, legacy Tradier), Telegram/API-auth configuration, Postgres persistence status, and dynamic-universe build state. Use this to answer 'audit the platform for problems' / 'is everything running okay' / 'what's my system status'.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "dealership_leads_summary",
    description: "Return a real, read-only summary of dealership CRM leads (counts by pipeline stage, and the most recent hot/unworked leads with name/vehicle/stage — never contact details beyond what's needed to identify the lead). This tool NEVER sends an email, text, or any message — it only reports what exists so the user can decide what to do. Use this to answer 'follow up with dealership leads' / 'any hot leads I'm missing'.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

async function toolScanMarket() {
  const d = await getJson("/api/market/opportunities");
  if (!d || d.ok === false || !d.tiers) return { available: false, reason: d?.error || "Scan unavailable right now." };
  // Real tier keys (routes/market.js's own computeAllOpportunities):
  // actionable/developing/wait/extended/invalidated — the real
  // opportunityStage vocabulary, not assetDecision.verdict. Trim to what
  // a chat answer needs — the real route's own full payload carries every
  // scanned symbol's full row; a tool_result only needs enough to let
  // Claude name real candidates, not the whole scan.
  const pick = (tier) => (d.tiers[tier] || []).slice(0, 5).map((r) => ({ symbol: r.symbol, score: r.score ?? null, edgeVelocity: r.edgeVelocity?.status || null }));
  return {
    available: true,
    actionable: pick("actionable"), developing: pick("developing"), wait: pick("wait"),
    generatedAt: d.generatedAt || null,
  };
}

function toolWhatChanged() {
  try {
    const { getLastWhatChanged } = require("./what-changed-store");
    const result = getLastWhatChanged();
    if (!result) return { available: false, reason: "No what-changed snapshot yet." };
    return { available: true, ...result };
  } catch (err) {
    return { available: false, reason: err instanceof Error ? err.message : "unavailable" };
  }
}

function toolCheckPlatformHealth() {
  try {
    const { buildFullHealthSnapshot } = require("./routes/health");
    return buildFullHealthSnapshot();
  } catch (err) {
    return { available: false, reason: err instanceof Error ? err.message : "unavailable" };
  }
}

async function toolDealershipLeadsSummary() {
  const d = await getJson("/api/dealer/crm/leads");
  const leads = Array.isArray(d?.leads) ? d.leads : [];
  if (!leads.length) return { available: true, totalLeads: 0, byStage: {}, recentHot: [] };
  const byStage = {};
  for (const l of leads) { const stage = l.stage || "NEW"; byStage[stage] = (byStage[stage] || 0) + 1; }
  const recentHot = leads
    .filter((l) => l.hot)
    .slice(0, 8)
    .map((l) => ({ name: l.name || null, vehicle: l.vehicle || null, stage: l.stage || "NEW", createdAt: l.createdAt || null }));
  return { available: true, totalLeads: leads.length, byStage, recentHot };
}

async function executeAgentTool(name, _input) {
  switch (name) {
    case "scan_market": return toolScanMarket();
    case "what_changed": return toolWhatChanged();
    case "check_platform_health": return toolCheckPlatformHealth();
    case "dealership_leads_summary": return toolDealershipLeadsSummary();
    default: return { error: `Unknown tool: ${name}` };
  }
}

module.exports = { AGENT_TOOLS, executeAgentTool };
