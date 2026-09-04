const { writeJson, isOn } = require("../utils");
const { isConfigured: telegramConfigured } = require("../telegram");
const { getDbStatus } = require("../atomic-write");
const { isDbMode: photosDbMode } = require("../dealership/photo-store");

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
    POLYGON_API_KEY: !!(process.env.POLYGON_API_KEY || "").trim(),
  };

  // Postgres persistence status — data/*.json stores are backed by Postgres
  // (src/atomic-write.js) once DATABASE_URL is set; this confirms it's
  // actually connected, not just configured.
  const postgres = { ...getDbStatus(), photosConnected: photosDbMode() };
  let lightboxMode = "OFF";
  try { lightboxMode = require("../autopilot-store").getMode(); } catch { /* optional store */ }
  let tradierMode = "off";
  try { tradierMode = require("./autoexec").getAutoexecMode(); } catch { /* optional legacy broker */ }
  let tradierLive = false;
  try { tradierLive = require("../tradier-broker").LIVE; } catch { /* optional legacy broker */ }
  const { executionStatus } = require("../execution-authority");
  // Real diagnostic (2026-09-04, live production question: a real market-
  // hours Autopilot 2.0 tick was confirmed running with no errors, yet the
  // dynamic-universe rotation cursor's Postgres key never appeared — no
  // direct way to see why from outside the process). Read-only, no
  // network call (getDynamicUniverse/the cursor read are both local
  // cache/file reads) — exposes exactly what's actually persisted right
  // now instead of inferring it from kvRowCount alone.
  let dynamicUniverse = null;
  try {
    const { readJsonSafe } = require("../atomic-write");
    const { getDynamicUniverse, CURSOR_PATH } = require("../universe-builder");
    const u = getDynamicUniverse();
    const cursor = readJsonSafe(CURSOR_PATH, null);
    dynamicUniverse = { universeSize: u.universe.length, builtAt: u.builtAt ? new Date(u.builtAt).toISOString() : null, stale: u.stale, cursor };
  } catch (err) { dynamicUniverse = { error: err instanceof Error ? err.message : String(err) }; }
  return writeJson(res, 200, {
    ok: true, version: "market-v2", build: BUILD, startedAt: STARTED_AT,
    telegram: telegramConfigured(), serverAutopilot, meanrevPaper, apiAuth,
    execution: { ...executionStatus({ serverAutopilot, lightboxMode, tradierMode, tradierLive }), lightboxMode, tradierMode },
    envSeen, postgres, dynamicUniverse,
  });
}

module.exports = handleHealth;
