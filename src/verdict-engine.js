/**
 * FINAL VERDICT ENGINE
 * Single source of truth for all trade decisions.
 * Used by deep dive, scanner badge, Telegram alerts, and Auto Trade.
 *
 * Rules:
 * - Technical score alone NEVER means Buy
 * - Weak trend → NEVER A+ Long
 * - Bear BOS + price < EMA21 → AVOID/WAIT
 * - Conflicting signals → CONFLICT SETUP
 * - Full alignment required for A+ Long
 */

const VERDICTS = {
  APLUS_LONG:  { label: "A+ LONG",       color: "#00e676", icon: "🚀", priority: 1 },
  LONG:        { label: "LONG",           color: "#4caf50", icon: "✅", priority: 2 },
  WATCH_LONG:  { label: "WATCH LONG",     color: "#26a69a", icon: "👁",  priority: 3 },
  CONFLICT:    { label: "CONFLICT SETUP", color: "#ffaa00", icon: "⚠️", priority: 4 },
  NEUTRAL:     { label: "NEUTRAL",        color: "#607494", icon: "—",  priority: 5 },
  WATCH_SHORT: { label: "WATCH SHORT",    color: "#ff9800", icon: "👁",  priority: 6 },
  AVOID:       { label: "AVOID / WAIT",   color: "#ff4444", icon: "⛔", priority: 7 },
  SHORT:       { label: "SHORT",          color: "#ff2244", icon: "🔴", priority: 8 },
};

const SETUP_TYPES = {
  BREAKOUT:      "Breakout",
  PULLBACK:      "Pullback to Support",
  OVERSOLD:      "Oversold Bounce",
  CONTINUATION:  "Trend Continuation",
  REVERSAL:      "Trend Reversal",
  DISTRIBUTION:  "Distribution / Topping",
  BREAKDOWN:     "Breakdown",
  CONSOLIDATION: "Consolidation / Base",
};

/**
 * computeVerdict — the single function that produces the Final Verdict.
 *
 * @param {object} params
 * @param {number} params.techScore       0-100 momentum (RSI/EMA/volume)
 * @param {number} params.trendScore      0-100 trend quality (MA50/MA200/52w)
 * @param {number} params.smcScore        0-100 SMC (Bull BOS=80, Bear BOS=20, neutral=50)
 * @param {number} params.regimeScore     0-100 market regime (VIX/breadth/rotation)
 * @param {number} params.rsiVal          actual RSI value
 * @param {boolean|null} params.macdBull  MACD direction
 * @param {boolean} params.ema9aboveEma21 EMA alignment
 * @param {boolean} params.priceAboveEma21
 * @param {string|null} params.bosType    "BULL_BOS" | "BEAR_BOS" | null
 * @param {string|null} params.chochType  "CHOCH_BULL" | "CHOCH_BEAR" | null
 * @param {string} params.marketRegime    "RISK-ON" | "CAUTION" | "RISK-OFF"
 * @param {number} params.price
 * @param {number} params.ma50
 * @param {number} params.ma200
 */
function computeVerdict(params = {}) {
  const {
    techScore    = 50,
    trendScore   = 50,
    smcScore     = 50,
    regimeScore  = 50,
    rsiVal       = 50,
    macdBull     = null,
    ema9aboveEma21 = false,
    priceAboveEma21 = false,
    bosType      = null,
    chochType    = null,
    marketRegime = "CAUTION",
    price        = 0,
    ma50         = 0,
    ma200        = 0,
  } = params;

  // ── Alignment Score (0-100) ───────────────────────────────────────────────
  const alignScore = Math.round(
    techScore   * 0.30 +
    trendScore  * 0.35 +
    smcScore    * 0.20 +
    regimeScore * 0.15
  );

  // ── Hard blocks (override everything) ─────────────────────────────────────
  const bearBOS    = bosType === "BEAR_BOS";
  const bullBOS    = bosType === "BULL_BOS";
  const belowEMA21 = !priceAboveEma21;
  const trendWeak  = trendScore < 45;
  const riskOff    = marketRegime === "RISK-OFF";

  // Block 1: Bear BOS + below EMA21 → AVOID
  if (bearBOS && belowEMA21) {
    return {
      ...VERDICTS.AVOID,
      alignScore,
      reason: "Bear BOS confirmed + price below EMA21 — institutional sellers in control",
      setupType: SETUP_TYPES.DISTRIBUTION,
      warnings: ["Bear BOS: structure broke down", "Price below EMA21: trend broken", "Do not buy"],
    };
  }

  // Block 2: Bullish tech + bearish SMC/trend → CONFLICT
  const techBullish = techScore >= 65;
  const smcBearish  = smcScore  <= 35 || bearBOS;
  const trendBearish= trendScore <= 35;
  if (techBullish && (smcBearish || (trendBearish && !bullBOS))) {
    return {
      ...VERDICTS.CONFLICT,
      alignScore,
      reason: "Momentum is bullish but trend/structure is bearish — signals conflict",
      setupType: SETUP_TYPES.CONSOLIDATION,
      warnings: [
        smcBearish  ? "SMC structure bearish — smart money not buying" : null,
        trendBearish? "Trend weak — not a quality long setup" : null,
      ].filter(Boolean),
    };
  }

  // Block 3: Risk-off regime reduces conviction
  const regimePenalty = riskOff ? 10 : marketRegime === "CAUTION" ? 5 : 0;
  const adjustedScore = Math.max(0, alignScore - regimePenalty);

  // ── Determine Setup Type ──────────────────────────────────────────────────
  let setupType = SETUP_TYPES.CONSOLIDATION;
  if (bullBOS && techScore >= 75)              setupType = SETUP_TYPES.BREAKOUT;
  else if (techScore >= 65 && rsiVal < 45)     setupType = SETUP_TYPES.OVERSOLD;
  else if (techScore >= 65 && trendScore >= 65) setupType = SETUP_TYPES.CONTINUATION;
  else if (techScore >= 65 && belowEMA21)       setupType = SETUP_TYPES.PULLBACK;
  else if (bearBOS || techScore < 35)           setupType = SETUP_TYPES.BREAKDOWN;
  else if (chochType === "CHOCH_BEAR")          setupType = SETUP_TYPES.DISTRIBUTION;

  // ── Final Verdict ─────────────────────────────────────────────────────────
  const reasons = [];
  if (bullBOS)          reasons.push("Bull BOS confirmed — institutions buying");
  if (ema9aboveEma21)   reasons.push("EMA aligned bullish (9 > 21)");
  if (macdBull === true)reasons.push("MACD bullish");
  if (rsiVal > 0 && rsiVal < 35) reasons.push(`RSI ${rsiVal.toFixed(0)} oversold`);
  if (ma50 > 0 && price > ma50)  reasons.push("Above MA50 — uptrend intact");
  if (ma200 > 0 && price > ma200)reasons.push("Above MA200 — primary uptrend");

  const warnings = [];
  if (trendWeak)         warnings.push("Trend weak — lower position size");
  if (riskOff)           warnings.push("Market in risk-off mode — reduce size");
  if (rsiVal > 75)       warnings.push(`RSI ${rsiVal.toFixed(0)} overbought — wait for pullback`);
  if (chochType === "CHOCH_BEAR") warnings.push("Change of character detected — trend weakening");

  // A+ LONG: requires all green lights
  if (
    adjustedScore >= 82 &&
    bullBOS &&
    !trendWeak &&
    !riskOff &&
    techScore >= 72 &&
    trendScore >= 65
  ) {
    return { ...VERDICTS.APLUS_LONG, alignScore: adjustedScore, setupType, reasons, warnings };
  }

  // LONG
  if (adjustedScore >= 68 && techScore >= 62 && !trendWeak) {
    return { ...VERDICTS.LONG, alignScore: adjustedScore, setupType, reasons, warnings };
  }

  // WATCH LONG
  if (adjustedScore >= 56 && techScore >= 55) {
    return { ...VERDICTS.WATCH_LONG, alignScore: adjustedScore, setupType: SETUP_TYPES.CONSOLIDATION, reasons, warnings: [...warnings, "Not confirmed — wait for trigger"] };
  }

  // SHORT / bearish
  if (adjustedScore <= 32 && (bearBOS || (techScore < 40 && trendScore < 40))) {
    return { ...VERDICTS.SHORT, alignScore: adjustedScore, setupType: SETUP_TYPES.BREAKDOWN, reasons: [], warnings: ["Multiple bearish signals aligned"] };
  }
  if (adjustedScore <= 44 && techScore < 50) {
    return { ...VERDICTS.WATCH_SHORT, alignScore: adjustedScore, setupType: SETUP_TYPES.DISTRIBUTION, reasons: [], warnings };
  }

  // NEUTRAL
  return { ...VERDICTS.NEUTRAL, alignScore: adjustedScore, setupType: SETUP_TYPES.CONSOLIDATION, reasons, warnings };
}

module.exports = { computeVerdict, VERDICTS, SETUP_TYPES };
