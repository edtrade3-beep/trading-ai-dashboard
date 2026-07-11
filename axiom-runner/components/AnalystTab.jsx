export default function AnalystTab({
  C, MONO, analystInput, setAnalystInput, fetchAnalystRatings, analystLoading, analystTicker, analystData,
}) {
        const card = (extra = {}) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, ...extra });
        const AN_TICKERS = ["AAPL","MSFT","NVDA","TSLA","AMZN","GOOGL","META","PLTR","RKLB","BBAI","SMR","OKLO"];
        const recColor = (r = "") => {
          r = r.toLowerCase();
          if (r.includes("strong buy") || r.includes("buy")) return C.green;
          if (r.includes("sell") || r.includes("underperform")) return C.red;
          return C.amber;
        };
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ ...card({ padding: "14px 18px" }), display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.accent }}>🎯 ANALYST RATINGS</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 2 }}>Wall Street consensus · price targets · upgrade/downgrade history</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }}>
                <input value={analystInput} onChange={e => setAnalystInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === "Enter" && analystInput.trim()) fetchAnalystRatings(analystInput.trim()); }}
                  placeholder="Ticker…"
                  style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "7px 12px", width: 120, outline: "none" }} />
                <button onClick={() => analystInput.trim() && fetchAnalystRatings(analystInput.trim())} disabled={analystLoading}
                  style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, background: analystLoading ? C.surface : C.accent, border: "none", color: analystLoading ? C.textDim : "#fff", borderRadius: 6, padding: "9px 16px", cursor: analystLoading ? "default" : "pointer" }}>
                  {analystLoading ? "LOADING…" : "FETCH"}
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {AN_TICKERS.map(t => (
                <button key={t} onClick={() => { setAnalystInput(t); fetchAnalystRatings(t); }}
                  style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, background: analystTicker === t && analystData ? `${C.accent}22` : C.surface, border: `1px solid ${analystTicker === t && analystData ? C.accent : C.border}`, color: analystTicker === t && analystData ? C.accent : C.textDim, borderRadius: 6, padding: "5px 10px", cursor: "pointer" }}>{t}</button>
              ))}
            </div>
            {analystLoading && <div style={{ ...card({ padding: 40, textAlign: "center" }) }}><span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading analyst data…</span></div>}
            {analystData && !analystLoading && (() => {
              const ad = analystData;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Summary card */}
                  <div style={{ ...card({ padding: 20, borderLeft: `4px solid ${recColor(ad.recommendation)}` }), display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>TICKER</div>
                      <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 900, color: C.accent }}>{ad.symbol}</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>CONSENSUS</div>
                      <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: recColor(ad.recommendation) }}>{ad.recommendation?.toUpperCase() || "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>ANALYSTS</div>
                      <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: C.text }}>{ad.numAnalysts || "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>CURRENT PRICE</div>
                      <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: C.text }}>${ad.currentPrice?.toFixed(2) || "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>PRICE TARGETS</div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>Low ${ad.targetLow?.toFixed(0)}</span>
                        <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.accent }}>Mean ${ad.targetMean?.toFixed(0)}</span>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: C.green }}>High ${ad.targetHigh?.toFixed(0)}</span>
                      </div>
                      {ad.currentPrice && ad.targetMean && (
                        <div style={{ fontFamily: MONO, fontSize: 12, color: ad.targetMean > ad.currentPrice ? C.green : C.red, marginTop: 2 }}>
                          {ad.targetMean > ad.currentPrice ? "+" : ""}{(((ad.targetMean - ad.currentPrice) / ad.currentPrice) * 100).toFixed(1)}% upside
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Upgrade/downgrade history */}
                  {ad.history?.length > 0 && (
                    <div style={{ ...card({ padding: 16 }) }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, marginBottom: 10 }}>RATING HISTORY</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {ad.history.slice(0, 12).map((h, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", background: h.action === "up" ? C.greenBg : h.action === "down" ? C.redBg : C.surface, borderRadius: 6, flexWrap: "wrap", gap: 6 }}>
                            <div>
                              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{h.firm}</span>
                              <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginLeft: 8 }}>{h.date}</span>
                            </div>
                            <div>
                              <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{h.fromGrade} → </span>
                              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: h.action === "up" ? C.green : h.action === "down" ? C.red : C.amber }}>{h.toGrade}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Trend table */}
                  {ad.trend?.length > 0 && (
                    <div style={{ ...card({ padding: 16 }) }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, marginBottom: 10 }}>RECOMMENDATION TREND</div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 12 }}>
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                              {["PERIOD","STR BUY","BUY","HOLD","SELL","STR SELL"].map(h => (
                                <th key={h} style={{ padding: "6px 10px", textAlign: "center", color: C.textDim, fontSize: 12, fontWeight: 600 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {ad.trend.map((row, i) => (
                              <tr key={i} style={{ borderBottom: `1px solid ${C.border}30` }}>
                                <td style={{ padding: "8px 10px", color: C.textSec, fontSize: 12 }}>{row.period}</td>
                                <td style={{ padding: "8px 10px", textAlign: "center", color: C.green, fontWeight: 700 }}>{row.strongBuy || 0}</td>
                                <td style={{ padding: "8px 10px", textAlign: "center", color: C.green }}>{row.buy || 0}</td>
                                <td style={{ padding: "8px 10px", textAlign: "center", color: C.amber }}>{row.hold || 0}</td>
                                <td style={{ padding: "8px 10px", textAlign: "center", color: C.red }}>{row.sell || 0}</td>
                                <td style={{ padding: "8px 10px", textAlign: "center", color: C.red, fontWeight: 700 }}>{row.strongSell || 0}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            {!analystData && !analystLoading && (
              <div style={{ ...card({ padding: 60, textAlign: "center" }) }}>
                <div style={{ fontFamily: MONO, fontSize: 32, marginBottom: 12 }}>🎯</div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>Enter a ticker for analyst ratings</div>
              </div>
            )}
          </div>
        );
}
