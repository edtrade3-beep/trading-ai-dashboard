// Shared trading/scoring business logic used broadly across the monolith
// (composite scoring, the Green Light 5-check system, and the client-side
// paper-trading simulation: opening paper longs/shorts/options, valuing
// them, and the Alpaca sandbox option-order helper). Kept separate from
// market-helpers.js (market-wide reference data/regime) since this is
// specifically about scoring a symbol and simulating trades on it.

// Real shared Anti-Chase band (2026-08-21, Unified Trading System phase 3)
// — same real computeAntiChase primitive entry-engine.js's real gate uses,
// replacing this file's own flat abovePivotPct>10 cutoff below. Must stay
// in sync with src/greenlight-calc.js's identical fix (same parity-tested
// server twin this whole file already keeps in sync with).
import { computeAntiChase } from "./anti-chase.js";

export function classifyTrend(q) {
  if (!q) return "—";
  const chg = q.changesPercentage || 0;
  if (chg > 2.5) return "Strong Up";
  if (chg > 0.5) return "Up";
  if (chg > -0.5) return "Flat";
  if (chg > -2) return "Weak";
  return "Down";
}

// Real RVOL (today's volume ÷ 50-day average volume). q.avgVolume comes from
// /api/market/quote, which never populates it for any Alpaca-covered symbol
// — same root cause as priceAvg50/200/yearHigh/yearLow above, confirmed live
// 2026-07-27 (Watchlist showing "RVOL 0.00x" for AAPL, an Alpaca-covered
// symbol). trend.volRatio (from /api/market/trend-screen) is the exact same
// ratio, computed server-side from real Yahoo bar history, so it's a real
// fallback rather than a fabricated one. Only genuinely returns 0 when
// neither source has real data.
export function computeRvol(q, trend) {
  const avgVol = Number(q?.avgVolume || 0);
  const vol = Number(q?.volume || 0);
  if (avgVol > 0) return vol / avgVol;
  const vr = Number(trend?.volRatio);
  return Number.isFinite(vr) && vr > 0 ? vr : 0;
}

// trend: optional row from /api/market/trend-screen ({stage, pctFromHigh,
// abovePivotPct, pivot, ...}). q.priceAvg50/priceAvg200/yearHigh/yearLow
// come from /api/market/quote, a fast price-only path that never populates
// them for any Alpaca-covered symbol (confirmed live this session — same
// root cause fixed in PredictionsTab/GreenLight deep-dive/DipBuy/
// EarlyEntryScanner/AutoPilot/Dashboard/Holdings/TradeAdvisor). When ma50/
// ma200/hi52/lo52 are genuinely present (non-Alpaca symbol, Yahoo overlay
// ran) they're used as before; otherwise, if a real trend row was passed,
// it substitutes for the dead fields instead of just going dark.
function _trendSignals(trend) {
  const stage = String(trend?.stage || "");
  const inUptrend   = stage.startsWith("Stage 2");
  const inDowntrend = stage.startsWith("Stage 3") || stage.startsWith("Stage 4");
  const distToHigh  = trend && Number.isFinite(Number(trend.pctFromHigh)) ? -Number(trend.pctFromHigh) : null; // % below the high
  const abovePivotPct = trend && Number.isFinite(Number(trend.abovePivotPct)) ? Number(trend.abovePivotPct) : null;
  return { inUptrend, inDowntrend, distToHigh, abovePivotPct };
}

export function computeScores(q, trend) {
  if (!q) return { tech: 0, fund: 0, macro: 0, composite: 0, reasons: [] };

  const price  = Number(q.price  || q.regularMarketPrice || 0);
  const chgPct = Number(q.changesPercentage || q.regularMarketChangePercent || 0);
  const ma50   = Number(q.priceAvg50  || q.fiftyDayAverage   || 0);
  const ma200  = Number(q.priceAvg200 || q.twoHundredDayAverage || 0);
  const hi52   = Number(q.yearHigh    || q.fiftyTwoWeekHigh  || 0);
  const lo52   = Number(q.yearLow     || q.fiftyTwoWeekLow   || 0);
  const vol    = Number(q.volume      || q.regularMarketVolume || 0);
  const pe     = Number(q.pe          || q.trailingPE         || 0);
  const mcap   = Number(q.marketCap   || 0);
  const beta   = Number(q.beta        || 0);
  const { inUptrend, inDowntrend, distToHigh, abovePivotPct } = _trendSignals(trend);
  // Real, honest reason strings for whichever branches actually fire below —
  // this used to be an unexplained "S:XX" number with no tooltip anywhere it
  // rendered (QuotesTab.jsx card/table views); every other score in this app
  // is explained, this one wasn't (2026-07-29 fix). Appended alongside the
  // existing scoring logic, never changes the actual point math.
  const reasons = [];

  // ── TECHNICAL SCORE (0-100) ────────────────────────────────────────────────
  let tech = 40; // neutral base

  // MA alignment — most important signal (doesn't depend on today's change)
  if (price > 0 && ma50 > 0 && ma200 > 0) {
    if (price > ma50 && ma50 > ma200)      { tech += 20; reasons.push("Above 50D & 200D MA (uptrend)"); } // perfect uptrend
    else if (price > ma50 && price > ma200) { tech += 12; reasons.push("Above 50D & 200D MA (mixed structure)"); } // above both, mixed
    else if (price > ma200)                 { tech += 6;  reasons.push("Above 200D MA only"); }  // above 200 only
    else if (price < ma50 && ma50 < ma200) { tech -= 15; reasons.push("Below 50D & 200D MA (downtrend)"); } // perfect downtrend
    else                                    { tech -= 6;  reasons.push("Mixed bearish MA structure"); }  // mixed bearish
  } else if (trend) {
    // ma50/ma200 dead — fall back to real Weinstein-stage structure instead
    // of silently losing the whole factor. Ambiguous stages (e.g. "Stage
    // 1/3 — Transition") intentionally get neither bonus nor penalty.
    if (inUptrend)        { tech += 18; reasons.push("Real confirmed Stage 2 uptrend"); } // real confirmed uptrend (analog of "perfect uptrend")
    else if (inDowntrend) { tech -= 15; reasons.push("Real confirmed downtrend"); } // real confirmed downtrend
  }

  // Distance from MA50 — stretched or at support
  if (price > 0 && ma50 > 0) {
    const d50 = (price - ma50) / ma50 * 100;
    if (d50 > -2 && d50 < 5)   { tech += 8; reasons.push("Testing/just above 50D MA"); }  // testing / just above MA50
    else if (d50 > 5 && d50 < 15) { tech += 5; reasons.push("Healthy distance above 50D MA"); } // healthy above
    else if (d50 > 20)          { tech -= 5; reasons.push("Stretched too far above 50D MA"); }  // stretched too high
    else if (d50 < -15)         { tech -= 8; reasons.push("Far below 50D MA"); }  // far below
  } else if (abovePivotPct !== null) {
    // Real distance above the trend-screen's own technical pivot, same idea
    if (abovePivotPct > -2 && abovePivotPct < 5)   { tech += 8; reasons.push("Fresh, unextended breakout above pivot"); }
    else if (abovePivotPct > 5 && abovePivotPct < 15) { tech += 5; reasons.push("Healthy distance above pivot"); }
    else if (abovePivotPct > 20)          { tech -= 5; reasons.push("Extended too far above pivot"); }
    else if (abovePivotPct < -15)         { tech -= 8; reasons.push("Well below the pivot"); }
  }

  // 52W range position
  if (hi52 > lo52 && price > 0) {
    const pos = (price - lo52) / (hi52 - lo52);
    if (pos > 0.80)      { tech += 10; reasons.push(`52W range ${Math.round(pos * 100)}% (near highs)`); } // near highs — strength
    else if (pos > 0.55) { tech += 5; reasons.push(`52W range ${Math.round(pos * 100)}%`); }
    else if (pos < 0.20) { tech -= 8; reasons.push(`52W range ${Math.round(pos * 100)}% (near lows)`); }  // near lows — weakness
    else if (pos < 0.35) { tech -= 3; reasons.push(`52W range ${Math.round(pos * 100)}% (weak)`); }
  } else if (distToHigh !== null) {
    // No real 52w-low analog from trend-screen (pctFromHigh only), so the
    // "near lows — weakness" branch is dropped rather than fabricated —
    // same precedent as EarlyEntryScanner/TradeAdvisorTab this session.
    if (distToHigh <= 3)       { tech += 10; reasons.push(`${distToHigh.toFixed(1)}% from 52W high`); } // real near-high strength
    else if (distToHigh <= 15) { tech += 5; reasons.push(`${distToHigh.toFixed(1)}% from 52W high`); }
  }

  // Volume confirmation
  const rvol = computeRvol(q, trend);
  if (vol > 0 && rvol > 0) {
    if (rvol > 2 && chgPct > 0)   { tech += 10; reasons.push(`RVOL ${rvol.toFixed(1)}x on an up day`); }
    else if (rvol > 1.5 && chgPct > 0) { tech += 6; reasons.push(`RVOL ${rvol.toFixed(1)}x on an up day`); }
    else if (rvol > 1.5 && chgPct < 0) { tech -= 8; reasons.push(`RVOL ${rvol.toFixed(1)}x on a down day`); }
    else if (rvol < 0.5)           { tech -= 3; reasons.push(`Light volume (RVOL ${rvol.toFixed(1)}x)`); }
  }

  // Daily momentum (bonus, not the main signal)
  if (chgPct > 3)       { tech += 8; reasons.push(`Up ${chgPct.toFixed(1)}% today`); }
  else if (chgPct > 1)  { tech += 4; reasons.push(`Up ${chgPct.toFixed(1)}% today`); }
  else if (chgPct < -3) { tech -= 8; reasons.push(`Down ${Math.abs(chgPct).toFixed(1)}% today`); }
  else if (chgPct < -1) { tech -= 4; reasons.push(`Down ${Math.abs(chgPct).toFixed(1)}% today`); }

  // ── FUNDAMENTAL SCORE (0-100) ─────────────────────────────────────────────
  let fund = 45;

  if (pe > 0 && pe < 15)       { fund += 18; reasons.push(`P/E ${pe.toFixed(1)} (value)`); } // value
  else if (pe > 0 && pe < 25)  { fund += 12; reasons.push(`P/E ${pe.toFixed(1)} (reasonable value)`); }
  else if (pe > 0 && pe < 40)  { fund += 4; reasons.push(`P/E ${pe.toFixed(1)}`); }
  else if (pe > 50)            { fund -= 8; reasons.push(`P/E ${pe.toFixed(1)} (expensive)`); }

  if (mcap > 500e9)     { fund += 12; reasons.push("Mega-cap"); } // mega cap quality
  else if (mcap > 100e9) { fund += 8; reasons.push("Large-cap"); }
  else if (mcap > 10e9)  { fund += 4; reasons.push("Mid-cap"); }
  else if (mcap > 0 && mcap < 500e6) { fund -= 5; reasons.push("Micro-cap"); }

  if (beta > 0 && beta < 1)   { fund += 5; reasons.push(`Beta ${beta.toFixed(2)} (lower volatility)`); } // lower volatility
  else if (beta > 2.5)        { fund -= 5; reasons.push(`Beta ${beta.toFixed(2)} (high volatility)`); }

  // EPS proxy from PE + price
  if (pe > 0 && price > 0) {
    const eps = price / pe;
    if (eps > 5)  { fund += 6; reasons.push(`EPS ~$${eps.toFixed(2)}`); }
    else if (eps > 1) { fund += 3; reasons.push(`EPS ~$${eps.toFixed(2)}`); }
  }

  // ── MACRO SCORE (0-100) ───────────────────────────────────────────────────
  let macro = 50;

  // Stock above 200D MA = macro aligned
  if (price > 0 && ma200 > 0) {
    if (price > ma200) { macro += 15; reasons.push("Above 200D MA (macro aligned)"); }
    else               { macro -= 10; reasons.push("Below 200D MA (macro misaligned)"); }
  } else if (trend) {
    if (inUptrend)        { macro += 15; reasons.push("Real confirmed uptrend (macro aligned)"); }
    else if (inDowntrend) { macro -= 10; reasons.push("Real confirmed downtrend (macro misaligned)"); }
  }

  // Trend strength from weekly + monthly signals
  if (chgPct > 0 && price > ma50)              { macro += 8; reasons.push("Up today, above 50D MA"); }
  else if (chgPct > 0 && abovePivotPct !== null && abovePivotPct > 0) { macro += 8; reasons.push("Up today, above pivot"); }
  if (hi52 > 0 && price > hi52 * 0.85)         { macro += 7; reasons.push("Within 15% of 52W high"); } // near highs = market likes it
  else if (distToHigh !== null && distToHigh <= 15) { macro += 7; reasons.push("Within 15% of 52W high"); }

  // Clamp all
  tech  = Math.max(0, Math.min(100, Math.round(tech)));
  fund  = Math.max(0, Math.min(100, Math.round(fund)));
  macro = Math.max(0, Math.min(100, Math.round(macro)));
  const composite = Math.round(tech * 0.45 + fund * 0.35 + macro * 0.2);

  return { tech, fund, macro, composite, reasons };
}

// trend: optional row from /api/market/trend-screen ({stage, pctFromHigh,
// abovePivotPct, pivot, ...}). q.priceAvg50/priceAvg200/yearHigh/yearLow
// come from /api/market/quote, a fast price-only path that never populates
// them for any Alpaca-covered symbol (same root cause fixed in
// computeScores/computeMTFSignal above and elsewhere this session). This
// function was already largely ema21/ema9-preferring (scanRow's real
// technicals) where a fallback existed, but several checks — "Uptrend"
// (5-check system), the A+ Institutional Trend sub-score, the bearish
// "Downtrend"/support-break checks, and the displayed offHigh stat — had
// NO fallback at all and were permanently dead/zero. When ma50/ma200/hi52
// are genuinely present they're used exactly as before (purely additive);
// otherwise, if a real trend row is supplied, it substitutes.
export function computeGreenLight(q, spyChg, scanRow, regime = null, trend = null) {
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

  // Volatility for ATR-based stops/targets. Prefer today's range; if missing,
  // estimate daily volatility from the 52-week range; else a 2.5% default. Floor 1% / cap 5%.
  const dayRange = Number(q?.dayHigh || 0) - Number(q?.dayLow || 0);
  const hi52 = Number(q?.yearHigh || 0), lo52 = Number(q?.yearLow || 0);
  let atrPct;
  if (px > 0 && dayRange > 0)                       atrPct = dayRange / px;
  else if (px > 0 && hi52 > lo52 && lo52 > 0)       atrPct = ((hi52 - lo52) / px) / 24; // ~annual range → daily proxy
  else                                              atrPct = 0.025;
  atrPct = Math.max(0.01, Math.min(0.05, atrPct));

  // ── Clean 5-check system: each measures one distinct thing (regime · trend · momentum · volume · entry) ──
  const rsiKnown = Number(scanRow?.rsiVal) > 0;
  const momentumPass = rsiKnown ? rsi >= 50 : chg > 0;   // reward strength (not the old 35–65 neutral trap)
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

  // ── Alt Setup — a second, independent real qualifying path (2026-08-03,
  // explicit user request: "does it have to be 4/5 to trade, more flexible
  // logic"). The 5-check system above stays exactly as-is (nothing about
  // GREEN/passed changes) — this is additive: a stock can ALSO qualify as
  // tradeable via a real technical setup even when it doesn't clear 4/5,
  // as long as the market is still safe (never bypassed, same non-
  // negotiable gate as check #1). Each candidate reuses data already
  // computed above or already real elsewhere in this app — zero new
  // fetches, zero fabricated signals. Only the single strongest real match
  // is reported (checked in this priority order).
  const marketSafeForAlt = spyChg > -0.5;
  const bosBullish = trend?.smc?.bos?.type === "BULL_BOS";
  const antiChaseBand = computeAntiChase(abovePivotPct).band;
  const rvolBreakout = rvol >= 2.5 && chg > 1 && antiChaseBand !== "EXTENDED" && antiChaseBand !== "DO_NOT_CHASE";
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
  // Real, honest combined gate — GREEN via the classic checklist, OR a real
  // Alt Setup. Never true just because the market happens to be calm.
  const tradeable = signal === "GREEN" || altSetup != null;
  // ── ATR-based stop (volatility-sized, not flat 3%) with +5% / +10% targets ──
  const stop   = px > 0 ? (px * (1 - atrPct * 1.5)).toFixed(2) : 0;
  const t1     = px > 0 ? (px * 1.05).toFixed(2) : 0;
  const t2     = px > 0 ? (px * 1.10).toFixed(2) : 0;
  // ── Reward / Risk to the +10% target (stop is ATR-sized, so R:R varies with volatility) ──
  const riskDist = px > 0 ? px - Number(stop) : 0;
  const rr = riskDist > 0 ? (Number(t2) - px) / riskDist : 0;
  const rrPass = rr >= 2.5;   // hard filter: skip mediocre risk/reward

  // ── BEST ENTRY price ──
  // Ideal entry = at the support (EMA21 or MA50, else the real trend-screen
  // pivot, else an arbitrary 1.5%-below-price guess), capped just below
  // current price. If price is already at/below support, current price IS
  // the entry.
  const trendPivot = Number(trend?.pivot || 0);
  const support = ema21 > 0 ? ema21 : (ma50 > 0 ? ma50 : (trendPivot > 0 ? trendPivot : px * 0.985));
  let bestEntry = px;
  let entryNote = "at market";
  if (px > support * 1.005) {
    // price is above support — best entry is a pullback toward support (but not below stop)
    bestEntry = Math.max(support, px * 0.985);
    entryNote = "wait for pullback";
  } else if (px <= support * 1.005) {
    bestEntry = px;
    entryNote = "at support ✅";
  }

  // ── Relative strength vs market (SPY) ──
  const relStrength = chg - spyChg;  // how much it's beating/lagging the market today
  const isLeader = relStrength > 1.0; // outperforming SPY by 1%+
  const atEntry = entryNote.includes("support");  // price is at the buy zone (not "wait for pullback")

  // ── A+ INSTITUTIONAL SCORE (0-100): Trend 30 · Momentum 20 · Volume 15 · Structure 20 · Risk 15 ──
  // Trend (30) — both ma200/ma50-vs-ma200 factors were permanently dead for
  // any Alpaca-covered symbol (always 0), capping this sub-score at 10/30
  // in practice. Real trend-screen substitutes below: inUptrend (Stage 2)
  // for the "above 200" factor, abovePivotPct for the "50 > 200" (medium-
  // vs-long-term structure) factor — kept distinct rather than both
  // collapsing to the same signal.
  let pTrend = 0;
  if (ma200 > 0 && px > ma200) pTrend += 10;                       // above 200 EMA/MA
  else if (ma200 <= 0 && trend && inUptrend) pTrend += 10;
  if (ma50 > 0 && ma200 > 0 && ma50 > ma200) pTrend += 10;         // 50 > 200
  else if ((ma50 <= 0 || ma200 <= 0) && abovePivotPct !== null && abovePivotPct > 0) pTrend += 10;
  if (ema9 > 0 && ema21 > 0 && ema9 > ema21) pTrend += 10;         // 9 > 21
  // Momentum (20)
  let pMom = 0;
  if (rsi >= 50 && rsi <= 65) pMom += 5;                           // RSI sweet spot
  if (macdBull === true) pMom += 5;                               // MACD bullish
  // trendingStrong required ma50>ma200, which is 0>0=false whenever both are
  // dead — mathematically guaranteed unreachable, not just under-triggered.
  const trendingStrong = ma50 > 0 && ma200 > 0
    ? (px > ma50 && ma50 > ma200 && ema9 > 0 && ema9 > ema21)
    : (trend ? (inUptrend && ema9 > 0 && ema9 > ema21) : false);
  if (trendingStrong) pMom += 5;                                  // ADX>25 proxy (clean aligned trend)
  if (relStrength >= 1) pMom += 5;                                // relative strength high
  // Volume (15)
  const pVol = (rvol >= 2 ? 10 : 0) + (rvol >= 1 ? 5 : 0);
  // Structure (20) — EMA21 pullback / tight consolidation proxy
  const pStruct = atEntry ? 20 : (entryNote === "wait for pullback" ? 12 : 6);
  // Risk (15)
  const pRisk = (rr >= 2.5 ? 10 : 0) + (atrPct >= 0.015 && atrPct <= 0.05 ? 5 : 0);
  const aScore = pTrend + pMom + pVol + pStruct + pRisk;
  const grade  = aScore >= 95 ? "ELITE" : aScore >= 90 ? "A+" : aScore >= 85 ? "GOOD" : aScore >= 80 ? "WATCH" : "IGNORE";
  // Confidence-based position size (% of account) per the A+ Institutional spec
  const confRisk = aScore >= 95 ? 1.0 : aScore >= 90 ? 0.75 : aScore >= 85 ? 0.5 : 0;
  // Market filter: regime ≥ 75 (SPY/QQQ/VIX/breadth folded into the regime score)
  const marketPass = regime == null ? spyChg > -0.3 : regime >= 75;
  // Tradeable (Balanced Flex): score ≥85 AND market passes AND at the buy zone.
  // 85–89 "GOOD" setups qualify but confRisk sizes them at HALF (0.5×) — more trades, less risk each.
  // Named qualifiesAPlus (not aPlus) — real bug/collision-risk fix,
  // 2026-08-04: this boolean flag and the separate real 9-dimension A+
  // Score object (computeAPlusScore, merged onto the row elsewhere as
  // `.aplus`) were one character-case apart on the same row object —
  // genuinely confusing to read cold, real risk of a future edit silently
  // swapping one for the other.
  const qualifiesAPlus = aScore >= 85 && marketPass && atEntry;

  // ── BEAR SCORE — put-candidate quality (5 × 20). For momentum breakdowns on red days. ──
  // VWAP isn't available client-side, so EMA21 is used as the intraday-mean proxy; 50-MA = support.
  const belowMean   = ema21 > 0 ? px < ema21 : (ma50 > 0 ? px < ma50 : chg < 0);   // "below VWAP"
  // supportBreak had no trend fallback at all (ma50<=0 → blind chg<-1 proxy
  // always) — real trend-screen Stage 3/4 confirmation now substitutes.
  const supportBreak = ma50 > 0 ? px < ma50 : (trend ? inDowntrend : chg < -1);   // broke the 50-day
  const bMarket = regime != null ? (regime < 60 ? 20 : regime < 80 ? 10 : 0) : (spyChg < -0.3 ? 20 : spyChg < 0.2 ? 10 : 0);
  const bVwap   = belowMean ? 20 : 0;
  const bWeak   = relStrength <= -2 ? 20 : relStrength < 0 ? 12 : 0;
  const bVol    = rvol >= 1.5 ? 20 : rvol >= 1.2 ? 10 : 0;
  const bBreak  = supportBreak ? 20 : 0;
  const bearScore = bMarket + bVwap + bWeak + bVol + bBreak;
  // Put levels: ATR stop ABOVE, target −10% BELOW; R:R = reward/risk.
  const putStop   = px > 0 ? +(px * (1 + atrPct * 1.5)).toFixed(2) : 0;
  const putTarget = px > 0 ? +(px * 0.90).toFixed(2) : 0;
  const putRR     = (putStop - px) > 0 ? +((px - putTarget) / (putStop - px)).toFixed(1) : 0;
  const bearTradeable = bearScore > 80 && putRR >= 2;
  // ── BOTTOM / REVERSAL score — capitulation + washout (oversold bounce candidates). ──
  // offHigh silently defaulted to 0 (not "no data") whenever hi52 was dead —
  // a real numeric stat returned/displayed to the user that read as "at the
  // 52-week high" for every single Alpaca-covered symbol. trend.pctFromHigh
  // is the exact same quantity (negative when below the high), no fallback
  // math needed. No real 52w-low analog exists, so nearLow's fallback stays
  // a sentinel — it only feeds an already-false-gated internal check, never
  // returned/displayed directly.
  const offHigh = hi52 > 0 ? (px / hi52 - 1) * 100
    : (trend && Number.isFinite(Number(trend.pctFromHigh)) ? Number(trend.pctFromHigh) : null);
  const nearLow = lo52 > 0 ? (px / lo52 - 1) * 100 : 999; // small = near the 52w low
  const bottomChecks = [
    { label: "Oversold (RSI<35)", pass: rsiKnown ? rsi < 35 : chg < -3 },
    { label: "Washed out (−25%+ off high)", pass: offHigh !== null && offHigh <= -25 },
    { label: "Near 52w low", pass: nearLow <= 15 },
    { label: "Capitulation volume (>2x)", pass: rvol >= 2 },
    { label: "Stabilizing (selling slowing)", pass: chg >= -1 },
  ];
  const bottomScore = bottomChecks.filter(c => c.pass).length * 20;
  const reversal = bottomScore >= 60;   // multiple capitulation signs = a reversal candidate
  // READY only when the bottom is CONFIRMING: washed out + bouncing green + reclaiming the EMA21 (short-term mean).
  const bottomReady = reversal && chg >= 0.5 && (ema21 > 0 ? px >= ema21 * 0.97 : true);

  const bearChecks = [
    { label: "Market red", pass: bMarket >= 20 },
    { label: "Below VWAP", pass: belowMean },
    { label: "Rel. weakness", pass: relStrength < 0 },
    { label: "Volume 1.5x", pass: rvol >= 1.5 },
    { label: "Support break", pass: supportBreak },
  ];

  // ── SHORT setup: mirror checks (weak market · downtrend · bearish momentum · volume · entry near resistance) ──
  const shortChecks = [
    { label: "Tape ok to short", pass: spyChg < 0.5,
      tip: `SPY ${spyChg >= 0 ? "+" : ""}${spyChg.toFixed(2)}% — short when the market isn't ripping up` },
    { label: "Downtrend", pass: ma50 > 0 ? (px < ma50 && (ma200 > 0 ? ma50 < ma200 : true)) : (trend ? inDowntrend : false),
      tip: (ma50 > 0 && ma200 > 0) ? `Price < MA50 $${ma50.toFixed(2)} < MA200 $${ma200.toFixed(2)}` : (ma50 > 0 ? `Price < MA50 $${ma50.toFixed(2)}` : trend ? (inDowntrend ? "Stage 3/4 downtrend confirmed (real trend structure)" : inUptrend ? "Stage 2 uptrend — not a downtrend" : "Trend stage unclear — no signal") : "No MA data") },
    { label: rsiKnown ? `Weak · RSI ${rsi.toFixed(0)}` : "Weak momentum", pass: rsiKnown ? rsi <= 50 : chg < 0,
      tip: rsiKnown ? `RSI ${rsi.toFixed(0)} (<50 = bearish)` : `Down ${chg.toFixed(1)}% today` },
    { label: rvol > 0 ? `Volume ${rvol.toFixed(1)}x` : "Volume active", pass: rvol >= 1.2 || vol === 0,
      tip: rvol > 0 ? `RVOL ${rvol.toFixed(1)}x` : "No volume data" },
    { label: "Near resistance", pass: ema21 > 0 ? (px >= ema21 * 0.96 && px <= ema21 * 1.04) : (ma50 > 0 && px >= ma50 * 0.94 && px <= ma50 * 1.04),
      tip: ema21 > 0 ? `Near EMA21 $${ema21.toFixed(2)} — short the bounce, not the hole` : `Near MA50 $${ma50.toFixed(2)}` },
  ];
  const shortPassed = shortChecks.filter(c => c.pass).length;
  const shortSignal = shortPassed >= 4 ? "SHORT" : shortPassed >= 3 ? "WATCH" : "NONE";

  // Invalidation — the real trend-breaking condition(s), distinct from the
  // ATR stop price above. Already computed server-side on every trend-
  // template response (_buildTrendTemplate's sellSignals, market.js) but
  // never threaded through to Green Light before — the charter asks every
  // Watchlist row to show this. null (not []) means no real trend data was
  // fetched for this symbol yet, distinct from an empty array meaning
  // "trend data is real, and it genuinely fired zero invalidation signals."
  const invalidation = trend ? (Array.isArray(trend.setup && trend.setup.sellSignals) ? trend.setup.sellSignals : []) : null;

  return {
    checks, passed, signal, altSetup, tradeable, px, chg, stop, t1, t2, rvol, rsi, atrPct, invalidation,
    shortChecks, shortPassed, shortSignal,
    bestEntry: +bestEntry.toFixed(2), entryNote, relStrength: +relStrength.toFixed(2), isLeader,
    rr: +rr.toFixed(1), rrPass, atEntry,
    aScore, grade, confRisk, qualifiesAPlus, marketPass,
    scoreParts: { trend: pTrend, momentum: pMom, volume: pVol, structure: pStruct, risk: pRisk },
    bearScore, bearChecks, putStop, putTarget, putRR, bearTradeable,
    bottomScore, bottomChecks, reversal, bottomReady, offHigh: offHigh !== null ? +offHigh.toFixed(1) : null,
  };
}

// ── Day Trade Mode (2026-08-05, explicit user request: "trade in and out
// daily fast") — a second, independent real signal system for Green Light,
// built off real intraday data (/api/market/daytrade-scan: Alpaca 15-min
// bars, VWAP, opening-range, RVOL, 9/21 EMA stack) instead of the swing
// system's daily/52-week fields above. Deliberately its own function rather
// than a mode flag threaded through computeGreenLight — the two systems
// measure genuinely different things (today's session structure vs. a
// multi-day trend) and this app's standing rule is to keep parallel scoring
// systems separate rather than force one shape to fit both.
// ── Hand-ported parity mirror of src/daytrade-console-engine.js's real
// weighted scorers (+ src/day-trade-calc.js's marketScoreFromSpy) — same
// "keep byte-identical" discipline already established for computeRegime
// (market-helpers.js / trade-planner-scoring.js). computeDayTradeSignal
// below is compared field-by-field against its server twin in
// test/smoke.js via assert.deepStrictEqual, so these formulas must match
// EXACTLY, not just in spirit. "AM Trading — Final Trading Logic
// Redesign", explicit user request 2026-08-19 — see daytrade-console-
// engine.js for the full design rationale on every formula below.
const dtClamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const dtClamp01 = (x) => dtClamp(x, 0, 1);

function dtComputeOrbScore({ price, orHigh, orLow, rvol, aboveVwap, bull15, marketBullish }) {
  if (!(price > 0) || !(orHigh > 0) || !(orLow > 0)) return { score: null, status: "NO_DATA", direction: null };
  const orRange = Math.max(orHigh - orLow, 0.01);
  let direction = null;
  let pricePts = 20;
  if (price > orHigh) {
    direction = "bullish";
    const distPct = ((price - orHigh) / orHigh) * 100;
    pricePts = 20 + dtClamp01(distPct / 1.5) * 20;
  } else if (price < orLow) {
    direction = "bearish";
    const distPct = ((orLow - price) / orLow) * 100;
    pricePts = 20 + dtClamp01(distPct / 1.5) * 20;
  } else {
    const distToHigh = (orHigh - price) / orRange;
    const distToLow = (price - orLow) / orRange;
    pricePts = 20 * (1 - Math.min(distToHigh, distToLow));
  }
  const volPts = rvol == null ? 10 : rvol >= 1.5 ? 20 : rvol >= 1.0 ? 12 : 4;
  let vwapPts = 7.5;
  if (direction && aboveVwap != null) vwapPts = (direction === "bullish") === aboveVwap ? 15 : 0;
  let momPts = 7.5;
  if (direction && bull15 != null) momPts = (direction === "bullish") === bull15 ? 15 : 0;
  let marketPts = 5;
  if (direction && marketBullish != null) marketPts = (direction === "bullish") === marketBullish ? 10 : 0;
  const score = Math.round(pricePts + volPts + vwapPts + momPts + marketPts);
  let status;
  if (direction === "bullish" && score >= 65) status = "BULLISH_BREAKOUT";
  else if (direction === "bearish" && score >= 65) status = "BEARISH_BREAKDOWN";
  else status = "MIXED_WAIT";
  return { score: dtClamp(score, 0, 100), status, direction };
}

function dtComputeVwapScore(price, vwap, vwapMomentumPct) {
  if (!(price > 0) || !(vwap > 0)) return null;
  const distPct = ((price - vwap) / vwap) * 100;
  let score = 50 + dtClamp(distPct * 12, -35, 35);
  if (vwapMomentumPct != null) score += dtClamp(vwapMomentumPct * 8, -15, 15);
  return Math.round(dtClamp(score, 0, 100));
}

function dtComputeMomentumScore({ rsi, roc, macdHistogram, priceMomentumPct, rvol, trendStackScore }) {
  const parts = [];
  if (rsi != null) parts.push(dtClamp(rsi, 0, 100));
  if (roc != null) parts.push(dtClamp(50 + roc * 5, 0, 100));
  if (macdHistogram != null) parts.push(dtClamp(50 + macdHistogram * 20, 0, 100));
  if (priceMomentumPct != null) parts.push(dtClamp(50 + priceMomentumPct * 10, 0, 100));
  if (rvol != null) parts.push(dtClamp(30 + rvol * 25, 0, 100));
  if (trendStackScore != null) parts.push(dtClamp(trendStackScore, 0, 100));
  if (!parts.length) return null;
  return Math.round(parts.reduce((s, v) => s + v, 0) / parts.length);
}

function dtComputeVolumeScore(rvol) {
  if (rvol == null || !Number.isFinite(rvol)) return null;
  return Math.round(dtClamp(rvol * 45, 0, 100));
}

function dtComputeTrendScore(price, vwap, ema9, ema20, ema50) {
  if (!(price > 0)) return null;
  const checks = [
    vwap != null && price > vwap,
    ema9 != null && price > ema9,
    ema9 != null && ema20 != null && ema9 > ema20,
    ema20 != null && ema50 != null && ema20 > ema50,
  ];
  const scorable = [vwap != null, ema9 != null, ema9 != null && ema20 != null, ema20 != null && ema50 != null];
  const applicable = scorable.filter(Boolean).length;
  if (!applicable) return null;
  const passed = checks.filter((c, i) => scorable[i] && c).length;
  return Math.round((passed / applicable) * 100);
}

function dtComputeRelativeStrength(chg, spyChg, qqqChg, sectorChg) {
  const vsSpy = chg != null && spyChg != null ? chg - spyChg : null;
  const vsQqq = chg != null && qqqChg != null ? chg - qqqChg : null;
  const vsSector = chg != null && sectorChg != null ? chg - sectorChg : null;
  const diffs = [vsSpy, vsQqq, vsSector].filter((v) => v != null);
  const score = diffs.length ? Math.round(dtClamp(50 + (diffs.reduce((s, v) => s + v, 0) / diffs.length) * 10, 0, 100)) : null;
  return { vsSpy, vsQqq, vsSector, score };
}

function dtComputeMinerviniScore(trendLabelVal) {
  if (trendLabelVal === "STRONG") return 80;
  if (trendLabelVal === "WEAK") return 25;
  return 50;
}
function dtComputeVcpScore(vcpVerdict) {
  if (vcpVerdict == null) return 50;
  if (vcpVerdict === "A+ SETUP") return 90;
  if (vcpVerdict === "WATCHLIST") return 65;
  if (vcpVerdict === "WEAK SETUP") return 35;
  return 20;
}

function dtComputePriceActionScore(pa) {
  const flags = [
    pa.higherHighs, pa.higherLows, pa.breakout,
    pa.breakdown == null ? null : !pa.breakdown,
    pa.retest,
    pa.failedBreakout == null ? null : !pa.failedBreakout,
    pa.failedBreakdown,
  ];
  const known = flags.filter((f) => f != null);
  if (!known.length) return null;
  const bullish = known.filter((f) => f === true).length;
  return Math.round((bullish / known.length) * 100);
}

const DT_SUBSCORE_LABELS = { orb: "ORB", vwap: "VWAP", momentum: "Momentum", volume: "Volume", relativeStrength: "Relative Strength", market: "Market Regime", priceAction: "Price Action" };
function dtClassify(score) { if (score == null) return "unknown"; return score >= 60 ? "bullish" : score <= 40 ? "bearish" : "neutral"; }

function dtComputeMixedSignals(subscores) {
  const classified = {};
  for (const key of Object.keys(DT_SUBSCORE_LABELS)) classified[key] = dtClassify(subscores[key]);
  const bullish = Object.keys(classified).filter((k) => classified[k] === "bullish");
  const bearish = Object.keys(classified).filter((k) => classified[k] === "bearish");
  let verdict;
  if (bearish.length === 0 && bullish.length >= 5) verdict = "BULLISH";
  else if (bullish.length === 0 && bearish.length >= 5) verdict = "BEARISH";
  else if (bullish.length - bearish.length >= 4) verdict = "BULLISH";
  else if (bearish.length - bullish.length >= 4) verdict = "BEARISH";
  else verdict = "MIXED";
  return { verdict };
}

const DT_MASTER_WEIGHTS = { orb: 20, vwap: 15, momentum: 15, volume: 15, relativeStrength: 10, market: 10, priceAction: 5, minervini: 5, vcp: 5 };
function dtComputeMasterScore(subscores) {
  let weighted = 0, weightAvailable = 0;
  for (const [key, w] of Object.entries(DT_MASTER_WEIGHTS)) {
    const v = subscores[key];
    if (v != null) { weighted += v * w; weightAvailable += w; }
  }
  if (!weightAvailable) return { score: null };
  return { score: Math.round(weighted / weightAvailable) };
}

// Real, configurable default — hand-mirrors src/day-trade-config.js's
// DAY_TRADE_DEFAULTS.minBuyScore (a plain constant, not require()-able
// across the server/client boundary, so duplicated here same as every
// other formula on this page — see the file's own top-of-section comment
// on the "keep byte-identical" discipline).
const DT_MIN_BUY_SCORE_DEFAULT = 60;

// Entry Trigger classifier (2026-08-19, "Fix Trading Signal Logic — A+
// Score vs Entry Trigger", explicit user request) — hand-ported twin of
// src/day-trade-calc.js's classifyEntryTrigger, byte-identical logic.
function dtClassifyEntryTrigger({ orBreakout, aboveVwap, rvol, priceAction, direction }) {
  const pa = priceAction || {};
  if (direction === "BEARISH") {
    if (pa.failedBreakdown) return "INVALIDATED";
    if (pa.breakdown && !aboveVwap && rvol >= 1) return "CONFIRMED";
    if (pa.retest || (!aboveVwap && rvol >= 0.8)) return "APPROACHING";
    return "NOT_READY";
  }
  if (pa.failedBreakout) return "INVALIDATED";
  if (orBreakout && aboveVwap && rvol >= 1.5) return "CONFIRMED";
  if (pa.retest || pa.breakout || (aboveVwap && rvol >= 0.8)) return "APPROACHING";
  return "NOT_READY";
}

// Market dimension proxy from SPY alone — see day-trade-calc.js's
// marketScoreFromSpy for why the full 5-factor computeRegime isn't used
// at this reduced-context call site (missing QQQ/VIX would otherwise
// silently read as bearish).
function dtMarketScoreFromSpy(spyChg) {
  if (spyChg == null || !Number.isFinite(spyChg)) return null;
  return Math.max(0, Math.min(100, 50 + spyChg * 30));
}

// `extra` (optional, defaults identically on both server/client so the
// strict 2-arg parity test in test/smoke.js is unaffected): see
// src/day-trade-calc.js's matching comment — only the server tick
// supplies this.
export function computeDayTradeSignal(row, spyChg, extra = {}) {
  const px = Number(row?.price || 0);
  if (!(px > 0)) return null;
  const vwap = Number(row?.vwap || 0) || px;
  const rvol = Number(row?.rvol || 0);
  const aboveVwap = !!row?.aboveVwap;
  const orBreakout = !!row?.orBreakout;
  const bull15 = !!row?.bull15;
  const closeStrong = !!row?.closeStrong;

  // ── 5-check system — real, honest, informational checklist (still shown
  // in GreenLightTab's Day Trade Mode UI). No longer gates `signal` — see
  // the weighted engine below. ──
  const checks = [
    { label: "Market safe", pass: spyChg > -0.5,
      tip: `SPY ${spyChg >= 0 ? "+" : ""}${spyChg.toFixed(2)}% — buy only when the tape is safe` },
    { label: "Above VWAP", pass: aboveVwap,
      tip: `VWAP $${vwap.toFixed(2)} — ${aboveVwap ? "price is above the session's volume-weighted average" : "price is below VWAP, the intraday bulls/bears line"}` },
    { label: "OR Breakout", pass: orBreakout,
      tip: row?.orHigh ? `Opening range high $${Number(row.orHigh).toFixed(2)} — ${orBreakout ? "broke out" : "still inside the first 30 min range"}` : "Opening range not available yet" },
    { label: rvol > 0 ? `RVOL ${rvol.toFixed(1)}x` : "Volume active", pass: rvol >= 1.5,
      tip: rvol > 0 ? `RVOL ${rvol.toFixed(1)}x (≥1.5x = real interest today)` : "No volume data" },
    { label: "9>21 EMA (15m)", pass: bull15,
      tip: "Price above 9EMA above 21EMA on the 15-minute chart — momentum stack intact" },
  ];
  const passed = checks.filter(c => c.pass).length;

  // ── Real weighted scoring — same formulas as daytrade-console-engine.js
  // (server), hand-ported above. Minervini/VCP/QQQ/sector use `extra` when
  // supplied, else fall back to the existing honest neutral defaults. ──
  const marketScore = dtMarketScoreFromSpy(spyChg);
  const trendStackScore = dtComputeTrendScore(px, vwap, row?.ema9 ?? null, row?.ema21 ?? null, row?.ema50 ?? null);
  const orb = dtComputeOrbScore({ price: px, orHigh: row?.orHigh ?? null, orLow: row?.orLow ?? null, rvol, aboveVwap, bull15, marketBullish: spyChg != null ? spyChg > -0.1 : null });
  const vwapScore = dtComputeVwapScore(px, vwap, null);
  const momentumScore = dtComputeMomentumScore({ rsi: row?.rsi15m ?? null, roc: row?.roc15m ?? null, macdHistogram: row?.macdHistogram15m ?? null, priceMomentumPct: null, rvol, trendStackScore });
  const volumeScore = dtComputeVolumeScore(rvol);
  const rs = dtComputeRelativeStrength(Number(row?.chgPct || 0), spyChg, extra?.qqqChg ?? null, extra?.sectorChg ?? null);
  const priceActionScore = dtComputePriceActionScore(row?.priceAction || {});
  const minerviniScore = dtComputeMinerviniScore(extra?.trendLabel ?? null);
  const vcpScore = dtComputeVcpScore(extra?.vcpVerdict ?? null);

  const subscores = { orb: orb.score, vwap: vwapScore, momentum: momentumScore, volume: volumeScore, relativeStrength: rs.score, market: marketScore, priceAction: priceActionScore, minervini: minerviniScore, vcp: vcpScore };
  const mixed = dtComputeMixedSignals(subscores);
  const master = dtComputeMasterScore(subscores);
  // Real setup direction — see src/day-trade-calc.js's matching comment.
  const direction = mixed.verdict;

  // Direction-corrected Setup Quality — hand-ported twin of
  // src/day-trade-calc.js's identical fix, see its comment for the real
  // bug this closes (a bearish setup showing an un-inverted "ELITE 99").
  const rawQuality = master.score != null ? master.score : Math.max(0, Math.min(100, Math.round(Number(row?.score) || 0)));
  const quality = direction === "BEARISH" ? Math.max(0, Math.min(100, 100 - rawQuality)) : rawQuality;
  const grade = quality >= 90 ? "ELITE" : quality >= 75 ? "A+" : quality >= 60 ? "GOOD" : quality >= 45 ? "WATCH" : "IGNORE";

  // ── Fast, tight, same-session levels — NOT the swing system's ATR/+5%/
  // +10% multi-day math. Stop = just below VWAP (the standard intraday
  // long-bias invalidation level); target = 1.5R off that stop, a modest
  // move genuinely achievable inside one session rather than a multi-day
  // swing target. Direction-aware fix — hand-ported twin, see
  // src/day-trade-calc.js's matching comment for why. ──
  const isBearish = direction === "BEARISH";
  const stop = isBearish
    ? +(Math.max(vwap, px) * 1.001).toFixed(2)
    : +(Math.min(vwap, px) * 0.999).toFixed(2);
  const riskDist = isBearish ? Math.max(0.01, stop - px) : Math.max(0.01, px - stop);
  const target = isBearish
    ? +(px - riskDist * 1.5).toFixed(2)
    : +(px + riskDist * 1.5).toFixed(2);
  const rr = isBearish
    ? +((px - target) / riskDist).toFixed(1)
    : +((target - px) / riskDist).toFixed(1);
  const rrPass = rr >= 1.2;
  const marketPass = spyChg > -0.5;

  const orBreakdown = !!row?.priceAction?.breakdown;
  const bestEntry = isBearish
    ? (orBreakdown ? px : (Number(row?.orLow) || px))
    : (orBreakout ? px : (Number(row?.orHigh) || px));
  const entryNote = isBearish
    ? (orBreakdown ? "at breakdown ✅" : "wait for OR breakdown")
    : (orBreakout ? "at breakout ✅" : "wait for OR breakout");
  const atEntry = isBearish ? orBreakdown : orBreakout;

  // Entry Trigger — hand-ported twin, see src/day-trade-calc.js's comment.
  const entryTriggerStatus = dtClassifyEntryTrigger({ orBreakout, aboveVwap, rvol, priceAction: row?.priceAction, direction });

  // Final Signal — hand-ported twin, see src/day-trade-calc.js's comment
  // for the full rationale (verified by hand against all 6 of the spec's
  // contradiction-prevention examples).
  const minBuyScore = Number.isFinite(extra?.minBuyScore) ? extra.minBuyScore : DT_MIN_BUY_SCORE_DEFAULT;
  let signal, signalReason;
  if (direction === "MIXED") {
    signal = "YELLOW";
    signalReason = "No clear directional edge yet — signals are mixed.";
  } else if (quality < minBuyScore) {
    signal = "RED";
    signalReason = `Setup quality ${quality}/100 is below the minimum bar (${minBuyScore}) to trade.`;
  } else if (entryTriggerStatus === "INVALIDATED") {
    signal = "RED";
    signalReason = "Setup invalidated — the breakout/breakdown failed.";
  } else if (entryTriggerStatus === "CONFIRMED" && rrPass && marketPass) {
    signal = "GREEN";
    signalReason = direction === "BEARISH" ? "Breakdown confirmed and entry conditions are active." : "Opening-range breakout confirmed and entry conditions are active.";
  } else if (entryTriggerStatus === "CONFIRMED") {
    signal = "YELLOW";
    signalReason = !marketPass ? "Entry confirmed, but the broader market isn't supportive right now." : "Entry confirmed, but risk/reward isn't favorable enough yet.";
  } else {
    signal = "YELLOW";
    signalReason = `Strong setup — waiting for ${direction === "BEARISH" ? "breakdown" : "breakout"} confirmation.`;
  }

  const qualifiesAPlus = signal === "GREEN" && marketPass && entryTriggerStatus === "CONFIRMED";

  return {
    symbol: row.symbol, px, chg: Number(row?.chgPct || 0), checks, passed, signal,
    tradeable: signal === "GREEN", bestEntry: +bestEntry.toFixed(2), entryNote, atEntry,
    stop, target, rr, rrPass, quality, grade, qualifiesAPlus, marketPass,
    direction, entryTriggerStatus, signalReason, minBuyScore,
    vwap, rvol, orHigh: row?.orHigh ?? null, orLow: row?.orLow ?? null, orBreakout, bull15, closeStrong,
    // Real indicator readout — same 15-min EMA9/21/50 the Day Trade Scanner
    // already computes server-side, threaded through so Green Light's Day
    // Trade Mode can show the same real status-board indicators (not a
    // second/different calculation).
    ema9: row?.ema9 ?? null, ema21: row?.ema21 ?? null, ema50: row?.ema50 ?? null, aboveVwap,
    // Time-stop — the defining rule of day trading (no overnight hold).
    // The real EOD-flatten enforcement lives in AutoPilotEngine.jsx; this
    // is just the honest label shown next to the trade's other levels.
    timeStop: "Flatten by 3:55 PM ET",
  };
}

// Shared expectancy/profit-factor math — was independently reimplemented
// (with a slightly different formula each time) in MyTradesTab's Report
// Card, PerformanceCard (Mission Status), and JournalTab's Performance
// Analytics block (2026-07-29, "unify it"). All three are mathematically
// equivalent — win%×avgWin − loss%×avgLoss reduces to totalPnl/n — but
// PerformanceCard never showed Expectancy at all, and each surface gated
// (or didn't gate) the "real edge" claim differently. One real source now:
// same n≥20 minimum-sample honesty convention as MyTradesTab's original
// "N/20 trades — keep going" treatment, applied everywhere this shows up.
export const MIN_TRADES_FOR_EDGE = 20;
export function computeTradeStats(closedTrades) {
  const trades = (closedTrades || []).filter(t => t && Number.isFinite(Number(t.pnl)));
  const n = trades.length;
  const wins = trades.filter(t => Number(t.pnl) > 0);
  const losses = trades.filter(t => Number(t.pnl) <= 0);
  const winRate = n ? Math.round(wins.length / n * 100) : 0;
  const avgWin = wins.length ? wins.reduce((s, t) => s + Number(t.pnl), 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + Number(t.pnl), 0) / losses.length) : 0;
  const totalPnl = trades.reduce((s, t) => s + Number(t.pnl), 0);
  const expectancy = n ? totalPnl / n : 0;
  const profitFactor = avgLoss > 0 && losses.length ? (avgWin * wins.length) / (avgLoss * losses.length) : (wins.length ? Infinity : null);
  const edgeReady = n >= MIN_TRADES_FOR_EDGE && expectancy > 0;

  // Sharpe / Sortino / Max Drawdown — real, from the actual chronological
  // trade sequence (2026-07-29, Phase 3 of the Institutional Research
  // Upgrade — was independently reimplemented as a bare max-drawdown-only
  // calc in JournalTab.jsx; folded in here so all 3 performance cards share
  // one real source, same reasoning as the expectancy/profit-factor unify).
  // Per-trade % return = pnl ÷ position basis (entry × qty) — a trade-level
  // read, not a daily-bar one, since holding periods here are irregular
  // swing trades rather than fixed daily bars. Deliberately NOT scaled by
  // sqrt(n) — that only means "annualized" for a fixed sampling frequency
  // (e.g. sqrt(252) for daily bars), and trades don't happen on a fixed
  // schedule, so a raw mean/stdev ratio is the honest number here, not an
  // implied-precision annualization.
  const chrono = [...trades].sort((a, b) => new Date(a.closedAt || 0) - new Date(b.closedAt || 0));
  // Alpaca closed-trades rows carry `qty`; JournalTab's manually-logged
  // entries carry `size` for the same real concept — accept either so both
  // real trade sources this function is called on (not just Alpaca) get a
  // real Sharpe/Sortino instead of an unnecessary null.
  const pctReturns = chrono
    .map(t => { const basis = Math.abs(Number(t.entry) * Number(t.qty ?? t.size)); return basis > 0 ? Number(t.pnl) / basis : null; })
    .filter(v => v != null);
  let sharpe = null, sortino = null;
  if (pctReturns.length >= 2) {
    const meanRet = pctReturns.reduce((a, b) => a + b, 0) / pctReturns.length;
    const variance = pctReturns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / pctReturns.length;
    const stdev = Math.sqrt(variance);
    sharpe = stdev > 0 ? +(meanRet / stdev).toFixed(2) : null;
    const downside = pctReturns.filter(r => r < 0);
    const downsideDev = downside.length ? Math.sqrt(downside.reduce((s, r) => s + r * r, 0) / downside.length) : 0;
    sortino = downsideDev > 0 ? +(meanRet / downsideDev).toFixed(2) : (downside.length === 0 && meanRet > 0 ? Infinity : null);
  }
  // Max drawdown off the real dollar equity curve — every trade with a real
  // pnl counts here even if it's missing entry/qty (unlike Sharpe above,
  // a $ drawdown doesn't need the position-basis field).
  let cum = 0, peak = 0, maxDD = 0, maxDDPct = 0;
  for (const t of chrono) {
    cum += Number(t.pnl) || 0;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
    if (peak > 0 && (dd / peak) * 100 > maxDDPct) maxDDPct = (dd / peak) * 100;
  }
  const maxDrawdown = chrono.length ? +maxDD.toFixed(2) : null;
  const maxDrawdownPct = peak > 0 ? +maxDDPct.toFixed(1) : null;

  return {
    n, wins: wins.length, losses: losses.length, winRate, avgWin, avgLoss, totalPnl, expectancy, profitFactor, edgeReady,
    sharpe, sortino, maxDrawdown, maxDrawdownPct,
  };
}

export const GL_TRADES_KEY = "axiom_gl_trades_v1";

// Shared: append an automatic trade-journal note (open/close events) to the Notes tab
export function logTradeNote(type, text) {
  try {
    const notes = JSON.parse(localStorage.getItem("axiom_notes_v1") || "[]");
    notes.unshift({ id: Date.now() + Math.floor(Math.random() * 9999), type, text, ts: new Date().toISOString(), auto: true });
    localStorage.setItem("axiom_notes_v1", JSON.stringify(notes.slice(0, 200)));
    window.dispatchEvent(new Event("notes-changed"));
    // Ping Telegram on auto-pilot trades (toggle: axiom_autopilot_tg, default on).
    if (localStorage.getItem("axiom_autopilot_tg") !== "off" && (type === "buy" || type === "exit")) {
      const icon = type === "buy" ? "🤖 AUTO-TRADE" : "🤖 AUTO-EXIT";
      fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: icon + "\n\n" + text }) }).catch(() => {});
    }
  } catch {}
}

// Shared: create an auto-managed PAPER trade (stop/T1/T2/T3 + sizing) from anywhere.
// opts.atrPct (daily-range volatility, 0-0.05) enables ATR-based stops/targets when
// the user has Dynamic mode on (localStorage axiom_autopilot_atr !== "off").
// opts.stop/t1/t2/t3 (all four together) skip both the ATR and fixed-% derivations
// and use the caller's real, already-computed levels directly (e.g. AiTradeSessionPanel
// passing real trend-screen entry/stop + 1R/2R/3R targets) — additive, every existing
// caller that doesn't pass these keeps its exact prior ATR/fixed behavior unchanged.
export function addPaperTrade(sym, entry, opts = {}) {
  if (!sym || !entry || entry <= 0) return;
  entry = +(entry * (1 + SLIP)).toFixed(2);  // slippage: a long fills slightly ABOVE the quoted price
  const acct    = Number(localStorage.getItem("axiom_acct_size")) || 10000;
  const riskPct = Number(localStorage.getItem("axiom_risk_pct")) || 1;

  const hasExplicitLevels = [opts.stop, opts.t1, opts.t2, opts.t3].every(v => Number(v) > 0);
  const useAtr = !hasExplicitLevels && localStorage.getItem("axiom_autopilot_atr") !== "off" && Number(opts.atrPct) > 0;
  let stop, t1, t2, t3, basis;
  if (hasExplicitLevels) {
    stop = +Number(opts.stop).toFixed(2); t1 = +Number(opts.t1).toFixed(2);
    t2 = +Number(opts.t2).toFixed(2); t3 = +Number(opts.t3).toFixed(2);
    basis = "scan";
  } else if (useAtr) {
    // Volatility-sized: floor 1% / cap 5% daily range; stop 1.5×ATR, targets 1.5/3/4.5×ATR (1:1, 2:1, 3:1)
    const atrPct = Math.min(0.05, Math.max(0.01, Number(opts.atrPct)));
    const atr = entry * atrPct;
    stop = +(entry - atr * 1.5).toFixed(2);
    t1   = +(entry + atr * 1.5).toFixed(2);
    t2   = +(entry + atr * 3.0).toFixed(2);
    t3   = +(entry + atr * 4.5).toFixed(2);
    basis = `ATR ${(atrPct * 100).toFixed(1)}%`;
  } else {
    stop = +(entry * 0.97).toFixed(2);
    t1 = +(entry * 1.05).toFixed(2); t2 = +(entry * 1.10).toFixed(2); t3 = +(entry * 1.15).toFixed(2);
    basis = "fixed";
  }

  const riskPerShare = Math.max(0.01, entry - stop);
  const dollarRisk   = acct * (riskPct / 100);
  const riskBased    = Math.floor(dollarRisk / riskPerShare);
  const affordable   = Math.floor(acct / entry);
  const shares = Math.max(1, Math.min(riskBased, affordable));
  const t = {
    id: Date.now() + Math.floor(Math.random() * 999),
    ticker: sym, entry, shares, remaining: shares, realized: 0,
    stop, t1, t2, t3, basis, risk0: +riskPerShare.toFixed(2),
    glScore: Number(opts.glScore) || null,
    dayTrade: !!opts.dayTrade,
    status: "OPEN", t1Hit: false, t2Hit: false, openedAt: new Date().toISOString(),
    mode: "PAPER", auto: true,
  };
  let trades = [];
  try { trades = JSON.parse(localStorage.getItem(GL_TRADES_KEY)) || []; } catch {}
  // avoid duplicate open paper trade for same ticker
  if (trades.some(x => x.ticker === sym && x.status === "OPEN" && x.mode === "PAPER")) return "DUP";
  trades.unshift(t);
  localStorage.setItem(GL_TRADES_KEY, JSON.stringify(trades));
  window.dispatchEvent(new Event("gl-trades-changed"));
  logTradeNote("buy", `${t.dayTrade ? "⚡ DAY TRADE BUY" : "🟢 AUTO BUY"} — ${sym}${t.glScore ? ` (${t.glScore}${t.dayTrade ? "/100" : "/5"})` : ""}\n${shares} sh @ $${entry} (paper · ${basis})\nStop $${stop} · T1 $${t1} / T2 $${t2} / T3 $${t3}${t.dayTrade ? "\n⏱ Flatten by 3:55 PM ET (no overnight hold)" : ""}`);
  return "OK";
}

// Shared: create a SHORT paper trade (sell to open). Stop ABOVE entry, targets BELOW. P&L = (entry − price).
export function addPaperShort(sym, entry, opts = {}) {
  if (!sym || !entry || entry <= 0) return;
  entry = +(entry * (1 - SLIP)).toFixed(2);  // slippage: a short sells slightly BELOW the quoted price
  const acct    = Number(localStorage.getItem("axiom_acct_size")) || 10000;
  const riskPct = Number(localStorage.getItem("axiom_risk_pct")) || 1;
  const useAtr = localStorage.getItem("axiom_autopilot_atr") !== "off" && Number(opts.atrPct) > 0;
  let stop, t1, t2, t3, basis;
  if (useAtr) {
    const atrPct = Math.min(0.05, Math.max(0.01, Number(opts.atrPct)));
    const atr = entry * atrPct;
    stop = +(entry + atr * 1.5).toFixed(2);     // stop ABOVE for a short
    t1 = +(entry - atr * 1.5).toFixed(2); t2 = +(entry - atr * 3.0).toFixed(2); t3 = +(entry - atr * 4.5).toFixed(2);
    basis = `ATR ${(atrPct * 100).toFixed(1)}%`;
  } else {
    stop = +(entry * 1.03).toFixed(2);
    t1 = +(entry * 0.95).toFixed(2); t2 = +(entry * 0.90).toFixed(2); t3 = +(entry * 0.85).toFixed(2);
    basis = "fixed";
  }
  const riskPerShare = Math.max(0.01, stop - entry);
  const dollarRisk   = acct * (riskPct / 100);
  const riskBased    = Math.floor(dollarRisk / riskPerShare);
  const affordable   = Math.floor(acct / entry);
  const shares = Math.max(1, Math.min(riskBased, affordable));
  const t = {
    id: Date.now() + Math.floor(Math.random() * 999),
    ticker: sym, side: "SHORT", entry, shares, remaining: shares, realized: 0,
    stop, t1, t2, t3, basis, risk0: +riskPerShare.toFixed(2), glScore: Number(opts.glScore) || null,
    status: "OPEN", t1Hit: false, t2Hit: false, openedAt: new Date().toISOString(),
    mode: "PAPER", auto: true,
  };
  let trades = [];
  try { trades = JSON.parse(localStorage.getItem(GL_TRADES_KEY)) || []; } catch {}
  if (trades.some(x => x.ticker === sym && x.status === "OPEN" && x.mode === "PAPER" && x.side === "SHORT")) return "DUP";
  trades.unshift(t);
  localStorage.setItem(GL_TRADES_KEY, JSON.stringify(trades));
  window.dispatchEvent(new Event("gl-trades-changed"));
  logTradeNote("buy", `🔻 AUTO SHORT — ${sym}${t.glScore ? ` (${t.glScore}/5)` : ""}\n${shares} sh @ $${entry} (paper · ${basis})\nStop $${stop} (above) · T1 $${t1} / T2 $${t2} / T3 $${t3} (below)`);
  return "OK";
}

export const OPT_LEVERAGE = 5;  // a near-dated ATM option moves ~5× the underlying %, modeled simply
// Realism knobs — friction that makes the SIM honest instead of flattering.
export const SLIP = 0.001;      // 0.1% round-trip slippage on share/short fills (spread + market impact)
export const OPT_SLIP = 0.02;   // 2% spread paid on option premium at entry
// Current simulated per-share option premium from the underlying price — now with THETA decay.
export function optionValue(t, underlyingPx) {
  const u = Number(underlyingPx) || t.uEntry;
  const dir = t.optType === "PUT" ? -1 : 1;
  const move = (u - t.uEntry) / t.uEntry * dir;            // signed % move in the option's favor
  const raw = t.entry * (1 + (t.lev || OPT_LEVERAGE) * move); // leveraged value before time decay
  // Theta: a near-dated (~35 DTE) option bleeds its TIME value as days pass. Intrinsic value never decays.
  const DTE0 = t.dte0 || 35;
  const held = t.openedAt ? (Date.now() - new Date(t.openedAt).getTime()) / 86400000 : 0;
  const timeLeft = Math.max(0, (DTE0 - held) / DTE0);
  const decay = Math.sqrt(timeLeft);                       // sqrt-of-time: slow at first, fast near expiry
  const intrinsic = t.strike ? Math.max(0, dir === 1 ? (u - t.strike) : (t.strike - u)) : 0;
  const extrinsic = Math.max(0, raw - intrinsic);
  return Math.max(0.01, +(intrinsic + extrinsic * decay).toFixed(2));
}

// Shared: create a SIMULATED paper option (CALL/PUT). Stored as a synthetic position whose
// "price" is the option premium, so the same stop/target/exit/stats engine works unchanged.
export function addPaperOption(sym, uPrice, kind, opts = {}) {
  if (!sym || !uPrice || uPrice <= 0) return;
  const acct    = Number(localStorage.getItem("axiom_acct_size")) || 10000;
  const riskPct = Number(localStorage.getItem("axiom_risk_pct")) || 1;
  const premium = +(uPrice * 0.04 * (1 + OPT_SLIP)).toFixed(2);  // ATM near-dated premium ≈ 4% of underlying + spread paid at entry
  if (premium <= 0.02) return;
  // Option-value levels: stop −50%, T1 +50%, T2 +100%, T3 +150%
  const stop = +(premium * 0.5).toFixed(2);
  const t1 = +(premium * 1.5).toFixed(2), t2 = +(premium * 2.0).toFixed(2), t3 = +(premium * 2.5).toFixed(2);
  const riskPerShare = premium - stop;                     // = premium*0.5 per share
  const dollarRisk   = acct * (riskPct / 100);
  const perContract  = premium * 100;
  const riskContracts = Math.floor(dollarRisk / (riskPerShare * 100));
  const affordable    = Math.floor(acct / perContract);
  const contracts = Math.max(1, Math.min(riskContracts, affordable));
  const shares = contracts * 100;                          // synthetic shares = contracts × 100
  const atm = uPrice >= 200 ? Math.round(uPrice / 5) * 5 : uPrice >= 50 ? Math.round(uPrice) : Math.round(uPrice * 2) / 2;
  const t = {
    id: Date.now() + Math.floor(Math.random() * 999),
    ticker: sym, instrument: "OPTION", optType: kind, uEntry: uPrice, strike: atm, lev: OPT_LEVERAGE, contracts, dte0: 35,
    entry: premium, shares, remaining: shares, realized: 0,
    stop, t1, t2, t3, basis: `${kind} sim`, risk0: +riskPerShare.toFixed(2),
    glScore: Number(opts.glScore) || null,
    status: "OPEN", t1Hit: false, t2Hit: false, openedAt: new Date().toISOString(),
    mode: "PAPER", auto: true,
  };
  let trades = [];
  try { trades = JSON.parse(localStorage.getItem(GL_TRADES_KEY)) || []; } catch {}
  if (trades.some(x => x.ticker === sym && x.optType === kind && x.status === "OPEN" && x.mode === "PAPER")) return "DUP";
  trades.unshift(t);
  localStorage.setItem(GL_TRADES_KEY, JSON.stringify(trades));
  window.dispatchEvent(new Event("gl-trades-changed"));
  const icon = kind === "CALL" ? "📈" : "📉";
  logTradeNote("buy", `${icon} AUTO ${kind} — ${sym} ~$${atm}${t.glScore ? ` (${t.glScore}/5)` : ""}\n${contracts} contract${contracts !== 1 ? "s" : ""} @ $${premium} (sim · ${OPT_LEVERAGE}x)\nStop $${stop} · T1 $${t1} / T2 $${t2} / T3 $${t3}`);
  return "OK";
}

// ── Alpaca PAPER order helpers (orders routed server-side; keys never in browser) ──
// setupTag/entry are optional — when passed, the server journals this buy under
// that real setup tag (same store server-autopilot.js writes to) so the
// Learning Engine's per-tier win rate covers browser-side buys too. Omitted by
// callers that shouldn't be tagged (manual trades, Quick Trade) — unchanged
// behavior for them.
export async function alpacaPlace(sym, qty, stop, take, setupTag = null, entry = null) {
  try {
    const body = { symbol: sym, qty, side: "buy", type: "market", stop_loss: stop, take_profit: take };
    if (setupTag) body.setupTag = setupTag;
    if (entry != null) body.entry = entry;
    const r = await fetch("/api/alpaca/order", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body) });
    return await r.json();
  } catch { return null; }
}
export async function alpacaShort(sym, qty, stop, take) {
  try {
    const r = await fetch("/api/alpaca/order", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: sym, qty, side: "sell", type: "market", stop_loss: stop, take_profit: take }) });
    return await r.json();
  } catch { return null; }
}
export async function alpacaClose(sym) {
  try {
    const r = await fetch("/api/alpaca/close", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: sym }) });
    return await r.json();
  } catch { return null; }
}
export async function alpacaOption(underlying, type, qty, underlyingPx) {
  try {
    const r = await fetch("/api/alpaca/option-order", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ underlying, type, qty, underlyingPx }) });
    return await r.json();
  } catch { return null; }
}

// Multi-timeframe signal — uses price action data already in each quote row.
// trend: optional row from /api/market/trend-screen (see _trendSignals above).
// Returns { signal: "BUY"|"HOLD"|"SELL", score, timeframes: [{label,bull}] }
export function computeMTFSignal(q, trend) {
  if (!q || !q.price) return { signal: "HOLD", score: 0, timeframes: [] };

  const price   = Number(q.price);
  const chg     = Number(q.changesPercentage || 0);
  const chg5m   = Number(q.delta5m  || 0);
  const chg30m  = Number(q.delta30m || 0);
  const sma50   = Number(q.priceAvg50  || 0);
  const sma200  = Number(q.priceAvg200 || 0);
  const yHigh   = Number(q.yearHigh || 0);
  const yLow    = Number(q.yearLow  || 0);
  const rvol    = computeRvol(q, trend);
  const { inUptrend, inDowntrend, distToHigh, abovePivotPct } = _trendSignals(trend);

  // Each timeframe: label shown in the badge row, and whether it's bullish.
  // "1W"/"1M" prefer real sma50/sma200 when present (non-Alpaca symbol,
  // Yahoo overlay ran); otherwise, if a real trend row is available, use it
  // instead of the old blind `chg > 0` fallback (which just repeated the
  // 1D signal and could never be neutral). abovePivotPct (a real short-term
  // support distance) stands in for the weekly proxy; stage (a real
  // Weinstein-stage read) stands in for the monthly proxy — an ambiguous
  // stage (e.g. "Stage 1/3 — Transition") is genuinely neutral, not guessed.
  const tfs = [
    {
      label: "5M",
      bull: chg5m > 0,
      neutral: Math.abs(chg5m) < 0.05,
    },
    {
      label: "30M",
      bull: chg30m > 0,
      neutral: Math.abs(chg30m) < 0.1,
    },
    {
      label: "1D",
      bull: chg > 0.15,
      neutral: Math.abs(chg) < 0.15,
    },
    {
      label: "1W",    // proxy: price vs 50D SMA, else real distance above trend-screen's pivot
      bull: sma50 > 0 ? price > sma50 : (abovePivotPct !== null ? abovePivotPct > 0 : chg > 0),
      neutral: sma50 > 0 ? Math.abs(price / sma50 - 1) < 0.005 : (abovePivotPct !== null ? Math.abs(abovePivotPct) < 0.5 : false),
    },
    {
      label: "1M",    // proxy: price vs 200D SMA, else real trend-screen stage
      bull: sma200 > 0 ? price > sma200 : (trend ? inUptrend : chg > 0),
      neutral: sma200 > 0 ? Math.abs(price / sma200 - 1) < 0.005 : (trend ? (!inUptrend && !inDowntrend) : false),
    },
  ];

  // Score: each non-neutral tf gives +1 (bull) or -1 (bear)
  let score = 0;
  for (const tf of tfs) {
    if (!tf.neutral) score += tf.bull ? 1 : -1;
  }

  // Volume confirms the direction (bonus ±1)
  if (rvol > 1.25) score += chg >= 0 ? 1 : -1;

  // 52W range position as tie-breaker
  if (yHigh > yLow) {
    const pos = (price - yLow) / (yHigh - yLow);
    if (pos > 0.75) score += 1;
    else if (pos < 0.25) score -= 1;
  } else if (distToHigh !== null) {
    // No real 52w-low analog from trend-screen — near-high tie-breaker only,
    // same "don't fabricate the missing half" precedent used throughout.
    if (distToHigh <= 5) score += 1;
  }

  let signal;
  if (score >= 3)       signal = "BUY";
  else if (score <= -3) signal = "SELL";
  else                  signal = "HOLD";

  return { signal, score, timeframes: tfs };
}


export const r2 = (n) => Math.round(n * 100) / 100; // round to 2 decimal places
