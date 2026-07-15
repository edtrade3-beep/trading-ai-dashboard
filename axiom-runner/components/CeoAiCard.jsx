import { useState, useEffect } from "react";

// ── CEO AI — the real orchestration layer. Doesn't re-derive anything from
// raw market data itself (that's the Morning Brief's job); instead it
// gathers what Scanner AI, Portfolio Risk, Macro AI, Journal AI, and the
// Morning Brief already reported, and makes ONE final synthesized call.
// On-demand only for now — no automated schedule until that's explicitly
// turned on.
export default function CeoAiCard({ C, MONO, SANS }) {
  const [brief, setBrief] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | empty | error
  const [generating, setGenerating] = useState(false);

  const load = () => {
    fetch("/api/ai-hub/ceo-brief").then(r => r.json()).then(d => {
      if (d && d.ok && d.brief) { setBrief(d.brief); setState("ok"); }
      else { setState("empty"); }
    }).catch(() => setState("error"));
  };
  useEffect(load, []);

  const generate = () => {
    setGenerating(true);
    fetch("/api/ai-hub/ceo-brief/refresh", { method: "POST" }).then(r => r.json()).then(d => {
      if (d && d.ok && d.brief) { setBrief(d.brief); setState("ok"); }
      else { setState("error"); }
    }).catch(() => setState("error")).finally(() => setGenerating(false));
  };

  // Deliberately styled to be unmissable — thicker glowing border, gradient
  // tint, a filled badge instead of an outline button — every other Dashboard
  // card is a plain bordered box; this is the one card meant to look like the
  // final word, not another data panel.
  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.accentGlow}, ${C.card} 55%)`,
      border: `2px solid ${C.accent}`,
      borderRadius: 14, padding: "18px 20px",
      boxShadow: `0 0 0 1px ${C.accentGlow}, 0 12px 30px -10px ${C.accentGlow}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>👔</div>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text, letterSpacing: "0.03em" }}>CEO AI</div>
            <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.accent, letterSpacing: "0.1em" }}>
              TODAY'S CALL{brief?.generatedAt && <span style={{ color: C.textDim, fontWeight: 400, letterSpacing: "normal" }}>
                {" "}· {new Date(brief.generatedAt).toLocaleString([], { hour: "2-digit", minute: "2-digit" })}
              </span>}
            </div>
          </div>
        </div>
        <button onClick={generate} disabled={generating}
          style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, cursor: generating ? "default" : "pointer",
            border: "none", background: generating ? C.surface : C.accent, color: generating ? C.textDim : "#fff", opacity: generating ? 0.7 : 1 }}>
          {generating ? "Synthesizing…" : brief ? "↻ New Call" : "Generate"}
        </button>
      </div>

      {state === "loading" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading…</div>}
      {state === "error" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>Couldn't generate — check ANTHROPIC_API_KEY is set.</div>}
      {state === "empty" && (
        <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, lineHeight: 1.6 }}>
          Not run yet today. Click <b style={{ color: C.text }}>Generate</b> — it reads what Scanner AI, Portfolio Risk, Macro AI, and
          Journal AI have already found and gives you one final call, not another report.
        </div>
      )}
      {state === "ok" && brief && (
        <div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
            <div style={{ fontFamily: SANS, fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1.35, flex: 1 }}>{brief.verdict}</div>
            {brief.confidence && (
              <span style={{
                fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", padding: "4px 9px", borderRadius: 12, flexShrink: 0, marginTop: 3,
                color: brief.confidence === "HIGH" ? C.green : brief.confidence === "LOW" ? C.textDim : C.amber,
                background: brief.confidence === "HIGH" ? `${C.green}22` : brief.confidence === "LOW" ? C.surface : `${C.amber}22`,
              }}>{brief.confidence} CONF.</span>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ flex: "1 1 260px", padding: "10px 14px", background: C.surface, borderRadius: 8, borderLeft: `3px solid ${C.green}` }}>
              <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.green, letterSpacing: "0.06em", marginBottom: 4 }}>🎯 TOP ACTION</div>
              <div style={{ fontFamily: SANS, fontSize: 13.5, color: C.text, lineHeight: 1.55 }}>{brief.topAction}</div>
            </div>
            <div style={{ flex: "1 1 260px", padding: "10px 14px", background: C.surface, borderRadius: 8, borderLeft: `3px solid ${C.red}` }}>
              <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.red, letterSpacing: "0.06em", marginBottom: 4 }}>⚠️ BIGGEST RISK</div>
              <div style={{ fontFamily: SANS, fontSize: 13.5, color: C.text, lineHeight: 1.55 }}>{brief.biggestRisk}</div>
            </div>
          </div>

          {Array.isArray(brief.departmentReadout) && brief.departmentReadout.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em", marginBottom: 6 }}>DEPARTMENT READOUT</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {brief.departmentReadout.map((d, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, lineHeight: 1.5 }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.accent, minWidth: 150, flexShrink: 0 }}>{d.department}</span>
                    <span style={{ fontFamily: SANS, color: C.textSec }}>{d.note}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {brief.reasoning && <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.textDim, marginTop: 4, lineHeight: 1.6, fontStyle: "italic", borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>{brief.reasoning}</div>}
        </div>
      )}
    </div>
  );
}
