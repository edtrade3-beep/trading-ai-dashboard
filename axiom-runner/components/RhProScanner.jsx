import { useState, useEffect } from "react";
import { RH_UNIVERSE, rhScore, rhScreenProgressive } from "./rhpro-shared.jsx";
import { computeRegime, computeAPlusScore } from "./market-helpers.js";

export default function RhProScanner({ C, MONO, SANS, macroData }) {
  const regime = computeRegime(macroData);
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(""); const [filter, setFilter] = useState(60); const [ranAt, setRanAt] = useState(null);
  const scan = () => {
    setLoading(true); setErr(""); setRows([]);
    let all = [];
    rhScreenProgressive(RH_UNIVERSE,
      (part) => {
        all = [...all, ...part.map(x => ({ ...x, score: rhScore(x), aplus: computeAPlusScore(x, regime) }))]
          .sort((a, b) => (b.score - a.score) || ((b.rsRating || 0) - (a.rsRating || 0)));
        setRows(all); setRanAt(new Date());   // render as batches arrive
      },
      () => { setLoading(false); if (!all.length) setErr("No data returned — try RESCAN in a moment."); }
    );
  };
  useEffect(() => { scan(); }, []);
  const shown = rows.filter(r => filter === "buy" ? r.atBuyPoint : r.score >= filter);
  const scoreCol = s => s >= 80 ? C.green : s >= 65 ? "#5ab552" : s >= 50 ? C.amber : C.textDim;
  const cell = { fontFamily: MONO, fontSize: 12.5, padding: "8px 10px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
  const th = { fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", padding: "6px 10px", textAlign: "left", position: "sticky", top: 0, background: C.card };

  return (
    <div style={{ padding: "8px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>🎯 AI SNIPER SCANNER</div>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>{RH_UNIVERSE.length} stocks · ranked 0–100 · {ranAt ? `scanned ${ranAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</div>
        <button onClick={scan} disabled={loading} style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: "none", color: "#fff", background: loading ? C.textDim : C.accent, cursor: loading ? "default" : "pointer" }}>{loading ? "⏳ scanning…" : "↻ RESCAN"}</button>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {[["buy", "🎯 At buy point"], [75, "≥ 75 elite"], [65, "≥ 65 strong"], [50, "≥ 50 all setups"]].map(([v, l]) => (
          <button key={String(v)} onClick={() => setFilter(v)} style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 7, cursor: "pointer", border: `1px solid ${filter === v ? C.accent : C.border}`, background: filter === v ? C.accent : C.surface, color: filter === v ? "#fff" : C.textSec }}>{l}</button>
        ))}
      </div>
      {err && <div style={{ fontFamily: SANS, fontSize: 12, color: C.red, marginBottom: 10 }}>⚠ {err}</div>}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto", maxHeight: "70vh" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            {["#", "SYMBOL", "AI SCORE", "A+ SCORE", "PRICE", "RS", "TREND (8pt)", "STAGE", "SETUP", "ENTRY → STOP"].map(h => <th key={h} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.symbol} style={{ background: i % 2 ? "transparent" : `${C.surface}55` }}>
                <td style={{ ...cell, color: C.textDim }}>{i + 1}</td>
                <td style={{ ...cell, fontWeight: 900, color: C.text }}>{r.symbol}</td>
                <td style={cell}><span style={{ fontWeight: 900, color: scoreCol(r.score) }}>{r.score}</span>{r.atBuyPoint && <span style={{ marginLeft: 6, fontSize: 10, color: C.green }}>🎯</span>}</td>
                <td style={cell}>{r.aplus && <span title={r.aplus.reasons.join(" · ")} style={{ fontWeight: 900, color: "#fff", background: r.aplus.score >= 80 ? "#0d9465" : r.aplus.score >= 60 ? "#d6a312" : "#c8282a", borderRadius: 4, padding: "1px 7px", cursor: "help" }}>{r.aplus.score}</span>}</td>
                <td style={{ ...cell, color: C.textSec }}>${Number(r.price || 0).toFixed(2)}</td>
                <td style={{ ...cell, color: (r.rsRating || 0) >= 70 ? C.green : C.textSec }}>{r.rsRating ?? "—"}</td>
                <td style={{ ...cell, color: C.textSec }}>{r.passCount ?? "?"}/8</td>
                <td style={{ ...cell, fontSize: 11, color: (r.stage || "").includes("2") ? C.green : (r.stage || "").includes("4") ? C.red : C.textDim }}>{(r.stage || "").replace(/ —.*/, "").slice(0, 18) || "—"}</td>
                <td style={{ ...cell, fontSize: 11, color: C.textSec }}>{r.atBuyPoint ? <span style={{ color: C.green, fontWeight: 700 }}>BUY ZONE</span> : (r.setupStatus || "").slice(0, 20) || "—"}</td>
                <td style={{ ...cell, fontSize: 11, color: C.textSec }}>{r.entry ? `$${Number(r.entry).toFixed(2)} → $${Number(r.stop).toFixed(2)}` : "—"}</td>
              </tr>
            ))}
            {!shown.length && !loading && <tr><td colSpan="10" style={{ ...cell, textAlign: "center", color: C.textDim }}>No setups meet this filter right now — lower the threshold or rescan.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 10, color: C.textDim }}>Score = Trend Template 50% · Relative Strength 25% · buy-zone timing 15% · volume 10%. Analysis only — execute manually.</div>
    </div>
  );
}
