"use strict";
// Trade GPS Stage 6 (2026-09-03) — the BUY STOCK/BUY CALL/BUY PUT/BUY CALL
// SPREAD/BUY PUT SPREAD/WAIT/EXIT/NO TRADE vocabulary the spec asks for.
// A TRANSLATION LAYER only, per the confirmed design decision: the real
// canonical FINAL_VERDICTS enum (asset-decision.js) is never changed, and
// no other feature reading opportunity.verdict/assetDecision.verdict is
// affected. This reads that real verdict plus the real signalState
// (signal-lifecycle.js), tradeStructure (trade-structure-selector.js),
// tradeGps score/band (trade-gps-score.js), and trapShield (trap-shield.js)
// this stage's own predecessors already compute, and picks one label —
// it never re-decides anything on its own.
const STRUCTURE_TO_BUY_VERDICT = {
  STOCK: "BUY_STOCK",
  CALL: "BUY_CALL",
  PUT: "BUY_PUT",
  CALL_SPREAD: "BUY_CALL_SPREAD",
  PUT_SPREAD: "BUY_PUT_SPREAD",
};
const TRADE_GPS_VERDICTS = new Set([
  "BUY_STOCK", "BUY_CALL", "BUY_PUT", "BUY_CALL_SPREAD", "BUY_PUT_SPREAD", "WAIT", "EXIT", "NO_TRADE",
]);
const ACTIONABLE_ASSET_VERDICTS = new Set(["STRONG_BUY", "BUY"]);
const ACTIONABLE_SIGNAL_STATES = new Set(["ENTER_NOW", "ARMED"]);

// One real, single-candidate translation — symbol optional (identifies
// the pick for a caller ranking several), everything else required to
// produce a real, non-WAIT verdict.
function translateToTradeGpsVerdict({
  symbol = null, assetDecisionVerdict = null, tradeStructure = null,
  tradeGpsScore = null, trapShield = null, signalState = null, dataHealth = null,
} = {}) {
  const score = Number.isFinite(tradeGpsScore?.score) ? tradeGpsScore.score : null;
  const band = tradeGpsScore?.band ?? null;

  if (trapShield?.blocked) {
    return { symbol, verdict: "NO_TRADE", structure: null, score, band, reasonOneLine: trapShield.message || "Trap Shield blocked this setup." };
  }
  if (band === "REJECT" || band === "NO_TRADE") {
    return { symbol, verdict: "NO_TRADE", structure: null, score, band, reasonOneLine: "Trade GPS score is below the actionable threshold." };
  }
  if (dataHealth?.status === "BLOCKED") {
    return { symbol, verdict: "NO_TRADE", structure: null, score, band, reasonOneLine: "Required real data is stale or unavailable." };
  }
  if (assetDecisionVerdict === "EXIT") {
    return { symbol, verdict: "EXIT", structure: null, score, band, reasonOneLine: "The canonical decision engine's verdict is EXIT." };
  }
  if (ACTIONABLE_ASSET_VERDICTS.has(assetDecisionVerdict) && ACTIONABLE_SIGNAL_STATES.has(signalState)) {
    const structure = tradeStructure?.structure ?? null;
    const verdict = STRUCTURE_TO_BUY_VERDICT[structure];
    if (verdict) {
      return { symbol, verdict, structure, score, band, reasonOneLine: tradeStructure?.reason || null };
    }
    return { symbol, verdict: "NO_TRADE", structure, score, band, reasonOneLine: tradeStructure?.reason || "No real tradeable structure available." };
  }
  return { symbol, verdict: "WAIT", structure: null, score, band, reasonOneLine: "Not yet actionable — waiting for a real qualifying entry." };
}

const ACTIONABLE_BUY_VERDICTS = new Set(Object.values(STRUCTURE_TO_BUY_VERDICT));

// Cross-symbol ranking — the spec's "1 primary + max 2 backups" rule.
// Takes an array of already-translated real per-symbol results (from
// translateToTradeGpsVerdict above); never recomputes a verdict itself.
// Only real actionable BUY_* verdicts compete; WAIT/EXIT/NO_TRADE never
// become a primary or backup.
function selectPrimaryAndBackups(candidates = []) {
  const actionable = (Array.isArray(candidates) ? candidates : [])
    .filter((c) => c && ACTIONABLE_BUY_VERDICTS.has(c.verdict) && Number.isFinite(c.score))
    .sort((a, b) => b.score - a.score);
  return { primary: actionable[0] || null, backups: actionable.slice(1, 3) };
}

module.exports = { translateToTradeGpsVerdict, selectPrimaryAndBackups, TRADE_GPS_VERDICTS };
