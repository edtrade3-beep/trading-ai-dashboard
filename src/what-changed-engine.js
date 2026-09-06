"use strict";

// what-changed-engine.js — the global (platform-wide) "What Changed?"
// engine (2026-09-06, platform-consolidation Part 7). A per-symbol version
// of this already existed (opp.whatChanged, built in routes/market.js from
// opportunity-timeline-store.js, surfaced in CortexMiniPanel.jsx) — this is
// deliberately the missing broader layer: regime/VIX/data-health/market-wide
// news sentiment plus real candidate verdict transitions ("DELL: WATCH ->
// READY"), diffed against a day-open baseline and the immediately-prior
// scan. Same "only report material changes, never fabricate one" discipline
// as command-center-ai.js's own buildWhatChanged, which this is modeled on
// but is NOT a duplicate of: that one is gated behind an AI call and diffs
// AI Command Center runs; this is a free, deterministic function fed by
// whatever /api/market/opportunities already computed on its own real
// cadence, with no AI dependency.
//
// Pure functions only — no I/O, no fetches. what-changed-store.js owns
// persistence/day-rollover, same split as opportunity-timeline-store.js's
// storage layer vs. its own pure computeEdgeVelocity.

const REGIME_SCORE_DELTA = 5;
const VIX_DELTA = 1.0;
const MAX_CANDIDATE_TRANSITIONS = 12;

// Real, disclosed judgment call: which verdicts/stages count as "more
// actionable" for sorting upgrades to the top of a capped list. Not a
// scoring change — display ordering only.
//
// Deliberately NOT shared with axiom-runner/components/Autopilot2Tab.jsx's
// own VERDICT_RANK (code review, 2026-09-06, flagged as a possible
// duplicate) — that one is a client-only, coarser 4-bucket ascending rank
// tightly coupled to that file's own displayVerdict() card-sort order;
// this is a server-only, finer-grained descending rank for a different
// purpose (which real transition to show first in a capped diff list).
// Collapsing them into one shared cross-boundary (server+client) module
// for an 8-entry display-order table isn't worth the twin-sync machinery
// this app uses for real shared scoring logic — but both exist and could
// drift if the verdict vocabulary itself ever changes, so: if you add a
// new verdict, check both.
const ACTIONABLE_RANK = { STRONG_BUY: 5, BUY: 4, WATCH: 3, WAIT: 2, HOLD: 1, REDUCE: 0, EXIT: -1, AVOID: -2 };
function actionableRank(v) { return Number.isFinite(ACTIONABLE_RANK[v]) ? ACTIONABLE_RANK[v] : 0; }

// Builds one real, honest snapshot from data the caller already computed
// this scan — never fetches anything itself. Any input that's genuinely
// unavailable stays null; it is never guessed or defaulted to a fabricated
// value.
function buildGlobalSnapshot({ marketRegime = null, tiers = null, dataHealth = null, newsAggregation = null } = {}) {
  const regimeScore = Number.isFinite(marketRegime?.score) ? marketRegime.score : null;
  const regimeLabel = marketRegime?.regime || null;
  const vix = Number.isFinite(marketRegime?.volatility?.level) ? marketRegime.volatility.level : null;
  const vixState = marketRegime?.volatility?.state || null;
  const dataHealthStatus = dataHealth ? (dataHealth.canTrade === false ? "BLOCKED" : "OK") : null;

  // Only symbols with a real, already-computed verdict or opportunity
  // stage are tracked — this is a diff of the canonical pipeline's own
  // output, never a second verdict source.
  const candidates = {};
  if (tiers && typeof tiers === "object") {
    for (const list of Object.values(tiers)) {
      if (!Array.isArray(list)) continue;
      for (const row of list) {
        if (!row?.symbol) continue;
        const verdict = row.assetDecision?.verdict || null;
        const stage = row.assetDecision?.opportunityStage || null;
        if (!verdict && !stage) continue;
        candidates[row.symbol] = { verdict, stage };
      }
    }
  }

  const newsAvailable = Boolean(newsAggregation?.ok);
  const newsTrend = newsAvailable ? (newsAggregation.articleCount ? newsAggregation.trend : "NO_MATERIAL_NEWS") : null;
  const newsBullish = newsAvailable && Number.isFinite(newsAggregation.bullish) ? newsAggregation.bullish : null;
  const newsBearish = newsAvailable && Number.isFinite(newsAggregation.bearish) ? newsAggregation.bearish : null;

  return { regimeScore, regimeLabel, vix, vixState, dataHealthStatus, candidates, newsTrend, newsBullish, newsBearish };
}

// Real diff between two real snapshots — null when either side is missing
// (nothing real to compare, never a fabricated "no change"). Reports only
// material moves: a regime label flip or a score move of REGIME_SCORE_DELTA
// or more, a VIX move of VIX_DELTA or more, a data-health status flip, a
// news-sentiment trend flip, and any real candidate verdict/stage
// transition (a symbol tracked in both snapshots whose read genuinely
// changed) — brand-new or dropped symbols are NOT reported here, since a
// symbol simply entering/leaving the scanned universe isn't a material
// change in its own right, only capped to the top MAX_CANDIDATE_TRANSITIONS
// (upgrades first) so this stays a compressed readout, never a wall of noise.
function diffGlobalSnapshots(prev, current) {
  if (!prev || !current) return null;
  const changes = [];

  if (Number.isFinite(prev.regimeScore) && Number.isFinite(current.regimeScore) &&
      (prev.regimeLabel !== current.regimeLabel || Math.abs(current.regimeScore - prev.regimeScore) >= REGIME_SCORE_DELTA)) {
    changes.push({
      label: "Market Regime",
      from: `${prev.regimeLabel || "?"} (${prev.regimeScore})`,
      to: `${current.regimeLabel || "?"} (${current.regimeScore})`,
      kind: "regime",
    });
  }

  if (Number.isFinite(prev.vix) && Number.isFinite(current.vix) && Math.abs(current.vix - prev.vix) >= VIX_DELTA) {
    changes.push({ label: "VIX", from: prev.vix.toFixed(1), to: current.vix.toFixed(1), kind: "vix" });
  }

  if (prev.dataHealthStatus && current.dataHealthStatus && prev.dataHealthStatus !== current.dataHealthStatus) {
    changes.push({ label: "Data Health", from: prev.dataHealthStatus, to: current.dataHealthStatus, kind: "dataHealth" });
  }

  if (prev.newsTrend && current.newsTrend && prev.newsTrend !== current.newsTrend) {
    changes.push({ label: "News Sentiment (Market)", from: prev.newsTrend, to: current.newsTrend, kind: "news" });
  }

  const prevCand = prev.candidates || {};
  const curCand = current.candidates || {};
  let candidateTransitions = [];
  for (const symbol of Object.keys(curCand)) {
    const before = prevCand[symbol];
    if (!before) continue; // new to the tracked set this scan — not a "change", nothing to diff against
    const after = curCand[symbol];
    if (before.verdict !== after.verdict || before.stage !== after.stage) {
      candidateTransitions.push({
        symbol,
        from: before.verdict || before.stage,
        to: after.verdict || after.stage,
        kind: "transition",
      });
    }
  }
  candidateTransitions.sort((a, b) => actionableRank(b.to) - actionableRank(a.to));
  const truncated = candidateTransitions.length > MAX_CANDIDATE_TRANSITIONS;
  candidateTransitions = candidateTransitions.slice(0, MAX_CANDIDATE_TRANSITIONS);

  return {
    changes,
    candidateTransitions,
    truncated,
    hasChanges: changes.length > 0 || candidateTransitions.length > 0,
  };
}

module.exports = { buildGlobalSnapshot, diffGlobalSnapshots, REGIME_SCORE_DELTA, VIX_DELTA, MAX_CANDIDATE_TRANSITIONS };
