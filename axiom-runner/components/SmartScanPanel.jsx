import { useState, useEffect } from "react";

// Inline Smart Scan: SMC (structure / order blocks / FVGs / liquidity) + AI
// review, off /api/market/smc + /api/market/ai-setup-review. Shared by
// DayTradeTab and MarketTerminalTab's "🔬 Smart" detail tab.
export default function SmartScanPanel({ symbol, chart, C, MONO, SANS }) {
  const [smc, setSmc] = useState(null);
  const [state, setState] = useState("loading");
  const [review, setReview] = useState(""); const [rvState, setRvState] = useState("idle");
  useEffect(() => {
    if (!symbol) return; setState("loading"); setSmc(null); setReview(""); setRvState("idle");
    fetch("/api/market/smc?symbol=" + encodeURIComponent(symbol))
      .then(r => r.json()).then(j => { if (j.ok) { setSmc(j); setState("ok"); } else setState("none"); }).catch(() => setState("none"));
  }, [symbol]);
  const askAI = () => {
    if (!chart) return;
    setRvState("loading");
    const su = chart.setup || {};
    fetch("/api/market/ai-setup-review", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setup: { symbol, px: chart.price, chg: 0, aScore: Math.round((chart.score || 0) / 8 * 100), grade: chart.stage, marketScore: 60, marketPass: true, sector: "", relStrength: chart.rsRating, rvol: chart.volRatio, bestEntry: su.entry, stop: su.stop, rr: 2, atEntry: su.actionable } }) })
      .then(r => r.json()).then(j => { if (j.ok) { setReview(j.review); setRvState("ok"); } else setRvState("err"); }).catch(() => setRvState("err"));
  };
  const zone = (o, i, label, col) => (
    <div key={label + i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: col }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>${o.bot} – ${o.top}</span>
    </div>
  );
  const card = (title, children) => (
    <div style={{ flex: "1 1 220px", minWidth: 200, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", background: C.bg }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 900, color: C.text }}>🔬 Smart Scan — {symbol}</div>
        <button onClick={askAI} disabled={rvState === "loading" || !chart}
          style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 8, cursor: "pointer", border: `1px solid #7c5cff`, background: "rgba(124,92,255,0.14)", color: "#a78bfa" }}>
          {rvState === "loading" ? "Reviewing…" : "🤖 AI Setup Review"}
        </button>
      </div>
      {rvState === "ok" && <div style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.6, color: C.text, whiteSpace: "pre-wrap", background: "rgba(124,92,255,0.06)", border: "1px solid #7c5cff44", borderRadius: 8, padding: "10px 13px" }}>{review}</div>}
      {state === "loading" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "20px 0", textAlign: "center" }}>Loading Smart Money analysis…</div>}
      {state === "none" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "16px 0", textAlign: "center" }}>SMC data unavailable for this symbol.</div>}
      {state === "ok" && smc && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {card("MARKET STRUCTURE", (
            <>
              {smc.bos && <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: /BULL/.test(smc.bos.type) ? "#0d9465" : "#c8282a" }}>{smc.bos.label || smc.bos.type} @ ${smc.bos.level}</div>}
              {smc.choch && <div style={{ fontFamily: SANS, fontSize: 12, color: "#d6a312", marginTop: 4 }}>⚠️ CHoCH — {smc.choch.label || "trend shift"} @ ${smc.choch.level}</div>}
              {!smc.bos && !smc.choch && <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>No clear structure signal.</div>}
            </>
          ))}
          {card("ORDER BLOCKS", (smc.orderBlocks || []).length
            ? (smc.orderBlocks || []).slice(0, 5).map((o, i) => zone(o, i, /BULL/.test(o.type) ? "🟢 Bull OB" : "🔴 Bear OB", /BULL/.test(o.type) ? "#0d9465" : "#c8282a"))
            : <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>None detected.</div>)}
          {card("FAIR VALUE GAPS", (smc.fvgs || []).length
            ? (smc.fvgs || []).slice(0, 5).map((o, i) => zone(o, i, /BULL/.test(o.type) ? "🟢 Bull FVG" : "🔴 Bear FVG", /BULL/.test(o.type) ? "#0d9465" : "#c8282a"))
            : <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>None detected.</div>)}
          {smc.liquidity && (smc.liquidity.buySide || smc.liquidity.sellSide) && card("LIQUIDITY", (
            <>
              {smc.liquidity.buySide && <div style={{ fontFamily: MONO, fontSize: 11, color: "#0d9465" }}>Buy-side: ${smc.liquidity.buySide}</div>}
              {smc.liquidity.sellSide && <div style={{ fontFamily: MONO, fontSize: 11, color: "#c8282a", marginTop: 3 }}>Sell-side: ${smc.liquidity.sellSide}</div>}
            </>
          ))}
        </div>
      )}
      <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim }}>SMC = Smart Money Concepts. Order blocks = zones institutions likely traded; FVGs = price gaps that often get filled. Educational, not advice.</div>
    </div>
  );
}
