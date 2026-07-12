export default function EconCalTab({
  C, MONO, SANS, evData,
}) {
        const IMPACT_COL = { HIGH: C.red, MED: C.amber, LOW: C.green };
        return (
          <div style={{ padding: "16px 20px" }}>
            <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.text, marginBottom: 12 }}>🗓 ECONOMIC CALENDAR</div>
            {evData && (evData.events||[]).filter(e => e.isUrgent).length > 0 && (
              <div style={{ padding: "12px 16px", background: `${C.red}12`, border: `1px solid ${C.red}44`,
                borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.red, marginBottom: 4 }}>
                  ⚠ HIGH-IMPACT EVENT WITHIN 48 HOURS
                </div>
                {(evData.events||[]).filter(e => e.isUrgent).map((e,i) => (
                  <div key={i} style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, marginTop: 4 }}>
                    <strong>{e.name}</strong> — {e.countdown} · {e.note}
                  </div>
                ))}
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.red, marginTop: 8 }}>
                  Action: Reduce position size. Avoid new entries until after the print.
                </div>
              </div>
            )}
            {!evData && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>⌛ Loading…</div>}
            {evData && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {evData.events.map((e, i) => (
                  <div key={i} style={{ padding: "14px 18px", borderRadius: 10,
                    background: e.isUrgent ? `${C.red}0d` : C.card,
                    border: `1px solid ${e.isUrgent ? C.red : C.border}44`,
                    borderLeft: `5px solid ${IMPACT_COL[e.impact] || C.amber}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.text }}>{e.name}</span>
                          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                            background: (IMPACT_COL[e.impact]||C.amber) + "22",
                            color: IMPACT_COL[e.impact] || C.amber }}>{e.impact}</span>
                          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.textDim, background: C.surface, borderRadius: 4, padding: "2px 6px" }}>{e.tag}</span>
                        </div>
                        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, marginTop: 4 }}>{e.note}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900,
                          color: e.isUrgent ? C.red : e.dte <= 5 ? C.amber : C.text }}>
                          {e.countdown}
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{e.date}</div>
                      </div>
                    </div>
                    {e.isUrgent && (
                      <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.red }}>
                        ⚠ HIGH-IMPACT EVENT SOON — Reduce size, avoid new entries
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
}
