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

        // Bearish fallback (2026-08-31, bidirectional trading) — only
        // surfaced when there's no real long ACTIONABLE candidate this
        // tick, never competing pound-for-pound against the long side's
        // EV-based ranking above: expectedValue isn't computed for the
        // bearish read yet (see opportunity-engine.js's v1 disclosure),
        // so an EV-vs-score cross-scale ranking would misrepresent
        // quality rather than honestly compare it. Ranked by the real
        // bearish score instead (same 0-100 scale both directions share).
        if (!bestOpportunity) {
          const allOpps = Object.values(scan.tiers || {}).flat();
          const shortCandidates = allOpps.filter((o) =>
            (o.bearishVerdict === "EARLY_SHORT" || o.bearishVerdict === "SHORT") && !heldSymbols.has(o.symbol));
          const bestShort = shortCandidates.sort((a, b) => (b.bearishScore ?? -Infinity) - (a.bearishScore ?? -Infinity))[0];
          if (bestShort) {
            bestOpportunity = {
              symbol: bestShort.symbol, direction: "SHORT", verdict: bestShort.bearishVerdict,
              verdictReason: bestShort.bearishVerdictReason, score: bestShort.bearishScore,
              stage: null, probability: null, expectedValue: null, chaseRisk: null,
            };
          }
        }
      } catch { bestOpportunity = null; } // honest omission — status still returns the real account either way

      // Real job heartbeat (2026-08-31) — surfaces whether the scheduled
      // 5-min tick job (server.js's registerJob) has actually run
      // recently and succeeded, not just whether the state is RUNNING.
      // "RUNNING" only means new entries are allowed when the tick DOES
      // fire — it says nothing about whether the tick itself is actually
      // executing on schedule. Real, disclosed visibility instead of
      // silently assuming the scheduler is healthy.
      let heartbeat = null;
      try {
        const { loadHeartbeats } = require("../job-heartbeat");
        heartbeat = loadHeartbeats()["ADOL22 Autopilot 2.0"] || null;
      } catch { heartbeat = null; }

      return writeJson(res, 200, { ok: true, state, account, activity: recentActivity(50), bestOpportunity, heartbeat });
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

  // Real forward-outcome report for candidates Autopilot 2.0 detected but
  // did NOT enter (Autopilot goal spec, 2026-08-30 — "record why they were
  // missed and what happened afterward"). ?daysAgo= how many real days
  // back to require before a record counts as resolvable (default 5).
  // Honest available:false while the log is too young, same discipline as
  // /api/market/edge-decay.
  if (pathname === "/api/autopilot2/missed-opportunities" && req.method === "GET") {
    try {
      const { buildMissedOpportunityReport } = require("../missed-opportunity-tracker");
      const daysAgo = Math.max(1, Math.min(60, Number(requestUrl.searchParams.get("daysAgo")) || 5));
      const report = await buildMissedOpportunityReport({ daysAgo });
      return writeJson(res, 200, { ok: true, ...report });
    } catch (err) {
      return writeJson(res, 200, { ok: false, error: err instanceof Error ? err.message : "report failed" });
    }
  }

  // Real manual tick trigger (2026-08-31, diagnostic) — invokes the exact
  // same real tick() the scheduled 5-min job calls, so a real run can be
  // observed and its real result inspected directly, instead of waiting
  // up to 5 real minutes and hoping the scheduled run logged something.
  // Same real risk gates apply — this can never bypass them, it just
  // runs them on demand.
  if (pathname === "/api/autopilot2/tick-now" && req.method === "POST") {
    try {
      const result = await require("../autopilot2-engine").tick();
      return writeJson(res, 200, { ok: true, result });
    } catch (err) {
      return writeJson(res, 200, { ok: false, error: err instanceof Error ? err.message : "tick failed" });
    }
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
