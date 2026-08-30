// routes/research-intel.js — thin GET/POST wrappers for the Research
// Intelligence layer, same shape as routes/command-center.js: GET returns
// the last persisted result, POST /refresh generates a fresh one on demand.
"use strict";

const { writeJson } = require("../utils");
const { loadCoachLog } = require("../ai-coach-store");
const { buildResearchIntel } = require("../research-intel-ai");

async function handleResearchIntel(req, res, requestUrl) {
  const { pathname } = requestUrl;

  if (pathname === "/api/research/intel" && req.method === "GET") {
    const log = loadCoachLog();
    return writeJson(res, 200, { ok: true, intel: log.researchIntel || null });
  }

  if (pathname === "/api/research/intel/refresh" && req.method === "POST") {
    try {
      const built = await buildResearchIntel();
      if (!built) return writeJson(res, 200, { ok: false, error: "Could not generate a research report (ANTHROPIC_API_KEY not set)." });
      if (built.aiUnavailable) return writeJson(res, 200, { ok: false, error: "Research AI call failed this run — try again shortly.", debug: built.aiError });
      return writeJson(res, 200, { ok: true, intel: built });
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: "Could not generate a research report.", debug: e.message });
    }
  }

  return writeJson(res, 404, { error: "Not found" });
}

module.exports = { handleResearchIntel };
