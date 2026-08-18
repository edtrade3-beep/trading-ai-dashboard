const { writeJson, readRequestBody } = require("../utils");
const { loadSettings, saveSettings } = require("../settings-store");
const { isAlpacaConfigured } = require("../providers/alpaca-client");
const { ANTHROPIC_API_KEY } = require("../config");

const ALLOWED_KEYS = new Set([
  "watchlistSymbols", "themeMode", "scannerFilters", "portfolioHoldings",
  "customAlerts", "workflowState", "terminalPanelSymbols", "settings",
]);

async function handleSettings(req, res, requestUrl) {
  const { pathname } = requestUrl;

  if (pathname === "/api/settings" && req.method === "GET") {
    return writeJson(res, 200, { settings: loadSettings() });
  }

  // Real connection status for the "AM Trading — Final Trading Logic
  // Redesign" spec's proposed external layer (GoCharting order-flow
  // confirmation, TakeProfit alert bridge, Broker/MT5 execution) —
  // explicit user request 2026-08-19, scoped down to "use what I only
  // have access to" after confirming via repo search that GoCharting/
  // TakeProfit have no real API keys, webhooks, or account access
  // anywhere in this codebase. Broker/AI Provider report real status;
  // GoCharting/TakeProfit are honestly reported not-connected rather
  // than faked — no config input is offered for them here since no real
  // code would consume the key yet.
  if (pathname === "/api/settings/integrations" && req.method === "GET") {
    return writeJson(res, 200, {
      ok: true,
      broker: { name: "Alpaca", connected: isAlpacaConfigured() },
      aiProvider: { name: "Anthropic", connected: Boolean(ANTHROPIC_API_KEY) },
      goCharting: { name: "GoCharting", connected: false, note: "Order-flow confirmation not connected — no real API/webhook access configured yet." },
      takeProfit: { name: "TakeProfit", connected: false, note: "Alert bridge not connected — no real API/webhook access configured yet." },
    });
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
