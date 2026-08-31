// money-ideas-ai.js — daily 8:45 AM ET "Money Ideas" scan for the
// Curbline tab (explicit user request, 2026-08-31: "ALSO I WANT CURBLINE
// FOR IDEAS TO MAKE MONEY AWAY FROM CARF BUISNESS AND TRADING"). Additive
// to curbline-intel-ai.js's dealer-market scan, deliberately scoped
// AWAY from it — real, current, AI-powered ways to make money from home
// that are neither car-dealership-specific (Curbline's own product) nor
// trading/investing (the rest of this app). Same real "one AI chokepoint,
// sanitize, persist" shape as every other AI feature here — no new engine.
"use strict";

const { callAnthropicWithSearch } = require("./anthropic");
const { getMode } = require("./credit-saver-mode");
const { saveCoachOutput } = require("./ai-coach-store");
const { sanitizeIdeas, sanitizeTrends, sanitizeWatchFor } = require("./money-ideas-engine");

const KEY = () => (process.env.ANTHROPIC_API_KEY || "").trim();

const SYSTEM = `You are the MONEY IDEAS layer of a real platform — a daily deep-scan for genuine, currently-viable ways to make money from home using AI in 2026. This is deliberately separate from two things this same platform already covers in depth: (1) car-dealership marketing (Curbline's own product — do NOT suggest "start a car ad business," that's already built), and (2) stock/crypto trading or investing (this platform's whole other half — do NOT suggest trading, investing, or "day trade with AI").

Search real, current sources now for real opportunities: AI-powered freelance/service work, real productized AI tools/SaaS niches with actual demand signals, real platforms currently paying for AI-assisted work, and real emerging trends (new AI capabilities, new platforms/marketplaces, real demand shifts). Be skeptical of stale, generic advice ("start a blog," "sell on Etsy") unless you found real, current evidence it's genuinely working right now — prefer specific, dated, sourced findings over vague evergreen suggestions.

Never invent a platform name, price, statistic, or success story you didn't actually find via search. If an idea is genuinely promising but you lack a real example, say so honestly rather than fabricating one.

Return JSON ONLY:
{"ideas":[{"idea":"a real, specific opportunity (not generic)","whyNow":"why this is real and timely right now, grounded in what you found","howToStart":"a real, concrete first step","realExample":"a real example/case you found via search, or an honest empty string if none found","difficulty":"LOW|MEDIUM|HIGH","timeToFirstDollar":"a real, honest estimate, e.g. '1-2 weeks' or 'varies widely'"}],"trends":[{"trend":"a real emerging trend/shift you found","note":"why it matters for someone trying to make money from home"}],"watchFor":["specific real things worth re-checking next scan"]}`;

async function buildMoneyIdeas() {
  if (!KEY()) return null;

  const prompt = `Search now for real, current AI-powered ways to make money from home in 2026 (excluding car-dealership marketing and trading/investing), then return the JSON described in your instructions.`;

  let parsed = null;
  let aiError = null;
  try {
    const raw = await callAnthropicWithSearch(prompt + "\n\n" + SYSTEM, KEY(), {
      model: "claude-sonnet-4-6", maxTokens: 8000,
      maxSearches: getMode() === "saver" ? 2 : 4,
      timeout: 280000,
      feature: "money-ideas",
    });
    const m = (raw || "").match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : raw);
  } catch (e) {
    aiError = e.message;
    console.warn("[Money Ideas] AI generation unavailable:", aiError);
  }
  if (!parsed) return { ok: false, aiUnavailable: true, aiError, generatedAt: Date.now() };

  const built = {
    ok: true,
    ideas: sanitizeIdeas(parsed.ideas),
    trends: sanitizeTrends(parsed.trends),
    watchFor: sanitizeWatchFor(parsed.watchFor),
    generatedAt: Date.now(),
  };

  saveCoachOutput("moneyIdeas", built);
  return built;
}

module.exports = { buildMoneyIdeas };
