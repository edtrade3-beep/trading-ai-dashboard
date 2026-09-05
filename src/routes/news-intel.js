// src/routes/news-intel.js — read-only routes over src/news/store.js's
// persisted, background-tick-computed news items. Same "route just reads,
// a background job does the real work" split as /api/market/lightbox.
"use strict";

const { writeJson } = require("../utils");

async function handleNewsIntel(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;
  const { getFeed, getTickerAggregation, getStatus, isReady } = require("../news/store");

  if (pathname === "/api/news/feed" && req.method === "GET") {
    if (!isReady()) return writeJson(res, 200, { ok: true, status: "DEGRADED", rows: [] });
    const ticker = searchParams.get("ticker") || undefined;
    const category = searchParams.get("category") || undefined;
    const sentiment = searchParams.get("sentiment") || undefined;
    const minImpact = searchParams.get("minImpact") ? Number(searchParams.get("minImpact")) : undefined;
    const sinceMinutes = searchParams.get("sinceMinutes") ? Number(searchParams.get("sinceMinutes")) : undefined;
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 50;
    try {
      const result = await getFeed({ ticker, category, sentiment, minImpact, sinceMinutes, limit });
      return writeJson(res, 200, result);
    } catch (err) {
      return writeJson(res, 502, { ok: false, error: err instanceof Error ? err.message : "News feed query failed." });
    }
  }

  if (pathname.startsWith("/api/news/ticker/") && req.method === "GET") {
    const ticker = pathname.split("/").pop();
    if (!ticker) return writeJson(res, 400, { ok: false, error: "Ticker is required." });
    if (!isReady()) return writeJson(res, 200, { ok: true, status: "DEGRADED", ticker: ticker.toUpperCase(), articleCount: 0 });
    const sinceMinutes = searchParams.get("sinceMinutes") ? Number(searchParams.get("sinceMinutes")) : undefined;
    try {
      const result = await getTickerAggregation(ticker, { sinceMinutes });
      return writeJson(res, 200, result);
    } catch (err) {
      return writeJson(res, 502, { ok: false, error: err instanceof Error ? err.message : "Ticker news aggregation failed." });
    }
  }

  if (pathname === "/api/news/status" && req.method === "GET") {
    try {
      // A cheap, real provider health probe — the last ingestion tick's
      // own recorded heartbeat, not a fresh network call on every status
      // request.
      const { loadHeartbeats } = require("../job-heartbeat");
      const hb = loadHeartbeats()["News Intelligence Ingest"];
      const providerOk = !hb || hb.lastOk !== false;
      const status = await getStatus(providerOk);
      return writeJson(res, 200, { ok: true, ...status });
    } catch (err) {
      return writeJson(res, 200, { ok: true, status: "DEGRADED", reason: err instanceof Error ? err.message : "Status check failed." });
    }
  }

  return writeJson(res, 404, { ok: false, error: "Not found" });
}

module.exports = handleNewsIntel;
