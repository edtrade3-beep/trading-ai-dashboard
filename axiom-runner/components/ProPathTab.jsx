import { useState, useMemo } from "react";
import { PRO_PATH } from "./academy-data.js";

export default function ProPathTab({ C, MONO, SANS, setActiveTab }) {
  const allKeys = useMemo(() => PRO_PATH.flatMap((s, si) => s.steps.map((_, i) => `${si}-${i}`)), []);
  const [done, setDone] = useState(() => { try { return JSON.parse(localStorage.getItem("propath_done")) || {}; } catch { return {}; } });
  const toggle = (k) => { const n = { ...done, [k]: !done[k] }; setDone(n); localStorage.setItem("propath_done", JSON.stringify(n)); };
  const doneCount = allKeys.filter(k => done[k]).length;
  const pct = Math.round(doneCount / allKeys.length * 100);
  // First incomplete stage = your current stage
  let currentStage = PRO_PATH.length - 1;
  for (let si = 0; si < PRO_PATH.length; si++) { if (PRO_PATH[si].steps.some((_, i) => !done[`${si}-${i}`])) { currentStage = si; break; } }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 820 }}>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.text }}>🎯 PRO PATH — your road to professional trading</div>
        <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, marginTop: 2 }}>Work through it in order. Tick each step as you complete it — your progress saves automatically.</div>
      </div>
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 12, marginBottom: 6 }}>
          <span style={{ color: C.textDim }}>Overall progress · you're on <b style={{ color: C.accent }}>Stage {currentStage + 1}</b></span>
          <span style={{ color: C.green, fontWeight: 800 }}>{doneCount}/{allKeys.length} · {pct}%</span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: `${C.textDim}22` }}>
          <div style={{ height: 8, borderRadius: 4, width: pct + "%", background: C.green, transition: "width .3s" }} />
        </div>
      </div>

      {PRO_PATH.map((s, si) => {
        const stepsDone = s.steps.filter((_, i) => done[`${si}-${i}`]).length;
        const complete = stepsDone === s.steps.length;
        const isCurrent = si === currentStage;
        return (
          <div key={si} style={{ background: C.bg, border: `1px solid ${isCurrent ? C.accent : C.border}`, borderRadius: 12, padding: 14,
            boxShadow: isCurrent ? `0 0 0 1px ${C.accent}` : "none", opacity: si > currentStage && !complete ? 0.7 : 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>{s.icon}</span>
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: complete ? C.green : C.text, flex: 1 }}>{s.stage}</span>
              {isCurrent && <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.accent, background: `${C.accent}18`, borderRadius: 5, padding: "2px 8px" }}>YOU ARE HERE</span>}
              <span style={{ fontFamily: MONO, fontSize: 11, color: complete ? C.green : C.textDim }}>{stepsDone}/{s.steps.length}</span>
            </div>
            {s.steps.map((step, i) => {
              const k = `${si}-${i}`; const isDone = done[k];
              return (
                <div key={i} onClick={() => toggle(k)} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0", cursor: "pointer",
                  borderTop: i ? `1px solid ${C.border}22` : "none" }}>
                  <div style={{ width: 19, height: 19, borderRadius: 5, flex: "0 0 19px", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1,
                    fontSize: 12, fontWeight: 800, border: `1.5px solid ${isDone ? C.green : C.border}`, background: isDone ? `${C.green}22` : "transparent", color: C.green }}>{isDone ? "✓" : ""}</div>
                  <span style={{ fontFamily: SANS, fontSize: 13, color: isDone ? C.textDim : C.text, textDecoration: isDone ? "line-through" : "none", lineHeight: 1.5 }}>{step}</span>
                </div>
              );
            })}
            {s.goto && setActiveTab && (
              <button onClick={() => setActiveTab(s.goto)} style={{ marginTop: 10, fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 6,
                border: `1px solid ${C.accent}`, background: `${C.accent}12`, color: C.accent, cursor: "pointer" }}>Open the tool for this stage →</button>
            )}
          </div>
        );
      })}
      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>
        Educational roadmap — not financial advice. There are no shortcuts: most who skip the paper-trading and risk-management stages blow up. Survive cheaply while you learn, prove an edge, then scale slowly.
      </div>
    </div>
  );
}
