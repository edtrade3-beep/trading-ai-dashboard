// routes/car-business.js — thin GET/POST wrappers for the Car Business
// Intelligence layer, same shape as routes/research-intel.js and
// routes/command-center.js: GET returns the last persisted result, POST
// /refresh generates a fresh one on demand.
"use strict";

const { writeJson } = require("../utils");
const { loadCoachLog } = require("../ai-coach-store");
const { buildCarBusinessIntel } = require("../car-business-ai");

async function handleCarBusiness(req, res, requestUrl) {
  const { pathname } = requestUrl;

  if (pathname === "/api/car-business/intel" && req.method === "GET") {
    const log = loadCoachLog();
    return writeJson(res, 200, { ok: true, intel: log.carBusinessIntel || null });
  }

  if (pathname === "/api/car-business/intel/refresh" && req.method === "POST") {
    try {
      const built = await buildCarBusinessIntel();
      if (!built) return writeJson(res, 200, { ok: false, error: "Could not generate a Car Business report (ANTHROPIC_API_KEY not set)." });
      if (built.aiUnavailable) return writeJson(res, 200, { ok: false, error: "Car Business AI call failed this run — try again shortly.", debug: built.aiError });
      return writeJson(res, 200, { ok: true, intel: built });
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: "Could not generate a Car Business report.", debug: e.message });
    }
  }

  return writeJson(res, 404, { error: "Not found" });
}

module.exports = { handleCarBusiness };
