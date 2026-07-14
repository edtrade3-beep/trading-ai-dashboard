const path = require("node:path");
const { writeJson, readRequestBody } = require("../utils");
const { writeJsonAtomic, readJsonSafe } = require("../atomic-write");

const WATCHLIST_FILE = path.join(__dirname, "../../data/watchlist.json");

function loadWatchlist() {
  return readJsonSafe(WATCHLIST_FILE, { symbols: [], updatedAt: null });
}

function saveWatchlist(symbols) {
  const data = { symbols, updatedAt: new Date().toISOString() };
  writeJsonAtomic(WATCHLIST_FILE, data);
  return data;
}

async function handleWatchlist(req, res) {
  if (req.method === "GET") {
    return writeJson(res, 200, loadWatchlist());
  }
  if (req.method === "POST") {
    const raw = await readRequestBody(req);
    const body = JSON.parse(raw || "{}");
    const symbols = Array.isArray(body.symbols)
      ? body.symbols.map(s => String(s).trim().toUpperCase()).filter(Boolean).slice(0, 200)
      : [];
    const saved = saveWatchlist(symbols);
    return writeJson(res, 200, { ok: true, ...saved });
  }
  return writeJson(res, 405, { error: "Method not allowed" });
}

module.exports = handleWatchlist;
