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

// Real regression beta — OLS slope of a holding's daily returns against
// SPY's, over whatever daily bars overlap (aligned by index since both
// series come from the same fetchYahooBars call over the same lookback,
// so their trading-day calendars already line up). Real Cov(stock,SPY) /
// Var(SPY), the textbook definition — replaces the old vol-ratio proxy
// (Phase 3 of the Institutional Research Upgrade, 2026-07-29). Returns
// null (never a guess) when there isn't enough real overlapping history.
function computeRegressionBeta(stockBars, spyBars) {
  if (!Array.isArray(stockBars) || !Array.isArray(spyBars)) return null;
  const n = Math.min(stockBars.length, spyBars.length);
  if (n < 20) return null;
  const stockCloses = stockBars.slice(-n).map((b) => b.close);
  const spyCloses = spyBars.slice(-n).map((b) => b.close);
  const stockRet = [], spyRet = [];
  for (let i = 1; i < n; i++) {
    if (stockCloses[i - 1] > 0 && spyCloses[i - 1] > 0) {
      stockRet.push((stockCloses[i] - stockCloses[i - 1]) / stockCloses[i - 1]);
      spyRet.push((spyCloses[i] - spyCloses[i - 1]) / spyCloses[i - 1]);
    }
  }
  if (stockRet.length < 15) return null;
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const meanStock = mean(stockRet), meanSpy = mean(spyRet);
  let cov = 0, varSpy = 0;
  for (let i = 0; i < stockRet.length; i++) {
    cov += (stockRet[i] - meanStock) * (spyRet[i] - meanSpy);
    varSpy += (spyRet[i] - meanSpy) ** 2;
  }
  cov /= stockRet.length;
  varSpy /= stockRet.length;
  return varSpy > 0 ? cov / varSpy : null;
}

// positions: [{ symbol, shares, currentPrice, avgCost }]
// barsBySymbol: { [symbol]: bars[] } — real daily candles, already fetched.
// spyBars: real SPY daily candles over the same lookback, optional — when
// given, each holding's beta is a real regression against it; a holding
// missing enough overlapping history (new IPO, thin history) honestly
// falls back to the old vol-ratio proxy for just that one name rather than
// dropping it from the portfolio beta entirely, and gets flagged in
// `betaBySymbol` so the caller can show which numbers are real vs proxy.
function computeRiskLab(positions, barsBySymbol, spyBars) {
  const totalValue = positions.reduce((s, p) => s + p.shares * (p.currentPrice || p.avgCost || 0), 0);
  if (!totalValue) return null;

  const betaBySymbol = {};
  const withVol = positions.map((p) => {
    const val = p.shares * (p.currentPrice || p.avgCost || 0);
    const weight = val / totalValue;
    const vol = estimateVol(barsBySymbol[p.symbol], p.currentPrice || p.avgCost);
    const regressionBeta = spyBars ? computeRegressionBeta(barsBySymbol[p.symbol], spyBars) : null;
    const beta = regressionBeta != null ? regressionBeta : vol / 0.015; // proxy fallback
    betaBySymbol[p.symbol] = { beta: round2(beta), real: regressionBeta != null };
    return { symbol: p.symbol, weight, vol, beta };
  });

  const portVol = withVol.reduce((s, p) => s + p.weight * p.vol, 0);
  const var95 = totalValue * portVol * 1.645;
  const var99 = totalValue * portVol * 2.326;
  const beta = withVol.reduce((s, p) => s + p.weight * p.beta, 0);
  const betaAllReal = Object.values(betaBySymbol).every((b) => b.real);

  return {
    totalValue: round2(totalValue),
    var95: round2(var95),
    var99: round2(var99),
    beta: round2(beta),
    betaAllReal,
    betaBySymbol,
    avgDailyVolatilityPct: round2(portVol * 100),
  };
}

module.exports = { computeRiskLab, computeRegressionBeta, estimateVol };
