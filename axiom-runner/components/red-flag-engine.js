// red-flag-engine.js — client-side twin of src/red-flag-engine.js. Pure,
// dependency-free math, hand-ported here rather than fetched — same
// discipline as entry-engine.js/simple-decision.js/decision-priority.js's
// own client twins. KEEP IN SYNC: any threshold/flag change goes in both
// files. See src/red-flag-engine.js for the full design rationale (Master
// Build Spec §8-9, ENTRY vs EXIT taxonomies, what's honestly omitted for
// missing data, why each threshold matches an existing convention
// elsewhere in this app).

const THRESHOLDS = {
  minRR: 1.5,
  maxStopDistancePct: 8,
  minDollarVolume: 5_000_000,
  minRsRating: 60,
};

function rawChecks(ev, t) {
  return {
    failedBreakout: {
      present: ev.priceAction?.failedBreakout === true,
      reason: "A prior breakout attempt failed — real price action, not a soft signal.",
    },
    structureBroken: {
      present: ev.swing4hState != null ? ev.swing4hState === "BROKEN" : null,
      reason: "4H structure is broken — the higher-timeframe trend has failed.",
    },
    dailyTrendBreakdown: {
      present: ev.dailyBias != null ? ev.dailyBias === "BEARISH" : null,
      reason: "Daily trend has turned bearish.",
    },
    regimeDeterioration: {
      present: ev.marketRegime != null ? ev.marketRegime === "RISK_OFF" : null,
      reason: "Market regime is risk-off — broad conditions are unfavorable.",
    },
    extremeExtension: {
      present: ev.antiChase?.band != null ? ev.antiChase.band === "DO_NOT_CHASE" : null,
      reason: ev.antiChase?.label || "Price is materially extended above the ideal entry zone.",
    },
    unacceptableRR: {
      present: Number.isFinite(ev.rr) ? ev.rr < t.minRR : null,
      reason: Number.isFinite(ev.rr) ? `Real R:R is ${ev.rr.toFixed(1)}:1, below the ${t.minRR}:1 floor.` : null,
    },
    unacceptableStopDistance: {
      present: Number.isFinite(ev.riskPct) ? ev.riskPct > t.maxStopDistancePct : null,
      reason: Number.isFinite(ev.riskPct) ? `Real stop distance is ${ev.riskPct.toFixed(1)}%, above the ${t.maxStopDistancePct}% floor.` : null,
    },
    poorLiquidity: {
      present: Number.isFinite(ev.dollarVolume) ? ev.dollarVolume < t.minDollarVolume : null,
      reason: Number.isFinite(ev.dollarVolume) ? `Real dollar volume is $${(ev.dollarVolume / 1e6).toFixed(1)}M/day, below the $${(t.minDollarVolume / 1e6).toFixed(0)}M floor.` : null,
    },
    weakVolume: {
      present: ev.volTrend1h?.direction != null ? ev.volTrend1h.direction === "down" : null,
      reason: "1H volume participation is declining.",
    },
    fallingRS: {
      present: Number.isFinite(ev.rsRating) ? ev.rsRating < t.minRsRating : null,
      reason: Number.isFinite(ev.rsRating) ? `RS Rating ${ev.rsRating} is below the ${t.minRsRating} leader threshold.` : null,
    },
    belowVwap: {
      present: (Number.isFinite(ev.vwap20) && Number.isFinite(ev.price)) ? ev.price < ev.vwap20 : null,
      reason: "Price is below the 20-day VWAP.",
    },
    lossOfSupport: {
      present: ev.higherLows != null ? ev.higherLows === false : null,
      reason: "Real higher lows are no longer holding — support has broken down.",
    },
    thesisInvalidation: {
      present: ev.thesisInvalidated != null ? ev.thesisInvalidated === true : null,
      reason: "The real weighted verdict for this position has flipped — thesis invalidated.",
    },
    reversalTopRisk: {
      present: ev.reversalTopRisk != null ? ev.reversalTopRisk === true : null,
      reason: ev.reversalReason || "Real early get-out signs — near-top reversal read (52w-high proximity, RSI, volume, or a parabolic run cooling off).",
    },
  };
}

function buildFlags(ev, opts, defs) {
  const t = { ...THRESHOLDS, ...opts };
  const raw = rawChecks(ev, t);
  const flags = [];
  for (const [rawKey, outputKey, label, critical] of defs) {
    const check = raw[rawKey];
    if (!check || check.present == null) continue;
    if (check.present) flags.push({ key: outputKey, label, critical, reason: check.reason });
  }
  const criticalFlags = flags.filter((f) => f.critical);
  return { flags, count: flags.length, criticalCount: criticalFlags.length, criticalFlags };
}

const ENTRY_DEFS = [
  ["failedBreakout", "failedBreakout", "Failed Breakout", true],
  ["structureBroken", "structureBroken", "Structure Broken (4H)", true],
  ["dailyTrendBreakdown", "dailyTrendBreakdown", "Daily Trend Breakdown", true],
  ["regimeDeterioration", "regimeDeterioration", "Market Regime Deterioration", true],
  ["extremeExtension", "extremeExtension", "Extreme Extension (Do Not Chase)", true],
  ["unacceptableRR", "unacceptableRR", "Risk/Reward Unacceptable", true],
  ["unacceptableStopDistance", "unacceptableStopDistance", "Stop Distance Unacceptable", true],
  ["poorLiquidity", "poorLiquidity", "Poor Liquidity", true],
  ["weakVolume", "weakVolume", "Weak Volume", false],
  ["fallingRS", "fallingRS", "Falling Relative Strength", false],
  ["belowVwap", "belowVwap", "Below VWAP", false],
];

const EXIT_DEFS = [
  ["failedBreakout", "failedBreakout", "Failed Breakout", true],
  ["lossOfSupport", "lossOfSupport", "Loss of Key Support", true],
  ["structureBroken", "bearishStructureChange", "Bearish Structure Change", true],
  ["regimeDeterioration", "regimeDeterioration", "Market Regime Deterioration", true],
  ["extremeExtension", "extremeExtension", "Extreme Extension", true],
  ["thesisInvalidation", "thesisInvalidation", "Thesis Invalidation", true],
  ["reversalTopRisk", "reversalTopRisk", "Early Reversal Risk (Near-Top)", true],
  ["belowVwap", "lossOfVwap", "Loss of VWAP", false],
  ["weakVolume", "volumeReversal", "Volume Reversal", false],
];

export function computeRedFlags(ev = {}, opts = {}) {
  return buildFlags(ev, opts, ENTRY_DEFS);
}

export function computeExitRedFlags(ev = {}, opts = {}) {
  return buildFlags(ev, opts, EXIT_DEFS);
}

export { THRESHOLDS };
