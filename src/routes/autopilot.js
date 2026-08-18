// routes/autopilot.js — "AM TRADING — LIGHT BOX + AUTOPILOT" spec, Phase 7.
// Thin routes over src/autopilot-store.js — real mode toggle (default OFF,
// changed only by an explicit request here) + real status read.
"use strict";

const { writeJson, readRequestBody } = require("../utils");
const { VALID_MODES, getMode, setMode, getStatus } = require("../autopilot-store");

async function handleAutopilot(req, res, requestUrl) {
  const { pathname } = requestUrl;

  if (pathname === "/api/autopilot/mode" && req.method === "GET") {
    return writeJson(res, 200, { ok: true, mode: getMode(), validModes: VALID_MODES });
  }

  if (pathname === "/api/autopilot/mode" && req.method === "POST") {
    let body;
    try {
      const raw = await readRequestBody(req);
      body = JSON.parse(raw);
    } catch {
      return writeJson(res, 400, { ok: false, error: "Invalid JSON body" });
    }
    if (!VALID_MODES.includes(body?.mode)) {
      return writeJson(res, 400, { ok: false, error: `mode must be one of ${VALID_MODES.join(", ")}` });
    }
    // ASSIST/AUTOPILOT execution isn't built yet this phase — accepted as
    // a real stored value (so the mode concept is real end-to-end), but
    // autopilot-tick.js never places an order regardless of mode. The UI
    // keeps these two visibly disabled so nothing implies more capability
    // than actually exists yet.
    const mode = setMode(body.mode);
    return writeJson(res, 200, { ok: true, mode });
  }

  if (pathname === "/api/autopilot/status" && req.method === "GET") {
    return writeJson(res, 200, { ok: true, ...getStatus() });
  }

  return writeJson(res, 404, { ok: false, error: "Not found" });
}

module.exports = { handleAutopilot };
