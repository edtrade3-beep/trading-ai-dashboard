// prediction-tracker.js — the real, code-computed grading behind Command
// Center's Track Record. Deliberately NOT an AI self-assessment: every
// open prediction is graded against a real current price, on a schedule,
// the same way every other scheduled checker in this app works
// (server.js's watchlist/entry-zone scanners).
//
// Grading rule for LONG ideas: hit = price reached target1, stopped = price
// fell to/through stop, expired = holdingPeriodDays elapsed with neither.
//
// SHORT grading depends on the SOURCE, because two features populate the
// same stop/target1 fields with OPPOSITE conventions:
//
// - Command Center's SHORT/AVOID cards reuse the real bullish-scan price
//   levels as-is (stop BELOW entry, target ABOVE entry — the same fields a
//   LONG idea on that symbol would have) and flip the win condition: hit =
//   price fell to/through the real stop level (the stock broke down,
//   validating the "avoid" call), stopped = price broke out through the
//   real target instead.
// - X Intel's SHORT predictions (source:"x-intel") compute their own real
//   entry/stop/target from a captured current price with proper mirrored-
//   short semantics: stop ABOVE entry, target BELOW entry, same as a real
//   short trade. Grading these with Command Center's flipped rule reads
//   "stop" (just above entry) as the success condition — confirmed live:
//   this graded 20 real X-Intel shorts as "hit" within an hour of
//   generation, regardless of real price movement, because "price <=
//   entry+3%" is true almost immediately for any barely-moved short.
//
// expired = holdingPeriodDays elapsed with neither hit nor stopped.
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
    // Anything not explicitly "x-intel" keeps the original Command Center
    // borrowed-bullish-scan/flipped-condition behavior — safe default for
    // legacy records with no source field too (predictions-store.js
    // defaults those to "command-center").
    const isBorrowedBullishShort = !isLong && pred.source !== "x-intel";
    const hitLevel = isLong ? pred.target1 : (isBorrowedBullishShort ? pred.stop : pred.target1);
    const stopLevel = isLong ? pred.stop : (isBorrowedBullishShort ? (pred.target1 ?? pred.target2) : pred.stop);

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
