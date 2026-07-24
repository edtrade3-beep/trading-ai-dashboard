export default function ShortIntTab({
  C, MONO, watchlistSymbols, shortIntInput, setShortIntInput, fetchShortInterest,
  shortIntLoading, shortIntData, themeMode, setActiveTab, setTerminalSymbol,
}) {
        const card = (extra = {}) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, ...extra });
        const defaultTickers = watchlistSymbols.slice(0, 20).join(",");
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Header */}
            <div style={{ ...card({ padding: "14px 18px" }), display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text }}>🩳 SHORT INTEREST</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 3 }}>Short float %, days-to-cover, squeeze potential</div>
              </div>
              <input value={shortIntInput || defaultTickers}
                onChange={e => setShortIntInput(e.target.value.toUpperCase())}
                placeholder="BBAI,PLTR,RKLB…"
                style={{ fontFamily: MONO, fontSize: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "7px 12px", flex: "1 1 220px", outline: "none" }} />
              <button onClick={() => fetchShortInterest(shortIntInput || defaultTickers)} disabled={shortIntLoading}
                style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, background: shortIntLoading ? C.surface : C.accent, border: "none", color: shortIntLoading ? C.textDim : "#fff", borderRadius: 6, padding: "9px 18px", cursor: shortIntLoading ? "default" : "pointer" }}>
                {shortIntLoading ? "LOADING…" : "FETCH DATA"}
              </button>
            </div>

            {/* Legend */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[{ color: C.green, label: "< 5% — Low short interest" }, { color: C.amber, label: "5-15% — Moderate" }, { color: C.red, label: "> 15% — High squeeze potential" }].map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{l.label}</span>
                </div>
              ))}
            </div>

            {/* Table */}
            {shortIntData.length > 0 && (
              <div style={{ ...card({ overflow: "hidden" }) }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: C.surface }}>
                        {["TICKER","SHORT FLOAT %","DAYS TO COVER","SHARES SHORT","VS PRIOR MONTH","AS OF"].map(h => (
                          <th key={h} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.textDim, padding: "9px 14px", textAlign: h === "TICKER" ? "left" : "right", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shortIntData.sort((a, b) => (b.shortFloat || 0) - (a.shortFloat || 0)).map((row, i) => {
                        const sf = row.shortFloat;
                        const sfColor = sf == null ? C.textDim : sf > 15 ? C.red : sf > 5 ? C.amber : C.green;
                        const change = row.sharesShort && row.sharesShortPrior ? ((row.sharesShort - row.sharesShortPrior) / row.sharesShortPrior * 100) : null;
                        return (
                          <tr key={row.symbol} style={{ borderTop: `1px solid ${C.border}33`, background: i % 2 === 0 ? "transparent" : (themeMode === "dark" ? "#ffffff04" : "#00000003") }}>
                            <td style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.accent, padding: "9px 14px" }}>
                              <button onClick={() => { setTerminalSymbol(row.symbol); try { localStorage.setItem("mterminal_load_sym", row.symbol); } catch {} setActiveTab("mterminal"); }}
                                style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 13, fontWeight: 800, cursor: "pointer", padding: 0 }}>
                                {row.symbol}
                              </button>
                            </td>
                            <td style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: sfColor, textAlign: "right", padding: "9px 14px" }}>
                              {sf != null ? sf.toFixed(1) + "%" : "—"}
                              {sf != null && sf > 15 && <span style={{ marginLeft: 6, fontSize: 12, color: C.red }}>🔥 SQUEEZE</span>}
                            </td>
                            <td style={{ fontFamily: MONO, fontSize: 12, color: row.shortRatio > 5 ? C.amber : C.text, textAlign: "right", padding: "9px 14px" }}>
                              {row.shortRatio != null ? row.shortRatio.toFixed(1) + " days" : "—"}
                            </td>
                            <td style={{ fontFamily: MONO, fontSize: 12, color: C.textSec, textAlign: "right", padding: "9px 14px" }}>
                              {row.sharesShort ? (row.sharesShort / 1e6).toFixed(1) + "M" : "—"}
                            </td>
                            <td style={{ fontFamily: MONO, fontSize: 12, color: change == null ? C.textDim : change > 0 ? C.red : C.green, textAlign: "right", padding: "9px 14px" }}>
                              {change != null ? (change > 0 ? "+" : "") + change.toFixed(1) + "%" : "—"}
                            </td>
                            <td style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "right", padding: "9px 14px" }}>
                              {row.dateShortInterest || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {!shortIntData.length && !shortIntLoading && (
              <div style={{ ...card({ padding: 32 }), textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🩳</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Enter tickers above and click Fetch Data</div>
              </div>
            )}
          </div>
        );
}
