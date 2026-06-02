// Smart Money Concepts + Volume Profile + Liquidity Analysis Engine
// Computed from standard OHLCV daily bars — no extra API needed.

const { round2 } = require("./utils");

// ── Fair Value Gaps (FVG) ─────────────────────────────────────────────────────
// Bullish FVG: bar[i-2].high < bar[i].low  (gap between candle 1 and candle 3)
// Bearish FVG: bar[i-2].low  > bar[i].high
function detectFVGs(bars) {
  const fvgs = [];
  const recent = bars.slice(-50);
  for (let i = 2; i < recent.length; i++) {
    const a = recent[i - 2], c = recent[i];
    if (c.low > a.high) {
      fvgs.push({ type: "BULL_FVG", top: round2(c.low), bot: round2(a.high), mid: round2((c.low + a.high) / 2) });
    }
    if (c.high < a.low) {
      fvgs.push({ type: "BEAR_FVG", top: round2(a.low), bot: round2(c.high), mid: round2((a.low + c.high) / 2) });
    }
  }
  const price = bars[bars.length - 1] ? bars[bars.length - 1].close : 0;
  return fvgs.filter(f => {
    if (f.type === "BULL_FVG" && price < f.bot) return false;
    if (f.type === "BEAR_FVG" && price > f.top) return false;
    return true;
  }).slice(-6);
}

// ── Order Blocks ──────────────────────────────────────────────────────────────
function detectOrderBlocks(bars) {
  const obs = [];
  const recent = bars.slice(-40);
  for (let i = 1; i < recent.length - 1; i++) {
    const cur = recent[i], next = recent[i + 1];
    if (cur.close < cur.open && next.close > cur.high * 1.004) {
      obs.push({ type: "BULL_OB", top: round2(cur.open), bot: round2(cur.close), mid: round2((cur.open + cur.close) / 2) });
    }
    if (cur.close > cur.open && next.close < cur.low * 0.996) {
      obs.push({ type: "BEAR_OB", top: round2(cur.close), bot: round2(cur.open), mid: round2((cur.close + cur.open) / 2) });
    }
  }
  const price = bars[bars.length - 1] ? bars[bars.length - 1].close : 0;
  return obs.filter(ob => Math.abs(ob.mid - price) / Math.max(price, 1) < 0.25).slice(-4);
}

// ── Break of Structure / Change of Character ──────────────────────────────────
function detectBOSChoCh(bars) {
  const recent = bars.slice(-30);
  if (recent.length < 10) return { bos: null, choch: null };
  const swingHighs = [], swingLows = [];
  for (let i = 2; i < recent.length - 2; i++) {
    if (recent[i].high > recent[i-1].high && recent[i].high > recent[i-2].high &&
        recent[i].high > recent[i+1].high && recent[i].high > recent[i+2].high)
      swingHighs.push({ price: recent[i].high, idx: i });
    if (recent[i].low < recent[i-1].low && recent[i].low < recent[i-2].low &&
        recent[i].low < recent[i+1].low && recent[i].low < recent[i+2].low)
      swingLows.push({ price: recent[i].low, idx: i });
  }
  const price = recent[recent.length - 1].close;
  const lastHigh = swingHighs[swingHighs.length - 1];
  const lastLow  = swingLows[swingLows.length - 1];
  let bos = null, choch = null;
  if (lastHigh && price > lastHigh.price)
    bos = { type: "BULL_BOS", level: round2(lastHigh.price), label: "Bull BOS — Bullish Continuation" };
  else if (lastLow && price < lastLow.price)
    bos = { type: "BEAR_BOS", level: round2(lastLow.price), label: "Bear BOS — Bearish Continuation" };

  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const h1 = swingHighs[swingHighs.length-2], h2 = swingHighs[swingHighs.length-1];
    const l1 = swingLows[swingLows.length-2],   l2 = swingLows[swingLows.length-1];
    if (h2.price > h1.price && l2.price < l1.price)
      choch = { type: "CHOCH_BEAR", label: "ChoCh — Trend Weakening" };
    else if (l2.price < l1.price && h2.price > h1.price)
      choch = { type: "CHOCH_BULL", label: "ChoCh — Reversal Forming" };
  }
  return { bos, choch };
}

// ── Volume Profile ─────────────────────────────────────────────────────────────
function computeVolumeProfile(bars, buckets = 24) {
  if (!bars.length) return { vpoc: 0, vah: 0, val: 0, profile: [] };
  const recent = bars.slice(-60);
  const hi = Math.max(...recent.map(b => b.high));
  const lo = Math.min(...recent.map(b => b.low));
  const range = hi - lo;
  if (range <= 0) return { vpoc: 0, vah: 0, val: 0, profile: [] };
  const step = range / buckets;
  const profile = Array.from({ length: buckets }, (_, i) => ({
    price: round2(lo + step * i + step / 2), vol: 0
  }));
  for (const bar of recent) {
    const barRange = bar.high - bar.low;
    if (barRange <= 0) continue;
    for (const bucket of profile) {
      const overlap = Math.min(bar.high, bucket.price + step/2) - Math.max(bar.low, bucket.price - step/2);
      if (overlap > 0) bucket.vol += (bar.volume || 0) * (overlap / barRange);
    }
  }
  const totalVol = profile.reduce((s, b) => s + b.vol, 0) || 1;
  const sorted   = [...profile].sort((a, b) => b.vol - a.vol);
  const vpoc     = round2(sorted[0] ? sorted[0].price : 0);
  let cumVol = 0, lo2 = vpoc, hi2 = vpoc;
  for (const b of sorted) {
    if (cumVol / totalVol >= 0.70) break;
    cumVol += b.vol;
    if (b.price < lo2) lo2 = b.price;
    if (b.price > hi2) hi2 = b.price;
  }
  return {
    vpoc, vah: round2(hi2), val: round2(lo2),
    profile: profile.map(b => ({ price: b.price, vol: Math.round(b.vol), pct: round2(b.vol / totalVol * 100) }))
  };
}

// ── Liquidity Levels ──────────────────────────────────────────────────────────
function detectLiquidityLevels(bars) {
  if (bars.length < 5) return [];
  const recent = bars.slice(-30);
  const price  = recent[recent.length - 1].close;
  const levels = [];
  const pd = recent[recent.length - 2];
  if (pd) {
    levels.push({ type: "PDH", price: round2(pd.high), label: "Prev Day High", strength: "HIGH" });
    levels.push({ type: "PDL", price: round2(pd.low),  label: "Prev Day Low",  strength: "HIGH" });
  }
  const week = recent.slice(-5);
  levels.push({ type: "WH", price: round2(Math.max(...week.map(b => b.high))), label: "Weekly High", strength: "MED" });
  levels.push({ type: "WL", price: round2(Math.min(...week.map(b => b.low))),  label: "Weekly Low",  strength: "MED"  });

  // Equal highs/lows = stop clusters
  const allHighs = recent.map(b => b.high);
  const allLows  = recent.map(b => b.low);
  const eqHigh = allHighs.filter(h => allHighs.filter(h2 => Math.abs(h2-h)/h < 0.003).length >= 2);
  const eqLow  = allLows.filter(l  => allLows.filter(l2  => Math.abs(l2-l)/l < 0.003).length >= 2);
  if (eqHigh.length) {
    const avg = round2(eqHigh.reduce((a,b)=>a+b,0)/eqHigh.length);
    levels.push({ type: "EQH", price: avg, label: "Equal Highs — Stop Cluster (" + eqHigh.length + "×)", strength: "HIGH" });
  }
  if (eqLow.length) {
    const avg = round2(eqLow.reduce((a,b)=>a+b,0)/eqLow.length);
    levels.push({ type: "EQL", price: avg, label: "Equal Lows — Stop Cluster (" + eqLow.length + "×)", strength: "HIGH" });
  }
  return levels.sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price)).slice(0, 8);
}

module.exports = { detectFVGs, detectOrderBlocks, detectBOSChoCh, computeVolumeProfile, detectLiquidityLevels };
