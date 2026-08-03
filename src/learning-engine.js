// Learning Engine — feeds real historical setup performance back into the
// live ranking both autopilot buy loops use (src/server-autopilot.js and the
// client AutoPilotEngine.jsx), closing the Green Light AI spec's "use these
// statistics to improve future rankings" gap. Every real stat this needs
// (win rate, avg R, per-tier/per-sector breakdown) already existed in
// autopilot-journal.js / journal-analytics.js — nothing fed it back into a
// live decision before this.
//
// Deliberately narrow scope: this never touches the underlying scoring math
// (computeGreenLight, trend-screen, tier/grade assignment) — it only gates
// which of those already-computed candidates get acted on, and only in the
// CUT direction. It never boosts size/risk off a good streak — that would be
// overfitting a small real sample with real money, the same reasoning this
// app already applies everywhere else (never fabricate, honest-null below a
// sample floor). Every gate requires MIN_SAMPLE_* real closed trades before
// it can act; below that it stays honest-open (allowed: true, "building
// sample").
const { tierStats } = require("./autopilot-journal");
const { sectorPerformance } = require("./journal-analytics");

const MIN_SAMPLE_TIER = 15;   // real closed trades before a tier's edge is trusted enough to gate live buys
const MIN_SAMPLE_SECTOR = 8;  // real closed trades before a sector's edge is trusted enough to gate live buys
const CUT_AVG_R = -0.3;       // tier-level: pause only on a clear, real losing edge — not breakeven noise
const CUT_WIN_RATE = 35;      // sector-level: pause only on a clearly losing win rate

function computeLearningGates(closedTrades, journalOverride) {
  const byTier = tierStats(closedTrades, journalOverride);
  const tierGates = {};
  for (const [tier, s] of Object.entries(byTier)) {
    const avgR = s.rN ? s.rSum / s.rN : null;
    const winRate = s.n ? Math.round((s.wins / s.n) * 100) : null;
    const enoughSample = s.n >= MIN_SAMPLE_TIER;
    const paused = enoughSample && avgR != null && avgR < CUT_AVG_R;
    tierGates[tier] = {
      allowed: !paused,
      n: s.n,
      winRate,
      avgR: avgR != null ? +avgR.toFixed(2) : null,
      reason: paused
        ? `Tier ${tier} paused — ${s.n} real closed trades average ${avgR.toFixed(2)}R, a real losing edge`
        : enoughSample
          ? `Tier ${tier} clear — ${s.n} real trades, ${avgR != null ? avgR.toFixed(2) : "?"}R average`
          : `Tier ${tier} — building sample (${s.n}/${MIN_SAMPLE_TIER} real trades)`,
    };
  }

  const bySector = sectorPerformance(closedTrades, journalOverride);
  const sectorGates = {};
  for (const [sector, s] of Object.entries(bySector)) {
    if (!s) continue; // sectorPerformance already nulls buckets below its own (lower) display floor
    const enoughSample = s.n >= MIN_SAMPLE_SECTOR;
    const paused = enoughSample && s.winRate < CUT_WIN_RATE;
    sectorGates[sector] = {
      allowed: !paused,
      n: s.n,
      winRate: s.winRate,
      reason: paused
        ? `${sector} paused — ${s.n} real closed trades at ${s.winRate}% win rate, a real losing edge`
        : `${sector} clear — ${s.n} real trades, ${s.winRate}% win rate`,
    };
  }

  return { tierGates, sectorGates };
}

// Honest default for a tier/sector this app has no real sample for yet — always
// allowed. Centralized here so every call site checks the same way instead of
// re-deriving "missing key = allowed" logic independently.
function isAllowed(gate) {
  return !gate || gate.allowed !== false;
}

module.exports = {
  computeLearningGates, isAllowed,
  MIN_SAMPLE_TIER, MIN_SAMPLE_SECTOR, CUT_AVG_R, CUT_WIN_RATE,
};
