"use strict";
// Trade GPS Stage 8 (2026-09-03) — one unified, append-only per-setup
// audit record. Same real persistence convention as autopilot-journal.js
// (readJsonSafe/writeJsonAtomic, atomic writes, never a second store
// format). Performance views are computed via the existing real
// autopilot2-backtest.js's own buildStats (expectancy-equivalent
// avgReturnPct, profit factor, max drawdown) — never reimplemented here,
// per the spec's own "one calculation per metric" mandate.
const path = require("path");
const { readJsonSafe, writeJsonAtomic } = require("./atomic-write");
// Imported from backtest-stats.js (not autopilot2-backtest.js directly)
// to avoid a real circular require: autopilot2-engine.js requires this
// file, and autopilot2-backtest.js itself requires autopilot2-engine.js
// — see backtest-stats.js's own header for the full chain.
const { buildStats } = require("./backtest-stats");

const STORE_PATH = path.join(__dirname, "..", "data", "trade-gps-audit.json");
const MAX_RECORDS = 5000; // a real, disclosed cap — oldest real records pruned first, never silently unbounded growth

function readStore() {
  const data = readJsonSafe(STORE_PATH, { records: [] });
  return Array.isArray(data?.records) ? data.records : [];
}

// Every field is real, caller-supplied context (the full setup this
// codebase already computed for this symbol at this moment) — this
// function never recomputes or infers any of it, only persists it.
function recordSetupEvent({
  symbol = null, engineVersion = null, regime = null, inputTimestamps = null, scoreBreakdown = null,
  tradeStructure = null, verdict = null, riskDecision = null, stateTransition = null,
  outcome = null, slippage = null, optionSpreadCost = null, qualifyReason = null,
  openedAt = null, nowMs = Date.now(),
} = {}) {
  if (!symbol) return null; // honest no-op — never fabricates a record for an unknown symbol
  const record = {
    id: `${symbol}-${nowMs}-${Math.random().toString(36).slice(2, 8)}`,
    symbol, at: nowMs, engineVersion, regime, inputTimestamps, scoreBreakdown,
    tradeStructure, verdict, riskDecision, stateTransition, outcome, slippage, optionSpreadCost, qualifyReason,
    // Trade Navigator Stage 5 (2026-09-03) — the real position-open
    // timestamp (autopilot2-account.js's own real entryAt), additive.
    // Trade Replay Brain's own per-hour analysis needs WHEN a trade was
    // opened, not just when this record was written (which is close time).
    openedAt,
  };
  const records = readStore();
  records.push(record);
  while (records.length > MAX_RECORDS) records.shift();
  writeJsonAtomic(STORE_PATH, { records });
  return record;
}

// A closed-outcome record's own real {pnl, pnlPct, holdingDays} — an open/
// pending record (outcome null) is simply excluded, never treated as a
// real $0 trade.
function toBacktestTrade(record) {
  const pnl = Number(record?.outcome?.pnl);
  if (!Number.isFinite(pnl)) return null;
  const pnlPct = Number.isFinite(record?.outcome?.pnlPct) ? record.outcome.pnlPct : null;
  const holdingDays = Number.isFinite(record?.outcome?.holdingDays) ? record.outcome.holdingDays : null;
  return { pnl, pnlPct, holdingDays };
}

function statsFor(records, startingEquity) {
  const trades = records.map(toBacktestTrade).filter(Boolean);
  let equity = startingEquity;
  const equityCurve = trades.map((t) => { equity += t.pnl; return { equity }; });
  return buildStats(trades, equityCurve, startingEquity);
}

// window: how many of the most recent real closed-outcome records to
// include (spec's own 20|50|100 options — any positive count accepted).
// groupBy: null (one real overall view) | "regime" | "setup" (verdict) |
// "structure" (tradeStructure — stock/call/put/spread, Trade Replay
// Brain's own per-structure breakdown).
function getPerformanceViews({ window = 50, groupBy = null, startingEquity = 100_000 } = {}) {
  const all = readStore();
  const withOutcome = all.filter((r) => r?.outcome != null).slice(-Math.max(1, Number(window) || 50));

  const overall = statsFor(withOutcome, startingEquity);
  if (!groupBy) return { overall, groups: null, sampleSize: withOutcome.length };

  const groups = {};
  for (const r of withOutcome) {
    const key = groupBy === "regime" ? (r.regime ?? "UNKNOWN")
      : groupBy === "setup" ? (r.verdict ?? "UNKNOWN")
      : groupBy === "structure" ? (r.tradeStructure ?? "UNKNOWN")
      : "UNKNOWN";
    (groups[key] ||= []).push(r);
  }
  const groupStats = {};
  for (const [key, records] of Object.entries(groups)) groupStats[key] = statsFor(records, startingEquity);
  return { overall, groups: groupStats, sampleSize: withOutcome.length };
}

// Real ordered closed-trade outcomes (Trade Navigator, 2026-09-03) — for
// risk-guardrails.js's own consecutiveLossBreakerTripped, which needs the
// trailing N real {pnl} outcomes in their real chronological order (this
// store's own natural append order), not an aggregated view.
// getPerformanceViews() above answers "how has this performed," this
// answers "what actually just happened, in order."
function getRecentClosedTrades({ window = 20 } = {}) {
  return readStore().map(toBacktestTrade).filter(Boolean).slice(-Math.max(1, Number(window) || 20));
}

// Real closed records with their full real context (openedAt/
// tradeStructure/pnl/holdingDays), for Trade Replay Brain's own
// per-hour/per-structure/hold-time analysis — richer than
// getRecentClosedTrades' stripped {pnl}-only shape, still never a
// fabricated field for a record that doesn't have real data.
function getClosedRecordsForAnalysis({ window = 100 } = {}) {
  return readStore()
    .filter((r) => r?.outcome != null && Number.isFinite(Number(r.outcome.pnl)))
    .slice(-Math.max(1, Number(window) || 100))
    .map((r) => ({
      symbol: r.symbol, openedAt: r.openedAt || null, tradeStructure: r.tradeStructure || null,
      pnl: Number(r.outcome.pnl), holdingDays: Number.isFinite(r.outcome.holdingDays) ? r.outcome.holdingDays : null,
    }));
}

module.exports = {
  recordSetupEvent, getPerformanceViews, getRecentClosedTrades, getClosedRecordsForAnalysis,
  STORE_PATH, MAX_RECORDS,
};
