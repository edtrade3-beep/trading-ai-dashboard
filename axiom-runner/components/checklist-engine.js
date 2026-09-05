// checklist-engine.js — Trade Checklist / Trade Coach, options platform
// redesign Phase 10. Consolidates (doesn't delete) the two existing
// partial checklists — the Minervini Trend Template (SMA50/150/200 +
// 52wk range + RS rating, src/routes/market.js's buildTrendTemplate) and
// GreenLightTab's 5-check "AI Review" (trading-utils.js's
// computeGreenLight) — into one broader, options-flow-aware checklist.
// Pure client-side math over data the Charts page already has loaded
// (chart.bars, symTrend.volRatio, symNewsSentiment, symDarkPool,
// symOptionsFlow, symGamma, chart.smc) — zero new fetches.
//
// Honest scope note on "Above VWAP": `chart.bars` are real DAILY OHLCV
// bars (buildTrendTemplate's 1y/1d fetch), not intraday bars — computing
// a session VWAP from these would be mislabeled. Instead this computes a
// real 20-day rolling volume-weighted average price ("20D VWAP"), a
// genuinely different, legitimately-referenced institutional level, and
// labels it exactly that rather than claiming to be the intraday VWAP a
// day-trader means by "VWAP".

// Real live bug fix (2026-09-04, platform audit) — this seeded EMA with
// the SMA of the first `period` values, genuinely diverging from
// src/indicators.js's canonical values[0]-seeded formula used server-side
// (same indicator, different real numbers on the same bars). Seeding
// convention aligned here to match; insufficient-data contract (null)
// unchanged.
function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function vwap20d(bars) {
  const window = (bars || []).slice(-20);
  if (window.length < 5) return null;
  let pv = 0, vol = 0;
  for (const b of window) {
    const typical = (Number(b.high) + Number(b.low) + Number(b.close)) / 3;
    const v = Number(b.volume) || 0;
    pv += typical * v; vol += v;
  }
  return vol > 0 ? pv / vol : null;
}

function dot(label, pass, detail) {
  return { label, pass, detail };
}

// `bars` — real daily OHLCV (chart.bars). `price` — real last price.
// `rvol` — real relative volume (symTrend.volRatio). `newsSentiment` —
// real {score, bulls, bears} (symNewsSentiment). `darkPool` — real
// {prints:[{value}]} (symDarkPool). `optionsFlow` — real
// {callNotional, putNotional} (symOptionsFlow). `gammaExposure` — real
// GEX object (symGamma). `smc` — real {bos, choch} (chart.smc).
export function computeChecklist({ bars, price, rvol, newsSentiment, darkPool, optionsFlow, gammaExposure, smc } = {}) {
  const closes = (bars || []).map(b => Number(b.close)).filter(Number.isFinite);
  const p = Number(price);
  const dots = [];

  const vwap = vwap20d(bars);
  dots.push(dot("Above 20D VWAP", vwap != null && p > 0 ? p > vwap : null,
    vwap != null ? `20-day volume-weighted avg: $${vwap.toFixed(2)}` : "Not enough real daily bars"));

  for (const period of [9, 21, 50, 200]) {
    const e = ema(closes, period);
    dots.push(dot(`Above ${period} EMA`, e != null && p > 0 ? p > e : null,
      e != null ? `${period} EMA: $${e.toFixed(2)}` : `Not enough real bars for a ${period}-period EMA`));
  }

  const rv = Number(rvol);
  dots.push(dot("Volume Confirmation (RVOL ≥ 1.5x)", Number.isFinite(rv) ? rv >= 1.5 : null,
    Number.isFinite(rv) ? `Real RVOL: ${rv.toFixed(2)}x` : "No real volume data"));

  const newsScore = Number(newsSentiment?.score);
  dots.push(dot("Positive News", Number.isFinite(newsScore) ? newsScore > 0 : null,
    Number.isFinite(newsScore) ? `Real sentiment score: ${newsScore} (${newsSentiment?.bulls ?? 0} bullish / ${newsSentiment?.bears ?? 0} bearish headlines)` : "News sentiment unavailable"));

  // Reuses the exact $500K real block-print threshold already established
  // in computeAiTradeScore/computeInstitutionScore (market-helpers.js) —
  // this data source has no buy/sell side, so this is a real
  // MAGNITUDE-of-institutional-participation read, not a directional call.
  const darkPoolNotional = (darkPool?.prints || []).reduce((s, pr) => s + (Number(pr.value) || 0), 0);
  dots.push(dot("Dark Pool Activity ($500K+)", darkPool ? darkPoolNotional > 500_000 : null,
    darkPool ? `$${(darkPoolNotional / 1e6).toFixed(1)}M in real block prints` : "Dark pool data unavailable"));

  // Reuses computeAiTradeScore's exact real call/put notional ratio
  // convention (>50% call-side notional = bullish flow bias).
  const callN = Number(optionsFlow?.callNotional), putN = Number(optionsFlow?.putNotional);
  const flowTotal = (Number.isFinite(callN) ? callN : 0) + (Number.isFinite(putN) ? putN : 0);
  const flowRatio = flowTotal > 0 ? callN / flowTotal : null;
  dots.push(dot("Bullish Call Flow", flowRatio != null ? flowRatio > 0.5 : null,
    flowRatio != null ? `${Math.round(flowRatio * 100)}% of real options notional is call-side` : "Options flow data unavailable"));

  // Reuses Phase 7's real Dealer Bias sign (gamma-exposure.js) — positive
  // net GEX = dealers net long gamma, historically associated with
  // compressed, supportive/mean-reverting price action.
  dots.push(dot("Gamma Support (dealers net long gamma)", gammaExposure?.available ? gammaExposure.netGEX > 0 : null,
    gammaExposure?.available ? `Real net GEX: ${gammaExposure.netGEX.toLocaleString()}` : (gammaExposure?.reason || "Gamma data unavailable")));

  const bosType = smc?.bos?.type;
  dots.push(dot("Trend Confirmation (Bullish BOS)", bosType ? bosType === "BULL_BOS" : null,
    bosType ? `Real structure break: ${smc.bos.label || bosType}` : "No real recent structure break detected"));

  const scored = dots.filter(d => d.pass !== null);
  const passCount = scored.filter(d => d.pass).length;
  const total = scored.length;

  // Trade Grade — a documented pass-count threshold table, deliberately
  // NOT institutionalLetterGrade's scale (A+ ≥90/A ≥80/B+ ≥70/B ≥60/C
  // ≥50/D ≥35/F <35 on a 0-100 score) — this is a distinct 0-9 dot-count
  // scale on real, independently-gated checks.
  let grade = "Avoid";
  if (total > 0) {
    const pct = passCount / total;
    if (pct >= 0.9) grade = "A+";
    else if (pct >= 0.75) grade = "A";
    else if (pct >= 0.6) grade = "B";
    else if (pct >= 0.4) grade = "C";
    else grade = "Avoid";
  }

  return { dots, passCount, total, grade };
}
