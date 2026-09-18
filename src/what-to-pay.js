"use strict";
// what-to-pay.js (2026-09-16, "AI Trade Desk — Add 'What Price to Pay' to
// Every Stock" master prompt) — pure derivation over REAL, already-
// computed inputs. No fetching, no indicator math of its own: every
// number this file touches already exists somewhere else in this
// codebase (routes/market.js's real pivot/contractionLow/abovePivotPct,
// atr-risk-engine.js's real ATR + Anti-Chase bands, src/top50-scanner.js's
// real daily EMA20/50, the real 15m VWAP/RVOL/MACD/RSI day-trade row).
// "The system should identify price structure first. Indicators should
// CONFIRM the zone rather than independently generate random prices" —
// the two real zones below are centered on real structural levels
// (EMA20/EMA50/contractionLow), only WIDENED by ATR (a real volatility
// measure, never used to invent the center price itself).
//
// SIGNAL LIFECYCLE SAFETY (the prompt's own explicit rule): this file
// only ever READS `tier`/`signalState` — it never computes, returns, or
// feeds anything back into them. A cheap/attractive price can never by
// itself upgrade tier/opportunityStage; ENTRY CONFIRMED below is a pure
// display state gated by the REAL existing tier, not a new authority.
const { computeAtrRiskLevels, computeAntiChase } = require("./atr-risk-engine");

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

// Real zone construction — center = a real structural level, width =
// +/-0.5 ATR (the same real zone-width convention entry-engine.js's own
// earlyEntryZone already uses, reused here for consistency rather than
// inventing a second width rule).
function zoneAround(center, atr) {
  if (!Number.isFinite(center) || !Number.isFinite(atr) || atr <= 0) return null;
  return { low: round2(center - 0.5 * atr), high: round2(center + 0.5 * atr) };
}

// Minimum count of real confirmation signals (of the 6 checked below)
// required before "price is attractive" becomes "ENTRY CONFIRMED" — a
// disclosed, deliberately-not-unanimous bar (matching this codebase's
// own established pattern, e.g. entry-engine.js's own qualifying-
// conditions tally), since requiring literally every one of the
// prompt's 9 suggested checks simultaneously would make CONFIRMED
// realistically unreachable. Every check here reads an already-real
// field — no new indicator is computed to produce any of them.
const MIN_CONFIRMATIONS = 3;

function computeConfirmation({ higherLows, supportHolding, rsi, rsiPrior, macdHistogram, macdHistogramPrior, aboveVwap, ema9, ema9Prior, price, rvol }) {
  const checks = {
    higherLows: !!higherLows,
    supportHolding: !!supportHolding,
    rsiTurningUp: Number.isFinite(rsi) && Number.isFinite(rsiPrior) && rsi > rsiPrior,
    macdImproving: Number.isFinite(macdHistogram) && Number.isFinite(macdHistogramPrior) && macdHistogram > macdHistogramPrior,
    vwapReclaim: aboveVwap === true,
    emaReclaim: Number.isFinite(price) && Number.isFinite(ema9) && price > ema9,
    volumeConfirmation: Number.isFinite(rvol) && rvol >= 1.2,
  };
  const count = Object.values(checks).filter(Boolean).length;
  return { checks, count, passed: count >= MIN_CONFIRMATIONS };
}

// The one real exported function. Every input is a plain real number/
// boolean the caller already has in hand (routes/market.js's setup
// object, top50-scanner.js's dailyEmaInputs/day-trade row, and the
// canonical tier/signalState) — this function computes nothing from a
// network fetch and holds no state of its own.
function computeWhatToPay({
  price, pivot, contractionLow, ema20, ema50, ema9, ema9Prior, bars,
  tier, signalState,
  higherLows, supportHolding, rsi, rsiPrior, macdHistogram, macdHistogramPrior, aboveVwap, rvol,
} = {}) {
  if (!Number.isFinite(price) || price <= 0) return { available: false, reason: "No real price." };
  const atrResult = computeAtrRiskLevels(Array.isArray(bars) ? bars : [], price);
  const atr = atrResult.atr;
  if (!Number.isFinite(atr)) return { available: false, reason: "Not enough real bar history for a real ATR read yet." };

  // WHAT TO PAY — centered on the real EMA20 pullback level (the
  // classic "buy the pullback to the fast trend average" reference),
  // only when it's a genuine discount (below current price).
  const payCenter = Number.isFinite(ema20) && ema20 <= price ? ema20 : null;
  let whatToPay = zoneAround(payCenter, atr);

  // STRONG BUY ZONE — centered on the deeper of real EMA50 / the real
  // recent contraction low (major technical support), also only when
  // it's genuinely at or below price.
  const strongCandidates = [ema50, contractionLow].filter((v) => Number.isFinite(v) && v <= price);
  const strongCenter = strongCandidates.length ? Math.min(...strongCandidates) : null;
  let strongBuyZone = zoneAround(strongCenter, atr);

  // Real ordering guard — STRONG BUY ZONE must sit at or below WHAT TO
  // PAY, never overlapping/above it (can happen when EMA20/EMA50 are
  // tightly bunched). Collapses the higher zone down rather than
  // silently showing an inverted/overlapping range.
  if (whatToPay && strongBuyZone && strongBuyZone.high > whatToPay.low) {
    strongBuyZone = { low: strongBuyZone.low, high: Math.min(strongBuyZone.high, whatToPay.low - 0.01) };
    if (strongBuyZone.high <= strongBuyZone.low) strongBuyZone = null; // no real separation left — honest omission, not a fabricated sliver
  }

  // DON'T CHASE ABOVE (2026-09-18, "CANONICAL QUANT ENGINE" master
  // prompt, explicit rule: "Do NOT calculate this as an arbitrary fixed
  // percentage") — a real, volatility-scaled dollar ceiling instead of
  // the prior flat 8%-above-pivot rule. A quiet, low-ATR stock now gets a
  // tighter ceiling; a genuinely volatile one gets real room, rather than
  // every stock sharing one number. DONT_CHASE_ATR_MULT (2.5) sits
  // between atr-risk-engine.js's own real stopMult (1.5, tighter — a
  // stop needs to sit close) and target2R (3, wider) — a disclosed,
  // internally-consistent choice, not a second independently-invented
  // scale. ANTI_CHASE_DEFAULTS' own fixed-% bands (Trap Shield/Sniper
  // Decision's existing "don't chase" read) are untouched — only THIS
  // file's own ceiling changes, and antiChaseBand below still reports
  // that real, separate existing classification alongside it.
  const DONT_CHASE_ATR_MULT = 2.5;
  const dontChaseAbove = Number.isFinite(pivot) ? round2(pivot + DONT_CHASE_ATR_MULT * atr) : null;
  const antiChase = Number.isFinite(pivot) ? computeAntiChase(round2((price / pivot - 1) * 100)) : null;

  // Distance to the WHAT TO PAY zone — positive = price sits above the
  // zone (real "how far to go"); 0 once price is inside it. A SEPARATE
  // real signed distance below the zone (distanceBelowZonePct) covers the
  // opposite real case, which this single non-negative field could never
  // represent — see the real BELOW BUY ZONE fix below.
  const distancePct = whatToPay ? round2(Math.max(0, ((price - whatToPay.high) / whatToPay.high) * 100)) : null;
  // Real BELOW BUY ZONE detection (2026-09-18, Quant Engine master
  // prompt's own explicit "X% BELOW BUY ZONE — CHECK BREAKDOWN" case).
  // whatToPay's own zone only exists when ema20 <= price (the "genuine
  // discount" gate above, by design — a level price hasn't reached yet
  // is never shown as an already-cheap zone). That means whatToPay is
  // ALWAYS null in exactly the case this label needs to cover (price
  // has fallen THROUGH the pullback reference entirely) — distancePct
  // can't represent it either (it only measures distance ABOVE a zone
  // that, here, doesn't exist). So this reads the real ema20 reference
  // directly instead of the zone object, independent of that gate.
  const distanceBelowZonePct = Number.isFinite(ema20) && Number.isFinite(price) && price < ema20
    ? round2(((ema20 - price) / ema20) * 100) : null;

  const confirmation = computeConfirmation({ higherLows, supportHolding, rsi, rsiPrior, macdHistogram, macdHistogramPrior, aboveVwap, ema9, ema9Prior, price, rvol });

  // The 6-value real status ladder. Extension check first (never
  // encourage chasing regardless of anything else). Then real zone
  // membership. ENTRY CONFIRMED requires BOTH real price attractiveness
  // AND real confirmation AND the canonical tier/signalState already
  // being execution-ready — this is the signal-lifecycle safety rule:
  // price alone, however attractive, never overrides tier.
  // Fail-closed allowlist (real safety fix): ACTIONABLE is the only real
  // tier value that means "ready for a real entry" — an unknown/missing
  // tier (e.g. a symbol outside the canonical scan's own universe) must
  // never default to execution-ready. The prior version defaulted TRUE
  // whenever tier merely wasn't one of 3 known-bad values, which
  // silently fails OPEN for any unrecognized tier — the wrong direction
  // for a gate whose entire job is "a cheap price alone must never
  // upgrade a stock into an actionable trade."
  const executionReady = tier === "ACTIONABLE" && signalState !== "CANCELLED";
  let priceStatus;
  if (Number.isFinite(dontChaseAbove) && price > dontChaseAbove) {
    priceStatus = "EXTENDED — DON'T CHASE";
  } else if (strongBuyZone && price >= strongBuyZone.low && price <= strongBuyZone.high) {
    priceStatus = confirmation.passed && executionReady ? "ENTRY CONFIRMED" : "STRONG BUY ZONE";
  } else if (whatToPay && price >= whatToPay.low && price <= whatToPay.high) {
    priceStatus = confirmation.passed && executionReady ? "ENTRY CONFIRMED" : "IN BUY ZONE";
  } else if (whatToPay && distancePct != null && distancePct <= 3) {
    priceStatus = "APPROACHING BUY ZONE";
  } else if (
    // Real BELOW BUY ZONE case (2026-09-18, Quant Engine master prompt,
    // explicit ask: "BELOW BUY ZONE — CHECK BREAKDOWN"). Checked BEFORE
    // the WAIT FOR PRICE catch-all, and only once price has fallen a
    // genuinely meaningful amount below EMA20 (not strongBuyZone either —
    // a price still inside strongBuyZone was already handled above) so a
    // routine intraday wiggle doesn't get flagged as a structural
    // breakdown.
    (!strongBuyZone || price < strongBuyZone.low) &&
    distanceBelowZonePct != null && distanceBelowZonePct > 1
  ) {
    priceStatus = "BELOW BUY ZONE — CHECK BREAKDOWN";
  } else {
    priceStatus = "WAIT FOR PRICE";
  }

  // Real ENTRY/STOP/TARGET/R:R are deliberately NOT recomputed here —
  // the canonical decision (asset-decision.js/opportunity-engine.js's
  // entry/stop/target/riskReward, already real) is the one true source;
  // recomputing a second ATR-based version would be exactly the
  // duplicate decision engine the prompt's own architecture rule
  // forbids. computeAtrRiskLevels is used ONLY for its real `atr` value
  // above (zone width) — its own stop/target1/target2 fields are
  // intentionally discarded, never surfaced. Callers should read entry/
  // stop/target/riskReward straight off the same canonical object they
  // already pass tier/signalState from.
  return {
    available: true, atr,
    whatToPay, strongBuyZone, dontChaseAbove, antiChaseBand: antiChase?.band || null,
    distancePct, distanceBelowZonePct, priceStatus,
    confirmation,
  };
}

module.exports = { computeWhatToPay, computeConfirmation, zoneAround, MIN_CONFIRMATIONS };
