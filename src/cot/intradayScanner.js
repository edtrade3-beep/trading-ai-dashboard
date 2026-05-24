"use strict";
/**
 * intradayScanner.js
 * Scans the core COT watchlist symbols with the existing analyzeSymbol
 * engine and enriches each result with its COT bias alignment.
 *
 * Does NOT duplicate the full market-scanner symbol list — this is the
 * focused list used specifically for COT-enhanced Telegram reports.
 */

const { analyzeSymbol } = require("../market-scanner");
const { getMarketCOTBias, getCOTSummary } = require("./cotService");
const { cotAlignment } = require("./cotBiasEngine");
const { withTimeout } = require("../utils");

// Symbols included in every COT report
const COT_SCAN_SYMBOLS = [
  "SPY", "QQQ", "IWM", "DIA",
  "^VIX",
  "TLT", "SHY",
  "GLD", "SLV",
  "USO", "UNG",
  "UUP",
  "NVDA", "TSLA", "AAPL", "MSFT", "AMD", "META",
  "BTC-USD",
];

// Map Yahoo symbol → COT biasKey
const SYMBOL_TO_COT_KEY = {
  "SPY":   "sp500",
  "QQQ":   "nasdaq",
  "IWM":   "russell",
  "DIA":   "dow",
  "^VIX":  "vix",
  "TLT":   "10y",
  "SHY":   "2y",
  "GLD":   "gold",
  "SLV":   "silver",
  "USO":   "crude",
  "UNG":   "natgas",
  "UUP":   "dxy",
  "BTC-USD": "bitcoin",
};

async function scanCOTSymbols(extraSymbols = []) {
  const allSymbols = [...new Set([...COT_SCAN_SYMBOLS, ...extraSymbols.map(s => s.toUpperCase())])];
  const cotSummary = getCOTSummary();

  // Parallel analysis with 12s timeout per symbol
  const results = await Promise.allSettled(
    allSymbols.map(sym => withTimeout(analyzeSymbol(sym), 14_000, null))
  );

  const enriched = [];
  for (let i = 0; i < allSymbols.length; i++) {
    const sym = allSymbols[i];
    const r   = results[i];
    if (r.status !== "fulfilled" || !r.value) continue;

    const a = r.value;
    const cotKey  = SYMBOL_TO_COT_KEY[sym];
    const cotBias = cotKey ? getMarketCOTBias(cotKey) : null;

    // Determine intraday direction
    const intradayDir = a.composite >= 60 ? "BUY" : a.composite <= 40 ? "SELL" : "HOLD";

    enriched.push({
      ...a,
      cotBias,
      cotAlignment: cotAlignment(intradayDir, cotBias),
      intradayDir,
    });
  }

  // Sort by composite score descending
  enriched.sort((a, b) => b.composite - a.composite);

  // Top setups: A+ score ≥ 70, RVOL ≥ 1.5, 9 EMA > 21 EMA (emaAligned === "↑")
  const topSetups = enriched.filter(a =>
    a.composite >= 70 &&
    a.rvol >= 1.5 &&
    a.emaAligned === "↑"
  ).slice(0, 5);

  // Caution list: COT strongly opposed to intraday, or crowded/extreme positioning
  const cautionList = enriched.filter(a =>
    a.cotAlignment === "opposed" ||
    (a.cotBias && a.cotBias.positioningExtreme)
  ).slice(0, 4);

  return { enriched, topSetups, cautionList, cotSummary, scannedAt: new Date().toISOString() };
}

module.exports = { scanCOTSymbols, COT_SCAN_SYMBOLS };
