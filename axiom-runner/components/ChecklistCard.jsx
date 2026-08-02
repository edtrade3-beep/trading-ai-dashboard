import { computeChecklist } from "./checklist-engine.js";

// ChecklistCard — Trade Checklist / Trade Coach, options platform
// redesign Phase 10. Pure presentation over computeChecklist()'s real
// output; all inputs are data the Charts page already has loaded
// (chart.bars, symTrend.volRatio, symNewsSentiment, symDarkPool,
// symOptionsFlow, symGamma, chart.smc) — zero new fetches.
export default function ChecklistCard({ bars, price, rvol, newsSentiment, darkPool, optionsFlow, gammaExposure, smc, C, MONO, SANS }) {
  const result = computeChecklist({ bars, price, rvol, newsSentiment, darkPool, optionsFlow, gammaExposure, smc });
  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" };
  const gradeColor = { "A+": C.green, "A": C.green, "B": C.accent, "C": C.amber, "Avoid": C.red }[result.grade] || C.textDim;

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>TRADE CHECKLIST</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{result.passCount}/{result.total}</span>
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: gradeColor, border: `1px solid ${gradeColor}55`, borderRadius: 6, padding: "2px 10px" }}>
            {result.grade}
          </span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "4px 16px" }}>
        {result.dots.map((d, i) => (
          <div key={i} title={d.detail} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "help" }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: d.pass === null ? C.textDim : d.pass ? C.green : C.red,
              opacity: d.pass === null ? 0.4 : 1,
            }} />
            <span style={{ fontFamily: SANS, fontSize: 12, color: d.pass === null ? C.textDim : C.text }}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
