export default function CorrelationTab({
  C, MONO, themeMode, scanDeepData, computeCorrelation, corrLoading, corrMatrix,
}) {
        const card = (extra = {}) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, ...extra });
        const corrColor = (v) => {
          if (v >= 0.7)  return themeMode === "dark" ? "rgba(34,212,126,0.55)"  : "rgba(5,150,105,0.50)";
          if (v >= 0.3)  return themeMode === "dark" ? "rgba(34,212,126,0.20)"  : "rgba(5,150,105,0.18)";
          if (v >= -0.3) return themeMode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
          if (v >= -0.7) return themeMode === "dark" ? "rgba(255,69,96,0.20)"   : "rgba(220,38,38,0.18)";
          return themeMode === "dark" ? "rgba(255,69,96,0.55)" : "rgba(220,38,38,0.50)";
        };
        const availSyms = Object.keys(scanDeepData).filter(t => scanDeepData[t]?.candles?.length >= 20);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ ...card({ padding: "14px 18px" }), display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text }}>🔗 CORRELATION MATRIX</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 3 }}>
                  Pearson correlation of daily returns · {availSyms.length} tickers with candle data loaded
                </div>
              </div>
              <button onClick={computeCorrelation} disabled={corrLoading || availSyms.length < 2}
                style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, fontWeight: 700,
                  background: corrLoading || availSyms.length < 2 ? C.surface : C.accent,
                  border: "none", color: corrLoading || availSyms.length < 2 ? C.textDim : "#fff",
                  borderRadius: 6, padding: "9px 18px", cursor: corrLoading || availSyms.length < 2 ? "default" : "pointer" }}>
                {corrLoading ? "COMPUTING…" : "CALCULATE"}
              </button>
            </div>

            {/* Color legend */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[{ bg: corrColor(0.8), label: "> 0.7 Strong positive" }, { bg: corrColor(0.5), label: "0.3–0.7 Moderate" }, { bg: corrColor(0), label: "Near zero" }, { bg: corrColor(-0.5), label: "-0.7–-0.3 Moderate inverse" }, { bg: corrColor(-0.8), label: "< -0.7 Strong inverse" }].map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 2, background: l.bg, border: `1px solid ${C.border}` }} />
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{l.label}</span>
                </div>
              ))}
            </div>

            {availSyms.length < 2 && (
              <div style={{ ...card({ padding: 32 }), textAlign: "center" }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 8 }}>
                  Need ≥2 tickers with candle data
                </div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                  Go to <strong style={{ color: C.accent }}>WATCHLIST → SMART SCAN</strong> and expand any ticker to load candle data, then come back here.
                </div>
              </div>
            )}

            {corrMatrix?.error && (
              <div style={{ ...card({ padding: 20 }), borderLeft: `3px solid ${C.red}` }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>{corrMatrix.error}</div>
              </div>
            )}

            {corrMatrix?.matrix && (
              <div style={{ ...card({ overflow: "auto", padding: 16 }) }}>
                <table style={{ borderCollapse: "separate", borderSpacing: 3 }}>
                  <thead>
                    <tr>
                      <th style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "4px 8px", textAlign: "right" }}></th>
                      {corrMatrix.syms.map(s => (
                        <th key={s} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.textDim, padding: "4px 8px", textAlign: "center", whiteSpace: "nowrap" }}>{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {corrMatrix.syms.map(s1 => (
                      <tr key={s1}>
                        <td style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.textDim, padding: "4px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{s1}</td>
                        {corrMatrix.syms.map(s2 => {
                          const v = corrMatrix.matrix[s1][s2];
                          const isDiag = s1 === s2;
                          return (
                            <td key={s2} title={`${s1} vs ${s2}: ${v.toFixed(2)}`}
                              style={{ background: isDiag ? `${C.accent}22` : corrColor(v),
                                border: `1px solid ${C.border}33`, borderRadius: 6,
                                fontFamily: MONO, fontSize: 12, fontWeight: isDiag ? 800 : 600,
                                color: isDiag ? C.accent : C.text,
                                padding: "6px 8px", textAlign: "center", minWidth: 48 }}>
                              {isDiag ? "—" : v.toFixed(2)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {corrMatrix.computedAt && (
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 10 }}>Computed {new Date(corrMatrix.computedAt).toLocaleTimeString()}</div>
                )}
              </div>
            )}
          </div>
        );
}
