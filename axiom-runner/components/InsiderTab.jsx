// ── Insider Buy Screener ──────────────────────────────────────────────────────
export default function InsiderTab({ C, MONO, SANS, setActiveTab }) {
  const [data,    setData]    = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error,   setError]   = React.useState(null);

  const load = React.useCallback(() => {
    setLoading(true);
    fetch("/api/scanner/insider")
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d); else setError(d.error); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>🏦 INSIDER BUY SCREENER</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
            SEC Form 4 purchases — CEO/CFO/Director buying their own stock with real money · Last 3 days
            {data?.updatedAt ? ` · ${new Date(data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          </div>
        </div>
        <button onClick={load} style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, padding: "5px 14px",
          borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent",
          color: C.textDim, cursor: "pointer" }}>{loading ? "…" : "↻ Refresh"}</button>
      </div>

      <div style={{ padding: "10px 14px", background: `${C.green}10`, border: `1px solid ${C.green}33`,
        borderRadius: 8, fontFamily: SANS, fontSize: 12, color: C.green, fontWeight: 600 }}>
        💡 When a CEO buys their own stock, they know something you don't. This is the strongest signal in the market — legal insider information.
      </div>

      {error && <div style={{ padding: 12, background: `${C.red}15`, border: `1px solid ${C.red}44`, borderRadius: 8, fontFamily: MONO, fontSize: 12, color: C.red }}>⚠ {error}</div>}
      {loading && !data && <div style={{ padding: 40, textAlign: "center", fontFamily: MONO, fontSize: 13, color: C.textDim }}>🏦 Loading SEC Form 4 filings…</div>}

      {(data?.results || []).length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                {["TICKER","COMPANY","FILED","PRICE","1D CHG","ACTION"].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: h === "COMPANY" ? "left" : h === "TICKER" ? "left" : "right",
                    color: C.textDim, fontWeight: 800, fontSize: 11, letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.results.map((r, i) => (
                <tr key={`${r.ticker}-${i}`}
                  style={{ borderBottom: `1px solid ${C.border}33`,
                    background: i % 2 === 0 ? "transparent" : `${C.surface}66` }}>
                  <td style={{ padding: "8px 10px", color: C.accent, fontWeight: 900 }}>{r.ticker}</td>
                  <td style={{ padding: "8px 10px", color: C.text, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.company || "—"}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: C.textDim }}>{r.date || "—"}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: C.text }}>{r.price > 0 ? `$${r.price}` : "—"}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: r.chg != null ? (r.chg >= 0 ? C.green : C.red) : C.textDim, fontWeight: 700 }}>
                    {r.chg != null && r.price > 0 ? `${r.chg >= 0 ? "+" : ""}${r.chg}%` : "—"}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>
                    <span style={{ background: `${C.green}20`, color: C.green, borderRadius: 4,
                      padding: "2px 8px", fontWeight: 800, fontSize: 10 }}>PURCHASE</span>
                  </td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>
                    <button onClick={() => { navigator.clipboard?.writeText(r.ticker).catch(()=>{}); setActiveTab("smartscan"); }}
                      style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, padding: "3px 10px",
                        borderRadius: 5, border: `1px solid ${C.accent}55`, background: `${C.accent}15`,
                        color: C.accent, cursor: "pointer", whiteSpace: "nowrap" }}>
                      Scan →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && data && data.results?.length === 0 && (
        <div style={{ padding: 30, textAlign: "center", fontFamily: SANS, fontSize: 13, color: C.textDim }}>
          No insider purchases found in the last 3 days. Check back daily — this is the most valuable signal.
        </div>
      )}
    </div>
  );
}
