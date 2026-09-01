// routes/money-ideas.js — thin GET/POST wrappers for the daily 8:45 AM
// ET Money Ideas scan, same shape as routes/curbline-intel.js.
"use strict";

const { writeJson } = require("../utils");
const { loadCoachLog } = require("../ai-coach-store");
const { buildMoneyIdeas } = require("../money-ideas-ai");
const { acquireRefreshLock } = require("../refresh-cooldown");

async function handleMoneyIdeas(req, res, requestUrl) {
  const { pathname } = requestUrl;

  if (pathname === "/api/money-ideas" && req.method === "GET") {
    const log = loadCoachLog();
    return writeJson(res, 200, { ok: true, ideas: log.moneyIdeas || null });
  }

  if (pathname === "/api/money-ideas/refresh" && req.method === "POST") {
    // Cost-control cooldown (2026-09-01 audit) — see refresh-cooldown.js.
    const lock = acquireRefreshLock("money-ideas", 15000);
    if (!lock.ok) return writeJson(res, 429, { ok: false, error: `Already refreshing (or refreshed too recently) — try again in ${Math.ceil(lock.retryAfterMs / 1000)}s.` });
    try {
      const built = await buildMoneyIdeas();
      if (!built) return writeJson(res, 200, { ok: false, error: "Could not generate Money Ideas (ANTHROPIC_API_KEY not set)." });
      if (built.aiUnavailable) return writeJson(res, 200, { ok: false, error: "Money Ideas AI call failed this run — try again shortly.", debug: built.aiError });
      return writeJson(res, 200, { ok: true, ideas: built });
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: "Could not generate Money Ideas.", debug: e.message });
    } finally { lock.release(); }
  }

  return writeJson(res, 404, { error: "Not found" });
}

module.exports = { handleMoneyIdeas };
