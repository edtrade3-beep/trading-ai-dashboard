"use strict";
// alpaca-closed-trade-feed.js — Unified Autopilot merge, Stage 4 (see
// .claude/plans/proud-yawning-unicorn.md). Feeds the real Alpaca paper
// account's own closed round-trips (already correctly FIFO-matched by
// routes/alpaca.js's getClosedTrades, reused here rather than
// reimplemented) into the canonical trade-gps-audit-store.js, tagged
// source:"alpaca-real" so they're never mixed with Autopilot 2.0's own
// simulated-account records (see that store's own getRecentClosedTrades
// source filter, and autopilot2-engine.js's consecutive-loss breaker,
// which now explicitly reads source:null only).
//
// This is the prerequisite for a real consecutive-loss breaker and a
// canonical journal for the Alpaca-based systems (Stages 5/6 of the
// plan) — it does not itself gate any trade.
//
// getClosedTrades() recomputes the FULL closed-trade history from
// Alpaca's own activity log on every call (not incremental) — this
// adapter dedupes against already-recorded alpaca-real records by a
// real, stable key (symbol + real closedAt + qty + exit price) so
// re-running it (this is meant to run on a schedule) never double-counts
// the same real fill.
// Not destructured — called as alpacaRoutes.getClosedTrades() below so a
// test can monkey-patch the real network call on the same cached module
// object instead of needing a live Alpaca account.
const alpacaRoutes = require("./routes/alpaca");
const { recordSetupEvent, getRawRecordsBySource } = require("./trade-gps-audit-store");

function keyFor(symbol, closedAtMs, qty, exit) {
  return `${symbol}|${closedAtMs}|${qty}|${exit}`;
}

function existingKeys() {
  return new Set(
    getRawRecordsBySource("alpaca-real", { window: 2000 })
      .map((r) => keyFor(r.symbol, r.at, r.outcome?.qty, r.outcome?.exit))
  );
}

async function syncAlpacaClosedTrades() {
  const result = await alpacaRoutes.getClosedTrades();
  if (!result.ok) return { ok: false, error: result.error, synced: 0 };

  const known = existingKeys();
  let synced = 0;
  for (const trade of result.trades) {
    const closedAtMs = trade.closedAt ? new Date(trade.closedAt).getTime() : null;
    if (!closedAtMs) continue; // honest skip — never record a real trade with no real closed timestamp
    const key = keyFor(trade.symbol, closedAtMs, trade.qty, trade.exit);
    if (known.has(key)) continue;

    const notionalAtEntry = trade.entry * trade.qty;
    recordSetupEvent({
      symbol: trade.symbol,
      engineVersion: "alpaca-real-feed-v1",
      source: "alpaca-real",
      tradeStructure: trade.side === "short" ? "SHORT_STOCK" : "LONG_STOCK",
      outcome: {
        pnl: trade.pnl,
        pnlPct: notionalAtEntry > 0 ? (trade.pnl / notionalAtEntry) * 100 : null,
        holdingDays: trade.openedAt ? Math.max(0, (closedAtMs - new Date(trade.openedAt).getTime()) / 86_400_000) : null,
        qty: trade.qty, entry: trade.entry, exit: trade.exit,
      },
      openedAt: trade.openedAt ? new Date(trade.openedAt).getTime() : null,
      nowMs: closedAtMs,
    });
    known.add(key);
    synced++;
  }
  return { ok: true, synced, totalRealTrades: result.trades.length };
}

module.exports = { syncAlpacaClosedTrades };
