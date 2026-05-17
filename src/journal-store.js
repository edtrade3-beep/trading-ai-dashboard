const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./config");

const STORE_PATH = path.join(ROOT, "data", "journal.json");
const MAX_ENTRIES = 1000;

function ensureDir() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadJournal() {
  try {
    ensureDir();
    if (!fs.existsSync(STORE_PATH)) return [];
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveJournal(entries) {
  try {
    ensureDir();
    fs.writeFileSync(STORE_PATH, JSON.stringify(entries, null, 2), "utf8");
  } catch {}
}

function addEntry(entries, entry) {
  const next = [entry, ...entries];
  if (next.length > MAX_ENTRIES) next.length = MAX_ENTRIES;
  return next;
}

module.exports = { loadJournal, saveJournal, addEntry };
