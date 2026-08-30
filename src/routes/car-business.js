// routes/car-business.js — thin GET/POST wrappers for the Car Business
// Intelligence layer, same shape as routes/research-intel.js and
// routes/command-center.js: GET returns the last persisted result, POST
// /refresh generates a fresh one on demand.
"use strict";

const { writeJson, readRequestBody } = require("../utils");
const { loadCoachLog } = require("../ai-coach-store");
const { buildCarBusinessIntel, analyzeRepricing, buildFacebookStrategy } = require("../car-business-ai");

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

  // POST /api/car-business/reprice — CSV Repricing Analysis (explicit user
  // request 2026-08-30: "add csv file to analysis inventory and ai will
  // tell me which one i need to reprice supply and demand"). Body:
  // {vehicles:[{vin,year,make,model,trim,mileage,price,condition}, ...]}
  // — the client parses the real uploaded CSV into this shape; every row
  // is re-validated server-side via the same real normalizeVehicle used
  // by the dealer portal's own CSV import.
  if (pathname === "/api/car-business/reprice" && req.method === "POST") {
    try {
      const raw = await readRequestBody(req);
      const body = raw ? JSON.parse(raw) : {};
      if (!Array.isArray(body.vehicles) || !body.vehicles.length) {
        return writeJson(res, 200, { ok: false, error: "No real vehicles in the uploaded file." });
      }
      const result = await analyzeRepricing(body.vehicles);
      if (!result.ok) return writeJson(res, 200, { ok: false, error: result.error });
      return writeJson(res, 200, result);
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: "Repricing analysis failed.", debug: e.message });
    }
  }

  // Facebook Lead Generation Strategy (explicit user request, 2026-08-30:
  // "find strategy to post and get lots of leads from facebook"). GET
  // returns the last persisted strategy (same saveCoachOutput/loadCoachLog
  // pattern as /intel); POST /refresh generates a fresh one on demand —
  // deliberately not part of the daily 6:05pm cycle, since a posting
  // playbook doesn't need to regenerate every single day.
  if (pathname === "/api/car-business/facebook-strategy" && req.method === "GET") {
    const log = loadCoachLog();
    return writeJson(res, 200, { ok: true, strategy: log.carBusinessFacebookStrategy || null });
  }

  if (pathname === "/api/car-business/facebook-strategy/refresh" && req.method === "POST") {
    try {
      const built = await buildFacebookStrategy();
      if (!built) return writeJson(res, 200, { ok: false, error: "Could not generate a Facebook strategy (ANTHROPIC_API_KEY not set)." });
      if (built.aiUnavailable) return writeJson(res, 200, { ok: false, error: "Facebook strategy AI call failed this run — try again shortly.", debug: built.aiError });
      return writeJson(res, 200, { ok: true, strategy: built });
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: "Could not generate a Facebook strategy.", debug: e.message });
    }
  }

  return writeJson(res, 404, { error: "Not found" });
}

module.exports = { handleCarBusiness };
