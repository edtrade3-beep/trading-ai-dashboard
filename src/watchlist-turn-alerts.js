// watchlist-turn-alerts.js — real Telegram alert when a Watchlist symbol's
// chart verdict (GO/WAIT/AVOID, the same real signal shown as the chart's
// "OVERALL RATING" badge) changes state. "Turned GO" = real buy signal;
// "turned away from GO" = real sell/exit signal. Reads the flattened
// row.verdict from screenWatchlistCached's batched scan (routes/market.js)
// rather than looping buildTrendTemplate per symbol (switched 2026-07-29,
// CTO audit item #4 — the old loop redundantly refetched SPY bars once per
// symbol with no shared cache across this file's own run, let alone across
// the other two watchlist-*-alerts.js jobs scanning the same symbols).
//
// Scope is explicitly the user's Watchlist only (2026-07-26, explicit user
// choice over an AskUserQuestion) — NOT open positions, which already have
// their own real invalidation-warning path in trailing-stops.js's
// checkInvalidations (a different real signal source: sellSignals against
// an actually-held cost basis, not a general browse-any-symbol verdict).
// Read-only — never places or modifies a trade, so this does not need the
// SERVER_AUTOPILOT gate that trailing-stops.js's stop-ratcheting requires.
"use strict";

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");
const { shouldSendAlert } = require("./telegram-bot");
const { loadWatchlist } = require("./routes/watchlist");
const { isMarketHoursET } = require("./risk-guardrails");

const STORE_PATH = path.join(ROOT, "data", "watchlist-verdicts.json");

function loadVerdicts() {
  return readJsonSafe(STORE_PATH, {});
}
function saveVerdicts(v) {
  writeJsonAtomic(STORE_PATH, v);
}

// Real, persisted per-symbol last-known verdict — a plain in-memory Set
// (like trailing-stops.js's warnedInvalidations) would lose state on every
// redeploy and re-alert on the first check after each restart; Watchlist
// symbols are checked far less often (this isn't a 5-min position-health
// loop) so a durable store is worth the extra file, same atomic-write
// pattern used everywhere else in this app.
async function checkWatchlistTurns() {
  if (!telegramConfigured()) return { ok: true, skipped: "telegram not configured" };
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };
  const { symbols } = loadWatchlist();
  if (!Array.isArray(symbols) || !symbols.length) return { ok: true, checked: 0, turns: [] };

  let screenWatchlistCached;
  try { ({ screenWatchlistCached } = require("./routes/market")); } catch { return { ok: false, checked: 0, turns: [] }; }

  const prev = loadVerdicts();
  const next = { ...prev };
  const turns = [];

  // screenWatchlistCached (batched, cached), not a per-symbol
  // buildTrendTemplate loop — the old loop called buildTrendTemplate once
  // per symbol without passing spyMom, so every single symbol independently
  // refetched real SPY bars just to compute its own RS rating (CTO audit
  // item #4: N redundant SPY fetches per run, before even counting the
  // other two watchlist jobs' separate re-scans of the same symbols).
  // screenTrendTemplate's row.verdict is the identical real field
  // (row.setup.verdict flattened) the old per-symbol tt.setup.verdict read.
  const rows = await screenWatchlistCached(symbols).catch(() => []);
  for (const row of rows) {
    if (row.error) continue;
    const symbol = row.symbol;
    const verdict = row.verdict; // GO / WAIT / AVOID
    if (!verdict) continue;
    const last = prev[symbol];
    next[symbol] = verdict;
    if (!last || last === verdict) continue; // no prior baseline (seed silently) or unchanged — not a real "turn"
    if (verdict === "GO") turns.push({ symbol, direction: "buy", from: last, to: verdict });
    else if (last === "GO") turns.push({ symbol, direction: "sell", from: last, to: verdict });
  }

  saveVerdicts(next);

  if (turns.length && shouldSendAlert({ category: "watchlist-turn" })) {
    const lines = turns.map((t) => `${t.direction === "buy" ? "🟢 BUY" : "🔴 SELL/EXIT"} — ${t.symbol}: ${t.from} → ${t.to}`);
    await sendTelegramMessage(`📊 *WATCHLIST TURN*\n\n${lines.join("\n")}`).catch(() => {});
  }

  return { ok: true, checked: symbols.length, turns };
}

module.exports = { checkWatchlistTurns };
