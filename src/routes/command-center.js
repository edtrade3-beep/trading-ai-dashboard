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
      // buildCommandCenter() no longer throws on an AI failure — real data
      // (regime, trade cards with real price levels, portfolio risk, CEO
      // verdict) builds regardless, with built.aiUnavailable/aiError
      // disclosing when the event feed/narrative layer couldn't run. Only
      // the two genuine preconditions (no API key, no Advisor AI brief
      // yet) return null.
      const built = await buildCommandCenter();
      if (!built) return writeJson(res, 200, { ok: false, error: "Could not generate a Command Center report (ANTHROPIC_API_KEY not set, or no ADVISOR AI brief generated yet)." });
      return writeJson(res, 200, { ok: true, brief: built });
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: "Could not generate a Command Center report.", debug: e.message });
    }
  }

  if (pathname === "/api/command-center/track-record" && req.method === "GET") {
    return writeJson(res, 200, { ok: true, ...getTrackRecord() });
  }

  return writeJson(res, 404, { error: "Not found" });
}

module.exports = { handleCommandCenter };
