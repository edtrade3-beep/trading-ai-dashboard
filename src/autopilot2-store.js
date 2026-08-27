// autopilot2-store.js — ADOL22 Autopilot 2.0 Phase 1: the primary
// OFF/RUNNING/PAUSED/SAFE_MODE state (spec §31). Deliberately does NOT
// implement a second kill switch — EMERGENCY STOP defers entirely to the
// app's existing shared src/emergency-stop.js, the same one every other
// autopilot in this app already honors, so one Emergency Stop halts all
// of them, not just this one. autopilot2-engine.js treats an active
// global Emergency Stop as an independent, always-checked guard regardless
// of what state this store reports.
"use strict";
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STATE_PATH = path.join(ROOT, "data", "autopilot2-state.json");
const ACTIVITY_PATH = path.join(ROOT, "data", "autopilot2-activity.json");
const MAX_ACTIVITY = 300;

const VALID_STATES = ["OFF", "RUNNING", "PAUSED", "SAFE_MODE"];

function freshState() {
  return { state: "OFF", reason: null, updatedAt: new Date().toISOString() };
}

function loadState() {
  const s = readJsonSafe(STATE_PATH, null);
  return s && VALID_STATES.includes(s.state) ? s : freshState();
}

function setState(state, reason = null) {
  if (!VALID_STATES.includes(state)) throw new Error(`invalid autopilot2 state: ${state}`);
  const s = { state, reason, updatedAt: new Date().toISOString() };
  writeJsonAtomic(STATE_PATH, s);
  return s;
}

// Real, append-only activity feed for the Command Center (spec §30's
// "AUTOPILOT ACTIVITY" strip) — same capped-length JSON log pattern
// autopilot-journal.js already uses. Every real decision the engine makes
// (enter/reject/exit/partial/safe-mode) gets one entry here, including
// real rejections — "no trade" is a logged, disclosed outcome, never a
// silent no-op (spec §25).
function appendActivity(entry) {
  const log = readJsonSafe(ACTIVITY_PATH, { entries: [] });
  const entries = Array.isArray(log.entries) ? log.entries : [];
  entries.push({ ts: new Date().toISOString(), ...entry });
  writeJsonAtomic(ACTIVITY_PATH, { entries: entries.slice(-MAX_ACTIVITY) });
}

function recentActivity(limit = 50) {
  const log = readJsonSafe(ACTIVITY_PATH, { entries: [] });
  const entries = Array.isArray(log.entries) ? log.entries : [];
  return entries.slice(-limit).reverse();
}

module.exports = { VALID_STATES, loadState, setState, appendActivity, recentActivity };
