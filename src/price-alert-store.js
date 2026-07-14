const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "price-alerts.json");

function loadPriceAlerts() {
  const parsed = readJsonSafe(STORE_PATH, []);
  return Array.isArray(parsed) ? parsed : [];
}

function savePriceAlerts(alerts) {
  try {
    writeJsonAtomic(STORE_PATH, alerts);
  } catch {}
}

module.exports = { loadPriceAlerts, savePriceAlerts };
