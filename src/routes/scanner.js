const { writeJson, readRequestBody } = require("../utils");
const { runScan, getScannerStatus, loadConfig, saveConfig, DEFAULT_SYMBOLS } = require("../market-scanner");

async function handleScanner(req, res, requestUrl) {
  const { pathname } = requestUrl;

  // GET /api/scanner/status
  if (pathname === "/api/scanner/status" && req.method === "GET") {
    return writeJson(res, 200, getScannerStatus());
  }

  // POST /api/scanner/run — manual trigger
  if (pathname === "/api/scanner/run" && req.method === "POST") {
    const result = await runScan();
    return writeJson(res, 200, result);
  }

  // GET /api/scanner/config
  if (pathname === "/api/scanner/config" && req.method === "GET") {
    return writeJson(res, 200, { config: loadConfig(), defaultSymbols: DEFAULT_SYMBOLS });
  }

  // POST /api/scanner/config — update config
  if (pathname === "/api/scanner/config" && req.method === "POST") {
    let body;
    try {
      const raw = await readRequestBody(req);
      body = JSON.parse(raw);
    } catch {
      return writeJson(res, 400, { error: "Invalid JSON body" });
    }

    const allowed = ["enabled","symbols","intervalMinutes","buyScoreMin","sellScoreMax","minRvol","cooldownHours","marketHoursOnly"];
    const updates = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    // Validate symbols array
    if ("symbols" in updates) {
      if (!Array.isArray(updates.symbols)) {
        return writeJson(res, 400, { error: "symbols must be an array of ticker strings" });
      }
      updates.symbols = updates.symbols
        .map(s => String(s || "").trim().toUpperCase())
        .filter(s => /^[A-Z0-9.\-^]{1,12}$/.test(s))
        .slice(0, 500);
    }

    // Validate numeric ranges
    if ("intervalMinutes" in updates) updates.intervalMinutes = Math.max(5, Math.min(1440, Number(updates.intervalMinutes) || 15));
    if ("buyScoreMin" in updates)     updates.buyScoreMin = Math.max(50, Math.min(99, Number(updates.buyScoreMin) || 72));
    if ("sellScoreMax" in updates)    updates.sellScoreMax = Math.max(1, Math.min(49, Number(updates.sellScoreMax) || 32));
    if ("minRvol" in updates)         updates.minRvol = Math.max(0.5, Math.min(5, Number(updates.minRvol) || 1.25));
    if ("cooldownHours" in updates)   updates.cooldownHours = Math.max(0.5, Math.min(48, Number(updates.cooldownHours) || 4));

    const saved = saveConfig(updates);
    return writeJson(res, 200, { ok: true, config: saved });
  }

  return writeJson(res, 404, { error: "Unknown scanner endpoint" });
}

module.exports = handleScanner;
