// src/options-math.js — pure math over already-real options-chain data.
// No fetches, no fabrication: every function here takes real fields already
// returned by GET /api/market/options (strike, bid, ask, iv, delta,
// openInterest, volume — see mapP() in routes/market.js) and derives a real
// number from them. Built for the options platform redesign, Phase 0 —
// feeds the Option Contract Recommender and Smart Option Chain sort keys in
// a later phase, but is a standalone, testable module with zero
// framework/route dependencies. Every function returns null (never a
// placeholder number) when its real required inputs are missing.

// Standard normal CDF (Zelen & Severo approximation), used for
// Black-Scholes N(d2).
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) p = 1 - p;
  return p;
}

// Probability of profit (expiring ITM), 0-100. Prefers a full Black-Scholes
// N(d2) when iv/strike/underlying/dte are all real and present (most
// accurate); falls back to the standard |delta| approximation (a contract's
// delta already IS an approximate probability of expiring ITM) when only
// delta is available — e.g. a Yahoo-sourced chain with no IV. Returns null,
// not a placeholder, when neither real input is present.
function probabilityOfProfit({ delta, iv, strike, underlying, dte, isCall } = {}) {
  if (
    Number.isFinite(iv) && iv > 0 &&
    Number.isFinite(strike) && strike > 0 &&
    Number.isFinite(underlying) && underlying > 0 &&
    Number.isFinite(dte) && dte > 0
  ) {
    const sigma = iv / 100;
    const t = dte / 365;
    const d1 = (Math.log(underlying / strike) + 0.5 * sigma * sigma * t) / (sigma * Math.sqrt(t));
    const d2 = d1 - sigma * Math.sqrt(t);
    const pop = isCall ? normCdf(d2) * 100 : (1 - normCdf(d2)) * 100;
    return Math.round(Math.max(0, Math.min(100, pop)));
  }
  if (Number.isFinite(delta)) {
    return Math.round(Math.max(0, Math.min(100, Math.abs(delta) * 100)));
  }
  return null;
}

// Estimated delta — real Black-Scholes N(d1), used ONLY as a fallback when
// a provider doesn't supply a real delta field (2026-08-30 fix: Yahoo's
// free chain, used by GET /api/market/options whenever POLYGON_API_KEY
// isn't configured — see providers/yahoo.js — always returns delta:null,
// which silently meant autopilot2-expression.js's chooseExpression could
// NEVER select CALL in that deployment: every real bullish opportunity
// fell back to STOCK regardless of how good the real option looked, with
// no visible error). Same r=0 simplification probabilityOfProfit's own
// d1/d2 calc above already uses, for internal consistency. Returns null
// (never a placeholder) when the real inputs it needs aren't present.
function estimateDelta({ iv, strike, underlying, dte, isCall } = {}) {
  if (
    !Number.isFinite(iv) || iv <= 0 ||
    !Number.isFinite(strike) || strike <= 0 ||
    !Number.isFinite(underlying) || underlying <= 0 ||
    !Number.isFinite(dte) || dte <= 0
  ) return null;
  const sigma = iv / 100;
  const t = dte / 365;
  const d1 = (Math.log(underlying / strike) + 0.5 * sigma * sigma * t) / (sigma * Math.sqrt(t));
  const delta = isCall ? normCdf(d1) : normCdf(d1) - 1;
  return Math.round(delta * 1000) / 1000;
}

// Expected 1-standard-deviation move over the contract's remaining life:
// IV × sqrt(DTE/365) × underlying. Real inputs only.
function expectedMove({ iv, underlying, dte } = {}) {
  if (
    !Number.isFinite(iv) || iv <= 0 ||
    !Number.isFinite(underlying) || underlying <= 0 ||
    !Number.isFinite(dte) || dte <= 0
  ) return null;
  const sigma = iv / 100;
  const move = underlying * sigma * Math.sqrt(dte / 365);
  return Math.round(move * 100) / 100;
}

// Bid-ask spread as % of mid price. Null (not 0) when bid/ask are
// missing/zero/crossed — a real 0% spread would be a data anomaly, not an
// honest "no spread" state, so this never fabricates a favorable number.
function spreadPct({ bid, ask } = {}) {
  const b = Number(bid), a = Number(ask);
  if (!Number.isFinite(b) || !Number.isFinite(a) || b <= 0 || a <= 0 || a < b) return null;
  const mid = (a + b) / 2;
  if (mid <= 0) return null;
  return Math.round(((a - b) / mid) * 10000) / 100; // %, 2dp
}

// Liquidity score 0-100 — a weighted composite of spread% (tighter=better),
// open interest, and today's volume. Weights are a documented judgment
// call, not a standard industry formula: spread is the strongest real-time
// liquidity signal (40%), OI reflects standing market depth (35%), volume
// reflects today's actual trading activity (25%). Each sub-score is a
// real, bounded transform of a real field.
function liquidityScore({ bid, ask, openInterest, volume } = {}) {
  const spread = spreadPct({ bid, ask });
  // Spread sub-score: 0% spread -> 100, 20%+ spread -> 0, linear between.
  // When spread can't be computed (no real bid/ask), use a below-neutral
  // 40 rather than guessing high or low — an honest partial composite, not
  // a fabricated spread number.
  const spreadSub = spread == null ? 40 : Math.max(0, Math.min(100, 100 - (spread / 20) * 100));
  // OI sub-score: log-scaled, 5000+ contracts -> 100.
  const oi = Number(openInterest) || 0;
  const oiSub = Math.max(0, Math.min(100, (Math.log10(oi + 1) / Math.log10(5001)) * 100));
  // Volume sub-score: log-scaled, 2000+ contracts today -> 100.
  const vol = Number(volume) || 0;
  const volSub = Math.max(0, Math.min(100, (Math.log10(vol + 1) / Math.log10(2001)) * 100));
  const score = spreadSub * 0.4 + oiSub * 0.35 + volSub * 0.25;
  return Math.round(score);
}

// Days-to-expiry from a real "YYYY-MM-DD" expiry string (UTC calendar days,
// floor at 0). Null on an unparseable date rather than a guessed number.
function dteFromExpiry(expiry) {
  const exp = new Date(`${expiry}T00:00:00Z`);
  if (Number.isNaN(exp.getTime())) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((exp.getTime() - todayUtc) / 86_400_000));
}

// Expected Value — options platform redesign Phase 5 (spec: "Expected
// Value" as one of the Option Intelligence fields). Real POP crossed with
// real avg-win/avg-loss % (whatever the caller's own real trade-plan math
// produced — this function does no target/stop math itself, only the EV
// arithmetic over real inputs already computed elsewhere).
function expectedValue({ pop, avgWinPct, avgLossPct } = {}) {
  const p = Number(pop), w = Number(avgWinPct), l = Number(avgLossPct);
  if (!Number.isFinite(p) || !Number.isFinite(w) || !Number.isFinite(l)) return null;
  const prob = Math.max(0, Math.min(100, p)) / 100;
  return Math.round((prob * w - (1 - prob) * Math.abs(l)) * 100) / 100;
}

// AI Contract Ranking — "sort by opportunity, not strike" (spec). Scores
// every real contract by a weighted composite of real POP + real
// liquidity + alignment with the symbol's real AI Trade Score (Phase 3,
// passed in by the caller, not recomputed here) — one ranking engine, so
// the Option Recommender's "top pick" and the Smart Option Chain's
// sortable table are always consistent with each other. `contracts` is
// the real chain array (mapP()'s output, routes/market.js).
function rankContracts(contracts, { underlying, isCall, aiTradeScore } = {}) {
  const alignment = Number.isFinite(Number(aiTradeScore)) ? Number(aiTradeScore) : 50;
  return (contracts || []).map((c) => {
    const dte = c.dte != null ? c.dte : dteFromExpiry(c.expiry);
    const pop = probabilityOfProfit({ delta: c.delta, iv: c.iv, strike: c.strike, underlying, dte, isCall });
    const liquidity = liquidityScore({ bid: c.bid, ask: c.ask, openInterest: c.openInterest, volume: c.volume });
    const popScore = pop != null ? pop : 50;
    const rankScore = Math.round(popScore * 0.45 + liquidity * 0.35 + alignment * 0.2);
    return { ...c, dte, pop, liquidityScore: liquidity, rankScore };
  }).sort((a, b) => b.rankScore - a.rankScore);
}

// Gamma Squeeze Probability — options platform redesign Phase 5. A
// documented composite of real dealer-short-gamma (Phase 2's GEX, net
// negative = dealers short gamma), real short-float %, and real RVOL —
// not a single fabricated number. Null when GEX itself isn't available
// (same hard gate Phase 2 established), since dealer positioning is the
// core real signal this metric is built on.
function gammaSqueezeProbability({ gammaExposure, shortFloatPct, rvol } = {}) {
  if (!gammaExposure?.available) return null;
  let score = 0;
  if (Number(gammaExposure.netGEX) < 0) score += 40;
  if (Number.isFinite(Number(shortFloatPct))) score += Math.max(0, Math.min(30, (Number(shortFloatPct) / 20) * 30));
  if (Number.isFinite(Number(rvol))) score += Math.max(0, Math.min(30, ((Number(rvol) - 1) / 2) * 30));
  return Math.max(0, Math.min(100, Math.round(score)));
}

// IV Crush Risk — real days-to-earnings crossed with real IV Rank. Only
// meaningful within 10 real calendar days of a real earnings date (the
// window IV crush actually applies to); null outside that window rather
// than a low-but-fabricated number.
function ivCrushRisk({ daysToEarnings, ivRank } = {}) {
  // daysToEarnings != null guards against Number(null/undefined) silently
  // coercing to 0 — a real "no earnings date known" position must never
  // be scored as if earnings were happening today.
  const d = daysToEarnings != null ? Number(daysToEarnings) : NaN;
  if (!Number.isFinite(d) || d < 0 || d > 10) return null;
  const proximityScore = ((10 - d) / 10) * 60;
  const ivScore = Number.isFinite(Number(ivRank)) ? (Number(ivRank) / 100) * 40 : 20;
  return Math.round(proximityScore + ivScore);
}

// Assignment Risk — real ITM-proximity (a contract's own real delta
// already approximates probability of expiring ITM) weighted more heavily
// as real DTE shrinks (assignment risk concentrates near expiry).
function assignmentRisk({ delta, dte } = {}) {
  const d = Number(delta);
  if (!Number.isFinite(d)) return null;
  const itmScore = Math.min(100, Math.abs(d) * 100);
  const dteFactor = Number.isFinite(Number(dte)) ? Math.max(0, Math.min(1, (10 - Number(dte)) / 10)) : 0.3;
  return Math.round(itmScore * (0.6 + 0.4 * dteFactor));
}

// Smart Options Flow interpretation — options platform redesign Phase 6
// (spec: "interpret every options trade automatically" — Institutional
// Bullish/Bearish label, Trade Size, Confidence %, Execution, one-sentence
// AI Summary, per-trade bullish/bearish score). Takes one real flow row
// (routes/market.js's fetchOptionsFlow — Tradier/Yahoo real, or the
// honestly-flagged `estimated: true` fallback) and derives every field
// from real data already on the row. Never claims more confidence than
// the estimated fallback deserves — softened explicitly, not silently,
// when `row.estimated` is true.
function interpretFlowRow(row) {
  const notional = Number(row?.notional) || 0;
  const volume = Number(row?.volume) || 0;
  const oi = Number(row?.openInterest) || 0;
  const volOiRatio = oi > 0 ? Math.round((volume / oi) * 100) / 100 : null;

  // Trade Size bucket — real notional thresholds, a documented judgment
  // call (same convention as liquidityScore's weights).
  let sizeBucket;
  if (notional >= 5_000_000) sizeBucket = "Very Large";
  else if (notional >= 1_000_000) sizeBucket = "Large";
  else if (notional >= 250_000) sizeBucket = "Medium";
  else sizeBucket = "Small";

  // Execution — real bid/ask vs. real lastPrice, when both are present.
  // Honest "Unavailable" (not a guess) on providers/fallback rows with no
  // real bid/ask (e.g. the estimated fallback never has one).
  const bid = Number(row?.bid), ask = Number(row?.ask), last = Number(row?.lastPrice);
  let execution = "Unavailable";
  if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask >= bid && Number.isFinite(last)) {
    const mid = (bid + ask) / 2;
    if (last >= ask) execution = "Above Ask";
    else if (last > mid) execution = "At Ask";
    else if (last === mid) execution = "Mid";
    else if (last > bid) execution = "At Bid";
    else execution = "Below Bid";
  }

  const isCall = row?.side === "CALL";
  // Net directional read — accounts for real execution (buying vs.
  // selling), not just real side. Buying calls or selling puts is
  // bullish; buying puts or selling calls is bearish. When execution is
  // unknown (Mid, or genuinely Unavailable), falls back to side alone —
  // the only real signal available. Used consistently below (label,
  // summary, signedScore) so they can never contradict each other the way
  // an earlier draft of this function did (label correctly flipped
  // direction on a sold call, but the summary sentence and score didn't).
  const buying = execution === "Above Ask" || execution === "At Ask";
  const selling = execution === "Below Bid" || execution === "At Bid";
  const bullish = selling ? !isCall : isCall; // buying and "unknown" both default to raw side

  // Confidence % — deterministic composite of real signals already on the
  // row: the provider's own real `unusual` flag, real trade size, real
  // execution (buying pressure at/above ask or selling pressure at/below
  // bid is a stronger real signal than an ambiguous mid-market print), and
  // real volume/OI ratio.
  let confidence = 35;
  if (row?.unusual) confidence += 20;
  if (sizeBucket === "Very Large") confidence += 20;
  else if (sizeBucket === "Large") confidence += 12;
  else if (sizeBucket === "Medium") confidence += 5;
  if (execution === "Above Ask" || execution === "Below Bid") confidence += 15;
  else if (execution !== "Unavailable") confidence += 5;
  if (volOiRatio != null && volOiRatio >= 3) confidence += 5;
  confidence = Math.max(5, Math.min(99, Math.round(confidence)));
  // The estimated fallback is a real reconstruction from price/volume, not
  // an observed trade — never let it read as confidently as a real print.
  if (row?.estimated) confidence = Math.min(confidence, 40);

  const institutionalLabel = row?.estimated
    ? `Estimated ${isCall ? "call" : "put"}-side positioning (no real options-flow provider available)`
    : buying
      ? `Institution opened large ${bullish ? "bullish" : "bearish"} position`
      : selling
        ? `Likely selling ${isCall ? "calls" : "puts"} (${bullish ? "bullish/neutral" : "bearish/neutral"} premium collection)`
        : `Real ${isCall ? "call" : "put"}-side flow`;

  const institutionalRating = confidence >= 90 ? "A+" : confidence >= 80 ? "A" : confidence >= 70 ? "B+" : confidence >= 60 ? "B" : confidence >= 45 ? "C" : "D";

  const summaryParts = [
    sizeBucket, row?.tradeType || "trade",
    execution !== "Unavailable" ? execution.toLowerCase() : null,
    `on ${row?.symbol || "?"} ${isCall ? "calls" : "puts"}`,
    volOiRatio != null ? `${volOiRatio}x OI` : null,
    `— ${confidence}% confidence ${bullish ? "bullish" : "bearish"}${row?.estimated ? " (estimated)" : ""}`,
  ].filter(Boolean);
  const summary = summaryParts.join(" ");

  // Likely New Position — honestly "Unknown": this app doesn't track a
  // real day-over-day open-interest history, so a real new-position read
  // can't be derived. Never guessed.
  const likelyNewPosition = "Unknown";

  return {
    sizeBucket, execution, institutionalLabel, confidence, institutionalRating, summary, likelyNewPosition,
    signedScore: (bullish ? 1 : -1) * confidence,
  };
}

module.exports = {
  normCdf, probabilityOfProfit, estimateDelta, expectedMove, spreadPct, liquidityScore,
  dteFromExpiry, expectedValue, rankContracts, gammaSqueezeProbability, ivCrushRisk, assignmentRisk,
  interpretFlowRow,
};
