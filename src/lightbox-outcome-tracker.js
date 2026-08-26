"use strict";

// lightbox-outcome-tracker.js — real day-trade outcome tracking for Light
// Box (Market Opportunity Intelligence Engine upgrade, 2026-08-26). Same
// real "log now, compare against real future data later, never fabricate
// a gap" discipline as mtf-outcome-tracker.js — this IS that same proven
// pattern, adapted for Light Box's own real cadence: bar-count horizons
// on real 15-minute bars instead of calendar-day horizons on daily bars,
// and direction-aware (a real BEARISH/SELL signal's "win" is a real price
// DECLINE, not a rise — day-trade-calc.js's own signal can be direction-
// aware, so this tracker has to be too).
//
// This is the one piece of the Light Box spec's "EV Engine"/"Historical
// Engine" with no existing precedent anywhere in the codebase — real win-
// rate/EV for Light Box's own signals is honestly INSUFFICIENT DATA until
// this store accumulates enough real completed outcomes, exactly like
// every other probability surface in this app.

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "lightbox-outcomes.json");
const MAX_EVENTS = 1000; // ring buffer — comfortably covers real months of confirmed BUY/SELL transitions across a rotating universe

// Real bar-count horizons on 15m bars: 4=~1h, 8=~2h, 16=~4h, 26=~1 full
// regular session (6.5h @ 15m). Chosen to match this app's own real
// CONTEXT timeframes (1H/4H) plus a same-day close-out horizon, not
// arbitrary round numbers.
const HORIZONS = [4, 8, 16, 26];
const MIN_WIN_SAMPLE = 10; // same real sample-size floor institutional-scoring.js's winProbFor already uses

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

function loadEvents() {
  const data = readJsonSafe(STORE_PATH, { events: [] });
  return Array.isArray(data.events) ? data.events : [];
}
function saveEvents(events) {
  writeJsonAtomic(STORE_PATH, { events: events.slice(-MAX_EVENTS) });
}

// Called from lightbox-state-store.js's tick exactly on a real transition
// INTO a confirmed BUY or SELL (SIGNAL_TO_STATE "BUY"/"SELL") — the
// transition itself (stepped.confirmed !== prev.confirmed) is already the
// real dedup: this never re-logs the same sustained signal on every tick
// it persists, only the genuine state change. `direction` is
// computeDayTradeSignal's own real BULLISH/BEARISH read.
function recordEvent({ symbol, toState, price, stop, target, quality, grade, direction, rr, entryTriggerStatus }) {
  if (toState !== "BUY" && toState !== "SELL") return;
  if (!Number.isFinite(price) || price <= 0) return;
  const events = loadEvents();
  events.push({
    symbol, toState, direction: direction || null, ts: new Date().toISOString(),
    entryPrice: round2(price), stop: Number.isFinite(stop) ? stop : null, target: Number.isFinite(target) ? target : null,
    quality: quality ?? null, grade: grade ?? null, rr: rr ?? null, entryTriggerStatus: entryTriggerStatus ?? null,
    outcomes: {}, // filled in later by trackOutcomes() — honestly empty until then, never backfilled/guessed
  });
  saveEvents(events);
}

// Real forward-tracking tick — fetches real 15m bars since entry and
// computes real return/MFE/MAE/stop-hit/target-hit per horizon, direction-
// aware (a BEARISH event's "favorable" direction is a real price decline).
// An event younger than a given horizon's real bar count simply doesn't
// get that horizon's outcome yet — no lookahead, no estimate.
async function trackOutcomes() {
  const events = loadEvents();
  const maxHorizon = HORIZONS[HORIZONS.length - 1];
  // Real bound: an event whose real entry is more than ~3 real trading
  // days old and still missing outcomes almost certainly hit a real data
  // gap (illiquid symbol, delisted, real fetch repeatedly failing) — stop
  // chasing it rather than retrying forever.
  const pending = events.filter((e) => {
    const ageMs = Date.now() - new Date(e.ts).getTime();
    const doneHorizons = Object.keys(e.outcomes || {}).length;
    return doneHorizons < HORIZONS.length && ageMs <= 3 * 24 * 60 * 60_000;
  });
  if (!pending.length) return { ok: true, tracked: 0, pending: 0 };

  const { fetchAlpacaBars } = require("./providers/alpaca-data");
  let tracked = 0;
  for (const e of pending) {
    try {
      const bars = await fetchAlpacaBars(e.symbol, "5d", "15m");
      if (!Array.isArray(bars) || !bars.length) continue;
      const entryTime = new Date(e.ts).getTime();
      const afterEntry = bars.filter((b) => Number.isFinite(b.time) && b.time >= entryTime);
      if (!afterEntry.length) continue;

      const sign = e.direction === "BEARISH" ? -1 : 1;
      const outcomes = { ...(e.outcomes || {}) };
      let changed = false;
      for (const h of HORIZONS) {
        if (afterEntry.length < h || outcomes[`b${h}`]) continue;
        const windowBars = afterEntry.slice(0, h);
        const lastClose = windowBars[windowBars.length - 1].close;
        const highs = windowBars.map((b) => b.high);
        const lows = windowBars.map((b) => b.low);
        // Direction-aware: favorableExtreme is the real best-case move
        // (up for BULLISH, down for BEARISH); adverseExtreme the worst-case.
        const favorableExtreme = sign > 0 ? Math.max(...highs) : Math.min(...lows);
        const adverseExtreme = sign > 0 ? Math.min(...lows) : Math.max(...highs);
        const returnPct = round2(((lastClose / e.entryPrice - 1) * 100) * sign);
        const mfePct = round2(((favorableExtreme / e.entryPrice - 1) * 100) * sign);
        const maePct = round2(((adverseExtreme / e.entryPrice - 1) * 100) * sign);
        const stopHit = e.stop != null ? (sign > 0 ? Math.min(...lows) <= e.stop : Math.max(...highs) >= e.stop) : null;
        const targetHit = e.target != null ? (sign > 0 ? Math.max(...highs) >= e.target : Math.min(...lows) <= e.target) : null;
        outcomes[`b${h}`] = { returnPct, mfePct, maePct, stopHit, targetHit };
        changed = true;
      }
      if (changed) { e.outcomes = outcomes; tracked++; }
    } catch { /* one symbol's real fetch failure never blocks tracking the rest */ }
  }
  if (tracked) saveEvents(events);
  return { ok: true, tracked, pending: pending.length };
}

// Real win-rate for one horizon — honest null under MIN_WIN_SAMPLE real
// completed outcomes, same floor institutional-scoring.js's winProbFor
// already uses elsewhere in this app. horizonBars must be one of HORIZONS.
function winRateFor(horizonBars) {
  const events = loadEvents();
  const rows = events.filter((e) => e.outcomes?.[`b${horizonBars}`]?.returnPct != null).map((e) => e.outcomes[`b${horizonBars}`]);
  if (rows.length < MIN_WIN_SAMPLE) return { winRate: null, sampleCount: rows.length, insufficientData: true };
  const wins = rows.filter((r) => r.returnPct > 0).length;
  return { winRate: Math.round((wins / rows.length) * 100), sampleCount: rows.length, insufficientData: false };
}

// Real aggregate report, same shape/discipline as mtf-outcome-tracker.js's
// buildOutcomeReport — honest null per horizon with zero real completed
// events, never estimated from a partial sample.
function buildOutcomeReport() {
  const events = loadEvents();
  const report = {};
  for (const h of HORIZONS) {
    const rows = events.filter((e) => e.outcomes?.[`b${h}`]?.returnPct != null).map((e) => e.outcomes[`b${h}`]);
    if (!rows.length) { report[`b${h}`] = null; continue; }
    const avgReturnPct = rows.reduce((s, r) => s + r.returnPct, 0) / rows.length;
    const winRate = Math.round((rows.filter((r) => r.returnPct > 0).length / rows.length) * 100);
    const avgMfePct = rows.reduce((s, r) => s + (r.mfePct || 0), 0) / rows.length;
    const avgMaePct = rows.reduce((s, r) => s + (r.maePct || 0), 0) / rows.length;
    report[`b${h}`] = { count: rows.length, avgReturnPct: round2(avgReturnPct), winRate, avgMfePct: round2(avgMfePct), avgMaePct: round2(avgMaePct) };
  }
  return { totalEvents: events.length, trackingStartedAt: events.length ? events[0].ts : null, report };
}

module.exports = { recordEvent, trackOutcomes, buildOutcomeReport, winRateFor, loadEvents, saveEvents, HORIZONS, MIN_WIN_SAMPLE };
