// entry-engine.js — client-side twin of src/entry-engine.js. Pure,
// dependency-free math (no server-only requires), hand-ported here rather
// than fetched — same "small, stable, kept in sync via this header
// comment" discipline as mtf-combiner.js's own client twin. KEEP IN SYNC:
// any formula change goes in both files. See src/entry-engine.js for the
// full design rationale (the CRITICAL FIX this replaces, the pipeline,
// what's honestly omitted for missing data).

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

const ZONE_DEFAULTS = {
  earlyBandAtr: 0.5,
  confBandAtr: 0.5,
  retestBandAtr: 0.75,
  confirmationFraction: 0.6,
};

const SIZING_DEFAULTS = {
  earlyPct: 20,
  confirmationPct: 30,
  breakoutPct: 30,
  retestPct: 20,
};

const GATE_DEFAULTS = {
  minQualifying: 6,
  foundationFloor: 3,
  minRR: 1.5,
};

export function computeEntryZones({ price, pivot, atr, contractionLow }, opts = {}) {
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

export function computeQualifyingConditions(ev = {}) {
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

export function computeEntryStage({ price, pivot, atr, breakoutConfirmed, extended, priceAction, qualifying, zones, thresholds = {}, structureBroken }) {
  const gate = { ...GATE_DEFAULTS, ...thresholds };
  const sizing = { ...SIZING_DEFAULTS, ...thresholds };
  const pa = priceAction || {};

  if (structureBroken === true) {
    return {
      stage: "STRUCTURE_BROKEN", entryPrice: null, sizingPct: 0,
      recommendedAction: "4H structure broken — waiting for repair. No new entry (Early, Confirmation, Breakout, or Retest) until it heals back to Developing/Strong.",
    };
  }

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

export function computeEntryPlan(ev = {}, thresholds = {}) {
  const qualifying = computeQualifyingConditions(ev);
  const zones = computeEntryZones({ price: ev.price, pivot: ev.pivot, atr: ev.atr, contractionLow: ev.contractionLow }, thresholds);
  const doNotChaseZone = ev.antiChase || { band: null, label: null };
  const stageResult = computeEntryStage({
    price: ev.price, pivot: ev.pivot, atr: ev.atr, breakoutConfirmed: !!ev.breakoutConfirmed,
    extended: !!ev.extended, priceAction: ev.priceAction, qualifying, zones, thresholds,
    structureBroken: ev.swing4hState === "BROKEN",
  });

  return {
    currentPrice: Number.isFinite(ev.price) ? round2(ev.price) : null,
    pivot: Number.isFinite(ev.pivot) ? round2(ev.pivot) : null,
    earlyEntryZone: zones.earlyEntryZone,
    confirmationEntryZone: zones.confirmationEntryZone,
    breakoutTrigger: Number.isFinite(ev.pivot) ? round2(ev.pivot) : null,
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

export { ZONE_DEFAULTS, SIZING_DEFAULTS, GATE_DEFAULTS };
