export default function EarnCalTab({
  C, MONO, SANS, ecData, setEcLoad, setEcData, ecLoad, setTerminalSymbol, setActiveTab,
}) {
        const groups = { past:[], today:[], week:[], later:[] };
        (ecData?.events||[]).forEach(e => {
          if (e.dte < 0) groups.past.push(e);
          else if (e.dte === 0) groups.today.push(e);
          else if (e.dte <= 7) groups.week.push(e);
          else groups.later.push(e);
        });
        const Row = ({ e }) => (
          <tr onClick={() => { setTerminalSymbol(e.sym); try { localStorage.setItem("mterminal_load_sym", e.sym); } catch {} setActiveTab("mterminal"); }}
            style={{ borderBottom: `1px solid ${C.border}22`, cursor: "pointer" }}
            onMouseEnter={ev => ev.currentTarget.style.background = C.cardHover}
            onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}>
            <td style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.accent, padding: "10px 12px" }}>{e.sym}</td>
            <td style={{ fontFamily: MONO, fontSize: 12, color: C.text, padding: "10px 12px" }}>{e.date}</td>
            <td style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "10px 12px",
              color: e.dte === 0 ? C.red : e.dte <= 2 ? C.amber : C.text }}>
              {e.dte === 0 ? "🔥 TODAY" : e.dte === 1 ? "Tomorrow" : `in ${e.dte}d`}
            </td>
            <td style={{ fontFamily: MONO, fontSize: 12, color: C.text, padding: "10px 12px" }}>${e.price}</td>
            <td style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.amber, padding: "10px 12px" }}>
              {e.expMove > 0 ? `±${e.expMove.toFixed(1)}%` : "—"}
            </td>
            <td style={{ fontFamily: MONO, fontSize: 12, padding: "10px 12px", color: C.textDim }}>{e.timing}</td>
            <td style={{ fontFamily: MONO, fontSize: 12, padding: "10px 12px", color: C.textSec }}>{e.mktCap > 0 ? `$${e.mktCap.toFixed(0)}B` : "—"}</td>
          </tr>
        );
        const Section = ({ title, color, events }) => events.length === 0 ? null : (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color, marginBottom: 10, letterSpacing: "0.06em" }}>{title}</div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: C.surface }}>
                  {["TICKER","DATE","DTE","PRICE","EXP MOVE","TIMING","MKT CAP"].map(h => (
                    <th key={h} style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, fontWeight: 700,
                      padding: "8px 12px", textAlign: "left", borderBottom: `1px solid ${C.border}`, letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{events.map((e,i) => <Row key={i} e={e} />)}</tbody>
              </table>
            </div>
          </div>
        );
        return (
          <div style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.text }}>📅 EARNINGS CALENDAR</span>
              <button onClick={() => { setEcLoad(true); fetch("/api/market/earnings-calendar").then(r=>r.json()).then(d=>{if(d.ok)setEcData(d);}).catch(()=>{}).finally(()=>setEcLoad(false)); }}
                style={{ fontFamily: MONO, fontSize: 11, border: `1px solid ${C.accent}`, background: `${C.accent}18`,
                  color: C.accent, borderRadius: 6, padding: "4px 12px", cursor: "pointer" }}>
                {ecLoad ? "⌛" : "↺ REFRESH"}
              </button>
              {ecData && <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Updated: {new Date(ecData.scannedAt).toLocaleTimeString()}</span>}
            </div>
            {ecLoad && !ecData && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>⌛ Loading earnings calendar…</div>}
            {/* Urgent banner if earnings TODAY */}
            {groups.today.length > 0 && (
              <div style={{ padding: "12px 16px", background: `${C.red}12`, border: `1px solid ${C.red}44`,
                borderRadius: 8, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>🔥</span>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.red }}>
                    EARNINGS TODAY — {groups.today.map(e => e.sym).join(", ")}
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, marginTop: 3 }}>
                    Avoid new long positions in these stocks. High volatility expected.
                    Expected moves: {groups.today.map(e => `${e.sym} ±${e.expMove}%`).join(", ")}
                  </div>
                </div>
              </div>
            )}
            <Section title="🔥 TODAY" color={C.red} events={groups.today} />
            <Section title="📅 THIS WEEK (1-7 DAYS)" color={C.amber} events={groups.week} />
            <Section title="📆 UPCOMING (8+ DAYS)" color={C.text} events={groups.later} />
            <Section title="✓ RECENT (PAST 7 DAYS)" color={C.textDim} events={groups.past.slice(0,10)} />
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 16 }}>
              Expected Move = options-implied volatility proxy from 52w range. Click any ticker to open chart.
            </div>
          </div>
        );
}
