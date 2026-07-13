const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "portfolio.json");
const DEFAULT_PORTFOLIO = { holdings: [], updatedAt: null };

function loadPortfolio() {
  const parsed = readJsonSafe(STORE_PATH, DEFAULT_PORTFOLIO);
  return parsed && typeof parsed === "object" ? parsed : DEFAULT_PORTFOLIO;
}

function savePortfolio(holdings) {
  try {
    writeJsonAtomic(STORE_PATH, { holdings, updatedAt: new Date().toISOString() });
  } catch {}
}

module.exports = { loadPortfolio, savePortfolio };
