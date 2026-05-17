const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./config");

const STORE_PATH = path.join(ROOT, "data", "price-alerts.json");

function ensureDir() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadPriceAlerts() {
  try {
    ensureDir();
    if (!fs.existsSync(STORE_PATH)) return [];
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePriceAlerts(alerts) {
  try {
    ensureDir();
    fs.writeFileSync(STORE_PATH, JSON.stringify(alerts, null, 2), "utf8");
  } catch {}
}

module.exports = { loadPriceAlerts, savePriceAlerts };
