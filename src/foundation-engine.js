// foundation-engine.js — Technical Foundation & V-Recovery Engine
// (2026-08-19, explicit user spec: "TECHNICAL FOUNDATION & V-RECOVERY
// ENGINE — Master Implementation Prompt"). Pure computation module, no I/O
// — the route (`GET /api/market/foundation`, src/routes/market.js) does
// all the real fetching (2y daily bars, SPY/sector bars, and this
// symbol's already-computed VCP/pivot/RS via buildTrendTemplate) and
// hands plain data in here. Same "thin pure module over real fetched
// data" shape as day-trade-calc.js.
//
// Core principle from the spec, load-bearing for every function below:
// a fast recovery from a decline is a CONDITION, not a BUY signal. This
// engine answers "has the stock actually repaired its structure," a
// separate question from A+ Score/momentum, and the two are never
// allowed to collapse into one ("high momentum + weak foundation" must
// never auto-resolve to a buy — see deriveFoundationVerdict's hard gate).
//
// Every number here traces to real OHLCV bars — nothing fabricated. The
// *threshold* constants below (drawdown %, day counts, density bands)
// are reasonable defaults grounded in standard technical-analysis
// convention, the same kind of judgment call analyzeVCP/computeChecklist's
// own thresholds already embody elsewhere in this app — not a claim
// about real market data, just where a line gets drawn.
"use strict";

// ── Tunable thresholds (design defaults, not fetched data) ─────────────────
const MIN_BARS_REQUIRED = 200;              // mirrors buildTrendTemplate's own floor
const V_RECOVERY_MIN_DRAWDOWN_PCT = 25;     // decline floor to even call it "significant"
const V_RECOVERY_MIN_RECOVERY_PCT = 60;     // % of the decline that must be recovered
const MAJOR_STRUCTURAL_RISK_DRAWDOWN_PCT = 45; // spec §2's explicit "major structural-risk warning" floor
const SUPPLY_PROXIMITY_PCT = 15;            // "approaching" the prior high / supply

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// Local Wilder true-range average — deliberately NOT a require() of
// routes/market.js's exported atrAt (that would create a route->engine->
// route circular require through src/routes/market.js). Duplicating this
// ~10-line formula is the SAME pattern already used independently by
// risk-lab-calc.js, meanrev-paper.js, future-wallet-quant.js, and
// routes/under10.js in this codebase, not a new anti-pattern.
function atr(bars, period, endIdx) {
  if (endIdx - period < 0) return null;
  let sum = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i += 1) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    );
    sum += tr;
  }
  return sum / period;
}

// ── 1. V-Recovery detection (spec §2) ───────────────────────────────────────
// Prior high = the real highest high in the fetched window; major low = the
// real lowest low AFTER that high; drawdown/recovery/speed are real prices,
// not modeled. Deliberately scoped to just "what happened" (the spec's own
// framing) — how fast is unusually fast, and whether supply is nearby, are
// separate downstream questions (computeRecoveryCompression /
// computeOverheadSupply below), not folded into this detector.
function detectVRecovery(bars) {
  if (!Array.isArray(bars) || bars.length < MIN_BARS_REQUIRED) {
    return { detected: false, dataInsufficient: true, reason: `Only ${bars ? bars.length : 0} real daily bars available — need at least ${MIN_BARS_REQUIRED} to reliably identify a prior high and major low.` };
  }
  const last = bars.length - 1;
  let priorHighIdx = 0, priorHigh = -Infinity;
  for (let i = 0; i <= last; i += 1) if (bars[i].high > priorHigh) { priorHigh = bars[i].high; priorHighIdx = i; }

  if (priorHighIdx >= last - 2) {
    // The real high is basically today — nothing to recover from yet.
    return { detected: false, dataInsufficient: false, reason: "Current price is at/near its own real high for the window — no prior decline to evaluate." };
  }

  let majorLowIdx = priorHighIdx, majorLow = priorHigh;
  for (let i = priorHighIdx; i <= last; i += 1) if (bars[i].low < majorLow) { majorLow = bars[i].low; majorLowIdx = i; }

  if (majorLowIdx === last) {
    return { detected: false, dataInsufficient: false, reason: "Price is still making new real lows — no recovery has begun yet." };
  }

  const currentPrice = bars[last].close;
  const drawdownPct = round2((priorHigh - majorLow) / priorHigh * 100);
  const recoveryRange = priorHigh - majorLow;
  const recoveryPct = recoveryRange > 0 ? round2(clamp((currentPrice - majorLow) / recoveryRange * 100, 0, 999)) : 0;
  const tradingDaysSinceLow = last - majorLowIdx;
  const recoverySpeed = tradingDaysSinceLow > 0 ? round2(recoveryPct / tradingDaysSinceLow) : null;
  const distanceToPriorHighPct = round2((priorHigh - currentPrice) / priorHigh * 100);

  const qualifies = drawdownPct >= V_RECOVERY_MIN_DRAWDOWN_PCT && recoveryPct >= V_RECOVERY_MIN_RECOVERY_PCT;
  const majorStructuralRisk = drawdownPct >= MAJOR_STRUCTURAL_RISK_DRAWDOWN_PCT;
  const approachingSupply = distanceToPriorHighPct <= SUPPLY_PROXIMITY_PCT;

  return {
    detected: qualifies,
    dataInsufficient: false,
    priorHigh: round2(priorHigh), priorHighIdx,
    majorLow: round2(majorLow), majorLowIdx,
    currentPrice: round2(currentPrice),
    drawdownPct, recoveryPct, tradingDaysSinceLow, recoverySpeed,
    distanceToPriorHighPct, majorStructuralRisk, approachingSupply,
    reason: qualifies
      ? `Real ${drawdownPct}% decline from $${round2(priorHigh)} to $${round2(majorLow)}, ${recoveryPct}% recovered over ${tradingDaysSinceLow} trading days.`
      : `Decline (${drawdownPct}%) or recovery (${recoveryPct}%) below the qualifying floor for a V-Recovery read (${V_RECOVERY_MIN_DRAWDOWN_PCT}%/${V_RECOVERY_MIN_RECOVERY_PCT}%).`,
  };
}

// ── 2. Recovery Compression (spec §3) — LOW/MODERATE/HIGH/EXTREME ──────────
// Own-history-relative: recovery speed normalized by the stock's own real
// ATR%. Market/sector-relative: honest-null when spyBars/sectorBars aren't
// supplied rather than guessing.
function computeRecoveryCompression(bars, recovery, ctx = {}) {
  if (!recovery.detected) return { label: null, applicable: false, reasons: [] };
  const last = bars.length - 1;
  const price = bars[last].close;
  const atr14 = atr(bars, 14, last);
  const ownAtrPct = atr14 != null && price > 0 ? round2(atr14 / price * 100) : null;

  const reasons = [];
  let ownAtrRelative = null;
  if (ownAtrPct && recovery.recoverySpeed != null) {
    ownAtrRelative = round2(recovery.recoverySpeed / ownAtrPct);
    reasons.push(`Recovering ${recovery.recoverySpeed}%/day against a real ${ownAtrPct}% ATR-day — ${ownAtrRelative}x its own typical daily range.`);
  } else {
    reasons.push("Own-ATR comparison unavailable (insufficient bars near the current date).");
  }

  const relTo = (label, refBars) => {
    if (!Array.isArray(refBars) || refBars.length < 20) return null;
    const rLast = refBars.length - 1;
    const rAtr = atr(refBars, 14, rLast);
    const rPrice = refBars[rLast].close;
    if (rAtr == null || !rPrice) return null;
    const pct = round2(rAtr / rPrice * 100);
    reasons.push(`${label} real 14-day ATR is ${pct}% of price over the same window.`);
    return pct;
  };
  const vsMarket = relTo("SPY's", ctx.spyBars);
  const vsSector = relTo("This sector ETF's", ctx.sectorBars);
  if (vsMarket == null) reasons.push("Market-relative comparison unavailable (SPY bars not supplied).");
  if (vsSector == null) reasons.push("Sector-relative comparison unavailable (no real sector ETF mapping or bars for this symbol).");

  // Bucketing — time-since-low and recovery magnitude together, real
  // defaults grounded in "a real base normally takes several weeks."
  const days = recovery.tradingDaysSinceLow, pctRecovered = recovery.recoveryPct;
  let label;
  if (days <= 15 && pctRecovered >= 80) label = "EXTREME";
  else if (days <= 30 && pctRecovered >= 70) label = "HIGH";
  else if (days <= 60) label = "MODERATE";
  else label = "LOW";

  return { label, applicable: true, ownAtrPct, ownAtrRelative, vsMarket, vsSector, reasons };
}

// ── 3. Overhead Supply Engine (spec §4) ─────────────────────────────────────
// Real volume-at-price bucketing (same histogram-by-high/low-overlap
// algorithm src/smc-engine.js's computeVolumeProfile already uses) over the
// prior-high-to-now window instead of that function's hardcoded last-60-bar
// slice — the decline+recovery span is exactly the real "who's underwater
// and might sell to get out even" zone the spec is describing.
function buildVolumeProfile(slice, buckets = 30) {
  if (!slice.length) return { profile: [], totalVol: 0 };
  const hi = Math.max(...slice.map((b) => b.high));
  const lo = Math.min(...slice.map((b) => b.low));
  const range = hi - lo;
  if (range <= 0) return { profile: [], totalVol: 0 };
  const step = range / buckets;
  const profile = Array.from({ length: buckets }, (_, i) => ({ price: round2(lo + step * i + step / 2), vol: 0 }));
  for (const bar of slice) {
    const barRange = bar.high - bar.low;
    if (barRange <= 0) continue;
    for (const bucket of profile) {
      const overlap = Math.min(bar.high, bucket.price + step / 2) - Math.max(bar.low, bucket.price - step / 2);
      if (overlap > 0) bucket.vol += (bar.volume || 0) * (overlap / barRange);
    }
  }
  const totalVol = profile.reduce((s, b) => s + b.vol, 0);
  return { profile, totalVol };
}

function computeOverheadSupply(bars, recovery, price) {
  if (!recovery.detected) return { label: null, applicable: false, zones: [], reasons: [] };
  const slice = bars.slice(recovery.priorHighIdx, bars.length);
  const { profile, totalVol } = buildVolumeProfile(slice, 30);
  if (!profile.length || !totalVol) {
    return { label: null, applicable: false, zones: [], reasons: ["Overhead supply read unavailable — no real volume range in the recovery window."] };
  }
  const above = profile.filter((b) => b.price > price);
  const volAbove = above.reduce((s, b) => s + b.vol, 0);
  const supplyDensityAbovePct = round2(volAbove / totalVol * 100);
  const zones = above
    .filter((b) => b.vol > 0)
    .sort((a, b) => b.vol - a.vol)
    .slice(0, 5)
    .map((b) => ({ price: b.price, pct: round2(b.vol / totalVol * 100), distancePct: round2((b.price - price) / price * 100) }))
    .sort((a, b) => a.price - b.price);
  const nearestSupply = zones.length ? zones.reduce((n, z) => (z.distancePct < n.distancePct ? z : n), zones[0]) : null;

  let label;
  if (supplyDensityAbovePct < 15) label = "LOW";
  else if (supplyDensityAbovePct < 30) label = "MODERATE";
  else if (supplyDensityAbovePct < 50) label = "HIGH";
  else label = "EXTREME";

  const reasons = [`${supplyDensityAbovePct}% of real volume in the decline/recovery window traded above the current price.`];
  if (nearestSupply) reasons.push(`Nearest real supply concentration is ${nearestSupply.distancePct}% above price ($${nearestSupply.price}).`);

  return {
    label, applicable: true, supplyDensityAbovePct, zones,
    distanceToNearestSupplyPct: nearestSupply ? nearestSupply.distancePct : null,
    distanceToPriorHighPct: recovery.distanceToPriorHighPct,
    reasons,
  };
}

// ── 4. Supply Absorption (spec §5) ──────────────────────────────────────────
// Real, bar-derived proxies for "is the stock actually absorbing the supply
// above it": repeated real tests of the nearest supply zone, whether each
// held, whether pullback magnitude is shrinking test-over-test, and a real
// up-day-vs-down-day volume trend across the recovery window.
function computeSupplyAbsorption(bars, recovery, supply) {
  if (!recovery.detected || !supply.applicable || !supply.zones.length) {
    return { label: null, applicable: false, testsCount: 0, holdsCount: 0, reasons: ["No qualifying supply zone to test against."] };
  }
  const testPrice = supply.zones.reduce((n, z) => (z.pct > n.pct ? z : n), supply.zones[0]).price; // heaviest real zone
  const tol = testPrice * 0.03; // within 3% counts as a real "test"
  const post = bars.slice(recovery.majorLowIdx, bars.length);

  // Local-peak tests against the zone.
  const tests = [];
  for (let i = 1; i < post.length - 1; i += 1) {
    const b = post[i];
    if (b.high >= testPrice - tol && b.high <= testPrice + tol * 1.5 && b.high >= post[i - 1].high && b.high >= post[i + 1].high) {
      tests.push(i);
    }
  }
  let holds = 0;
  const pullbacks = [];
  for (let k = 0; k < tests.length; k += 1) {
    const idx = tests[k];
    const testHigh = post[idx].high;
    const windowEnd = Math.min(post.length - 1, idx + (tests[k + 1] || post.length));
    let low = testHigh;
    for (let j = idx; j <= windowEnd; j += 1) low = Math.min(low, post[j].low);
    const pullbackPct = round2((testHigh - low) / testHigh * 100);
    pullbacks.push(pullbackPct);
    if (low >= testPrice - tol * 2.5) holds += 1; // didn't break down hard after the test
  }
  const shrinking = pullbacks.length >= 2 && pullbacks[pullbacks.length - 1] < pullbacks[0];

  // Up-day vs down-day real volume, first half of the recovery window vs
  // second half — declining sell volume / rising demand volume evidence.
  const half = Math.max(1, Math.floor(post.length / 2));
  const volSplit = (arr) => {
    let up = 0, down = 0;
    for (let i = 1; i < arr.length; i += 1) {
      if (arr[i].close > arr[i - 1].close) up += arr[i].volume || 0;
      else if (arr[i].close < arr[i - 1].close) down += arr[i].volume || 0;
    }
    return { up, down };
  };
  const firstHalf = volSplit(post.slice(0, half));
  const secondHalf = volSplit(post.slice(post.length - half));
  const sellVolTrend = firstHalf.down > 0 ? round2(secondHalf.down / firstHalf.down) : null; // <1 = selling drying up
  const buyVolTrend = firstHalf.up > 0 ? round2(secondHalf.up / firstHalf.up) : null;         // >1 = demand building

  const reasons = [];
  reasons.push(tests.length ? `${tests.length} real test(s) of the heaviest supply zone (~$${round2(testPrice)}), ${holds} held.` : "No real tests of the supply zone yet.");
  if (pullbacks.length >= 2) reasons.push(shrinking ? "Pullback magnitude has been shrinking test-over-test." : "Pullback magnitude is not yet shrinking test-over-test.");
  if (sellVolTrend != null) reasons.push(sellVolTrend < 0.85 ? `Down-day volume declining (${sellVolTrend}x).` : sellVolTrend > 1.15 ? `Down-day volume increasing (${sellVolTrend}x) — supply not yet drying up.` : "Down-day volume roughly flat.");
  if (buyVolTrend != null) reasons.push(buyVolTrend > 1.15 ? `Up-day volume building (${buyVolTrend}x).` : "Up-day (demand) volume not yet building.");

  let label;
  if (!tests.length) label = "NOT_READY";
  else if (holds === tests.length && shrinking && (sellVolTrend == null || sellVolTrend < 1.1)) label = "STRONG";
  else if (holds >= Math.ceil(tests.length / 2)) label = "STRENGTHENING";
  else label = "NOT_READY";

  return { label, applicable: true, testsCount: tests.length, holdsCount: holds, pullbacks, shrinking, sellVolTrend, buyVolTrend, reasons };
}

// ── 5. Tightness (spec §9) ──────────────────────────────────────────────────
// ATR(10)/(20)/(50) as %-of-price, plus a week-by-week range series
// aggregated straight from the same daily bars (no extra fetch).
function computeTightness(bars) {
  const last = bars.length - 1;
  const price = bars[last].close;
  if (!price) return { label: null, subScore: 50, reasons: ["Tightness unavailable — no real current price."] };
  const a10 = atr(bars, 10, last), a20 = atr(bars, 20, last), a50 = atr(bars, 50, last);
  const atr10Pct = a10 != null ? round2(a10 / price * 100) : null;
  const atr20Pct = a20 != null ? round2(a20 / price * 100) : null;
  const atr50Pct = a50 != null ? round2(a50 / price * 100) : null;

  // Last ~8 real trading weeks, 5-day buckets from the end.
  const weeks = [];
  for (let end = bars.length; end - 5 >= Math.max(0, bars.length - 40); end -= 5) {
    const wk = bars.slice(Math.max(0, end - 5), end);
    if (wk.length < 2) break;
    const hi = Math.max(...wk.map((b) => b.high)), lo = Math.min(...wk.map((b) => b.low));
    const c = wk[wk.length - 1].close;
    if (c > 0) weeks.unshift(round2((hi - lo) / c * 100));
  }

  let trendLabel = "NEUTRAL";
  if (weeks.length >= 4) {
    const recent4 = weeks.slice(-4);
    const declining = recent4.every((w, i) => i === 0 || w <= recent4[i - 1] * 1.1);
    const expanding = recent4.every((w, i) => i === 0 || w >= recent4[i - 1] * 0.9) && recent4[recent4.length - 1] > recent4[0];
    if (declining && recent4[recent4.length - 1] < recent4[0]) trendLabel = "PROGRESSIVE_TIGHTENING";
    else if (expanding) trendLabel = "VOLATILITY_EXPANSION";
  }

  // Absolute compactness sub-score (how small is ATR10 right now) blended
  // with the week-over-week trend direction.
  let compactScore = atr10Pct == null ? 50 : atr10Pct <= 2 ? 95 : atr10Pct <= 3.5 ? 78 : atr10Pct <= 5 ? 55 : atr10Pct <= 7 ? 35 : 15;
  const trendScore = trendLabel === "PROGRESSIVE_TIGHTENING" ? 90 : trendLabel === "VOLATILITY_EXPANSION" ? 15 : 55;
  const subScore = Math.round(compactScore * 0.6 + trendScore * 0.4);

  const reasons = [];
  reasons.push(atr10Pct != null ? `ATR(10) is ${atr10Pct}% of price.` : "ATR(10) unavailable (insufficient bars).");
  reasons.push(trendLabel === "PROGRESSIVE_TIGHTENING" ? "Weekly range has been progressively contracting." : trendLabel === "VOLATILITY_EXPANSION" ? "Weekly range has been expanding, not contracting." : "Weekly range trend is mixed/neutral.");

  return { label: trendLabel, subScore, atr10Pct, atr20Pct, atr50Pct, weeklyRanges: weeks, reasons };
}

// ── 6/7. Support Quality + Higher Lows (spec §10-11) ────────────────────────
// Same real fractal swing-low detection analyzeVCP (routes/market.js) uses
// elsewhere in this app, applied to the post-major-low window only.
function detectHigherLows(bars, sinceIdx) {
  const seg = bars.slice(sinceIdx);
  const n = seg.length, W = 2;
  if (n < W * 3) return { lows: [], isAscending: null, reasons: ["Not enough real bars since the low to detect swing structure."] };
  const lows = [];
  for (let i = W; i < n - W; i += 1) {
    let isL = true;
    for (let j = i - W; j <= i + W; j += 1) if (j !== i && seg[j].low <= seg[i].low) { isL = false; break; }
    if (isL) lows.push({ idx: sinceIdx + i, price: round2(seg[i].low) });
  }
  if (lows.length < 2) return { lows, isAscending: null, reasons: ["Fewer than 2 real swing lows found yet — too early to judge higher-low structure."] };
  let ascending = 0;
  for (let k = 1; k < lows.length; k += 1) if (lows[k].price > lows[k - 1].price) ascending += 1;
  const isAscending = ascending >= Math.ceil((lows.length - 1) * 0.6); // allow one real dip without failing the whole read
  return {
    lows, isAscending,
    reasons: [isAscending
      ? `${lows.length} real swing lows found, trending higher (${lows.map((l) => "$" + l.price).join(" → ")}).`
      : `${lows.length} real swing lows found, not consistently higher (${lows.map((l) => "$" + l.price).join(" → ")}).`],
  };
}

function computeSupportQuality(bars, recovery, higherLows) {
  if (!recovery.detected) return { label: null, subScore: 50, reasons: [] };
  // Leads with its OWN distinct sentence (not higherLows' raw swing-low
  // list, which is a separate dimension in the score breakdown) so the
  // two dimensions read as genuinely different evidence in the "why?"
  // modal, not a duplicated line.
  const reasons = [];
  let subScore = 50;
  if (higherLows.isAscending === true) { subScore = 78; reasons.push("Higher-low structure supports a real support read."); }
  else if (higherLows.isAscending === false) { subScore = 35; reasons.push("Support has not yet shown a clean higher-low structure."); }
  else reasons.push("Support quality is unclear — too few real swing lows yet to judge.");

  // Downside penetration since the low — did price ever revisit/undercut
  // the real major low after the initial bounce (a real support failure)?
  const post = bars.slice(recovery.majorLowIdx + 1);
  const revisited = post.some((b) => b.low <= recovery.majorLow);
  if (revisited) { subScore -= 15; reasons.push("Price revisited the original real low after the initial bounce."); }
  reasons.push(...higherLows.reasons);

  subScore = clamp(subScore, 0, 100);
  const label = subScore >= 70 ? "STRONG" : subScore >= 50 ? "DEVELOPING" : "WEAK";
  return { label, subScore, revisited, reasons };
}

// ── 8. Base Duration (spec §8) ──────────────────────────────────────────────
// A big decline needs real time to repair — compares real trading days
// since the low against a real-defaults floor scaled to the decline's own
// magnitude (a 45%+ decline needs meaningfully longer than a 25% one).
function computeBaseDuration(bars, recovery, absorption) {
  if (!recovery.detected) return { label: null, subScore: 50, tradingDays: null, reasons: [] };
  const days = recovery.tradingDaysSinceLow;
  const minExpected = recovery.drawdownPct >= MAJOR_STRUCTURAL_RISK_DRAWDOWN_PCT ? 35 : recovery.drawdownPct >= 35 ? 25 : 15;
  const ratio = days / minExpected;
  let subScore = ratio >= 1.5 ? 90 : ratio >= 1 ? 70 : ratio >= 0.6 ? 45 : ratio >= 0.3 ? 25 : 10;
  // A real, meaningfully-tested base can partially offset a short raw day
  // count (time isn't the only real evidence of repair).
  if (absorption.applicable && absorption.testsCount >= 2) subScore = Math.min(100, subScore + 10);
  const label = subScore >= 70 ? "SUFFICIENT" : subScore >= 45 ? "DEVELOPING" : "INSUFFICIENT";
  const reasons = [`${days} real trading days since the low vs. a ${minExpected}-day reference floor for a ${recovery.drawdownPct}% decline.`];
  if (ratio < 0.6) reasons.push("A decline this large following this little real consolidation time is a structural-repair risk, not a green light.");
  return { label, subScore, tradingDays: days, minExpectedDays: minExpected, reasons };
}

// ── 9. Foundation Score — weighted 0-100 composite (spec §7) ───────────────
// Same {score, breakdown, reasons} shape every composite score in this app
// uses (computeAPlusScore, computeInstitutionalGrade, stockQualityBreakdown)
// — breakdown keys are index-aligned to `reasons`, matching the FOUNDATION_
// DIMENSIONS array wired into the shared AiScoreExplainer "why?" modal.
const FOUNDATION_WEIGHTS = {
  baseDuration: 15, tightness: 15, support: 15, volatility: 15,
  supply: 10, absorption: 10, higherLows: 10, volume: 5, pivot: 5,
};

function honestMid(weight) { return Math.round(weight * 0.5); }

function computeFoundationScore(parts) {
  const keys = Object.keys(FOUNDATION_WEIGHTS);
  const breakdown = {}, reasons = [];
  for (const key of keys) {
    const w = FOUNDATION_WEIGHTS[key];
    const part = parts[key];
    if (!part || part.subScore == null) {
      breakdown[key] = honestMid(w);
      reasons.push(`${key} unavailable — honest mid-point credit, not fabricated.`);
    } else {
      breakdown[key] = Math.round((part.subScore / 100) * w);
      reasons.push((part.reasons && part.reasons[0]) || `${key}: ${part.subScore}/100`);
    }
  }
  const score = clamp(Object.values(breakdown).reduce((a, b) => a + b, 0), 0, 100);
  return { score, breakdown, reasons };
}

// ── 10. Final verdict (spec §12-13, §17-18) ─────────────────────────────────
// Hard rule: momentum/A+ Score never appears in this function's inputs on
// purpose — structure is judged on structure alone. The caller (route/UI)
// is the one that later shows A+ Score and Foundation Score side by side;
// this function must never let a high score alone reach the top tier
// without a real valid pivot + RS confirmation + non-extreme supply.
function deriveFoundationVerdict({ score, recovery, supply, absorption, pivotValid, rsRating }) {
  if (!recovery.detected) {
    return { state: null, action: null, applicable: false, why: [], waitFor: [] };
  }
  const supplyExtreme = supply.applicable && supply.label === "EXTREME";
  const absorptionNotReady = absorption.applicable && absorption.label === "NOT_READY";
  const rsConfirmed = Number.isFinite(rsRating) && rsRating >= 70;

  let state, action;
  if (score < 40 || (supplyExtreme && absorptionNotReady)) {
    state = "WEAK_FOUNDATION"; action = "AVOID_WAIT";
  } else if (score < 60) {
    state = "V_RECOVERY_FOUNDATION_BUILDING"; action = "WAIT";
  } else if (score < 75) {
    state = "FOUNDATION_STRENGTHENING"; action = "WATCH";
  } else if (score >= 75 && pivotValid === true && rsConfirmed && !supplyExtreme) {
    state = "STRONG_FOUNDATION_VALID_PIVOT"; action = "BUY_CANDIDATE";
  } else {
    // Score alone earned "strong," but the hard gate (pivot/RS/supply)
    // wasn't cleared — never auto-promote to a buy-candidate on score alone.
    state = "STRONG_FOUNDATION"; action = "BUY_CANDIDATE_WATCH_FOR_ENTRY";
  }

  const why = [];
  const waitFor = [];
  if (state === "STRONG_FOUNDATION_VALID_PIVOT" || state === "STRONG_FOUNDATION") {
    why.push("Prior technical damage has been substantially repaired.");
    if (absorption.applicable) why.push(...absorption.reasons.slice(0, 1));
  } else {
    if (recovery.majorStructuralRisk) why.push(`Prior decline was severe (${recovery.drawdownPct}%).`);
    if (recovery.recoverySpeed != null) why.push("Recovery occurred quickly relative to the time normally needed to repair damage this size.");
    if (supplyExtreme || supply.label === "HIGH") { why.push("Overhead supply remains significant."); waitFor.push("Overhead supply to be absorbed"); }
    if (absorptionNotReady) waitFor.push("Real tests of resistance to hold");
    if (!pivotValid) waitFor.push("A valid pivot to develop");
    if (!rsConfirmed) waitFor.push("Relative strength confirmation (RS ≥ 70)");
    waitFor.push("Continued tightening and higher lows");
  }

  return { state, action, applicable: true, why, waitFor, gates: { supplyExtreme, absorptionNotReady, pivotValid: !!pivotValid, rsConfirmed } };
}

// ── Orchestrator ─────────────────────────────────────────────────────────
function computeFoundationAnalysis(bars, symbol, ctx = {}) {
  const recovery = detectVRecovery(bars);
  if (recovery.dataInsufficient) {
    return { ok: true, symbol, dataInsufficient: true, reason: recovery.reason, recoveryType: "DATA_INSUFFICIENT" };
  }
  if (!recovery.detected) {
    return { ok: true, symbol, dataInsufficient: false, recoveryType: "NONE", reason: recovery.reason };
  }

  const last = bars.length - 1;
  const price = bars[last].close;
  const compression = computeRecoveryCompression(bars, recovery, ctx);
  const supply = computeOverheadSupply(bars, recovery, price);
  const absorption = computeSupplyAbsorption(bars, recovery, supply);
  const tightness = computeTightness(bars);
  const higherLows = detectHigherLows(bars, recovery.majorLowIdx);
  const support = computeSupportQuality(bars, recovery, higherLows);
  const baseDuration = computeBaseDuration(bars, recovery, absorption);

  const pivot = ctx.vcpSetup && ctx.vcpSetup.breakout ? ctx.vcpSetup.breakout.pivot : null;
  const pivotValid = pivot ? !!pivot.valid : null;

  const supplySubScore = supply.applicable
    ? (supply.label === "LOW" ? 90 : supply.label === "MODERATE" ? 65 : supply.label === "HIGH" ? 35 : 12)
    : null;
  const absorptionSubScore = absorption.applicable
    ? (absorption.label === "STRONG" ? 90 : absorption.label === "STRENGTHENING" ? 55 : 20)
    : null;
  const higherLowsSubScore = higherLows.isAscending === true ? 85 : higherLows.isAscending === false ? 25 : null;
  const volumeSubScore = absorption.applicable && absorption.sellVolTrend != null
    ? (absorption.sellVolTrend < 0.85 && (absorption.buyVolTrend == null || absorption.buyVolTrend >= 1) ? 80
      : absorption.sellVolTrend > 1.15 ? 25 : 50)
    : null;
  const pivotSubScore = pivotValid === true ? 95 : pivotValid === false ? 40 : null;
  // "Volatility Contraction" (trend of ranges shrinking) is a distinct 15%
  // dimension from "Tightness" (how compact ranges are right now) per the
  // spec's own weighting table — both real, derived from the same weekly-
  // range series, scored from different angles of it.
  const volatilitySubScore = tightness.label === "PROGRESSIVE_TIGHTENING" ? 88 : tightness.label === "VOLATILITY_EXPANSION" ? 15 : 50;

  const scoreResult = computeFoundationScore({
    baseDuration: { subScore: baseDuration.subScore, reasons: baseDuration.reasons },
    tightness: { subScore: tightness.subScore, reasons: tightness.reasons },
    support: { subScore: support.subScore, reasons: support.reasons },
    volatility: { subScore: volatilitySubScore, reasons: [tightness.reasons[1] || tightness.reasons[0]] },
    supply: { subScore: supplySubScore, reasons: supply.reasons },
    absorption: { subScore: absorptionSubScore, reasons: absorption.reasons },
    higherLows: { subScore: higherLowsSubScore, reasons: higherLows.reasons },
    volume: { subScore: volumeSubScore, reasons: absorption.reasons.filter((r) => /volume/i.test(r)) },
    pivot: { subScore: pivotSubScore, reasons: [pivotValid === true ? "Real valid pivot identified." : pivotValid === false ? "No real valid pivot yet." : "Pivot data unavailable."] },
  });

  const verdict = deriveFoundationVerdict({
    score: scoreResult.score, recovery, supply, absorption, pivotValid, rsRating: ctx.rsRating,
  });

  return {
    ok: true, symbol, dataInsufficient: false,
    recoveryType: "V_RECOVERY",
    majorStructuralRisk: recovery.majorStructuralRisk,
    recovery, compression, supply, absorption, tightness, support, higherLows, baseDuration,
    pivot: pivot ? { price: pivot.price, distancePct: pivot.distancePct, valid: pivot.valid } : null,
    rsRating: Number.isFinite(ctx.rsRating) ? ctx.rsRating : null,
    foundationScore: scoreResult.score,
    breakdown: scoreResult.breakdown,
    reasons: scoreResult.reasons,
    verdict,
  };
}

module.exports = {
  detectVRecovery, computeRecoveryCompression, computeOverheadSupply, computeSupplyAbsorption,
  computeTightness, detectHigherLows, computeSupportQuality, computeBaseDuration,
  computeFoundationScore, deriveFoundationVerdict, computeFoundationAnalysis,
  FOUNDATION_WEIGHTS,
};
