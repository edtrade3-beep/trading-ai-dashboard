import { useState } from "react";

// ── GREEN LIGHT BACKTEST — does the 5/5 signal actually make money? ──
async function glFetchCandles(sym) {
  try {
    const d = await fetch(`/api/market/chart?symbol=${sym}&interval=1d&range=1y`).then(r => r.json());
    const res = d?.chart?.result?.[0];
    const q = res?.indicators?.quote?.[0];
    if (!q || !res?.timestamp) return null;
    const ts = res.timestamp, close = q.close, high = q.high, low = q.low, vol = q.volume;
    if (!close || close.length < 210) return null;
    return { ts, close, high, low, vol };
  } catch { return null; }
}
function glAvg(arr, a, b) { let s = 0, n = 0; for (let i = a; i <= b; i++) { if (arr[i] > 0) { s += arr[i]; n++; } } return n ? s / n : 0; }
function glSimulate(sym, c, spyMap, threshold, trades, spyTrendMap) {
  const { ts, close, high, low, vol } = c, n = close.length;
  const k = 2 / 22; const ema21 = [close[0]]; for (let i = 1; i < n; i++) ema21[i] = close[i] * k + ema21[i - 1] * (1 - k);
  let open = null;
  for (let i = 200; i < n; i++) {
    const px = close[i]; if (!(px > 0)) continue;
    const ma50 = glAvg(close, i - 49, i), ma200 = glAvg(close, i - 199, i);
    let g = 0, l = 0; for (let j = i - 13; j <= i; j++) { const dd = close[j] - close[j - 1]; dd > 0 ? g += dd : l += -dd; }
    const rsi = l === 0 ? 100 : 100 - 100 / (1 + (g / 14) / (l / 14));
    // 20-day baseline excludes today (i-20..i-1), matching the platform's
    // own daytrade-scan convention (daily.slice(-21,-1)) — including today
    // in its own average dilutes the ratio and systematically understates
    // real volume surges, silently making the rvol >= 1.2 entry check
    // harder to pass than intended.
    const av = glAvg(vol, i - 20, i - 1), rvol = av > 0 ? vol[i] / av : 1;
    let tr = 0; for (let j = i - 13; j <= i; j++) tr += Math.max(high[j] - low[j], Math.abs(high[j] - close[j - 1]), Math.abs(low[j] - close[j - 1]));
    const atr = tr / 14;
    const spy = spyMap[ts[i]] ?? 0;
    if (open) {
      // Trailing stop: let winners RUN. Ratchet the stop up to 2.5×ATR below the high, never down.
      open.hwm = Math.max(open.hwm, px);
      const trail = open.hwm - atr * 2.5;
      if (trail > open.stop) open.stop = trail;
      if (px <= open.stop) {
        const r = open.risk > 0 ? (px - open.entry) / open.risk : 0;
        trades.push({ sym, score: open.score, r, ret: (px - open.entry) / open.entry, exitTs: ts[i], regime: open.regime });
        open = null;
      }
    }
    if (!open) {
      const dev = ema21[i] > 0 ? (px - ema21[i]) / ema21[i] : 1;
      const checks = [ spy > -0.5, ma50 > 0 && px > ma50 && ma50 > ma200, rsi >= 50, rvol >= 1.2, ema21[i] > 0 && dev <= 0.08 && dev >= -0.06 ];
      const passed = checks.filter(Boolean).length;
      if (passed >= threshold && atr > 0) open = { entry: px, stop: px - atr * 1.5, risk: atr * 1.5, hwm: px, score: passed, regime: (spyTrendMap && spyTrendMap[ts[i]]) || "BULL" };
    }
  }
}

export default function GLBacktestTab({ C, MONO, SANS, watchlistSymbols }) {
  const [threshold, setThreshold] = useState(5);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const run = async () => {
    setRunning(true); setResult(null);
    const spy = await glFetchCandles("SPY");
    const spyMap = {}, spyTrendMap = {};
    if (spy) {
      for (let i = 1; i < spy.close.length; i++) if (spy.close[i - 1] > 0) spyMap[spy.ts[i]] = (spy.close[i] - spy.close[i - 1]) / spy.close[i - 1] * 100;
      // Regime per day: SPY above its 50-day MA = BULL, below = BEAR.
      for (let i = 50; i < spy.close.length; i++) { const ma = glAvg(spy.close, i - 49, i); spyTrendMap[spy.ts[i]] = spy.close[i] >= ma ? "BULL" : "BEAR"; }
    }
    const skip = new Set(["SPY","QQQ","IWM","XLK","XLE","XLF","GLD","SMH","ARKK","DIA"]);
    const syms = (watchlistSymbols || []).filter(s => !skip.has(s)).slice(0, 40);
    const trades = [];
    for (let i = 0; i < syms.length; i++) {
      setProgress(`Testing ${syms[i]} (${i + 1}/${syms.length})…`);
      const c = await glFetchCandles(syms[i]);
      if (c) glSimulate(syms[i], c, spyMap, threshold, trades, spyTrendMap);
    }
    const nT = trades.length;
    const wins = trades.filter(t => t.r > 0), losses = trades.filter(t => t.r <= 0);
    const winRate = nT ? wins.length / nT * 100 : 0;
    const avgR = nT ? trades.reduce((s, t) => s + t.r, 0) / nT : 0;
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.r, 0) / wins.length : 0;
    const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.r, 0) / losses.length) : 0;
    const pf = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : (wins.length ? 99 : 0);
    const byScore = sc => { const set = trades.filter(t => t.score === sc); if (!set.length) return null; const w = set.filter(t => t.r > 0).length; return { n: set.length, wr: Math.round(w / set.length * 100), avgR: set.reduce((s, t) => s + t.r, 0) / set.length }; };
    // Max drawdown of the cumulative-R equity curve (trades in exit order).
    const chrono = [...trades].sort((a, b) => (a.exitTs || 0) - (b.exitTs || 0));
    let cum = 0, peak = 0, maxDD = 0;
    for (const t of chrono) { cum += t.r; peak = Math.max(peak, cum); maxDD = Math.max(maxDD, peak - cum); }
    const byRegime = rg => { const set = trades.filter(t => t.regime === rg); if (!set.length) return null; const w = set.filter(t => t.r > 0).length; return { n: set.length, wr: Math.round(w / set.length * 100), avgR: set.reduce((s, t) => s + t.r, 0) / set.length }; };
    setResult({ nT, winRate, avgR, avgWin, avgLoss, pf, s4: byScore(4), s5: byScore(5), maxDD, bull: byRegime("BULL"), bear: byRegime("BEAR") });
    setRunning(false); setProgress("");
  };
  const verdict = result ? (result.avgR >= 0.2 && result.pf >= 1.3 ? { t: "✅ EDGE LOOKS REAL — worth trading", c: C.green } : result.avgR > 0 ? { t: "🟡 MARGINAL — small edge, needs more data", c: C.amber } : { t: "🔴 NO EDGE — this signal lost money historically", c: C.red }) : null;
  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", textAlign: "center", flex: 1, minWidth: 110 };
  return (
    <div style={{ padding: "16px 20px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 4 }}>🔬 GREEN LIGHT BACKTEST</div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, marginBottom: 14 }}>
        Tests the exact 5-check signal on the past year of real data across your watchlist — entries, ATR stops, trend exits — to answer the only question that matters: <b>does it make money?</b>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>BUY:</span>
        {[[5, "5/5 only"], [4, "4/5+"]].map(([n, l]) => (
          <button key={n} onClick={() => setThreshold(n)} style={{ background: threshold === n ? "#7c3aed" : C.surface, color: threshold === n ? "#fff" : C.textSec, border: `1px solid ${threshold === n ? "#7c3aed" : C.border}`, borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 11px", cursor: "pointer" }}>{l}</button>
        ))}
        <button onClick={run} disabled={running} style={{ background: running ? C.surface : C.green, color: running ? C.textDim : "#fff", border: "none", borderRadius: 7, fontFamily: MONO, fontSize: 13, fontWeight: 800, padding: "8px 18px", cursor: running ? "default" : "pointer", marginLeft: "auto" }}>
          {running ? "⏳ running…" : "▶ RUN BACKTEST"}
        </button>
      </div>
      {running && <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, marginBottom: 12 }}>{progress}</div>}
      {result && (
        <>
          <div style={{ background: `${verdict.c}12`, border: `1px solid ${verdict.c}55`, borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontFamily: MONO, fontSize: 14, fontWeight: 900, color: verdict.c, textAlign: "center" }}>{verdict.t}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={card}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>TRADES</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.text }}>{result.nT}</div></div>
            <div style={card}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>WIN RATE</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: result.winRate >= 50 ? C.green : C.amber }}>{result.winRate.toFixed(0)}%</div></div>
            <div style={card}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>AVG R/TRADE</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: result.avgR >= 0 ? C.green : C.red }}>{result.avgR >= 0 ? "+" : ""}{result.avgR.toFixed(2)}R</div></div>
            <div style={card}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>PROFIT FACTOR</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: result.pf >= 1.3 ? C.green : result.pf >= 1 ? C.amber : C.red }}>{result.pf.toFixed(2)}</div></div>
            <div style={card}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>MAX DRAWDOWN</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: result.maxDD <= 5 ? C.green : result.maxDD <= 10 ? C.amber : C.red }}>−{result.maxDD.toFixed(1)}R</div></div>
          </div>
          {/* Performance by market regime */}
          {(result.bull || result.bear) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <div style={{ ...card, textAlign: "left", borderLeft: `3px solid ${C.green}` }}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>🟢 BULL REGIME (SPY &gt; 50MA)</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.text }}>{result.bull ? `${result.bull.n} trades · ${result.bull.wr}% · ${result.bull.avgR >= 0 ? "+" : ""}${result.bull.avgR.toFixed(2)}R` : "—"}</div></div>
              <div style={{ ...card, textAlign: "left", borderLeft: `3px solid ${C.red}` }}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>🔴 BEAR REGIME (SPY &lt; 50MA)</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.text }}>{result.bear ? `${result.bear.n} trades · ${result.bear.wr}% · ${result.bear.avgR >= 0 ? "+" : ""}${result.bear.avgR.toFixed(2)}R` : "—"}</div></div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ ...card, textAlign: "left" }}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>AVG WIN / LOSS</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.text }}><span style={{ color: C.green }}>+{result.avgWin.toFixed(2)}R</span> / <span style={{ color: C.red }}>−{result.avgLoss.toFixed(2)}R</span></div></div>
            {result.s5 && <div style={{ ...card, textAlign: "left" }}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>5/5 SETUPS</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.text }}>{result.s5.n} trades · {result.s5.wr}% · {result.s5.avgR >= 0 ? "+" : ""}{result.s5.avgR.toFixed(2)}R</div></div>}
            {result.s4 && <div style={{ ...card, textAlign: "left" }}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>4/5 SETUPS</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.text }}>{result.s4.n} trades · {result.s4.wr}% · {result.s4.avgR >= 0 ? "+" : ""}{result.s4.avgR.toFixed(2)}R</div></div>}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>
            📖 <b>Reading it:</b> <b>Avg R ≥ +0.2</b> and <b>profit factor ≥ 1.3</b> = a real edge worth trading. Profit factor &lt; 1 = it lost money. Compare 5/5 vs 4/5 — if 5/5's avg R is clearly higher, stay strict. <b>Max drawdown</b> = worst peak-to-trough losing run (in R) — smaller is safer. <b>By regime</b>: it should make most of its money in the BULL regime and lose far less in BEAR — that's the proof your market filter (trade only when green) actually matters. <br/>
            ⚠️ Backtest = approximation (no slippage/spread, daily closes, ~1 year). It's a sanity check, not a guarantee. A good backtest + weeks of paper = real confidence.
          </div>
        </>
      )}
    </div>
  );
}
