export default function BriefingTab({
  C, MONO, SANS, isMobile, premktBriefing, premktAt, fetchPremarketBriefing, premktLoading,
}) {
        const card = (extra = {}) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, ...extra });
        const sectionRe = /^([A-Z][A-Z\s\/]{3,})\n/gm;
        const parts = premktBriefing ? premktBriefing.split(sectionRe).filter(Boolean) : [];
        const sections = [];
        for (let i = 0; i < parts.length; i += 2) {
          if (i + 1 < parts.length) sections.push({ title: parts[i].trim(), body: parts[i + 1].trim() });
          else sections.push({ title: "", body: parts[i].trim() });
        }
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Header */}
            <div style={{ ...card(), padding: "14px 18px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>🌅 PRE-MARKET BRIEFING</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 3 }}>
                  {premktAt
                    ? (() => {
                        const genDate = new Date(premktAt);
                        const isToday = genDate.toDateString() === new Date().toDateString();
                        return isToday
                          ? `✅ Auto-generated today at ${genDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                          : `Generated ${genDate.toLocaleDateString()} ${genDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — click refresh for today`;
                      })()
                    : "Auto-generates on weekdays 6:30–9:30 AM ET · Or click to generate now"}
                </div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <button onClick={fetchPremarketBriefing} disabled={premktLoading}
                  style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                    background: premktLoading ? C.surface : C.accent, border: "none", color: premktLoading ? C.textDim : "#fff",
                    borderRadius: 7, padding: "10px 22px", cursor: premktLoading ? "default" : "pointer" }}>
                  {premktLoading ? "⏳ GENERATING…" : "🌅 GENERATE BRIEFING"}
                </button>
                {premktBriefing && !premktLoading && (
                  <span style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>↺ Refresh for latest data</span>
                )}
              </div>
            </div>

            {/* Content */}
            {!premktBriefing && !premktLoading && (
              <div style={{ ...card(), padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 52, marginBottom: 16 }}>🌅</div>
                <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>Morning Brief</div>
                <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, lineHeight: 1.6, maxWidth: 360, margin: "0 auto" }}>Click GENERATE BRIEFING for a full AI analysis: market regime · top setups · what to avoid · game plan for today.</div>
              </div>
            )}
            {premktLoading && (
              <div style={{ ...card(), padding: 40, textAlign: "center" }}>
                <div style={{ fontFamily: MONO, fontSize: 13, color: C.accent }}>Claude is analyzing the market…</div>
              </div>
            )}
            {premktBriefing && !premktLoading && (() => {
              const ICONS = { "MORNING VERDICT": "⚖️", "KEY THEMES": "🎯", "EARNINGS WATCH": "📅", "MACRO EVENTS": "📊", "TOP 3 SETUPS": "🚀", "WHAT TO AVOID": "⚠️", "GAME PLAN": "🗺️" };
              return sections.length > 1 ? (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
                  {sections.map((s, i) => {
                    const icon = Object.entries(ICONS).find(([k]) => s.title.includes(k.split(" ")[0]))?.[1] || "📌";
                    const isGamePlan = s.title.includes("GAME PLAN");
                    return (
                      <div key={i} style={{ ...card({ padding: 16 }), gridColumn: isGamePlan ? "1 / -1" : undefined,
                        borderLeft: i === 0 ? `3px solid ${C.accent}` : `3px solid ${C.border}` }}>
                        {s.title && <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, letterSpacing: "0.08em", marginBottom: 8 }}>{icon} {s.title}</div>}
                        <div style={{ fontFamily: SANS, fontSize: 12, color: C.text, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{s.body}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ ...card({ padding: 20 }) }}>
                  <pre style={{ fontFamily: SANS, fontSize: 12, color: C.text, lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0 }}>{premktBriefing}</pre>
                </div>
              );
            })()}
          </div>
        );
}
