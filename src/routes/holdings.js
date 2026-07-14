// Holdings store — persists the user's positions server-side so MY HOLDINGS survives across
// devices and can be refreshed by a daily sync (Claude reads Robinhood → POSTs here).
const path = require("node:path");
const { writeJson } = require("../utils");
const { writeJsonAtomic, readJsonSafe } = require("../atomic-write");

const FILE = path.join(__dirname, "../../data/holdings.json");

function read() {
  return readJsonSafe(FILE, null);
}
function write(data) {
  writeJsonAtomic(FILE, data);
}

async function handleHoldings(req, res) {
  if (req.method === "GET") {
    const d = read();
    return writeJson(res, 200, { ok: true, holdings: d?.holdings || null, updatedAt: d?.updatedAt || null, source: d?.source || null });
  }
  if (req.method === "POST") {
    let body = ""; for await (const chunk of req) body += chunk;
    let payload; try { payload = JSON.parse(body || "{}"); } catch { return writeJson(res, 400, { ok: false, error: "bad json" }); }
    const holdings = Array.isArray(payload.holdings) ? payload.holdings
      .filter(h => h && h.symbol)
      .map(h => ({ symbol: String(h.symbol).toUpperCase(), shares: Number(h.shares) || 0, cost: Number(h.cost) || 0 }))
      : null;
    if (!holdings) return writeJson(res, 400, { ok: false, error: "holdings array required" });
    const data = { holdings, updatedAt: new Date().toISOString(), source: payload.source || "manual" };
    write(data);
    return writeJson(res, 200, { ok: true, ...data });
  }
  return writeJson(res, 405, { ok: false, error: "method not allowed" });
}

module.exports = { handleHoldings };
