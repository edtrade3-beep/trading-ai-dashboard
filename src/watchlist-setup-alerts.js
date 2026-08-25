// watchlist-setup-alerts.js — real Telegram alert for Watchlist symbols
// reaching a real, unified BUY-family verdict.
//
// One Engine Migration Phase 6 (2026-08-23): migrated off
// classifyDeepScanDecision (src/btc-hpc-scan.js, now retired) onto
// am-core-engine.js's classifyCoreVerdict — the SAME verdict engine now
// driving the Workspace Decision banner and Scanner grade
// (MarketTerminalTab.jsx/RhProScanner.jsx), so this alert and what the
// user sees on-screen for the same symbol can no longer disagree.
// classifyCoreVerdict takes the exact same real computeEntryPlan()/
// computeRedFlags() outputs classifyDeepScanDecision did (entry-engine.js/
// red-flag-engine.js untouched) plus a real computeCoreScore() composite
// — not simple-decision.js's computeSimpleDecision, which assumes real
// 4H/1H/15M MTF data (hard-blocks on missing structure) that this daily-
// only scan tier genuinely doesn't have.
//
// computeAPlusScore (trade-planner-scoring.js) is still called here, now
// to supply classifyCoreVerdict's entryScore floor-gate input (same real
// number the Workspace's Option B ENTRY SCORE tile shows) — it doesn't
// drive the alert trigger directly.
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
const { computeCoreScore, classifyCoreVerdict } = require("./am-core-engine");

const STORE_PATH = path.join(ROOT, "data", "watchlist-setup-state.json");

// The real "actionable BUY-family" verdicts classifyCoreVerdict can
// return — excludes WATCH/WAIT/AVOID_LONG. Matches this function's own
// naming (every alert-worthy state literally has "BUY" in its name).
// Exported and reused directly by watchlist-sniper-alerts.js etc — one
// real list, not several independently-maintained copies.
//
// One Engine Migration Phase 6 (2026-08-23): was
// new Set(["BUY", "A_PLUS_EARLY_BUY", "PULLBACK_BUY"]) off the retired
// classifyDeepScanDecision. Core Engine has no "developing, not yet
// confirmed" BUY-adjacent state the way PULLBACK_BUY was — its closest
// analog is WATCH, which is deliberately NOT actionable here (score >=70
// is "eligible for Trade Gate evaluation" per the spec, not itself an
// alert trigger). Disclosed consequence: alert volume may drop for
// pullback-style setups that previously fired on PULLBACK_BUY alone.
const ACTIONABLE_DECISIONS = new Set(["EARLY_BUY", "BUY"]);

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
// newly reaches a real actionable BUY-family verdict AND has zero
// critical red flags (spec §8-9/§23: a critical flag overrides a high
// score, never hidden — classifyCoreVerdict already hard-gates on
// criticalCount internally too, this is a belt-and-suspenders check at
// the alert layer). First-seen-per-symbol (lastDecision == null) seeds
// silently, same discipline as before this phase.
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
    const last = prev[symbol] || {};

    if (shouldAlert(last.decision, deep.verdict, redFlagResult.criticalCount)) {
      alerts.push({
        symbol, decision: deep.verdict, reason: deep.reason,
        entry: entryPlan.entryPrice, stop: entryPlan.stop, target: entryPlan.target1,
        // Real ✓/✗ WHY checklist (Market Opportunity Engine Phase 1,
        // 2026-08-25, spec §20: alert messages should show the real
        // evidence behind a verdict, not just the one-line summary) —
        // entry-engine.js's own real computeQualifyingConditions output,
        // already computed above for entryPlan, zero extra fetch.
        checks: entryPlan.qualifying.checks,
      });
    }

    next[symbol] = { decision: deep.verdict };
  }

  saveState(next);

  if (alerts.length) {
    const fmt = (v) => Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : "—";
    const lines = alerts.map((a) => {
      const checklist = (a.checks || []).map((c) => `${c.pass ? "✓" : "✗"} ${c.label}`).join("\n");
      return `🎯 ${a.symbol}: ${a.decision.replace(/_/g, " ")} — Entry ${fmt(a.entry)} / Stop ${fmt(a.stop)} / Target ${fmt(a.target)}\n${a.reason}` + (checklist ? `\n${checklist}` : "");
    });
    pushDigestLines("watchlist-setup-alert", "⚡ WATCHLIST SETUP", lines);
  }

  return { ok: true, checked: symbols.length, alerts };
}

module.exports = { checkWatchlistSetupAlerts, buildEvFromRow, shouldAlert, ACTIONABLE_DECISIONS };
