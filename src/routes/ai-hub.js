// ai-hub.js — thin GET/POST wrappers that surface AI/risk capability that
// already exists elsewhere in the app (ai-coach.js, risk-guardrails.js,
// journal-analytics.js) but previously had no on-screen home — either
// Telegram-only or used internally by the autopilot engines and never
// rendered. No new AI calls and no new risk math live here; this file only
// reads/aggregates what other modules already compute.
//
// GET  /api/ai-hub/morning-brief          — last persisted CIO-style AI brief
// POST /api/ai-hub/morning-brief/refresh  — force-generate a fresh one
// GET  /api/ai-hub/risk-snapshot          — live portfolio risk, same math
//                                            that already gates the autopilots
// GET  /api/ai-hub/coach-log              — all persisted ai-coach.js outputs
// GET  /api/ai-hub/journal-patterns       — journal-analytics.js over closed trades
// POST /api/ai-hub/trading-lesson         — today's Learning AI lesson (generates once/day)
// GET  /api/ai-hub/ceo-brief              — last persisted CEO AI recommendation
// POST /api/ai-hub/ceo-brief/refresh      — force-generate a fresh one
// GET  /api/ai-hub/advisor-brief          — last persisted ADVISOR AI research brief
// POST /api/ai-hub/advisor-brief/refresh  — force-generate a fresh one
const { writeJson, readRequestBody } = require("../utils");
const { loadCoachLog } = require("../ai-coach-store");
const { loadJournal } = require("../journal-store");
const { buildApexBriefing } = require("../ai-coach");
const { buildCeoRecommendation } = require("../ceo-ai");
const { buildAdvisorBrief } = require("../advisor-ai");
const {
  winRateByDayOfWeek, winRateByHour, avgHoldTime, sectorPerformance, bestWorstTrades,
} = require("../journal-analytics");
const { PORT, ANTHROPIC_API_KEY } = require("../config");
const {
  sectorOf, checkAccountHealth, dailyLossBreakerTripped, openRiskPct,
} = require("../risk-guardrails");
const { callAnthropicApi, MODELS } = require("../anthropic");
const { load: loadLessonStore, saveLesson } = require("../trading-lesson-store");

const etDateStr = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

const LESSON_TOPICS = [
  "risk management", "position sizing", "technical analysis", "trading psychology",
  "market structure", "trade review discipline", "chart patterns", "cutting losses",
];
async function generateTradingLesson(force) {
  const key = ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "ANTHROPIC_API_KEY not set" };
  const today = etDateStr();
  const store = loadLessonStore();
  if (!force && store.today && store.todayDate === today) return { ok: true, lesson: store.today, cached: true };

  const topic = LESSON_TOPICS[Math.floor(Math.random() * LESSON_TOPICS.length)];
  const recent = (store.recent || []).slice(0, 20);
  const SYSTEM = `You are an elite trading coach writing one short, deep, practical lesson. Return JSON ONLY in exactly this shape, no text outside the JSON:
{"title":"short title","teach":"2-3 sentences teaching the idea with real depth","deep":"1-2 sentences adding a sharper edge or concrete example","practice":"one practical exercise to apply today","mantra":"one memorable line to repeat"}`;
  const prompt = `Write a new lesson on: ${topic}.${recent.length ? ` Avoid repeating these previous titles: ${recent.join(", ")}.` : ""} Return JSON only.`;
  try {
    const raw = await callAnthropicApi(prompt, key, { model: MODELS.haiku, maxTokens: 400, system: SYSTEM, cache: true });
    let lesson;
    try {
      const m = (raw || "").match(/\{[\s\S]*\}/);
      lesson = JSON.parse(m ? m[0] : raw);
    } catch { return { ok: false, error: "could not parse lesson" }; }
    saveLesson(lesson, today);
    return { ok: true, lesson, topic, cached: false };
  } catch (e) { return { ok: false, error: e.message }; }
}

const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
async function getJson(path) {
  try { const r = await fetch(`${BASE()}${path}`); return await r.json(); } catch { return null; }
}

async function buildRiskSnapshot() {
  const acctResp = await getJson("/api/alpaca/account");
  if (!acctResp || !acctResp.ok) return { ok: false, reason: acctResp?.reason || "no-alpaca-key" };
  const posResp = await getJson("/api/alpaca/positions");
  const positions = (posResp && posResp.ok) ? posResp.positions : [];

  const account = acctResp.account;
  const equity = Number(account.equity) || 0;
  const cash = Number(account.cash) || 0;
  // The mapped /api/alpaca/account response doesn't carry Alpaca's raw
  // trading_blocked/account_blocked flags — status is the closest available
  // proxy (non-"ACTIVE" accounts can't trade).
  const health = checkAccountHealth({ equity, cash, tradingBlocked: account.status !== "ACTIVE", accountBlocked: false });

  // risk-guardrails.js expects {symbol, qty, avgEntryPrice} — /api/alpaca/positions
  // returns avgEntry, same normalization server-autopilot.js/autoexec.js already do.
  const normPositions = positions.map(p => ({ symbol: p.symbol, qty: p.qty, avgEntryPrice: p.avgEntry }));
  const openRisk = openRiskPct({ positions: normPositions, equity });
  // Same convention server-autopilot.js:68 already uses: prior-close equity as
  // the start-of-day baseline for the daily-loss breaker.
  const dailyBreakerTripped = dailyLossBreakerTripped({ equity, startOfDayEquity: account.lastEquity, maxLossPct: 2 });

  // Pure display aggregation (not a risk decision) — how many positions per
  // sector, reusing sectorOf() so it stays consistent with the sector-cap
  // guardrail's own classification.
  const bySector = {};
  for (const p of positions) {
    const sec = sectorOf(p.symbol);
    bySector[sec] = (bySector[sec] || 0) + 1;
  }

  return {
    ok: true,
    equity, cash, buyingPower: account.buyingPower,
    dailyPnl: equity - (Number(account.lastEquity) || equity),
    accountHealth: health,
    openRiskPct: Math.round(openRisk * 10) / 10,
    dailyBreakerTripped,
    positionCount: positions.length,
    sectorConcentration: bySector,
  };
}

async function handleAiHub(req, res, requestUrl) {
  const { pathname } = requestUrl;

  if (pathname === "/api/ai-hub/morning-brief" && req.method === "GET") {
    const log = loadCoachLog();
    return writeJson(res, 200, { ok: true, brief: log.apex || null });
  }

  if (pathname === "/api/ai-hub/morning-brief/refresh" && req.method === "POST") {
    try {
      const built = await buildApexBriefing();
      if (!built) return writeJson(res, 200, { ok: false, error: "Market data unavailable." });
      return writeJson(res, 200, { ok: true, brief: built });
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: e.message });
    }
  }

  if (pathname === "/api/ai-hub/risk-snapshot" && req.method === "GET") {
    const snapshot = await buildRiskSnapshot();
    return writeJson(res, 200, snapshot);
  }

  if (pathname === "/api/ai-hub/coach-log" && req.method === "GET") {
    return writeJson(res, 200, { ok: true, log: loadCoachLog() });
  }

  if (pathname === "/api/ai-hub/journal-patterns" && req.method === "GET") {
    const ct = await getJson("/api/alpaca/closed-trades");
    let trades = (ct && ct.ok) ? (ct.trades || []) : [];
    // Alpaca-linked autopilot fills are the primary source (real execution
    // price/timing), but most users journal discretionary trades manually
    // via the Journal tab's LOG buttons instead of an Alpaca-linked account
    // — on a manual-only setup, /api/alpaca/closed-trades is permanently
    // empty and this panel would say "not enough data" forever even with
    // a full journal right above it on the same page. Fall back to the
    // manual journal's closed entries, mapped into the same shape the
    // pattern-mining functions already expect (symbol/pnl/openedAt/closedAt).
    if (!trades.length) {
      trades = loadJournal()
        .filter((e) => e.status === "closed" && e.pnl != null && e.openedAt)
        .map((e) => ({ symbol: e.ticker, pnl: e.pnl, openedAt: e.openedAt, closedAt: e.closedAt }));
    }
    return writeJson(res, 200, {
      ok: true,
      tradeCount: trades.length,
      byDayOfWeek: winRateByDayOfWeek(trades),
      byHour: winRateByHour(trades),
      holdTime: avgHoldTime(trades),
      bySector: sectorPerformance(trades),
      bestWorst: bestWorstTrades(trades),
    });
  }

  if (pathname === "/api/ai-hub/trading-lesson" && req.method === "POST") {
    let body = {};
    try { body = JSON.parse((await readRequestBody(req)) || "{}"); } catch {}
    const result = await generateTradingLesson(!!body.force);
    return writeJson(res, 200, result);
  }

  if (pathname === "/api/ai-hub/ceo-brief" && req.method === "GET") {
    const log = loadCoachLog();
    return writeJson(res, 200, { ok: true, brief: log.ceo || null });
  }

  if (pathname === "/api/ai-hub/ceo-brief/refresh" && req.method === "POST") {
    // buildCeoRecommendation() no longer throws/returns null on an AI
    // failure — it always returns real department data (built.aiUnavailable
    // discloses when the AI judgment layer specifically couldn't run, with
    // built.aiError carrying the real reason). The try/catch here is just a
    // safety net for a genuinely unexpected error.
    try {
      const built = await buildCeoRecommendation();
      return writeJson(res, 200, { ok: true, brief: built });
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: e.message });
    }
  }

  if (pathname === "/api/ai-hub/advisor-brief" && req.method === "GET") {
    const log = loadCoachLog();
    return writeJson(res, 200, { ok: true, brief: log.advisor || null });
  }

  if (pathname === "/api/ai-hub/advisor-brief/refresh" && req.method === "POST") {
    const built = await buildAdvisorBrief();
    if (!built) return writeJson(res, 200, { ok: false, error: "Could not generate an ADVISOR brief (ANTHROPIC_API_KEY not set or the AI call failed)." });
    return writeJson(res, 200, { ok: true, brief: built });
  }

  return writeJson(res, 404, { error: "Not found" });
}

module.exports = { handleAiHub };
