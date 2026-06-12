const { writeJson } = require("../utils");
const { isConfigured: telegramConfigured } = require("../telegram");

// Build marker — the deploy's git commit (stable across restarts/cold-starts; changes ONLY on a new deploy).
// Render sets RENDER_GIT_COMMIT automatically. Fall back to a fixed string so restarts don't trigger reloads.
const BUILD = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "local";
const STARTED_AT = new Date().toISOString();

async function handleHealth(req, res) {
  return writeJson(res, 200, { ok: true, version: "market-v2", build: BUILD, startedAt: STARTED_AT, telegram: telegramConfigured() });
}

module.exports = handleHealth;
