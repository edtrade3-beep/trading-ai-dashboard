// market-wrap-ai.js — daily 4:30 PM ET Market Wrap (explicit user
// request, 2026-08-31: "i also want to do research about stock markets
// update daily at 4:30 pm i want deep scan deep analysis what stocks
// moving up or down what big news what big events how healthy is spy
// and qqq and other ETF and also sectors what next move"). Same real
// shape as research-intel-ai.js (this app's own proven "one real AI
// chokepoint, real-data-grounded, sanitize, persist, optionally alert"
// pattern) — real web-search-grounded synthesis via the same
// callAnthropicWithSearch chokepoint every other AI feature in this app
// uses, not a new engine.
//
// Every real number here (movers' symbol/price/changePct, sector
// symbol/change/status, SPY/QQQ/VIX/regime reads) comes from this
// platform's own already-computed real routes — GET /api/market/movers,
// /api/market/macro-regime (sectorRotation), /api/market/context (SPY/
// QQQ/VIX/DXY/gold/oil/regime) — zero new fetch/compute logic, just real
// self-loopback reuse of routes this app already serves. The AI's real
// job is narrative synthesis (why did X move, how healthy is the tape,
// what to watch) grounded in that real data plus real live search for
// today's big news/events — never asked to invent the numbers
// themselves (market-wrap-engine.js's mergeMoverReasons/mergeSectorNotes
// enforce this: the real number always wins, the AI only adds color).
"use strict";

const { callAnthropicWithSearch } = require("./anthropic");
const { getMode } = require("./credit-saver-mode");
const { saveCoachOutput } = require("./ai-coach-store");
const { PORT } = require("./config");
const {
  sanitizeHealth, mergeMoverReasons, mergeSectorNotes, sanitizeBigNews, sanitizeOutlook,
} = require("./market-wrap-engine");

const KEY = () => (process.env.ANTHROPIC_API_KEY || "").trim();
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
async function getJson(path) {
  try { const r = await fetch(`${BASE()}${path}`); return await r.json(); } catch { return null; }
}

const SYSTEM = `You are the MARKET WRAP layer of a real trading platform — a daily, end-of-session deep-scan analysis, generated after the real US market close. Your job is to explain today's real session: what moved and why, how healthy the real major indexes and sectors are, what the real big news/events were, and what to watch next. You do NOT produce a trading verdict for any specific position — a separate engine owns that; this is analysis and context.

You are given this platform's own REAL, already-computed data below — real today's biggest gainers/losers (symbol, price, % change), real sector rotation data (symbol, % change, status), real SPY/QQQ/VIX/DXY/gold/oil reads and market regime, and real high-impact news from the last 24h. Treat all of this as ground truth — never restate a different number than the one given, never invent a symbol that isn't in the real list given to you. Your real job is the WHY, not the numbers.

Search real, current sources now for today's real market-moving news/events (Fed, earnings, economic data, geopolitical, company-specific) to ground your analysis — the platform's own real news feed given below may not cover everything from today.

Return:
- marketPulse: a real 2-4 sentence summary of today's real overall session (up/down/choppy, what drove it, real breadth read if you can infer one from the given data).
- spyHealth / qqqHealth: {verdict (one of STRONG/HEALTHY/NEUTRAL/WEAK/AT_RISK), reason (why, grounded in the real regime/change data given)}.
- gainerReasons / loserReasons: for EACH real symbol given to you in the real gainers/losers list (never a symbol not in that list), a real reason it moved today — from real search/news if you found the specific cause, otherwise a real, honest technical/sector-context reason (never fabricate a specific catalyst you don't have real evidence for).
- bigNews: the real biggest market-moving stories of the day (headline, summary, impact: HIGH/MEDIUM/LOW) — from real search and the real feed given to you, never invented.
- sectorNotes: for EACH real sector symbol given to you, a short real note on what's driving its real relative performance today.
- outlook: {note (a real, honest 2-3 sentence read on what the next real move/session might look like, grounded in today's real data — explicitly NOT a guaranteed prediction), watchFor (a real list of specific things to watch tomorrow/this week — data releases, earnings, Fed events, technical levels)}.

Never invent a fact, statistic, symbol, or number beyond what's given or what you genuinely found via real search. Return JSON ONLY:
{"marketPulse":"...","spyHealth":{"verdict":"...","reason":"..."},"qqqHealth":{"verdict":"...","reason":"..."},"gainerReasons":[{"symbol":"...","reason":"..."}],"loserReasons":[{"symbol":"...","reason":"..."}],"bigNews":[{"headline":"...","summary":"...","impact":"HIGH|MEDIUM|LOW"}],"sectorNotes":[{"sector":"...","note":"..."}],"outlook":{"note":"...","watchFor":["...","..."]}}`;

function summarizeMovers(movers, label) {
  if (!Array.isArray(movers) || !movers.length) return `no real ${label} data this run`;
  return movers.map((m) => `${m.symbol}: $${m.price} (${m.changesPercentage >= 0 ? "+" : ""}${m.changesPercentage}%)`).join(", ");
}
function summarizeSectors(ranked) {
  if (!Array.isArray(ranked) || !ranked.length) return "no real sector rotation data this run";
  return ranked.map((s) => `${s.sym} (${s.name || "?"}): ${s.change >= 0 ? "+" : ""}${s.change}% [${s.status || "?"}]`).join(", ");
}
function summarizeContext(ctx) {
  if (!ctx || ctx.available === false) return "unavailable this run";
  const i = ctx.instruments || {};
  return [
    `Regime ${ctx.regime?.label || "n/a"} (${ctx.regime?.score ?? "n/a"}/100)`,
    `Trading environment: ${ctx.tradingEnvironment || "n/a"}`,
    `VIX ${i.vix?.level ?? "n/a"}`,
    `DXY ${Number.isFinite(i.dxy?.chgPct) ? `${i.dxy.chgPct >= 0 ? "+" : ""}${i.dxy.chgPct}%` : "n/a"}`,
    `Oil ${Number.isFinite(i.oil?.chgPct) ? `${i.oil.chgPct >= 0 ? "+" : ""}${i.oil.chgPct}%` : "n/a"}`,
    `Gold ${Number.isFinite(i.gold?.chgPct) ? `${i.gold.chgPct >= 0 ? "+" : ""}${i.gold.chgPct}%` : "n/a"}`,
    `Divergence: ${ctx.divergence || "none"}${ctx.divergenceReason ? ` (${ctx.divergenceReason})` : ""}`,
  ].join(" · ");
}
function summarizeNews(feedRows) {
  if (!Array.isArray(feedRows) || !feedRows.length) return "no high-impact items in this platform's own feed in the last 24h";
  return feedRows.slice(0, 15).map((r) => `[${r.category}/${r.impact_score}] ${r.headline}`).join("\n");
}

async function buildMarketWrap() {
  if (!KEY()) return null;

  const { SCAN_UNIVERSE } = require("./advisor-ai");
  const [moversData, regimeData, contextData, newsFeed] = await Promise.all([
    getJson(`/api/market/movers?symbols=${SCAN_UNIVERSE.join(",")}&n=8`),
    getJson("/api/market/macro-regime"),
    getJson("/api/market/context"),
    require("./news/store").getFeed({ minImpact: 60, sinceMinutes: 24 * 60, limit: 20 }).catch(() => ({ rows: [] })),
  ]);

  const realGainers = Array.isArray(moversData?.gainers) ? moversData.gainers : [];
  const realLosers = Array.isArray(moversData?.losers) ? moversData.losers : [];
  const realSectors = Array.isArray(regimeData?.sectorRotation?.ranked) ? regimeData.sectorRotation.ranked : [];

  const prompt = `THIS PLATFORM'S REAL TOP GAINERS TODAY: ${summarizeMovers(realGainers, "gainers")}

THIS PLATFORM'S REAL TOP LOSERS TODAY: ${summarizeMovers(realLosers, "losers")}

THIS PLATFORM'S REAL SECTOR ROTATION DATA: ${summarizeSectors(realSectors)}
Real rotation bias: ${regimeData?.sectorRotation?.rotationBias ?? "n/a"} · Real breadth score: ${regimeData?.breadth?.score ?? "n/a"}

THIS PLATFORM'S REAL MARKET CONTEXT: ${summarizeContext(contextData)}

THIS PLATFORM'S REAL HIGH-IMPACT NEWS, LAST 24H:
${summarizeNews(newsFeed?.rows)}

Search for real, current end-of-day market news/events now and return the JSON.`;

  let parsed = null;
  let aiError = null;
  try {
    // Same real, proven parameters as research-intel-ai.js (identical
    // call shape/complexity: real search + a several-field structured
    // JSON) — including the 280s timeout fix applied there 2026-08-31
    // after a real production timeout at the 120s default, applied here
    // from the start rather than waiting for the same failure to repeat.
    const raw = await callAnthropicWithSearch(prompt + "\n\n" + SYSTEM, KEY(), {
      model: "claude-sonnet-4-6", maxTokens: 8000,
      maxSearches: getMode() === "saver" ? 2 : 3,
      timeout: 280000,
      feature: "market-wrap",
    });
    const m = (raw || "").match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : raw);
  } catch (e) {
    aiError = e.message;
    console.warn("[Market Wrap] AI generation unavailable:", aiError);
  }
  if (!parsed) return { ok: false, aiUnavailable: true, aiError, generatedAt: Date.now() };

  const built = {
    ok: true,
    marketPulse: String(parsed.marketPulse || "").slice(0, 600),
    spyHealth: sanitizeHealth(parsed.spyHealth),
    qqqHealth: sanitizeHealth(parsed.qqqHealth),
    topGainers: mergeMoverReasons(realGainers, parsed.gainerReasons),
    topLosers: mergeMoverReasons(realLosers, parsed.loserReasons),
    bigNews: sanitizeBigNews(parsed.bigNews),
    sectorHealth: mergeSectorNotes(realSectors, parsed.sectorNotes),
    outlook: sanitizeOutlook(parsed.outlook),
    regime: contextData?.available !== false ? { label: contextData?.regime?.label || null, score: contextData?.regime?.score ?? null, tradingEnvironment: contextData?.tradingEnvironment || null } : null,
    generatedAt: Date.now(),
  };

  saveCoachOutput("marketWrap", built);
  return built;
}

module.exports = { buildMarketWrap };
