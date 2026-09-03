"use strict";
// backtest-stats.js — the real expectancy-equivalent/profit-factor/max-
// drawdown math, extracted out of autopilot2-backtest.js (2026-09-03) so
// it has zero dependency on autopilot2-engine.js. Reason: trade-gps-
// audit-store.js needs this same real math for its own getPerformanceViews
// (per the spec's "one calculation per metric" mandate — reuse, don't
// reimplement), but autopilot2-backtest.js itself requires
// autopilot2-engine.js (for isBullishCandidate/sizeEntry), and
// autopilot2-engine.js now requires trade-gps-audit-store.js — importing
// straight from autopilot2-backtest.js would have created a real circular
// require (autopilot2-engine -> trade-gps-audit-store -> autopilot2-backtest
// -> autopilot2-engine), silently leaving recordSetupEvent undefined at
// runtime. This module is the pure, dependency-free math both real
// callers share.
const { round2, average } = require("./utils");

function maxDrawdownPct(equityCurve) {
  let peak = -Infinity, worst = 0;
  for (const pt of equityCurve) {
    if (pt.equity > peak) peak = pt.equity;
    const dd = peak > 0 ? ((pt.equity - peak) / peak) * 100 : 0;
    if (dd < worst) worst = dd;
  }
  return round2(worst);
}

function buildStats(trades, equityCurve, startingEquity) {
  if (!trades.length) {
    return {
      count: 0, winRate: null, avgReturnPct: null, avgWinPct: null, avgLossPct: null,
      profitFactor: null, avgHoldingDays: null, totalReturnPct: null, maxDrawdownPct: maxDrawdownPct(equityCurve),
      totalPnl: 0,
    };
  }
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const totalPnl = round2(trades.reduce((s, t) => s + t.pnl, 0));
  const finalEquity = equityCurve.length ? equityCurve[equityCurve.length - 1].equity : startingEquity;
  return {
    count: trades.length,
    winRate: round2((wins.length / trades.length) * 100),
    avgReturnPct: round2(average(trades.map((t) => t.pnlPct))),
    avgWinPct: wins.length ? round2(average(wins.map((t) => t.pnlPct))) : null,
    avgLossPct: losses.length ? round2(average(losses.map((t) => t.pnlPct))) : null,
    profitFactor: grossLoss > 0 ? round2(grossProfit / grossLoss) : null,
    profitFactorNote: grossLoss === 0 && grossProfit > 0 ? "No losing trades in this real sample — profit factor is undefined, not infinite." : null,
    avgHoldingDays: round2(average(trades.map((t) => t.holdingDays))),
    totalReturnPct: round2(((finalEquity - startingEquity) / startingEquity) * 100),
    maxDrawdownPct: maxDrawdownPct(equityCurve),
    totalPnl,
  };
}

module.exports = { buildStats, maxDrawdownPct };
