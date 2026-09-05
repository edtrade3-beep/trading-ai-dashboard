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

// News/price divergence (News Intelligence Engine V1, 2026-09-05, spec
// §12/13 — "News Verdict vs Market Confirmation" / "Contradiction
// Engine"). Same reasoning src/market-context-engine.js's
// detectDivergence already applies to a Fed-signal-vs-price comparison
// (bothUp/bothDown against a directional read) — NOT a literal call into
// that function, since its input is a specific `fedSignal` enum, not a
// news sentiment tier; this is the same pattern applied to news
// sentiment vs. SPY/QQQ instead of Fed signal vs. SPY/QQQ. A neutral-
// sentiment item has no directional read to compare, so it's honestly
// NOT_APPLICABLE rather than forced into ALIGNED/divergent.
function detectNewsDivergence({ sentimentTier, spyChg, qqqChg }) {
  const bullish = sentimentTier === "BULLISH" || sentimentTier === "STRONGLY_BULLISH";
  const bearish = sentimentTier === "BEARISH" || sentimentTier === "STRONGLY_BEARISH";
  if (!bullish && !bearish) return { divergence: "NOT_APPLICABLE", rejectionLabel: null, reason: "Sentiment is neutral — no directional read to compare against real price action." };
  if (!Number.isFinite(spyChg) || !Number.isFinite(qqqChg)) return { divergence: "UNKNOWN", rejectionLabel: null, reason: "Real SPY/QQQ data unavailable right now." };

  const bothUp = spyChg > 0.15 && qqqChg > 0.15;
  const bothDown = spyChg < -0.15 && qqqChg < -0.15;
  if (bearish && bothUp) {
    return {
      divergence: "NEWS_PRICE_DIVERGENCE",
      // rejectionLabel (A+ Market Intelligence V1.1, 2026-09-05) —
      // additive alongside `divergence`, so nothing that already reads
      // `divergence`/`divergenceReason` (V1's shipped code and tests)
      // breaks. Sharper, spec-matching framing (§8/§9's "MARKET
      // REJECTING BULLISH NEWS" / "BEARISH NEWS REJECTED") for direct
      // display, distinguishing which direction was rejected.
      rejectionLabel: "BEARISH_NEWS_REJECTED",
      reason: "Bearish-read headline, but SPY and QQQ are both real up right now — the market may already be pricing this in, or a stronger factor is dominating. Not a confirmed bearish move.",
    };
  }
  if (bullish && bothDown) {
    return {
      divergence: "NEWS_PRICE_DIVERGENCE",
      rejectionLabel: "BULLISH_NEWS_REJECTED",
      reason: "Bullish-read headline, but SPY and QQQ are both real down right now — the market isn't confirming this catalyst.",
    };
  }
  return { divergence: "ALIGNED", rejectionLabel: null, reason: "Market direction is consistent with this headline's real sentiment read." };
}

function confirmationFromRow(row, spyChg, sentimentTier, qqqChg) {
  const divergence = detectNewsDivergence({ sentimentTier, spyChg, qqqChg });
  if (!row) {
    return { available: false, confirmed: null, divergence: divergence.divergence, rejectionLabel: divergence.rejectionLabel, divergenceReason: divergence.reason, reasons: ["Real intraday VWAP/RVOL data unavailable for this ticker right now."] };
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
  if (divergence.divergence === "NEWS_PRICE_DIVERGENCE") reasons.push(divergence.reason);

  return { available: true, confirmed, priceDir, volumeStrong, aboveVwap, marketSupportive, rvol, divergence: divergence.divergence, rejectionLabel: divergence.rejectionLabel, divergenceReason: divergence.reason, reasons };
}

// One real batched fetch for every unique ticker in a news batch, not one
// fetch per headline. Fetches QQQ alongside SPY (News Intelligence
// Engine V1, 2026-09-05) in the SAME batched fetchMarketQuotes call —
// one more symbol, not a new fetch — for the divergence check above.
async function fetchConfirmationRows(tickers) {
  const { fetchDayTradeScanRows, fetchMarketQuotes } = require("../routes/market");
  const { resolveProviderKeys } = require("../config");
  const keys = resolveProviderKeys(new URLSearchParams());

  let rowsBySymbol = {};
  let spyChg = null;
  let qqqChg = null;
  try {
    const { rows } = await fetchDayTradeScanRows(tickers);
    for (const r of rows || []) rowsBySymbol[r.symbol] = r;
  } catch { /* honest-empty below */ }
  try {
    const quotes = await fetchMarketQuotes(["SPY", "QQQ"], keys);
    const spy = (quotes || []).find((q) => String(q.symbol).toUpperCase() === "SPY");
    const qqq = (quotes || []).find((q) => String(q.symbol).toUpperCase() === "QQQ");
    if (spy) spyChg = Number(spy.changesPercentage ?? spy.delta1d ?? 0);
    if (qqq) qqqChg = Number(qqq.changesPercentage ?? qqq.delta1d ?? 0);
  } catch { /* honest-null below */ }

  return { rowsBySymbol, spyChg, qqqChg };
}

async function computeConfirmation(ticker, sentimentTier) {
  const { rowsBySymbol, spyChg, qqqChg } = await fetchConfirmationRows([ticker]);
  return confirmationFromRow(rowsBySymbol[ticker], spyChg, sentimentTier, qqqChg);
}

module.exports = { computeConfirmation, confirmationFromRow, fetchConfirmationRows, detectNewsDivergence };
