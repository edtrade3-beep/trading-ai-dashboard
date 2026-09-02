"use strict";
const { computeAntiChase } = require("./atr-risk-engine");

// One adapter from a daily scan row to the evidence object consumed by the
// authoritative entry/red-flag/opportunity pipeline.
function buildEvFromRow(row, marketRegime) {
  const dailyBias = (String(row.stage || "").includes("2") && Number(row.passCount || 0) >= 6) ? "BULLISH"
    : String(row.stage || "").includes("4") ? "BEARISH" : "NEUTRAL";
  const target1 = row.entry > row.stop ? Math.round((row.entry + (row.entry - row.stop)) * 100) / 100 : null;
  const rr = Number.isFinite(row.target2) && row.entry > row.stop
    ? Math.round(((row.target2 - row.entry) / (row.entry - row.stop)) * 100) / 100 : null;
  return {
    price: row.price, pivot: row.pivot, atr: null, contractionLow: row.contractionLow,
    dailyBias, rsRating: row.rsRating, higherLows: row.higherLows, tightening: row.tightening,
    vcpVerdict: row.vcpVerdict, vwap20: row.technicals?.vwap20, rr,
    breakoutConfirmed: row.breakoutConfirmed, extended: row.extended, priceAction: {},
    antiChase: computeAntiChase(row.abovePivotPct), stop: row.stop,
    target1, target2: row.target2, marketRegime,
    riskPct: row.riskPct, dollarVolume: row.dollarVolume,
  };
}

module.exports = { buildEvFromRow };
