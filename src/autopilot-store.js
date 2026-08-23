// autopilot-store.js — "AM TRADING — LIGHT BOX + AUTOPILOT" spec (explicit
// user request, 2026-08-19), Phase 7. Persisted mode + per-symbol state
// machine + activity log for the NEW day-trade Autopilot — a separate,
// third system from the existing src/server-autopilot.js (swing,
// currently live in production) and axiom-runner/components/
// AutoPilotEngine.jsx (client-side swing), per the user's explicit choice
// to keep those untouched. Same writeJsonAtomic/readJsonSafe pattern as
// every other store this session.
//
// SAFETY: `mode` defaults to "OFF" and is changed ONLY by an explicit
// setMode() call from a real user action (the API route) — nothing in
// this codebase auto-escalates it. This phase's tick (autopilot-tick.js)
// never calls any order-placing function regardless of mode; ASSIST/
// AUTOPILOT execution is a distinct, separately-planned future phase.
"use strict";

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "autopilot-store.json");
const VALID_MODES = ["OFF", "ALERT", "ASSIST", "AUTOPILOT"];
const MAX_ACTIVITY = 200;

function loadState() {
  const s = readJsonSafe(STORE_PATH, {});
  return {
    mode: VALID_MODES.includes(s.mode) ? s.mode : "OFF",
    positions: s.positions || {},
    activityLog: Array.isArray(s.activityLog) ? s.activityLog : [],
    dailyStats: s.dailyStats || null,
    processedTransitionKeys: Array.isArray(s.processedTransitionKeys) ? s.processedTransitionKeys : [],
    lastFlattenDate: s.lastFlattenDate || null,
  };
}
function saveState(s) {
  writeJsonAtomic(STORE_PATH, s);
}

function getMode() {
  return loadState().mode;
}
function setMode(mode) {
  if (!VALID_MODES.includes(mode)) throw new Error(`invalid autopilot mode: ${mode}`);
  const state = loadState();
  state.mode = mode;
  saveState(state);
  return state.mode;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
function getStatus() {
  const state = loadState();
  const today = todayKey();
  const dailyStats = state.dailyStats && state.dailyStats.date === today
    ? state.dailyStats
    : { date: today, trades: 0, pl: 0, riskUsedPct: 0 };
  return { mode: state.mode, positions: state.positions, activityLog: state.activityLog.slice(0, 100), dailyStats };
}

// Real daily trade counter (2026-08-23) — was always 0 forever before
// real ASSIST order execution existed (nothing ever incremented it).
// Bumped once per real order lightbox-autopilot-execute.js places. `pl`
// stays honestly 0 here — this app doesn't yet track real-time fills/
// closes for these orders, so realized P/L isn't computed; showing a
// nonzero trade count with $0 P/L on an still-open position is accurate,
// not misleading.
function incrementDailyTrades() {
  const state = loadState();
  const today = todayKey();
  const dailyStats = state.dailyStats && state.dailyStats.date === today
    ? state.dailyStats
    : { date: today, trades: 0, pl: 0, riskUsedPct: 0 };
  dailyStats.trades += 1;
  state.dailyStats = dailyStats;
  saveState(state);
  return dailyStats;
}

function getPosition(symbol) {
  return loadState().positions[symbol] || null;
}
function upsertPosition(symbol, patch) {
  const state = loadState();
  state.positions[symbol] = { ...(state.positions[symbol] || {}), ...patch, symbol, updatedAt: new Date().toISOString() };
  saveState(state);
  return state.positions[symbol];
}

function logActivity(entry) {
  const state = loadState();
  state.activityLog = [{ ts: new Date().toISOString(), ...entry }, ...state.activityLog].slice(0, MAX_ACTIVITY);
  saveState(state);
}

// Dedup guard so autopilot-tick.js never reprocesses the same real
// lightbox-state-store transition twice (each transition has a real,
// unique ts+symbol+to) — same "diff against what's already been seen"
// discipline as watchlist-daytrade-alerts.js.
function hasProcessedTransition(key) {
  return loadState().processedTransitionKeys.includes(key);
}
function markTransitionProcessed(key) {
  const state = loadState();
  state.processedTransitionKeys = [key, ...state.processedTransitionKeys].slice(0, 500);
  saveState(state);
}

// Real ET-date guard so the end-of-day flatten (lightbox-autopilot-
// execute.js's maybeFlattenEndOfDay) fires at most once per real trading
// day even though it's checked every 90s tick across a ~20min window —
// same "persisted date guard" pattern weekAnchorET's callers already use.
function getLastFlattenDate() {
  return loadState().lastFlattenDate;
}
function setLastFlattenDate(dateStr) {
  const state = loadState();
  state.lastFlattenDate = dateStr;
  saveState(state);
}

module.exports = {
  VALID_MODES, getMode, setMode, getStatus, getPosition, upsertPosition, logActivity,
  hasProcessedTransition, markTransitionProcessed, getLastFlattenDate, setLastFlattenDate,
  incrementDailyTrades,
};
