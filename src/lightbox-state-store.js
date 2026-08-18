// lightbox-state-store.js — persisted, server-authoritative state for the
// Live Trade Light Box: one confirmed BUY/WAIT/SELL per watchlist symbol,
// plus a capped state-change transition log. Structurally the direct
// sibling of watchlist-daytrade-alerts.js (same real symbol-keyed
// persisted-diff pattern), but this is the first place in the app that
// tracks *multi-tick confirmation* rather than firing on a single-poll
// edge — see lightbox-engine.js's header comment for why.
//
// Confirmation must be computed once, here, server-side — not per HTTP
// request and not client-side. If debounce counters lived in the browser,
// two open tabs/devices could show the same symbol in two different states
// at the same moment (each running its own poll-driven counter). One
// authoritative background tick computes the real confirmed state; every
// client just reads it.
"use strict";

const path = require("node:path");
const { ROOT, resolveProviderKeys } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { loadWatchlist } = require("./routes/watchlist");
const { isMarketHoursET } = require("./risk-guardrails");
const { computeDayTradeSignal } = require("./day-trade-calc");
const { stepSymbol } = require("./lightbox-engine");
const { LIGHTBOX_DEFAULTS, SIGNAL_TO_STATE } = require("./lightbox-config");

const STORE_PATH = path.join(ROOT, "data", "lightbox-state.json");

function loadState() {
  const s = readJsonSafe(STORE_PATH, {});
  return {
    config: { confirmBars: LIGHTBOX_DEFAULTS.confirmBars, ...(s.config || {}) },
    bySymbol: s.bySymbol || {},
    transitions: Array.isArray(s.transitions) ? s.transitions : [],
    updatedAt: s.updatedAt || null,
  };
}
function saveState(s) {
  writeJsonAtomic(STORE_PATH, s);
}

// Cheap read for the API route — never recomputes, just returns the last
// persisted result of the background tick below.
function getLightBoxState() {
  return loadState();
}

// User-configurable confirmation period ("Make the confirmation period
// configurable in Settings" — the spec's explicit requirement). Persisted
// here directly rather than folded into the app's broader client-side
// settings-sync system, since confirmation is computed by this background
// job, not per-request — the value has to live somewhere the job can read
// it regardless of whether any browser tab is even open.
function setConfirmBars(n) {
  const clamped = Math.max(LIGHTBOX_DEFAULTS.confirmBarsMin, Math.min(LIGHTBOX_DEFAULTS.confirmBarsMax, Math.round(Number(n))));
  if (!Number.isFinite(clamped)) return loadState().config.confirmBars;
  const state = loadState();
  state.config.confirmBars = clamped;
  saveState(state);
  return clamped;
}

// The real background tick — fetches real day-trade-scan rows for the real
// watchlist, steps each symbol's confirmation state, persists any real
// transitions. Gated to market hours: Day Trade Mode's VWAP/opening-range/
// RVOL signal is only meaningful intraday, same real gate
// watchlist-daytrade-alerts.js uses, so a stale after-hours read never gets
// "confirmed" as if it were live.
// Real incident, 2026-08-17: this job originally scanned the FULL real
// watchlist (grown to 180 symbols the same day) every 60s — each tick is
// 2 Alpaca bars requests per symbol (fetchDayTradeScanRows), so a full
// pass burst ~360 real requests in well under a minute. That tripped
// Alpaca's rate limit (confirmed via a raw 429 "too many requests" from
// data.alpaca.markets) and stalled Day Trade Mode/Light Box for the whole
// app, not just this job. Capped here — not just a slower interval —
// because the burst-per-tick size was the real problem; a slower interval
// alone still bursts the same request count each time it fires.
const MAX_SCAN_SYMBOLS = 50;

// Real follow-up, same day: capping to the first 50 watchlist symbols
// meant the other 130 (of 180) never got scanned at all — user reported
// only ~25-50 tickers ever showing up. Fix keeps the same per-tick burst
// size (still safe against the rate limit above) but rotates which slice
// of the watchlist gets scanned each tick, so the whole watchlist cycles
// through over a few ticks instead of the same head-of-list 50 forever.
// Offset persists in state.config so it survives restarts/redeploys.
function rotateSlice(arr, offset, count) {
  if (arr.length <= count) return arr;
  const out = [];
  for (let i = 0; i < count; i++) out.push(arr[(offset + i) % arr.length]);
  return out;
}

async function tickLightBox() {
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };
  const { symbols: allSymbols } = loadWatchlist();
  if (!Array.isArray(allSymbols) || !allSymbols.length) return { ok: true, checked: 0 };

  const state = loadState();
  const confirmBars = state.config.confirmBars || LIGHTBOX_DEFAULTS.confirmBars;
  const offset = Number(state.config.scanOffset) || 0;
  const symbols = rotateSlice(allSymbols, offset, MAX_SCAN_SYMBOLS);
  const nextOffset = allSymbols.length ? (offset + MAX_SCAN_SYMBOLS) % allSymbols.length : 0;

  // Lazy require (not top-level) — src/routes/market.js's route handler
  // lazily requires this file too, so a top-level require here would form
  // a circular require. Same lazy-require pattern watchlist-daytrade-alerts.js
  // already uses for the exact same reason.
  let fetchDayTradeScanRows, fetchMarketQuotes;
  try {
    ({ fetchDayTradeScanRows, fetchMarketQuotes } = require("./routes/market"));
  } catch {
    return { ok: false, checked: 0 };
  }
  const { etfOf } = require("./sector-theme-map");
  const { getTrendQuality } = require("./trend-quality-store");

  // Real QQQ/VIX + whichever real sector ETFs this tick's symbols actually
  // need, still ONE batched quote call (not per-symbol) — the same
  // rate-limit-safety discipline this job's own header comments already
  // document two real prior incidents about. Feeds Relative Strength
  // (vs QQQ + sector) and the Market dimension's real VIX read into
  // computeDayTradeSignal's optional `extra` param.
  const sectorEtfs = [...new Set(symbols.map((s) => etfOf(s)).filter(Boolean))];
  const keys = resolveProviderKeys(new URLSearchParams());
  const [scanResult, macroRows] = await Promise.all([
    fetchDayTradeScanRows(symbols).catch(() => ({ rows: [], generatedAt: null })),
    fetchMarketQuotes(["SPY", "QQQ", "^VIX", ...sectorEtfs], keys).catch(() => []),
  ]);
  const spyRow = (macroRows || []).find((m) => m.symbol === "SPY");
  const spyChg = Number(spyRow?.changesPercentage || 0);
  const qqqRow = (macroRows || []).find((m) => m.symbol === "QQQ");
  const qqqChg = qqqRow ? Number(qqqRow.changesPercentage || 0) : null;
  const sectorChgByEtf = new Map((macroRows || []).map((m) => [m.symbol, Number(m.changesPercentage || 0)]));
  const generatedAt = scanResult.generatedAt || new Date().toISOString();
  // Start from the previous map so a symbol whose real fetch failed this
  // tick (rate limit / transient timeout) keeps its last-known state
  // instead of dropping out of the grid.
  const nextBySymbol = { ...state.bySymbol };
  const newTransitions = [];
  const nowIso = new Date().toISOString();

  for (const row of scanResult.rows || []) {
    const sectorEtf = etfOf(row.symbol);
    const tq = getTrendQuality(row.symbol);
    const extra = { qqqChg, sectorChg: sectorEtf ? sectorChgByEtf.get(sectorEtf) ?? null : null, trendLabel: tq.trendLabel, vcpVerdict: tq.vcpVerdict };
    const dt = computeDayTradeSignal(row, spyChg, extra);
    if (!dt) continue;
    const symbol = dt.symbol;
    const prev = state.bySymbol[symbol];
    const stepped = stepSymbol(prev, dt.signal, generatedAt, confirmBars);
    nextBySymbol[symbol] = { ...stepped, raw: dt, updatedAt: nowIso };

    if (prev && stepped.confirmed !== prev.confirmed) {
      newTransitions.push({
        ts: nowIso,
        symbol,
        from: SIGNAL_TO_STATE[prev.confirmed] || prev.confirmed,
        to: SIGNAL_TO_STATE[stepped.confirmed] || stepped.confirmed,
        quality: dt.quality,
      });
    }
  }

  const transitions = [...newTransitions, ...state.transitions].slice(0, LIGHTBOX_DEFAULTS.maxTransitions);
  saveState({ config: { ...state.config, scanOffset: nextOffset }, bySymbol: nextBySymbol, transitions, updatedAt: nowIso });
  return { ok: true, checked: symbols.length, scannedThisTick: symbols, watchlistSize: allSymbols.length, newTransitions: newTransitions.length };
}

module.exports = { getLightBoxState, setConfirmBars, tickLightBox };
