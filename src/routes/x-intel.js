// routes/x-intel.js — X Intelligence Engine API. No X API/scraping
// anywhere in this file or what it calls — see x-intel-ai.js's header for
// the full explanation of why and what real mechanism is used instead.
const { writeJson, readRequestBody } = require("../utils");
const watchlistStore = require("../x-intel-watchlist-store");
const { listItems, getRecent } = require("../x-intel-store");
const { getTrackRecord } = require("../predictions-store");
const { runXIntelGeneration } = require("../x-intel-ai");
const { runXIntelRssPoll } = require("../x-intel-rss");
const xIntelEngine = require("../x-intel-engine");
const { PORT } = require("../config");
const anthropicUsage = require("../anthropic-usage-store");
const creditSaverMode = require("../credit-saver-mode");

async function getJson(p) {
  try { const r = await fetch(`http://127.0.0.1:${process.env.PORT || PORT || 3000}${p}`); return await r.json(); } catch { return null; }
}

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
    // Run both: the free RSS path always attempts (no API key, no cost),
    // the AI search path may fail (e.g. usage cap) independently — a
    // refresh should still surface real RSS items even when AI is down,
    // rather than the whole click reporting one combined failure.
    const [ai, rss] = await Promise.all([
      runXIntelGeneration().catch((e) => ({ ok: false, error: e.message })),
      runXIntelRssPoll().catch((e) => ({ ok: false, error: e.message })),
    ]);
    return writeJson(res, 200, {
      ok: ai.ok || rss.ok,
      ai,
      rss,
      newItemsCount: (ai.newItemsCount || 0) + (rss.newItemsCount || 0),
      scanned: ai.scanned,
    });
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

  // ── X Intelligence Engine v2 — consolidation-layer endpoints. All real,
  // deterministic, zero-new-AI-cost (see x-intel-engine.js's header). ──

  if (pathname === "/api/x-intel/trend" && req.method === "GET") {
    const velocity = xIntelEngine.computeTrendVelocity();
    const unusualActivity = velocity.slice(0, 15).map((v) => xIntelEngine.computeUnusualActivity(v.symbol));
    return writeJson(res, 200, { ok: true, velocity, unusualActivity });
  }

  if (pathname === "/api/x-intel/sentiment" && req.method === "GET") {
    const symbol = (searchParams.get("symbol") || "").toUpperCase();
    if (!symbol) return writeJson(res, 400, { ok: false, error: "symbol required" });
    const trend = xIntelEngine.computeSentimentTrend(symbol);
    return writeJson(res, 200, { ok: true, trend });
  }

  if (pathname === "/api/x-intel/regime" && req.method === "GET") {
    // Real regime/VIX/distribution-risk/persistence data already computed
    // by Command Center — read it rather than recomputing a 5th scorer.
    const cc = await getJson("/api/command-center");
    const brief = cc?.brief;
    if (!brief?.regime) return writeJson(res, 200, { ok: true, taxonomy: null, note: "Command Center brief not yet generated — refresh it first" });
    const taxonomy = xIntelEngine.mapToRegimeTaxonomy({
      regimeLabel: brief.regime.label,
      regimeScore: brief.regime.score,
      volRegime: brief.regime.detail?.volRegime,
      distributionRiskScore: brief.distributionRisk?.riskScore,
      regimeShift: brief.regimeShift,
    });
    return writeJson(res, 200, { ok: true, taxonomy, regime: brief.regime, regimeShift: brief.regimeShift });
  }

  if (pathname === "/api/x-intel/watchlist-rankings" && req.method === "GET") {
    const rankings = await xIntelEngine.computeWatchlistRankings();
    return writeJson(res, 200, { ok: true, rankings });
  }

  if (pathname === "/api/x-intel/digest" && req.method === "GET") {
    const digest = xIntelEngine.buildLiveDigest();
    return writeJson(res, 200, { ok: true, digest });
  }

  if (pathname === "/api/x-intel/alert-checks" && req.method === "GET") {
    // Read-only detection — does not send Telegram alerts itself. Real
    // dispatch (through telegram-bot.js's existing gate) is wired from the
    // same scheduled job that already runs the AI-search pass, matching
    // the plan's "no new dedup system" consolidation.
    const recent = getRecent(150);
    const mentionedSymbols = [...new Set(recent.flatMap((it) => (it.marketImpact || []).map((m) => m.symbol)))];
    const sectorFlips = xIntelEngine.detectSectorSentimentFlip(mentionedSymbols);
    const fedStanceChange = xIntelEngine.detectFedStanceChange();
    return writeJson(res, 200, { ok: true, sectorFlips, fedStanceChange });
  }

  // ── Credit Management System — real Anthropic API spend, whole-account
  // (Anthropic bills account-wide, not per-feature; X Intel is the biggest
  // real lever, not the only real cost source — see the approved plan). ──

  if (pathname === "/api/x-intel/budget" && req.method === "GET") {
    const today = anthropicUsage.getTodayUsage();
    const month = anthropicUsage.getMonthUsage();
    const projection = anthropicUsage.getMonthEndProjection();
    const remaining = anthropicUsage.getRemainingBudget();
    const avgDaily = anthropicUsage.getAverageDailySpend();
    const byFeature = anthropicUsage.getCostByFeature();
    const mode = creditSaverMode.getState();
    return writeJson(res, 200, {
      ok: true,
      budgetUSD: creditSaverMode.BUDGET_USD,
      today, month, projection, remaining, avgDaily, byFeature, mode,
      thresholds: anthropicUsage.THRESHOLDS,
    });
  }

  return writeJson(res, 404, { error: "Not found" });
}

module.exports = { handleXIntel };
