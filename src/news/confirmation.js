// src/news/confirmation.js — price/volume confirmation (spec §7). Reuses
// real, already-fetched intraday data — fetchDayTradeScanRows (real VWAP/
// RVOL/momentum, the same real fields Light Box/Day Trade Console already
// read) and fetchMarketQuotes (real SPY change) — no new market-data
// pipeline. Lazy-required to avoid a require cycle with routes/market.js.
//
// Split into a pure `confirmationFromRow` (given already-fetched data) and
// a batch fetcher `fetchConfirmationRows` (one real fetchDayTradeScanRows/
// fetchMarketQuotes call for a whole set of tickers) so the ingestion
// pipeline never re-fetches the same ticker's intraday data once per
// headline — per spec §16, "do not make a request for every ticker
// individually." `computeConfirmation` stays as a single-ticker
// convenience wrapper for callers outside the batch pipeline (e.g.
// re-scoring one item on demand).
"use strict";

function confirmationFromRow(row, spyChg, sentimentTier) {
  if (!row) {
    return { available: false, confirmed: null, reasons: ["Real intraday VWAP/RVOL data unavailable for this ticker right now."] };
  }
  const priceDir = Number(row.chg) > 0 ? "up" : Number(row.chg) < 0 ? "down" : "flat";
  const rvol = Number.isFinite(Number(row.rvol)) ? Number(row.rvol) : null;
  const volumeStrong = rvol != null && rvol >= 1.5;
  const aboveVwap = !!row.aboveVwap;
  const marketSupportive = spyChg != null ? spyChg > -0.2 : null;

  const bullish = sentimentTier === "BULLISH" || sentimentTier === "STRONGLY_BULLISH";
  const bearish = sentimentTier === "BEARISH" || sentimentTier === "STRONGLY_BEARISH";

  let confirmed = null;
  const reasons = [`Price ${priceDir}, RVOL ${rvol != null ? rvol.toFixed(2) + "x" : "—"}, ${aboveVwap ? "above" : "below"} VWAP${marketSupportive == null ? "" : marketSupportive ? ", market supportive" : ", market not supportive"}.`];
  if (bullish) {
    confirmed = priceDir === "up" && volumeStrong && aboveVwap && marketSupportive !== false;
  } else if (bearish) {
    confirmed = priceDir === "down" && volumeStrong && !aboveVwap;
  } else {
    reasons.push("Sentiment is neutral — no directional read to confirm against.");
  }

  return { available: true, confirmed, priceDir, volumeStrong, aboveVwap, marketSupportive, rvol, reasons };
}

// One real batched fetch for every unique ticker in a news batch, not one
// fetch per headline.
async function fetchConfirmationRows(tickers) {
  const { fetchDayTradeScanRows, fetchMarketQuotes } = require("../routes/market");
  const { resolveProviderKeys } = require("../config");
  const keys = resolveProviderKeys(new URLSearchParams());

  let rowsBySymbol = {};
  let spyChg = null;
  try {
    const { rows } = await fetchDayTradeScanRows(tickers);
    for (const r of rows || []) rowsBySymbol[r.symbol] = r;
  } catch { /* honest-empty below */ }
  try {
    const quotes = await fetchMarketQuotes(["SPY"], keys);
    const spy = (quotes || [])[0];
    if (spy) spyChg = Number(spy.changesPercentage ?? spy.delta1d ?? 0);
  } catch { /* honest-null below */ }

  return { rowsBySymbol, spyChg };
}

async function computeConfirmation(ticker, sentimentTier) {
  const { rowsBySymbol, spyChg } = await fetchConfirmationRows([ticker]);
  return confirmationFromRow(rowsBySymbol[ticker], spyChg, sentimentTier);
}

module.exports = { computeConfirmation, confirmationFromRow, fetchConfirmationRows };
