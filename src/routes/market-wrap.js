// routes/market-wrap.js — thin GET/POST wrappers for the daily 4:30 PM
// ET Market Wrap, same shape as routes/research-intel.js: GET returns
// the last persisted result, POST /refresh generates a fresh one on
// demand.
"use strict";

const { writeJson } = require("../utils");
const { loadCoachLog } = require("../ai-coach-store");
const { buildMarketWrap } = require("../market-wrap-ai");
const { acquireRefreshLock } = require("../refresh-cooldown");

async function handleMarketWrap(req, res, requestUrl) {
  const { pathname } = requestUrl;

  if (pathname === "/api/market-wrap" && req.method === "GET") {
    const log = loadCoachLog();
    return writeJson(res, 200, { ok: true, wrap: log.marketWrap || null });
  }

  if (pathname === "/api/market-wrap/refresh" && req.method === "POST") {
    // Cost-control cooldown (2026-09-01 audit) — see refresh-cooldown.js.
    const lock = acquireRefreshLock("market-wrap", 15000);
    if (!lock.ok) return writeJson(res, 429, { ok: false, error: `Already refreshing (or refreshed too recently) — try again in ${Math.ceil(lock.retryAfterMs / 1000)}s.` });
    try {
      const built = await buildMarketWrap();
      if (!built) return writeJson(res, 200, { ok: false, error: "Could not generate a market wrap (ANTHROPIC_API_KEY not set)." });
      if (built.aiUnavailable) return writeJson(res, 200, { ok: false, error: "Market Wrap AI call failed this run — try again shortly.", debug: built.aiError });
      return writeJson(res, 200, { ok: true, wrap: built });
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: "Could not generate a market wrap.", debug: e.message });
    } finally { lock.release(); }
  }

  return writeJson(res, 404, { error: "Not found" });
}

module.exports = { handleMarketWrap };
