// Server-side AI features that fire on a schedule even when no browser is open:
// - Morning Game Plan (after the open)
// - AI Trade Coach (after the close)
// Both reuse existing endpoints + the Anthropic helper, then push to Telegram.
const { callAnthropicApi, MODELS } = require("./anthropic");
const { sendTelegramMessage, isConfigured } = require("./telegram");
const { PORT } = require("./config");

const KEY = () => (process.env.ANTHROPIC_API_KEY || "").trim();
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
const etDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

async function getJson(path, opts) {
  try { const r = await fetch(`${BASE()}${path}`, opts); return await r.json(); } catch { return null; }
}

// ── Morning Game Plan ──────────────────────────────────────────────────────
async function runMorningGamePlan() {
  if (!KEY() || !isConfigured()) return;
  let syms = [];
  try { syms = (require("./settings-store").loadSettings() || {}).watchlistSymbols || []; } catch {}
  syms = syms.filter(Boolean).slice(0, 40);
  const screen = syms.length ? await getJson(`/api/market/trend-screen?symbols=${encodeURIComponent(syms.join(","))}`) : null;
  const top = ((screen && screen.results) || [])
    .filter(r => !r.error)
    .sort((a, b) => (b.atBuyPoint ? 1000 : 0) + b.passCount * 100 + (b.rsRating || 0) - ((a.atBuyPoint ? 1000 : 0) + a.passCount * 100 + (a.rsRating || 0)))
    .slice(0, 8);
  const rows = top.length ? top.map(r => `${r.symbol} (${r.passCount}/8, RS ${r.rsRating}, ${r.atBuyPoint ? "at buy point" : "building"})`).join(", ") : "nothing qualifies — cash";
  const SYSTEM = `You are a head trader writing the team's morning game plan in ONE short paragraph (max 60 words). Direct and actionable: today's stance (aggressive long / selective / cash), the 1-3 best tickers to focus on, and one risk to respect. No fluff, no disclaimers.`;
  const prompt = `Date: ${new Date().toDateString()}. Strongest watchlist setups this morning: ${rows}. Write the morning game plan.`;
  const plan = await callAnthropicApi(prompt, KEY(), { model: MODELS.haiku, maxTokens: 200, system: SYSTEM, cache: true }).catch(() => "");
  if (plan) sendTelegramMessage(`🌅 *MORNING GAME PLAN*\n\n${plan.trim()}`).catch(() => {});
}

// ── AI Trade Coach ─────────────────────────────────────────────────────────
async function runTradeCoach() {
  if (!KEY() || !isConfigured()) return;
  const ct = await getJson("/api/alpaca/closed-trades");
  if (!ct || !ct.ok) return;
  const today = etDate();
  const todayT = (ct.trades || []).filter(t => etDate(new Date(t.closedAt)) === today).slice(0, 25);
  if (!todayT.length) return;
  const SYSTEM = `You are a tough-but-fair trading coach reviewing a trader's CLOSED trades for the day. Specific and honest — praise discipline, call out mistakes (cutting winners early, holding losers, oversizing, revenge trades). Max 80 words. Format:\nWENT WELL: one line.\nFIX: 1-2 specific things.\nTOMORROW: one focus.`;
  const rows = todayT.map(t => `${t.symbol} ${t.side || "long"}: $${t.entry}→$${t.exit}, P&L $${Math.round(t.pnl)}`).join("\n");
  const coach = await callAnthropicApi(`Today's closed trades:\n${rows}\n\nCoach me.`, KEY(), { model: MODELS.haiku, maxTokens: 250, system: SYSTEM, cache: true }).catch(() => "");
  if (coach) sendTelegramMessage(`🎯 *AI TRADE COACH* — ${today}\n\n${coach.trim()}`).catch(() => {});
}

module.exports = { runMorningGamePlan, runTradeCoach };
