// risk-lab-calc.js — server-side port of RiskLabTab.jsx's real VaR/beta/
// volatility math (client-side only until now), so command-center-ai.js can
// reuse the exact same calc instead of re-deriving it differently. Same
// simplified parametric VaR RiskLabTab.jsx already uses: per-holding
// volatility from real ATR/price (falls back to a flat 2% daily estimate
// only when there isn't enough real bar history yet), weighted by position
// size into a portfolio-level VaR 95/99 and an approximate beta.
const { round2 } = require("./utils");

// bars: real daily OHLC candles (fetchYahooBars-shaped: {high, low, close}).
function estimateVol(bars, price) {
  if (!Array.isArray(bars) || bars.length < 14 || !(price > 0)) return 0.02;
  const highs = bars.map((b) => b.high), lows = bars.map((b) => b.low), closes = bars.map((b) => b.close);
  const trs = [];
  for (let i = 1; i < Math.min(bars.length, 20); i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  const atr = trs.reduce((a, b) => a + b, 0) / trs.length;
  return atr / price;
}

// positions: [{ symbol, shares, currentPrice, avgCost }]
// barsBySymbol: { [symbol]: bars[] } — real daily candles, already fetched.
function computeRiskLab(positions, barsBySymbol) {
  const totalValue = positions.reduce((s, p) => s + p.shares * (p.currentPrice || p.avgCost || 0), 0);
  if (!totalValue) return null;

  const withVol = positions.map((p) => {
    const val = p.shares * (p.currentPrice || p.avgCost || 0);
    const weight = val / totalValue;
    const vol = estimateVol(barsBySymbol[p.symbol], p.currentPrice || p.avgCost);
    return { symbol: p.symbol, weight, vol };
  });

  const portVol = withVol.reduce((s, p) => s + p.weight * p.vol, 0);
  const var95 = totalValue * portVol * 1.645;
  const var99 = totalValue * portVol * 2.326;
  const approxBeta = withVol.reduce((s, p) => s + p.weight * (p.vol / 0.015), 0);

  return {
    totalValue: round2(totalValue),
    var95: round2(var95),
    var99: round2(var99),
    approxBeta: round2(approxBeta),
    avgDailyVolatilityPct: round2(portVol * 100),
  };
}

module.exports = { computeRiskLab, estimateVol };
