"use strict";

// mtf-swing-engine.js — SWING_SETUP (4H timeframe), MTF Decision System
// Phase 2 (2026-08-20). Answers "is a swing setup forming on the 4H
// chart?" — deliberately reuses detectPriceAction (daytrade-console-
// engine.js), which is genuinely timeframe-agnostic (just reads bars),
// instead of writing a second breakout/breakdown/retest detector. Its
// own "recentBars = bars.slice(-6), last ~90 min on 15m bars" comment no
// longer applies verbatim when fed 4H bars — 6 bars there is ~24h/several
// sessions, not 90 minutes — but that's a real, honest timeframe-scaling
// note, not a bug: a multi-day retest window is the right window for a
// 4H swing read, just a different real duration than the 15m case.
//
// Contraction is read off real ATR (atrAt, src/routes/market.js — already
// exported, already reused across timeframes for daytrade-console-
// engine.js's 15-min ATR) rather than Foundation's computeTightness,
// which is NOT safely reusable here: it buckets bars into "weeks" via a
// hardcoded 5-bars-per-week assumption calibrated for DAILY bars. Feeding
// it 4H bars would silently mislabel a 20-hour window as "a week" — the
// exact class of quiet-wrong-timeframe bug this whole build exists to
// avoid, not introduce.

const { detectPriceAction } = require("./daytrade-console-engine");
const { atrAt } = require("./routes/market");

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

function computeSwingSetup(bars) {
  if (!Array.isArray(bars) || bars.length < 20) {
    return { state: null, reasons: [], dataInsufficient: true, reason: "Not enough real 4H history yet." };
  }

  const pa = detectPriceAction(bars); // no orHigh/orLow — falls back to real swing-point resistance/support
  const last = bars.length - 1;
  const atrRecent = atrAt(bars, 5, last);
  const atrBaseline = atrAt(bars, 20, last);
  const contractionPct = (atrRecent != null && atrBaseline != null && atrBaseline > 0)
    ? round2((atrRecent / atrBaseline - 1) * 100) : null;
  const contracting = contractionPct != null && contractionPct <= -15;
  const expanding = contractionPct != null && contractionPct >= 25;

  const recentVols = bars.slice(-10).map((b) => b.volume || 0);
  const baselineVols = bars.slice(-30, -10).map((b) => b.volume || 0);
  const avgRecentVol = recentVols.length ? recentVols.reduce((a, b) => a + b, 0) / recentVols.length : null;
  const avgBaselineVol = baselineVols.length ? baselineVols.reduce((a, b) => a + b, 0) / baselineVols.length : null;
  const volContracting = (avgRecentVol != null && avgBaselineVol != null && avgBaselineVol > 0)
    ? (avgRecentVol / avgBaselineVol) < 0.85 : null;

  const reasons = [];
  let state;
  if (pa.breakdown || pa.failedBreakout) {
    state = "BROKEN";
    reasons.push(pa.breakdown ? "Broke below 4H support." : "Failed breakout on the 4H chart.");
  } else if (pa.higherLows && (contracting || volContracting)) {
    state = "STRONG";
    reasons.push("Higher lows holding on the 4H chart.");
    if (contracting) reasons.push(`Volatility contracting (${contractionPct}% vs the 20-bar baseline).`);
    if (volContracting) reasons.push("Volume contracting into the base.");
  } else if (pa.higherLows || contracting || volContracting) {
    state = "DEVELOPING";
    if (pa.higherLows) reasons.push("Higher lows forming on the 4H chart.");
    if (contracting) reasons.push(`Volatility starting to contract (${contractionPct}%).`);
    if (volContracting) reasons.push("Volume beginning to contract.");
  } else {
    state = "WEAK";
    reasons.push("No real consolidation or higher-low structure on the 4H chart yet.");
  }
  if (expanding) reasons.push(`⚠ Volatility expanding (${contractionPct}%) — a less reliable base right now.`);

  return { state, reasons, priceAction: pa, contractionPct, volContracting, dataInsufficient: false };
}

module.exports = { computeSwingSetup };
