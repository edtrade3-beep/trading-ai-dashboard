// x-intel-sentiment-ai.js — real, focused AI sentiment classification for
// X Intel items (X API + RSS). Brought back per explicit user request
// after the Anthropic-removal migration (2026-07) left every item
// honestly sentiment:"neutral" with no fabricated substitute. Deliberately
// narrow and cheap compared to the old full-web-search system: no web
// search tool, just a short classification call on text X Intel already
// fetched for free. Real Anthropic cost, tracked under
// feature:"x-intel-sentiment" in the existing Credit Management System
// (anthropic-usage-store.js) — a separate, much smaller line than the old
// per-item web-search cost this feature used to carry. Uses Haiku (the
// cheapest model) since this is a short classification task, not deep
// reasoning.
//
// Respects the existing Anthropic Credit Saver Mode — if the whole
// account is over its real $25/month budget, this skips the AI call and
// returns an honest neutral fallback rather than spending into an
// already-exceeded budget, same discipline every other AI feature in this
// app follows.
const { callAnthropicApi, MODELS } = require("./anthropic");
const { getMode } = require("./credit-saver-mode");

const KEY = () => (process.env.ANTHROPIC_API_KEY || "").trim();

const SYSTEM = `You classify the market sentiment of a single real post or press release for a trading intelligence feed. Respond with ONLY compact JSON, no other text: {"sentiment":"bullish"|"bearish"|"neutral","confidence":0-100}. "bullish" means the content suggests positive/upward market implications for whatever it discusses; "bearish" means negative/downward implications; "neutral" means no clear directional read, purely informational, or genuinely mixed signals. Be conservative — most routine posts (announcements, event recaps, general commentary) are neutral. Never invent facts not present in the text.`;

const FALLBACK = { sentiment: "neutral", confidence: null, analyzed: false };

// text -> { sentiment, confidence, analyzed }. `analyzed:true` only when a
// real AI call actually ran and returned a usable result — false for
// every safe-fallback path (no key, Saver Mode, parse failure, API
// error), so callers/UI can honestly disclose whether a given item's
// sentiment reflects a real AI judgment or just the safe default.
async function classifySentiment(text) {
  const clean = String(text || "").trim();
  if (!clean) return FALLBACK;
  if (!KEY()) return FALLBACK;
  if (getMode() === "saver") return FALLBACK;
  try {
    const raw = await callAnthropicApi(clean.slice(0, 800), KEY(), {
      model: MODELS.haiku, maxTokens: 60, system: SYSTEM, cache: true, timeout: 20000, feature: "x-intel-sentiment",
    });
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return FALLBACK;
    const parsed = JSON.parse(match[0]);
    const sentiment = ["bullish", "bearish", "neutral"].includes(parsed.sentiment) ? parsed.sentiment : "neutral";
    const confidence = Number.isFinite(Number(parsed.confidence)) ? Math.max(0, Math.min(100, Number(parsed.confidence))) : null;
    return { sentiment, confidence, analyzed: true };
  } catch (e) {
    console.warn("[X Intel Sentiment]", e.message);
    return FALLBACK; // real failure -> honest neutral, never fabricate a guess
  }
}

module.exports = { classifySentiment };
