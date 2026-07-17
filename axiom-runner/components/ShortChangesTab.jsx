// No hooks here — state hoisted to App()
export default function ShortChangesTab({ C, MONO, shortChgData, setTerminalSymbol, setActiveTab }) {
  const scLoad = !shortChgData;
  const fmtPct = v => v > 0 ? "+" + v.toFixed(1) + "%" : v.toFixed(1) + "%";
  const Section = ({ title, col, rows, cols }) => (
    <div style={{ flex: 1, minWidth: 280 }}>
      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: col, marginBottom: 10, letterSpacing: "0.06em" }}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ background: C.surface }}>
          {cols.map(c => <th key={c} style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "6px 8px", textAlign: "left", borderBottom: `1px solid ${C.border}` }}>{c}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : C.surface, cursor: "pointer" }}
              onClick={() => { setTerminalSymbol(r.sym); try { localStorage.setItem("mterminal_load_sym", r.sym); } catch {} setActiveTab("mterminal"); }}>
              <td style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.accent, padding: "9px 8px" }}>{r.sym}</td>
              <td style={{ fontFamily: MONO, fontSize: 12, color: C.text, padding: "9px 8px" }}>${r.price}</td>
              <td style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: r.shortFloat > 20 ? C.red : r.shortFloat > 10 ? C.amber : C.text, padding: "9px 8px" }}>{r.shortFloat > 0 ? r.shortFloat.toFixed(1) + "%" : "—"}</td>
              <td style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: r.shortChange > 5 ? C.red : r.shortChange < -5 ? C.green : C.text, padding: "9px 8px" }}>{r.shortChange != null ? fmtPct(r.shortChange) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div style={{ padding: "16px 20px" }}>
      <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text, marginBottom: 16 }}>🩳 SHORT INTEREST CHANGES</div>
      {scLoad && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>⌛ Loading short interest data…</div>}
      {shortChgData && (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <Section title="🔴 SHORTS INCREASING — Bears Adding" col={C.red} rows={shortChgData.increasing || []} cols={["TICKER","PRICE","FLOAT SHORT","WK CHG%"]} />
          <Section title="🟢 SHORT COVERING — Bears Running" col={C.green} rows={shortChgData.covering || []} cols={["TICKER","PRICE","FLOAT SHORT","WK CHG%"]} />
          <Section title="⚡ HIGHEST SHORT FLOAT — Squeeze Candidates" col={C.amber} rows={shortChgData.highShort || []} cols={["TICKER","PRICE","FLOAT SHORT","WK CHG%"]} />
        </div>
      )}
    </div>
  );
}
