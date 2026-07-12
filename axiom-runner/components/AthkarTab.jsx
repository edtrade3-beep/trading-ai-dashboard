export default function AthkarTab({
  C, MONO, ATHKAR_DATA, athkarCategory, setAthkarCategory, athkarProgress, setAthkarProgress,
}) {
        const gold = "#c9a84c";
        const CATEGORIES = [
          { id: "morning", label: "أذكار الصباح" },
          { id: "evening", label: "أذكار المساء" },
          { id: "afterPrayer", label: "أذكار بعد الصلاة" },
          { id: "sleep", label: "أذكار النوم" },
          { id: "istighfar", label: "الاستغفار" },
          { id: "salawat", label: "الصلاة على النبي" },
          { id: "duaa", label: "أدعية" },
        ];
        const catData = ATHKAR_DATA[athkarCategory];
        const saveProgress = (updated) => {
          setAthkarProgress(updated);
          try { localStorage.setItem("athkar_progress", JSON.stringify(updated)); } catch {}
        };
        const catItems = catData?.items || [];
        const allDone = catItems.every(item => (athkarProgress[item.id] || 0) >= item.count);

        return (
          <div dir="rtl" style={{ maxWidth: 760, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 24, fontWeight: 900, color: gold }}>الأذكار</div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, direction: "ltr", marginTop: 4 }}>ISLAMIC REMEMBRANCE</div>
            </div>

            {/* Category tabs */}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => setAthkarCategory(cat.id)}
                  style={{ border: `1px solid ${athkarCategory === cat.id ? gold : C.border}`, background: athkarCategory === cat.id ? `${gold}18` : C.surface, color: athkarCategory === cat.id ? gold : C.textSec, borderRadius: 20, padding: "6px 14px", fontFamily: "Arial, sans-serif", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {cat.label}
                </button>
              ))}
            </div>

            {allDone && (
              <div style={{ background: `${gold}14`, border: `1px solid ${gold}66`, borderRadius: 10, padding: "14px 16px", textAlign: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 18, color: gold, fontFamily: "Arial, sans-serif", fontWeight: 700 }}>✓ تم إكمال {catData.title}</div>
                <div style={{ fontSize: 12, color: C.textSec, marginTop: 4 }}>بارك الله فيك وتقبل منك</div>
                <button onClick={() => {
                  const reset = { ...athkarProgress };
                  catItems.forEach(item => { reset[item.id] = 0; });
                  saveProgress(reset);
                }} style={{ marginTop: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "6px 14px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>
                  إعادة
                </button>
              </div>
            )}

            {/* Dhikr items */}
            <div style={{ display: "grid", gap: 10 }}>
              {catItems.map(item => {
                const current = athkarProgress[item.id] || 0;
                const done = current >= item.count;
                const pct = Math.min(100, (current / item.count) * 100);
                return (
                  <div key={item.id} style={{ background: done ? `${gold}0a` : C.card, border: `1px solid ${done ? gold + "44" : C.border}`, borderRadius: 12, padding: "16px 14px", opacity: done ? 0.75 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div style={{ fontSize: 12, color: gold, fontFamily: MONO }}>{item.label}</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: done ? gold : C.textSec }}>{current}/{item.count}</div>
                    </div>
                    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 17, lineHeight: 2, color: C.text, textAlign: "right", marginBottom: 12, whiteSpace: "pre-wrap" }}>
                      {item.text}
                    </div>
                    {/* Progress bar */}
                    <div style={{ height: 3, background: C.border, borderRadius: 2, marginBottom: 10, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: done ? gold : C.accent, borderRadius: 2, transition: "width 0.2s" }} />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => {
                          if (done) return;
                          const next = current + 1;
                          saveProgress({ ...athkarProgress, [item.id]: next });
                        }}
                        disabled={done}
                        style={{ flex: 1, background: done ? `${gold}18` : C.accent, border: "none", color: done ? gold : "#fff", borderRadius: 8, padding: "11px 0", fontFamily: "Arial, sans-serif", fontSize: 15, cursor: done ? "default" : "pointer", fontWeight: 700 }}>
                        {done ? "✓ مكتمل" : "عد — " + (item.count - current) + " متبقٍ"}
                      </button>
                      <button onClick={() => saveProgress({ ...athkarProgress, [item.id]: 0 })}
                        style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSec, borderRadius: 8, padding: "11px 14px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>
                        إعادة
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
}
