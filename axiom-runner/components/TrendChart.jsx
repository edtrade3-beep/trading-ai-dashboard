// Lightweight-Charts candlestick chart with MA50/150/200, Bollinger Bands,
// pivot/stop/target price lines, base-low line, AI-target line, and
// BUY/EXIT markers, plus an "Overall Rating" derived from trend score + VCP
// base quality. Shared by DayTradeTab, MarketTerminalTab, and
// TrendTemplateTab — all three render swing-context charts off the same
// /api/market/trend-template payload shape.
export default function TrendChart({ data, C, MONO, SANS, height }) {
  const elRef = React.useRef(null);
  const chartRef = React.useRef(null);
  const seriesRef = React.useRef(null);
  const symRef = React.useRef(null);
  const H = height || 520;
  const [showInfo, setShowInfo] = React.useState(false);
  const toTime = (ms) => { const d = new Date(ms); return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }; };

  // Create the chart + series once per symbol / theme / size.
  React.useEffect(() => {
    const LC = window.LightweightCharts, el = elRef.current;
    if (!LC || !el) return;
    el.innerHTML = "";
    const chart = LC.createChart(el, {
      width: el.clientWidth || 800, height: H,
      layout: { background: { color: "transparent" }, textColor: C.textDim || "#888", fontFamily: SANS },
      grid: { vertLines: { color: (C.border || "#cccccc") + "44" }, horzLines: { color: (C.border || "#cccccc") + "44" } },
      rightPriceScale: { borderColor: C.border || "#ccc" },
      timeScale: { borderColor: C.border || "#ccc" },
      crosshair: { mode: LC.CrosshairMode ? LC.CrosshairMode.Normal : 1 },
    });
    const candle = chart.addCandlestickSeries({ upColor: C.green, downColor: C.red, borderUpColor: C.green, borderDownColor: C.red, wickUpColor: C.green, wickDownColor: C.red });
    const vol = chart.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" } });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    const mk = (color, w) => chart.addLineSeries({ color, lineWidth: w, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const ma200 = mk("#c94440", 1), ma150 = mk("#d6a312", 1), ma50 = mk(C.accent, 2);
    // Bollinger Bands (20, 2σ) — the green volatility envelope in the reference chart.
    const bbU = mk("#4ea86e", 1), bbL = mk("#4ea86e", 1);
    chartRef.current = chart;
    seriesRef.current = { candle, vol, ma50, ma150, ma200, bbU, bbL, priceLines: [] };
    symRef.current = null; // force a fitContent on next data fill
    const onResize = () => chart.applyOptions({ width: el.clientWidth || 800 });
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, [data && data.symbol, C, H, SANS]);

  // Push data + overlays whenever `data` changes (keeps zoom on live refresh).
  React.useEffect(() => {
    const s = seriesRef.current, chart = chartRef.current;
    if (!s || !chart || !data || !data.bars) return;
    const bars = data.bars, n = bars.length;
    s.candle.setData(bars.map(b => ({ time: toTime(b.time), open: b.open, high: b.high, low: b.low, close: b.close })));
    s.vol.setData(bars.map(b => ({ time: toTime(b.time), value: b.volume, color: (b.close >= b.open ? C.green : C.red) + "55" })));
    const setMA = (series, arr) => series.setData(bars.map((b, i) => arr[i] == null ? null : ({ time: toTime(b.time), value: arr[i] })).filter(Boolean));
    setMA(s.ma200, data.series.ma200); setMA(s.ma150, data.series.ma150); setMA(s.ma50, data.series.ma50);

    // Bollinger Bands (20-period, 2σ) computed from closes.
    const P = 20, K = 2, closes = bars.map(b => b.close), bbUp = [], bbLo = [];
    for (let i = 0; i < n; i++) {
      if (i < P - 1) { bbUp.push(null); bbLo.push(null); continue; }
      let sum = 0; for (let j = i - P + 1; j <= i; j++) sum += closes[j];
      const mean = sum / P;
      let vv = 0; for (let j = i - P + 1; j <= i; j++) vv += (closes[j] - mean) ** 2;
      const sd = Math.sqrt(vv / P);
      bbUp.push(mean + K * sd); bbLo.push(mean - K * sd);
    }
    setMA(s.bbU, bbUp); setMA(s.bbL, bbLo);

    s.priceLines.forEach(pl => { try { s.candle.removePriceLine(pl); } catch {} }); s.priceLines = [];
    const su = data.setup, LS = window.LightweightCharts.LineStyle || {};
    if (su) {
      const pl = (price, color, title, style) => s.priceLines.push(s.candle.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }));
      pl(su.entry, C.accent, "PIVOT", LS.Dashed ?? 2);
      if (su.actionable) {
        pl(su.stop, C.red, "STOP", LS.Dashed ?? 2);
        const t1 = Math.round((su.entry + (su.entry - su.stop)) * 100) / 100;   // 1R — first scale-out
        pl(t1, "#5ab552", "T1", LS.Dotted ?? 1);
        pl(su.target2, C.green, "T2", LS.Dashed ?? 2);
        pl(su.target3, C.green, "T3", LS.Dotted ?? 1);
      }
      // Base box: bottom = contraction low. Combined with the PIVOT line above it
      // this brackets the consolidation the stock is breaking out of.
      if (su.contractionLow) pl(su.contractionLow, C.textDim, "BASE LOW", LS.Dotted ?? 1);
      // AI prediction target — MEASURED MOVE: pivot + base height (entry − base low),
      // a distinct technical objective (not the R-multiple T2). Falls back to T2.
      const aiTgt = su.contractionLow && su.entry > su.contractionLow
        ? Math.round((su.entry + (su.entry - su.contractionLow)) * 100) / 100
        : su.target2;
      if (aiTgt) pl(aiTgt, "#f59e0b", "🎯 AI TARGET", LS.Dashed ?? 2);
    }
    // BUY = most recent reclaim of the rising 50-day MA; EXIT = first close back below it.
    const ma50s = data.series.ma50 || []; let buyIdx = -1;
    for (let i = n - 1; i >= 1; i--) { if (ma50s[i] != null && ma50s[i - 1] != null && bars[i].close > ma50s[i] && bars[i - 1].close <= ma50s[i - 1]) { buyIdx = i; break; } }
    if (buyIdx === -1) for (let i = 1; i < n; i++) { if (ma50s[i] != null && bars[i].close > ma50s[i]) { buyIdx = i; break; } }
    let exitIdx = -1; if (buyIdx >= 0) for (let i = buyIdx + 2; i < n; i++) { if (ma50s[i] != null && bars[i].close < ma50s[i]) { exitIdx = i; break; } }
    // Only annotate a BUY when the stock is actually in an uptrend (Stage 2 /
    // ≥6/8). On a Stage 4 downtrend a green "BUY" arrow is misleading.
    const trendOK = (Number(data.score) || 0) >= 6 || /Stage\s*2/i.test(data.stage || "");
    const markers = [];
    if (trendOK && buyIdx >= 0) markers.push({ time: toTime(bars[buyIdx].time), position: "belowBar", color: C.green, shape: "arrowUp", text: "BUY" });
    if (exitIdx >= 0) markers.push({ time: toTime(bars[exitIdx].time), position: "aboveBar", color: C.red, shape: "arrowDown", text: "EXIT" });
    s.candle.setMarkers(markers);

    if (symRef.current !== data.symbol) { chart.timeScale().fitContent(); symRef.current = data.symbol; }
  }, [data, C]);

  if (typeof window !== "undefined" && !window.LightweightCharts) {
    return <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontSize: 12, color: C.textDim }}>Loading interactive chart…</div>;
  }
  // Overall Rating (0–100): blends trend gears (score/8) with VCP base quality,
  // then penalizes a deep base — a wide/deep base has poor breakout odds even
  // when the trend template scores well.
  const passC = Number(data && data.score) || 0;
  const vcpS = Number(data && data.setup && data.setup.report && data.setup.report.score) || 0;
  const baseDepth = Number(data && data.setup && data.setup.vcp && data.setup.vcp.baseDepth);
  // Penalty: 0 up to 25% deep, then grows; capped at −30 for very deep bases.
  const depthPenalty = Number.isFinite(baseDepth) && baseDepth > 25 ? Math.min(30, Math.round((baseDepth - 25) * 1.2)) : 0;
  const rating = Math.max(0, Math.min(100, Math.round((passC / 8) * 50 + (vcpS / 100) * 50) - depthPenalty));
  const rColor = rating >= 80 ? "#22d47e" : rating >= 60 ? "#d6a312" : rating >= 40 ? "#f59e0b" : "#ef4444";
  const rWord  = rating >= 80 ? "STRONG" : rating >= 60 ? "GOOD" : rating >= 40 ? "FAIR" : "WEAK";
  const su = data && data.setup;
  const aiTarget = su ? (su.contractionLow && su.entry > su.contractionLow
    ? Math.round((su.entry + (su.entry - su.contractionLow)) * 100) / 100
    : su.target2) : null;
  const upside = aiTarget && data.price ? Math.round(((aiTarget - data.price) / data.price) * 100) : null;
  const verdict = su && su.verdict;   // GO / WAIT / AVOID
  const vColor = verdict === "GO" ? "#22d47e" : verdict === "WAIT" ? "#d6a312" : "#ef4444";
  const glossary = [
    ["🔵 PIVOT", "Top of the recent base — buy on a break ABOVE it with volume ≥1.4× average. The breakout trigger."],
    ["⚪ BASE LOW", "Bottom of the base. If price falls back here the setup has failed — often where the stop goes."],
    ["🔴 STOP", "Where you exit if wrong — the tighter of −8% or just under the base low."],
    ["🎯 TARGETS", "T2 and T3 = 2× and 3× your risk (pivot − stop), measured up from the pivot."],
    ["🟠 AI TARGET", "Projected upside based on the trend/base quality."],
  ];
  return (
    <div style={{ position: "relative", width: "100%", height: H }}>
      <div ref={elRef} style={{ width: "100%", height: H }} />
      {/* ⓘ hover glossary — explains the levels drawn on the chart. */}
      <div
        onMouseEnter={() => setShowInfo(true)} onMouseLeave={() => setShowInfo(false)}
        onClick={() => setShowInfo(v => !v)}
        style={{ position: "absolute", top: 10, right: 60, zIndex: 5, cursor: "help",
          width: 22, height: 22, borderRadius: "50%", background: (C.card || "#fff") + "f2",
          border: `1px solid ${C.border}`, color: C.textDim, fontFamily: SANS, fontSize: 13, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 6px rgba(0,0,0,0.15)" }}>
        ⓘ
        {showInfo && (
          <div style={{ position: "absolute", top: 26, right: 0, width: 288, textAlign: "left", cursor: "default",
            background: (C.card || "#fff"), border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px",
            boxShadow: "0 6px 24px rgba(0,0,0,0.28)" }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.text, marginBottom: 6 }}>CHART LEVELS</div>
            {glossary.map(([k, v]) => (
              <div key={k} style={{ marginBottom: 6 }}>
                <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, color: C.text }}>{k}</span>
                <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec, lineHeight: 1.45 }}>{v}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {data && (
        // Top-LEFT so it never collides with the right price axis or the AI-TARGET label.
        <div style={{ position: "absolute", top: 10, left: 12, pointerEvents: "none",
          background: (C.card || "#fff") + "f2", border: `1px solid ${rColor}`, borderRadius: 12, padding: "8px 14px", boxShadow: "0 2px 10px rgba(0,0,0,0.18)", minWidth: 132 }}>
          <div style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: 1 }}>OVERALL RATING</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontFamily: SANS, fontSize: 30, fontWeight: 900, color: rColor, lineHeight: 1 }}>{rating}</span>
            <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 800, color: rColor, letterSpacing: 0.5 }}>{rWord}</span>
          </div>
          {verdict && (
            <div style={{ display: "inline-block", marginTop: 6, fontFamily: MONO, fontSize: 10, fontWeight: 800, color: "#fff", background: vColor, borderRadius: 5, padding: "2px 8px" }}>
              {verdict === "GO" ? "🟢 GO" : verdict === "WAIT" ? "🟡 WAIT" : "🔴 AVOID"}
            </div>
          )}
          {upside != null && <div style={{ fontFamily: MONO, fontSize: 10, color: "#f59e0b", marginTop: 5 }}>🎯 {upside > 0 ? "+" : ""}{upside}% to target</div>}
        </div>
      )}
    </div>
  );
}
