// ── Under $10 Opportunity Scanner ────────────────────────────────────────────
export default function Under10Tab({ C, MONO, SANS, setActiveTab, watchlistSymbols }) {
  const [data,    setData]    = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [filter,  setFilter]  = React.useState("ALL"); // ALL | CHEAP | TECHNICAL | FUNDAMENTAL
  const [maxPrice, setMaxPrice] = React.useState(50);

  const load = React.useCallback((forceRefresh = false) => {
    setLoading(true);
    const sep = watchlistSymbols?.length ? "?" : "?";
    const wlParam = watchlistSymbols?.length ? `?symbols=${watchlistSymbols.slice(0,30).join(",")}&refresh=${forceRefresh?1:0}` : `?refresh=${forceRefresh?1:0}`;
    fetch(`/api/scanner/under10${wlParam}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [watchlistSymbols]);

  React.useEffect(() => { load(); }, [load]);

  const rows = (data?.results || []).filter(r => {
    if (r.price > maxPrice) return false;
    if (filter === "CHEAP")       return r.price < 10;
    if (filter === "TECHNICAL")   return r.techScore >= 35;
    if (filter === "FUNDAMENTAL") return r.fundScore >= 20;
    if (filter === "APLUS")       return r.total >= 55;
    return true;
  });

  const gradeColor = g => g.includes("A+") ? C.green : g.includes("⚡") ? "#22c55e" : g.includes("✅") ? C.amber : C.textDim;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text }}>💎 UNDER ${maxPrice} OPPORTUNITIES</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
            Quality stocks under ${maxPrice} · Scored on Technical + Fundamental + Upside · {rows.length} found
            {data?.updatedAt ? ` · ${new Date(data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={maxPrice} onChange={e => setMaxPrice(Number(e.target.value))}
            style={{ fontFamily: MONO, fontSize: 11, padding: "5px 8px", borderRadius: 6,
              border: `1px solid ${C.border}`, background: C.surface, color: C.text, cursor: "pointer" }}>
            <option value={5}>Under $5</option>
            <option value={10}>Under $10</option>
            <option value={20}>Under $20</option>
            <option value={50}>Under $50</option>
          </select>
          {[["ALL","All"],["APLUS","🔥 A+"],["TECHNICAL","📈 Technical"],["FUNDAMENTAL","📊 Fundamental"],["CHEAP","💵 Under $10"]].map(([k,l]) => (
            <button key={k} onClick={() => setFilter(k)} style={{ fontFamily: MONO, fontSize: 10, fontWeight: filter===k?800:500,
              padding: "5px 10px", borderRadius: 6, cursor: "pointer",
              border: `1px solid ${filter===k ? C.accent : C.border}`,
              background: filter===k ? `${C.accent}18` : "transparent",
              color: filter===k ? C.accent : C.textDim }}>{l}</button>
          ))}
          <button onClick={() => load(true)} style={{ fontFamily: MONO, fontSize: 11, padding: "5px 14px",
            borderRadius: 6, border: `1px solid ${C.accent+"55"}`, background: `${C.accent}15`,
            color: C.textDim, cursor: "pointer", fontWeight: 700 }}>{loading ? "⏳" : "↻"}</button>
        </div>
      </div>

      {loading && !data && (
        <div style={{ padding: 40, textAlign: "center", fontFamily: MONO, fontSize: 13, color: C.textDim }}>
          💎 Scanning stocks under ${maxPrice}…
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                {["GRADE","TICKER","PRICE","CHG%","TECH","FUND","UPSIDE","RSI","RVOL","52W HI","MKT CAP","SIGNALS",""].map(h => (
                  <th key={h} style={{ padding: "8px 8px", textAlign: h === "TICKER" || h === "GRADE" || h === "SIGNALS" ? "left" : "right",
                    color: C.textDim, fontWeight: 800, fontSize: 10, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const gc = gradeColor(r.grade);
                return (
                  <tr key={r.sym} style={{ borderBottom: `1px solid ${C.border}22`,
                    background: r.total >= 65 ? `${C.green}08` : i % 2 === 0 ? "transparent" : `${C.surface}44` }}>
                    <td style={{ padding: "9px 8px" }}>
                      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 900, color: gc,
                        background: `${gc}18`, borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }}>
                        {r.grade}
                      </span>
                    </td>
                    <td style={{ padding: "9px 8px" }}>
                      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.accent }}>{r.sym}</div>
                    </td>
                    <td style={{ padding: "9px 8px", textAlign: "right" }}>
                      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.text }}>${r.price}</div>
                    </td>
                    <td style={{ padding: "9px 8px", textAlign: "right", color: r.chgPct >= 0 ? C.green : C.red, fontWeight: 700 }}>
                      {r.chgPct >= 0 ? "+" : ""}{r.chgPct}%
                    </td>
                    <td style={{ padding: "9px 8px", textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                        <div style={{ width: 28, height: 5, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ width: `${r.techScore/50*100}%`, height: "100%", background: r.techScore >= 35 ? C.green : C.amber, borderRadius: 2 }} />
                        </div>
                        <span style={{ color: r.techScore >= 35 ? C.green : C.textDim, fontSize: 10 }}>{r.techScore}</span>
                      </div>
                    </td>
                    <td style={{ padding: "9px 8px", textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                        <div style={{ width: 28, height: 5, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ width: `${r.fundScore/30*100}%`, height: "100%", background: r.fundScore >= 20 ? C.green : C.amber, borderRadius: 2 }} />
                        </div>
                        <span style={{ color: r.fundScore >= 20 ? C.green : C.textDim, fontSize: 10 }}>{r.fundScore}</span>
                      </div>
                    </td>
                    <td style={{ padding: "9px 8px", textAlign: "right" }}>
                      <span style={{ color: r.upsideScore >= 12 ? C.green : C.textDim, fontWeight: r.upsideScore >= 12 ? 800 : 400 }}>
                        {r.upsideScore >= 12 ? "🚀 " : ""}{r.upsideScore}
                      </span>
                    </td>
                    <td style={{ padding: "9px 8px", textAlign: "right",
                      color: r.rsi < 35 ? C.green : r.rsi > 65 ? C.red : C.textDim, fontWeight: r.rsi < 35 ? 800 : 400 }}>
                      {r.rsi}{r.rsi < 35 ? " 🔥" : ""}
                    </td>
                    <td style={{ padding: "9px 8px", textAlign: "right", color: r.rvol >= 2 ? C.amber : C.textDim }}>
                      {r.rvol > 0 ? r.rvol + "x" : "—"}
                    </td>
                    <td style={{ padding: "9px 8px", textAlign: "right", color: C.textDim, fontSize: 11 }}>
                      {r.from52Hi > 0 ? `+${r.from52Hi}%` : "—"}
                    </td>
                    <td style={{ padding: "9px 8px", textAlign: "right", color: C.textDim, fontSize: 10 }}>
                      {r.mktCapM ? `$${r.mktCapM >= 1000 ? (r.mktCapM/1000).toFixed(1)+"B" : r.mktCapM+"M"}` : "—"}
                    </td>
                    <td style={{ padding: "9px 8px", maxWidth: 200 }}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {r.signals.slice(0, 2).map((s, si) => (
                          <span key={si} style={{ fontFamily: SANS, fontSize: 9, color: C.green,
                            background: `${C.green}15`, borderRadius: 3, padding: "1px 5px", whiteSpace: "nowrap" }}>{s}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: "9px 6px" }}>
                      <button onClick={() => {
                        navigator.clipboard?.writeText(r.sym).catch(() => {});
                        setActiveTab("smartscan");
                      }} style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, padding: "4px 10px",
                        borderRadius: 5, border: "none", cursor: "pointer", whiteSpace: "nowrap",
                        background: r.total >= 55 ? C.green : `${C.accent}20`,
                        color: r.total >= 55 ? "#fff" : C.accent }}>
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

      {!loading && data && rows.length === 0 && (
        <div style={{ padding: 30, textAlign: "center", fontFamily: SANS, fontSize: 13, color: C.textDim }}>
          No stocks found matching filter. Try "All" or click ↻.
        </div>
      )}

      {/* Score explanation */}
      <div style={{ padding: "10px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, marginBottom: 6, letterSpacing: "0.08em" }}>HOW SCORES WORK</div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontFamily: SANS, fontSize: 11, color: C.textDim }}>
          <span><strong style={{ color: C.green }}>TECH (0-50)</strong> RSI + EMA + Volume + Support</span>
          <span><strong style={{ color: C.amber }}>FUND (0-30)</strong> PE + Revenue growth + Market cap</span>
          <span><strong style={{ color: C.accent }}>UPSIDE (0-20)</strong> Distance from 52w high + Volatility</span>
          <span><strong style={{ color: C.text }}>Filters</strong> avgVol &gt;300K, mktCap &gt;$30M, no micro-cap traps</span>
        </div>
      </div>
    </div>
  );
}
