const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./config");

const STORE_PATH = path.join(ROOT, "data", "portfolio.json");

function ensureDir() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadPortfolio() {
  try {
    ensureDir();
    if (!fs.existsSync(STORE_PATH)) return { holdings: [], updatedAt: null };
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : { holdings: [], updatedAt: null };
  } catch {
    return { holdings: [], updatedAt: null };
  }
}

function savePortfolio(holdings) {
  try {
    ensureDir();
    fs.writeFileSync(STORE_PATH, JSON.stringify({ holdings, updatedAt: new Date().toISOString() }, null, 2), "utf8");
  } catch {}
}

module.exports = { loadPortfolio, savePortfolio };
