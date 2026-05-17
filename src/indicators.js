const { round2, average } = require("./utils");

function aggregateBars(bars, size) {
  const aggregated = [];
  for (let index = 0; index < bars.length; index += size) {
    const chunk = bars.slice(index, index + size);
    if (chunk.length < size) continue;
    aggregated.push({
      time: chunk[chunk.length - 1].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map((bar) => bar.high)),
      low: Math.min(...chunk.map((bar) => bar.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((total, bar) => total + (bar.volume || 0), 0)
    });
  }
  return aggregated;
}

function computeEMA(values, period) {
  if (!values.length) return 0;
  const smoothing = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i += 1) {
    ema = values[i] * smoothing + ema * (1 - smoothing);
  }
  return ema;
}

function computeEMASeriesFromValues(values, period) {
  if (!values.length) return [];
  const smoothing = 2 / (period + 1);
  const out = [];
  let ema = values[0];
  for (let i = 0; i < values.length; i += 1) {
    if (i === 0) ema = values[0];
    else ema = values[i] * smoothing + ema * (1 - smoothing);
    out.push(ema);
  }
  return out;
}

function computeEMASeries(bars, period) {
  if (!bars.length) return [];
  const smoothing = 2 / (period + 1);
  let ema = bars[0].close;
  const out = [];
  for (let i = 0; i < bars.length; i += 1) {
    const close = bars[i].close;
    if (i === 0) ema = close;
    else ema = close * smoothing + ema * (1 - smoothing);
    out.push({ time: bars[i].time, value: round2(ema) });
  }
  return out;
}

function computeRSI(values, period) {
  if (values.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta;
    else losses += Math.abs(delta);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period || 0.0001;
  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
  }
  const rs = avgGain / (avgLoss || 0.0001);
  return 100 - (100 / (1 + rs));
}

function computeRSISeries(bars, period = 14) {
  const closes = bars.map((b) => b.close);
  if (!closes.length) return [];
  const out = [];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (i < period) {
        out.push({ time: bars[i].time, value: 50 });
        continue;
      }
      avgGain /= period;
      avgLoss /= period;
    } else {
      avgGain = ((avgGain * (period - 1)) + gain) / period;
      avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    }
    const rs = avgGain / (avgLoss || 0.0001);
    const rsi = 100 - (100 / (1 + rs));
    out.push({ time: bars[i].time, value: round2(rsi) });
  }
  if (!out.length) return bars.map((b) => ({ time: b.time, value: 50 }));
  return out;
}

function computeVWAP(bars) {
  let totalPriceVolume = 0;
  let totalVolume = 0;
  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    const volume = bar.volume || 0;
    totalPriceVolume += typicalPrice * volume;
    totalVolume += volume;
  }
  return totalVolume ? totalPriceVolume / totalVolume : bars.at(-1)?.close || 0;
}

function computeVWAPSeries(bars) {
  let totalPV = 0;
  let totalV = 0;
  return bars.map((bar) => {
    const typical = (bar.high + bar.low + bar.close) / 3;
    const vol = bar.volume || 0;
    totalPV += typical * vol;
    totalV += vol;
    const value = totalV ? (totalPV / totalV) : bar.close;
    return { time: bar.time, value: round2(value) };
  });
}

function computeMACDSeries(bars, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (!bars.length) return { line: [], signal: [], histogram: [] };
  const closes = bars.map((b) => b.close);
  const fast = computeEMASeriesFromValues(closes, fastPeriod);
  const slow = computeEMASeriesFromValues(closes, slowPeriod);
  const lineValues = closes.map((_, i) => fast[i] - slow[i]);
  const signalValues = computeEMASeriesFromValues(lineValues, signalPeriod);
  const line = [];
  const signal = [];
  const histogram = [];
  for (let i = 0; i < bars.length; i += 1) {
    line.push({ time: bars[i].time, value: round2(lineValues[i]) });
    signal.push({ time: bars[i].time, value: round2(signalValues[i]) });
    histogram.push({ time: bars[i].time, value: round2(lineValues[i] - signalValues[i]) });
  }
  return { line, signal, histogram };
}

function detectTrend(price, ema21, ema200, closes) {
  const recent = closes.slice(-10);
  const first = recent[0] || price;
  const slope = ((price - first) / first) * 100;
  if (price > ema21 && ema21 > ema200 && slope > 1) return "Uptrend";
  if (price < ema21 && ema21 < ema200 && slope < -1) return "Downtrend";
  return "Range";
}

function detectStructure(price, highs, lows) {
  const priorHigh = Math.max(...highs.slice(-12, -2));
  const priorLow = Math.min(...lows.slice(-12, -2));
  if (price > priorHigh) return "Bullish BOS";
  if (price < priorLow) return "Bearish BOS";
  return "No clear BOS";
}

function detectDivergence(closes, rsi) {
  const recentCloses = closes.slice(-6);
  const earlierCloses = closes.slice(-12, -6);
  const recentDirection = recentCloses.at(-1) - recentCloses[0];
  const earlierDirection = earlierCloses.at(-1) - earlierCloses[0];
  if (recentDirection < 0 && earlierDirection >= 0 && rsi > 40) return "Bullish";
  if (recentDirection > 0 && earlierDirection <= 0 && rsi < 60) return "Bearish";
  return "None";
}

function detectSimpleTrend(bars) {
  if (bars.length < 8) return "Range";
  const closes = bars.map((bar) => bar.close);
  const price = closes.at(-1);
  const ema20 = computeEMA(closes, Math.min(20, closes.length));
  const ema50 = computeEMA(closes, Math.min(50, closes.length));
  if (price > ema20 && ema20 >= ema50) return "Uptrend";
  if (price < ema20 && ema20 <= ema50) return "Downtrend";
  return "Range";
}

function normalizeYield(value) {
  if (!value) return 0;
  return round2(value > 20 ? value / 10 : value);
}

module.exports = {
  aggregateBars,
  computeEMA, computeEMASeriesFromValues, computeEMASeries,
  computeRSI, computeRSISeries,
  computeVWAP, computeVWAPSeries,
  computeMACDSeries,
  detectTrend, detectStructure, detectDivergence, detectSimpleTrend,
  normalizeYield
};
