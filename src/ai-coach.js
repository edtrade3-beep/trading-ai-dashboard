// Server-side AI features that fire on a schedule even when no browser is open:
// - Morning Game Plan (after the open)
// - AI Trade Coach (after the close)
// Both reuse existing endpoints + the Anthropic helper, then push to Telegram.
const { callAnthropicApi, MODELS } = require("./anthropic");
const { sendTelegramMessage, isConfigured } = require("./telegram");
const { PORT } = require("./config");
const { tierStatsLine } = require("./autopilot-journal");
const { patternSummaryLine } = require("./journal-analytics");
// Shared "informational" daily budget — a safety net against a scheduling
// bug flooding Telegram, not a throttle on normal once-a-day operation. See
// the comment above shouldSendAlert() in telegram-bot.js for why these
// scheduled reports don't use isQuietHours()/checkDailyBudget() (those are
// tuned for reactive scan alerts, not deliberately-scheduled daily reports).
const { shouldSendAlert } = require("./telegram-bot");

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
  if (plan && shouldSendAlert({ category: "ai-coach" })) sendTelegramMessage(`🌅 *MORNING GAME PLAN*\n\n${plan.trim()}`).catch(() => {});
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
  if (coach && shouldSendAlert({ category: "ai-coach" })) sendTelegramMessage(`🎯 *AI TRADE COACH* — ${today}\n\n${coach.trim()}`).catch(() => {});
}

// ── Weekly AI Review — Friday after close: name the #1 recurring mistake. ────
async function runWeeklyReview() {
  if (!KEY() || !isConfigured()) return;
  const ct = await getJson("/api/alpaca/closed-trades");
  if (!ct || !ct.ok) return;
  const weekAgo = Date.now() - 7 * 86400000;
  const week = (ct.trades || []).filter(t => new Date(t.closedAt).getTime() >= weekAgo).slice(0, 60);
  if (!week.length) return;
  const wins = week.filter(t => Number(t.pnl) > 0);
  const losses = week.filter(t => Number(t.pnl) <= 0);
  const net = week.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const winRate = Math.round((wins.length / week.length) * 100);
  const avgWin = wins.length ? wins.reduce((s, t) => s + Number(t.pnl), 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + Number(t.pnl), 0) / losses.length : 0;
  const SYSTEM = `You are a seasoned trading coach reviewing a full WEEK of a trader's closed trades. Find the ONE recurring pattern that's costing them the most, and one concrete change for next week. Be specific and honest — no generic advice. Max 110 words. Format:\nWEEK: one-line verdict.\n#1 MISTAKE: the single most costly recurring pattern, with evidence from the trades.\nNEXT WEEK: one concrete rule to fix it.`;
  const rows = week.map(t => `${t.symbol} ${t.side || "long"}: $${t.entry}→$${t.exit}, P&L $${Math.round(t.pnl)}`).join("\n");
  const stats = `${week.length} trades · ${winRate}% win · net $${Math.round(net)} · avg win $${Math.round(avgWin)} · avg loss $${Math.round(avgLoss)}`;
  const patterns = patternSummaryLine(week);
  const patternPrompt = patterns ? `\n\nKnown patterns so far:\n${patterns}` : "";
  const review = await callAnthropicApi(`This week's stats: ${stats}\n\nClosed trades:\n${rows}${patternPrompt}\n\nWhat's my #1 recurring mistake?`, KEY(), { model: MODELS.fable, maxTokens: 500, system: SYSTEM, cache: true, timeout: 120000 }).catch(() => "");
  const tiers = tierStatsLine(week);
  const tierBlock = tiers ? `\n\nBY SETUP:\n${tiers}` : "";
  const patternBlock = patterns ? `\n\nPATTERNS:\n${patterns}` : "";
  if (review && shouldSendAlert({ category: "ai-coach" })) sendTelegramMessage(`📅 *WEEKLY REVIEW*\n${stats}${tierBlock}${patternBlock}\n\n${review.trim()}`).catch(() => {});
}

// ── Monthly Deep Review — 1st of month, Fable judges whether the edge is real. ──
async function runMonthlyDeepReview() {
  if (!KEY() || !isConfigured()) return;
  const ct = await getJson("/api/alpaca/closed-trades");
  if (!ct || !ct.ok) return;
  const trades = (ct.trades || []).slice(0, 120);
  if (!trades.length) return;
  const wins = trades.filter(t => Number(t.pnl) > 0), losses = trades.filter(t => Number(t.pnl) <= 0);
  const net = trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const gp = wins.reduce((s, t) => s + Number(t.pnl), 0), gl = Math.abs(losses.reduce((s, t) => s + Number(t.pnl), 0));
  const pf = gl > 0 ? (gp / gl) : (gp > 0 ? 99 : 0);
  const stats = `${trades.length} trades · ${Math.round(wins.length / trades.length * 100)}% win · net $${Math.round(net)} · profit factor ${pf.toFixed(2)}`;
  const tiers = tierStatsLine(trades);
  const patterns = patternSummaryLine(trades);
  const SYSTEM = `You are a hedge-fund risk manager doing a rigorous, skeptical monthly review of an automated PAPER trading strategy. Be brutally honest — most retail strategies have no edge. Assess: (1) is the edge statistically real yet or is the sample too small? (2) which setup tier/type is carrying or dragging the results? (3) 2-3 concrete parameter changes to test next month. Do not be encouraging for its own sake. Max 220 words. End with a one-line verdict: KEEP / TUNE / STOP.`;
  const rows = trades.map(t => `${t.symbol} ${t.side || "long"}: $${t.entry}→$${t.exit}, P&L $${Math.round(t.pnl)}`).join("\n");
  const prompt = `Track record: ${stats}\n${tiers ? `By setup tier:\n${tiers}\n` : ""}${patterns ? `Behavioral patterns:\n${patterns}\n` : ""}\nTrades:\n${rows}\n\nIs the edge real? Verdict + what to change.`;
  const review = await callAnthropicApi(prompt, KEY(), { model: MODELS.fable, maxTokens: 600, system: SYSTEM, cache: true, timeout: 150000 }).catch(() => "");
  if (review && shouldSendAlert({ category: "ai-coach" })) sendTelegramMessage(`🔬 *MONTHLY DEEP REVIEW* — Fable\n${stats}${tiers ? `\n\n${tiers}` : ""}${patterns ? `\n\n${patterns}` : ""}\n\n${review.trim()}`).catch(() => {});
}

// ── APEX AI — automatic morning CIO briefing → Telegram (weekdays ~9:15 AM ET) ──
const APEX_UNIVERSE = [
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","AVGO","TSLA","AMD","NFLX",
  "CRM","ORCL","PANW","CRWD","PLTR","MU","QCOM","ANET","MRVL","SMCI",
  "ARM","COIN","UBER","LLY","V","JPM","COST","WMT","GE","CAT",
  "TSM","VRT","NEE","CCJ","CEG","DELL","MARA","RIOT","HOOD","NET",
];
const APEX_SECTORS = [
  ["XLK","Technology"],["XLV","Healthcare"],["XLF","Financials"],["XLY","Consumer Disc"],["XLC","Communication"],
  ["XLI","Industrials"],["XLE","Energy"],["XLP","Cons. Staples"],["XLU","Utilities"],["XLRE","Real Estate"],["XLB","Materials"],
];
function apexScore(r) {
  const pass = Math.max(0, Math.min(8, Number(r.passCount) || 0));
  const rs = Math.max(1, Math.min(99, Number(r.rsRating) || 1));
  return Math.round(pass / 8 * 50 + rs / 99 * 25 + (r.atBuyPoint ? 15 : 0) + (r.volConfirmed ? 10 : 0));
}
async function postJson(path, body) {
  try { const r = await fetch(`${BASE()}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return await r.json(); } catch { return null; }
}
async function runApexBriefing() {
  if (!KEY() || !isConfigured()) return;
  const screen = await getJson(`/api/market/trend-screen?symbols=${encodeURIComponent(APEX_UNIVERSE.join(","))}`);
  const stocks = ((screen && screen.results) || []).filter(x => !x.error).map(x => ({ ...x, score: apexScore(x) }))
    .sort((a, b) => b.score - a.score).slice(0, 30)
    .map(x => ({ symbol: x.symbol, price: x.price, score: x.score, passCount: x.passCount, rsRating: x.rsRating, stage: (x.stage || "").replace(/ —.*/, ""), atBuyPoint: !!x.atBuyPoint, entry: x.entry, stop: x.stop, target2: x.target2 }));
  if (!stocks.length) return;

  const mq = await getJson(`/api/market/quote?symbols=${encodeURIComponent("SPY,QQQ,^VIX")}`);
  const qs = Array.isArray(mq) ? mq : [];
  const find = s => qs.find(x => String(x.symbol || "").toUpperCase() === s);
  const chg = x => Number(x?.changesPercentage || 0);
  const spy = find("SPY"), qqq = find("QQQ"), vix = find("^VIX");
  const vixVal = Number(vix?.price || 0);
  const factors = [
    { label: "SPY up", pass: chg(spy) > -0.1 }, { label: "QQQ up", pass: chg(qqq) > -0.1 },
    { label: "VIX<20", pass: vixVal > 0 ? vixVal < 20 : false }, { label: "Breadth+", pass: chg(spy) > 0 && chg(qqq) > 0 },
    { label: "Trend day", pass: chg(spy) > 0.4 },
  ];
  const score = factors.filter(f => f.pass).length * 20;
  const regime = { score, label: score >= 75 ? "GREEN" : score >= 55 ? "YELLOW" : "RED", factors, vixVal };

  const secQ = await getJson(`/api/market/quote?symbols=${APEX_SECTORS.map(s => s[0]).join(",")}`);
  const secArr = Array.isArray(secQ) ? secQ : [];
  const sectors = APEX_SECTORS.map(([sym, name]) => ({ name, chg: chg(secArr.find(x => String(x.symbol || "").toUpperCase() === sym)) })).sort((a, b) => b.chg - a.chg);

  let fg = null; try { fg = await getJson("/api/market/feargreed"); } catch {}
  const out = await postJson("/api/market/apex-cio", { regime, stocks, sectors, fearGreed: fg ? `${fg.value ?? fg.score ?? ""} ${fg.label || fg.rating || ""}` : "n/a" });
  if (!out || !out.ok || !out.report) return;

  if (!shouldSendAlert({ category: "ai-coach" })) return;
  const header = `🧠 *TRADE PRO AI — MORNING BRIEFING*\n${new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}\n\n`;
  const text = header + out.report;
  // Telegram cap ~4096; send in chunks on blank lines. Gated once above (not
  // per-chunk) so a multi-part briefing can't be cut off mid-send by budget.
  for (let i = 0; i < text.length; i += 3800) {
    await sendTelegramMessage(text.slice(i, i + 3800)).catch(() => {});
  }
}

module.exports = { runMorningGamePlan, runTradeCoach, runWeeklyReview, runMonthlyDeepReview, runApexBriefing };
