const fs = require("node:fs");
const path = require("node:path");
const { writeJson, readRequestBody } = require("../utils");

const WATCHLIST_FILE = path.join(__dirname, "../../data/watchlist.json");

function loadWatchlist() {
  try {
    if (!fs.existsSync(WATCHLIST_FILE)) return { symbols: [], updatedAt: null };
    return JSON.parse(fs.readFileSync(WATCHLIST_FILE, "utf8"));
  } catch {
    return { symbols: [], updatedAt: null };
  }
}

function saveWatchlist(symbols) {
  const dir = path.dirname(WATCHLIST_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = { symbols, updatedAt: new Date().toISOString() };
  fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(data, null, 2), "utf8");
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
