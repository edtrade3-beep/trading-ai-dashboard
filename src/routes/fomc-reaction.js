"use strict";
// routes/fomc-reaction.js — real HTTP surface for the live FOMC reaction
// tracker (src/fomc-reaction-tracker.js). Same standalone-route-file
// convention as routes/future-value-scan.js.
const { writeJson } = require("../utils");
const { buildFomcReaction } = require("../fomc-reaction-tracker");

// GET /api/market/fomc-reaction?date=YYYY-MM-DD&symbols=SPY,QQQ
async function handleFomcReaction(req, res, requestUrl) {
  try {
    const date = requestUrl.searchParams.get("date") || undefined;
    const symbolsParam = requestUrl.searchParams.get("symbols");
    const symbols = symbolsParam ? symbolsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : undefined;
    const result = await buildFomcReaction({ date, symbols });
    return writeJson(res, 200, result);
  } catch (err) {
    return writeJson(res, 200, { ok: false, error: err instanceof Error ? err.message : "FOMC reaction tracker unavailable." });
  }
}

module.exports = { handleFomcReaction };
