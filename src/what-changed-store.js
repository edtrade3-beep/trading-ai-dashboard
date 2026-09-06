"use strict";

// what-changed-store.js — day-scoped persistence for the global What
// Changed engine (see what-changed-engine.js for the real diff math). Same
// storage shape/discipline as opportunity-timeline-store.js: one real
// snapshot recorded per caller tick (fed by /api/market/opportunities, no
// dedicated schedule of its own), a real day-open baseline captured once
// and kept until real ET-date rollover, honest nulls (never a fabricated
// "no change") until at least one/two real snapshots exist today.

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { etDateStr } = require("./iv-history-store");
const { diffGlobalSnapshots } = require("./what-changed-engine");

const STORE_PATH = path.join(ROOT, "data", "what-changed.json");

const EMPTY = () => ({ date: null, openSnapshot: null, openAt: null, lastSnapshot: null, lastAt: null, lastResult: null });

function loadStore() {
  const data = readJsonSafe(STORE_PATH, EMPTY());
  const today = etDateStr();
  // Real day rollover — yesterday's open/last snapshots never bleed into
  // today's "since open" baseline.
  if (data.date !== today) return { ...EMPTY(), date: today };
  return data;
}
function saveStore(store) { writeJsonAtomic(STORE_PATH, store); }

// Records one real global snapshot (see buildGlobalSnapshot) and returns
// the real diff against today's open snapshot and against the immediately
// prior one. `sinceOpen`/`sinceLastRefresh` are honestly null on the first
// call of the day (nothing real to compare against yet) — same discipline
// as command-center-ai.js's own buildWhatChanged.
function recordAndDiff(snapshot) {
  const store = loadStore();
  const now = Date.now();
  const priorOpen = store.openSnapshot;
  const priorLast = store.lastSnapshot;
  const priorLastAt = store.lastAt;

  if (!priorOpen) {
    store.openSnapshot = snapshot;
    store.openAt = now;
  }
  store.lastSnapshot = snapshot;
  store.lastAt = now;

  const result = {
    sinceOpen: priorOpen ? diffGlobalSnapshots(priorOpen, snapshot) : null,
    sinceOpenAt: store.openAt,
    sinceLastRefresh: priorLast ? diffGlobalSnapshots(priorLast, snapshot) : null,
    sinceLastRefreshAt: priorLastAt || null,
    computedAt: now,
  };
  store.lastResult = result;
  saveStore(store);
  return result;
}

// Cheap, synchronous read for the GET route — returns whatever the most
// recent real /api/market/opportunities scan already recorded, never
// recomputes. Honest null when nothing has been recorded yet today.
function getLastWhatChanged() {
  return loadStore().lastResult || null;
}

module.exports = { recordAndDiff, getLastWhatChanged, loadStore, saveStore };
