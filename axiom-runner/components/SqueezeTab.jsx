export default function SqueezeTab({ C, MONO, SANS, setActiveTab }) {
  const [sqData,    setSqData]    = React.useState(null);
  const [sqLoading, setSqLoading] = React.useState(false);
  const [sqError,   setSqError]   = React.useState(null);
  const [sqFilter,  setSqFilter]  = React.useState("ALL");

  const load = React.useCallback(() => {
    setSqLoading(true);
    fetch("/api/scanner/squeeze")
      .then(r => r.json())
      .then(d => { if (d.ok) setSqData(d); else setSqError(d.error || "Failed"); })
      .catch(e => setSqError(e.message))
      .finally(() => setSqLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const rows = (sqData?.results || []).filter(r =>
    sqFilter === "ALL"    ? true :
    sqFilter === "HIGH"   ? r.score >= 70 :
    sqFilter === "MEDIUM" ? r.score >= 45 && r.score < 70 :
    sqFilter === "WATCH"  ? r.score >= 25 && r.score < 45 : true
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>🔥 SHORT SQUEEZE SCREENER</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
            High short interest + rising momentum + volume = squeeze candidate
            {sqData?.updatedAt ? ` · Updated ${new Date(sqData.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["ALL","HIGH","MEDIUM","WATCH"].map(f => (
            <button key={f} onClick={() => setSqFilter(f)}
              style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "5px 12px",
                borderRadius: 6, border: `1px solid ${sqFilter === f ? C.accent : C.border}`,
                background: sqFilter === f ? `${C.accent}18` : "transparent",
                color: sqFilter === f ? C.accent : C.textDim, cursor: "pointer" }}>
              {f === "HIGH" ? "🔥 HIGH" : f === "MEDIUM" ? "⚡ MEDIUM" : f === "WATCH" ? "👀 WATCH" : "ALL"}
            </button>
          ))}
          <button onClick={load} style={{ fontFamily: MONO, fontSize: 11, padding: "5px 12px", borderRadius: 6,
            border: `1px solid ${C.border}`, background: "transparent", color: C.textDim, cursor: "pointer" }}>
            {sqLoading ? "…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {sqError && <div style={{ padding: 12, background: `${C.red}15`, border: `1px solid ${C.red}44`,
        borderRadius: 8, fontFamily: MONO, fontSize: 12, color: C.red }}>⚠ {sqError}</div>}

      {sqLoading && !sqData && (
        <div style={{ padding: 40, textAlign: "center", fontFamily: MONO, fontSize: 13, color: C.textDim }}>
          🔍 Scanning stocks for squeeze setups…
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                {["TICKER","GRADE","SCORE","PRICE","1D CHG","RVOL","SI % FLOAT","DAYS CVR","FLOAT (M)","MKT CAP"].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: h === "TICKER" || h === "GRADE" ? "left" : "right",
                    color: C.textDim, fontWeight: 800, fontSize: 11, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const sc = r.score >= 70 ? C.red : r.score >= 45 ? C.amber : C.textDim;
                return (
                  <tr key={r.sym}
                    style={{ borderBottom: `1px solid ${C.border}33`,
                      background: i % 2 === 0 ? "transparent" : `${C.surface}66` }}>
                    <td style={{ padding: "8px 10px", color: C.accent, fontWeight: 900 }}>{r.sym}</td>
                    <td style={{ padding: "8px 10px" }}>{r.grade}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>
                      <span style={{ background: `${sc}20`, color: sc, borderRadius: 4, padding: "2px 8px", fontWeight: 900 }}>{r.score}</span>
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: C.text }}>${r.price}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: r.chg1d >= 0 ? C.green : C.red, fontWeight: 700 }}>
                      {r.chg1d >= 0 ? "+" : ""}{r.chg1d}%
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: r.rvol >= 2 ? C.amber : C.text }}>
                      {r.rvol > 0 ? r.rvol + "x" : "—"}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: r.siPct >= 20 ? C.red : r.siPct >= 10 ? C.amber : C.text, fontWeight: r.siPct >= 10 ? 700 : 400 }}>
                      {r.siPct > 0 ? r.siPct + "%" : "—"}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: r.siDays >= 7 ? C.red : C.text }}>
                      {r.siDays > 0 ? r.siDays + "d" : "—"}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: C.textDim }}>{r.floatM ? r.floatM + "M" : "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: C.textDim }}>{r.mktCapB ? "$" + r.mktCapB + "B" : "—"}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right" }}>
                      <button onClick={() => { navigator.clipboard?.writeText(r.sym).catch(()=>{}); setActiveTab("smartscan"); }}
                        style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, padding: "3px 10px",
                          borderRadius: 5, border: `1px solid ${C.accent}55`, background: `${C.accent}15`,
                          color: C.accent, cursor: "pointer", whiteSpace: "nowrap" }}>
                        Scan →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ padding: "10px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
        display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>
          <strong style={{ color: C.red }}>🔥 HIGH (70+)</strong> — Prime squeeze. High SI, volume surging, price moving.
        </div>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>
          <strong style={{ color: C.amber }}>⚡ MEDIUM (45-69)</strong> — Squeeze potential building.
        </div>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>
          <strong>SI % Float</strong> = short interest as % of float. Above 20% = very heavy.&nbsp;
          <strong>Days Cover</strong> = days for shorts to exit. Above 7 = trapped.
        </div>
      </div>
    </div>
  );
}
