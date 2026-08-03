// watchlist-greenlight-alerts.js — real Telegram alert when a Watchlist
// symbol's real Green Light entry price is actually reached (explicit user
// request, 2026-08-03, annotated screenshot of a "wait for pullback $X" row:
// "alert me when it goes to buy"). Distinct from watchlist-setup-alerts.js's
// "buyzone" alert — that one watches screenTrendTemplate's own atBuyPoint
// (confirmed pivot breakout + volume), a real but DIFFERENT signal from
// Green Light's own entryNote/atEntry (price reaching real EMA21/MA50/pivot
// support). The two can legitimately disagree, same as this app's other
// documented dual-scoring divergences (TrendChart's GO/WAIT vs AI Score
// Card, Scanner's QUALITY vs ACTION) — this alert is specifically the one
// GreenLightTab's own "wait for pullback" banner promises to fire on.
// Same real persisted-diff pattern as the sibling watchlist alert files
// (durable store survives redeploys, first-seen-per-symbol seeds silently).
"use strict";

const path = require("node:path");
const { ROOT, resolveProviderKeys } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");
const { shouldSendAlert } = require("./telegram-bot");
const { loadWatchlist } = require("./routes/watchlist");
const { isMarketHoursET } = require("./risk-guardrails");
const { computeGreenLight } = require("./greenlight-calc");

const STORE_PATH = path.join(ROOT, "data", "watchlist-greenlight-state.json");

function loadState() {
  return readJsonSafe(STORE_PATH, {});
}
function saveState(s) {
  writeJsonAtomic(STORE_PATH, s);
}

async function checkWatchlistGreenLightAlerts() {
  if (!telegramConfigured()) return { ok: true, skipped: "telegram not configured" };
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };
  const { symbols } = loadWatchlist();
  if (!Array.isArray(symbols) || !symbols.length) return { ok: true, checked: 0, alerts: [] };

  let screenWatchlistCached, fetchMarketQuotes, computeRegime;
  try {
    ({ screenWatchlistCached, fetchMarketQuotes } = require("./routes/market"));
    ({ computeRegime } = require("./trade-planner-scoring"));
  } catch { return { ok: false, checked: 0, alerts: [] }; }

  const keys = resolveProviderKeys(new URLSearchParams());
  const macroRows = await fetchMarketQuotes(["SPY", "QQQ", "VIXY"], keys).catch(() => []);
  const regime = computeRegime(Array.isArray(macroRows) ? macroRows : []);
  const spyRow = (macroRows || []).find((m) => m.symbol === "SPY");
  const spyChg = Number(spyRow?.changesPercentage || 0);

  // Real quote batch (price/priceAvg50/dayHigh/dayLow/yearHigh/yearLow/
  // changesPercentage) — computeGreenLight's `q` param needs fields
  // screenTrendTemplate's own row doesn't carry; `fetchMarketQuotes` is the
  // same real function watchlist-setup-alerts.js already uses for its own
  // macro quotes above, just applied to the Watchlist symbols too.
  const [trendResults, quoteResults] = await Promise.all([
    screenWatchlistCached(symbols).catch(() => []),
    fetchMarketQuotes(symbols, keys).catch(() => []),
  ]);
  const quoteBySymbol = {};
  (quoteResults || []).forEach((q) => { if (q?.symbol) quoteBySymbol[q.symbol] = q; });

  const prev = loadState();
  const next = { ...prev };
  const alerts = [];

  for (const row of trendResults) {
    if (row.error) continue;
    const symbol = row.symbol;
    // Honest partial degrade — a symbol missing from the quote batch (rare,
    // e.g. a transient provider miss) still gets a real computation off the
    // trend row's own real price, just without the quote-only fields
    // (priceAvg50/day range/year range) computeGreenLight already knows how
    // to fall back without.
    const q = quoteBySymbol[symbol] || { price: row.price };
    const gl = computeGreenLight(q, spyChg, null, regime.score, row);
    const last = prev[symbol] || {};

    if (last.atEntry === false && gl.atEntry === true) {
      alerts.push({ symbol, price: gl.px, bestEntry: gl.bestEntry, signal: gl.signal, grade: gl.grade, tradeable: gl.tradeable });
    }

    next[symbol] = { atEntry: gl.atEntry };
  }

  saveState(next);

  if (alerts.length && shouldSendAlert({ category: "opportunity" })) {
    const lines = alerts.map((a) =>
      `🎯 ${a.symbol}: hit its real entry at $${Number(a.price).toFixed(2)} (target $${a.bestEntry}) — ${a.signal} ${a.tradeable ? "· tradeable" : ""} · Grade ${a.grade}`
    );
    await sendTelegramMessage(`⚡ *WATCHLIST GREEN LIGHT ENTRY*\n\n${lines.join("\n")}`).catch(() => {});
  }

  return { ok: true, checked: symbols.length, alerts };
}

module.exports = { checkWatchlistGreenLightAlerts };
