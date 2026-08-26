// lightbox-timeline-store.js — real, same-day intraday quality-score
// history per Light Box symbol (Market Opportunity Intelligence Engine
// upgrade, 2026-08-26). Direct sibling of opportunity-timeline-store.js
// but tuned to Light Box's own real cadence: fed by exactly ONE real
// source (lightbox-state-store.js's tickLightBox(), already rate-limited
// to once per 5 real minutes) rather than opportunity-timeline-store.js's
// many ad-hoc HTTP callers — so this store needs a much smaller throttle
// (just enough to reject an accidental double-call within the same tick,
// not to self-rate-limit many callers).
//
// Deliberately reuses opportunity-timeline-store.js's own computeEdgeVelocity
// classifier UNCHANGED — the math (rate-of-change + consistency check
// over real samples) is genuinely timeframe-agnostic; only the sampling
// cadence differs, which is why this is a separate store rather than a
// config change to that one.
"use strict";

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { etDateStr } = require("./iv-history-store");
const { computeEdgeVelocity } = require("./opportunity-timeline-store");

const STORE_PATH = path.join(ROOT, "data", "lightbox-timeline.json");
// Just under the real 5-min tick interval — rejects an accidental
// duplicate call within the same tick, never throttles a genuine new tick.
const MIN_GAP_MS = 4 * 60_000;
// Real Light Box hours are 4 AM-8 PM ET (16h). At one sample per 5-min
// tick that's up to 192/day if a symbol were scanned every single tick;
// MAX_SCAN_SYMBOLS rotation means most symbols see far fewer real
// samples than that in practice — 100 is a safety cap, not the expected
// count, same convention opportunity-timeline-store.js's own cap uses.
const MAX_SAMPLES_PER_SYMBOL = 100;

function loadStore() {
  const data = readJsonSafe(STORE_PATH, { date: null, bySymbol: {} });
  const today = etDateStr();
  // Real day rollover — same-day-only, same honest scope as
  // opportunity-timeline-store.js: this answers "how has TODAY gone,"
  // never a fabricated running multi-day series.
  if (data.date !== today) return { date: today, bySymbol: {} };
  return { date: data.date, bySymbol: data.bySymbol || {} };
}
function saveStore(store) { writeJsonAtomic(STORE_PATH, store); }

// Batch recorder — one real tick can touch up to 80 real symbols;
// loads/saves the store once for the whole batch, same real reasoning
// opportunity-timeline-store.js's own recordOpportunitySnapshots uses.
// `rows` is an array of real computeDayTradeSignal outputs (or anything
// with real {symbol, quality}) — never a synthetic/backfilled entry.
function recordQualitySnapshots(rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  const store = loadStore();
  const now = Date.now();
  let changed = false;
  for (const r of rows) {
    if (!r?.symbol || r.quality == null) continue;
    const list = store.bySymbol[r.symbol] || [];
    const last = list[list.length - 1];
    if (last && now - last.ts < MIN_GAP_MS) continue;
    list.push({ ts: now, score: r.quality });
    if (list.length > MAX_SAMPLES_PER_SYMBOL) list.shift();
    store.bySymbol[r.symbol] = list;
    changed = true;
  }
  if (changed) saveStore(store);
}

// Real, honest read — today's real accumulated samples for one symbol,
// oldest first. Empty array (never fabricated) when nothing real has
// been recorded yet today.
function getTodayTimeline(symbol) {
  const store = loadStore();
  return store.bySymbol[symbol] || [];
}

function getEdgeVelocityFor(symbol) {
  return computeEdgeVelocity(getTodayTimeline(symbol));
}

module.exports = {
  recordQualitySnapshots, getTodayTimeline, getEdgeVelocityFor,
  MIN_GAP_MS, MAX_SAMPLES_PER_SYMBOL,
  loadStore, saveStore, // exposed for test snapshot/restore
};
