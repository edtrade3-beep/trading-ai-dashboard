// curbline-intel-ai.js — daily 8:30 AM ET Curbline Intel scan (explicit
// user request, 2026-08-31: "I WANT LIKE IDEAS BUISNESS SIDE UPDATE 8:30
// EVERY MORNING DEEP SCAN DEEP ANALYSIS", scope narrowed via
// AskUserQuestion to "Curbline's market specifically" — competitors,
// what independent dealers actually pay for ads/leads today, pricing
// benchmarks — to validate/sharpen the Curbline concept pitch (see
// components/CurblineTab.jsx, itself a not-yet-live concept preview).
//
// Same real "one AI chokepoint, sanitize, persist" shape as
// market-wrap-ai.js/research-intel-ai.js. Unlike those two, there is no
// real internal numeric feed to ground this in — Curbline itself isn't
// a live product yet, so there's no real usage/revenue data to hand the
// AI. The real grounding here is live web search: real competitor
// products, real dealer-marketing pricing, real independent-dealer pain
// points. The AI is told explicitly never to invent a competitor,
// price, or statistic it didn't actually find via search.
"use strict";

const { callAnthropicWithSearch, MODELS } = require("./anthropic");
const { getMode } = require("./credit-saver-mode");
const { saveCoachOutput } = require("./ai-coach-store");
const {
  sanitizeSummary, sanitizeCompetitors, sanitizeSpendNote,
  sanitizePricingRecommendation, sanitizeOpportunities, sanitizeRisks, sanitizeWatchFor,
} = require("./curbline-intel-engine");

const KEY = () => (process.env.ANTHROPIC_API_KEY || "").trim();

const SYSTEM = `You are the CURBLINE INTEL layer of a real trading/dealer platform — a daily morning deep-scan of the market Curbline AI is being considered for. Curbline is a concept (not yet live) for a productized AI tool that writes ready-to-post Facebook ads for independent used-car dealers from a pasted CarFax report, plus a lead-generation posting strategy — priced around $99/month per dealership. It's currently only proven internally on one real dealership's own inventory (Dixie Motors).

Your job is REAL market research to validate and sharpen this concept before it's opened to outside dealers — NOT to hype it, NOT to invent traction that doesn't exist. Search real, current sources now for:
1. Real competing products/services independent used-car dealers actually use today for Facebook/social ad creation and lead generation (dealer-specific tools AND generic AI ad tools dealers might reach for instead).
2. Real, current pricing for those competitors, and real typical monthly marketing/ad spend for a small independent used-car dealership (not a franchise/big-box store).
3. Real gaps or complaints independent dealers have about existing marketing tools/agencies, if you can find them (forums, reviews, dealer trade publications).
4. Whether $99/month is realistically positioned against what you find — too high, too low, about right, and why.

Never invent a competitor name, price, or statistic you didn't actually find via search. If you can't find real data on something, say so honestly rather than filling in a plausible-sounding number.

Return JSON ONLY:
{"marketSummary":"2-4 real sentences on the state of this market right now, grounded in what you actually found","competitors":[{"name":"...","whatTheyDo":"...","pricingNote":"...","strength":"...","weakness":"..."}],"dealerAdSpend":{"note":"real, honest read on what a small independent dealer typically spends on marketing/ads per month, citing what you found","typicalMonthlyRange":"e.g. $500-1500/mo, or 'unclear from available sources' if genuinely not found"},"pricingRecommendation":{"note":"honest assessment of whether $99/mo is positioned well against what you found","suggestedPrice":"a real recommended price point or range, or 'no change' if $99/mo looks right"},"opportunities":[{"idea":"a real, specific opportunity or angle this research surfaced","reason":"why, grounded in what you found"}],"risks":[{"risk":"a real risk or headwind this research surfaced","reason":"why"}],"watchFor":["specific real things worth re-checking next time — a competitor's pricing change, a new entrant, etc."]}`;

async function buildCurblineIntel() {
  if (!KEY()) return null;

  const prompt = `Search now for real, current information on the independent used-car dealer marketing/ad-tools market, then return the JSON described in your instructions.`;

  let parsed = null;
  let aiError = null;
  try {
    const raw = await callAnthropicWithSearch(prompt + "\n\n" + SYSTEM, KEY(), {
      model: MODELS.sonnet, maxTokens: 8000,
      maxSearches: getMode() === "saver" ? 2 : 4,
      timeout: 280000,
      feature: "curbline-intel",
    });
    const m = (raw || "").match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : raw);
  } catch (e) {
    aiError = e.message;
    console.warn("[Curbline Intel] AI generation unavailable:", aiError);
  }
  if (!parsed) return { ok: false, aiUnavailable: true, aiError, generatedAt: Date.now() };

  const built = {
    ok: true,
    marketSummary: sanitizeSummary(parsed.marketSummary),
    competitors: sanitizeCompetitors(parsed.competitors),
    dealerAdSpend: sanitizeSpendNote(parsed.dealerAdSpend),
    pricingRecommendation: sanitizePricingRecommendation(parsed.pricingRecommendation),
    opportunities: sanitizeOpportunities(parsed.opportunities),
    risks: sanitizeRisks(parsed.risks),
    watchFor: sanitizeWatchFor(parsed.watchFor),
    generatedAt: Date.now(),
  };

  saveCoachOutput("curblineIntel", built);
  return built;
}

module.exports = { buildCurblineIntel };
