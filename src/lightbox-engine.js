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

// A short, honest one-line explanation of WHY a symbol is in its current
// state — built only from fields computeDayTradeSignal already computed
// for real (orBreakout, aboveVwap, bull15, rvol, vsVwap), never a
// decorative/generic label. state: "BUY"|"WAIT"|"SELL" (the display
// vocabulary); raw: the computeDayTradeSignal result object for this row.
function computeReason(state, raw) {
  if (!raw) return "";
  const rvol = Number(raw.rvol) || 0;
  const vsVwap = Number(raw.vsVwap ?? (raw.vwap && raw.px ? ((raw.px - raw.vwap) / raw.vwap) * 100 : 0)) || 0;

  if (state === "BUY") {
    if (raw.orBreakout && rvol >= 1.5) return "Breakout + volume confirmation";
    if (raw.orBreakout) return "Opening-range breakout";
    if (raw.bull15 && raw.aboveVwap) return "Above VWAP, EMA stack bullish";
    return "Above VWAP";
  }
  if (state === "SELL") {
    if (!raw.aboveVwap && vsVwap <= -0.3) return "VWAP rejection";
    if (!raw.aboveVwap && !raw.bull15) return "Below VWAP, momentum breakdown";
    if (!raw.aboveVwap) return "Below VWAP";
    return "Bearish momentum";
  }
  // WAIT — closest real condition to flipping, not a generic filler.
  if (raw.aboveVwap && !raw.orBreakout) return "Approaching VWAP breakout";
  if (raw.bull15 && !raw.orBreakout) return "Momentum confirmation building";
  if (rvol >= 1.0 && rvol < 1.5) return "Building volume";
  return "Mixed signals";
}

module.exports = { stepSymbol, computeReason };
