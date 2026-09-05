// routes/autopilot.js — "AM TRADING — LIGHT BOX + AUTOPILOT" spec, Phase 7.
// Thin routes over src/autopilot-store.js — real mode toggle (default OFF,
// changed only by an explicit request here) + real status read.
"use strict";

const { writeJson, readRequestBody } = require("../utils");
const { VALID_MODES, getMode, setMode, getStatus } = require("../autopilot-store");
const { executionStatus } = require("../execution-authority");
const { getRecentOrders } = require("../autopilot-order-store");
const { getLastReconciliationResult } = require("../autopilot-reconciliation");

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

  // Read-only view into the Unified Autopilot merge's shadow-mode
  // transition log (Stage 3, 2026-09-04, see .claude/plans/proud-
  // yawning-unicorn.md's own verification requirement — checking these
  // real records against Alpaca's own order history is how this stage
  // gets verified before anything depends on it).
  if (pathname === "/api/autopilot/order-log" && req.method === "GET") {
    const { symbol, source, window } = Object.fromEntries(requestUrl.searchParams);
    return writeJson(res, 200, { ok: true, orders: getRecentOrders({ symbol: symbol || null, source: source || null, window: Number(window) || 100 }) });
  }

  // Read-only view of the one-time boot-time broker reconciliation
  // (Unified Autopilot merge, Stage 8, 2026-09-05) — what real Alpaca
  // positions/orders this process's ORDER_PENDING backlog got checked
  // against on startup, and what (if anything) got resolved. Returns
  // ok:true, ran:null before the boot check has run at all yet.
  if (pathname === "/api/autopilot/reconciliation" && req.method === "GET") {
    return writeJson(res, 200, { ok: true, ...(getLastReconciliationResult() || { ran: null }) });
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
    const { getAutoexecMode } = require("./autoexec");
    let tradierLive = false;
    try { tradierLive = require("../tradier-broker").LIVE; } catch { /* optional legacy broker */ }
    return writeJson(res, 200, { ok: true, ...getStatus(), execution: executionStatus({ serverAutopilot: false, lightboxMode: getMode(), tradierMode: getAutoexecMode(), tradierLive }) });
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
