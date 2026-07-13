import { useState, useEffect } from "react";
import { RH_UNIVERSE, rhScore, rhScreenProgressive } from "./rhpro-shared.jsx";
import { computeRegime, computeAPlusScore, computeNextAction } from "./market-helpers.js";

export default function RhProWatchlists({ C, MONO, SANS, setActiveTab, macroData }) {
  const regime = computeRegime(macroData);
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(false); const [ranAt, setRanAt] = useState(null);
  const scan = () => {
    setLoading(true); setRows([]);
    let all = [];
    rhScreenProgressive(RH_UNIVERSE,
      (part) => { all = [...all, ...part.map(x => ({ ...x, score: rhScore(x), aplus: computeAPlusScore(x, regime), next: computeNextAction(x) }))]; setRows(all); setRanAt(new Date()); },
      () => setLoading(false)
    );
  };
  useEffect(() => { scan(); }, []);
  const analyze = (sym) => { try { localStorage.setItem("mterminal_load_sym", sym); } catch {} setActiveTab && setActiveTab("mterminal"); };

  const st2 = r => (r.stage || "").includes("2");
  const st4 = r => (r.stage || "").includes("4");
  const byScore = (a, b) => b.score - a.score;
  const lists = [
    { key: "top", icon: "🏆", title: "AI TOP PICKS", desc: "Highest overall AI score", items: rows.filter(r => r.score >= 55).sort(byScore).slice(0, 10) },
    { key: "breakout", icon: "🚀", title: "BREAKOUT CANDIDATES", desc: "At/near a valid pivot", items: rows.filter(r => r.atBuyPoint || (r.actionable && Number(r.abovePivotPct || -99) >= -3)).sort(byScore).slice(0, 10) },
    { key: "momentum", icon: "⚡", title: "MOMENTUM LEADERS", desc: "RS ≥ 80 in a Stage 2 uptrend", items: rows.filter(r => (r.rsRating || 0) >= 80 && st2(r)).sort((a, b) => (b.rsRating || 0) - (a.rsRating || 0)).slice(0, 10) },
    { key: "pullback", icon: "🎯", title: "PULLBACK OPPORTUNITIES", desc: "Strong stock at its buy zone", items: rows.filter(r => r.actionable && !r.extended && !st4(r)).sort(byScore).slice(0, 10) },
    { key: "rvol", icon: "🔊", title: "HIGH RELATIVE VOLUME", desc: "Volume ≥ 1.5× average", items: rows.filter(r => (r.volRatio || 0) >= 1.5).sort((a, b) => (b.volRatio || 0) - (a.volRatio || 0)).slice(0, 10) },
    { key: "swing", icon: "📈", title: "SWING CANDIDATES", desc: "Stage 2, 6/8+ template", items: rows.filter(r => st2(r) && (r.passCount || 0) >= 6).sort(byScore).slice(0, 10) },
    { key: "volatile", icon: "🌊", title: "VOLATILE / DAY-TRADE", desc: "High volume + wide range", items: rows.filter(r => (r.volRatio || 0) >= 1.8).sort((a, b) => (b.volRatio || 0) - (a.volRatio || 0)).slice(0, 10) },
    { key: "avoid", icon: "🚫", title: "AVOID (Stage 4)", desc: "Downtrends — do not buy", items: rows.filter(st4).sort((a, b) => a.score - b.score).slice(0, 10) },
  ];

  return (
    <div style={{ padding: "8px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>📋 SMART WATCHLISTS</div>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>auto-sorted from {RH_UNIVERSE.length} stocks · {ranAt ? ranAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "…"}</div>
        <button onClick={scan} disabled={loading} style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: "none", color: "#fff", background: loading ? C.textDim : C.accent, cursor: "pointer" }}>{loading ? "⏳…" : "↻ REFRESH"}</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
        {lists.map(l => (
          <div key={l.key} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
            <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.text }}>{l.icon} {l.title}</div>
            <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginBottom: 8 }}>{l.desc}</div>
            {l.items.length ? l.items.map(r => (
              <div key={r.symbol} onClick={() => analyze(r.symbol)} title="Analyze"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 6px", borderRadius: 6, cursor: "pointer", fontFamily: MONO, fontSize: 12.5 }}
                onMouseEnter={e => e.currentTarget.style.background = C.surface} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ fontWeight: 800, color: C.text }}>{r.symbol}</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {r.next && (
                    <span title={r.next.reason} style={{ fontSize: 9, fontWeight: 900, color: r.next.color, border: `1px solid ${r.next.color}`, borderRadius: 4, padding: "1px 5px", cursor: "help" }}>{r.next.action}</span>
                  )}
                  {r.riskState && (
                    <span title="Risk level — from the VCP risk report" style={{ fontSize: 9, fontWeight: 900, color: r.riskState === "LOW" ? C.green : r.riskState === "MEDIUM" ? C.amber : C.red, border: `1px solid ${r.riskState === "LOW" ? C.green : r.riskState === "MEDIUM" ? C.amber : C.red}`, borderRadius: 4, padding: "1px 5px", cursor: "help" }}>{r.riskState}</span>
                  )}
                  {r.confidence != null && (
                    <span title="Breakout-engine confidence" style={{ fontSize: 10, fontWeight: 800, color: r.confidence >= 70 ? C.green : r.confidence >= 40 ? C.amber : C.textDim }}>{r.confidence}%</span>
                  )}
                  <span style={{ fontSize: 10, color: C.textDim }}>RS {r.rsRating ?? "—"}</span>
                  {r.aplus && (
                    <span title={r.aplus.reasons.join(" · ")} style={{ fontSize: 10, fontWeight: 900, color: "#fff", background: r.aplus.score >= 80 ? "#0d9465" : r.aplus.score >= 60 ? "#d6a312" : "#c8282a", borderRadius: 4, padding: "1px 6px", cursor: "help" }}>A+ {r.aplus.score}</span>
                  )}
                  <span style={{ fontWeight: 900, color: r.score >= 70 ? C.green : r.score >= 50 ? C.amber : C.textDim }}>{r.score}</span>
                </span>
              </div>
            )) : <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, padding: "4px 0" }}>none right now</div>}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 10, color: C.textDim }}>Tap any ticker to open the Trade Analyzer. Analysis only — no orders.</div>
    </div>
  );
}
