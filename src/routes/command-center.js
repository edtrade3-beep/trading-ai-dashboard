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
    const built = await buildCommandCenter();
    if (!built) return writeJson(res, 200, { ok: false, error: "Could not generate a Command Center report (ANTHROPIC_API_KEY not set, no ADVISOR AI brief generated yet, or the AI call failed)." });
    return writeJson(res, 200, { ok: true, brief: built });
  }

  if (pathname === "/api/command-center/track-record" && req.method === "GET") {
    return writeJson(res, 200, { ok: true, ...getTrackRecord() });
  }

  return writeJson(res, 404, { error: "Not found" });
}

module.exports = { handleCommandCenter };
