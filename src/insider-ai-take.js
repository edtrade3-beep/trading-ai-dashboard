// insider-ai-take.js — "AI TAKE" on real SEC Form 4 insider PURCHASES: what
// to do, what not to do, and why. Same "real data in, judgment out" pattern
// as cot-ai-take.js / ceo-ai.js — Claude never sees or invents a
// ticker/price/value, it only receives the real transactions
// src/routes/insider.js already scraped from live SEC EDGAR filings, and
// its job is to synthesize what the pattern across them means for a
// trader, not to originate any number.
const { callAnthropicApi, MODELS } = require("./anthropic");
const { saveCoachOutput } = require("./ai-coach-store");
const { PORT } = require("./config");

const KEY = () => (process.env.ANTHROPIC_API_KEY || "").trim();
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;

function summarizePurchase(r) {
  const parts = [`${r.ticker} (${r.company || "?"})`, `${r.role || "insider"} ${r.owner ? r.owner : ""}`.trim(),
    `bought ${Number(r.shares || 0).toLocaleString()} sh @ $${r.buyPrice}`, `= $${Number(r.value || 0).toLocaleString()}`];
  if (r.chg != null) parts.push(`stock now ${r.chg >= 0 ? "+" : ""}${r.chg}% since`);
  return parts.join(", ");
}

async function buildInsiderAiTake() {
  if (!KEY()) return null;

  let results;
  try {
    const r = await fetch(`${BASE()}/api/scanner/insider`);
    const d = await r.json();
    results = Array.isArray(d?.results) ? d.results : [];
  } catch { return null; }
  if (!results.length) return null;

  // Real, largest-first — the model only ever sees the top 25 by dollar
  // value so a handful of huge purchases aren't drowned out by many tiny
  // 10b5-1-adjacent ones in the prompt.
  const top = [...results].sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 25);
  const lines = top.map(summarizePurchase);

  const SYSTEM = `You are reading real SEC Form 4 filings — open-market stock PURCHASES only (not grants, option exercises, or sales) made by company officers, directors, or 10%+ owners with their own money in the last 3 days. This is a genuinely predictive signal (insiders have real, legal information about their own company), but it has real limits: a single small purchase can be symbolic/PR, cluster buying across MULTIPLE insiders at one company is the strongest form, and a stock already up sharply since the filing has less remaining edge than one still near the insider's buy price.

Your job: turn the real purchases below into concrete guidance — what to do, what not to do, and why, grounded only in the real names/values/roles given. Never invent a ticker, name, or dollar amount not in the data. If the list is thin or mostly small/routine buys, say so honestly rather than manufacturing conviction that isn't there.

Return JSON ONLY in exactly this shape, no text outside the JSON:
{"overallTake":"2-3 sentences: the single most important read across all the purchases below","doThis":[{"action":"short imperative naming a real ticker, e.g. 'Watch NVDA for a pullback entry'","why":"1 sentence grounded in the real purchase data above"}],"avoidThis":[{"action":"short imperative, e.g. \\"Don't chase XYZ — already up 18% since the filing\\"","why":"1 sentence grounded in the real data above"}],"watchFor":"1-2 sentences: what would make this list more or less actionable going forward"}
doThis and avoidThis should each have 2-4 items, ranked by conviction, each tied to a specific real ticker from the data above — never generic advice untethered from the actual filings. Shorter lists are fine if the data doesn't support more real, specific calls.`;

  const prompt = `Real SEC Form 4 open-market insider purchases, last 3 days, largest first:\n\n${lines.join("\n")}\n\nGive your take.`;

  let take;
  try {
    const raw = await callAnthropicApi(prompt, KEY(), { model: MODELS.sonnet, maxTokens: 1200, system: SYSTEM, cache: true });
    const m = (raw || "").match(/\{[\s\S]*\}/);
    take = JSON.parse(m ? m[0] : raw);
  } catch {
    return null;
  }
  if (!take || !take.overallTake) return null;

  const built = { ...take, generatedAt: Date.now() };
  saveCoachOutput("insiderAiTake", built);
  return built;
}

module.exports = { buildInsiderAiTake };
