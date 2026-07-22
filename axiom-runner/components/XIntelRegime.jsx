import { useState, useEffect } from "react";
import { cardStyle } from "./ui-helpers.js";

const TAXONOMY_COLOR = {
  "Healthy Bull": "#0d9465", "Late Bull": "#22c55e", Overheated: "#d97706",
  Distribution: "#d6a312", Correction: "#f59e0b", Panic: "#c8282a", Recovery: "#2563eb",
};

// REGIME — Module 10. This does NOT compute a new regime score — it maps
// the codebase's real, already-existing regime/VIX/distribution-risk/
// persistence signals (src/x-intel-engine.js mapToRegimeTaxonomy, itself
// reading Command Center's real computeRegimeShift and Advisor AI's real
// buildRegimeDetail) onto the spec's 7-value taxonomy. Three other real
// scorers already exist in this codebase (trade-planner-scoring.js,
// advisor-ai.js, market-scanner.js) — this is a 4th consumer, not a 5th
// scorer.
export default function XIntelRegime({ C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    fetch("/api/x-intel/regime").then((r) => r.json()).then((d) => {
      if (d.ok) { setData(d); setState("ok"); } else setState("error");
    }).catch(() => setState("error"));
  }, []);

  const col = data?.taxonomy ? (TAXONOMY_COLOR[data.taxonomy.taxonomy] || C.textDim) : C.textDim;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {state === "loading" && <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Loading…</div>}
      {data?.note && <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{data.note}</div>}

      {data?.taxonomy && (
        <div style={{ background: `${col}0e`, border: `1px solid ${col}55`, borderLeft: `4px solid ${col}`, borderRadius: 4, padding: "18px 20px" }}>
          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em", marginBottom: 6 }}>MARKET REGIME</div>
          <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 900, color: col, marginBottom: 8 }}>{data.taxonomy.taxonomy}</div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>{data.taxonomy.reasoning}</div>
        </div>
      )}

      {data?.regime && (
        <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.text, marginBottom: 10 }}>REAL INPUTS</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, fontFamily: MONO, fontSize: 12 }}>
            <div><span style={{ color: C.textDim }}>Regime score</span><br /><b style={{ color: C.text, fontSize: 18 }}>{data.regime.score}/100</b> <span style={{ color: C.textDim }}>({data.regime.label})</span></div>
            <div><span style={{ color: C.textDim }}>VIX regime</span><br /><b style={{ color: C.text, fontSize: 18 }}>{data.regime.detail?.volRegime || "n/a"}</b></div>
            {data.regimeShift && (
              <div><span style={{ color: C.textDim }}>Persistence</span><br />
                <b style={{ color: C.text, fontSize: 18 }}>{data.regimeShift.justShifted ? `shifted (${data.regimeShift.severity})` : `${data.regimeShift.daysInCurrentRegime}d`}</b>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
