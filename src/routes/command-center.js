// routes/command-center.js — thin GET/POST wrappers for the AI Market
// Command Center, same shape as routes/ai-hub.js's ceo-brief/advisor-brief
// pairs: GET returns the last persisted result, POST /refresh generates a
// fresh one on demand (same cost-discipline pattern as every other AI
// feature in this app — not literal continuous polling).
const { writeJson } = require("../utils");
const { loadCoachLog } = require("../ai-coach-store");
const { buildCommandCenter } = require("../command-center-ai");
const { getTrackRecord } = require("../predictions-store");

async function handleCommandCenter(req, res, requestUrl) {
  const { pathname } = requestUrl;

  if (pathname === "/api/command-center" && req.method === "GET") {
    const log = loadCoachLog();
    return writeJson(res, 200, { ok: true, brief: log.commandCenter || null });
  }

  if (pathname === "/api/command-center/refresh" && req.method === "POST") {
    try {
      const built = await buildCommandCenter();
      if (!built) return writeJson(res, 200, { ok: false, error: "Could not generate a Command Center report (ANTHROPIC_API_KEY not set, or no ADVISOR AI brief generated yet)." });
      return writeJson(res, 200, { ok: true, brief: built });
    } catch (e) {
      // Temporary: surfaces command-center-ai.js's real thrown reason
      // (AI call/parse detail) instead of a generic message — no local
      // ANTHROPIC_API_KEY to reproduce production-only failures with, so
      // this is the fastest honest way to see what actually happened.
      return writeJson(res, 200, { ok: false, error: "Could not generate a Command Center report — AI call failed.", debug: e.message });
    }
  }

  if (pathname === "/api/command-center/track-record" && req.method === "GET") {
    return writeJson(res, 200, { ok: true, ...getTrackRecord() });
  }

  return writeJson(res, 404, { error: "Not found" });
}

module.exports = { handleCommandCenter };
