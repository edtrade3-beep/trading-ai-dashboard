const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./config");

const STORE_PATH = path.join(ROOT, "data", "inventory.json");

function ensureDir() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadInventory() {
  try {
    ensureDir();
    if (!fs.existsSync(STORE_PATH)) return null;
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

function saveInventory(items) {
  try {
    ensureDir();
    fs.writeFileSync(STORE_PATH, JSON.stringify(items, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

module.exports = { loadInventory, saveInventory };
