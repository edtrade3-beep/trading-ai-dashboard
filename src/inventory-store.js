const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "inventory.json");

function loadInventory() {
  const parsed = readJsonSafe(STORE_PATH, null);
  return Array.isArray(parsed) && parsed.length ? parsed : null;
}

function saveInventory(items) {
  try {
    writeJsonAtomic(STORE_PATH, items);
    return true;
  } catch {
    return false;
  }
}

module.exports = { loadInventory, saveInventory };
