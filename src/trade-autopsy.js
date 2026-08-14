// trade-autopsy.js — automatic post-trade grading (explicit user request,
// 2026-08-14: "which one do I need most" -> autopsy, over the R-multiple
// readout, specifically because it's passive/after-the-fact rather than
// something requiring live attention). The moment a real round-trip trade
// closes (getClosedTrades()'s FIFO fill-matching over real Alpaca paper
// activities — routes/alpaca.js, already the source of truth /api/alpaca/
// closed-trades uses), this compares the real fill against the real plan
// on file (autopilot-journal.js's appendJournal, written at entry by
// server-autopilot.js and any client buy tagged with setupTag) and reports
// facts, not a verdict: real entry slippage, real R-multiple realized vs.
// the real risk unit, and whether the exit landed near the real stop, the
// real target, or neither. Untagged/manual trades (no journal match) are
// honestly reported as pnl/hold-time only — no plan to grade against.
//
// Real-time, NOT routed through the morning digest (src/alert-buffer.js) —
// this is a one-off receipt per closed trade, not a recurring opportunity
// scan, so there's no natural batching window and no reason to delay it.
"use strict";

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");
const { isMarketHoursET } = require("./risk-guardrails");
const { readJournal } = require("./autopilot-journal");
const { journalMatchFor } = require("./journal-analytics");

const STORE_PATH = path.join(ROOT, "data", "trade-autopsy-state.json");
const STOP_TOLERANCE = 0.02;   // 2% — normal slippage past a real stop still counts as "honored"
const TARGET_TOLERANCE = 0.02; // 2% — near enough to the real target counts as "hit"

function loadState() {
  return readJsonSafe(STORE_PATH, { seen: {}, seeded: false });
}
function saveState(s) {
  writeJsonAtomic(STORE_PATH, s);
}

// Deterministic key for a FIFO-matched round trip — getClosedTrades() has
// no persistent id (it's recomputed fresh from raw fills every call), but
// symbol+closedAt+qty+exit is stable across calls for the same real trade.
function tradeKey(t) {
  return `${t.symbol}|${t.closedAt}|${t.qty}|${t.exit}`;
}

function fmtHold(openedAt, closedAt) {
  if (!openedAt || !closedAt) return null;
  const ms = new Date(closedAt) - new Date(openedAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const hrs = ms / 3_600_000;
  if (hrs < 1) return `${Math.round(ms / 60_000)}m`;
  if (hrs < 24) return `${hrs.toFixed(1)}h`;
  return `${(hrs / 24).toFixed(1)}d`;
}

function gradeTrade(t, match) {
  const win = t.pnl > 0;
  const result = `${win ? "+" : ""}$${t.pnl.toFixed(2)} (${win ? "WIN" : "LOSS"})`;
  const hold = fmtHold(t.openedAt, t.closedAt);
  const base = [
    `📋 TRADE CLOSED — ${t.symbol}`,
    `Result: ${result}`,
    `Entry $${t.entry.toFixed(2)} → Exit $${t.exit.toFixed(2)} · ${t.qty} sh${hold ? ` · held ${hold}` : ""}`,
  ];

  if (!match || !match.entry || !match.stop) {
    base.push("No real plan on file for this trade (untagged/manual entry) — logged for the record only.");
    return base.join("\n");
  }

  const slipPct = match.entry ? ((t.entry - match.entry) / match.entry) * 100 : null;
  const risk = match.entry > match.stop ? match.entry - match.stop : null;
  const rMultiple = risk && match.qty ? t.pnl / (risk * match.qty) : null;

  const planParts = [`Plan: entry $${match.entry.toFixed(2)}`];
  if (slipPct != null && Math.abs(slipPct) >= 0.05) planParts.push(`(${slipPct >= 0 ? "+" : ""}${slipPct.toFixed(1)}% slippage)`);
  planParts.push(`· stop $${match.stop.toFixed(2)}`);
  if (match.target) planParts.push(`· target $${match.target.toFixed(2)}`);
  base.push(planParts.join(" "));

  if (rMultiple != null) base.push(`R: ${rMultiple >= 0 ? "+" : ""}${rMultiple.toFixed(1)}R`);

  if (match.target && t.exit >= match.target * (1 - TARGET_TOLERANCE)) {
    base.push("Exit at/near the real target — plan followed.");
  } else if (t.exit <= match.stop * (1 + STOP_TOLERANCE)) {
    base.push(t.exit < match.stop
      ? `Exited past the real stop ($${t.exit.toFixed(2)} vs $${match.stop.toFixed(2)}) — bigger loss than the planned risk unit.`
      : "Stopped out at/near the real stop — risk plan honored.");
  } else if (win) {
    base.push("Closed for a win before reaching the real target — early exit, not a plan violation by itself.");
  } else {
    base.push("Closed for a loss without hitting the real stop — exited manually ahead of plan.");
  }

  return base.join("\n");
}

async function checkTradeAutopsy() {
  if (!telegramConfigured()) return { ok: true, skipped: "telegram not configured" };
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };

  let getClosedTrades;
  try { ({ getClosedTrades } = require("./routes/alpaca")); } catch { return { ok: false, checked: 0, graded: [] }; }

  const { ok, trades } = await getClosedTrades().catch(() => ({ ok: false, trades: [] }));
  if (!ok || !Array.isArray(trades) || !trades.length) return { ok: true, checked: 0, graded: [] };

  const state = loadState();
  const seen = state.seen || {};
  const isFirstRun = !state.seeded;
  const journal = readJournal();
  const graded = [];

  // Oldest-unseen-first so a burst of overnight/multi-trade closes sends in
  // real chronological order, not FIFO-array order (which is newest-first).
  const unseen = trades.filter((t) => !seen[tradeKey(t)]).sort((a, b) => new Date(a.closedAt) - new Date(b.closedAt));

  for (const t of unseen) {
    const key = tradeKey(t);
    seen[key] = true;
    if (isFirstRun) continue; // seed silently — don't autopsy trades that closed before this job existed
    const match = journalMatchFor(t, journal);
    const text = gradeTrade(t, match);
    graded.push({ symbol: t.symbol, closedAt: t.closedAt, text });
  }

  saveState({ seen, seeded: true });

  for (const g of graded) {
    await sendTelegramMessage(g.text).catch(() => {});
  }

  return { ok: true, checked: trades.length, graded: graded.map((g) => ({ symbol: g.symbol, closedAt: g.closedAt })) };
}

module.exports = { checkTradeAutopsy };
