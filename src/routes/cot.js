"use strict";
/**
 * Routes for the COT (Commitments of Traders) module.
 *
 * GET  /api/cot/status          — latest scan data + bias summary
 * GET  /api/cot/latest          — same as status (alias for spec)
 * GET  /api/cot/market/:key     — bias for one market by biasKey
 * GET  /api/cot/run-update      — manually trigger CFTC data download
 * GET  /api/cot/run-now         — manually run intraday scan + send Telegram
 * GET  /api/cot/report          — build report text without sending
 * POST /api/cot/telegram/test   — send test message to Telegram
 */

const { writeJson, readRequestBody } = require("../utils");
const {
  updateCOTData,
  getMarketCOTBias,
  getAllCOTBiases,
  getCOTSummary,
  isDataFresh,
  getLatestReportDate,
} = require("../cot/cotService");
const { sendCOTReport, buildReport } = require("../cot/telegramService");
const { scanCOTSymbols } = require("../cot/intradayScanner");
const { loadWatchlistSymbols } = require("../cot/watchlistHelper");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("../telegram");

async function handleCOT(req, res, requestUrl) {
  const { pathname } = requestUrl;

  // ── GET /api/cot/status  or  /api/cot/latest ─────────────────────────────
  if ((pathname === "/api/cot/status" || pathname === "/api/cot/latest") && req.method === "GET") {
    const summary = getCOTSummary();
    return writeJson(res, 200, {
      ok: true,
      fresh: isDataFresh(),
      reportDate: getLatestReportDate(),
      staleWarning: summary.staleWarning,
      summary,
      allBiases: getAllCOTBiases(),
    });
  }

  // ── GET /api/cot/market/:key ──────────────────────────────────────────────
  const mktMatch = pathname.match(/^\/api\/cot\/market\/([a-z0-9_]+)$/i);
  if (mktMatch && req.method === "GET") {
    const key  = mktMatch[1].toLowerCase();
    const bias = getMarketCOTBias(key);
    if (!bias) return writeJson(res, 404, { error: `No COT data for key: ${key}` });
    return writeJson(res, 200, { ok: true, key, bias });
  }

  // ── GET /api/cot/run-update — manual CFTC download ───────────────────────
  if (pathname === "/api/cot/run-update" && req.method === "GET") {
    // Run async, return immediately with job status
    updateCOTData()
      .then(r => console.log("[COT] Manual update done:", r))
      .catch(e => console.error("[COT] Manual update error:", e.message));
    return writeJson(res, 202, { ok: true, message: "COT data update started — check /api/cot/status in ~60s" });
  }

  // ── GET /api/cot/run-now — manual intraday scan + send Telegram ──────────
  if (pathname === "/api/cot/run-now" && req.method === "GET") {
    const watchlist = loadWatchlistSymbols();
    const result = await sendCOTReport("Manual Scan", watchlist);
    return writeJson(res, 200, { ok: result.ok, message: result.ok ? "COT report sent to Telegram" : result.error });
  }

  // ── GET /api/cot/report — build report text only (no send) ───────────────
  if (pathname === "/api/cot/report" && req.method === "GET") {
    const watchlist = loadWatchlistSymbols();
    const scanResult = await scanCOTSymbols(watchlist);
    const text = buildReport("Preview", scanResult);
    return writeJson(res, 200, { ok: true, report: text, scanResult });
  }

  // ── GET /api/cot/debug — test download + show first CSV headers + 2 rows ──
  if (pathname === "/api/cot/debug" && req.method === "GET") {
    const { fetchCOTCsv }   = require("../cot/cotFetcher");
    const { parseCOTCsv }   = require("../cot/cotParser");
    const results = {};
    for (const reportType of ["TFF", "DISAGG", "LEGACY"]) {
      try {
        const { csv, url, stale } = await fetchCOTCsv(reportType);
        const lines   = csv.split(/\r?\n/).filter(l => l.trim());
        const headers = lines[0] ? lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim()) : [];
        const parsed  = parseCOTCsv(csv, reportType);
        const markets = Array.from(parsed.keys()).slice(0, 8);
        results[reportType] = {
          ok: true, url, stale,
          csvBytes: csv.length,
          rowCount: lines.length - 1,
          headers: headers.slice(0, 20),
          marketsSample: markets,
          marketsTotal: parsed.size,
        };
      } catch (err) {
        results[reportType] = { ok: false, error: err.message };
      }
    }
    return writeJson(res, 200, { ok: true, results });
  }

  // ── GET /api/cot/ai-take — last persisted AI take (what to do / avoid) ────
  if (pathname === "/api/cot/ai-take" && req.method === "GET") {
    const { loadCoachLog } = require("../ai-coach-store");
    const log = loadCoachLog();
    return writeJson(res, 200, { ok: true, take: log.cotAiTake || null });
  }

  // ── POST /api/cot/ai-take/refresh — force-generate a fresh AI take ────────
  if (pathname === "/api/cot/ai-take/refresh" && req.method === "POST") {
    const { buildCotAiTake } = require("../cot-ai-take");
    const built = await buildCotAiTake();
    if (!built) return writeJson(res, 200, { ok: false, error: "Could not generate an AI take (ANTHROPIC_API_KEY not set, no COT data loaded yet, or the AI call failed)." });
    return writeJson(res, 200, { ok: true, take: built });
  }

  // ── POST /api/cot/telegram/test ───────────────────────────────────────────
  if (pathname === "/api/cot/telegram/test" && req.method === "POST") {
    if (!telegramConfigured()) {
      return writeJson(res, 400, { error: "Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing)" });
    }
    await sendTelegramMessage("✅ COT Module — Telegram test message\nYour COT bias reports are connected.");
    return writeJson(res, 200, { ok: true, message: "Test message sent" });
  }

  return writeJson(res, 404, { error: "Unknown COT endpoint" });
}

module.exports = handleCOT;
