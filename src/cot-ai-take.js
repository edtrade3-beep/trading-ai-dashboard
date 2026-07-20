// cot-ai-take.js — "AI TAKE" on the real COT (Commitments of Traders) data:
// what to do, what not to do, and why. Same "real data in, judgment out"
// pattern as ceo-ai.js — Claude never sees or invents a score/bias label,
// it only receives the ones this app's own cotBiasEngine already computed
// from real CFTC data, and its job is to synthesize what they collectively
// mean for a trader, not to originate any number.
const { callAnthropicApi, MODELS } = require("./anthropic");
const { saveCoachOutput } = require("./ai-coach-store");
const { getAllCOTBiases, isDataFresh, getLatestReportDate } = require("./cot/cotService");

const KEY = () => (process.env.ANTHROPIC_API_KEY || "").trim();

function summarizeMarket(b) {
  if (!b) return null;
  const parts = [`${b.name} (${b.category}): ${b.label}, score ${b.score > 0 ? "+" : ""}${b.score}`];
  if (b.primaryPct52 != null) parts.push(`${b.primaryPct52}th percentile of 52-week range`);
  if (b.crowdedLong) parts.push("CROWDED LONG — reversal risk");
  if (b.crowdedShort) parts.push("CROWDED SHORT — squeeze risk");
  return parts.join(", ");
}

async function buildCotAiTake() {
  if (!KEY()) return null;
  const biases = getAllCOTBiases();
  if (!biases || !Object.keys(biases).length) return null;

  const fresh = isDataFresh();
  const reportDate = getLatestReportDate();

  // Don't feed stale rows to the model as if they were current — a market
  // whose own matched CFTC row lags the rest gets excluded from the take
  // entirely rather than silently treated as equally confident.
  const freshRows = Object.values(biases).filter(b => b && !b.dataStale);
  const staleNames = Object.values(biases).filter(b => b?.dataStale).map(b => b.name);
  const lines = freshRows.map(summarizeMarket).filter(Boolean);
  if (!lines.length) return null;

  const SYSTEM = `You are a macro positioning analyst reading real CFTC Commitments of Traders (COT) data — institutional (asset-manager + leveraged-fund) net positioning across equities, rates, currencies, metals, energy, and crypto. COT is a weekly, lagging, higher-timeframe positioning read — it tells you where large speculators and institutions are ALREADY positioned, not where price is about to go tomorrow. Extreme positioning (crowded long/short, near 52-week percentile extremes) is the one genuinely predictive signal it offers: it flags reversal/squeeze risk, not direction with certainty.

Your job: turn the real per-market scores/biases below into concrete guidance — what a trader should actually DO, what they should NOT do, and why, grounded only in the real numbers given. Never invent a score, market, or percentile not in the data. If the data is thin, mixed, or mostly neutral, say so honestly rather than manufacturing a confident call — an honest "positioning is mostly balanced right now, no strong edge" is a valid and correct take.

Return JSON ONLY in exactly this shape, no text outside the JSON:
{"overallTake":"2-3 sentences: the single most important read across all markets right now","doThis":[{"action":"short imperative, e.g. 'Favor gold longs on dips'","why":"1 sentence grounded in the real score/percentile data above"}],"avoidThis":[{"action":"short imperative, e.g. \\"Don't chase the crowded-long dollar trade\\"","why":"1 sentence grounded in the real score/percentile data above"}],"watchFor":"1-2 sentences: the single condition that would change this read"}
doThis and avoidThis should each have 2-4 items, ranked by conviction, each tied to a specific real market from the data above — never generic trading advice untethered from the actual numbers. It's fine for either list to be shorter than 4 if the data doesn't support more real, specific calls.`;

  const prompt = `Real COT positioning data (report date ${reportDate}${fresh ? "" : ", may not be the most current week"}):\n\n${lines.join("\n")}${staleNames.length ? `\n\n(Excluded as stale, do not reference: ${staleNames.join(", ")})` : ""}\n\nGive your take.`;

  let take;
  try {
    const raw = await callAnthropicApi(prompt, KEY(), { model: MODELS.sonnet, maxTokens: 1200, system: SYSTEM, cache: true });
    const m = (raw || "").match(/\{[\s\S]*\}/);
    take = JSON.parse(m ? m[0] : raw);
  } catch {
    return null;
  }
  if (!take || !take.overallTake) return null;

  const built = { ...take, reportDate, generatedAt: Date.now() };
  saveCoachOutput("cotAiTake", built);
  return built;
}

module.exports = { buildCotAiTake };
