// routes/car-business.js — thin GET/POST wrappers for the Car Business
// Intelligence layer, same shape as routes/research-intel.js and
// routes/command-center.js: GET returns the last persisted result, POST
// /refresh generates a fresh one on demand.
"use strict";

const { writeJson, readRequestBody } = require("../utils");
const { loadCoachLog } = require("../ai-coach-store");
const { buildCarBusinessIntel, analyzeRepricing, buildFacebookStrategy, buildFacebookAd } = require("../car-business-ai");
const { loadDealerInfo, saveDealerInfo } = require("../car-business-dealer-info-store");
const { acquireRefreshLock } = require("../refresh-cooldown");

async function handleCarBusiness(req, res, requestUrl) {
  const { pathname } = requestUrl;

  if (pathname === "/api/car-business/intel" && req.method === "GET") {
    const log = loadCoachLog();
    return writeJson(res, 200, { ok: true, intel: log.carBusinessIntel || null });
  }

  if (pathname === "/api/car-business/intel/refresh" && req.method === "POST") {
    // Cost-control cooldown (2026-09-01 audit) — see refresh-cooldown.js.
    const lock = acquireRefreshLock("car-business-intel", 15000);
    if (!lock.ok) return writeJson(res, 429, { ok: false, error: `Already refreshing (or refreshed too recently) — try again in ${Math.ceil(lock.retryAfterMs / 1000)}s.` });
    try {
      const built = await buildCarBusinessIntel();
      if (!built) return writeJson(res, 200, { ok: false, error: "Could not generate a Car Business report (ANTHROPIC_API_KEY not set)." });
      if (built.aiUnavailable) return writeJson(res, 200, { ok: false, error: "Car Business AI call failed this run — try again shortly.", debug: built.aiError });
      return writeJson(res, 200, { ok: true, intel: built });
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: "Could not generate a Car Business report.", debug: e.message });
    } finally { lock.release(); }
  }

  // POST /api/car-business/reprice — CSV Repricing Analysis (explicit user
  // request 2026-08-30: "add csv file to analysis inventory and ai will
  // tell me which one i need to reprice supply and demand"). Body:
  // {vehicles:[{vin,year,make,model,trim,mileage,price,condition}, ...]}
  // — the client parses the real uploaded CSV into this shape; every row
  // is re-validated server-side via the same real normalizeVehicle used
  // by the dealer portal's own CSV import.
  if (pathname === "/api/car-business/reprice" && req.method === "POST") {
    // Cost-control cooldown (2026-09-01 audit) — see refresh-cooldown.js.
    const lock = acquireRefreshLock("car-business-reprice", 15000);
    if (!lock.ok) return writeJson(res, 429, { ok: false, error: `Already running (or ran too recently) — try again in ${Math.ceil(lock.retryAfterMs / 1000)}s.` });
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
    } finally { lock.release(); }
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
    // Cost-control cooldown (2026-09-01 audit) — see refresh-cooldown.js.
    const lock = acquireRefreshLock("car-business-facebook-strategy", 15000);
    if (!lock.ok) return writeJson(res, 429, { ok: false, error: `Already refreshing (or refreshed too recently) — try again in ${Math.ceil(lock.retryAfterMs / 1000)}s.` });
    try {
      const built = await buildFacebookStrategy();
      if (!built) return writeJson(res, 200, { ok: false, error: "Could not generate a Facebook strategy (ANTHROPIC_API_KEY not set)." });
      if (built.aiUnavailable) return writeJson(res, 200, { ok: false, error: "Facebook strategy AI call failed this run — try again shortly.", debug: built.aiError });
      return writeJson(res, 200, { ok: true, strategy: built });
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: "Could not generate a Facebook strategy.", debug: e.message });
    } finally { lock.release(); }
  }

  // Facebook Ad Maker (explicit user request, 2026-08-30: "build facebook
  // ad maker i only give details and you make ad also you can make it
  // step by step"). Body: {year,make,model,trim,mileage,price,condition,
  // features,notes} — free-form details the user typed in, not grounded
  // in the real inventory list (a one-off tool, ephemeral — no GET/
  // persistence, same pattern as /reprice).
  if (pathname === "/api/car-business/facebook-ad" && req.method === "POST") {
    // Cost-control cooldown (2026-09-01 audit) — see refresh-cooldown.js.
    const lock = acquireRefreshLock("car-business-facebook-ad", 15000);
    if (!lock.ok) return writeJson(res, 429, { ok: false, error: `Already running (or ran too recently) — try again in ${Math.ceil(lock.retryAfterMs / 1000)}s.` });
    try {
      const raw = await readRequestBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const result = await buildFacebookAd(body);
      if (!result.ok) return writeJson(res, 200, { ok: false, error: result.error });
      return writeJson(res, 200, result);
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: "Could not build the ad.", debug: e.message });
    } finally { lock.release(); }
  }

  // Dealer Info settings — real business name/address/phone/contact-method/
  // title-language/financing-language preferences used to ground the
  // Facebook Strategy + Ad Maker prompts (explicit user request, 2026-08-30:
  // real Dixie Motors contact details + "only call or pm in facebook",
  // never "title in hand", attractive financing language). GET returns the
  // real seeded/saved values; POST saves an edit from the settings form.
  if (pathname === "/api/car-business/dealer-info" && req.method === "GET") {
    return writeJson(res, 200, { ok: true, dealerInfo: loadDealerInfo() });
  }

  if (pathname === "/api/car-business/dealer-info" && req.method === "POST") {
    try {
      const raw = await readRequestBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const saved = saveDealerInfo(body);
      return writeJson(res, 200, { ok: true, dealerInfo: saved });
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: "Could not save dealer info.", debug: e.message });
    }
  }

  return writeJson(res, 404, { error: "Not found" });
}

module.exports = { handleCarBusiness };
