"use strict";

// entry-engine.js — Staged Swing-Entry System (MTF spec, 2026-08-20).
//
// CRITICAL FIX this replaces: the platform previously treated
// entryPrice === pivot unconditionally (sniper-decision.js's
// computeSniperDecision: `entry: hasEntryMath ? entry : pivot`, fed from
// _buildTrendTemplate's `const entry = pivot`). A pivot is a structural
// breakout REFERENCE, not automatically an executable entry — showing
// "Entry $227.92" next to a $175 current price read as a live, actionable
// price when it wasn't one. That bug is fixed at its root here: this
// module is the one place that decides whether there IS a real,
// executable entry price right now, and if so, what it is — pivot is
// only ever assigned to entryPrice when a real confirmed breakout makes
// it genuinely tradeable (see computeEntryStage's BREAKOUT branch).
//
// Pipeline: FOUNDATION -> EARLY -> CONFIRMATION -> BREAKOUT -> RETEST ->
// (ADD/HOLD/REDUCE/EXIT remain owned by the existing Decision Controller,
// mtf-decision-engine.js — this module does not re-implement post-entry
// state, it feeds it real pre-entry evidence). Reuses, never duplicates:
// computeAntiChase (atr-risk-engine.js) for the Do-Not-Chase read, and the
// caller's own already-computed stop/target1/target2/trailingStop
// (Sniper Decision + ATR risk levels) rather than recomputing them here.
//
// Reuses (never recomputes) computeAntiChase's real output — the caller
// passes in ev.antiChase, already computed by whichever route/component
// already calls computeAntiChase (atr-risk-engine.js) for the Entry Map's
// existing Anti-Chase badge. Kept as a pass-through, not an import, so
// this file and its client twin (axiom-runner/components/entry-engine.js)
// stay byte-identical pure math with zero server-only dependencies —
// same "hand-ported twin" discipline as day-trade-calc.js/trading-utils.js.
//
// Honesty discipline matching the rest of this codebase: any input the
// caller doesn't have (missing 1H data, no ADX, etc.) is passed as null
// and simply excluded from both the numerator and denominator of the
// qualifying-conditions count — never fabricated, never silently treated
// as a fail. Two real, spec-requested conditions could NOT be included
// with real data anywhere in this codebase today and are honestly
// omitted rather than approximated: RS Rating's own slope (no historical
// RS series is tracked point-in-time) and sector relative strength (no
// per-symbol sector-RS pipeline exists yet). ADX's "trend developing"
// condition uses the real current ADX direction/strength as a snapshot
// proxy for slope, not a true multi-point ADX series — noted here since
// it's a real, disclosed simplification, not the full "9->11->14->17"
// series read the spec describes.

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

const ZONE_DEFAULTS = {
  earlyBandAtr: 0.5,        // early entry zone = current price +/- this many ATRs
  confBandAtr: 0.5,         // confirmation zone width in ATRs
  retestBandAtr: 0.75,      // retest zone width around the pivot in ATRs
  confirmationFraction: 0.6, // how far from price toward pivot the confirmation zone centers
};

const SIZING_DEFAULTS = {
  earlyPct: 20,        // 15-25% per spec
  confirmationPct: 30, // 25-35%
  breakoutPct: 30,     // 25-35%
  retestPct: 20,       // remaining allocation
};

const GATE_DEFAULTS = {
  minQualifying: 6,     // out of however many conditions have real data (see computeQualifyingConditions)
  foundationFloor: 3,   // below minQualifying but at/above this = FOUNDATION; below this = NONE
  minRR: 1.5,
};

// Real, ATR/structure-derived zones — never hardcoded dollar bands
// unrelated to the symbol's own volatility. Requires real price/pivot/atr;
// returns nulls (not fabricated placeholders) when any input is missing.
function computeEntryZones({ price, pivot, atr, contractionLow }, opts = {}) {
  const o = { ...ZONE_DEFAULTS, ...opts };
  if (!Number.isFinite(price) || !Number.isFinite(pivot) || !Number.isFinite(atr) || atr <= 0) {
    return { earlyEntryZone: null, confirmationEntryZone: null, retestZone: null, invalidation: null };
  }
  const earlyEntryZone = [round2(price - o.earlyBandAtr * atr), round2(price + o.earlyBandAtr * atr)];
  const confCenter = price + o.confirmationFraction * (pivot - price);
  const confirmationEntryZone = [round2(confCenter - o.confBandAtr * atr), round2(confCenter + o.confBandAtr * atr)];
  const retestZone = [round2(pivot - o.retestBandAtr * atr), round2(pivot + o.retestBandAtr * atr)];
  const invalidation = Number.isFinite(contractionLow)
    ? round2(Math.min(contractionLow * 0.98, price - 2 * atr))
    : round2(price - 2.5 * atr);
  return { earlyEntryZone, confirmationEntryZone, retestZone, invalidation };
}

// Real evidence -> a real, honestly-scoped qualifying-conditions tally.
// ev fields, all real, all already computed elsewhere in this codebase —
// see this file's header for exactly where each one comes from and what
// couldn't be included.
function computeQualifyingConditions(ev = {}) {
  const checks = [];
  const add = (key, label, pass) => { if (pass != null) checks.push({ key, label, pass }); };
  add("dailyTrend", "Daily trend bullish", ev.dailyBias != null ? ev.dailyBias === "BULLISH" : null);
  add("structure4h", "4H structure developing or strong", ev.swing4hState != null ? (ev.swing4hState === "STRONG" || ev.swing4hState === "DEVELOPING") : null);
  add("momentum1h", "1H momentum improving", ev.rsiTrend1h?.direction != null ? ev.rsiTrend1h.direction === "up" : null);
  add("momentumSlope1h", "1H momentum accelerating", ev.rsiTrend1h?.accelerating != null ? ev.rsiTrend1h.accelerating === true : null);
  add("adxDeveloping", "ADX trend developing", ev.adx ? (ev.adx.direction === "Bullish" && ev.adx.strength !== "Weak") : null);
  add("rsStrength", "RS Rating ≥ 60", Number.isFinite(ev.rsRating) ? ev.rsRating >= 60 : null);
  add("volumeTrend", "1H volume participation increasing", ev.volTrend1h?.direction != null ? ev.volTrend1h.direction === "up" : null);
  add("supportHolding", "Real higher lows holding", ev.higherLows != null ? ev.higherLows === true : null);
  add("baseFormation", "Base tightening / real VCP structure", (ev.tightening != null || ev.vcpVerdict != null) ? (ev.tightening === true || (ev.vcpVerdict != null && ev.vcpVerdict !== "INVALID VCP")) : null);
  add("marketRegime", "Market regime acceptable", ev.marketRegime != null ? ev.marketRegime !== "RISK_OFF" : null);
  add("vwap", "Above 20-day VWAP", (Number.isFinite(ev.vwap20) && Number.isFinite(ev.price)) ? ev.price >= ev.vwap20 : null);
  add("riskReward", `Risk/reward ≥ ${GATE_DEFAULTS.minRR}:1`, Number.isFinite(ev.rr) ? ev.rr >= GATE_DEFAULTS.minRR : null);
  const count = checks.filter((c) => c.pass).length;
  return { count, total: checks.length, checks };
}

// The actual stage decision — the fix's core. entryPrice is null in every
// branch except the two where a real, executable price genuinely exists:
// a confirmed (and not overextended) BREAKOUT, or a held RETEST. EARLY/
// CONFIRMATION use the real current price (a starter/scaling entry at
// today's real, tradeable price), never a forward-looking number.
function computeEntryStage({ price, pivot, atr, breakoutConfirmed, extended, priceAction, qualifying, zones, thresholds = {} }) {
  const gate = { ...GATE_DEFAULTS, ...thresholds };
  const sizing = { ...SIZING_DEFAULTS, ...thresholds };
  const pa = priceAction || {};

  if (pa.failedBreakout === true) {
    return {
      stage: "FAILED_BREAKOUT", entryPrice: null, sizingPct: 0,
      recommendedAction: "Breakout failed — do not add. Wait for the setup to re-form (back to Early/Watch) or for a real Warning signal if already in a position.",
    };
  }

  if (breakoutConfirmed) {
    if (extended) {
      return {
        stage: "BREAKOUT", entryPrice: null, sizingPct: 0,
        recommendedAction: "Breakout is confirmed but price is already extended — do not chase. Wait for a pullback, retest, or a fresh base.",
      };
    }
    return {
      stage: "BREAKOUT", entryPrice: pivot, sizingPct: sizing.breakoutPct,
      recommendedAction: "Breakout confirmed on volume — the pivot is a real, executable entry now.",
    };
  }

  if (pa.retest === true && zones.retestZone && Number.isFinite(price) && price >= zones.retestZone[0] && price <= zones.retestZone[1]) {
    return {
      stage: "RETEST", entryPrice: price, sizingPct: sizing.retestPct,
      recommendedAction: "Former resistance is being tested as support and holding — add on the retest.",
    };
  }

  if (Number.isFinite(price) && Number.isFinite(pivot) && price >= pivot) {
    // Above the pivot but the breakout isn't volume-confirmed yet.
    return {
      stage: "CONFIRMATION", entryPrice: null, sizingPct: 0,
      recommendedAction: "Price is at/above the pivot but volume hasn't confirmed the breakout yet — wait for confirmation, don't chase an unconfirmed move.",
    };
  }

  if (Number.isFinite(price) && Number.isFinite(pivot) && price < pivot) {
    if (qualifying.total > 0 && qualifying.count >= gate.minQualifying) {
      const nearPivot = zones.confirmationEntryZone && price >= zones.confirmationEntryZone[0];
      if (nearPivot) {
        return {
          stage: "CONFIRMATION", entryPrice: price, sizingPct: sizing.confirmationPct,
          recommendedAction: "Structure is strengthening as price approaches the pivot — add on confirmation.",
        };
      }
      return {
        stage: "EARLY", entryPrice: price, sizingPct: sizing.earlyPct,
        recommendedAction: `Start small — ${qualifying.count}/${qualifying.total} real qualifying conditions met, the setup is genuinely developing before the pivot.`,
      };
    }
    if (qualifying.total > 0 && qualifying.count >= gate.foundationFloor) {
      return {
        stage: "FOUNDATION", entryPrice: null, sizingPct: 0,
        recommendedAction: `Wait — a base is forming (${qualifying.count}/${qualifying.total} conditions), but not enough real evidence yet for even a starter position.`,
      };
    }
    return {
      stage: "NONE", entryPrice: null, sizingPct: 0,
      recommendedAction: qualifying.total > 0
        ? `Wait — only ${qualifying.count}/${qualifying.total} real qualifying conditions met. No real evidence of improvement yet.`
        : "Wait — not enough real data yet to evaluate this setup.",
    };
  }

  return { stage: "NONE", entryPrice: null, sizingPct: 0, recommendedAction: "Wait — not enough real data yet to evaluate this setup." };
}

// Top-level composer. `ev` carries everything computeQualifyingConditions
// and the zone/stage functions need, PLUS the already-computed real
// stop/target1/target2/trailingStop (Sniper Decision + ATR risk levels)
// this function passes through rather than recomputing, and
// abovePivotPct for the real, already-built Anti-Chase read.
function computeEntryPlan(ev = {}, thresholds = {}) {
  const qualifying = computeQualifyingConditions(ev);
  const zones = computeEntryZones({ price: ev.price, pivot: ev.pivot, atr: ev.atr, contractionLow: ev.contractionLow }, thresholds);
  const doNotChaseZone = ev.antiChase || { band: null, label: null };
  const stageResult = computeEntryStage({
    price: ev.price, pivot: ev.pivot, atr: ev.atr, breakoutConfirmed: !!ev.breakoutConfirmed,
    extended: !!ev.extended, priceAction: ev.priceAction, qualifying, zones, thresholds,
  });

  return {
    currentPrice: Number.isFinite(ev.price) ? round2(ev.price) : null,
    pivot: Number.isFinite(ev.pivot) ? round2(ev.pivot) : null,
    earlyEntryZone: zones.earlyEntryZone,
    confirmationEntryZone: zones.confirmationEntryZone,
    breakoutTrigger: Number.isFinite(ev.pivot) ? round2(ev.pivot) : null, // pivot's real role: breakout/confirmation reference, never auto-assigned as entryPrice
    retestZone: zones.retestZone,
    doNotChaseZone,
    invalidation: zones.invalidation,
    stop: ev.stop ?? null, target1: ev.target1 ?? null, target2: ev.target2 ?? null, trailingStop: ev.trailingStop ?? null,
    stage: stageResult.stage,
    entryPrice: stageResult.entryPrice,
    sizingPct: stageResult.sizingPct,
    recommendedAction: stageResult.recommendedAction,
    qualifying,
  };
}

module.exports = {
  computeEntryPlan, computeEntryStage, computeEntryZones, computeQualifyingConditions,
  ZONE_DEFAULTS, SIZING_DEFAULTS, GATE_DEFAULTS,
};
