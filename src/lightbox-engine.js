// lightbox-engine.js — pure confirmation/debounce math for the Live Trade
// Light Box. Zero I/O (no fetch, no filesystem) — same purity level as
// day-trade-calc.js, so this is directly unit-testable with hand-built
// inputs. The stateful orchestration (fetching real scan rows, persisting,
// scheduling) lives in lightbox-state-store.js, mirroring the existing
// day-trade-calc.js (pure) / watchlist-daytrade-alerts.js (orchestration +
// persistence) split.
//
// Why gate on `generatedAt` and not raw poll count: fetchDayTradeScanRows
// (src/routes/market.js) caches its real result for ~55s. If confirmation
// counted every tick of the background job's own interval, most "ticks"
// would just be re-observing the same cached scan — confirmation would
// complete almost instantly regardless of the configured confirmBars,
// defeating the whole point of the debounce. Gating on generatedAt means
// one confirmation "tick" = one genuinely new underlying data fetch.
"use strict";

// prevEntry: { confirmed, pendingSignal, pendingCount, lastGeneratedAt } | undefined
// rawSignal: "GREEN" | "YELLOW" | "RED" (computeDayTradeSignal's own signal field)
// generatedAt: ISO string from fetchDayTradeScanRows's response
// confirmBars: number of consecutive distinct-generatedAt agreements required to flip `confirmed`
function stepSymbol(prevEntry, rawSignal, generatedAt, confirmBars) {
  if (prevEntry && prevEntry.lastGeneratedAt === generatedAt) return prevEntry; // same data fetch — no-op, don't advance the counter

  // First-seen-per-symbol seeds `confirmed` immediately (same convention
  // watchlist-daytrade-alerts.js uses for `prev[symbol] || {}`) — avoids
  // every symbol starting on a misleading default color while a real
  // confirmation window plays out.
  const confirmed = prevEntry?.confirmed ?? rawSignal;
  const candidate = prevEntry?.pendingSignal ?? confirmed;

  if (rawSignal === candidate) {
    const pendingCount = (prevEntry?.pendingCount ?? 0) + 1;
    const flips = pendingCount >= confirmBars && rawSignal !== confirmed;
    return {
      confirmed: flips ? rawSignal : confirmed,
      pendingSignal: rawSignal,
      pendingCount,
      lastGeneratedAt: generatedAt,
    };
  }

  // The raw signal changed mid-confirmation — restart the count against the new candidate.
  return {
    confirmed,
    pendingSignal: rawSignal,
    pendingCount: 1,
    lastGeneratedAt: generatedAt,
  };
}

module.exports = { stepSymbol };
