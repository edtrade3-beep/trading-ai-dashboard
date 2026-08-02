// src/position-manager-engine.js — AI Exit Engine, options platform
// redesign Phase 11. Pure math over a real paper-positions-store.js
// record + real current-chain data. Reuses Phase 5's already-real
// ivCrushRisk/assignmentRisk/dteFromExpiry (src/options-math.js) rather
// than re-deriving new formulas — presentation-layer consolidation, same
// convention every prior phase in this plan followed.
const { dteFromExpiry, ivCrushRisk, assignmentRisk } = require("./options-math");

// Real, symmetric P/L off the position's own real entry/current premium —
// standard options convention (premium × 100 × contracts). Null (never
// a guess) when either premium isn't a real positive number.
function computePositionPnl(position) {
  const entry = Number(position?.entryPremium);
  // position?.currentPremium != null guards against Number(null/undefined)
  // silently coercing to 0 — a real "no current price yet" position must
  // never be scored as if it had crashed to $0.
  const current = position?.currentPremium != null ? Number(position.currentPremium) : NaN;
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(current)) return { pnl: null, pnlPct: null };
  const qty = Number(position?.qty) || 1;
  const pnl = Math.round((current - entry) * 100 * qty * 100) / 100;
  const pnlPct = Math.round(((current / entry) - 1) * 10000) / 100;
  return { pnl, pnlPct };
}

// AI Exit Score — deterministic composite over real inputs (mirrors
// regimeStrategyHint/volRecommendation's threshold-table pattern rather
// than a new model). Starts neutral at 50; real P/L, real time-to-expiry,
// real IV crush risk, and real assignment risk each independently move
// it, each independently skipped (not guessed) when its own real input
// is unavailable — e.g. `ivRank`/`delta` are honestly null without a
// POLYGON_API_KEY chain, same gate every prior real-Greeks feature in
// this app already has (Gamma Lab, Volatility Lab skew).
function computeExitSignals(position, { ivRank, daysToEarnings, delta } = {}) {
  const dte = dteFromExpiry(position?.expiry);
  const { pnl, pnlPct } = computePositionPnl(position);

  const timeDecayWarning = dte != null ? dte <= 5 : null;
  const crush = ivCrushRisk({ daysToEarnings, ivRank });
  const assignment = assignmentRisk({ delta, dte });

  let score = 50;
  const reasons = [];
  if (pnlPct != null) {
    if (pnlPct >= 50) { score += 25; reasons.push(`Real P/L +${pnlPct}% — in the real target zone`); }
    else if (pnlPct <= -50) { score -= 25; reasons.push(`Real P/L ${pnlPct}% — in the real stop zone`); }
    else if (pnlPct > 0) { score += 5; }
    else { score -= 5; }
  }
  if (timeDecayWarning) { score -= 15; reasons.push(`${dte} real days to expiry — theta decay accelerating`); }
  if (crush != null && crush >= 60) { score -= 10; reasons.push(`Real IV crush risk ${crush}%`); }
  if (assignment != null && assignment >= 60) { score -= 10; reasons.push(`Real assignment risk ${assignment}%`); }
  score = Math.max(0, Math.min(100, Math.round(score)));

  let recommendation;
  if (score >= 75) recommendation = "Hold";
  else if (score >= 55) recommendation = "Scale Out";
  else if (score >= 35) recommendation = "Move Stop";
  else recommendation = "Exit Now";

  return {
    dte, pnl, pnlPct, timeDecayWarning,
    ivCrushRisk: crush, assignmentRisk: assignment,
    exitScore: score, recommendation, reasons,
  };
}

module.exports = { computePositionPnl, computeExitSignals };
