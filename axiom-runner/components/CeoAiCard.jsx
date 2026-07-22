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
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const load = () => {
    fetch("/api/ai-hub/ceo-brief").then(r => r.json()).then(d => {
      if (d && d.ok && d.brief) { setBrief(d.brief); setState("ok"); }
      else { setState("empty"); }
    }).catch(() => setState("error"));
  };
  useEffect(load, []);

  const generate = () => {
    setGenerating(true); setError(null);
    fetch("/api/ai-hub/ceo-brief/refresh", { method: "POST" }).then(r => r.json()).then(d => {
      if (d && d.ok && d.brief) { setBrief(d.brief); setState("ok"); }
      else { setError(d?.error || "Unknown error"); setState("error"); }
    }).catch((e) => { setError(e.message || "Network error"); setState("error"); }).finally(() => setGenerating(false));
  };

  // Deliberately styled to be unmissable — gold border/glow (this app's
  // reserved "highest conviction / CEO pick" color, per the executive
  // command-center design system — every other Dashboard card uses the
  // routine info-blue accent), a filled badge instead of an outline button.
  // This is the one card meant to read as the final word, not another data
  // panel; visual hierarchy dominance is the point, not decoration.
  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.goldBg}, ${C.card} 55%)`,
      border: `2px solid ${C.gold}`,
      borderRadius: 14, padding: "18px 20px",
      boxShadow: `0 0 0 1px ${C.goldBg}, 0 12px 30px -10px ${C.goldBg}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>👔</div>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text, letterSpacing: "0.03em" }}>CEO AI</div>
            <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.gold, letterSpacing: "0.1em" }}>
              TODAY'S CALL{brief?.generatedAt && <span style={{ color: C.textDim, fontWeight: 400, letterSpacing: "normal" }}>
                {" "}· {new Date(brief.generatedAt).toLocaleString([], { hour: "2-digit", minute: "2-digit" })}
              </span>}
            </div>
          </div>
        </div>
        <button onClick={generate} disabled={generating}
          style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, cursor: generating ? "default" : "pointer",
            border: "none", background: generating ? C.surface : C.gold, color: generating ? C.textDim : "#fff", opacity: generating ? 0.7 : 1 }}>
          {generating ? "Synthesizing…" : brief ? "↻ New Call" : "Generate"}
        </button>
      </div>

      {state === "loading" && !brief && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading…</div>}
      {/* Real failure reason (e.g. a genuine usage-cap message), not a
          generic guess — a prior successful brief (if any) stays visible
          below rather than disappearing behind this. */}
      {state === "error" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.red, marginBottom: brief ? 10 : 0 }}>Couldn't generate: {error || "unknown error"}</div>}
      {state === "empty" && !brief && (
        <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, lineHeight: 1.6 }}>
          Not run yet today. Click <b style={{ color: C.text }}>Generate</b> — it reads what Scanner AI, Portfolio Risk, Macro AI, and
          Journal AI have already found and thinks like a CIO about it: what the crowd's likely missing, what the silence
          in a report actually means, and whether there's an asymmetric setup nobody flagged individually.
        </div>
      )}
      {brief && brief.aiUnavailable && (
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.amber, letterSpacing: "0.05em", marginBottom: 6 }}>⚠ REAL DATA ONLY — NO AI JUDGMENT THIS RUN</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginBottom: 10, lineHeight: 1.5 }}>
            AI synthesis unavailable{brief.aiError ? ` (${brief.aiError.slice(0, 100)})` : ""} — there's no real substitute for the CEO's cross-department judgment call, so it's honestly left blank rather than faked. Below is the same real department data that call would have been based on.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(brief.departmentReadout || []).map((d, i) => (
              <div key={i} style={{ fontFamily: MONO, fontSize: 12, color: C.textSec, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px" }}>
                <b style={{ color: C.accent }}>{d.department}:</b> {d.note}
              </div>
            ))}
          </div>
        </div>
      )}
      {brief && !brief.aiUnavailable && (
        <div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
            <div style={{ fontFamily: SANS, fontSize: 22, fontWeight: 800, color: C.text, lineHeight: 1.3, flex: 1 }}>{brief.verdict}</div>
            {brief.confidence && (
              <span style={{
                fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", padding: "4px 9px", borderRadius: 12, flexShrink: 0, marginTop: 3,
                color: brief.confidence === "HIGH" ? C.green : brief.confidence === "LOW" ? C.textDim : C.amber,
                background: brief.confidence === "HIGH" ? `${C.green}22` : brief.confidence === "LOW" ? C.surface : `${C.amber}22`,
              }}>{brief.confidence} CONF.</span>
            )}
          </div>

          {/* One line each — the spec this card is built to (executive
              command center) explicitly calls for large headlines and
              minimal paragraphs, not a written report. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.green, flexShrink: 0 }}>🎯 ACTION</span>
              <span style={{ fontFamily: SANS, fontSize: 14, color: C.text, lineHeight: 1.4 }}>{brief.topAction}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.red, flexShrink: 0 }}>⚠️ RISK</span>
              <span style={{ fontFamily: SANS, fontSize: 14, color: C.text, lineHeight: 1.4 }}>{brief.biggestRisk}</span>
            </div>
            {brief.contrarianTake && (
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.purple, flexShrink: 0 }}>🔭 TAKE</span>
                <span style={{ fontFamily: SANS, fontSize: 14, color: C.text, lineHeight: 1.4, fontStyle: "italic" }}>{brief.contrarianTake}</span>
              </div>
            )}
            {brief.flipCondition && (
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.accent, flexShrink: 0 }}>🔄 FLIPS IF</span>
                <span style={{ fontFamily: SANS, fontSize: 14, color: C.text, lineHeight: 1.4 }}>{brief.flipCondition}</span>
              </div>
            )}
          </div>

          {/* Department readout is supporting detail, not the headline —
              collapsed by default so the card stays a 5-second read. */}
          {((Array.isArray(brief.departmentReadout) && brief.departmentReadout.length > 0) || brief.reasoning) && (
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
              <button onClick={() => setShowDetail(v => !v)}
                style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                {showDetail ? "▾ HIDE DEPARTMENT DETAIL" : "▸ SHOW DEPARTMENT DETAIL"}
              </button>
              {showDetail && (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(brief.departmentReadout || []).map((d, i) => (
                    <span key={i} title={d.note} style={{ fontFamily: MONO, fontSize: 10.5, color: C.textSec, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", cursor: "help" }}>
                      <b style={{ color: C.accent }}>{d.department}:</b> {d.note}
                    </span>
                  ))}
                  {brief.reasoning && <div style={{ width: "100%", fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 6, lineHeight: 1.55, fontStyle: "italic" }}>{brief.reasoning}</div>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
