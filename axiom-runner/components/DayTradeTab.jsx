import { useState, useEffect } from "react";
import ColoredIntradayChart from "./ColoredIntradayChart.jsx";
import SmartScanPanel from "./SmartScanPanel.jsx";
import TrendSetupPanel from "./TrendSetupPanel.jsx";
import { cardStyle, buttonChrome, colorForChange, formatPct } from "./ui-helpers.js";

// Intraday momentum scanner (scans 100+ stocks, top 15 by score — gap % /
// RVOL / VWAP / opening-range breakout / 9-21 EMA stack on 15m, GET
// /api/market/daytrade-scan, refreshed every 60s). Pick a row to open its
// colored intraday chart + live signal status board, an optional inline
// Smart Scan (SMC + AI review), and the swing-context trend-template
// analysis (GET /api/market/trend-template?symbol=).
export default function DayTradeTab({ C, MONO, SANS, onDeepDive }) {
  const [rows, setRows] = useState(null);
  const [state, setState] = useState("idle");
  const [gen, setGen] = useState(null);
  const [sel, setSel] = useState(null);        // symbol → inline chart
  const [selRow, setSelRow] = useState(null);  // full scan row for the status board
  const [iv, setIv] = useState("15");          // intraday interval (15-min default)
  const [showSmart, setShowSmart] = useState(false);  // inline Smart Scan toggle
  const [analysis2, setAnalysis2] = useState(null);   // trend-template for Smart Scan AI review
  const [analysis, setAnalysis] = useState(null);     // full trend-template payload for sel
  const tvTheme = (C.bg && /^#0|^#1/i.test(C.bg)) ? "dark" : "light";

  useEffect(() => {
    setShowSmart(false);
    if (!sel) { setAnalysis2(null); return; }
    fetch("/api/market/trend-template?symbol=" + encodeURIComponent(sel))
      .then(r => r.json()).then(d => { if (d && !d.error) setAnalysis2(d); }).catch(() => {});
  }, [sel]);
  useEffect(() => {
    if (!sel) { setAnalysis(null); return; }
    setAnalysis(null);
    fetch("/api/market/trend-template?symbol=" + encodeURIComponent(sel))
      .then(r => r.json()).then(d => { if (d && !d.error) setAnalysis(d); }).catch(() => {});
  }, [sel]);

  const scan = () => {
    setState(s => s === "ok" ? "ok" : "loading");
    fetch("/api/market/daytrade-scan").then(r => r.json())
      .then(j => { if (j.ok && j.rows) { setRows(j.rows); setGen(j.generatedAt); setState(j.rows.length ? "ok" : "none"); } else setState("err"); })
      .catch(() => setState(s => s === "ok" ? "ok" : "err"));
  };
  useEffect(() => { scan(); const t = setInterval(scan, 60000); return () => clearInterval(t); }, []);

  return (
    <div style={{ width: "100%", maxWidth: 1100 }}>
      <style>{`
        @keyframes dtGoPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(13,148,101,0.55); } 50% { box-shadow: 0 0 22px 4px rgba(13,148,101,0.55); } }
        @keyframes dtGoBanner { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 6 }}>
        <div>
          <div style={{ fontFamily: SANS, fontSize: 22, fontWeight: 900, color: C.text }}>⚡ Day Trade Scanner</div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Scans 100+ stocks → top 15 · 9/21 EMA (15m) · VWAP · RVOL · gap · opening-range. Auto-refreshes 1 min.</div>
        </div>
        <button onClick={scan} style={{ fontFamily: SANS, fontSize: 13, fontWeight: 800, padding: "9px 16px", borderRadius: 10, cursor: "pointer", border: "none", background: C.accent, color: "#fff" }}>↻ Rescan</button>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 12, color: C.amber, background: `${C.amber}12`, border: `1px solid ${C.amber}44`, borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
        ⚠️ Day trading is high-risk and fast — most day traders lose money. Paper-trade this until it proves out. Educational, not financial advice.
      </div>

      {sel && (
        <div style={{ marginBottom: 14, ...cardStyle(C) }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
            <span style={{ fontFamily: SANS, fontSize: 16, fontWeight: 900, color: C.text }}>{sel}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>intraday</span>
            <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
              {[["5", "5m"], ["15", "15m"], ["60", "1h"]].map(([v, l]) => (
                <button key={v} onClick={() => setIv(v)}
                  style={buttonChrome(C, { border: iv === v ? C.accent : C.border, background: iv === v ? `${C.accent}16` : "transparent", color: iv === v ? C.accent : C.textDim })}>
                  {l}
                </button>
              ))}
              <button onClick={() => setShowSmart(v => !v)} title="Smart Money analysis inline (structure, order blocks, FVGs, AI review)"
                style={buttonChrome(C, { border: C.accent, background: showSmart ? C.accent : `${C.accent}12`, color: showSmart ? "#fff" : C.accent })}>
                🔬 Smart Scan
              </button>
              <button onClick={() => setSel(null)} style={buttonChrome(C, { fontWeight: 800, fontSize: 12, padding: "4px 9px" })}>×</button>
            </div>
          </div>

          {/* ── Signal status board ── */}
          {selRow && selRow.symbol === sel && (() => {
            const r = selRow;
            const G = "#0d9465", R = "#c8282a", GR = "#6b7280", PU = "#7c5cff";
            const trend = r.bull5 ? ["BULL", G] : (r.aboveVwap ? ["MIXED", "#d6a312"] : ["BEAR", R]);
            const risk = (r.bull5 && r.aboveVwap) ? ["ON", G] : ["OFF", GR];
            const buy = (r.bull5 && r.aboveVwap && (r.orBreakout || (r.rvol || 0) >= 1.5)) ? ["READY", G] : ["WAIT", GR];
            const exit = (!r.aboveVwap || !r.bull5) ? ["EXIT", R] : ["WAIT", GR];
            const stop = ["WAIT", PU];
            const rvolCell = [(r.rvol == null ? "—" : r.rvol.toFixed(2)), (r.rvol || 0) >= 1.5 ? G : (r.rvol || 0) >= 1 ? "#d6a312" : R];
            const close = r.closeStrong ? ["STRONG", G] : ["WEAK", R];
            const cell = (label, val, col) => (
              <div style={{ background: col, borderRadius: 4, padding: "6px 4px", textAlign: "center", color: "#fff", minWidth: 0 }}>
                <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, opacity: 0.85, letterSpacing: 0.3 }}>{label}</div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{val}</div>
              </div>
            );
            const px = (v) => v == null ? "—" : "$" + v.toFixed(2);
            // ALL SYSTEMS GO — every core signal aligned.
            const allGo = r.bull5 && r.aboveVwap && r.orBreakout && (r.rvol || 0) >= 1.5 && r.closeStrong;
            return (
              <div style={{ padding: "8px 10px", background: C.card, borderBottom: `1px solid ${C.border}` }}>
                {allGo && (
                  <div style={{ textAlign: "center", fontFamily: MONO, fontSize: 13, fontWeight: 900, color: "#fff", background: G, borderRadius: 6, padding: "5px 0", marginBottom: 6, letterSpacing: 1, animation: "dtGoBanner 0.9s ease-in-out infinite" }}>
                    🟢 ALL SYSTEMS GO — every signal aligned
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, borderRadius: 8, padding: allGo ? 4 : 0,
                  border: allGo ? `2px solid ${G}` : "none", animation: allGo ? "dtGoPulse 1.1s ease-in-out infinite" : "none" }}>
                  {cell("EMA 21", px(r.ema21), G)}
                  {cell("RISK", risk[0], risk[1])}
                  {cell("BUY", buy[0], buy[1])}
                  {cell("EXIT", exit[0], exit[1])}
                  {cell("TREND", trend[0], trend[1])}
                  {cell("EMA 50", px(r.ema50), G)}
                  {cell("VWAP", px(r.vwap), r.aboveVwap ? G : R)}
                  {cell("STOP", stop[0], stop[1])}
                  {cell("RVOL", rvolCell[0], rvolCell[1])}
                  {cell("CLOSE", close[0], close[1])}
                </div>
              </div>
            );
          })()}

          <ColoredIntradayChart symbol={sel} iv={iv} C={C} MONO={MONO} SANS={SANS} />

          {/* ── Inline Smart Scan (SMC + AI review), no external navigation ── */}
          {showSmart && (
            <div style={{ padding: "12px 14px", borderTop: `1px solid ${C.border}` }}>
              <SmartScanPanel symbol={sel} chart={analysis2} C={C} MONO={MONO} SANS={SANS} />
            </div>
          )}

          {/* ── Full analysis: swing chart (TradingView live) + Trend Template setup + 8-pt checklist ── */}
          <div style={{ padding: "12px 14px", borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, marginBottom: 8 }}>📊 FULL ANALYSIS (SWING CONTEXT · DAILY)</div>
            {!analysis && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "20px 0", textAlign: "center" }}>Loading analysis…</div>}
            {analysis && (
              <div>
                <iframe key={`dt-daily-${sel}`} title="Daily chart"
                  src={`/client/tv-widget.html?w=advanced-chart&s=${encodeURIComponent(sel)}&t=${tvTheme}&h=420&iv=D&st=ema50,vwap,volume`}
                  style={{ width: "100%", height: 420, border: `1px solid ${C.border}`, borderRadius: 10, display: "block" }} />
                <TrendSetupPanel data={analysis} C={C} MONO={MONO} SANS={SANS} />
              </div>
            )}
          </div>
        </div>
      )}

      {(state === "loading" && !rows) && <div style={{ fontFamily: MONO, fontSize: 13, color: C.textDim, padding: "40px 0", textAlign: "center" }}>Scanning intraday momentum…</div>}
      {state === "err" && <div style={{ fontFamily: MONO, fontSize: 13, color: "#c8282a", padding: "20px 0", textAlign: "center" }}>⚠ Scan failed — try again (market may be closed / data delayed).</div>}
      {state === "none" && <div style={{ fontFamily: MONO, fontSize: 13, color: C.textDim, padding: "20px 0", textAlign: "center" }}>No intraday data (market likely closed). Come back during market hours.</div>}
      {(state === "ok" && rows) && (
        <div style={cardStyle(C)}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 0.9fr 1fr 1.3fr", padding: "9px 14px", background: C.card, borderBottom: `2px solid ${C.border}`, fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.textDim }}>
            <div>SYMBOL</div><div style={{ textAlign: "right" }}>PRICE</div><div style={{ textAlign: "right" }}>DAY %</div><div style={{ textAlign: "right" }}>GAP</div><div style={{ textAlign: "right" }}>RVOL</div><div style={{ textAlign: "right" }}>SIGNALS</div>
          </div>
          {rows.slice(0, 15).map((r, i) => (
            <div key={r.symbol} onClick={() => { setSel(r.symbol); setSelRow(r); }}
              style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 0.9fr 1fr 1.3fr", padding: "10px 14px", alignItems: "center", cursor: "pointer", borderBottom: i < 14 ? `1px solid ${C.border}` : "none", background: i % 2 ? "transparent" : "rgba(127,127,127,0.03)" }}>
              <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 14, color: C.text }}>{r.symbol}</div>
              <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.text }}>${r.price.toFixed(2)}</div>
              <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: colorForChange(C, r.chgPct) }}>{formatPct(r.chgPct)}</div>
              <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 12, color: colorForChange(C, r.gapPct) }}>{formatPct(r.gapPct)}</div>
              <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: r.rvol >= 1.5 ? "#f59e0b" : C.textDim }}>{r.rvol == null ? "—" : r.rvol.toFixed(1) + "×"}</div>
              <div style={{ textAlign: "right", display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                {r.orBreakout && <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: "#0d9465", background: "#0d946518", borderRadius: 4, padding: "1px 5px" }}>OR BREAK</span>}
                <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: r.aboveVwap ? "#0d9465" : "#c8282a", background: (r.aboveVwap ? "#0d9465" : "#c8282a") + "18", borderRadius: 4, padding: "1px 5px" }}>{r.aboveVwap ? "＞VWAP" : "＜VWAP"}</span>
                {r.bull15 && <span title="Price > 9EMA > 21EMA on 15-min" style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: "#0d9465", background: "#0d946518", borderRadius: 4, padding: "1px 5px" }}>9&gt;21</span>}
              </div>
            </div>
          ))}
          <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim, padding: "8px 14px" }}>
            OR BREAK = broke opening-range high · ＞VWAP = above VWAP · 9&gt;21 = price above 9EMA above 21EMA (momentum stack) on 15-min. Chart shows 9/21 EMA + VWAP. Tap a row for its chart. {gen ? "· " + new Date(gen).toLocaleTimeString() : ""}
          </div>
        </div>
      )}
    </div>
  );
}
