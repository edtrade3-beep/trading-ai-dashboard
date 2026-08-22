// red-flag-engine.js — client-side twin of src/red-flag-engine.js. Pure,
// dependency-free math, hand-ported here rather than fetched — same
// discipline as entry-engine.js/simple-decision.js/decision-priority.js's
// own client twins. KEEP IN SYNC: any threshold/flag change goes in both
// files. See src/red-flag-engine.js for the full design rationale (Master
// Build Spec §8-9, what's honestly omitted for missing data, why each
// threshold matches an existing convention elsewhere in this app).

const THRESHOLDS = {
  minRR: 1.5,
  maxStopDistancePct: 8,
  minDollarVolume: 5_000_000,
  minRsRating: 60,
};

export function computeRedFlags(ev = {}, opts = {}) {
  const t = { ...THRESHOLDS, ...opts };
  const flags = [];
  const add = (key, label, critical, present, reason) => {
    if (present == null) return;
    if (present) flags.push({ key, label, critical, reason });
  };

  add(
    "failedBreakout", "Failed Breakout", true,
    ev.priceAction?.failedBreakout === true,
    "A prior breakout attempt failed — real price action, not a soft signal."
  );
  add(
    "structureBroken", "Structure Broken (4H)", true,
    ev.swing4hState != null ? ev.swing4hState === "BROKEN" : null,
    "4H structure is broken — the higher-timeframe trend has failed."
  );
  add(
    "dailyTrendBreakdown", "Daily Trend Breakdown", true,
    ev.dailyBias != null ? ev.dailyBias === "BEARISH" : null,
    "Daily trend has turned bearish."
  );
  add(
    "regimeDeterioration", "Market Regime Deterioration", true,
    ev.marketRegime != null ? ev.marketRegime === "RISK_OFF" : null,
    "Market regime is risk-off — broad conditions are unfavorable for new longs."
  );
  add(
    "extremeExtension", "Extreme Extension (Do Not Chase)", true,
    ev.antiChase?.band != null ? ev.antiChase.band === "DO_NOT_CHASE" : null,
    ev.antiChase?.label || "Price is materially extended above the ideal entry zone."
  );
  add(
    "unacceptableRR", "Risk/Reward Unacceptable", true,
    Number.isFinite(ev.rr) ? ev.rr < t.minRR : null,
    Number.isFinite(ev.rr) ? `Real R:R is ${ev.rr.toFixed(1)}:1, below the ${t.minRR}:1 floor.` : null
  );
  add(
    "unacceptableStopDistance", "Stop Distance Unacceptable", true,
    Number.isFinite(ev.riskPct) ? ev.riskPct > t.maxStopDistancePct : null,
    Number.isFinite(ev.riskPct) ? `Real stop distance is ${ev.riskPct.toFixed(1)}%, above the ${t.maxStopDistancePct}% floor.` : null
  );
  add(
    "poorLiquidity", "Poor Liquidity", true,
    Number.isFinite(ev.dollarVolume) ? ev.dollarVolume < t.minDollarVolume : null,
    Number.isFinite(ev.dollarVolume) ? `Real dollar volume is $${(ev.dollarVolume / 1e6).toFixed(1)}M/day, below the $${(t.minDollarVolume / 1e6).toFixed(0)}M floor.` : null
  );

  add(
    "weakVolume", "Weak Volume", false,
    ev.volTrend1h?.direction != null ? ev.volTrend1h.direction === "down" : null,
    "1H volume participation is declining."
  );
  add(
    "fallingRS", "Falling Relative Strength", false,
    Number.isFinite(ev.rsRating) ? ev.rsRating < t.minRsRating : null,
    Number.isFinite(ev.rsRating) ? `RS Rating ${ev.rsRating} is below the ${t.minRsRating} leader threshold.` : null
  );
  add(
    "belowVwap", "Below VWAP", false,
    (Number.isFinite(ev.vwap20) && Number.isFinite(ev.price)) ? ev.price < ev.vwap20 : null,
    "Price is below the 20-day VWAP."
  );

  const criticalFlags = flags.filter((f) => f.critical);
  return {
    flags,
    count: flags.length,
    criticalCount: criticalFlags.length,
    criticalFlags,
  };
}

export { THRESHOLDS };
