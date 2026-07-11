export default function TasbihTab({
  C, MONO, TASBIH_DHIKR,
  tasbihCustomTarget, setTasbihCustomTarget, tasbihTarget, setTasbihTarget,
  tasbihCount, setTasbihCount, tasbihCompleted, setTasbihCompleted, tasbihDhikr, setTasbihDhikr,
}) {
        const gold = "#c9a84c";
        const effectiveTarget = tasbihCustomTarget ? Number(tasbihCustomTarget) : tasbihTarget;
        const pct = effectiveTarget > 0 ? Math.min(100, (tasbihCount / effectiveTarget) * 100) : 0;
        const done = tasbihCount >= effectiveTarget && effectiveTarget > 0;

        const doCount = () => {
          if (done) return;
          const next = tasbihCount + 1;
          setTasbihCount(next);
          localStorage.setItem("tasbih_count", String(next));
          if (next >= effectiveTarget) setTasbihCompleted(true);
        };

        const doReset = () => {
          setTasbihCount(0);
          setTasbihCompleted(false);
          localStorage.setItem("tasbih_count", "0");
        };

        return (
          <div dir="rtl" style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 900, color: gold }}>التسبيح</div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, direction: "ltr", marginTop: 4 }}>DIGITAL TASBIH</div>
            </div>

            {/* Current dhikr */}
            <div style={{ background: C.card, border: `2px solid ${gold}44`, borderRadius: 20, padding: "28px 20px", marginBottom: 16 }}>
              <div style={{ fontFamily: "Arial, sans-serif", fontSize: 28, fontWeight: 900, color: gold, lineHeight: 1.7, marginBottom: 4 }}>
                {tasbihDhikr.text}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, direction: "ltr", marginBottom: 20 }}>
                {tasbihDhikr.transliteration}
              </div>

              {/* Big counter */}
              <div style={{ fontFamily: MONO, fontSize: 80, fontWeight: 900, color: done ? gold : C.text, lineHeight: 1, marginBottom: 8 }}>
                {tasbihCount}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 13, color: C.textDim, marginBottom: 20 }}>
                / {effectiveTarget}
              </div>

              {/* Progress ring-style bar */}
              <div style={{ height: 6, background: C.border, borderRadius: 5, marginBottom: 20, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: done ? gold : C.accent, borderRadius: 5, transition: "width 0.1s" }} />
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 20 }}>{pct.toFixed(1)}%</div>

              {/* Big tap button */}
              <button
                onClick={doCount}
                disabled={done}
                onKeyDown={e => { if (e.code === "Space") { e.preventDefault(); doCount(); } }}
                style={{ width: 180, height: 180, borderRadius: "50%", background: done ? `${gold}14` : `${gold}22`, border: `3px solid ${done ? gold : gold + "66"}`, color: gold, fontSize: 44, cursor: done ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", transition: "transform 0.08s, background 0.1s", boxShadow: done ? `0 0 40px ${gold}22` : "none" }}
                onMouseDown={e => { if (!done) e.currentTarget.style.transform = "scale(0.94)"; }}
                onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
              >
                {done ? "✓" : "☝"}
              </button>
            </div>

            {/* Completed message */}
            {(done || tasbihCompleted) && (
              <div style={{ background: `${gold}14`, border: `1px solid ${gold}66`, borderRadius: 12, padding: "16px 20px", marginBottom: 14 }}>
                <div style={{ fontSize: 18, color: gold, fontWeight: 700 }}>تم إكمال الذكر</div>
                <div style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>بارك الله فيك</div>
              </div>
            )}

            {/* Controls */}
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
              <button onClick={doReset}
                style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSec, borderRadius: 8, padding: "10px 22px", fontFamily: "Arial, sans-serif", fontSize: 14, cursor: "pointer" }}>
                إعادة
              </button>
              {tasbihCount > 0 && <div style={{ display: "flex", alignItems: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>العدد الحالي: {tasbihCount}</div>}
            </div>

            {/* Dhikr selector */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 8 }}>الذكر</div>
              <div style={{ display: "grid", gap: 6 }}>
                {TASBIH_DHIKR.map(d => (
                  <button key={d.id} onClick={() => { setTasbihDhikr(d); doReset(); }}
                    style={{ background: tasbihDhikr.id === d.id ? `${gold}18` : C.surface, border: `1px solid ${tasbihDhikr.id === d.id ? gold : C.border}`, color: tasbihDhikr.id === d.id ? gold : C.text, borderRadius: 8, padding: "10px 14px", fontFamily: "Arial, sans-serif", fontSize: 15, cursor: "pointer", textAlign: "right" }}>
                    {d.text}
                  </button>
                ))}
              </div>
            </div>

            {/* Target selector */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 8 }}>الهدف</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginBottom: 10 }}>
                {[33, 99, 100, 1000].map(t => (
                  <button key={t} onClick={() => { setTasbihTarget(t); setTasbihCustomTarget(""); }}
                    style={{ background: tasbihTarget === t && !tasbihCustomTarget ? `${gold}18` : C.surface, border: `1px solid ${tasbihTarget === t && !tasbihCustomTarget ? gold : C.border}`, color: tasbihTarget === t && !tasbihCustomTarget ? gold : C.text, borderRadius: 8, padding: "8px 16px", fontFamily: MONO, fontSize: 13, cursor: "pointer" }}>
                    {t}
                  </button>
                ))}
              </div>
              <input type="number" value={tasbihCustomTarget} onChange={e => setTasbihCustomTarget(e.target.value)} placeholder="هدف Ù…Ø®ØµØµ…"
                style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "9px 12px", borderRadius: 8, fontFamily: MONO, fontSize: 12, textAlign: "center" }} />
            </div>
          </div>
        );
}
