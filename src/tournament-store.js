"use strict";
// tournament-store.js (2026-09-17, "500-Stock Tournament" master prompt)
// — the ONE genuinely new piece of state this feature needs. Every other
// real field (opportunityScore, riskScore, tier, opportunityStage,
// signalState, entry/stop/target/riskReward, breakdown scores, reasons/
// blockers) already exists on canonical-decision-pipeline.js's own real
// output — this store's only job is remembering each symbol's RANK over
// time, which nothing in this codebase tracked before (opportunity-
// timeline-store.js tracks a symbol's own score history, never its
// position among its peers). Same real "load/save whole store, throttle
// writes, bound history length" convention that file already established.
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "tournament-state.json");
const MAX_RANK_HISTORY = 48; // ~a full trading day at one sample per 8-10 min tick

function loadTournamentState() {
  return readJsonSafe(STORE_PATH, { symbols: {}, lastTickAt: null, lastRankedAt: null });
}
function saveTournamentState(state) { writeJsonAtomic(STORE_PATH, state); }

// Merges a fresh real per-symbol computed snapshot (from
// tournament-engine.js's runTournamentTick, itself a direct read of
// canonical-decision-pipeline.js's output — never invented here) into the
// persisted state. Rank fields are deliberately NOT touched here —
// applyRanking below is the only place rank changes, so a tick that only
// refreshes a rotation batch's scores never silently resets everyone
// else's rank to null.
function upsertSymbolData(state, symbol, fields) {
  const prev = state.symbols[symbol] || {};
  state.symbols[symbol] = { ...prev, ...fields, symbol, lastUpdated: Date.now() };
  return state.symbols[symbol];
}

// Real cross-symbol ranking pass — the one place rank/previousRank/
// rankChange/rankHistory/timeInTop25/timeInTop10/timeInElite are ever
// written. `ranked` is an array of symbols already sorted best-to-worst
// by tournament-engine.js's own real (disclosed) ranking formula — this
// function only records the resulting positions, never computes them.
function applyRanking(state, ranked) {
  const now = Date.now();
  ranked.forEach((symbol, idx) => {
    const rank = idx + 1;
    const entry = state.symbols[symbol];
    if (!entry) return; // defensive — ranked should only ever contain symbols already upserted this session
    const previousRank = Number.isFinite(entry.currentRank) ? entry.currentRank : null;
    entry.previousRank = previousRank;
    entry.currentRank = rank;
    entry.rankChange = previousRank != null ? previousRank - rank : 0; // positive = moved up
    const history = Array.isArray(entry.rankHistory) ? entry.rankHistory : [];
    history.push({ rank, ts: now });
    if (history.length > MAX_RANK_HISTORY) history.shift();
    entry.rankHistory = history;
    entry.timeInTop25 = (entry.timeInTop25 || 0) + (rank <= 25 ? 1 : 0);
    entry.timeInTop10 = (entry.timeInTop10 || 0) + (rank <= 10 ? 1 : 0);
    entry.timeInElite = (entry.timeInElite || 0) + (rank <= 5 ? 1 : 0);
  });
  // Symbols not present in `ranked` this pass (real data unavailable this
  // tick, or dropped below any meaningful score) keep their last known
  // rank rather than being silently zeroed — a real, disclosed "last
  // known position" beats fabricating a fresh one from stale inputs.
  state.lastRankedAt = now;
  return state;
}

module.exports = { STORE_PATH, MAX_RANK_HISTORY, loadTournamentState, saveTournamentState, upsertSymbolData, applyRanking };
