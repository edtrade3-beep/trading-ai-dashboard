// trend-quality-store.js — a slow-cadence real Minervini Trend Template +
// VCP cache for the watchlist, feeding the day-trade weighted scoring
// engine's Minervini/VCP inputs (spec: "AM Trading — Final Trading Logic
// Redesign", §2/§24 — keep Minervini/VCP, but as weighted confidence
// factors for day trading, never a hard gate).
//
// Why a separate slow-cadence cache instead of calling screenTrendTemplate
// inline from Light Box's own tick: Trend Template needs ~200 daily bars
// per symbol and is a daily-timeframe read that doesn't meaningfully
// change tick-to-tick — recomputing it on Light Box's fast cadence
// alongside the 15-min day-trade poll would multiply real bar-fetch
// volume for zero benefit. This app hit real Alpaca 429s twice this
// session from exactly this kind of per-tick fan-out (see
// lightbox-state-store.js's own header comments). Same
// writeJsonAtomic/readJsonSafe persisted-store pattern as
// lightbox-state-store.js.
"use strict";

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { isMarketHoursET } = require("./risk-guardrails");

const STORE_PATH = path.join(ROOT, "data", "trend-quality-cache.json");

// Same real rate-limit-safety cap Light Box itself uses — screenTrendTemplate's
// own bounded-6-worker concurrency makes each individual fetch safe, but the
// TOTAL symbol count per run still matters (200 daily bars each).
const MAX_SCAN_SYMBOLS = 60;

function loadState() {
  const s = readJsonSafe(STORE_PATH, {});
  return { bySymbol: s.bySymbol || {}, updatedAt: s.updatedAt || null };
}
function saveState(s) {
  writeJsonAtomic(STORE_PATH, s);
}

function trendLabelFromPassCount(passCount) {
  if (passCount == null) return null;
  if (passCount >= 6) return "STRONG";
  if (passCount >= 4) return "NEUTRAL";
  return "WEAK";
}

// Honest default when a symbol hasn't been scored yet (new watchlist add,
// or the cache job hasn't reached it this cycle) — NEUTRAL, never
// fabricated as STRONG or WEAK, matching spec §2's "do not block, only
// lower confidence when genuinely weak" philosophy applied to missing data
// too: unknown must never read as bearish.
const UNSCORED = { trendScore: null, trendLabel: "NEUTRAL", vcpScore: null, vcpVerdict: null, riskState: null, asOf: null };

function getTrendQuality(symbol) {
  const { bySymbol } = loadState();
  return bySymbol[String(symbol).toUpperCase()] || UNSCORED;
}

function getAllTrendQuality() {
  return loadState().bySymbol;
}

async function tickTrendQuality() {
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };
  const { loadWatchlist } = require("./routes/watchlist");
  const { symbols: allSymbols } = loadWatchlist();
  if (!Array.isArray(allSymbols) || !allSymbols.length) return { ok: true, checked: 0 };

  // Lazy require — src/routes/market.js's route handler lazily requires
  // stores like this too, avoiding a circular require (same pattern
  // lightbox-state-store.js already uses for the same reason).
  let screenTrendTemplate;
  try {
    ({ screenTrendTemplate } = require("./routes/market"));
  } catch {
    return { ok: false, checked: 0 };
  }

  const symbols = allSymbols.slice(0, MAX_SCAN_SYMBOLS);
  const state = loadState();
  const nextBySymbol = { ...state.bySymbol };
  const nowIso = new Date().toISOString();

  let rows;
  try {
    rows = await screenTrendTemplate(symbols);
  } catch {
    return { ok: false, checked: 0 };
  }

  for (const r of rows || []) {
    if (!r || r.error || !r.symbol) continue;
    nextBySymbol[r.symbol] = {
      trendScore: Number.isFinite(r.passCount) ? Math.round((r.passCount / 8) * 100) : null,
      trendLabel: trendLabelFromPassCount(r.passCount),
      vcpScore: r.vcpScore ?? null,
      vcpVerdict: r.vcpVerdict ?? null,
      riskState: r.riskState ?? null,
      asOf: nowIso,
    };
  }

  saveState({ bySymbol: nextBySymbol, updatedAt: nowIso });
  return { ok: true, checked: symbols.length, watchlistSize: allSymbols.length };
}

module.exports = { getTrendQuality, getAllTrendQuality, tickTrendQuality };
