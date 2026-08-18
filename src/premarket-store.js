// premarket-store.js — "AM Trading — Final Trading Logic Redesign" spec,
// Phase 4 (explicit user request, 2026-08-19): §4-6's Premarket Engine.
// Same real persisted-cache pattern as trend-quality-store.js/lightbox-
// state-store.js — a background tick computes real scores, the route
// just reads the last persisted result.
//
// Real inputs only: gap% from Yahoo's real preMarketPrice vs real
// regularMarketPreviousClose (same formula src/premarket-alerts.js
// already uses and has run in production), an explicitly-approximate
// RVOL proxy (regularMarketVolume/averageDailyVolume3Month — NOT true
// premarket-session volume, same honest limitation as that file), and a
// real per-symbol news lookup (fetchGoogleNews) for symbols that are
// actually gapping — not the whole watchlist, to keep this a bounded,
// real fan-out rather than a per-tick burst across everything.
"use strict";

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { computePremarketScore } = require("./premarket-engine");

const STORE_PATH = path.join(ROOT, "data", "premarket-cache.json");
const GAP_THRESHOLD_PCT = 1; // only symbols gapping at least this much get a real news lookup
const MAX_NEWS_LOOKUPS = 25; // real fan-out cap per tick — bounded even on a big gap day

function nowET() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}
// Premarket data is only real/meaningful before the regular session opens.
// 7:00 ET matches premarket-alerts.js's own real finding ("7:00 AM removed:
// too early, most traders aren't watching yet") — but for a live-refreshing
// cache (not a one-shot alert), starting the tick then still gives the
// score time to develop before 9:30, rather than only firing once right
// at the open.
function isPremarketHoursET() {
  const et = nowET();
  const day = et.getDay(); if (day < 1 || day > 5) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 7 * 60 && mins < 9 * 60 + 35;
}

function loadState() {
  const s = readJsonSafe(STORE_PATH, {});
  return { bySymbol: s.bySymbol || {}, updatedAt: s.updatedAt || null };
}
function saveState(s) {
  writeJsonAtomic(STORE_PATH, s);
}

function getPremarketRow(symbol) {
  return loadState().bySymbol[String(symbol).toUpperCase()] || null;
}
function getAllPremarket() {
  return loadState();
}

async function tickPremarket() {
  if (!isPremarketHoursET()) return { ok: true, skipped: "outside premarket hours" };
  const { loadWatchlist } = require("./routes/watchlist");
  const { symbols: allSymbols } = loadWatchlist();
  if (!Array.isArray(allSymbols) || !allSymbols.length) return { ok: true, checked: 0 };

  const { fetchYahooQuoteBatch } = require("./providers/yahoo");
  const { etfOf } = require("./sector-theme-map");

  const sectorEtfs = [...new Set(allSymbols.map((s) => etfOf(s)).filter(Boolean))];
  let quotes;
  try {
    quotes = await fetchYahooQuoteBatch([...allSymbols, "SPY", ...sectorEtfs]);
  } catch {
    return { ok: false, checked: 0 };
  }
  const bySym = new Map((quotes || []).map((q) => [String(q.symbol || "").toUpperCase(), q]));

  const spyQ = bySym.get("SPY");
  const spyChg = spyQ ? Number(spyQ.preMarketChangePercent || spyQ.regularMarketChangePercent || 0) : null;

  const computed = [];
  for (const sym of allSymbols) {
    const q = bySym.get(sym);
    if (!q) continue;
    const prevClose = Number(q.regularMarketPreviousClose || 0);
    const prePrice = Number(q.preMarketPrice || 0);
    const openPrice = Number(q.regularMarketOpen || q.regularMarketPrice || 0);
    const refPrice = prePrice > 0 ? prePrice : openPrice;
    if (!(prevClose > 0) || !(refPrice > 0)) continue; // no real data to score honestly
    const gapPct = Math.round(((refPrice - prevClose) / prevClose) * 10000) / 100;
    const vol = Number(q.regularMarketVolume || 0);
    const avgVol = Number(q.averageDailyVolume3Month || q.averageDailyVolume10Day || 0);
    const rvolApprox = avgVol > 0 ? Math.round((vol / avgVol) * 100) / 100 : null;
    const sectorEtf = etfOf(sym);
    const sectorQ = sectorEtf ? bySym.get(sectorEtf) : null;
    const sectorChg = sectorQ ? Number(sectorQ.preMarketChangePercent || sectorQ.regularMarketChangePercent || 0) : null;
    computed.push({ symbol: sym, gapPct, price: refPrice, prevClose, rvolApprox, sectorChg, hasPreMkt: prePrice > 0 });
  }

  // Real news lookup only for symbols actually gapping — bounded fan-out,
  // not a per-tick burst across the whole watchlist.
  const gappers = computed.filter((r) => Math.abs(r.gapPct) >= GAP_THRESHOLD_PCT).slice(0, MAX_NEWS_LOOKUPS);
  const newsBySym = new Map();
  if (gappers.length) {
    const { fetchGoogleNews } = require("./providers/googlenews");
    const results = await Promise.allSettled(gappers.map((r) => fetchGoogleNews(r.symbol, 1)));
    gappers.forEach((r, i) => {
      const res = results[i];
      newsBySym.set(r.symbol, res.status === "fulfilled" && Array.isArray(res.value) && res.value.length > 0);
    });
  }

  const nowIso = new Date().toISOString();
  const state = loadState();
  const nextBySymbol = { ...state.bySymbol };
  for (const r of computed) {
    const hasNews = newsBySym.has(r.symbol) ? newsBySym.get(r.symbol) : null; // null = lookup not run (real gap too small to bother)
    const { score, state: pmState, coverage } = computePremarketScore({
      gapPct: r.gapPct, rvolApprox: r.rvolApprox, hasNews, spyChg, sectorChg: r.sectorChg,
    });
    nextBySymbol[r.symbol] = {
      gapPct: r.gapPct, price: r.price, prevClose: r.prevClose, rvolApprox: r.rvolApprox,
      hasNews, hasPreMkt: r.hasPreMkt, score, state: pmState, coverage, asOf: nowIso,
    };
  }

  saveState({ bySymbol: nextBySymbol, updatedAt: nowIso });
  return { ok: true, checked: computed.length, newsLookups: gappers.length, watchlistSize: allSymbols.length };
}

module.exports = { getPremarketRow, getAllPremarket, tickPremarket, isPremarketHoursET };
