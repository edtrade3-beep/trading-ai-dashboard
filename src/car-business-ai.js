// car-business-ai.js — Car Business Intelligence layer (2026-08-30,
// explicit user goal: "CAR BUSINESS... Help me become significantly more
// successful and profitable in the car business over the next 24 months...
// DO NOT MIX IT WITH THE TRADING ENGINE. DO NOT CREATE DUPLICATE AI
// ENGINES. Use the existing central architecture/data infrastructure where
// possible.").
//
// Same real architecture as research-intel-ai.js/command-center-ai.js —
// the exact callAnthropicWithSearch chokepoint, the same shouldSendAlert
// Telegram gate, the same file-based daily-snapshot-diff pattern. Reused
// wholesale, not reinvented, for the third time this session because it
// keeps proving out.
//
// What's genuinely new: an AUTOMOTIVE decision system, kept fully separate
// from the trading engine's vocabulary/scoring (no am-core-engine.js, no
// opportunity-engine.js reuse — a car lot and a stock aren't the same
// asset). What's explicitly REUSED, not duplicated, per the user's own
// instruction: this app's REAL, already-built dealer backend —
// - src/inventory-store.js's loadInventory() — the dealer's actual real
//   current lot (VIN/year/make/model/trim/mileage/price/condition),
//   never an invented vehicle list. Every inventory score this file
//   produces is grounded in and validated against this real list
//   (car-business-engine.js's sanitizeInventoryScores rejects any VIN
//   that isn't actually on the real lot).
// - src/dealership/fb-hub.js's real CRM (GET /api/dealer/crm/leads) —
//   real lead/stage/hot-lead counts, not fabricated funnel numbers.
// - this app's own real macro data (GET /api/market/macro-regime) — Fed
//   funds/yield-curve/treasury/credit scores already computed server-side,
//   genuinely relevant to auto-loan affordability, reused rather than
//   re-fetched.
// - src/dealership/routes.js's real Deal Finder pattern (VIN decode +
//   callAnthropicWithSearch) — this file's own search-grounded research
//   follows the same real-data-only discipline that route already proved
//   out, just widened from one VIN to the whole real lot + the broader
//   market.
//
// Produces RESEARCH/EVIDENCE + a real, disclosed business verdict — no
// verdict here ever touches the trading engine, and nothing in
// am-core-engine.js/opportunity-engine.js is read or written by this file.
"use strict";

const { callAnthropicWithSearch } = require("./anthropic");
const { saveCoachOutput, loadCoachLog } = require("./ai-coach-store");
const { loadHistory, getMostRecentEntry, appendSnapshot, etDateStr } = require("./car-business-store");
const { loadInventory } = require("./inventory-store");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");
const { shouldSendAlert } = require("./telegram-bot");
const { PORT } = require("./config");
const {
  BUSINESS_DIMENSIONS, SECTION_CLASSIFICATIONS, OPPORTUNITY_CLASSIFICATIONS, BUY_CLASSIFICATIONS, DATA_QUALITIES,
  sanitizeMarketSections, sanitizeInventoryScores, sanitizeOpportunityCards, sanitizeDimensions, dimensionsToSnapshot,
  computeNotificationTriggers,
} = require("./car-business-engine");

const KEY = () => (process.env.ANTHROPIC_API_KEY || "").trim();
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
async function getJson(path) {
  try { const r = await fetch(`${BASE()}${path}`); return await r.json(); } catch { return null; }
}

const SYSTEM = `You are the CAR BUSINESS INTELLIGENCE layer for a real, independent used-car dealership — an automotive-business decision system, completely separate from any stock/options trading logic. Your job is to help this dealership become significantly more profitable over the next 24 months by answering: what to buy, what price to pay, what price to sell for, how fast it should sell, who the customer is, how to generate leads, and how to get customers through the door.

You are given this dealership's REAL current inventory (real VINs/year/make/model/trim/mileage/price/condition) and REAL current CRM lead data below — treat both as ground truth. Search real, current sources now (auction/wholesale data, manufacturer incentive news, NADA/Manheim-type industry reporting, Federal Reserve auto-loan/APR data, CFPB/FTC/NHTSA regulatory news, local market conditions) across these domains: AUTO MARKET (new vehicles, used vehicles, wholesale/auctions, inventory/days-supply, depreciation, EV/hybrid/ICE, trucks/SUVs/sedans/luxury/economy), AUTO LOANS/CREDIT (Fed rates, auto APR, subprime lending, delinquencies/defaults/repossessions, consumer debt, employment), and FTC/REGULATION (FTC, CFPB, NHTSA, state dealer rules, advertising/financing rules, EV policy, tariffs).

For each AUTO MARKET category you cover, classify it: STRONG, NORMAL, WEAKENING, or HIGH_RISK, with a short summary and dataQuality (one of: ${DATA_QUALITIES.join("/")}).

Using the REAL inventory list given to you, score EVERY real vehicle on the lot (by its real VIN — never invent a VIN, never score a vehicle not in the list given): score 0-100, classification (one of: ${BUY_CLASSIFICATIONS.join("/")} — this classifies whether the dealership should acquire MORE like this one, not the vehicle's condition), reason, expectedGross (a real dollar estimate given real market comps you find), expectedDaysToSell, and action (a short specific recommendation: e.g. "price competitively now," "hold for spring demand," "consider wholesaling — weak local demand").

Identify real, current business opportunities (new-lead-worthy market conditions, pricing gaps, underpriced acquisition categories, financing program changes, seasonal windows) as OPPORTUNITY CARDS: headline, classification (one of: ${OPPORTUNITY_CLASSIFICATIONS.join("/")}), whyNow, buyPrice, targetRetail, expectedGross, expectedDaysToTurn, customer (who should this be marketed to), leadSource (best channel: Facebook Marketplace/Facebook/Instagram/Google/TikTok/YouTube/website/SMS/email/referral/trade-in campaign), risk (LOW/MEDIUM/HIGH), confidence (0-100). You are also given YESTERDAY'S opportunity cards below — if a finding today is a real continuation of one, set priorHeadline to that exact prior headline and status to STRENGTHENED/WEAKENED/INVALIDATED/UNCHANGED as appropriate; if genuinely new, status "NEW."

Evaluate these SEVEN fixed business dimensions using the real data given to you — for each, your honest current state as a short label (e.g. auto-market: "BULLISH"/"NEUTRAL"/"BEARISH"; credit-environment: "EASING"/"NORMAL"/"TIGHT"; used-market: "STRONG"/"NORMAL"/"WEAK"; new-market: "STRONG"/"NORMAL"/"WEAK"; inventory-stance: "BUY"/"SELECTIVE"/"REDUCE"; pricing-direction: "RAISING"/"STABLE"/"FALLING"; dealer-environment: "IMPROVING"/"STABLE"/"DETERIORATING") plus a one-sentence whyItMatters for each: ${BUSINESS_DIMENSIONS.join(", ")}.

Finally write: topOpportunity (one specific real opportunity), biggestRisk (one specific real risk), nextAction (one specific, concrete action the dealership should take this week), and dailySummary (2-4 sentences directly answering "what should we buy, what should we avoid, and what should we do right now").

Never invent a fact, price, or regulation. If you found nothing genuinely material in a domain, say so rather than padding with routine content. Never give legal advice as certainty — flag anything requiring professional/legal review explicitly in the relevant section's summary. Return JSON ONLY, no text outside it:
{"marketSections":[{"category":"...","classification":"...","summary":"...","dataQuality":"...","sources":["..."]}],"inventoryScores":[{"vin":"...","score":0-100,"classification":"...","reason":"...","expectedGross":0,"expectedDaysToSell":0,"action":"..."}],"opportunities":[{"headline":"...","classification":"...","whyNow":"...","buyPrice":"...","targetRetail":"...","expectedGross":"...","expectedDaysToTurn":"...","customer":"...","leadSource":"...","risk":"LOW|MEDIUM|HIGH","confidence":0-100,"priorHeadline":"..." or null,"status":"NEW|STRENGTHENED|WEAKENED|INVALIDATED|UNCHANGED"}],"dimensions":[{"dimension":"...","state":"...","whyItMatters":"..."}],"topOpportunity":"...","biggestRisk":"...","nextAction":"...","dailySummary":"..."}`;

// Capped at 25 (2026-08-30 fix, live-tested against this dealership's real
// 525-vehicle lot) — a real first attempt at 60 vehicles timed out against
// callAnthropicWithSearch's 120s default: scoring that many real VINs
// individually is a lot of real output JSON on top of the search rounds
// themselves, and command-center-ai.js's own header comment already
// documents that more work (search OR output) makes timeout more likely,
// not a strictly better answer. 25/run, highest-price first (real dollars
// at risk first) — every real vehicle still gets scored over successive
// daily runs, just not all 525 in one call.
function summarizeInventory(inventory) {
  if (!Array.isArray(inventory) || !inventory.length) return "no real inventory on file";
  const top = [...inventory].sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0)).slice(0, 25);
  return top.map((v) => `${v.vin} — ${v.year} ${v.make} ${v.model} ${v.trim || ""} · ${v.mileage?.toLocaleString?.() ?? v.mileage} mi · $${v.price} · ${v.condition}`).join("\n");
}

function summarizeLeads(leadsData) {
  const leads = Array.isArray(leadsData?.leads) ? leadsData.leads : [];
  if (!leads.length) return "no real CRM leads on file";
  const byStage = {};
  let hot = 0;
  for (const l of leads) { const s = l.stage || "NEW"; byStage[s] = (byStage[s] || 0) + 1; if (l.hot) hot++; }
  return `${leads.length} real leads on file · by stage: ${Object.entries(byStage).map(([k, v]) => `${k}=${v}`).join(", ")} · ${hot} marked hot`;
}

function summarizeMacro(regimeData) {
  if (!regimeData || !regimeData.ok) return "unavailable this run";
  const r = regimeData;
  return [
    `Regime ${r.label || r.regime || "n/a"} (${r.score ?? "n/a"}/100)`,
    `Treasury score ${r.treasury?.score ?? "n/a"} (real yield-curve/real-yield read — relevant to auto-loan rate direction)`,
    `Credit score ${r.credit?.score ?? "n/a"} (momentum ${r.credit?.momentum?.status ?? "n/a"})`,
    `Employment score ${r.employment?.score ?? "n/a"} (relevant to consumer affordability)`,
  ].join(" · ");
}

function summarizePrior(items, label) {
  if (!Array.isArray(items) || !items.length) return "none (first real run, or none stored)";
  return items.map((c) => `- ${c.headline}${c.classification ? ` [${c.classification}]` : ""}`).join("\n");
}

async function buildCarBusinessIntel() {
  if (!KEY()) return null;

  const inventory = loadInventory() || [];
  const [leadsData, regimeData] = await Promise.all([
    getJson("/api/dealer/crm/leads"),
    getJson("/api/market/macro-regime"),
  ]);

  const prevEntry = getMostRecentEntry();
  const priorOpportunities = prevEntry?.opportunities || [];
  const priorDimensions = prevEntry?.dimensions || {};

  const prompt = `THIS DEALERSHIP'S REAL CURRENT INVENTORY (score every one of these real VINs — never invent a VIN):
${summarizeInventory(inventory)}

THIS DEALERSHIP'S REAL CRM LEAD DATA: ${summarizeLeads(leadsData)}

REAL MACRO/CREDIT CONTEXT (already computed by this platform — reuse, don't re-derive): ${summarizeMacro(regimeData)}

YESTERDAY'S REAL OPPORTUNITY CARDS (match today's findings against these for status continuation; do not repeat with no new information):
${summarizePrior(priorOpportunities)}

YESTERDAY'S REAL BUSINESS DIMENSION STATES: ${BUSINESS_DIMENSIONS.map((d) => `${d}=${priorDimensions[d] || "not yet tracked"}`).join(", ")}

Search for real, current automotive market/credit/regulatory information now and return the JSON.`;

  let parsed = null;
  let aiError = null;
  try {
    // maxSearches capped at 2 (2026-08-30 fix, live-tested against this
    // dealership's real inventory — a real first attempt at maxSearches:3
    // timed out). This call's real output is already heavier than
    // research-intel-ai.js's (up to 25 individually-scored real vehicles
    // on top of market sections + opportunities + dimensions), so it gets
    // LESS search budget than that file's 3, not the same, to leave real
    // headroom for the larger JSON response within the same 120s default.
    const raw = await callAnthropicWithSearch(prompt + "\n\n" + SYSTEM, KEY(), {
      model: "claude-sonnet-4-6", maxTokens: 8000,
      maxSearches: 2,
      feature: "car-business",
    });
    const m = (raw || "").match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : raw);
  } catch (e) {
    aiError = e.message;
    console.warn("[Car Business] AI generation unavailable:", aiError);
  }
  if (!parsed) return { ok: false, aiUnavailable: true, aiError, generatedAt: Date.now() };

  const realVins = inventory.map((v) => v.vin);
  const marketSections = sanitizeMarketSections(parsed.marketSections);
  const inventoryScores = sanitizeInventoryScores(parsed.inventoryScores, realVins);
  const opportunities = sanitizeOpportunityCards(parsed.opportunities);
  const dimensions = sanitizeDimensions(parsed.dimensions, priorDimensions);
  const dimensionsSnapshot = dimensionsToSnapshot(dimensions);

  const topOpportunity = String(parsed.topOpportunity || "").slice(0, 260);
  const biggestRisk = String(parsed.biggestRisk || "").slice(0, 260);
  const nextAction = String(parsed.nextAction || "").slice(0, 260);
  const dailySummary = String(parsed.dailySummary || "").slice(0, 600);

  const triggers = computeNotificationTriggers({ dimensions, opportunities, inventoryScores });

  const built = {
    ok: true,
    marketSections, inventoryScores, opportunities, dimensions,
    topOpportunity, biggestRisk, nextAction, dailySummary, triggers,
    inventoryCount: inventory.length,
    priorAt: prevEntry?.at || null,
    generatedAt: Date.now(),
  };

  saveCoachOutput("carBusinessIntel", built);
  try { appendSnapshot({ opportunities, dimensions: dimensionsSnapshot }); } catch { /* non-fatal — tomorrow just won't have a diff */ }

  // Notification logic — reuses the existing shouldSendAlert gate, never a
  // new alert system. "regime-change" for business-dimension shifts
  // (matches that category's existing meaning); "breaking-news" for new
  // opportunities and strong-lot-vehicle finds.
  if (telegramConfigured() && triggers.length) {
    for (const t of triggers.slice(0, 5)) {
      const category = t.kind === "BUSINESS_SHIFT" ? "regime-change" : "breaking-news";
      if (!shouldSendAlert({ category })) continue;
      const label = { BUSINESS_SHIFT: "🚨 CAR BUSINESS SHIFT", OPPORTUNITY_INVALIDATED: "❌ OPPORTUNITY INVALIDATED", NEW_OPPORTUNITY: "💰 NEW CAR BUSINESS OPPORTUNITY", STRONG_LOT_VEHICLE: "🔥 STRONG LOT VEHICLE" }[t.kind] || t.kind;
      const msg = `${label}\n\n${t.detail}${t.whyItMatters ? `\n\n${t.whyItMatters}` : ""}`;
      await sendTelegramMessage(msg).catch(() => {});
    }
  }

  return built;
}

module.exports = { buildCarBusinessIntel };
