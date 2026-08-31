"use strict";

// atr-risk-engine.js — real ATR-based stop/target/trailing-stop levels +
// the Anti-Chase extension-from-breakout classifier, MTF Decision System
// Phase 4 (2026-08-20). Uses the one shared atrAt (market.js) — no new
// ATR math here, just new level/classification logic on top of it.
//
// Deliberately NOT wired into risk-guardrails.js's live order-execution
// sizing (sizePositionByRisk/openRiskPct). Those functions already take
// an explicit real per-trade stop from their callers (server-autopilot.js
// passes its own structural Minervini-derived stop, not a flat
// assumption) and are shared by BOTH the Alpaca paper autopilot and the
// Tradier LIVE auto-executor — real money-moving code per that file's
// own header. Silently swapping their stop math to ATR-based as a side
// effect of "add ATR" would be exactly the kind of invasive, unrequested
// change the platform's own instructions rule out. This module is a NEW,
// additional, clearly-labeled lens for the Decision Workspace's Entry
// Map instead — real ATR levels shown alongside (not replacing) Sniper
// Decision's existing structural stop, same "label it, don't silently
// swap it" discipline as Trade Planner's Options Recommendation fix.

const { atrAt } = require("./routes/market");

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

const ATR_DEFAULTS = {
  stopMult: 1.5,
  target1R: 2,
  target2R: 3,
  target3R: 4,   // real 3rd target (2026-08-21, unified trading system spec §10: "Target 3 when appropriate") — one more R-multiple past target2, same ATR-scaled math, not a separate formula
  trailingMult: 1.5,
  atrPeriod: 14,
};

// bars: real OHLC bars ({high, low, close}, any timeframe — ATR is a
// bar-count period, not a calendar period, so this works on daily, 4H,
// or 1H bars unchanged). price: current real price to anchor levels off.
// opts.direction ("LONG"|"SHORT", default LONG, added 2026-08-31 for
// Autopilot 2.0's bidirectional trading) mirrors every level: a SHORT's
// stop sits ABOVE price and its targets sit BELOW — same ATR distance,
// opposite side, matching risk-guardrails.js's sizePositionByRisk's own
// existing direction convention.
function computeAtrRiskLevels(bars, price, opts = {}) {
  const o = { ...ATR_DEFAULTS, ...opts };
  const isShort = o.direction === "SHORT";
  if (!Array.isArray(bars) || bars.length < o.atrPeriod + 1 || !Number.isFinite(price) || price <= 0) {
    return { atr: null, stop: null, target1: null, target2: null, target3: null, trailingStop: null, riskPerShare: null, dataInsufficient: true };
  }
  const atrVal = atrAt(bars, o.atrPeriod, bars.length - 1);
  if (!Number.isFinite(atrVal) || atrVal <= 0) {
    return { atr: null, stop: null, target1: null, target2: null, target3: null, trailingStop: null, riskPerShare: null, dataInsufficient: true };
  }
  const stop = round2(isShort ? price + o.stopMult * atrVal : price - o.stopMult * atrVal);
  const riskPerShare = round2(isShort ? stop - price : price - stop);
  const target1 = round2(isShort ? price - o.target1R * riskPerShare : price + o.target1R * riskPerShare);
  const target2 = round2(isShort ? price - o.target2R * riskPerShare : price + o.target2R * riskPerShare);
  const target3 = round2(isShort ? price - o.target3R * riskPerShare : price + o.target3R * riskPerShare);
  const trailingStop = round2(isShort ? price + o.trailingMult * atrVal : price - o.trailingMult * atrVal);
  return { atr: round2(atrVal), stop, target1, target2, target3, trailingStop, riskPerShare, dataInsufficient: false };
}

// Anti-Chase — extension-from-breakout bands. Real input (extensionPct)
// is already computed server-side by buildTrendTemplate as
// row.abovePivotPct — the same % Sniper Decision's own NO_CHASE reason
// already surfaces — not a new calculation. This just adds the spec's
// explicit banding (0-3% normal / 3-5% caution / 5-8% extended / >8% do
// not chase) and "waiting for" text on top of a number that already
// exists, configurable rather than hardcoded as universal truth.
const ANTI_CHASE_DEFAULTS = { normalMax: 3, cautionMax: 5, extendedMax: 8 };

// opts.direction ("LONG"|"SHORT", default LONG, added 2026-08-31) — for a
// SHORT, extensionPct is the same kind of already-computed positive
// magnitude (how far past the breakdown level, in the unfavorable-to-
// chase direction) the caller must supply, just measured below a real
// breakdown level instead of above a real breakout — this function only
// reflects that in its band name/labels, it does not compute or flip any
// sign itself.
function computeAntiChase(extensionPct, opts = {}) {
  const o = { ...ANTI_CHASE_DEFAULTS, ...opts };
  const isShort = o.direction === "SHORT";
  const rel = isShort ? "below the breakdown" : "above the breakout";
  if (!Number.isFinite(extensionPct)) return { band: null, label: null, extensionPct: null };
  if (extensionPct <= 0) {
    return { band: isShort ? "NOT_YET_BROKEN_DOWN" : "NOT_YET_BROKEN_OUT", label: isShort ? "Price hasn't reached the breakdown level yet — no chase risk." : "Price hasn't reached the breakout level yet — no chase risk.", extensionPct: round2(extensionPct) };
  }
  if (extensionPct <= o.normalMax) {
    return { band: "NORMAL", label: `Normal — ${extensionPct.toFixed(1)}% ${rel}`, extensionPct: round2(extensionPct) };
  }
  if (extensionPct <= o.cautionMax) {
    return { band: "CAUTION", label: `Caution — ${extensionPct.toFixed(1)}% ${rel}`, extensionPct: round2(extensionPct), waitingFor: isShort ? "A bounce toward the breakdown level, or continued consolidation." : "A pullback toward the breakout level, or continued consolidation." };
  }
  if (extensionPct <= o.extendedMax) {
    return { band: "EXTENDED", label: `Extended — ${extensionPct.toFixed(1)}% ${rel}`, extensionPct: round2(extensionPct), waitingFor: isShort ? "A real bounce or retest before adding — this is already a stretched entry." : "A real pullback or retest before adding — this is already a stretched entry." };
  }
  return { band: "DO_NOT_CHASE", label: `Do not chase — ${extensionPct.toFixed(1)}% ${rel}`, extensionPct: round2(extensionPct), waitingFor: isShort ? "A bounce, retest, or a fresh breakdown — this entry is too extended to chase now." : "A pullback, retest, or a fresh base — this entry is too extended to chase now." };
}

module.exports = { computeAtrRiskLevels, computeAntiChase, ATR_DEFAULTS, ANTI_CHASE_DEFAULTS };
