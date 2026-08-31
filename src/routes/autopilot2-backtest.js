// routes/autopilot2-backtest.js — thin GET wrapper for the real Autopilot
// 2.0 engine backtest (src/autopilot2-backtest.js). On-demand, run
// synchronously per request (compute-bound once real historical bars are
// fetched, no AI call) — symbols capped so one request can't run away,
// same real precedent as the existing /api/market/backtest route.
"use strict";

const { writeJson } = require("../utils");
const { runAutopilot2Backtest } = require("../autopilot2-backtest");
const { SCAN_UNIVERSE } = require("../advisor-ai");

const MAX_SYMBOLS = 15;
const DEFAULT_SYMBOLS = SCAN_UNIVERSE.slice(0, MAX_SYMBOLS);

async function handleAutopilot2Backtest(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;

  if (pathname === "/api/autopilot2/backtest" && req.method === "GET") {
    const requested = (searchParams.get("symbols") || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const symbols = (requested.length ? requested : DEFAULT_SYMBOLS).slice(0, MAX_SYMBOLS);
    const years = Math.max(1, Math.min(3, Number(searchParams.get("years")) || 1));
    try {
      const result = await runAutopilot2Backtest(symbols, { years });
      const truncated = requested.length > MAX_SYMBOLS ? { requestedCount: requested.length, ranCount: symbols.length, cap: MAX_SYMBOLS } : null;
      return writeJson(res, 200, { ...result, truncated });
    } catch (e) {
      return writeJson(res, 200, { ok: false, error: e instanceof Error ? e.message : "backtest failed" });
    }
  }

  return writeJson(res, 404, { error: "Not found" });
}

module.exports = { handleAutopilot2Backtest, DEFAULT_SYMBOLS };
