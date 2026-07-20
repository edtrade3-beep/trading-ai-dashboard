// darkpool-ai-take.js — "AI TAKE" on real dark pool block prints: what to
// do, what not to do, and why. Same "real data in, judgment out" pattern
// as cot-ai-take.js / insider-ai-take.js. Depends entirely on
// UNUSUAL_WHALES_API_KEY being configured (src/routes/market.js's
// /api/market/darkpool route) — with no key, that route already honestly
// returns zero prints, and this returns null rather than ever asking
// Claude to comment on data that doesn't exist.
const { callAnthropicApi, MODELS } = require("./anthropic");
const { saveCoachOutput } = require("./ai-coach-store");
const { PORT } = require("./config");

const KEY = () => (process.env.ANTHROPIC_API_KEY || "").trim();
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;

function fmtVal(v) {
  return v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1e3).toFixed(0)}K`;
}
function line(p) {
  return `${p.ticker}: $${Number(p.price).toFixed(2)}, ${Number(p.size).toLocaleString()} shares, ${fmtVal(p.value)}${p.time ? `, ${new Date(p.time).toLocaleTimeString()}` : ""}`;
}

async function buildDarkpoolAiTake() {
  if (!KEY()) return null;

  let d;
  try {
    const r = await fetch(`${BASE()}/api/market/darkpool`);
    d = await r.json();
  } catch { return null; }
  if (!d || !d.ok || !Array.isArray(d.prints) || !d.prints.length) return null;

  // Real, largest-first, and roll up total notional per ticker so repeated
  // prints in the same name read as one real cluster rather than noise.
  const byTicker = new Map();
  for (const p of d.prints) {
    const cur = byTicker.get(p.ticker) || { ticker: p.ticker, totalValue: 0, prints: 0, maxPrint: 0 };
    cur.totalValue += Number(p.value) || 0;
    cur.prints += 1;
    cur.maxPrint = Math.max(cur.maxPrint, Number(p.value) || 0);
    byTicker.set(p.ticker, cur);
  }
  const rollup = [...byTicker.values()].sort((a, b) => b.totalValue - a.totalValue).slice(0, 20);
  const top = [...d.prints].sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 25);

  const rollupLines = rollup.map(r => `${r.ticker}: ${r.prints} print${r.prints > 1 ? "s" : ""}, total ${fmtVal(r.totalValue)}, largest single print ${fmtVal(r.maxPrint)}`);
  const printLines = top.map(line);

  const SYSTEM = `You are reading real dark pool block prints — large trades executed off-exchange, reported after the fact. A single large print can be one institution rebalancing and mean nothing directionally; REPEATED large prints clustering in the same name, especially near the current price, are what actually suggest real institutional accumulation or distribution. Dark pool data alone never tells you the side (buy vs sell) — treat it as "where large size is moving," not a directional signal by itself, and say so honestly rather than guessing a direction the data can't support.

Your job: turn the real prints below into concrete guidance — what to do, what not to do, and why, grounded only in the real tickers/values given. Never invent a ticker or dollar amount not in the data. If the prints are scattered and don't cluster meaningfully in any name, say so honestly rather than manufacturing a pattern.

Return JSON ONLY in exactly this shape, no text outside the JSON:
{"overallTake":"2-3 sentences: the single most important read across today's prints","doThis":[{"action":"short imperative naming a real ticker, e.g. 'Watch XYZ for continuation — repeated large prints'","why":"1 sentence grounded in the real print/value data above"}],"avoidThis":[{"action":"short imperative, e.g. \\"Don't read a single XYZ print as a directional signal\\"","why":"1 sentence grounded in the real data above"}],"watchFor":"1-2 sentences: what would confirm this is real accumulation/distribution vs. noise"}
doThis and avoidThis should each have 2-4 items, ranked by conviction, each tied to a specific real ticker from the data above — never generic advice untethered from the actual prints. Shorter lists are fine if the data doesn't support more real, specific calls.`;

  const prompt = `Real dark pool block prints, today, by ticker (largest total first):\n\n${rollupLines.join("\n")}\n\nIndividual largest prints:\n${printLines.join("\n")}\n\nGive your take.`;

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
  saveCoachOutput("darkpoolAiTake", built);
  return built;
}

module.exports = { buildDarkpoolAiTake };
