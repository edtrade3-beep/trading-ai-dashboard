const { writeJson, readRequestBody } = require("../utils");
const { loadSettings, saveSettings } = require("../settings-store");

const ALLOWED_KEYS = new Set([
  "watchlistSymbols", "themeMode", "scannerFilters", "portfolioHoldings",
  "customAlerts", "workflowState", "terminalPanelSymbols", "settings",
]);

async function handleSettings(req, res, requestUrl) {
  const { pathname } = requestUrl;

  if (pathname === "/api/settings" && req.method === "GET") {
    return writeJson(res, 200, { settings: loadSettings() });
  }

  if (pathname === "/api/settings" && req.method === "POST") {
    let body;
    try {
      const raw = await readRequestBody(req);
      body = JSON.parse(raw);
    } catch {
      return writeJson(res, 400, { error: "Invalid JSON body" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return writeJson(res, 400, { error: "Body must be a JSON object" });
    }
    const current = loadSettings();
    for (const key of Object.keys(body)) {
      if (ALLOWED_KEYS.has(key)) {
        current[key] = body[key];
      }
    }
    current.savedAt = new Date().toISOString();
    saveSettings(current);
    return writeJson(res, 200, { ok: true, savedAt: current.savedAt });
  }

  if (pathname === "/api/settings" && req.method === "DELETE") {
    saveSettings({});
    return writeJson(res, 200, { ok: true });
  }

  return writeJson(res, 405, { error: "Method not allowed" });
}

module.exports = handleSettings;
