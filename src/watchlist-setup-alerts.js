// watchlist-setup-alerts.js — two more real Telegram alerts for Watchlist
// symbols, on top of watchlist-turn-alerts.js's GO/WAIT/AVOID verdict-flip
// alert (Phase 4 of the Institutional Scanner work, 2026-07-28):
//   1. Trade Setup Score crosses into the real "tradeable" tier (≥70, the
//      same threshold AiScoreExplainer's band() calls "Good — tradeable
//      with proper risk management") from below.
//   2. Real buy-zone entry — atBuyPoint flips false→true (confirmed pivot
//      breakout with volume), independent of the score threshold above.
// Same real persisted-diff pattern as watchlist-turn-alerts.js (durable
// store survives redeploys, first-seen-per-symbol seeds silently rather
// than alerting). Uses screenTrendTemplate (not buildTrendTemplate) because
// atBuyPoint and the flattened row shape computeAPlusScore needs
// (abovePivotPct, pctFromHigh, riskPct, confidence, vcpGrade, ...) are only
// produced by screenTrendTemplate's real cross-sectional RS pass — the same
// real engine the Sniper Scanner and Best Opportunities already use.
"use strict";

const path = require("node:path");
const { ROOT, resolveProviderKeys } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");
const { shouldSendAlert } = require("./telegram-bot");
const { loadWatchlist } = require("./routes/watchlist");
const { isMarketHoursET } = require("./risk-guardrails");

const STORE_PATH = path.join(ROOT, "data", "watchlist-setup-state.json");
const SCORE_TIER_THRESHOLD = 70; // matches AiScoreExplainer's "Good/tradeable" band

function loadState() {
  return readJsonSafe(STORE_PATH, {});
}
function saveState(s) {
  writeJsonAtomic(STORE_PATH, s);
}

async function checkWatchlistSetupAlerts() {
  if (!telegramConfigured()) return { ok: true, skipped: "telegram not configured" };
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };
  const { symbols } = loadWatchlist();
  if (!Array.isArray(symbols) || !symbols.length) return { ok: true, checked: 0, alerts: [] };

  let screenTrendTemplate, fetchMarketQuotes, computeRegime, computeAPlusScore;
  try {
    ({ screenTrendTemplate, fetchMarketQuotes } = require("./routes/market"));
    ({ computeRegime, computeAPlusScore } = require("./trade-planner-scoring"));
  } catch { return { ok: false, checked: 0, alerts: [] }; }

  const macroRows = await fetchMarketQuotes(["SPY", "QQQ", "VIXY"], resolveProviderKeys(new URLSearchParams())).catch(() => []);
  const regime = computeRegime(Array.isArray(macroRows) ? macroRows : []);
  const results = await screenTrendTemplate(symbols).catch(() => []);

  const prev = loadState();
  const next = { ...prev };
  const alerts = [];

  for (const row of results) {
    if (row.error) continue;
    const symbol = row.symbol;
    const { score } = computeAPlusScore(row, regime);
    const atBuyPoint = !!row.atBuyPoint;
    const last = prev[symbol] || {};

    // 1. Score crossed into the tradeable tier from below.
    if (Number.isFinite(last.score) && last.score < SCORE_TIER_THRESHOLD && score >= SCORE_TIER_THRESHOLD) {
      alerts.push({ symbol, kind: "score", from: last.score, to: score });
    }
    // 2. Real buy-zone entry.
    if (last.atBuyPoint === false && atBuyPoint === true) {
      alerts.push({ symbol, kind: "buyzone", price: row.price });
    }

    next[symbol] = { score, atBuyPoint };
  }

  saveState(next);

  if (alerts.length && shouldSendAlert({ category: "watchlist-setup-alert" })) {
    const lines = alerts.map((a) =>
      a.kind === "score"
        ? `📈 ${a.symbol}: Trade Setup Score ${a.from} → ${a.to} — now in the tradeable range (≥${SCORE_TIER_THRESHOLD})`
        : `🎯 ${a.symbol}: entered the real buy zone at $${Number(a.price).toFixed(2)} (confirmed pivot breakout, volume-confirmed)`
    );
    await sendTelegramMessage(`⚡ *WATCHLIST SETUP ALERT*\n\n${lines.join("\n")}`).catch(() => {});
  }

  return { ok: true, checked: symbols.length, alerts };
}

module.exports = { checkWatchlistSetupAlerts };
