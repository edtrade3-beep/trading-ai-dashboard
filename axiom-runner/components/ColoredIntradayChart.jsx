// Colored intraday chart (lightweight-charts) — candles + volume + 9/21/50 EMA
// and VWAP, each a DISTINCT color (TradingView's free widget can't per-color
// same-type studies). Refreshes on symbol/interval change. Day-Trade-only.
export default function ColoredIntradayChart({ symbol, iv, C, MONO, SANS }) {
  const elRef = React.useRef(null);
  const [err, setErr] = React.useState("");
  const H = 440;
  const tf = iv === "5" ? "5M" : iv === "60" ? "1H" : "15M";
  const COL = { ema9: "#2962ff", ema21: "#ff9800", ema50: "#00c853", vwap: "#9c27b0" };
  React.useEffect(() => {
    const LC = window.LightweightCharts, el = elRef.current;
    if (!LC || !el || !symbol) return;
    el.innerHTML = ""; setErr("");
    const chart = LC.createChart(el, {
      width: el.clientWidth || 800, height: H,
      layout: { background: { color: "transparent" }, textColor: C.textDim || "#888", fontFamily: SANS },
      grid: { vertLines: { color: (C.border || "#ccc") + "44" }, horzLines: { color: (C.border || "#ccc") + "44" } },
      rightPriceScale: { borderColor: C.border || "#ccc" }, timeScale: { borderColor: C.border || "#ccc", timeVisible: true, secondsVisible: false },
    });
    const candle = chart.addCandlestickSeries({ upColor: C.green, downColor: C.red, borderUpColor: C.green, borderDownColor: C.red, wickUpColor: C.green, wickDownColor: C.red });
    const vol = chart.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" } });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    const mk = (color) => chart.addLineSeries({ color, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false });
    const s9 = mk(COL.ema9), s21 = mk(COL.ema21), s50 = mk(COL.ema50), sv = mk(COL.vwap);
    const onResize = () => chart.applyOptions({ width: el.clientWidth || 800 });
    window.addEventListener("resize", onResize);
    fetch(`/api/market/candles?ticker=${encodeURIComponent(symbol)}&timeframe=${tf}`)
      .then(r => r.json()).then(d => {
        const bars = (d.bars || []).filter(b => b && b.close);
        if (bars.length < 3) { setErr("No intraday data (market closed?)"); return; }
        const t = (ms) => Math.floor(ms / 1000);
        candle.setData(bars.map(b => ({ time: t(b.time), open: b.open, high: b.high, low: b.low, close: b.close })));
        vol.setData(bars.map(b => ({ time: t(b.time), value: b.volume || 0, color: (b.close >= b.open ? C.green : C.red) + "55" })));
        const closes = bars.map(b => b.close);
        const emaArr = (v, p) => { const k = 2 / (p + 1); let e = v[0]; const o = [e]; for (let i = 1; i < v.length; i++) { e = v[i] * k + e * (1 - k); o.push(e); } return o; };
        const setL = (s, arr) => s.setData(bars.map((b, i) => ({ time: t(b.time), value: arr[i] })));
        setL(s9, emaArr(closes, 9)); setL(s21, emaArr(closes, 21)); if (bars.length >= 50) setL(s50, emaArr(closes, 50));
        // VWAP resets each session (group by calendar day).
        let day = null, pv = 0, vv = 0; const vw = bars.map(b => { const d2 = new Date(b.time).toDateString(); if (d2 !== day) { day = d2; pv = 0; vv = 0; } const tp = (b.high + b.low + b.close) / 3; pv += tp * (b.volume || 0); vv += (b.volume || 0); return vv ? pv / vv : b.close; });
        setL(sv, vw);
        chart.timeScale().fitContent();
      }).catch(() => setErr("Chart load failed"));
    return () => { window.removeEventListener("resize", onResize); chart.remove(); };
  }, [symbol, iv, C]);
  const legend = [["EMA 9", COL.ema9], ["EMA 21", COL.ema21], ["EMA 50", COL.ema50], ["VWAP", COL.vwap]];
  return (
    <div>
      <div style={{ display: "flex", gap: 12, padding: "6px 10px", flexWrap: "wrap" }}>
        {legend.map(([l, c]) => (
          <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.textDim }}>
            <span style={{ width: 14, height: 3, background: c, borderRadius: 2, display: "inline-block" }} />{l}
          </span>
        ))}
      </div>
      {err && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "20px 0", textAlign: "center" }}>{err}</div>}
      <div ref={elRef} style={{ width: "100%", height: H, display: err ? "none" : "block" }} />
    </div>
  );
}
