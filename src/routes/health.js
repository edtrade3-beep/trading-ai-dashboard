const { writeJson, isOn } = require("../utils");
const { isConfigured: telegramConfigured } = require("../telegram");

// Build marker — the deploy's git commit (stable across restarts/cold-starts; changes ONLY on a new deploy).
// Render sets RENDER_GIT_COMMIT automatically. Fall back to a fixed string so restarts don't trigger reloads.
const BUILD = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "local";
const STARTED_AT = new Date().toISOString();

async function handleHealth(req, res) {
  const serverAutopilot = isOn(process.env.SERVER_AUTOPILOT);
  const meanrevPaper = isOn(process.env.MEANREV_PAPER);
  const apiAuth = !!(process.env.API_AUTH_TOKEN || "").trim();
  // Diagnostics: is the key even present on this service? (value length only, never the value)
  const envSeen = {
    MEANREV_PAPER: process.env.MEANREV_PAPER !== undefined,
    SERVER_AUTOPILOT: process.env.SERVER_AUTOPILOT !== undefined,
    ALPACA_KEY_ID: process.env.ALPACA_KEY_ID !== undefined,
  };
  return writeJson(res, 200, { ok: true, version: "market-v2", build: BUILD, startedAt: STARTED_AT, telegram: telegramConfigured(), serverAutopilot, meanrevPaper, apiAuth, envSeen });
}

module.exports = handleHealth;
