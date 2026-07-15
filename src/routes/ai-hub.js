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
const { writeJson } = require("../utils");
const { loadCoachLog } = require("../ai-coach-store");
const { buildApexBriefing } = require("../ai-coach");
const {
  winRateByDayOfWeek, winRateByHour, avgHoldTime, sectorPerformance, bestWorstTrades,
} = require("../journal-analytics");
const { PORT } = require("../config");
const {
  sectorOf, checkAccountHealth, dailyLossBreakerTripped, openRiskPct,
} = require("../risk-guardrails");

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
    const built = await buildApexBriefing();
    if (!built) return writeJson(res, 200, { ok: false, error: "Could not generate a briefing (ANTHROPIC_API_KEY not set, market data unavailable, or the AI call failed)." });
    return writeJson(res, 200, { ok: true, brief: built });
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
    if (!ct || !ct.ok) return writeJson(res, 200, { ok: false, reason: ct?.reason || "no-alpaca-key" });
    const trades = ct.trades || [];
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

  return writeJson(res, 404, { error: "Not found" });
}

module.exports = { handleAiHub };
