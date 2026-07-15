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

  return (
    <div style={{ background: C.card, border: `1px solid ${C.accent}55`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: "0.04em" }}>
          👔 CEO AI — TODAY'S CALL
          {brief?.generatedAt && <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 400, color: C.textDim, marginLeft: 8 }}>
            {new Date(brief.generatedAt).toLocaleString([], { hour: "2-digit", minute: "2-digit" })}
          </span>}
        </div>
        <button onClick={generate} disabled={generating}
          style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, cursor: generating ? "default" : "pointer",
            border: `1px solid ${C.border}`, background: "transparent", color: generating ? C.textDim : C.accent, opacity: generating ? 0.6 : 1 }}>
          {generating ? "Synthesizing…" : brief ? "↻ New Call" : "Generate"}
        </button>
      </div>

      {state === "loading" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading…</div>}
      {state === "error" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>Couldn't generate — check ANTHROPIC_API_KEY is set.</div>}
      {state === "empty" && (
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, lineHeight: 1.5 }}>
          Not run yet today. Click Generate — it reads what Scanner AI, Portfolio Risk, Macro AI, and
          Journal AI have already found and gives you one final call, not another report.
        </div>
      )}
      {state === "ok" && brief && (
        <div>
          <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 10, lineHeight: 1.4 }}>{brief.verdict}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ padding: "8px 10px", background: C.surface, borderRadius: 6 }}>
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.green, letterSpacing: "0.05em", marginBottom: 3 }}>TOP ACTION</div>
              <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.5 }}>{brief.topAction}</div>
            </div>
            <div style={{ padding: "8px 10px", background: C.surface, borderRadius: 6 }}>
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.amber, letterSpacing: "0.05em", marginBottom: 3 }}>BIGGEST RISK</div>
              <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.5 }}>{brief.biggestRisk}</div>
            </div>
          </div>
          {brief.reasoning && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 10, lineHeight: 1.55, fontStyle: "italic" }}>{brief.reasoning}</div>}
        </div>
      )}
    </div>
  );
}
