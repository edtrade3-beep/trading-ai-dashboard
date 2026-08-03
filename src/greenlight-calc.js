// greenlight-calc.js — server-side port of trading-utils.js's computeGreenLight
// (client-side only until now), so a real background Telegram alert can know
// when a Watchlist symbol's real entry price has been reached, even when the
// app tab isn't open. Same real math, same real thresholds, same real
// graceful-degradation fallbacks as the client version (already proven live:
// ActivePositionsCard.jsx already calls the client computeGreenLight with
// scanRow=null in production, exactly the same "EMA/RSI/MACD unavailable"
// shape this server port runs under, since no server job computes intraday
// EMA9/EMA21/RSI/MACD). Keep this in sync with computeGreenLight/computeRvol/
// _trendSignals in axiom-runner/components/trading-utils.js if the client
// version's real logic ever changes — verified identical (on every field
// this port returns) by a parity smoke test (test/smoke.js). Trimmed: the
// client's SHORT-setup/bear-score/bottom-reversal branches are omitted —
// this port only exists to answer "is this a real long entry right now,"
// so those unrelated real computations aren't ported.
"use strict";

// Real RVOL (today's volume ÷ 50-day average volume), same real fallback
// chain as the client: q.avgVolume from a live quote batch, else
// trend.volRatio (server-computed from real Yahoo bar history).
function computeRvol(q, trend) {
  const avgVol = Number(q?.avgVolume || 0);
  const vol = Number(q?.volume || 0);
  if (avgVol > 0) return vol / avgVol;
  const vr = Number(trend?.volRatio);
  return Number.isFinite(vr) && vr > 0 ? vr : 0;
}

function _trendSignals(trend) {
  const stage = String(trend?.stage || "");
  const inUptrend   = stage.startsWith("Stage 2");
  const inDowntrend = stage.startsWith("Stage 3") || stage.startsWith("Stage 4");
  const distToHigh  = trend && Number.isFinite(Number(trend.pctFromHigh)) ? -Number(trend.pctFromHigh) : null;
  const abovePivotPct = trend && Number.isFinite(Number(trend.abovePivotPct)) ? Number(trend.abovePivotPct) : null;
  return { inUptrend, inDowntrend, distToHigh, abovePivotPct };
}

function computeGreenLight(q, spyChg, scanRow, regime = null, trend = null) {
  const px     = Number(q?.price || q?.regularMarketPrice || 0);
  const ma50   = Number(q?.priceAvg50 || q?.fiftyDayAverage || 0);
  const ma200  = Number(q?.priceAvg200 || q?.twoHundredDayAverage || 0);
  const ema21  = Number(scanRow?.ema21v || 0);
  const ema9   = Number(scanRow?.ema9v || 0);
  const macdBull = scanRow?.macdBull;
  const rsi    = Number(scanRow?.rsiVal || 0) || 50;
  const vol    = Number(q?.volume || 0);
  const rvol   = computeRvol(q, trend);
  const chg    = Number(q?.changesPercentage || 0);
  const { inUptrend, inDowntrend, distToHigh, abovePivotPct } = _trendSignals(trend);

  const dayRange = Number(q?.dayHigh || 0) - Number(q?.dayLow || 0);
  const hi52 = Number(q?.yearHigh || 0), lo52 = Number(q?.yearLow || 0);
  let atrPct;
  if (px > 0 && dayRange > 0)                       atrPct = dayRange / px;
  else if (px > 0 && hi52 > lo52 && lo52 > 0)       atrPct = ((hi52 - lo52) / px) / 24;
  else                                              atrPct = 0.025;
  atrPct = Math.max(0.01, Math.min(0.05, atrPct));

  const rsiKnown = Number(scanRow?.rsiVal) > 0;
  const momentumPass = rsiKnown ? rsi >= 50 : chg > 0;
  const checks = [
    { label: "Market safe",  pass: spyChg > -0.5,
      tip: `SPY ${spyChg >= 0 ? "+" : ""}${spyChg.toFixed(2)}% — buy only when the tape is safe` },
    { label: "Uptrend",      pass: ma50 > 0 ? (px > ma50 && (ma200 > 0 ? ma50 > ma200 : true)) : (trend ? inUptrend : false),
      tip: (ma50 > 0 && ma200 > 0) ? `Price > MA50 $${ma50.toFixed(2)} > MA200 $${ma200.toFixed(2)} (aligned)` : (ma50 > 0 ? `Price > MA50 $${ma50.toFixed(2)}` : trend ? (inUptrend ? "Stage 2 uptrend confirmed (real trend structure)" : inDowntrend ? "Stage 3/4 downtrend — not an uptrend" : "Trend stage unclear — no signal") : "No MA data") },
    { label: rsiKnown ? `Momentum · RSI ${rsi.toFixed(0)}` : "Momentum",  pass: momentumPass,
      tip: rsiKnown ? `RSI ${rsi.toFixed(0)} (>50 = bullish momentum)` : `Up ${chg >= 0 ? "+" : ""}${chg.toFixed(1)}% today` },
    { label: rvol > 0 ? `Volume ${rvol.toFixed(1)}x` : "Volume active",  pass: rvol >= 1.5 || vol === 0,
      tip: rvol > 0 ? `RVOL ${rvol.toFixed(1)}x (≥1.5x min · 2.0x preferred for clean breakouts)` : "No volume data" },
    { label: "Good entry",   pass: ema21 > 0 ? (px <= ema21 * 1.08 && px >= ema21 * 0.94) : (ma50 > 0 && px <= ma50 * 1.10 && px >= ma50 * 0.92),
      tip: ema21 > 0 ? `Within reach of EMA21 $${ema21.toFixed(2)} — not over-extended` : `Near MA50 $${ma50.toFixed(2)}` },
  ];

  const passed = checks.filter(c => c.pass).length;
  const signal = passed >= 4 ? "GREEN" : passed >= 3 ? "YELLOW" : "RED";

  const marketSafeForAlt = spyChg > -0.5;
  const bosBullish = trend?.smc?.bos?.type === "BULL_BOS";
  const rvolBreakout = rvol >= 2.5 && chg > 1 && !(abovePivotPct != null && abovePivotPct > 10);
  const higherLowsGoing = trend?.higherLows === true && (rsiKnown ? rsi >= 50 : chg > 0);
  const macdEmaCross = macdBull === true && ema9 > 0 && ema21 > 0 && ema9 > ema21;
  const altCandidates = [
    { type: "BOS Breakout", pass: bosBullish, reason: "Real bullish break of structure (smc-engine)" },
    { type: "RVOL Breakout", pass: rvolBreakout, reason: `RVOL ${rvol.toFixed(1)}x with a real ${chg >= 0 ? "+" : ""}${chg.toFixed(1)}% move` },
    { type: "Higher Lows Continuation", pass: higherLowsGoing, reason: "Real rising swing-low sequence, momentum positive" },
    { type: "MACD/EMA Momentum Cross", pass: macdEmaCross, reason: "Real MACD bullish crossover + EMA9 > EMA21" },
  ];
  const altMatch = marketSafeForAlt ? altCandidates.find(a => a.pass) : null;
  const altSetup = altMatch ? { type: altMatch.type, reason: altMatch.reason } : null;
  const tradeable = signal === "GREEN" || altSetup != null;

  const stop   = px > 0 ? (px * (1 - atrPct * 1.5)).toFixed(2) : 0;
  const t1     = px > 0 ? (px * 1.05).toFixed(2) : 0;
  const t2     = px > 0 ? (px * 1.10).toFixed(2) : 0;
  const riskDist = px > 0 ? px - Number(stop) : 0;
  const rr = riskDist > 0 ? (Number(t2) - px) / riskDist : 0;
  const rrPass = rr >= 2.5;

  const trendPivot = Number(trend?.pivot || 0);
  const support = ema21 > 0 ? ema21 : (ma50 > 0 ? ma50 : (trendPivot > 0 ? trendPivot : px * 0.985));
  let bestEntry = px;
  let entryNote = "at market";
  if (px > support * 1.005) {
    bestEntry = Math.max(support, px * 0.985);
    entryNote = "wait for pullback";
  } else if (px <= support * 1.005) {
    bestEntry = px;
    entryNote = "at support ✅";
  }

  const relStrength = chg - spyChg;
  const isLeader = relStrength > 1.0;
  const atEntry = entryNote.includes("support");

  let pTrend = 0;
  if (ma200 > 0 && px > ma200) pTrend += 10;
  else if (ma200 <= 0 && trend && inUptrend) pTrend += 10;
  if (ma50 > 0 && ma200 > 0 && ma50 > ma200) pTrend += 10;
  else if ((ma50 <= 0 || ma200 <= 0) && abovePivotPct !== null && abovePivotPct > 0) pTrend += 10;
  if (ema9 > 0 && ema21 > 0 && ema9 > ema21) pTrend += 10;
  let pMom = 0;
  if (rsi >= 50 && rsi <= 65) pMom += 5;
  if (macdBull === true) pMom += 5;
  const trendingStrong = ma50 > 0 && ma200 > 0
    ? (px > ma50 && ma50 > ma200 && ema9 > 0 && ema9 > ema21)
    : (trend ? (inUptrend && ema9 > 0 && ema9 > ema21) : false);
  if (trendingStrong) pMom += 5;
  if (relStrength >= 1) pMom += 5;
  const pVol = (rvol >= 2 ? 10 : 0) + (rvol >= 1 ? 5 : 0);
  const pStruct = atEntry ? 20 : (entryNote === "wait for pullback" ? 12 : 6);
  const pRisk = (rr >= 2.5 ? 10 : 0) + (atrPct >= 0.015 && atrPct <= 0.05 ? 5 : 0);
  const aScore = pTrend + pMom + pVol + pStruct + pRisk;
  const grade  = aScore >= 95 ? "ELITE" : aScore >= 90 ? "A+" : aScore >= 85 ? "GOOD" : aScore >= 80 ? "WATCH" : "IGNORE";
  const confRisk = aScore >= 95 ? 1.0 : aScore >= 90 ? 0.75 : aScore >= 85 ? 0.5 : 0;
  const marketPass = regime == null ? spyChg > -0.3 : regime >= 75;
  // Named qualifiesAPlus, not aPlus — kept in parity with the client-side
  // rename in trading-utils.js (2026-08-04 collision-risk fix vs. the
  // separate real 9-dimension A+ Score object elsewhere in this app).
  const qualifiesAPlus = aScore >= 85 && marketPass && atEntry;

  const invalidation = trend ? (Array.isArray(trend.setup && trend.setup.sellSignals) ? trend.setup.sellSignals : []) : null;

  return {
    checks, passed, signal, altSetup, tradeable, px, chg, stop, t1, t2, rvol, rsi, atrPct, invalidation,
    bestEntry: +bestEntry.toFixed(2), entryNote, relStrength: +relStrength.toFixed(2), isLeader,
    rr: +rr.toFixed(1), rrPass, atEntry,
    aScore, grade, confRisk, qualifiesAPlus, marketPass,
  };
}

module.exports = { computeGreenLight, computeRvol, _trendSignals };
