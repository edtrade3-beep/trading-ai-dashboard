"use strict";
/**
 * watchlistHelper.js
 * Reads the platform watchlist from data/watchlist.json
 * so the COT scanner can include user-defined symbols.
 */

const fs   = require("node:fs");
const path = require("node:path");
const { ROOT } = require("../config");

const WATCHLIST_FILE = path.join(ROOT, "data", "watchlist.json");

function loadWatchlistSymbols() {
  try {
    if (!fs.existsSync(WATCHLIST_FILE)) return [];
    const data = JSON.parse(fs.readFileSync(WATCHLIST_FILE, "utf8"));
    return Array.isArray(data.symbols) ? data.symbols : [];
  } catch {
    return [];
  }
}

module.exports = { loadWatchlistSymbols };
