// opportunity-timeline-store.js — real, same-session-only intraday
// snapshot log of a symbol's Opportunity Object over the trading day
// (Market Opportunity Engine Phase 2, 2026-08-26). Deliberately its own
// file, not an extension of mtf-state-store.js — that store's job is
// "current confirmed state per symbol, overwritten each tick, plus a
// capped event-transition log," a genuinely different shape/purpose than
// "every symbol's own real score/tier/EV sampled through today."
//
// This is a real, intentionally scoped-down slice of the spec's
// "Probability Shift"/"Edge Decay" ask — confirmed by a full codebase
// audit (2026-08-26) that NO persisted intraday time-series existed
// anywhere before this file: aplus-score-history.js and
// mtf-outcome-tracker.js are both once-per-day; mtf-state-store.js keeps
// only current state + a capped event log, never regular-interval
// samples. Building a real multi-day "probability acceleration" or
// "edge decay curve" classifier (BUILDING/PEAK/DECAYING) would need
// months of real accumulated history to be honest, not fabricated — this
// file deliberately stops short of that: same-session only, a real
// sparkline of today's actual samples, honestly "not enough data yet"
// early in a session, never extrapolated into a trend claim.
"use strict";

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { etDateStr } = require("./iv-history-store");

const STORE_PATH = path.join(ROOT, "data", "opportunity-timeline.json");
// Throttle, not a schedule — this store has no dedicated background tick
// of its own; it's fed by whichever real caller already has a fresh
// Opportunity Object (the /api/market/opportunities scan route). Capping
// to one real sample per symbol per MIN_GAP_MS keeps the file bounded
// regardless of how often that route gets hit (page loads, refreshes,
// multiple browser tabs) without needing a separate scheduler.
const MIN_GAP_MS = 10 * 60_000;
const MAX_SAMPLES_PER_SYMBOL = 60; // a full 6.5h session at the 10-min floor is ~40 — this is a safety cap, not the expected count

function loadStore() {
  const data = readJsonSafe(STORE_PATH, { date: null, bySymbol: {} });
  const today = etDateStr();
  // Real day rollover — yesterday's samples never bleed into today's
  // timeline; this store answers "how has TODAY gone," not a running
  // multi-day series (that's the explicitly-deferred, separate ask).
  if (data.date !== today) return { date: today, bySymbol: {} };
  return { date: data.date, bySymbol: data.bySymbol || {} };
}
function saveStore(store) { writeJsonAtomic(STORE_PATH, store); }

// Batch recorder — the real /api/market/opportunities route computes up
// to ~100 real Opportunity Objects per request; recording one at a time
// would mean up to 100 separate file read/write round trips per request.
// Loads/saves the store ONCE for the whole batch. `opportunities` is an
// array of real Opportunity Objects (computeOpportunity's own output) —
// never a synthetic/backfilled entry.
function recordOpportunitySnapshots(opportunities) {
  if (!Array.isArray(opportunities) || !opportunities.length) return;
  const store = loadStore();
  const now = Date.now();
  let changed = false;
  for (const opp of opportunities) {
    if (!opp?.symbol || opp.score == null) continue;
    const list = store.bySymbol[opp.symbol] || [];
    const last = list[list.length - 1];
    if (last && now - last.ts < MIN_GAP_MS) continue; // real throttle — not enough real time has passed
    list.push({ ts: now, score: opp.score, tier: opp.tier || null, expectedValue: opp.expectedValue ?? null });
    if (list.length > MAX_SAMPLES_PER_SYMBOL) list.shift();
    store.bySymbol[opp.symbol] = list;
    changed = true;
  }
  if (changed) saveStore(store);
}

// Real, honest read — today's real accumulated samples for one symbol,
// oldest first. Empty array (never a fabricated point) when nothing real
// has been recorded yet today.
function getTodayTimeline(symbol) {
  const store = loadStore();
  return store.bySymbol[symbol] || [];
}

module.exports = {
  recordOpportunitySnapshots, getTodayTimeline, MIN_GAP_MS, MAX_SAMPLES_PER_SYMBOL,
  loadStore, saveStore, // exposed for test snapshot/restore, same discipline as mtf-outcome-tracker.js's loadEvents/saveEvents
};
