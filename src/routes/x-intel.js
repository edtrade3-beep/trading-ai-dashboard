// routes/x-intel.js — X Intelligence Engine API. No X API/scraping
// anywhere in this file or what it calls — see x-intel-ai.js's header for
// the full explanation of why and what real mechanism is used instead.
const { writeJson, readRequestBody } = require("../utils");
const watchlistStore = require("../x-intel-watchlist-store");
const { listItems, getRecent } = require("../x-intel-store");
const { getTrackRecord } = require("../predictions-store");
const { runXIntelGeneration } = require("../x-intel-ai");

async function handleXIntel(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;

  if (pathname === "/api/x-intel/watchlist" && req.method === "GET") {
    return writeJson(res, 200, { ok: true, watchlist: watchlistStore.list() });
  }

  if (pathname === "/api/x-intel/watchlist" && req.method === "POST") {
    let body = {};
    try { body = JSON.parse((await readRequestBody(req)) || "{}"); } catch {}
    try {
      const entry = watchlistStore.add(body);
      return writeJson(res, 200, { ok: true, entry });
    } catch (e) {
      return writeJson(res, 400, { ok: false, error: e.message });
    }
  }

  if (pathname === "/api/x-intel/watchlist" && req.method === "PATCH") {
    let body = {};
    try { body = JSON.parse((await readRequestBody(req)) || "{}"); } catch {}
    if (!body.id) return writeJson(res, 400, { ok: false, error: "id required" });
    const entry = watchlistStore.update(body.id, body);
    if (!entry) return writeJson(res, 404, { ok: false, error: "not found" });
    return writeJson(res, 200, { ok: true, entry });
  }

  if (pathname === "/api/x-intel/watchlist" && req.method === "DELETE") {
    const id = searchParams.get("id");
    if (!id) return writeJson(res, 400, { ok: false, error: "id required" });
    const removed = watchlistStore.remove(id);
    return writeJson(res, 200, { ok: removed });
  }

  if (pathname === "/api/x-intel/refresh" && req.method === "POST") {
    const result = await runXIntelGeneration();
    return writeJson(res, 200, result);
  }

  if (pathname === "/api/x-intel/feed" && req.method === "GET") {
    const n = Math.max(1, Math.min(300, Number(searchParams.get("limit")) || 100));
    return writeJson(res, 200, { ok: true, items: getRecent(n) });
  }

  if (pathname === "/api/x-intel/search" && req.method === "GET") {
    const items = listItems({
      symbol: searchParams.get("symbol") || undefined,
      entity: searchParams.get("entity") || undefined,
      category: searchParams.get("category") || undefined,
      keyword: searchParams.get("keyword") || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      limit: searchParams.get("limit") || undefined,
    });
    return writeJson(res, 200, { ok: true, items });
  }

  if (pathname === "/api/x-intel/track-record" && req.method === "GET") {
    return writeJson(res, 200, { ok: true, ...getTrackRecord("x-intel") });
  }

  return writeJson(res, 404, { error: "Not found" });
}

module.exports = { handleXIntel };
