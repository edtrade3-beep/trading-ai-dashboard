// routes/autopilot.js — "AM TRADING — LIGHT BOX + AUTOPILOT" spec, Phase 7.
// Thin routes over src/autopilot-store.js — real mode toggle (default OFF,
// changed only by an explicit request here) + real status read.
"use strict";

const { writeJson, readRequestBody } = require("../utils");
const { VALID_MODES, getMode, setMode, getStatus } = require("../autopilot-store");

async function readSymbol(req) {
  const raw = await readRequestBody(req);
  const body = JSON.parse(raw);
  const symbol = String(body?.symbol || "").trim().toUpperCase();
  if (!symbol) throw new Error("symbol is required");
  return symbol;
}

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
    // ASSIST now has real order execution, both directions (see
    // lightbox-autopilot-execute.js) via the /preview + /execute routes
    // below, both gated on mode === "ASSIST". AUTOPILOT (fully automatic,
    // no tap required) is still not built — accepted as a real stored
    // value, but nothing auto-executes off it. The UI keeps AUTOPILOT
    // visibly disabled so nothing implies more capability than exists yet.
    const mode = setMode(body.mode);
    return writeJson(res, 200, { ok: true, mode });
  }

  if (pathname === "/api/autopilot/status" && req.method === "GET") {
    return writeJson(res, 200, { ok: true, ...getStatus() });
  }

  // Real ASSIST order preview/execute (2026-08-23, explicit user request:
  // "Build real order execution... ASSIST only... Alpaca paper"; SHORT
  // support added same day once day-trade-calc.js's direction-aware
  // stop/target math shipped). Both routes run the exact same real
  // validation/sizing in lightbox-autopilot-execute.js — preview places
  // nothing, execute re-validates fresh (never trusts a stale preview)
  // and places a real bracket order, buy-side for LONG or sell-side
  // (real short) for SHORT.
  if (pathname === "/api/autopilot/preview" && req.method === "POST") {
    let symbol;
    try { symbol = await readSymbol(req); } catch (e) { return writeJson(res, 400, { ok: false, error: e.message }); }
    const { previewOrder } = require("../lightbox-autopilot-execute");
    const result = await previewOrder(symbol);
    return writeJson(res, result.ok ? 200 : 400, result);
  }

  if (pathname === "/api/autopilot/execute" && req.method === "POST") {
    let symbol;
    try { symbol = await readSymbol(req); } catch (e) { return writeJson(res, 400, { ok: false, error: e.message }); }
    const { placeOrder } = require("../lightbox-autopilot-execute");
    const result = await placeOrder(symbol);
    return writeJson(res, result.ok ? 200 : 400, result);
  }

  return writeJson(res, 404, { ok: false, error: "Not found" });
}

module.exports = { handleAutopilot };
