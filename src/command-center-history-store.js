// command-center-history-store.js — rolling snapshots so Command Center can
// show "what changed since your last report" instead of resetting to a
// blank slate every generation. Same atomic-write/readJsonSafe pattern as
// advisor-history-store.js, but keyed by exact timestamp rather than one-
// per-day: Command Center can be manually refreshed multiple times in a
// session (unlike Advisor AI's once-daily cadence), and "since last report"
// should mean the immediately-prior generation, whether that was minutes
// ago or yesterday — not necessarily "since yesterday".
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "command-center-history.json");
const MAX_ENTRIES = 200; // comfortably covers weeks of multiple-times-a-day refreshes

const etDateStr = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

function loadHistory() {
  const data = readJsonSafe(STORE_PATH, { entries: [] });
  return Array.isArray(data.entries) ? data.entries : [];
}

// The real comparison point for "what changed" — whatever was generated
// immediately before THIS call, whether minutes ago or days ago. Must be
// read before appendSnapshot() runs for the current generation.
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
