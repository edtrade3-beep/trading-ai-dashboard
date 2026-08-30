// opportunity-snapshot-store.js — "What Changed?" (Trade Desk redesign
// Phase 2, spec §20: "Every scan should compare the latest reading with
// the previous reading"). Persists each symbol's last-seen real Core
// Score/verdict/breakdown (am-core-engine.js's own computeCoreScore
// output, already flowing through opportunity-engine.js's computeOpportunity
// — no new scoring here, just a real diff against a real prior reading).
// Same writeJsonAtomic/readJsonSafe KV-file convention as
// market-context-alerts.js/autopilot2-store.js — no database, no new
// background job; this store is written on read, the same "persist on
// every real request" pattern lightbox-state-store.js's own tick already
// established, just request-triggered here instead of interval-triggered.
"use strict";
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "opportunity-snapshots.json");
// Real minimum age before a stored reading counts as a genuine "previous"
// reading to diff against — without this, reloading the same page twice in
// a row would report a fabricated "change" of exactly 0, or worse, a real
// tiny float-rounding blip. 5 minutes matches this app's own established
// "how often does a real re-scan actually happen" cadence (Autopilot 2.0's
// own tick interval, Market Context's own cache window).
const MIN_AGE_MS = 5 * 60_000;
// Real disclosed cap on how many symbols this store remembers — a user
// only ever deep-dives a handful of symbols per session; oldest-by-
// last-seen entries are pruned first, never the just-recorded one.
const MAX_ENTRIES = 500;

function loadStore() {
  const data = readJsonSafe(STORE_PATH, { bySymbol: {} });
  return data && typeof data.bySymbol === "object" && data.bySymbol ? data.bySymbol : {};
}
function saveStore(bySymbol) {
  writeJsonAtomic(STORE_PATH, { bySymbol });
}

// diffBreakdown — the single real sub-score bucket that moved the most
// between two real computeCoreScore breakdowns (am-core-engine.js's own
// 11 named buckets). Honest null when either side is missing, or when
// every bucket's real movement is negligible (<0.05 pts) — never forced.
function diffBreakdown(prevBreakdown, currentBreakdown) {
  if (!prevBreakdown || !currentBreakdown) return null;
  let biggest = null;
  for (const key of Object.keys(currentBreakdown)) {
    const p = Number(prevBreakdown[key]), c = Number(currentBreakdown[key]);
    if (!Number.isFinite(p) || !Number.isFinite(c)) continue;
    const delta = Math.round((c - p) * 10) / 10;
    if (Math.abs(delta) < 0.05) continue;
    if (!biggest || Math.abs(delta) > Math.abs(biggest.delta)) biggest = { bucket: key, delta };
  }
  return biggest;
}

// Pure core — given the current in-memory store map, one symbol's current
// real reading, and "now", returns the real diff (or null, when there's no
// real prior reading old enough to compare against) plus the updated store
// map to persist. Kept pure/synchronous so it's directly testable with
// synthetic inputs, same convention as this session's other engines.
function diffAgainstStore(bySymbol, symbol, current, now) {
  const prev = bySymbol[symbol] || null;
  let diff = null;
  if (prev && Number.isFinite(prev.ts) && (now - prev.ts) >= MIN_AGE_MS) {
    const scoreChange = Number.isFinite(current.score) && Number.isFinite(prev.score)
      ? Math.round((current.score - prev.score) * 10) / 10 : null;
    const verdictChanged = !!(prev.verdict && current.verdict && prev.verdict !== current.verdict);
    diff = {
      previousScore: prev.score ?? null,
      previousVerdict: prev.verdict ?? null,
      scoreChange,
      verdictChanged,
      ageMinutes: Math.round((now - prev.ts) / 60000),
      biggestMover: diffBreakdown(prev.breakdown, current.breakdown),
    };
  }
  const entries = Object.entries(bySymbol).filter(([k]) => k !== symbol);
  entries.push([symbol, { score: current.score ?? null, verdict: current.verdict ?? null, breakdown: current.breakdown ?? null, ts: now }]);
  entries.sort((a, b) => b[1].ts - a[1].ts); // most-recently-seen first
  const updated = Object.fromEntries(entries.slice(0, MAX_ENTRIES));
  return { diff, updated };
}

// Impure batch wrapper — ONE real file read + ONE real file write
// regardless of how many symbols are in `readings` (a single-request
// caller passing 100+ symbols would otherwise mean 100+ synchronous file
// I/O round-trips; batching matches the real "one route, one write"
// discipline the rest of this app's KV stores already use).
function checkAndRecordSnapshots(readings) {
  let bySymbol = loadStore();
  const now = Date.now();
  const diffs = new Map();
  for (const r of readings) {
    const { diff, updated } = diffAgainstStore(bySymbol, r.symbol, r, now);
    diffs.set(r.symbol, diff);
    bySymbol = updated;
  }
  saveStore(bySymbol);
  return diffs;
}

module.exports = { diffAgainstStore, diffBreakdown, checkAndRecordSnapshots, MIN_AGE_MS, MAX_ENTRIES };
