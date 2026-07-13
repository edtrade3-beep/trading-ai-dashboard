const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "journal.json");
const MAX_ENTRIES = 1000;

function loadJournal() {
  const parsed = readJsonSafe(STORE_PATH, []);
  return Array.isArray(parsed) ? parsed : [];
}

function saveJournal(entries) {
  try {
    writeJsonAtomic(STORE_PATH, entries);
  } catch {}
}

function addEntry(entries, entry) {
  const next = [entry, ...entries];
  if (next.length > MAX_ENTRIES) next.length = MAX_ENTRIES;
  return next;
}

module.exports = { loadJournal, saveJournal, addEntry };
