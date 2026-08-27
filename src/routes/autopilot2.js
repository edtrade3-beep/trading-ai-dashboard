// routes/autopilot2.js — ADOL22 Autopilot 2.0 Phase 1 API surface. Thin
// GET/POST wrappers over autopilot2-account.js/autopilot2-store.js/
// autopilot2-engine.js, same one-file-per-feature convention every other
// src/routes/*.js already follows. Never places a real order — the
// internal $100k ledger is entirely simulated (see autopilot2-account.js).
"use strict";
const { writeJson, readRequestBody } = require("../utils");
const { getAccountSnapshot, resetAccount } = require("../autopilot2-account");
const { loadState, setState, recentActivity } = require("../autopilot2-store");

async function handleAutopilot2(req, res, requestUrl) {
  const { pathname } = requestUrl;

  if (pathname === "/api/autopilot2/status" && req.method === "GET") {
    try {
      const [state, account] = await Promise.all([
        Promise.resolve(loadState()),
        getAccountSnapshot(),
      ]);
      let bestOpportunity = null;
      try {
        const { computeAllOpportunities } = require("./market");
        const scan = await computeAllOpportunities();
        const heldSymbols = new Set(account.openPositions.map((p) => p.symbol));
        const candidates = (scan.tiers?.actionable || []).filter((o) => !heldSymbols.has(o.symbol));
        bestOpportunity = candidates.sort((a, b) => (b.expectedValue ?? -Infinity) - (a.expectedValue ?? -Infinity))[0] || null;
      } catch { bestOpportunity = null; } // honest omission — status still returns the real account either way
      return writeJson(res, 200, { ok: true, state, account, activity: recentActivity(50), bestOpportunity });
    } catch (err) {
      return writeJson(res, 200, { ok: false, error: err instanceof Error ? err.message : "status failed" });
    }
  }

  if (pathname === "/api/autopilot2/start" && req.method === "POST") {
    return writeJson(res, 200, { ok: true, state: setState("RUNNING", "started by user") });
  }
  if (pathname === "/api/autopilot2/pause" && req.method === "POST") {
    return writeJson(res, 200, { ok: true, state: setState("PAUSED", "paused by user — no new entries, existing positions still managed") });
  }
  if (pathname === "/api/autopilot2/resume" && req.method === "POST") {
    return writeJson(res, 200, { ok: true, state: setState("RUNNING", "resumed by user") });
  }
  if (pathname === "/api/autopilot2/off" && req.method === "POST") {
    return writeJson(res, 200, { ok: true, state: setState("OFF", "turned off by user") });
  }

  // Real destructive reset (spec §31) — requires an explicit {confirm:true}
  // body, never a bare click-through.
  if (pathname === "/api/autopilot2/reset" && req.method === "POST") {
    let confirm = false;
    try {
      const raw = await readRequestBody(req);
      const body = raw ? JSON.parse(raw) : {};
      confirm = body.confirm === true;
    } catch {}
    const result = resetAccount({ confirm });
    if (!result.ok) return writeJson(res, 400, { ok: false, error: result.error });
    setState("OFF", "reset by user");
    return writeJson(res, 200, { ok: true });
  }

  return null; // not handled — let the router fall through
}

module.exports = { handleAutopilot2 };
