const { writeJson, isOn } = require("../utils");
const { isConfigured: telegramConfigured } = require("../telegram");
const { getDbStatus } = require("../atomic-write");
const { isDbMode: photosDbMode } = require("../dealership/photo-store");
const { hasValidSession } = require("../session");

// Build marker — the deploy's git commit (stable across restarts/cold-starts; changes ONLY on a new deploy).
// Render sets RENDER_GIT_COMMIT automatically. Fall back to a fixed string so restarts don't trigger reloads.
const BUILD = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "local";
const STARTED_AT = new Date().toISOString();

// Real diagnostics snapshot — extracted (2026-09-15, Agent tool-calling
// work) from handleHealth's own authed branch so a real in-process
// caller (src/agent-tools.js's check_platform_health tool) can read the
// exact same real diagnostics without a second HTTP round-trip and,
// crucially, without needing a session cookie (a server-to-server call
// has none) — the alternative would have been a second, independently-
// maintained copy of this same object, the exact class of drift bug this
// session has fixed repeatedly elsewhere (ATR/EMA/RSI/the risk-gate
// cascade). handleHealth below is now a thin HTTP wrapper: minimal shape
// unless authed, full snapshot from this same function when authed.
function buildFullHealthSnapshot() {
  const serverAutopilot = isOn(process.env.SERVER_AUTOPILOT);
  const meanrevPaper = isOn(process.env.MEANREV_PAPER);
  const apiAuth = !!(process.env.API_AUTH_TOKEN || "").trim();
  const envSeen = {
    MEANREV_PAPER: process.env.MEANREV_PAPER !== undefined,
    SERVER_AUTOPILOT: process.env.SERVER_AUTOPILOT !== undefined,
    ALPACA_KEY_ID: process.env.ALPACA_KEY_ID !== undefined,
    POLYGON_API_KEY: !!(process.env.POLYGON_API_KEY || "").trim(),
  };
  const postgres = { ...getDbStatus(), photosConnected: photosDbMode() };
  let lightboxMode = "OFF";
  try { lightboxMode = require("../autopilot-store").getMode(); } catch { /* optional store */ }
  let tradierMode = "off";
  try { tradierMode = require("./autoexec").getAutoexecMode(); } catch { /* optional legacy broker */ }
  let tradierLive = false;
  try { tradierLive = require("../tradier-broker").LIVE; } catch { /* optional legacy broker */ }
  let autopilot2State = "OFF";
  try { autopilot2State = require("../autopilot2-store").loadState().state; } catch { /* optional store */ }
  const { executionStatus } = require("../execution-authority");
  let dynamicUniverse = null;
  try {
    const { readJsonSafe } = require("../atomic-write");
    const { getDynamicUniverse, CURSOR_PATH } = require("../universe-builder");
    const u = getDynamicUniverse();
    const cursor = readJsonSafe(CURSOR_PATH, null);
    let lastAttempt = null;
    try { lastAttempt = require("../autopilot2-engine").getLastDynamicUniverseAttempt(); } catch { /* optional */ }
    dynamicUniverse = { universeSize: u.universe.length, builtAt: u.builtAt ? new Date(u.builtAt).toISOString() : null, stale: u.stale, cursor, lastAttempt };
  } catch (err) { dynamicUniverse = { error: err instanceof Error ? err.message : String(err) }; }
  return {
    ok: true, version: "market-v2", build: BUILD, startedAt: STARTED_AT,
    telegram: telegramConfigured(), serverAutopilot, meanrevPaper, apiAuth,
    execution: { ...executionStatus({ serverAutopilot, lightboxMode, tradierMode, tradierLive, autopilot2State }), lightboxMode, tradierMode, autopilot2State },
    envSeen, postgres, dynamicUniverse,
  };
}

async function handleHealth(req, res) {
  // Minimal public shape (2026-09-14 security fix, Priority 1 — "public
  // health response must contain only minimal safe information"). This
  // route MUST stay reachable with zero auth (render.yaml's
  // healthCheckPath: Render's own prober never sends the session cookie,
  // and if this route ever 401'd, Render would consider the deploy
  // unhealthy and could restart-loop the service) — so the fix here is
  // conditional response RICHNESS, not a gate. Real operational
  // diagnostics (env-var presence, Postgres status, execution/mutator
  // state, dynamic-universe internals) only render for a caller who
  // already has a valid session; everyone else gets just ok/build/started.
  const authed = hasValidSession(req);
  if (!authed) return writeJson(res, 200, { ok: true, version: "market-v2", build: BUILD, startedAt: STARTED_AT });
  return writeJson(res, 200, buildFullHealthSnapshot());
}

module.exports = handleHealth;
module.exports.buildFullHealthSnapshot = buildFullHealthSnapshot;
