// earnings-ai-take.js — "AI TAKE" on the real upcoming earnings calendar:
// what to do, what not to do, and why. Same "real data in, judgment out"
// pattern as cot-ai-take.js / insider-ai-take.js — Claude never sees or
// invents a date/EPS/expected-move number, it only receives the real
// figures src/routes/market.js's /api/market/earnings-calendar already
// computed from live Yahoo data (implied expected move from 52-week
// range/IV proxy, trailing vs. forward EPS, real days-to-earnings), and
// its job is to synthesize what they mean for a trader, not to originate
// any number.
const { callAnthropicApi, MODELS } = require("./anthropic");
const { saveCoachOutput } = require("./ai-coach-store");
const { PORT } = require("./config");

const KEY = () => (process.env.ANTHROPIC_API_KEY || "").trim();
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;

function line(e) {
  const epsTrend = (e.epsEst && e.epsTTM) ? (e.epsEst >= e.epsTTM ? "estimates rising" : "estimates falling") : "no EPS trend data";
  return `${e.sym}: reports ${e.date} (${e.dte}d away, ${e.timing}), $${e.price}, mktcap $${e.mktCap}B, implied expected move ~${e.expMove}%, EPS TTM $${e.epsTTM} vs fwd est $${e.epsEst} (${epsTrend})`;
}

async function buildEarningsAiTake() {
  if (!KEY()) return null;

  let d;
  try {
    const r = await fetch(`${BASE()}/api/market/earnings-calendar`);
    d = await r.json();
  } catch { return null; }
  if (!d || !d.ok || !Array.isArray(d.events) || !d.events.length) return null;

  // Only names reporting within the next 14 days are actually actionable —
  // don't let a report 40 days out dilute the take.
  const near = d.events.filter(e => Number.isFinite(e.dte) && e.dte >= 0 && e.dte <= 14).sort((a, b) => a.dte - b.dte);
  if (!near.length) return null;
  const lines = near.map(line);

  const SYSTEM = `You are reading a real upcoming earnings calendar — real report dates, real implied expected move (derived from 52-week range/volatility, a rough proxy not a true options-market-implied move), and real trailing-vs-forward EPS estimates. A high implied expected move means the market is pricing a big reaction either way — that's a volatility/risk flag, not a directional signal. Rising forward EPS estimates vs. trailing is a real (if incomplete) proxy for improving sentiment into the print; falling estimates is the opposite. Earnings are binary, high-variance events — the honest framing is risk management (position sizing, whether to hold through the print at all) more than "buy this / short that."

Your job: turn the real calendar below into concrete guidance — what to do, what not to do, and why, grounded only in the real names/dates/numbers given. Never invent a ticker, date, or number not in the data. If nothing stands out as unusually high/low risk, say so honestly rather than manufacturing conviction.

Return JSON ONLY in exactly this shape, no text outside the JSON:
{"overallTake":"2-3 sentences: the single most important read across the next 14 days of reports","doThis":[{"action":"short imperative naming a real ticker, e.g. 'Size down or hedge XYZ into Thursday's print'","why":"1 sentence grounded in the real expected-move/EPS data above"}],"avoidThis":[{"action":"short imperative, e.g. \\"Don't hold a full position through XYZ's report blind\\"","why":"1 sentence grounded in the real data above"}],"watchFor":"1-2 sentences: which specific reports in this window matter most and why"}
doThis and avoidThis should each have 2-4 items, ranked by conviction, each tied to a specific real ticker from the data above — never generic earnings-season advice untethered from the actual numbers. Shorter lists are fine if the data doesn't support more real, specific calls.`;

  const prompt = `Real earnings calendar, next 14 days, soonest first:\n\n${lines.join("\n")}\n\nGive your take.`;

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
  saveCoachOutput("earningsAiTake", built);
  return built;
}

module.exports = { buildEarningsAiTake };
