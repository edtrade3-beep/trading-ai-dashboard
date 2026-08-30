// research-intel-store.js — rolling daily snapshots for the Research
// Intelligence layer (upgrade-search, 2026-08-30), so today's generation can
// diff against yesterday's ("NEW / STRENGTHENED / WEAKENED / INVALIDATED /
// UNCHANGED") instead of resetting to a blank slate. Same atomic-write/
// readJsonSafe pattern as command-center-history-store.js — deliberately
// copied, not imported, because that store is keyed for Command Center's
// multiple-times-a-day refresh cadence while this one is explicitly a
// once-a-day cadence (spec: "Refresh the research every 24 hours") plus an
// occasional manual refresh; sharing one file would blend two different
// "what's the prior entry" semantics.
"use strict";

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "research-intel-history.json");
const MAX_ENTRIES = 120; // ~4 months of daily snapshots

const etDateStr = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

function loadHistory() {
  const data = readJsonSafe(STORE_PATH, { entries: [] });
  return Array.isArray(data.entries) ? data.entries : [];
}

// The real comparison point for "what changed" — whatever was generated
// immediately before THIS call, whether that was yesterday or minutes ago
// (a manual refresh mid-day still diffs against the last real generation,
// never a fabricated "no change").
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
