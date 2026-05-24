"use strict";
/**
 * cotBiasEngine.js
 * Converts a sequence of normalised COT records into a scored bias object.
 *
 * Score range: -100 (strongly bearish) to +100 (strongly bullish)
 *
 * Bias labels:
 *   +60 to +100  → "Strong Bullish"
 *   +25 to  +59  → "Bullish"
 *   -24 to  +24  → "Neutral"
 *   -25 to  -59  → "Bearish"
 *   -60 to -100  → "Strong Bearish"
 */

// ── Percentile helper ─────────────────────────────────────────────────────────

function percentileOf(value, series) {
  if (!series || series.length < 2) return 50;
  const below = series.filter(v => v < value).length;
  return Math.round((below / series.length) * 100);
}

// ── Net position series extractors ───────────────────────────────────────────

function primaryNetSeries(records, reportType) {
  // Primary signal actor per report type
  if (reportType === "TFF") {
    return records.map(r => r.assetMgrNet);  // Asset managers = institutional trend
  }
  if (reportType === "DISAGG") {
    return records.map(r => r.mmNet);         // Managed money = speculator trend
  }
  // LEGACY
  return records.map(r => r.noncommercialNet);
}

function secondaryNetSeries(records, reportType) {
  if (reportType === "TFF") {
    return records.map(r => r.levMoneyNet);  // Leveraged funds = fast money
  }
  if (reportType === "DISAGG") {
    return records.map(r => r.mmNet);
  }
  return records.map(r => r.noncommercialNet);
}

// ── Main scoring function ─────────────────────────────────────────────────────

function computeBias(records) {
  if (!records || records.length < 2) {
    return {
      score: 0, label: "Neutral", biasEmoji: "⚪",
      primaryPct13: 50, primaryPct52: 50,
      crowdedLong: false, crowdedShort: false,
      positioningExtreme: false,
      weekChange: 0, fourWeekChange: 0,
      openInterest: 0, reportDate: "",
      detail: "Insufficient data",
    };
  }

  const reportType = records[0].reportType;
  const latest     = records[records.length - 1];
  const prior      = records[records.length - 2];
  const prior4     = records.length >= 5 ? records[records.length - 5] : records[0];

  const primaryNets = primaryNetSeries(records, reportType);
  const secNets     = secondaryNetSeries(records, reportType);

  const primaryNet  = primaryNets[primaryNets.length - 1];
  const primaryPrev = primaryNets[primaryNets.length - 2];

  const secNet  = secNets[secNets.length - 1];
  const secPrev = secNets[secNets.length - 2];

  // 13-week (≈3-month) and 52-week historical slices
  const hist13 = primaryNets.slice(-13);
  const hist52 = primaryNets.slice(-52);

  const pct13 = percentileOf(primaryNet, hist13);
  const pct52 = percentileOf(primaryNet, hist52);

  const weekChange   = primaryNet - primaryPrev;
  const fourWeekNet4 = primaryNets.length >= 5 ? primaryNets[primaryNets.length - 5] : primaryPrev;
  const fourWeekChange = primaryNet - fourWeekNet4;

  // ── Score components ────────────────────────────────────────────────────────

  let score = 0;

  // 1. 52-week percentile position (−40 to +40)
  // Above 60th percentile → positive bias; below 40th → negative
  if (pct52 >= 70)       score += 30 + Math.min((pct52 - 70) / 30 * 10, 10);
  else if (pct52 >= 50)  score += (pct52 - 50) / 20 * 30;
  else if (pct52 >= 30)  score -= (50 - pct52) / 20 * 30;
  else                   score -= 30 + Math.min((30 - pct52) / 30 * 10, 10);

  // 2. Week-over-week direction (±20)
  if (weekChange > 0)      score += 20;
  else if (weekChange < 0) score -= 20;

  // 3. 4-week trend continuation (±15)
  if (fourWeekChange > 0)      score += 15;
  else if (fourWeekChange < 0) score -= 15;

  // 4. Secondary actor confirmation (±15)
  const secWeekChange = secNet - secPrev;
  if (secWeekChange > 0 && weekChange > 0)       score += 15;
  else if (secWeekChange < 0 && weekChange < 0)  score -= 15;
  else if (secWeekChange !== 0)                  score += secWeekChange > 0 ? 5 : -5;

  // 5. Commercial hedger (contrarian) — for DISAGG producers are bearish when long
  if (reportType === "DISAGG") {
    const prodNet = latest.producerNet;
    // Commercials heavily short = they're hedging production = market near top → caution
    if (prodNet < 0 && Math.abs(prodNet) > latest.openInterest * 0.3) {
      score -= 5; // slight bearish weight from heavy commercial hedging
    }
  }

  // ── Clamp before extreme adjustments ───────────────────────────────────────
  score = Math.max(-85, Math.min(85, score));

  // 6. Crowded positioning: reduce conviction at extremes, flag reversal risk
  const crowdedLong  = pct52 >= 90;
  const crowdedShort = pct52 <= 10;

  if (crowdedLong)  score = Math.max(score - 15, score * 0.75);
  if (crowdedShort) score = Math.min(score + 15, score * 0.75);

  score = Math.round(Math.max(-100, Math.min(100, score)));

  // ── Label ───────────────────────────────────────────────────────────────────
  let label, biasEmoji;
  if (score >= 60)       { label = "Strong Bullish"; biasEmoji = "🟢"; }
  else if (score >= 25)  { label = "Bullish";        biasEmoji = "🟢"; }
  else if (score >= -24) { label = "Neutral";        biasEmoji = "⚪"; }
  else if (score >= -59) { label = "Bearish";        biasEmoji = "🔴"; }
  else                   { label = "Strong Bearish"; biasEmoji = "🔴"; }

  if (crowdedLong)  { label += " ⚠️ Crowded Long";  biasEmoji = "🟡"; }
  if (crowdedShort) { label += " ⚠️ Crowded Short"; biasEmoji = "🟡"; }

  return {
    score,
    label,
    biasEmoji,
    primaryPct13: pct13,
    primaryPct52: pct52,
    crowdedLong,
    crowdedShort,
    positioningExtreme: crowdedLong || crowdedShort,
    weekChange,
    fourWeekChange,
    openInterest:  latest.openInterest,
    reportDate:    latest.reportDate,
    reportType,
    primaryNet,
    primaryPrev,
    secNet,
    longOI:  reportType === "TFF" ? latest.assetMgrLong  : (reportType === "DISAGG" ? latest.mmLong  : latest.noncommercialLong),
    shortOI: reportType === "TFF" ? latest.assetMgrShort : (reportType === "DISAGG" ? latest.mmShort : latest.noncommercialShort),
    detail: `${label}  |  Score ${score}  |  52w pct ${pct52}%  |  Wk chg ${weekChange > 0 ? "+" : ""}${weekChange.toLocaleString()}`,
  };
}

// ── COT confidence filter for intraday signals ────────────────────────────────
/**
 * Returns "aligned", "neutral", or "opposed" given an intraday trade direction
 * and a COT bias object.
 */
function cotAlignment(intradayDirection, cotBias) {
  if (!cotBias) return "neutral";
  const s = cotBias.score;
  if (intradayDirection === "BUY") {
    if (s >= 25)  return "aligned";
    if (s >= -24) return "neutral";
    return "opposed";
  }
  if (intradayDirection === "SELL") {
    if (s <= -25) return "aligned";
    if (s <= 24)  return "neutral";
    return "opposed";
  }
  return "neutral";
}

module.exports = { computeBias, cotAlignment, percentileOf };
