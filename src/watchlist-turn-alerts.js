// watchlist-turn-alerts.js — real Telegram alert when a Watchlist symbol's
// real unified decision (BUY-family vs. not) changes state. "Turned GO" =
// real buy signal; "turned away from GO" = real sell/exit signal.
//
// Migrated off row.verdict (Master Build Spec phase 8, 2026-08-23) — that
// field was `_buildTrendTemplate`'s own baked-in legacy verdict system
// (routes/market.js), a THIRD, separate formula from the two engines
// already retired from the other 6 alert files this session
// (trade-planner-scoring.js's computeAPlusScore, sniper-decision.js's
// computeSniperDecision). `_buildTrendTemplate`/setup.verdict itself is
// deliberately left untouched — it has real, wide fan-out (Autopilot's
// auto-watchlist gate, 2 client-side browser-notification triggers) that
// this migration does not need to disturb; only this one alert file's own
// trigger now reads the unified pipeline instead, exactly the same
// contained pattern watchlist-setup-alerts.js/watchlist-sniper-alerts.js
// already established (buildEvFromRow -> computeEntryPlan ->
// computeRedFlags -> classifyDeepScanDecision, reused directly from
// watchlist-setup-alerts.js rather than duplicated, spec §14).
//
// Reads the flattened row from screenWatchlistCached's batched scan
// (routes/market.js) rather than looping buildTrendTemplate per symbol
// (switched 2026-07-29, CTO audit item #4 — the old loop redundantly
// refetched SPY bars once per symbol with no shared cache across this
// file's own run, let alone across the other watchlist-*-alerts.js jobs
// scanning the same symbols).
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
const { ROOT, resolveProviderKeys } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { isConfigured: telegramConfigured } = require("./telegram");
const { pushDigestLines } = require("./alert-buffer");
const { loadWatchlist } = require("./routes/watchlist");
const { isMarketHoursET } = require("./risk-guardrails");
const { computeEntryPlan } = require("./entry-engine");
const { computeRedFlags } = require("./red-flag-engine");
const { classifyDeepScanDecision } = require("./btc-hpc-scan");
const { buildEvFromRow, shouldAlert, ACTIONABLE_DECISIONS } = require("./watchlist-setup-alerts");

const STORE_PATH = path.join(ROOT, "data", "watchlist-verdicts.json");

// Real, pure, per-symbol transition check. lastDecision == null seeds
// silently. "sell" fires on ANY drop out of the actionable set (not just
// to a specific state) — matches this file's own original, simpler
// "turned away from GO" semantic (unlike watchlist-sniper-alerts.js's
// narrower GET_OUT_DECISIONS, which distinguishes AVOID/EXTENDED from a
// plain WAIT for a different real reason there).
function classifyTurn(lastDecision, decision, criticalFlagCount) {
  if (lastDecision == null) return null;
  if (shouldAlert(lastDecision, decision, criticalFlagCount)) return "buy";
  if (ACTIONABLE_DECISIONS.has(lastDecision) && !ACTIONABLE_DECISIONS.has(decision)) return "sell";
  return null;
}

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

  let screenWatchlistCached, fetchMarketQuotes, computeRegime, regimeToEntryVocabulary, computeAPlusScore;
  try {
    ({ screenWatchlistCached, fetchMarketQuotes } = require("./routes/market"));
    ({ computeRegime, regimeToEntryVocabulary, computeAPlusScore } = require("./trade-planner-scoring"));
  } catch { return { ok: false, checked: 0, turns: [] }; }

  const macroRows = await fetchMarketQuotes(["SPY", "QQQ", "VIXY"], resolveProviderKeys(new URLSearchParams())).catch(() => []);
  const regime = computeRegime(Array.isArray(macroRows) ? macroRows : []);
  const marketRegime = regimeToEntryVocabulary(regime.label);

  const prev = loadVerdicts();
  const next = { ...prev };
  const turns = [];

  // screenWatchlistCached (batched, cached), not a per-symbol
  // buildTrendTemplate loop — the old loop called buildTrendTemplate once
  // per symbol without passing spyMom, so every single symbol independently
  // refetched real SPY bars just to compute its own RS rating (CTO audit
  // item #4: N redundant SPY fetches per run, before even counting the
  // other two watchlist jobs' separate re-scans of the same symbols).
  const rows = await screenWatchlistCached(symbols).catch(() => []);
  for (const row of rows) {
    if (row.error) continue;
    const symbol = row.symbol;
    const ev = buildEvFromRow(row, marketRegime);
    const entryPlan = computeEntryPlan(ev);
    const redFlagResult = computeRedFlags(ev);
    const { score: aPlusScore } = computeAPlusScore(row, regime);
    const deep = classifyDeepScanDecision({ entryPlan, aPlusScore });
    const last = prev[symbol];

    const turn = classifyTurn(last, deep.decision, redFlagResult.criticalCount);
    next[symbol] = deep.decision;
    if (turn) turns.push({ symbol, direction: turn, from: last, to: deep.decision });
  }

  saveVerdicts(next);

  if (turns.length) {
    const lines = turns.map((t) => `${t.direction === "buy" ? "🟢 BUY" : "🔴 SELL/EXIT"} — ${t.symbol}: ${t.from.replace(/_/g, " ")} → ${t.to.replace(/_/g, " ")}`);
    pushDigestLines("watchlist-turn", "📊 WATCHLIST TURN", lines);
  }

  return { ok: true, checked: symbols.length, turns };
}

module.exports = { checkWatchlistTurns, classifyTurn };
