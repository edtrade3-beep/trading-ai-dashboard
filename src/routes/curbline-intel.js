// routes/curbline-intel.js — thin GET/POST wrappers for the daily 8:30
// AM ET Curbline Intel scan, same shape as routes/market-wrap.js: GET
// returns the last persisted result, POST /refresh generates a fresh
// one on demand.
"use strict";

const { writeJson } = require("../utils");
const { loadCoachLog } = require("../ai-coach-store");
const { buildCurblineIntel } = require("../curbline-intel-ai");
const { acquireRefreshLock } = require("../refresh-cooldown");

async function handleCurblineIntel(req, res, requestUrl) {
  const { pathname } = requestUrl;

  if (pathname === "/api/curbline-intel" && req.method === "GET") {
    const log = loadCoachLog();
    return writeJson(res, 200, { ok: true, intel: log.curblineIntel || null });
  }

  if (pathname === "/api/curbline-intel/refresh" && req.method === "POST") {
    // Cost-control cooldown (2026-09-01 audit) — see refresh-cooldown.js.
    const lock = acquireRefreshLock("curbline-intel", 15000);
    if (!lock.ok) return writeJson(res, 429, { ok: false, error: `Already refreshing (or refreshed too recently) — try again in ${Math.ceil(lock.retryAfterMs / 1000)}s.` });
    try {
      const built = await buildCurblineIntel();
      if (!built) return writeJson(res, 200, { ok: false, error: "Could not generate Curbline Intel (ANTHROPIC_API_KEY not set)." });
      if (built.aiUnavailable) return writeJson(res, 200, { ok: false, error: "Curbline Intel AI call failed this run — try again shortly.", debug: built.aiError });
      return writeJson(res, 200, { ok: true, intel: built });
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: "Could not generate Curbline Intel.", debug: e.message });
    } finally { lock.release(); }
  }

  return writeJson(res, 404, { error: "Not found" });
}

module.exports = { handleCurblineIntel };
