import { useState, useEffect } from "react";

// ── Learning AI, v1 — a single trading lesson of the day. Modeled on the
// existing ai-lesson endpoint's exact JSON contract (title/teach/deep/
// practice/mantra) but a new English, trading-only prompt — not the
// existing Quran/Arabic lesson content. Generates once per ET day and
// persists; deliberately the whole v1 footprint of "Learning AI," kept
// small on purpose per the approved plan's scope.
export default function TradingLessonCard({ C, MONO, SANS }) {
  const [lesson, setLesson] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | error
  const [regenerating, setRegenerating] = useState(false);

  const fetchLesson = (force) => {
    if (force) setRegenerating(true);
    fetch("/api/ai-hub/trading-lesson", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: !!force }),
    }).then(r => r.json()).then(d => {
      if (d && d.ok && d.lesson) { setLesson(d.lesson); setState("ok"); }
      else { setState("error"); }
    }).catch(() => setState("error")).finally(() => setRegenerating(false));
  };
  useEffect(() => { fetchLesson(false); }, []);

  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.shadow, padding: 14 };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: "0.04em" }}>🎓 LESSON OF THE DAY</div>
        <button onClick={() => fetchLesson(true)} disabled={regenerating}
          style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, cursor: regenerating ? "default" : "pointer",
            border: `1px solid ${C.border}`, background: "transparent", color: regenerating ? C.textDim : C.accent, opacity: regenerating ? 0.6 : 1 }}>
          {regenerating ? "…" : "↻ New Lesson"}
        </button>
      </div>
      {state === "loading" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading…</div>}
      {state === "error" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>Couldn't load a lesson — check ANTHROPIC_API_KEY is set.</div>}
      {state === "ok" && lesson && (
        <div>
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.accent, marginBottom: 6 }}>{lesson.title}</div>
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.text, lineHeight: 1.6, marginBottom: 6 }}>{lesson.teach}</div>
          {lesson.deep && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, lineHeight: 1.6, fontStyle: "italic", marginBottom: 6 }}>{lesson.deep}</div>}
          {lesson.practice && (
            <div style={{ fontFamily: SANS, fontSize: 12, color: C.text, lineHeight: 1.6, marginBottom: 6, padding: "6px 10px", background: C.surface, borderRadius: 6 }}>
              <b>Today:</b> {lesson.practice}
            </div>
          )}
          {lesson.mantra && <div style={{ fontFamily: MONO, fontSize: 12, color: C.green, fontWeight: 700, textAlign: "center", marginTop: 8 }}>"{lesson.mantra}"</div>}
        </div>
      )}
    </div>
  );
}
