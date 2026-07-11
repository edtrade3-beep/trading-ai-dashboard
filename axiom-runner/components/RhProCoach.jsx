import { useState } from "react";
import { rhLoadJournal, rhSaveJournal } from "./rhpro-journal.jsx";

export default function RhProCoach({ C, MONO, SANS }) {
  const [trades, setTrades] = useState(rhLoadJournal);
  const [busy, setBusy] = useState(null);   // trade id being graded
  const gradeCol = g => /^A/.test(g) ? C.green : /^B/.test(g) ? "#5ab552" : /^C/.test(g) ? C.amber : g && g !== "?" ? C.red : C.textDim;
  const grade = async (t) => {
    setBusy(t.id);
    try {
      const r = await fetch("/api/market/ai-grade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trade: t }) });
      const d = await r.json();
      const all = rhLoadJournal().map(x => x.id === t.id ? { ...x, grade: d.ok ? d.grade : "?", feedback: d.ok ? d.feedback : `⚠ ${d.error || "error"}` } : x);
      rhSaveJournal(all); setTrades(all);
    } catch (e) {
      const all = rhLoadJournal().map(x => x.id === t.id ? { ...x, feedback: "⚠ " + e.message } : x);
      rhSaveJournal(all); setTrades(all);
    } finally { setBusy(null); }
  };
  const graded = trades.filter(t => t.grade);
  const gpa = graded.length ? (graded.reduce((s, t) => s + ({ "A+": 4.3, "A": 4, "A-": 3.7, "B+": 3.3, "B": 3, "B-": 2.7, "C+": 2.3, "C": 2, "C-": 1.7, "D": 1, "F": 0 }[t.grade] ?? 2), 0) / graded.length) : null;

  return (
    <div style={{ padding: "8px 4px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>🎓 AI TRADING COACH</div>
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>{graded.length}/{trades.length} graded{gpa != null ? ` · avg GPA ${gpa.toFixed(2)}` : ""}</div>
      </div>
      {!trades.length && <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, padding: 20, textAlign: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>No trades yet — log some in the 📓 Journal, then come back to get each one graded.</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {trades.map(t => (
          <div key={t.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${gradeCol(t.grade)}`, borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontFamily: MONO, fontSize: 40, fontWeight: 900, color: gradeCol(t.grade), minWidth: 56, textAlign: "center" }}>{t.grade || "–"}</div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.text }}>{t.symbol} <span style={{ color: t.side === "short" ? C.red : C.green, fontSize: 12 }}>{t.side}</span></div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>${t.entry} → ${t.exit} · {t.shares} sh · P&amp;L <span style={{ color: Number(t.pnl) >= 0 ? C.green : C.red }}>${Number(t.pnl).toLocaleString()}</span></div>
              </div>
              <button onClick={() => grade(t)} disabled={busy === t.id} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 14px", borderRadius: 8, cursor: "pointer", border: `1px solid ${C.accent}`, background: `${C.accent}14`, color: C.accent }}>{busy === t.id ? "⏳ grading…" : t.grade ? "↻ re-grade" : "🎓 grade"}</button>
            </div>
            {t.feedback && <div style={{ marginTop: 10, padding: "10px 12px", background: C.surface, borderRadius: 8, fontFamily: SANS, fontSize: 12.5, color: C.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{t.feedback}</div>}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 10, color: C.textDim }}>The coach rewards process over outcome — a small planned loss can grade higher than a lucky oversized win. Uses your Claude key.</div>
    </div>
  );
}
