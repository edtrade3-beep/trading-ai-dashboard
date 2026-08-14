// watchlist-sniper-alerts.js — real Telegram alert when a tracked symbol's
// AI Sniper verdict (ENTER LONG / WAIT / NO CHASE / AVOID, see
// src/sniper-decision.js) changes state. Explicit user request (2026-08-10,
// 2026-08-11): "wire AI Sniper Scanner Pro in Telegram... when to get out
// before stock goes down and get in before stock goes up" — then widened
// further the same day ("I DONT WANT TO THINK TOO MUCH I WANT PLATFORM TO
// WORK ME" / "THE SYSTEM TELL ME EARLY OR ON TIME BUY SELL EARLY OR ON
// TIME"): a curated Watchlist alone could miss a real ENTER_LONG on a
// symbol the user simply hadn't added yet. Scope is now the union of the
// user's real Watchlist and the full ~100-symbol scan universe
// (SCAN_UNIVERSE) — same real "watchlist + SCAN_UNIVERSE" union pattern
// src/adol22-scanner.js already established for the identical reason,
// reused here rather than inventing a second one. Market hours only.
//
// Two real transitions fire an alert:
//   BUY      — verdict newly becomes ENTER_LONG (get in before it goes up).
//   GET OUT  — verdict moves from ENTER_LONG to NO_CHASE or AVOID (a live
//              opportunity is now flashing exhaustion/breakdown risk — get
//              out before it goes down). A plain WAIT/AVOID transition that
//              never passed through ENTER_LONG isn't a "get out" — nothing
//              was ever a live entry to exit.
// First-ever check for a symbol seeds its baseline silently (no alert),
// same convention watchlist-turn-alerts.js uses — otherwise every symbol
// would "turn" on the very first run after a deploy.
"use strict";

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { isConfigured: telegramConfigured } = require("./telegram");
const { pushDigestLines } = require("./alert-buffer");
const { loadWatchlist } = require("./routes/watchlist");
const { isMarketHoursET } = require("./risk-guardrails");
const { computeSniperDecision } = require("./sniper-decision");
const { PORT } = require("./config");

const STORE_PATH = path.join(ROOT, "data", "watchlist-sniper-actions.json");
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;

function loadActions() {
  return readJsonSafe(STORE_PATH, {});
}
function saveActions(v) {
  writeJsonAtomic(STORE_PATH, v);
}

async function checkWatchlistSniperTurns() {
  if (!telegramConfigured()) return { ok: true, skipped: "telegram not configured" };
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };
  const { SCAN_UNIVERSE } = require("./advisor-ai");
  const { symbols: watchlistSymbols } = loadWatchlist();
  const symbols = [...new Set([...(watchlistSymbols || []), ...SCAN_UNIVERSE])];
  if (!symbols.length) return { ok: true, checked: 0, turns: [] };

  let screenWatchlistCached;
  try { ({ screenWatchlistCached } = require("./routes/market")); } catch { return { ok: false, checked: 0, turns: [] }; }

  const prev = loadActions();
  const next = { ...prev };
  const turns = [];

  const rows = await screenWatchlistCached(symbols).catch(() => []);
  for (const row of rows) {
    if (row.error) continue;
    const symbol = row.symbol;
    const d = computeSniperDecision(row);
    const action = d.action;
    if (!action) continue;
    const last = prev[symbol];
    next[symbol] = action;
    if (!last || last === action) continue; // no prior baseline (seed silently) or unchanged

    if (action === "ENTER_LONG") {
      turns.push({ symbol, direction: "buy", from: last, to: action, d });
    } else if (last === "ENTER_LONG" && (action === "NO_CHASE" || action === "AVOID")) {
      turns.push({ symbol, direction: "exit", from: last, to: action, d });
    }
  }

  saveActions(next);

  if (turns.length) {
    const lines = turns.map((t) => {
      const url = `${BASE()}/?symbol=${encodeURIComponent(t.symbol)}&open=sniper`;
      if (t.direction === "buy") {
        return `🟢 ${t.symbol} — ENTER LONG (was ${t.from === "ENTER_LONG" ? "—" : t.from}): ${t.d.reason}${t.d.entry != null ? ` · Entry $${t.d.entry.toFixed(2)} · Stop $${t.d.stop.toFixed(2)} · Target $${t.d.target2?.toFixed(2) ?? "—"}${t.d.rr != null ? ` · R:R ${t.d.rr.toFixed(1)}:1` : ""}` : ""} · ${url}`;
      }
      return `🟠 ${t.symbol} — GET OUT WARNING (${t.to === "AVOID" ? "AVOID" : "NO CHASE"}, was ENTER LONG): ${t.d.reason} · ${url}`;
    });
    pushDigestLines("watchlist-sniper", "🎯 AI SNIPER", lines);
  }

  return { ok: true, checked: symbols.length, turns };
}

module.exports = { checkWatchlistSniperTurns };
