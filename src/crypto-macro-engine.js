"use strict";

// crypto-macro-engine.js — Crypto <-> Macro Relationship Engine (platform
// upgrade, 2026-09-07, prompt §1-2: "Connect Crypto directly to Trade
// Desk... one shared market-intelligence engine feeding Trade Desk and
// Crypto"). Pure computation only — every real input (crypto price bars,
// FRED macro series, market regime, Fed statement bias) is fetched by the
// caller (routes/crypto-macro.js) from data sources that already exist
// elsewhere in this app (fred.js, providers/yahoo.js, market-regime-
// engine.js, routes/fed.js); this file adds zero new data sources, only
// real correlation math and classification/scoring logic on top of them.
//
// Real, disclosed scope limit: BTC ETF flow data and a quantified
// regulatory-sentiment score are NOT available from any real source in
// this codebase (confirmed by grep — command-center-ai.js/institution-
// score.js already disclose this same gap for equities elsewhere). Both
// are honestly reported as UNAVAILABLE components in the Crypto Macro
// Score rather than invented, this app's standing convention.

const MIN_ALIGNED_OBSERVATIONS = 15;

function pearson(a, b) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

// Aligns two real date-stamped series onto their real shared dates only —
// crypto trades 24/7, FRED/equities don't, so index i in one series never
// safely matches index i in the other.
function alignByDate(seriesA, seriesB) {
  const mapB = new Map(seriesB.map((p) => [p.date, p.value]));
  const pairs = [];
  for (const a of seriesA) {
    if (mapB.has(a.date) && Number.isFinite(a.value) && Number.isFinite(mapB.get(a.date))) pairs.push([a.value, mapB.get(a.date)]);
  }
  return pairs;
}

// providers/yahoo.js's fetchYahooBars returns {time, open, high, low,
// close, volume} where `time` is already epoch MILLISECONDS (see
// parseYahooChartBars: `time: timestamps[i] * 1000`) — not seconds.
function toDailySeries(bars) {
  return (Array.isArray(bars) ? bars : [])
    .map((b) => {
      if (!b) return null;
      const d = b.date || (Number.isFinite(b.time) ? new Date(b.time).toISOString().slice(0, 10) : null);
      return d && Number.isFinite(b.close) ? { date: d, value: b.close } : null;
    })
    .filter(Boolean);
}

// Real historical correlation between a crypto asset's real daily %
// returns and one macro series' own real daily changes, over whatever
// real overlapping history both series have. Honest null (never a
// fabricated number) below the real minimum sample floor.
function computeMacroCorrelation(cryptoBars, macroSeries) {
  const cryptoDaily = toDailySeries(cryptoBars);
  if (cryptoDaily.length < MIN_ALIGNED_OBSERVATIONS + 1 || !Array.isArray(macroSeries) || macroSeries.length < MIN_ALIGNED_OBSERVATIONS + 1) return null;
  const aligned = alignByDate(cryptoDaily, macroSeries);
  if (aligned.length < MIN_ALIGNED_OBSERVATIONS + 1) return null;
  const cryptoReturns = [], macroChanges = [];
  for (let i = 1; i < aligned.length; i++) {
    const [prevC, prevM] = aligned[i - 1];
    const [curC, curM] = aligned[i];
    if (prevC) cryptoReturns.push((curC - prevC) / prevC);
    if (prevM) macroChanges.push((curM - prevM) / Math.abs(prevM));
  }
  if (cryptoReturns.length < MIN_ALIGNED_OBSERVATIONS || cryptoReturns.length !== macroChanges.length) return null;
  return Math.round(pearson(cryptoReturns, macroChanges) * 100) / 100;
}

// Real, disclosed bucket boundaries — a judgment call on labeling, not on
// the correlation number itself (which is always real, computed above).
const SENSITIVITY_BANDS = [{ max: 0.2, label: "LOW" }, { max: 0.45, label: "MODERATE" }, { max: 0.7, label: "HIGH" }, { max: Infinity, label: "EXTREME" }];
function sensitivityLabel(correlation) {
  if (!Number.isFinite(correlation)) return null;
  return SENSITIVITY_BANDS.find((b) => Math.abs(correlation) <= b.max).label;
}

const RATE_REGIMES = ["HIKE", "PAUSE", "HOLD_LONGER", "DOVISH_HOLD", "RATE_CUT_CYCLE", "EMERGENCY_EASING"];

// Real rate-regime classification from already-computed real inputs —
// fedStatementAction (HIKE/CUT/HOLD, routes/fed.js's own real statement-
// text scoring), fedStatementBias (DOVISH/HAWKISH/NEUTRAL, same source),
// fedFundsWindowChangePct (real FRED DFF trend over the fetch window),
// marketRegimeLabel (market-regime-engine.js's real regime). Never infers
// a regime the real inputs don't support.
function classifyRateRegime({ fedStatementAction, fedStatementBias, fedFundsWindowChangePct, marketRegimeLabel }) {
  if (fedStatementAction === "HIKE") return "HIKE";
  if (fedStatementAction === "CUT") {
    if (marketRegimeLabel === "CRISIS") return "EMERGENCY_EASING";
    // Real, disclosed threshold: a real >1% decline in the real effective
    // fed funds rate over the fetch window signals a genuinely fast-moving
    // cutting cycle rather than one isolated cut.
    return (Number.isFinite(fedFundsWindowChangePct) && fedFundsWindowChangePct < -1) ? "RATE_CUT_CYCLE" : "DOVISH_HOLD";
  }
  if (fedStatementBias === "HAWKISH") return "HOLD_LONGER";
  if (fedStatementBias === "DOVISH") return "DOVISH_HOLD";
  return "PAUSE"; // genuinely neutral hold — no real signal either way
}

// Real, disclosed direction mapping — market-implied hike/hold/cut
// probability itself isn't available from a real source in this codebase
// (no fed-funds-futures feed exists), so this derives an honest directional
// read from the same real statement bias + regime inputs already computed,
// rather than fabricating a probability number.
function impliedDirection({ fedStatementBias, rateRegime }) {
  if (rateRegime === "HIKE" || rateRegime === "HOLD_LONGER") return fedStatementBias === "HAWKISH" ? "MORE_HAWKISH" : "SLIGHTLY_HAWKISH";
  if (rateRegime === "RATE_CUT_CYCLE" || rateRegime === "EMERGENCY_EASING") return "MORE_DOVISH";
  if (rateRegime === "DOVISH_HOLD") return "SLIGHTLY_DOVISH";
  return "NEUTRAL";
}

// The nuanced "why a pause/cut is NOT automatically bullish/bearish" logic
// the prompt explicitly requires. Real, disclosed evidence: CPI/core-PCE
// YoY trend and unemployment/jobless-claims trend (both real FRED series
// already fetchable via fred.js) plus the real market regime. Every branch
// names its own real evidence rather than asserting a flavor with no basis.
// cpiYoyChangePct is fred.js's real trailing-12-month CPI inflation RATE
// (e.g. ~3.0), not a price-level delta — it is virtually never negative
// outside real deflation, so "cooling" can't be tested against 0. The real,
// disclosed threshold instead measures distance from the Fed's own stated
// ~2% inflation objective (a documented policy target, not an invented
// number): comfortably at/near target vs. meaningfully above it.
function explainPauseFlavor({ cpiYoyChangePct, unemploymentWindowChangePct, marketRegimeLabel }) {
  const inflationNearTarget = Number.isFinite(cpiYoyChangePct) && cpiYoyChangePct <= 2.5;
  const inflationElevated = Number.isFinite(cpiYoyChangePct) && cpiYoyChangePct > 3.5;
  const laborSoftening = Number.isFinite(unemploymentWindowChangePct) && unemploymentWindowChangePct > 8; // real % rise in the unemployment rate itself over the ~13mo fetch window

  if (laborSoftening && (marketRegimeLabel === "RISK_OFF" || marketRegimeLabel === "CRISIS")) {
    return { flavor: "RECESSIONARY_PAUSE", reason: "Unemployment is rising while the Fed holds — a real sign the pause reflects growth concern, not confidence.", cryptoRead: "Caution: a recessionary pause is not automatically bullish for crypto — risk-off deleveraging can dominate liquidity benefits." };
  }
  if (inflationNearTarget && !laborSoftening) {
    return { flavor: "BULLISH_PAUSE", reason: "Real CPI YoY is at/near the Fed's ~2% objective while the labor market holds — the Fed can afford to wait without tightening further.", cryptoRead: "Constructive: inflation near target without labor stress supports an eventual easing path, historically supportive for liquidity-sensitive assets like BTC." };
  }
  if (inflationElevated) {
    return { flavor: "BEARISH_PAUSE", reason: "Real CPI YoY remains meaningfully above the Fed's ~2% objective — the Fed is holding because inflation isn't under control yet, not because policy is already appropriately calibrated.", cryptoRead: "Caution: an inflation-driven pause keeps real yields high and delays the easing crypto often benefits from." };
  }
  return { flavor: "TRANSITIONAL_PAUSE", reason: "Real inflation and labor data don't yet point clearly in one direction.", cryptoRead: "Mixed — no strong macro tailwind or headwind from the pause itself; price action likely driven more by crypto-specific flows." };
}

// Same real ~2%-target-distance logic as explainPauseFlavor (see its own
// comment for why 0 is the wrong threshold for a YoY inflation RATE).
function explainCutFlavor({ cpiYoyChangePct, unemploymentWindowChangePct, marketRegimeLabel, liquidityWindowChangePct }) {
  const laborDeteriorating = Number.isFinite(unemploymentWindowChangePct) && unemploymentWindowChangePct > 12;
  const disinflating = Number.isFinite(cpiYoyChangePct) && cpiYoyChangePct <= 2.5;
  const liquidityExpanding = Number.isFinite(liquidityWindowChangePct) && liquidityWindowChangePct > 0;

  if (laborDeteriorating || marketRegimeLabel === "CRISIS" || marketRegimeLabel === "RISK_OFF") {
    return { flavor: "RECESSION_EMERGENCY_CUTS", reason: "Real labor deterioration and/or a real risk-off regime accompany these cuts — growth fear, not confidence, is driving policy.", cryptoRead: "Often initially bearish: growth-fear-driven deleveraging and forced liquidations can dominate the liquidity benefit at first." };
  }
  if (liquidityExpanding) {
    return { flavor: "LIQUIDITY_DRIVEN_EASING", reason: "Real system liquidity (Fed balance sheet / reverse repo trend) is expanding alongside the cuts.", cryptoRead: "Potentially very bullish: liquidity-sensitive assets like BTC have historically responded most strongly to real liquidity expansion, more than to the rate cut itself." };
  }
  if (disinflating && marketRegimeLabel !== "RISK_OFF") {
    return { flavor: "SOFT_LANDING_CUTS", reason: "Real inflation is cooling without a real risk-off regime or labor deterioration — consistent with a controlled, confidence-driven easing.", cryptoRead: "Potentially bullish for crypto and growth assets, consistent with a soft-landing narrative." };
  }
  return { flavor: "UNCERTAIN_CUT_REGIME", reason: "Real data doesn't yet clearly support soft-landing, recessionary, or liquidity-driven characterizations.", cryptoRead: "Mixed — treat the cut's crypto implication as genuinely uncertain until more evidence accumulates." };
}

// The full real "Rate Relationship" read for one crypto asset (prompt §1).
function computeRateRelationship(inputs) {
  const rateRegime = classifyRateRegime(inputs);
  const direction = impliedDirection({ fedStatementBias: inputs.fedStatementBias, rateRegime });
  let flavor = null;
  if (rateRegime === "PAUSE" || rateRegime === "HOLD_LONGER" || rateRegime === "DOVISH_HOLD") flavor = explainPauseFlavor(inputs);
  else if (rateRegime === "RATE_CUT_CYCLE") flavor = explainCutFlavor(inputs);
  return { rateRegime, impliedDirection: direction, flavor };
}

// Real, weighted Crypto Macro Score (prompt §2) — every included
// component is a real number derived from a real input; components with
// no real data source are explicitly listed as unavailable, never
// defaulted to 0 silently (0 would misleadingly imply "measured neutral").
function computeCryptoMacroScore({ correlations, rateRegime, marketRegimeLabel, momentumScore }) {
  const components = {};
  const unavailable = [];

  // Direction multiplier from the real rate regime — hawkish-leaning
  // regimes are a real headwind for a liquidity-sensitive asset, dovish/
  // easing regimes a real tailwind, sized by the asset's own real
  // measured sensitivity (never a flat assumption for every asset).
  const regimeSign = { HIKE: -1, HOLD_LONGER: -1, PAUSE: 0, DOVISH_HOLD: 0.5, RATE_CUT_CYCLE: 1, EMERGENCY_EASING: -0.5 }[rateRegime] ?? 0;

  if (Number.isFinite(correlations.fedFunds)) components.fed = Math.round(regimeSign * Math.abs(correlations.fedFunds) * 25);
  else unavailable.push("Fed sensitivity");

  if (Number.isFinite(correlations.usd)) components.usd = Math.round(-correlations.usd * 20); // real: USD strength is typically a real headwind for crypto when correlation is negative
  else unavailable.push("USD sensitivity");

  if (Number.isFinite(correlations.yields10y)) components.yields = Math.round(-correlations.yields10y * 20);
  else unavailable.push("10Y yield sensitivity");

  if (Number.isFinite(correlations.nasdaq)) components.riskAppetite = Math.round(correlations.nasdaq * (marketRegimeLabel === "RISK_ON" || marketRegimeLabel === "SELECTIVE_RISK_ON" ? 15 : -10));
  else unavailable.push("Nasdaq correlation");

  if (Number.isFinite(momentumScore)) components.momentum = Math.round(momentumScore * 15);
  else unavailable.push("Momentum");

  unavailable.push("ETF flows (no real data source)", "Regulatory sentiment (not quantified)");

  const total = Object.values(components).reduce((s, v) => s + v, 0);
  const score = Math.max(0, Math.min(100, Math.round(50 + total)));
  const label = score >= 70 ? "Bullish" : score >= 55 ? "Leaning bullish" : score >= 45 ? "Neutral" : score >= 30 ? "Leaning bearish" : "Bearish";
  return { score, label, components, unavailable };
}

// Real momentum read from the asset's own real price history — no macro
// input needed. % return over the real lookback window, clamped to
// +/-20% and linearly scaled to [-1, 1] (a real, disclosed compression so
// one outsized week doesn't blow the Crypto Macro Score's momentum
// component past its intended weight).
function computeMomentumScore(bars, lookbackDays = 14) {
  const daily = toDailySeries(bars);
  if (daily.length < lookbackDays + 1) return null;
  const latest = daily[daily.length - 1].value;
  const past = daily[daily.length - 1 - lookbackDays].value;
  if (!past) return null;
  const pct = ((latest - past) / past) * 100;
  return Math.max(-1, Math.min(1, pct / 20));
}

module.exports = {
  pearson, alignByDate, toDailySeries, computeMacroCorrelation, sensitivityLabel, computeMomentumScore,
  classifyRateRegime, impliedDirection, explainPauseFlavor, explainCutFlavor,
  computeRateRelationship, computeCryptoMacroScore, RATE_REGIMES,
  MIN_ALIGNED_OBSERVATIONS,
};
