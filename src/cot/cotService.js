"use strict";
/**
 * cotService.js
 * Orchestrates the full COT pipeline:
 *   fetch → parse → compute bias → store
 *
 * Exported API:
 *   updateCOTData()          — download latest CFTC data, recompute all biases
 *   getMarketCOTBias(key)    — look up stored bias for one market (by biasKey)
 *   getAllCOTBiases()         — return full bias index
 *   getOverallEquityBias()   — aggregate bias for equity indexes
 *   getCOTSummary()          — compact object for Telegram + dashboard
 *   isDataFresh()            — boolean freshness check
 *   getLatestReportDate()    — string YYYY-MM-DD
 */

const path = require("node:path");
const { fetchCOTCsv }      = require("./cotFetcher");
const { parseCOTCsv, findMarketRecords } = require("./cotParser");
const { computeBias }      = require("./cotBiasEngine");
const {
  loadMarketHistory, saveMarketHistory,
  saveBias, getAllBiases, getMarketBias,
  saveMeta, isFresh, latestReportDate,
} = require("./cotStore");

// Static market definitions live in src/cot/ so they are tracked by git
const MARKETS = require("./cotMarkets.json");

// ── Internal: process one report type ────────────────────────────────────────

async function processReportType(reportType) {
  const { csv, stale } = await fetchCOTCsv(reportType);
  const parsed = parseCOTCsv(csv, reportType);

  const marketList = MARKETS[reportType] || [];
  const results = [];

  for (const mkt of marketList) {
    try {
      const freshRecords = findMarketRecords(parsed, mkt.pattern);
      if (!freshRecords.length) {
        console.warn(`[COT] No records found for pattern "${mkt.pattern}" in ${reportType}`);
        continue;
      }

      // Merge with stored history (keeps 52-week window)
      const merged = saveMarketHistory(mkt.biasKey, freshRecords);

      // Compute bias from full history
      const bias = computeBias(merged);

      // Attach metadata
      const stored = {
        ...bias,
        biasKey:  mkt.biasKey,
        symbol:   mkt.symbol,
        name:     mkt.name,
        category: mkt.category,
        yfSymbol: mkt.yfSymbol,
        dataStale: stale,
      };

      saveBias(mkt.biasKey, stored);
      results.push(stored);
      console.log(`[COT] ${mkt.name}: Score ${bias.score}  ${bias.label}  (${bias.reportDate})`);
    } catch (err) {
      console.error(`[COT] Failed to process ${mkt.name}:`, err.message);
    }
  }
  return results;
}

// ── Public: full update cycle ─────────────────────────────────────────────────

let _updating = false;

async function updateCOTData() {
  if (_updating) return { skipped: true, reason: "Update already in progress" };
  _updating = true;
  const startedAt = new Date().toISOString();
  const allResults = [];
  const errors = [];

  try {
    for (const reportType of ["TFF", "DISAGG", "LEGACY"]) {
      try {
        const r = await processReportType(reportType);
        allResults.push(...r);
      } catch (err) {
        console.error(`[COT] ${reportType} pipeline failed:`, err.message);
        errors.push(`${reportType}: ${err.message}`);
      }
    }

    // Only record lastFetchAt when at least one market was updated
    // so that a failed / empty run doesn't mask the stale warning
    const meta = {
      marketsUpdated: allResults.length,
      reportDate:     allResults.find(r => r.reportDate)?.reportDate || null,
      errors:         errors.length ? errors : undefined,
    };
    if (allResults.length > 0) meta.lastFetchAt = startedAt;
    saveMeta(meta);

    console.log(`[COT] Update complete — ${allResults.length} markets, ${errors.length} errors`);
    return { ok: true, marketsUpdated: allResults.length, errors };
  } finally {
    _updating = false;
  }
}

// ── Bias accessors ────────────────────────────────────────────────────────────

function getMarketCOTBias(biasKey) {
  return getMarketBias(biasKey) || null;
}

function getAllCOTBiases() {
  return getAllBiases();
}

/**
 * Aggregate equity bias: average of sp500, nasdaq, dow, russell scores.
 */
function getOverallEquityBias() {
  const keys = ["sp500", "nasdaq", "dow", "russell"];
  const biases = keys.map(k => getMarketBias(k)).filter(Boolean);
  if (!biases.length) return null;
  const avg = Math.round(biases.reduce((s, b) => s + (b.score || 0), 0) / biases.length);
  let label;
  if (avg >= 60)      label = "Strong Bullish";
  else if (avg >= 25) label = "Bullish";
  else if (avg >= -24) label = "Neutral";
  else if (avg >= -59) label = "Bearish";
  else                 label = "Strong Bearish";
  return { score: avg, label, markets: biases.map(b => ({ name: b.name, score: b.score })) };
}

/**
 * Compact summary used by Telegram reports and the dashboard API.
 */
function getCOTSummary() {
  const biases  = getAllBiases();
  const fresh   = isFresh();
  const repDate = latestReportDate();

  const equity = getOverallEquityBias();

  // Category roll-ups
  const roll = (keys) => {
    const bs = keys.map(k => biases[k]).filter(Boolean);
    if (!bs.length) return null;
    const avg = Math.round(bs.reduce((s, b) => s + b.score, 0) / bs.length);
    let lbl;
    if (avg >= 60) lbl = "Strong Bullish";
    else if (avg >= 25) lbl = "Bullish";
    else if (avg >= -24) lbl = "Neutral";
    else if (avg >= -59) lbl = "Bearish";
    else lbl = "Strong Bearish";
    return { score: avg, label: lbl };
  };

  return {
    fresh,
    reportDate:    repDate,
    staleWarning:  !fresh ? "COT data not updated yet. Using latest available report." : null,
    equity:        equity,
    equityBias:    equity?.label || "N/A",
    bondBias:      roll(["10y", "2y"])?.label || "N/A",
    dollarBias:    biases["dxy"]?.label || "N/A",
    goldBias:      biases["gold"]?.label || "N/A",
    oilBias:       biases["crude"]?.label || "N/A",
    bitcoinBias:   biases["bitcoin"]?.label || "N/A",
    vixBias:       biases["vix"]?.label || "N/A",
    allBiases:     biases,
  };
}

// "Fresh" = recently fetched AND actual bias data exists in the index
function isDataFresh()       { return isFresh() && Object.keys(getAllBiases()).length > 0; }
function getLatestReportDate() { return latestReportDate(); }

module.exports = {
  updateCOTData,
  getMarketCOTBias,
  getAllCOTBiases,
  getOverallEquityBias,
  getCOTSummary,
  isDataFresh,
  getLatestReportDate,
};
