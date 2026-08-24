// routes/emergency-stop.js — thin routes over src/emergency-stop.js.
// 2026-08-24, Execution Bot Architecture Audit Phase 1.
"use strict";

const { writeJson, readRequestBody } = require("../utils");
const { getEmergencyStopStatus, activateEmergencyStop, deactivateEmergencyStop } = require("../emergency-stop");

async function handleEmergencyStop(req, res, requestUrl) {
  const { pathname } = requestUrl;

  if (pathname === "/api/emergency-stop/status" && req.method === "GET") {
    return writeJson(res, 200, { ok: true, ...getEmergencyStopStatus() });
  }

  if (pathname === "/api/emergency-stop/activate" && req.method === "POST") {
    let body = {};
    try { body = JSON.parse(await readRequestBody(req)); } catch {}
    const result = await activateEmergencyStop({ reason: body.reason, activatedBy: body.activatedBy || "app" });
    return writeJson(res, 200, result);
  }

  if (pathname === "/api/emergency-stop/rearm" && req.method === "POST") {
    let body = {};
    try { body = JSON.parse(await readRequestBody(req)); } catch {}
    const result = deactivateEmergencyStop({ rearmedBy: body.rearmedBy || "app" });
    return writeJson(res, 200, result);
  }

  return writeJson(res, 404, { ok: false, error: "Not found" });
}

module.exports = { handleEmergencyStop };
