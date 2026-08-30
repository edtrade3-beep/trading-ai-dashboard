// car-business-store.js — rolling daily snapshots for the Car Business
// Intelligence layer (2026-08-30), so today's generation can diff against
// yesterday's ("NEW / STRENGTHENED / WEAKENED / INVALIDATED / UNCHANGED")
// instead of resetting to a blank slate. Same atomic-write/readJsonSafe
// pattern as research-intel-store.js/command-center-history-store.js —
// deliberately copied, not imported, since each of these three stores has
// its own real "what's the prior entry" cadence (this one: once/day after
// 6pm ET, per the user's own explicit operating-schedule request, plus an
// occasional manual refresh).
"use strict";

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "car-business-history.json");
const MAX_ENTRIES = 120; // ~4 months of daily snapshots

const etDateStr = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

function loadHistory() {
  const data = readJsonSafe(STORE_PATH, { entries: [] });
  return Array.isArray(data.entries) ? data.entries : [];
}

function getMostRecentEntry() {
  const entries = loadHistory();
  return entries.length ? entries[entries.length - 1] : null;
}

function appendSnapshot(snapshot) {
  const entries = loadHistory();
  entries.push({ ...snapshot, date: etDateStr(), at: new Date().toISOString() });
  const trimmed = entries.slice(-MAX_ENTRIES);
  writeJsonAtomic(STORE_PATH, { entries: trimmed });
  return trimmed;
}

module.exports = { loadHistory, getMostRecentEntry, appendSnapshot, etDateStr };
