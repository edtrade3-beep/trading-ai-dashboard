"use strict";

// mtf-outcome-tracker.js — Trade Outcome Feedback Engine, MTF Decision
// System Phase 7 (2026-08-20). Same real "log now, compare against real
// current data later, never fabricate a gap" discipline as
// aplus-score-history.js's already-proven forward-return tracker — this
// isn't a rebuild of that mechanism, it's the same pattern adapted for
// what the spec actually asks for here: EVENT-triggered logging (every
// real EARLY/START confirmation, not once a day) with richer per-event
// tracking (MFE/MAE, stop/target-hit) than that file's simple forward-%
// bucketing.
//
// This is explicitly the DATA COLLECTION half of the spec's "Trade
// Outcome Feedback Engine" + "Backtesting" sections. A real historical-
// regime backtest (bull/bear/sideways, bulk replay across years of past
// data) is a genuinely separate, much larger effort — this file gives it
// real data to eventually run against, but does not itself replay
// history. Flagged, not silently skipped.

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "mtf-outcomes.json");
const MAX_EVENTS = 1000; // ring buffer — comfortably covers a real year+ of EARLY/START events across a rotating watchlist
const HORIZONS = [1, 3, 5, 10];

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

function loadEvents() {
  const data = readJsonSafe(STORE_PATH, { events: [] });
  return Array.isArray(data.events) ? data.events : [];
}
function saveEvents(events) {
  writeJsonAtomic(STORE_PATH, { events: events.slice(-MAX_EVENTS) });
}

// Called from mtf-state-store.js's tick on every real EARLY/START
// transition. Once per (symbol, toState) per real calendar day — a
// symbol flapping EARLY->WATCH->EARLY the same day doesn't re-log, same
// "one entry per real day" discipline aplus-score-history.js already
// uses for its own daily snapshot.
function recordEvent({ symbol, toState, price, ev, gate, atrLevels, antiChase }) {
  if (toState !== "EARLY" && toState !== "START") return; // only these two per the spec
  if (!Number.isFinite(price) || price <= 0) return;
  const today = new Date().toISOString().slice(0, 10);
  const events = loadEvents();
  const dup = events.some((e) => e.symbol === symbol && e.toState === toState && e.loggedDate === today);
  if (dup) return;
  events.push({
    symbol, toState, ts: new Date().toISOString(), loggedDate: today,
    entryPrice: round2(price),
    quality: ev?.quality ?? null, swingState: ev?.swingState ?? null, earlyScore: ev?.earlyScore ?? null,
    entryAction: ev?.entryAction ?? null, exitRiskState: ev?.exitRiskState ?? null, dailyBias: ev?.dailyBias ?? null,
    rsRating: ev?.rsRating ?? null, rr: ev?.rr ?? null,
    gatePass: gate?.pass ?? null,
    stop: atrLevels?.stop ?? null, target1: atrLevels?.target1 ?? null, target2: atrLevels?.target2 ?? null,
    antiChaseBand: antiChase?.band ?? null,
    outcomes: {}, // filled in later by trackOutcomes() — honestly empty until then, never backfilled/guessed
  });
  saveEvents(events);
}

// Real forward-tracking tick — for every logged event with enough real
// elapsed calendar time, fetches real daily bars since entry and computes
// real MFE/MAE/return/stop-hit/target-hit per horizon. An event younger
// than a given horizon simply doesn't get that horizon's outcome yet.
async function trackOutcomes() {
  const events = loadEvents();
  const maxHorizon = HORIZONS[HORIZONS.length - 1];
  const pending = events.filter((e) => {
    const ageDays = (Date.now() - new Date(e.ts).getTime()) / 86400000;
    const doneHorizons = Object.keys(e.outcomes || {}).length;
    return ageDays >= 1 && doneHorizons < HORIZONS.length && ageDays <= maxHorizon + 5; // stop chasing an event that's aged well past every horizon with gaps (illiquid/delisted symbol) — real, bounded effort
  });
  if (!pending.length) return { ok: true, tracked: 0, pending: 0 };

  const { fetchYahooBars } = require("./providers/yahoo");
  let tracked = 0;
  for (const e of pending) {
    try {
      const bars = await fetchYahooBars(e.symbol, "1mo", "1d");
      if (!Array.isArray(bars) || !bars.length) continue;
      const entryTime = new Date(e.ts).getTime();
      const afterEntry = bars.filter((b) => Number.isFinite(b.time) && b.time >= entryTime);
      if (!afterEntry.length) continue;

      const ageDays = (Date.now() - entryTime) / 86400000;
      const outcomes = { ...(e.outcomes || {}) };
      let changed = false;
      for (const h of HORIZONS) {
        if (ageDays < h || outcomes[`d${h}`]) continue;
        const windowBars = afterEntry.slice(0, h);
        if (windowBars.length < h) continue; // not enough real trading days yet — honest skip, not an estimate
        const lastClose = windowBars[windowBars.length - 1].close;
        const highs = windowBars.map((b) => b.high);
        const lows = windowBars.map((b) => b.low);
        const mfePct = round2((Math.max(...highs) / e.entryPrice - 1) * 100);
        const maePct = round2((Math.min(...lows) / e.entryPrice - 1) * 100);
        const returnPct = round2((lastClose / e.entryPrice - 1) * 100);
        const stopHit = e.stop != null ? Math.min(...lows) <= e.stop : null;
        const target1Hit = e.target1 != null ? Math.max(...highs) >= e.target1 : null;
        outcomes[`d${h}`] = { returnPct, mfePct, maePct, stopHit, target1Hit };
        changed = true;
      }
      if (changed) { e.outcomes = outcomes; tracked++; }
    } catch { /* one symbol's real fetch failure never blocks tracking the rest */ }
  }
  if (tracked) saveEvents(events);
  return { ok: true, tracked, pending: pending.length };
}

// Real aggregate report — win rate/avg return/MFE/MAE/stop-hit/target-hit
// per horizon per toState (EARLY vs START), off whatever real outcomes
// have actually accumulated. Honest null for a horizon/state with zero
// real completed events yet — never estimated from a partial sample.
function buildOutcomeReport() {
  const events = loadEvents();
  const STATES = ["EARLY", "START"];
  const report = {};
  for (const state of STATES) {
    report[state] = {};
    for (const h of HORIZONS) {
      const rows = events.filter((e) => e.toState === state && e.outcomes?.[`d${h}`]?.returnPct != null).map((e) => e.outcomes[`d${h}`]);
      if (!rows.length) { report[state][`d${h}`] = null; continue; }
      const avgReturnPct = rows.reduce((s, r) => s + r.returnPct, 0) / rows.length;
      const winRate = Math.round((rows.filter((r) => r.returnPct > 0).length / rows.length) * 100);
      const avgMfePct = rows.reduce((s, r) => s + (r.mfePct || 0), 0) / rows.length;
      const avgMaePct = rows.reduce((s, r) => s + (r.maePct || 0), 0) / rows.length;
      const withStop = rows.filter((r) => r.stopHit != null);
      const withTarget = rows.filter((r) => r.target1Hit != null);
      report[state][`d${h}`] = {
        count: rows.length, avgReturnPct: round2(avgReturnPct), winRate,
        avgMfePct: round2(avgMfePct), avgMaePct: round2(avgMaePct),
        stopHitRate: withStop.length ? Math.round((withStop.filter((r) => r.stopHit).length / withStop.length) * 100) : null,
        target1HitRate: withTarget.length ? Math.round((withTarget.filter((r) => r.target1Hit).length / withTarget.length) * 100) : null,
      };
    }
  }
  return { totalEvents: events.length, trackingStartedAt: events.length ? events[0].ts : null, report };
}

module.exports = { recordEvent, trackOutcomes, buildOutcomeReport, loadEvents, saveEvents };
