// position-edge-store.js — Post-entry Edge Monitoring (Phase 3 Tier B,
// 2026-08-26, spec Parts 24-26: "once filled... the system changes from
// 'should I enter?' to 'is the original thesis still working?'"). Real
// snapshot of a symbol's Opportunity Object score/tier/EV at the moment
// of a REAL confirmed buy order (captured server-side in
// routes/quick-trade.js, right after a real order succeeds — accurate
// regardless of which UI path triggered the trade, never client-supplied/
// spoofable), then a live re-score diff (routes/alpaca.js's positions
// overlay, same "small real position list, safe to compute live" pattern
// that overlay's own dayTradeState block already uses) classifies how the
// real edge has moved since entry.
//
// Deliberately does NOT try to clear a snapshot on exit: this store is
// naturally self-correcting — a fresh buy() always overwrites the prior
// snapshot for that symbol, and a stale snapshot for a symbol no longer
// held is simply inert (never read, since the overlay only looks up
// snapshots for symbols in the real current positions list).
"use strict";

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "position-edge-snapshots.json");
function loadStore() { return readJsonSafe(STORE_PATH, {}); }
function saveStore(s) { writeJsonAtomic(STORE_PATH, s); }

async function captureEntrySnapshot(symbol) {
  try {
    const { screenTrendTemplate, getTrackReportCached } = require("./routes/market");
    const { computeRegime, regimeToEntryVocabulary } = require("./trade-planner-scoring");
    const { computeOpportunity } = require("./opportunity-engine");
    const { fetchYahooQuoteBatch } = require("./providers/yahoo");

    const MACRO_SYMS = ["SPY", "QQQ", "IWM", "DIA", "^VIX", "UUP", "VIXY", "TLT", "HYG"];
    const [rows, macroQuotes, trackReport] = await Promise.all([
      screenTrendTemplate([symbol]),
      fetchYahooQuoteBatch(MACRO_SYMS).catch(() => []),
      getTrackReportCached(),
    ]);
    const row = rows.find((r) => r.symbol === symbol && !r.error);
    if (!row) return null;
    const macroData = macroQuotes.map((q) => ({ symbol: q.symbol, price: q.regularMarketPrice, changesPercentage: q.regularMarketChangePercent }));
    const regime = computeRegime(macroData);
    const marketRegime = regimeToEntryVocabulary(regime.label);
    const opp = computeOpportunity({ symbol, row, regime, marketRegime, sectorInfo: null, adx: row.technicals?.adx || null, optionsFlow: null, trackReport });
    if (!opp) return null;

    const store = loadStore();
    store[symbol] = { ts: Date.now(), score: opp.score, tier: opp.tier, expectedValue: opp.expectedValue };
    saveStore(store);
    return store[symbol];
  } catch {
    return null; // best-effort — a failed snapshot never blocks the real order that already succeeded
  }
}

function getEntrySnapshot(symbol) {
  const store = loadStore();
  return store[symbol] || null;
}

// Real classification of how a position's edge has moved since entry.
// Pure function, testable. currentTier === "INVALIDATED" is a hard
// override (the real structural/critical-flag gate that produced that
// tier already means the thesis is broken, regardless of the raw score
// delta). Thresholds are on the same 0-100 real score scale
// classifyOpportunityTier's own ACTIONABLE floor (75) lives on — +8/-8/-20
// are real, disclosed, reasoned bands, not silently arbitrary: +8 is
// comfortably above ordinary day-to-day score noise (Edge Velocity's own
// MEANINGFUL_VELOCITY floor is 5), -20 marks a move large enough to
// plausibly cross out of the tier the position was entered in.
function classifyEdgeChange({ entryScore, entryTier, currentScore, currentTier }) {
  if (!Number.isFinite(entryScore) || !Number.isFinite(currentScore)) {
    return { status: "UNKNOWN", delta: null };
  }
  if (currentTier === "INVALIDATED") {
    return { status: "INVALIDATED", delta: round1(currentScore - entryScore) };
  }
  const delta = round1(currentScore - entryScore);
  let status = "STABLE";
  if (delta >= 8) status = "STRENGTHENING";
  else if (delta <= -20) status = "UNDER_PRESSURE";
  else if (delta <= -8) status = "WEAKENING";
  return { status, delta, entryScore, currentScore, entryTier, currentTier };
}
function round1(n) { return Math.round(n * 10) / 10; }

module.exports = { captureEntrySnapshot, getEntrySnapshot, classifyEdgeChange, loadStore, saveStore };
