import { useState, useEffect } from "react";

// ── Market Intelligence — consolidates 3 data sources that already work but
// were scattered/hidden: Smart Money Brief (built, fully wired, but its tab
// had no sidebar entry or command-palette alias — literally unreachable),
// Fed sentiment (routes/fed.js, free keyword scoring, no AI cost), and
// options flow (the same flowBias/flowCallNotional/flowPutNotional state
// already computed at the top level for FlowTab — no new fetch here).
function fmtNotional(n) {
  const v = Number(n) || 0;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function MarketIntelCard({ C, MONO, SANS, flowBias, flowCallNotional, flowPutNotional, setActiveTab }) {
  const [fed, setFed] = useState(null);
  useEffect(() => {
    fetch("/api/market/fed-interpret").then(r => r.json()).then(d => { if (d && d.ok) setFed(d); }).catch(() => {});
  }, []);

  const flowColor = flowBias === "CALL BIAS" ? C.green : flowBias === "PUT BIAS" ? C.red : C.textDim;
  const fedColor = fed?.bias === "DOVISH" ? C.green : fed?.bias === "HAWKISH" ? C.red : C.amber;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.shadow, padding: 14, height: "100%" }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 10 }}>MARKET INTELLIGENCE</div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Fed stance</span>
        {fed ? (
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: fedColor }}>
            {fed.stale ? "⏳ " : ""}{fed.label}{fed.stale ? " (last meeting)" : ""}
          </span>
        ) : <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>—</span>}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Options flow</span>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: flowColor }}>
          {flowBias || "—"}{(flowCallNotional || flowPutNotional) ? ` (C ${fmtNotional(flowCallNotional)} / P ${fmtNotional(flowPutNotional)})` : ""}
        </span>
        <button onClick={() => setActiveTab?.("flow")} style={{ fontFamily: MONO, fontSize: 10, color: C.accent, background: "none", border: "none", cursor: "pointer" }}>Full Flow →</button>
      </div>

      <div style={{ padding: "10px 0 4px" }}>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, lineHeight: 1.5, marginBottom: 8 }}>
          🕵️ Smart Money Brief — dark pool, options flow, insider Form 4s, COT, and short interest, synthesized by AI.
        </div>
        <button onClick={() => setActiveTab?.("sm-brief")}
          style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 6, cursor: "pointer",
            border: `1px solid ${C.border}`, background: "transparent", color: C.accent }}>
          Full Brief →
        </button>
      </div>
    </div>
  );
}
