const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./config");

const STORE_PATH = path.join(ROOT, "data", "tv-alerts.json");
const MAX_ROWS = 500;

function ensureDir() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadAlerts() {
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

function saveAlerts(alerts) {
  try {
    ensureDir();
    fs.writeFileSync(STORE_PATH, JSON.stringify(alerts, null, 2), "utf8");
  } catch {
    // Non-fatal — in-memory array is the live source of truth
  }
}

function prependAlert(alerts, alert) {
  const next = [alert, ...alerts];
  if (next.length > MAX_ROWS) next.length = MAX_ROWS;
  return next;
}

module.exports = { loadAlerts, saveAlerts, prependAlert };
