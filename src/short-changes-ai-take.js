// short-changes-ai-take.js — "AI TAKE" on real weekly short-interest change
// data: what to do, what not to do, and why. Same "real data in, judgment
// out" pattern as cot-ai-take.js / insider-ai-take.js — Claude never sees
// or invents a symbol/percentage, it only receives the real short-float /
// week-over-week-change numbers src/routes/market.js's short-changes route
// already computed from live Yahoo short-interest data.
const { callAnthropicApi, MODELS } = require("./anthropic");
const { saveCoachOutput } = require("./ai-coach-store");
const { PORT } = require("./config");

const KEY = () => (process.env.ANTHROPIC_API_KEY || "").trim();
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;

function line(s) {
  return `${s.sym}: $${s.price}, short float ${s.shortFloat}%, ${s.daysToCover} days to cover, week chg ${s.shortChange >= 0 ? "+" : ""}${s.shortChange}%`;
}

async function buildShortChangesAiTake() {
  if (!KEY()) throw new Error("ANTHROPIC_API_KEY not set");

  let d;
  try {
    const r = await fetch(`${BASE()}/api/market/short-changes`);
    d = await r.json();
  } catch { return null; }
  if (!d || !d.ok) return null;
  const increasing = d.increasing || [], covering = d.covering || [], highShort = d.highShort || [];
  if (!increasing.length && !covering.length && !highShort.length) return null;

  const sections = [
    increasing.length ? `SHORTS INCREASING (bears adding week-over-week):\n${increasing.map(line).join("\n")}` : null,
    covering.length ? `SHORT COVERING (bears reducing week-over-week):\n${covering.map(line).join("\n")}` : null,
    highShort.length ? `HIGHEST SHORT FLOAT (squeeze candidates, may overlap the two lists above):\n${highShort.map(line).join("\n")}` : null,
  ].filter(Boolean);

  const SYSTEM = `You are reading real weekly short-interest change data — short float %, days-to-cover, and week-over-week change in shares short, for a fixed universe of liquid/momentum names. This data flags TWO different real setups: a high, RISING short float with low days-to-cover is squeeze fuel (bears may be forced to cover into a rally); a high short float that's already COVERING can mean the squeeze already happened or the thesis is fading. Short interest alone says nothing about direction — it's a fuel gauge for how violent a move could be if one starts, not a trigger by itself.

Your job: turn the real numbers below into concrete guidance — what to do, what not to do, and why, grounded only in the real tickers/percentages given. Never invent a symbol or number not in the data. If nothing stands out as a genuine squeeze setup, say so honestly rather than manufacturing conviction.

Return JSON ONLY in exactly this shape, no text outside the JSON:
{"overallTake":"2-3 sentences: the single most important read across this data","doThis":[{"action":"short imperative naming a real ticker, e.g. 'Watch XYZ for a squeeze on any catalyst'","why":"1 sentence grounded in the real short-float/days-to-cover/change data above"}],"avoidThis":[{"action":"short imperative, e.g. \\"Don't short XYZ into a rising, already-crowded short\\"","why":"1 sentence grounded in the real data above"}],"watchFor":"1-2 sentences: the single condition that would confirm or kill the top setup"}
doThis and avoidThis should each have 2-4 items, ranked by conviction, each tied to a specific real ticker from the data above — never generic advice untethered from the actual numbers. Shorter lists are fine if the data doesn't support more real, specific calls.`;

  const prompt = `Real weekly short-interest data:\n\n${sections.join("\n\n")}\n\nGive your take.`;

  let take;
  try {
    const raw = await callAnthropicApi(prompt, KEY(), { model: MODELS.sonnet, maxTokens: 1200, system: SYSTEM, cache: true });
    const m = (raw || "").match(/\{[\s\S]*\}/);
    take = JSON.parse(m ? m[0] : raw);
  } catch (e) {
    throw new Error(`AI call failed: ${e.message}`);
  }
  if (!take || !take.overallTake) throw new Error("AI returned an incomplete response");

  const built = { ...take, generatedAt: Date.now() };
  saveCoachOutput("shortChangesAiTake", built);
  return built;
}

module.exports = { buildShortChangesAiTake };
