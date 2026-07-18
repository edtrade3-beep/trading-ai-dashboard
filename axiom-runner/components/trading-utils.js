// Shared trading/scoring business logic used broadly across the monolith
// (composite scoring, the Green Light 5-check system, and the client-side
// paper-trading simulation: opening paper longs/shorts/options, valuing
// them, and the Alpaca sandbox option-order helper). Kept separate from
// market-helpers.js (market-wide reference data/regime) since this is
// specifically about scoring a symbol and simulating trades on it.

export function classifyTrend(q) {
  if (!q) return "—";
  const chg = q.changesPercentage || 0;
  if (chg > 2.5) return "Strong Up";
  if (chg > 0.5) return "Up";
  if (chg > -0.5) return "Flat";
  if (chg > -2) return "Weak";
  return "Down";
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
  if (!q) return { tech: 0, fund: 0, macro: 0, composite: 0 };

  const price  = Number(q.price  || q.regularMarketPrice || 0);
  const chgPct = Number(q.changesPercentage || q.regularMarketChangePercent || 0);
  const ma50   = Number(q.priceAvg50  || q.fiftyDayAverage   || 0);
  const ma200  = Number(q.priceAvg200 || q.twoHundredDayAverage || 0);
  const hi52   = Number(q.yearHigh    || q.fiftyTwoWeekHigh  || 0);
  const lo52   = Number(q.yearLow     || q.fiftyTwoWeekLow   || 0);
  const vol    = Number(q.volume      || q.regularMarketVolume || 0);
  const avgVol = Number(q.avgVolume   || q.averageDailyVolume10Day || 0);
  const pe     = Number(q.pe          || q.trailingPE         || 0);
  const mcap   = Number(q.marketCap   || 0);
  const beta   = Number(q.beta        || 0);
  const { inUptrend, inDowntrend, distToHigh, abovePivotPct } = _trendSignals(trend);

  // ── TECHNICAL SCORE (0-100) ────────────────────────────────────────────────
  let tech = 40; // neutral base

  // MA alignment — most important signal (doesn't depend on today's change)
  if (price > 0 && ma50 > 0 && ma200 > 0) {
    if (price > ma50 && ma50 > ma200)      tech += 20; // perfect uptrend
    else if (price > ma50 && price > ma200) tech += 12; // above both, mixed
    else if (price > ma200)                 tech += 6;  // above 200 only
    else if (price < ma50 && ma50 < ma200) tech -= 15; // perfect downtrend
    else                                    tech -= 6;  // mixed bearish
  } else if (trend) {
    // ma50/ma200 dead — fall back to real Weinstein-stage structure instead
    // of silently losing the whole factor. Ambiguous stages (e.g. "Stage
    // 1/3 — Transition") intentionally get neither bonus nor penalty.
    if (inUptrend)        tech += 18; // real confirmed uptrend (analog of "perfect uptrend")
    else if (inDowntrend) tech -= 15; // real confirmed downtrend
  }

  // Distance from MA50 — stretched or at support
  if (price > 0 && ma50 > 0) {
    const d50 = (price - ma50) / ma50 * 100;
    if (d50 > -2 && d50 < 5)   tech += 8;  // testing / just above MA50
    else if (d50 > 5 && d50 < 15) tech += 5; // healthy above
    else if (d50 > 20)          tech -= 5;  // stretched too high
    else if (d50 < -15)         tech -= 8;  // far below
  } else if (abovePivotPct !== null) {
    // Real distance above the trend-screen's own technical pivot, same idea
    if (abovePivotPct > -2 && abovePivotPct < 5)   tech += 8;
    else if (abovePivotPct > 5 && abovePivotPct < 15) tech += 5;
    else if (abovePivotPct > 20)          tech -= 5;
    else if (abovePivotPct < -15)         tech -= 8;
  }

  // 52W range position
  if (hi52 > lo52 && price > 0) {
    const pos = (price - lo52) / (hi52 - lo52);
    if (pos > 0.80)      tech += 10; // near highs — strength
    else if (pos > 0.55) tech += 5;
    else if (pos < 0.20) tech -= 8;  // near lows — weakness
    else if (pos < 0.35) tech -= 3;
  } else if (distToHigh !== null) {
    // No real 52w-low analog from trend-screen (pctFromHigh only), so the
    // "near lows — weakness" branch is dropped rather than fabricated —
    // same precedent as EarlyEntryScanner/TradeAdvisorTab this session.
    if (distToHigh <= 3)       tech += 10; // real near-high strength
    else if (distToHigh <= 15) tech += 5;
  }

  // Volume confirmation
  if (vol > 0 && avgVol > 0) {
    const rvol = vol / avgVol;
    if (rvol > 2 && chgPct > 0)   tech += 10;
    else if (rvol > 1.5 && chgPct > 0) tech += 6;
    else if (rvol > 1.5 && chgPct < 0) tech -= 8;
    else if (rvol < 0.5)           tech -= 3;
  }

  // Daily momentum (bonus, not the main signal)
  if (chgPct > 3)       tech += 8;
  else if (chgPct > 1)  tech += 4;
  else if (chgPct < -3) tech -= 8;
  else if (chgPct < -1) tech -= 4;

  // ── FUNDAMENTAL SCORE (0-100) ─────────────────────────────────────────────
  let fund = 45;

  if (pe > 0 && pe < 15)       fund += 18; // value
  else if (pe > 0 && pe < 25)  fund += 12;
  else if (pe > 0 && pe < 40)  fund += 4;
  else if (pe > 50)            fund -= 8;

  if (mcap > 500e9)     fund += 12; // mega cap quality
  else if (mcap > 100e9) fund += 8;
  else if (mcap > 10e9)  fund += 4;
  else if (mcap > 0 && mcap < 500e6) fund -= 5;

  if (beta > 0 && beta < 1)   fund += 5; // lower volatility
  else if (beta > 2.5)        fund -= 5;

  // EPS proxy from PE + price
  if (pe > 0 && price > 0) {
    const eps = price / pe;
    if (eps > 5)  fund += 6;
    else if (eps > 1) fund += 3;
  }

  // ── MACRO SCORE (0-100) ───────────────────────────────────────────────────
  let macro = 50;

  // Stock above 200D MA = macro aligned
  if (price > 0 && ma200 > 0) {
    if (price > ma200) macro += 15;
    else               macro -= 10;
  } else if (trend) {
    if (inUptrend)        macro += 15;
    else if (inDowntrend) macro -= 10;
  }

  // Trend strength from weekly + monthly signals
  if (chgPct > 0 && price > ma50)              macro += 8;
  else if (chgPct > 0 && abovePivotPct !== null && abovePivotPct > 0) macro += 8;
  if (hi52 > 0 && price > hi52 * 0.85)         macro += 7; // near highs = market likes it
  else if (distToHigh !== null && distToHigh <= 15) macro += 7;

  // Clamp all
  tech  = Math.max(0, Math.min(100, Math.round(tech)));
  fund  = Math.max(0, Math.min(100, Math.round(fund)));
  macro = Math.max(0, Math.min(100, Math.round(macro)));
  const composite = Math.round(tech * 0.45 + fund * 0.35 + macro * 0.2);

  return { tech, fund, macro, composite };
}

export function computeGreenLight(q, spyChg, scanRow, regime = null) {
  const px     = Number(q?.price || q?.regularMarketPrice || 0);
  const ma50   = Number(q?.priceAvg50 || q?.fiftyDayAverage || 0);
  const ma200  = Number(q?.priceAvg200 || q?.twoHundredDayAverage || 0);
  const ema21  = Number(scanRow?.ema21v || 0);
  const ema9   = Number(scanRow?.ema9v || 0);
  const macdBull = scanRow?.macdBull;
  const rsi    = Number(scanRow?.rsiVal || 0) || 50;
  const vol    = Number(q?.volume || 0);
  const avgVol = Number(q?.avgVolume || 0);
  const rvol   = avgVol > 0 ? vol / avgVol : 0;
  const chg    = Number(q?.changesPercentage || 0);

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
    { label: "Uptrend",      pass: ma50 > 0 && px > ma50 && (ma200 > 0 ? ma50 > ma200 : true),
      tip: (ma50 > 0 && ma200 > 0) ? `Price > MA50 $${ma50.toFixed(2)} > MA200 $${ma200.toFixed(2)} (aligned)` : (ma50 > 0 ? `Price > MA50 $${ma50.toFixed(2)}` : "No MA data") },
    { label: rsiKnown ? `Momentum · RSI ${rsi.toFixed(0)}` : "Momentum",  pass: momentumPass,
      tip: rsiKnown ? `RSI ${rsi.toFixed(0)} (>50 = bullish momentum)` : `Up ${chg >= 0 ? "+" : ""}${chg.toFixed(1)}% today` },
    { label: rvol > 0 ? `Volume ${rvol.toFixed(1)}x` : "Volume active",  pass: rvol >= 1.5 || vol === 0,
      tip: rvol > 0 ? `RVOL ${rvol.toFixed(1)}x (≥1.5x min · 2.0x preferred for clean breakouts)` : "No volume data" },
    { label: "Good entry",   pass: ema21 > 0 ? (px <= ema21 * 1.08 && px >= ema21 * 0.94) : (ma50 > 0 && px <= ma50 * 1.10 && px >= ma50 * 0.92),
      tip: ema21 > 0 ? `Within reach of EMA21 $${ema21.toFixed(2)} — not over-extended` : `Near MA50 $${ma50.toFixed(2)}` },
  ];

  const passed = checks.filter(c => c.pass).length;
  const signal = passed >= 4 ? "GREEN" : passed >= 3 ? "YELLOW" : "RED";
  // ── ATR-based stop (volatility-sized, not flat 3%) with +5% / +10% targets ──
  const stop   = px > 0 ? (px * (1 - atrPct * 1.5)).toFixed(2) : 0;
  const t1     = px > 0 ? (px * 1.05).toFixed(2) : 0;
  const t2     = px > 0 ? (px * 1.10).toFixed(2) : 0;
  // ── Reward / Risk to the +10% target (stop is ATR-sized, so R:R varies with volatility) ──
  const riskDist = px > 0 ? px - Number(stop) : 0;
  const rr = riskDist > 0 ? (Number(t2) - px) / riskDist : 0;
  const rrPass = rr >= 2.5;   // hard filter: skip mediocre risk/reward

  // ── BEST ENTRY price ──
  // Ideal entry = at the support (EMA21 or MA50), capped just below current price.
  // If price is already at/below support, current price IS the entry.
  const support = ema21 > 0 ? ema21 : (ma50 > 0 ? ma50 : px * 0.985);
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
  // Trend (30)
  let pTrend = 0;
  if (ma200 > 0 && px > ma200) pTrend += 10;                       // above 200 EMA/MA
  if (ma50 > 0 && ma200 > 0 && ma50 > ma200) pTrend += 10;         // 50 > 200
  if (ema9 > 0 && ema21 > 0 && ema9 > ema21) pTrend += 10;         // 9 > 21
  // Momentum (20)
  let pMom = 0;
  if (rsi >= 50 && rsi <= 65) pMom += 5;                           // RSI sweet spot
  if (macdBull === true) pMom += 5;                               // MACD bullish
  const trendingStrong = px > ma50 && ma50 > ma200 && ema9 > 0 && ema9 > ema21;
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
  const aPlus = aScore >= 85 && marketPass && atEntry;

  // ── BEAR SCORE — put-candidate quality (5 × 20). For momentum breakdowns on red days. ──
  // VWAP isn't available client-side, so EMA21 is used as the intraday-mean proxy; 50-MA = support.
  const belowMean   = ema21 > 0 ? px < ema21 : (ma50 > 0 ? px < ma50 : chg < 0);   // "below VWAP"
  const supportBreak = ma50 > 0 ? px < ma50 : chg < -1;                            // broke the 50-day
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
  const offHigh = hi52 > 0 ? (px / hi52 - 1) * 100 : 0;   // negative = below the 52w high
  const nearLow = lo52 > 0 ? (px / lo52 - 1) * 100 : 999; // small = near the 52w low
  const bottomChecks = [
    { label: "Oversold (RSI<35)", pass: rsiKnown ? rsi < 35 : chg < -3 },
    { label: "Washed out (−25%+ off high)", pass: offHigh <= -25 },
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
    { label: "Downtrend", pass: ma50 > 0 && px < ma50 && (ma200 > 0 ? ma50 < ma200 : true),
      tip: (ma50 > 0 && ma200 > 0) ? `Price < MA50 $${ma50.toFixed(2)} < MA200 $${ma200.toFixed(2)}` : (ma50 > 0 ? `Price < MA50 $${ma50.toFixed(2)}` : "No MA data") },
    { label: rsiKnown ? `Weak · RSI ${rsi.toFixed(0)}` : "Weak momentum", pass: rsiKnown ? rsi <= 50 : chg < 0,
      tip: rsiKnown ? `RSI ${rsi.toFixed(0)} (<50 = bearish)` : `Down ${chg.toFixed(1)}% today` },
    { label: rvol > 0 ? `Volume ${rvol.toFixed(1)}x` : "Volume active", pass: rvol >= 1.2 || vol === 0,
      tip: rvol > 0 ? `RVOL ${rvol.toFixed(1)}x` : "No volume data" },
    { label: "Near resistance", pass: ema21 > 0 ? (px >= ema21 * 0.96 && px <= ema21 * 1.04) : (ma50 > 0 && px >= ma50 * 0.94 && px <= ma50 * 1.04),
      tip: ema21 > 0 ? `Near EMA21 $${ema21.toFixed(2)} — short the bounce, not the hole` : `Near MA50 $${ma50.toFixed(2)}` },
  ];
  const shortPassed = shortChecks.filter(c => c.pass).length;
  const shortSignal = shortPassed >= 4 ? "SHORT" : shortPassed >= 3 ? "WATCH" : "NONE";

  return {
    checks, passed, signal, px, chg, stop, t1, t2, rvol, rsi, atrPct,
    shortChecks, shortPassed, shortSignal,
    bestEntry: +bestEntry.toFixed(2), entryNote, relStrength: +relStrength.toFixed(2), isLeader,
    rr: +rr.toFixed(1), rrPass, atEntry,
    aScore, grade, confRisk, aPlus, marketPass,
    scoreParts: { trend: pTrend, momentum: pMom, volume: pVol, structure: pStruct, risk: pRisk },
    bearScore, bearChecks, putStop, putTarget, putRR, bearTradeable,
    bottomScore, bottomChecks, reversal, bottomReady, offHigh: +offHigh.toFixed(1),
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
export function addPaperTrade(sym, entry, opts = {}) {
  if (!sym || !entry || entry <= 0) return;
  entry = +(entry * (1 + SLIP)).toFixed(2);  // slippage: a long fills slightly ABOVE the quoted price
  const acct    = Number(localStorage.getItem("axiom_acct_size")) || 10000;
  const riskPct = Number(localStorage.getItem("axiom_risk_pct")) || 1;

  const useAtr = localStorage.getItem("axiom_autopilot_atr") !== "off" && Number(opts.atrPct) > 0;
  let stop, t1, t2, t3, basis;
  if (useAtr) {
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
  logTradeNote("buy", `🟢 AUTO BUY — ${sym}${t.glScore ? ` (${t.glScore}/5)` : ""}\n${shares} sh @ $${entry} (paper · ${basis})\nStop $${stop} · T1 $${t1} / T2 $${t2} / T3 $${t3}`);
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
export async function alpacaPlace(sym, qty, stop, take) {
  try {
    const r = await fetch("/api/alpaca/order", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: sym, qty, side: "buy", type: "market", stop_loss: stop, take_profit: take }) });
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
  const rvol    = q.avgVolume ? q.volume / q.avgVolume : 1;
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
