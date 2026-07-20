// prediction-tracker.js — the real, code-computed grading behind Command
// Center's Track Record. Deliberately NOT an AI self-assessment: every
// open prediction is graded against a real current price, on a schedule,
// the same way every other scheduled checker in this app works
// (server.js's watchlist/entry-zone scanners).
//
// Grading rule for LONG ideas: hit = price reached target1, stopped = price
// fell to/through stop, expired = holdingPeriodDays elapsed with neither.
//
// SHORT/AVOID ideas came from the same real trend-template scan as LONG
// ideas (entry/stop/target are inherently framed for a bullish breakout —
// this platform has no separate short-specific price-level source), so the
// win condition is flipped rather than treated as a mirrored short entry:
// hit = price fell to/through the real stop level (the stock broke down,
// validating the "avoid, this is weak" call), stopped = price instead broke
// out through the real target (the avoid call was wrong), expired = holding
// period elapsed with neither.
const { getOpenPredictions, resolvePrediction } = require("./predictions-store");
const { fetchYahooQuoteBatch } = require("./providers/yahoo");

const DAY_MS = 24 * 60 * 60 * 1000;

async function runPredictionTracker() {
  const open = getOpenPredictions();
  if (!open.length) return;

  const symbols = [...new Set(open.map((p) => p.symbol))];
  let quotes = [];
  try { quotes = await fetchYahooQuoteBatch(symbols); } catch { return; }
  const priceBySymbol = {};
  for (const q of quotes) {
    const price = Number(q.regularMarketPrice);
    if (Number.isFinite(price) && price > 0) priceBySymbol[String(q.symbol || "").toUpperCase()] = price;
  }

  for (const pred of open) {
    const price = priceBySymbol[pred.symbol];
    if (!price) continue; // no real current price — leave open rather than guess

    const isLong = pred.direction === "LONG";
    const hitLevel = isLong ? pred.target1 : pred.stop;
    const stopLevel = isLong ? pred.stop : (pred.target1 ?? pred.target2);

    let status = null;
    if (hitLevel != null && (isLong ? price >= hitLevel : price <= hitLevel)) status = "hit";
    else if (stopLevel != null && (isLong ? price <= stopLevel : price >= stopLevel)) status = "stopped";
    else {
      const ageMs = Date.now() - new Date(pred.generatedAt).getTime();
      const holdingMs = (pred.holdingPeriodDays || 20) * DAY_MS;
      if (ageMs >= holdingMs) status = "expired";
    }

    if (status) {
      try { resolvePrediction(pred.id, status, price); } catch { /* leave open, retry next run */ }
    }
  }
}

module.exports = { runPredictionTracker };
