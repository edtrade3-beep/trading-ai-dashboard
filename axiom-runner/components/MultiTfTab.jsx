import { useState, useEffect } from "react";
import { computeScores } from "./trading-utils.js";

export default function MultiTfTab({
  C, MONO, SANS, themeMode, multitfSymbol, terminalSymbol, watchlistData,
  multitfInput, setMultitfInput, setMultitfSymbol, multitfInds, setMultitfInds, mtfLayout, setMtfLayout,
}) {
        const tvTheme = themeMode === "dark" ? "dark" : "light";
        // Use the currently selected terminal symbol as default
        const sym = (multitfSymbol || terminalSymbol || "SPY").toUpperCase();
        // Real trend structure for computeScores below — watchlistData (from
        // /api/market/quote) never populates priceAvg50/priceAvg200/
        // yearHigh/yearLow for any Alpaca-covered symbol, which silently
        // zeroed out most of the composite score used for the alignment
        // verdict (same root cause fixed elsewhere this session).
        const [symTrend, setSymTrend] = useState(null);
        useEffect(() => {
          if (!sym) return;
          setSymTrend(null);
          fetch(`/api/market/trend-screen?symbols=${encodeURIComponent(sym)}`)
            .then(r => r.json())
            .then(j => setSymTrend((j.results || []).find(r => r.symbol === sym && !r.error) || null))
            .catch(() => {});
        }, [sym]);
        const TFS = [
          { key: "5",   label: "5M",    interval: "5",   desc: "Intraday — entries & exits" },
          { key: "15",  label: "15M",   interval: "15",  desc: "Short-term — trend confirmation" },
          { key: "60",  label: "1H",    interval: "60",  desc: "Medium-term — structure" },
          { key: "D",   label: "DAILY", interval: "D",   desc: "Big picture — direction" },
        ];
        const align = (() => {
          const wl = watchlistData.find(q => q.symbol === sym);
          if (!wl) return null;
          const scores = computeScores(wl, symTrend);
          return scores.composite >= 65 ? { txt: "✅ BULLISH ALIGNMENT", col: C.green }
               : scores.composite <= 40 ? { txt: "🔴 BEARISH ALIGNMENT", col: C.red }
               : { txt: "⚠️ MIXED — WAIT FOR CLARITY", col: C.amber };
        })();
        const mtfStudies = Object.entries(multitfInds).filter(([,v]) => v).map(([k]) => k).join(",");
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 4px", marginTop: -8 }}>
            {/* Header bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, flexWrap: "wrap" }}>
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.text }}>⏱ MULTI-TIMEFRAME</span>
              <div style={{ display: "flex", gap: 6 }}>
                <input value={multitfInput} onChange={e => setMultitfInput(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && setMultitfSymbol(multitfInput.trim() || sym)}
                  placeholder={sym}
                  style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, background: C.surface,
                    border: `1px solid ${C.accent}`, color: C.accent, borderRadius: 6,
                    padding: "5px 10px", width: 100, outline: "none" }} />
                <button onClick={() => setMultitfSymbol(multitfInput.trim() || sym)}
                  style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 6,
                    fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "5px 14px", cursor: "pointer" }}>
                  LOAD
                </button>
              </div>
              {/* Quick watchlist chips */}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {watchlistData.slice(0, 8).map(q => (
                  <button key={q.symbol} onClick={() => { setMultitfSymbol(q.symbol); setMultitfInput(q.symbol); }}
                    style={{ background: q.symbol === sym ? C.accent : C.surface,
                      color: q.symbol === sym ? "#fff" : C.textSec,
                      border: `1px solid ${q.symbol === sym ? C.accent : C.border}`,
                      borderRadius: 5, fontFamily: MONO, fontSize: 10, fontWeight: 700,
                      padding: "3px 8px", cursor: "pointer" }}>
                    {q.symbol}
                  </button>
                ))}
              </div>
              {align && (
                <div style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, fontWeight: 800,
                  color: align.col, background: `${align.col}15`, borderRadius: 6, padding: "5px 12px" }}>
                  {align.txt}
                </div>
              )}
            </div>

            {/* Indicator toggles — apply to all 4 charts */}
            <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "6px 14px",
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginRight: 4 }}>INDICATORS:</span>
              {[["RSI","RSI 14","#a78bfa"],["MACD","MACD","#3b82f6"],["BB","Bollinger","#7c3aed"],["EMA","EMA","#22d47e"],["VWAP","VWAP","#f59e0b"],["STOCH","Stoch","#0891b2"],["VOL","Volume","#6b7280"],["ATR","ATR","#ef4444"]].map(([k,label,col]) => (
                <button key={k} onClick={() => setMultitfInds(p => ({ ...p, [k]: !p[k] }))}
                  style={{ background: multitfInds[k] ? col : "transparent", color: multitfInds[k] ? "#fff" : C.textDim,
                    border: `1px solid ${multitfInds[k] ? col : C.border}`, borderRadius: 5,
                    fontFamily: MONO, fontSize: 10, fontWeight: multitfInds[k] ? 700 : 400,
                    padding: "2px 8px", cursor: "pointer" }}>
                  {label}
                </button>
              ))}
              {/* Layout toggle — right side of indicators bar */}
              <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                {[["grid","▦ 2×2"],["stack","▤ STACKED"]].map(([v,l]) => (
                  <button key={v} onClick={() => setMtfLayout(v)}
                    style={{ background: mtfLayout === v ? C.accent : "transparent", color: mtfLayout === v ? "#fff" : C.textDim,
                      border: `1px solid ${mtfLayout === v ? C.accent : C.border}`, borderRadius: 5,
                      fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "2px 8px", cursor: "pointer" }}>{l}</button>
                ))}
              </div>
            </div>

            {/* Chart Grid — fits the page (2×2 fills viewport, no scroll) */}
            <div style={{ display: "grid",
              gridTemplateColumns: mtfLayout === "stack" ? "1fr" : "1fr 1fr",
              gridTemplateRows: mtfLayout === "stack" ? "none" : "1fr 1fr",
              height: mtfLayout === "stack" ? "auto" : "calc(100vh - 230px)",
              gap: 8 }}>
              {TFS.map(tf => (
                <div key={tf.key} style={{ background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
                  {/* Chart label */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                    background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                    <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.accent }}>{sym}</span>
                    <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>{tf.label}</span>
                    <span style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>{tf.desc}</span>
                  </div>
                  <iframe
                    key={`mtf-${sym}-${tf.key}-${tvTheme}-${mtfStudies}`}
                    src={`/client/tv-widget.html?w=advanced-chart&s=${encodeURIComponent(sym)}&t=${tvTheme}&h=320&iv=${tf.interval}&st=${encodeURIComponent(mtfStudies)}`}
                    style={{ width: "100%", height: mtfLayout === "stack" ? 480 : "100%", flex: mtfLayout === "stack" ? "none" : 1, border: "none", display: "block", minHeight: 0 }}
                    title={`${sym} ${tf.label}`}
                  />
                </div>
              ))}
            </div>
          </div>
        );
}
