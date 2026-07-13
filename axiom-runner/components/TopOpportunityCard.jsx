import { useState, useEffect } from "react";
import { NUM } from "./theme.js";
import { computeRegime, computeAPlusScore, computeNextAction } from "./market-helpers.js";
import { BEST_OPP_UNIVERSE } from "./terminal-panels.jsx";

// Dashboard's "should I trade today" top-opportunity card — same scan/rank
// logic as BestOpportunities (MarketTerminalTab), but surfaces only the #1
// setup as a single punchy verdict rather than a list of 5.
export default function TopOpportunityCard({ C, MONO, SANS, macroData, setActiveTab, setTerminalSymbol }) {
  const [row, setRow] = useState(null);
  const [state, setState] = useState("idle"); // idle | loading | ok | none | err
  const regime = computeRegime(macroData);
  const regimeRef = React.useRef(regime);
  regimeRef.current = regime;

  const scan = () => {
    setState(s => s === "ok" ? "ok" : "loading");
    fetch("/api/market/trend-screen?symbols=" + encodeURIComponent(BEST_OPP_UNIVERSE.join(",")))
      .then(r => r.json())
      .then(j => {
        const res = (j.results || []).filter(r => !r.error && Number(r.entry) > Number(r.stop) && (r.passCount || 0) >= 6 && !r.extended && (r.rsRating || 0) >= 70);
        const top = res.map(r => ({ ...r, _aplus: computeAPlusScore(r, regimeRef.current) })).sort((a, b) => b._aplus.score - a._aplus.score)[0] || null;
        setRow(top); setState(top ? "ok" : "none");
      })
      .catch(() => setState(s => s === "ok" ? "ok" : "err"));
  };
  useEffect(() => {
    const kick = setTimeout(scan, 1600);
    const t = setInterval(scan, 5 * 60 * 1000);
    return () => { clearTimeout(kick); clearInterval(t); };
  }, []); // eslint-disable-line

  const goToChart = () => { if (!row) return; setTerminalSymbol && setTerminalSymbol(row.symbol); try { localStorage.setItem("mterminal_load_sym", row.symbol); } catch {} setActiveTab && setActiveTab("mterminal"); };
  const goToPlan = (e) => { e.stopPropagation(); if (!row) return; try { localStorage.setItem("tradeplanner_load_sym", row.symbol); } catch {} setActiveTab && setActiveTab("tradeplanner"); };

  return (
    <div style={{ marginBottom: 10, border: `2px solid ${C.accent}`, borderRadius: 12, background: `${C.accent}0a`, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px 0", fontFamily: SANS, fontSize: 15, fontWeight: 900, color: C.text }}>🎯 Top Opportunity</div>
      {(state === "idle" || state === "loading") && !row && (
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "8px 16px 14px" }}>Scanning market…</div>
      )}
      {state === "err" && <div style={{ fontFamily: MONO, fontSize: 12, color: "#c8282a", padding: "8px 16px 14px" }}>⚠ Scan failed — try again shortly.</div>}
      {state === "none" && <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, padding: "8px 16px 14px" }}>No clean A-setups right now — cash is a position.</div>}
      {state === "ok" && row && (() => {
        const next = computeNextAction(row);
        const ac = row._aplus.score >= 80 ? "#0d9465" : row._aplus.score >= 60 ? "#d6a312" : "#c8282a";
        return (
          <div onClick={goToChart} style={{ display: "flex", gap: 14, alignItems: "center", padding: "10px 16px 14px", cursor: "pointer", flexWrap: "wrap" }}>
            <div style={{ minWidth: 90 }}>
              <div style={{ fontFamily: SANS, fontSize: 20, fontWeight: 900, color: C.text }}>{row.symbol}</div>
              <div style={{ fontFamily: NUM, fontSize: 16, fontWeight: 700, color: C.textDim }}>${row.entry}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span title={row._aplus.reasons.join(" · ")} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: "#fff", background: ac, borderRadius: 5, padding: "2px 8px", cursor: "help" }}>A+ {row._aplus.score}</span>
              <span title={next.reason} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: "#fff", background: next.color, borderRadius: 5, padding: "2px 8px", cursor: "help" }}>{next.action}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{row.passCount}/8 template · RS {row.rsRating}</span>
            </div>
            <div style={{ display: "flex", gap: 14, fontFamily: MONO, fontSize: 12, whiteSpace: "nowrap" }}>
              <span style={{ color: C.accent }}>Buy ${row.entry}</span>
              <span style={{ color: "#c8282a" }}>Stop ${row.stop}</span>
              <span style={{ color: "#0d9465" }}>Target ${row.target2}</span>
            </div>
            <button onClick={goToPlan} title={`Plan this trade — opens Trade Planner with ${row.symbol} loaded`}
              style={{ marginLeft: "auto", flexShrink: 0, fontFamily: MONO, fontSize: 11, fontWeight: 800, border: `1px solid ${C.accent}`, background: `${C.accent}14`, color: C.accent, borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
              🎯 Plan
            </button>
          </div>
        );
      })()}
    </div>
  );
}
