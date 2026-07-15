import { useState, useEffect } from "react";
import { rhMarkdown } from "./rhpro-shared.jsx";

// ── AI Morning Brief — the CEO-AI-shaped surface. Reuses the exact apex-cio
// flow RhProApex.jsx already built (same rhMarkdown renderer so formatting
// matches), but reads the version ai-coach.js's own weekday ~9:15 AM ET cron
// already generates and previously only sent to Telegram — free on load,
// with a manual "Refresh" button for an on-demand regeneration.
export default function AiMorningBriefCard({ C, MONO, SANS }) {
  const [brief, setBrief] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | empty | error
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    fetch("/api/ai-hub/morning-brief").then(r => r.json()).then(d => {
      if (d && d.ok && d.brief) { setBrief(d.brief); setState("ok"); }
      else { setState("empty"); }
    }).catch(() => setState("error"));
  };
  useEffect(load, []);

  const refresh = () => {
    setRefreshing(true);
    fetch("/api/ai-hub/morning-brief/refresh", { method: "POST" }).then(r => r.json()).then(d => {
      if (d && d.ok && d.brief) { setBrief(d.brief); setState("ok"); }
      else { setState("error"); }
    }).catch(() => setState("error")).finally(() => setRefreshing(false));
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: "0.04em" }}>
          🧠 AI MORNING BRIEF
          {brief?.savedAt && <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 400, color: C.textDim, marginLeft: 8 }}>
            {new Date(brief.savedAt).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}
          </span>}
        </div>
        <button onClick={refresh} disabled={refreshing}
          style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, cursor: refreshing ? "default" : "pointer",
            border: `1px solid ${C.border}`, background: "transparent", color: refreshing ? C.textDim : C.accent, opacity: refreshing ? 0.6 : 1 }}>
          {refreshing ? "Generating…" : "↻ Refresh"}
        </button>
      </div>
      {state === "loading" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "10px 0" }}>Loading…</div>}
      {state === "empty" && (
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, padding: "10px 0", lineHeight: 1.5 }}>
          No briefing generated yet today — this runs automatically on weekday mornings, or click Refresh to generate one now.
        </div>
      )}
      {state === "error" && <div style={{ fontFamily: SANS, fontSize: 12, color: C.red, padding: "10px 0" }}>Couldn't generate a briefing — check ANTHROPIC_API_KEY is set.</div>}
      {state === "ok" && brief?.report && (
        <div style={{ maxHeight: 420, overflowY: "auto" }}>{rhMarkdown(brief.report, C, MONO, SANS)}</div>
      )}
    </div>
  );
}
