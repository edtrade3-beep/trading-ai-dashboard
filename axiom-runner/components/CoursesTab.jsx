import { useState, useMemo } from "react";
import { ACADEMY_COURSES, ACADEMY_QUIZ } from "./academy-data.js";

export default function CoursesTab({ C, MONO, SANS }) {
  const allLessonIds = useMemo(() => {
    const ids = [];
    ACADEMY_COURSES.forEach((c, ci) => c.modules.forEach((m, mi) => m.lessons.forEach((l, li) => ids.push(`${ci}-${mi}-${li}`))));
    return ids;
  }, []);
  const [done, setDone] = useState(() => { try { return JSON.parse(localStorage.getItem("academy_done")) || {}; } catch { return {}; } });
  const [openMod, setOpenMod] = useState({});
  const [openLesson, setOpenLesson] = useState({});
  const [quizPick, setQuizPick] = useState({});
  const toggleDone = (id, e) => { e.stopPropagation(); const n = { ...done, [id]: !done[id] }; setDone(n); localStorage.setItem("academy_done", JSON.stringify(n)); };
  const doneCount = allLessonIds.filter(id => done[id]).length;
  const pct = Math.round(doneCount / allLessonIds.length * 100);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 920 }}>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.text }}>🎓 ACADEMY — COMPLETE MASTERY</div>
        <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, marginTop: 2 }}>Markets Trader & US Stock Mastery · 2 courses · 16 modules · {allLessonIds.length} lessons</div>
      </div>
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 12, marginBottom: 6 }}>
          <span style={{ color: C.textDim }}>Your progress</span>
          <span style={{ color: C.green, fontWeight: 800 }}>{doneCount}/{allLessonIds.length} · {pct}%</span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: `${C.textDim}22` }}>
          <div style={{ height: 8, borderRadius: 4, width: pct + "%", background: C.green, transition: "width .3s" }} />
        </div>
      </div>

      {ACADEMY_COURSES.map((course, ci) => (
        <div key={ci} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.accent }}>{course.icon} {course.title}</div>
            <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 3 }}>{course.intro}</div>
          </div>
          {course.modules.map((mod, mi) => {
            const modKey = `${ci}-${mi}`;
            const modOpen = openMod[modKey];
            const modLessonIds = mod.lessons.map((_, li) => `${ci}-${mi}-${li}`);
            const modDone = modLessonIds.filter(id => done[id]).length;
            return (
              <div key={mi} style={{ borderTop: `1px solid ${C.border}` }}>
                <div onClick={() => setOpenMod(p => ({ ...p, [modKey]: !p[modKey] }))}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", cursor: "pointer", background: modOpen ? `${C.accent}08` : "transparent" }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{modOpen ? "▼" : "▸"}</span>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.text, flex: 1 }}>{mod.title}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: modDone === mod.lessons.length ? C.green : C.textDim }}>{modDone}/{mod.lessons.length}</span>
                </div>
                {modOpen && mod.lessons.map((ls, li) => {
                  const id = `${ci}-${mi}-${li}`;
                  const lOpen = openLesson[id];
                  const isDone = done[id];
                  return (
                    <div key={li} style={{ borderTop: `1px solid ${C.border}22`, padding: "0 16px" }}>
                      <div onClick={() => setOpenLesson(p => ({ ...p, [id]: !p[id] }))} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", cursor: "pointer" }}>
                        <div onClick={(e) => toggleDone(id, e)} title="Mark complete"
                          style={{ width: 20, height: 20, borderRadius: 5, flex: "0 0 20px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                            border: `1.5px solid ${isDone ? C.green : C.border}`, background: isDone ? `${C.green}22` : "transparent", color: C.green, fontSize: 13, fontWeight: 800 }}>{isDone ? "✓" : ""}</div>
                        <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 600, color: isDone ? C.textDim : C.text, flex: 1, textDecoration: isDone ? "line-through" : "none" }}>{ls.t}</span>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{lOpen ? "−" : "+"}</span>
                      </div>
                      {lOpen && (
                        <div style={{ padding: "0 0 12px 30px" }}>
                          <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.65, marginBottom: 8 }}>{ls.b}</div>
                          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, marginBottom: 4 }}>KEY TAKEAWAYS</div>
                          {ls.p.map((pt, pi) => (
                            <div key={pi} style={{ display: "flex", gap: 8, fontFamily: SANS, fontSize: 12, color: C.text, padding: "2px 0" }}>
                              <span style={{ color: C.accent }}>•</span><span>{pt}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {modOpen && ACADEMY_QUIZ[modKey] && (() => {
                  const qz = ACADEMY_QUIZ[modKey]; const picked = quizPick[modKey];
                  return (
                    <div style={{ margin: "4px 16px 14px", padding: "12px 14px", background: `${C.accent}0a`, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.accent, marginBottom: 6 }}>📝 QUICK CHECK</div>
                      <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>{qz.q}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {qz.o.map((opt, oi) => {
                          const isPicked = picked != null;
                          const correct = oi === qz.a;
                          const col = !isPicked ? C.border : correct ? C.green : (picked === oi ? C.red : C.border);
                          return (
                            <div key={oi} onClick={() => { if (picked == null) setQuizPick(p => ({ ...p, [modKey]: oi })); }}
                              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, cursor: isPicked ? "default" : "pointer",
                                border: `1px solid ${col}`, background: isPicked && (correct || picked === oi) ? `${col}14` : "transparent",
                                fontFamily: SANS, fontSize: 12.5, color: C.text }}>
                              <span style={{ color: col, fontWeight: 800 }}>{isPicked ? (correct ? "✓" : picked === oi ? "✕" : "○") : "○"}</span>
                              <span>{opt}</span>
                            </div>
                          );
                        })}
                      </div>
                      {picked != null && (
                        <div style={{ marginTop: 8, fontFamily: SANS, fontSize: 12, color: picked === qz.a ? C.green : C.textDim }}>
                          {picked === qz.a ? "✓ Correct! " : "✕ Not quite. "}{qz.why}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      ))}
      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>
        Educational content — not financial advice. Tick each lesson as you complete it; your progress saves automatically.
      </div>
    </div>
  );
}
