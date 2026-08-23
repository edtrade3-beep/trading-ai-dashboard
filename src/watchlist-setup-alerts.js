// watchlist-setup-alerts.js — real Telegram alert for Watchlist symbols
// reaching a real, unified BUY-family decision (Master Build Spec phase 5,
// 2026-08-23 — migrated off the pre-unification computeAPlusScore
// threshold + raw atBuyPoint flag, which had no anti-chase, structure, or
// Red Flag Engine gating at all).
//
// Uses classifyDeepScanDecision (src/btc-hpc-scan.js), the SAME real
// decision function SmartScanTab.jsx and the BTC+HPC scan already use for
// this exact daily-only cross-sectional row shape — NOT
// simple-decision.js's computeSimpleDecision, which assumes real 4H/1H/
// 15M MTF data is available (it hard-blocks on missing structure
// otherwise) that this scan tier genuinely doesn't have.
// classifyDeepScanDecision instead reads purely off entry-engine.js's
// computeEntryPlan stage/entryPrice + a real quality score, degrading
// honestly when narrower evidence is all that's available — exactly
// entry-engine.js's own designed-for use case.
//
// computeAPlusScore (trade-planner-scoring.js, the old pre-unification
// engine) is still called here, but only to supply classifyDeepScanDecision
// its real quality-score input (same real use SmartScanTab.jsx already
// makes of it) — it no longer drives the alert trigger itself.
//
// Same real persisted-diff pattern as watchlist-turn-alerts.js (durable
// store survives redeploys, first-seen-per-symbol seeds silently rather
// than alerting). Uses screenTrendTemplate (not buildTrendTemplate) because
// atBuyPoint and the flattened row shape computeEntryPlan/computeAPlusScore
// need (abovePivotPct, pctFromHigh, riskPct, confidence, vcpGrade, ...) are
// only produced by screenTrendTemplate's real cross-sectional RS pass —
// the same real engine the Sniper Scanner and Best Opportunities already
// use.
"use strict";

const path = require("node:path");
const { ROOT, resolveProviderKeys } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { isConfigured: telegramConfigured } = require("./telegram");
const { pushDigestLines } = require("./alert-buffer");
const { loadWatchlist } = require("./routes/watchlist");
const { isMarketHoursET } = require("./risk-guardrails");
const { computeAntiChase } = require("./atr-risk-engine");
const { computeEntryPlan } = require("./entry-engine");
const { computeRedFlags } = require("./red-flag-engine");
const { classifyDeepScanDecision } = require("./btc-hpc-scan");

const STORE_PATH = path.join(ROOT, "data", "watchlist-setup-state.json");

// The real "actionable BUY-family" decisions classifyDeepScanDecision can
// return — excludes AVOID/EXTENDED/WAIT. Matches this function's own
// naming (every alert-worthy state literally has "BUY" in its name).
// Exported and reused directly by watchlist-sniper-alerts.js (Master
// Build Spec phase 7) — one real list, not two independently-maintained
// copies.
const ACTIONABLE_DECISIONS = new Set(["BUY", "A_PLUS_EARLY_BUY", "PULLBACK_BUY"]);

function loadState() {
  return readJsonSafe(STORE_PATH, {});
}
function saveState(s) {
  writeJsonAtomic(STORE_PATH, s);
}

// Builds the real ev object computeEntryPlan/computeRedFlags need from a
// daily-only cross-sectional scan row (screenWatchlistCached's shape) —
// same real derivation SmartScanTab.jsx's entryPlanSS already established
// for this exact row shape. swing4hState/volTrend1h are honestly left out
// (no MTF data at this scan tier) — computeEntryPlan/computeRedFlags
// already exclude absent real inputs from their gates/flags rather than
// fabricating a fail, per their own established design.
function buildEvFromRow(row, marketRegime) {
  const dailyBias = (String(row.stage || "").includes("2") && Number(row.passCount || 0) >= 6) ? "BULLISH"
    : String(row.stage || "").includes("4") ? "BEARISH" : "NEUTRAL";
  // target1 = entry + 1R, the same real conservative-first-target
  // convention _buildTrendTemplate itself uses elsewhere in routes/
  // market.js — a deliberate, intentional 1R level, not a bug. rr is
  // computed off row.target2 (real, already on the row — routes/market.js
  // defines it as entry + 2*(entry-stop)), NOT off target1: a caller
  // elsewhere in this codebase (SmartScanTab.jsx's entryPlanSS) computes
  // its own rr as (target1-entry)/(entry-stop), which by construction
  // always equals exactly 1.0 regardless of the real setup — a real,
  // pre-existing bug there (out of scope this phase, not touched), NOT
  // replicated here since red-flag-engine.js's unacceptableRR check would
  // otherwise permanently fire for every symbol.
  const target1 = row.entry > row.stop ? Math.round((row.entry + (row.entry - row.stop)) * 100) / 100 : null;
  const rr = Number.isFinite(row.target2) && row.entry > row.stop ? Math.round(((row.target2 - row.entry) / (row.entry - row.stop)) * 100) / 100 : null;
  const antiChase = computeAntiChase(row.abovePivotPct);
  return {
    price: row.price, pivot: row.pivot, atr: null, contractionLow: row.contractionLow,
    dailyBias, rsRating: row.rsRating, higherLows: row.higherLows, tightening: row.tightening,
    vcpVerdict: row.vcpVerdict, vwap20: row.technicals?.vwap20, rr,
    breakoutConfirmed: row.breakoutConfirmed, extended: row.extended, priceAction: {}, antiChase,
    stop: row.stop, target1, target2: row.target2, marketRegime,
    riskPct: row.riskPct, dollarVolume: row.dollarVolume,
  };
}

// Real alert-transition check — pure, testable. Fires when the symbol
// newly reaches a real actionable BUY-family decision AND has zero
// critical red flags (spec §8-9/§23: a critical flag overrides a high
// score, never hidden — applied here even though classifyDeepScanDecision
// itself has no native red-flag concept). First-seen-per-symbol
// (lastDecision == null) seeds silently, same discipline as before this
// phase.
function shouldAlert(lastDecision, decision, criticalFlagCount) {
  if (criticalFlagCount > 0) return false;
  if (lastDecision == null) return false;
  if (ACTIONABLE_DECISIONS.has(lastDecision)) return false; // already alerted for this actionable state
  return ACTIONABLE_DECISIONS.has(decision);
}

async function checkWatchlistSetupAlerts() {
  if (!telegramConfigured()) return { ok: true, skipped: "telegram not configured" };
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };
  const { symbols } = loadWatchlist();
  if (!Array.isArray(symbols) || !symbols.length) return { ok: true, checked: 0, alerts: [] };

  let screenWatchlistCached, fetchMarketQuotes, computeRegime, regimeToEntryVocabulary, computeAPlusScore;
  try {
    ({ screenWatchlistCached, fetchMarketQuotes } = require("./routes/market"));
    ({ computeRegime, regimeToEntryVocabulary, computeAPlusScore } = require("./trade-planner-scoring"));
  } catch { return { ok: false, checked: 0, alerts: [] }; }

  const macroRows = await fetchMarketQuotes(["SPY", "QQQ", "VIXY"], resolveProviderKeys(new URLSearchParams())).catch(() => []);
  const regime = computeRegime(Array.isArray(macroRows) ? macroRows : []);
  const marketRegime = regimeToEntryVocabulary(regime.label);
  // screenWatchlistCached (not screenTrendTemplate directly) — shares one
  // real scan with watchlist-institutional-alerts.js's identical watchlist
  // sweep when both land in the same 15-min tick (CTO audit item #4).
  const results = await screenWatchlistCached(symbols).catch(() => []);

  const prev = loadState();
  const next = { ...prev };
  const alerts = [];

  for (const row of results) {
    if (row.error) continue;
    const symbol = row.symbol;
    const ev = buildEvFromRow(row, marketRegime);
    const entryPlan = computeEntryPlan(ev);
    const redFlagResult = computeRedFlags(ev);
    const { score: aPlusScore } = computeAPlusScore(row, regime);
    const deep = classifyDeepScanDecision({ entryPlan, aPlusScore });
    const last = prev[symbol] || {};

    if (shouldAlert(last.decision, deep.decision, redFlagResult.criticalCount)) {
      alerts.push({
        symbol, decision: deep.decision, reason: deep.reason,
        entry: entryPlan.entryPrice, stop: entryPlan.stop, target: entryPlan.target1,
      });
    }

    next[symbol] = { decision: deep.decision };
  }

  saveState(next);

  if (alerts.length) {
    const fmt = (v) => Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : "—";
    const lines = alerts.map((a) =>
      `🎯 ${a.symbol}: ${a.decision.replace(/_/g, " ")} — Entry ${fmt(a.entry)} / Stop ${fmt(a.stop)} / Target ${fmt(a.target)}\n${a.reason}`
    );
    pushDigestLines("watchlist-setup-alert", "⚡ WATCHLIST SETUP", lines);
  }

  return { ok: true, checked: symbols.length, alerts };
}

module.exports = { checkWatchlistSetupAlerts, buildEvFromRow, shouldAlert, ACTIONABLE_DECISIONS };
