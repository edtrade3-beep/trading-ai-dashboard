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

// Wilder's Average Directional Index — real trend-strength read (0-100,
// >=25 conventionally "trending", <20 "range/no trend"), plus +DI/-DI so
// the caller can also say which direction. Computed on the same daily bars
// buildTrendTemplate already fetches — no new data source (Phase 2 of the
// Institutional Research Upgrade, 2026-07-29).
function computeADX(bars, period = 14) {
  if (!Array.isArray(bars) || bars.length < period * 2) return null;
  const plusDM = [], minusDM = [], tr = [];
  for (let i = 1; i < bars.length; i += 1) {
    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    ));
  }
  // Wilder smoothing: running sum, each step = prior - prior/period + new value.
  const wilderSmooth = (values) => {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < period; i += 1) sum += values[i];
    out[period - 1] = sum;
    for (let i = period; i < values.length; i += 1) {
      sum = sum - (sum / period) + values[i];
      out[i] = sum;
    }
    return out;
  };
  const trSmooth = wilderSmooth(tr);
  const plusDMSmooth = wilderSmooth(plusDM);
  const minusDMSmooth = wilderSmooth(minusDM);

  const dx = new Array(tr.length).fill(null);
  for (let i = period - 1; i < tr.length; i += 1) {
    if (!trSmooth[i]) { dx[i] = 0; continue; }
    const plusDI = 100 * (plusDMSmooth[i] / trSmooth[i]);
    const minusDI = 100 * (minusDMSmooth[i] / trSmooth[i]);
    const sum = plusDI + minusDI;
    dx[i] = sum ? 100 * Math.abs(plusDI - minusDI) / sum : 0;
  }
  const validDx = dx.filter((v) => v != null);
  if (validDx.length < period) return null;

  let adx = average(validDx.slice(0, period));
  for (let i = period; i < validDx.length; i += 1) {
    adx = (adx * (period - 1) + validDx[i]) / period;
  }

  const lastIdx = tr.length - 1;
  const plusDI = trSmooth[lastIdx] ? 100 * (plusDMSmooth[lastIdx] / trSmooth[lastIdx]) : 0;
  const minusDI = trSmooth[lastIdx] ? 100 * (minusDMSmooth[lastIdx] / trSmooth[lastIdx]) : 0;
  const strength = adx >= 25 ? "Strong" : adx >= 20 ? "Developing" : "Weak/Range";
  const direction = plusDI > minusDI ? "Bullish" : minusDI > plusDI ? "Bearish" : "Neutral";
  return { adx: round2(adx), plusDI: round2(plusDI), minusDI: round2(minusDI), strength, direction };
}

// Donchian Channel — highest high / lowest low over the trailing window,
// plus where price sits inside that range today (0% = at the lower band,
// 100% = at the upper band). Same real daily bars, no new fetch.
function computeDonchian(bars, period = 20) {
  if (!Array.isArray(bars) || bars.length < period) return null;
  const recent = bars.slice(-period);
  const upper = Math.max(...recent.map((b) => b.high));
  const lower = Math.min(...recent.map((b) => b.low));
  const price = bars[bars.length - 1].close;
  const pctPosition = upper !== lower ? round2(((price - lower) / (upper - lower)) * 100) : 50;
  return { upper: round2(upper), lower: round2(lower), mid: round2((upper + lower) / 2), pctPosition };
}

// Bollinger Bands — 20-period SMA +/- 2 standard deviations, plus %B
// (price's position relative to the bands) and bandwidth (a real
// volatility-squeeze read: bandwidth contracting = coiling, same real idea
// VCP already tracks via ATR, just the standard indicator version). Same
// real daily bars, no new fetch.
function computeBollinger(bars, period = 20, mult = 2) {
  if (!Array.isArray(bars) || bars.length < period) return null;
  const closes = bars.map((b) => b.close);
  const recent = closes.slice(-period);
  const sma = average(recent);
  const variance = average(recent.map((c) => (c - sma) ** 2));
  const stdev = Math.sqrt(variance);
  const upper = sma + mult * stdev;
  const lower = sma - mult * stdev;
  const price = closes[closes.length - 1];
  const percentB = upper !== lower ? round2(((price - lower) / (upper - lower)) * 100) : 50;
  const bandwidthPct = sma ? round2(((upper - lower) / sma) * 100) : null;
  return { upper: round2(upper), mid: round2(sma), lower: round2(lower), percentB, bandwidthPct };
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
  computeADX, computeDonchian, computeBollinger,
  detectTrend, detectStructure, detectDivergence, detectSimpleTrend,
  normalizeYield
};
