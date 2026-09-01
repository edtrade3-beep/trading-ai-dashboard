// routes/research-intel.js — thin GET/POST wrappers for the Research
// Intelligence layer, same shape as routes/command-center.js: GET returns
// the last persisted result, POST /refresh generates a fresh one on demand.
"use strict";

const { writeJson } = require("../utils");
const { loadCoachLog } = require("../ai-coach-store");
const { buildResearchIntel } = require("../research-intel-ai");
const { acquireRefreshLock } = require("../refresh-cooldown");

async function handleResearchIntel(req, res, requestUrl) {
  const { pathname } = requestUrl;

  if (pathname === "/api/research/intel" && req.method === "GET") {
    const log = loadCoachLog();
    return writeJson(res, 200, { ok: true, intel: log.researchIntel || null });
  }

  if (pathname === "/api/research/intel/refresh" && req.method === "POST") {
    // Cost-control cooldown (2026-09-01 audit) — a real, expensive
    // Anthropic call, previously refusable via double-click/retry with
    // zero protection. See refresh-cooldown.js's own header for why.
    const lock = acquireRefreshLock("research-intel", 15000);
    if (!lock.ok) return writeJson(res, 429, { ok: false, error: `Already refreshing (or refreshed too recently) — try again in ${Math.ceil(lock.retryAfterMs / 1000)}s.` });
    try {
      const built = await buildResearchIntel();
      if (!built) return writeJson(res, 200, { ok: false, error: "Could not generate a research report (ANTHROPIC_API_KEY not set)." });
      if (built.aiUnavailable) return writeJson(res, 200, { ok: false, error: "Research AI call failed this run — try again shortly.", debug: built.aiError });
      return writeJson(res, 200, { ok: true, intel: built });
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: "Could not generate a research report.", debug: e.message });
    } finally { lock.release(); }
  }

  return writeJson(res, 404, { error: "Not found" });
}

module.exports = { handleResearchIntel };
