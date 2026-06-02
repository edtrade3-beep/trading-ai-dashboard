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
  // Dedup: skip if same ticker + signal + source within last 5 minutes
  const DEDUP_WINDOW_MS = 5 * 60 * 1000;
  const now = Date.now();
  const isDup = alerts.some(a => {
    if (!a.ticker || !alert.ticker) return false;
    if (String(a.ticker).toUpperCase() !== String(alert.ticker).toUpperCase()) return false;
    if (a.signal !== alert.signal) return false;
    const age = now - new Date(a.ts || a.time || a.triggeredAt || 0).getTime();
    return age < DEDUP_WINDOW_MS;
  });
  if (isDup) return alerts; // drop duplicate silently

  const next = [alert, ...alerts];
  if (next.length > MAX_ROWS) next.length = MAX_ROWS;
  return next;
}

function deduplicateAlerts(alerts) {
  // Remove exact duplicates (same ticker + signal within 5 min windows)
  const seen = new Map();
  return alerts.filter(a => {
    const bucket = Math.floor(new Date(a.ts || a.time || 0).getTime() / (5 * 60 * 1000));
    const key = `${String(a.ticker||"").toUpperCase()}:${a.signal}:${bucket}`;
    if (seen.has(key)) return false;
    seen.set(key, true);
    return true;
  });
}

module.exports = { loadAlerts, saveAlerts, prependAlert, deduplicateAlerts };
