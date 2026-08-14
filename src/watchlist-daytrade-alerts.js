// watchlist-daytrade-alerts.js — real Telegram alert the moment a Watchlist
// symbol's real Day Trade Mode signal (VWAP/opening-range breakout/RVOL/9-21
// EMA stack) crosses into GREEN, even when the app tab isn't open (explicit
// user request, 2026-08-06: closing the gap that Day Trade Mode's signal
// only ever pinged you if you were manually watching the Green Light tab).
// Same real persisted-diff pattern as watchlist-greenlight-alerts.js (its
// swing counterpart) — first-seen-per-symbol seeds silently, only a real
// false→true transition on today's session fires. Queues into the shared
// morning digest (src/alert-buffer.js, 2026-08-14) rather than sending its
// own Telegram message immediately, same as the other 7 opportunity jobs.
"use strict";

const path = require("node:path");
const { ROOT, resolveProviderKeys } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { isConfigured: telegramConfigured } = require("./telegram");
const { pushDigestLines } = require("./alert-buffer");
const { loadWatchlist } = require("./routes/watchlist");
const { isMarketHoursET } = require("./risk-guardrails");
const { computeDayTradeSignal } = require("./day-trade-calc");

const STORE_PATH = path.join(ROOT, "data", "watchlist-daytrade-state.json");

function loadState() {
  return readJsonSafe(STORE_PATH, {});
}
function saveState(s) {
  writeJsonAtomic(STORE_PATH, s);
}

async function checkWatchlistDayTradeAlerts() {
  if (!telegramConfigured()) return { ok: true, skipped: "telegram not configured" };
  // Day Trade Mode signals (VWAP/opening-range/RVOL) are only real during
  // the regular session — same real gate the swing entry alert uses, since
  // isMarketHoursET() is exactly 9:30am-4:00pm ET.
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };
  const { symbols } = loadWatchlist();
  if (!Array.isArray(symbols) || !symbols.length) return { ok: true, checked: 0, alerts: [] };

  let fetchDayTradeScanRows, fetchMarketQuotes;
  try {
    ({ fetchDayTradeScanRows, fetchMarketQuotes } = require("./routes/market"));
  } catch { return { ok: false, checked: 0, alerts: [] }; }

  const keys = resolveProviderKeys(new URLSearchParams());
  const [scanResult, macroRows] = await Promise.all([
    fetchDayTradeScanRows(symbols).catch(() => ({ rows: [] })),
    fetchMarketQuotes(["SPY"], keys).catch(() => []),
  ]);
  const spyRow = (macroRows || []).find((m) => m.symbol === "SPY");
  const spyChg = Number(spyRow?.changesPercentage || 0);

  const prev = loadState();
  const next = { ...prev };
  const alerts = [];

  for (const row of scanResult.rows || []) {
    const dt = computeDayTradeSignal(row, spyChg);
    if (!dt) continue;
    const symbol = dt.symbol;
    const last = prev[symbol] || {};

    if (last.signal !== "GREEN" && dt.signal === "GREEN") {
      alerts.push(dt);
    }

    next[symbol] = { signal: dt.signal };
  }

  saveState(next);

  if (alerts.length) {
    const lines = alerts.map((a) =>
      `⚡ ${a.symbol}: $${a.px.toFixed(2)} — ${a.grade} (${a.quality}/100) · Entry $${a.bestEntry} · Stop $${a.stop} · Target $${a.target} (R:R ${a.rr}:1) · flatten by 3:55 PM ET`
    );
    pushDigestLines("opportunity", "⚡ DAY TRADE MODE — GREEN SIGNAL", lines);
  }

  return { ok: true, checked: symbols.length, alerts };
}

// Real diagnostic read for GET /api/market/daytrade-alert-status — same
// "confirm whether this already fired without SSH access" need as the
// swing entry alert's own status route.
function getAlertState() {
  return loadState();
}

module.exports = { checkWatchlistDayTradeAlerts, getAlertState };
