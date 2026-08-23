// watchlist-sniper-alerts.js — real Telegram alerts when a tracked symbol
// (Watchlist ∪ SCAN_UNIVERSE) reaches a real, unified BUY-family decision,
// or when a symbol that had reached one now shows GET-OUT risk. Explicit
// user request (2026-08-10, 2026-08-11): "wire AI Sniper Scanner Pro in
// Telegram... when to get out before stock goes down and get in before
// stock goes up" — then widened further the same day ("I DONT WANT TO
// THINK TOO MUCH I WANT PLATFORM TO WORK ME" / "THE SYSTEM TELL ME EARLY
// OR ON TIME BUY SELL EARLY OR ON TIME"): a curated Watchlist alone could
// miss a real entry on a symbol the user simply hadn't added yet. Scope is
// the union of the user's real Watchlist and the full ~100-symbol scan
// universe (SCAN_UNIVERSE) — same real "watchlist + SCAN_UNIVERSE" union
// pattern src/adol22-scanner.js already established, reused here rather
// than inventing a second one. Market hours only.
//
// Migrated off computeSniperDecision (Master Build Spec phase 7,
// 2026-08-23) — the old pre-unification verdict engine (ENTER_LONG/WAIT/
// NO_CHASE/AVOID). A prior audit assumed this migration would need real
// 4H/1H MTF data fetched for ~100-150 symbols (a real cost/latency
// tradeoff) — that assumption was wrong: Phase 5 already proved a real,
// honest daily-only pipeline works here (classifyDeepScanDecision, src/
// btc-hpc-scan.js, reads purely off computeEntryPlan's stage/entryPrice +
// a quality score, zero MTF dependency). Reuses Phase 5's exact
// already-built, already-tested ev-construction (buildEvFromRow),
// actionable-decision set, and transition check (shouldAlert), all
// imported from watchlist-setup-alerts.js rather than duplicated — one
// real calculation, not two independently-maintained copies (spec §14).
//
// Two real transitions fire an alert:
//   BUY      — decision newly reaches an actionable BUY-family state
//              (BUY/A_PLUS_EARLY_BUY/PULLBACK_BUY) with zero critical red
//              flags (spec §8-9's "never hidden by a good decision").
//   GET OUT  — decision moves from an actionable state to AVOID (real
//              structural break/failed breakout) or EXTENDED (confirmed
//              breakout but too far extended to chase) — the new
//              pipeline's real equivalents of the old NO_CHASE/AVOID
//              pair. A transition that never passed through an actionable
//              state isn't a "get out" — nothing was ever a live entry.
// First-ever check for a symbol seeds its baseline silently, same
// convention watchlist-turn-alerts.js/watchlist-setup-alerts.js use.
//
// Known, pre-existing, disclosed overlap (not introduced by this
// migration): a watchlist symbol can trigger a similarly-worded BUY alert
// from both this file and watchlist-setup-alerts.js — the same real
// overlap existed before either file's migration, just via two different
// old formulas. Not deduplicated here — this file's own real, unique
// value (the wider SCAN_UNIVERSE, and the GET OUT transition) stays
// intact regardless.
"use strict";

const path = require("node:path");
const { ROOT, PORT, resolveProviderKeys } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { isConfigured: telegramConfigured } = require("./telegram");
const { pushDigestLines } = require("./alert-buffer");
const { loadWatchlist } = require("./routes/watchlist");
const { isMarketHoursET } = require("./risk-guardrails");
const { computeEntryPlan } = require("./entry-engine");
const { computeRedFlags } = require("./red-flag-engine");
const { computeCoreScore, classifyCoreVerdict } = require("./am-core-engine");
const { buildEvFromRow, shouldAlert, ACTIONABLE_DECISIONS } = require("./watchlist-setup-alerts");

const STORE_PATH = path.join(ROOT, "data", "watchlist-sniper-actions.json");
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;

// Real GET-OUT verdict — a symbol that was actionable and is now here has
// a real, structural reason to reconsider. One Engine Migration Phase 6
// (2026-08-23): was new Set(["AVOID", "EXTENDED"]) off the retired
// classifyDeepScanDecision. classifyCoreVerdict's hard-gate cascade
// collapses both structure-broken AND do-not-chase/extended into the
// single AVOID_LONG verdict (different reason text, same verdict) — so
// there's now one real GET-OUT state, not two.
const GET_OUT_DECISIONS = new Set(["AVOID_LONG"]);

function loadActions() {
  return readJsonSafe(STORE_PATH, {});
}
function saveActions(v) {
  writeJsonAtomic(STORE_PATH, v);
}

// Real, pure, per-symbol transition check. lastDecision == null seeds
// silently (no prior baseline). Returns "buy", "exit", or null.
function classifyTransition(lastDecision, decision, criticalFlagCount) {
  if (lastDecision == null) return null;
  if (shouldAlert(lastDecision, decision, criticalFlagCount)) return "buy";
  if (ACTIONABLE_DECISIONS.has(lastDecision) && GET_OUT_DECISIONS.has(decision)) return "exit";
  return null;
}

async function checkWatchlistSniperTurns() {
  if (!telegramConfigured()) return { ok: true, skipped: "telegram not configured" };
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };
  const { SCAN_UNIVERSE } = require("./advisor-ai");
  const { symbols: watchlistSymbols } = loadWatchlist();
  const symbols = [...new Set([...(watchlistSymbols || []), ...SCAN_UNIVERSE])];
  if (!symbols.length) return { ok: true, checked: 0, turns: [] };

  let screenWatchlistCached, fetchMarketQuotes, computeRegime, regimeToEntryVocabulary, computeAPlusScore;
  try {
    ({ screenWatchlistCached, fetchMarketQuotes } = require("./routes/market"));
    ({ computeRegime, regimeToEntryVocabulary, computeAPlusScore } = require("./trade-planner-scoring"));
  } catch { return { ok: false, checked: 0, turns: [] }; }

  const macroRows = await fetchMarketQuotes(["SPY", "QQQ", "VIXY"], resolveProviderKeys(new URLSearchParams())).catch(() => []);
  const regime = computeRegime(Array.isArray(macroRows) ? macroRows : []);
  const marketRegime = regimeToEntryVocabulary(regime.label);

  const prev = loadActions();
  const next = { ...prev };
  const turns = [];

  const rows = await screenWatchlistCached(symbols).catch(() => []);
  for (const row of rows) {
    if (row.error) continue;
    const symbol = row.symbol;
    const ev = buildEvFromRow(row, marketRegime);
    const entryPlan = computeEntryPlan(ev);
    const redFlagResult = computeRedFlags(ev);
    const { score: aPlusScore } = computeAPlusScore(row, regime);
    const coreScore = computeCoreScore({
      passCount: row.passCount, rsRating: row.rsRating, momentum: row.momentum,
      stage: row.stage, volRatio: row.volRatio, regime, sectorInfo: null,
      adx: null, smc: row.smc, epsGrowth: row.epsGrowth, vcpScore: row.vcpScore,
      riskPct: row.riskPct, pctFromHigh: row.pctFromHigh, antiChase: ev.antiChase,
      optionsFlow: null, dollarVolume: row.dollarVolume,
    });
    const deep = classifyCoreVerdict({
      score: coreScore.score, entryPlan, redFlagResult,
      stage: row.stage, dailyBias: ev.dailyBias, entryScore: aPlusScore,
      hasPosition: false,
    });
    const last = prev[symbol];

    const transition = classifyTransition(last, deep.verdict, redFlagResult.criticalCount);
    next[symbol] = deep.verdict;
    if (transition === "buy") {
      turns.push({ symbol, direction: "buy", from: last, to: deep.verdict, entryPlan, reason: deep.reason });
    } else if (transition === "exit") {
      turns.push({ symbol, direction: "exit", from: last, to: deep.verdict, reason: deep.reason });
    }
  }

  saveActions(next);

  if (turns.length) {
    const fmt = (v) => Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : "—";
    const lines = turns.map((t) => {
      const url = `${BASE()}/?symbol=${encodeURIComponent(t.symbol)}&open=sniper`;
      if (t.direction === "buy") {
        return `🟢 ${t.symbol} — ${t.to.replace(/_/g, " ")} (was ${t.from}): ${t.reason} · Entry ${fmt(t.entryPlan.entryPrice)} · Stop ${fmt(t.entryPlan.stop)} · Target ${fmt(t.entryPlan.target1)} · ${url}`;
      }
      return `🟠 ${t.symbol} — GET OUT WARNING (${t.to}, was ${t.from}): ${t.reason} · ${url}`;
    });
    pushDigestLines("watchlist-sniper", "🎯 AI SNIPER", lines);
  }

  return { ok: true, checked: symbols.length, turns };
}

module.exports = { checkWatchlistSniperTurns, classifyTransition };
