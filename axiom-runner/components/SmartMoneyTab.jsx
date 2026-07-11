export default function SmartMoneyTab({
  C, MONO, isMobile,
  insiderInput, setInsiderInput, insiderLoading, insiderTicker, insiderData, fetchInsiderData,
}) {
        const card = (extra = {}) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, ...extra });
        const SM_TICKERS = ["AAPL","MSFT","NVDA","TSLA","AMZN","GOOGL","META","PLTR","RKLB","BBAI"];
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ ...card({ padding: "14px 18px" }), display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.accent }}>🏦 SMART MONEY TRACKER</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 2 }}>Insider transactions + institutional ownership from SEC filings</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }}>
                <input value={insiderInput} onChange={e => setInsiderInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === "Enter" && insiderInput.trim()) fetchInsiderData(insiderInput.trim()); }}
                  placeholder="Ticker…"
                  style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "7px 12px", width: 120, outline: "none" }} />
                <button onClick={() => insiderInput.trim() && fetchInsiderData(insiderInput.trim())} disabled={insiderLoading}
                  style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, background: insiderLoading ? C.surface : C.accent, border: "none", color: insiderLoading ? C.textDim : "#fff", borderRadius: 6, padding: "9px 16px", cursor: insiderLoading ? "default" : "pointer" }}>
                  {insiderLoading ? "LOADING…" : "FETCH"}
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SM_TICKERS.map(t => (
                <button key={t} onClick={() => { setInsiderInput(t); fetchInsiderData(t); }}
                  style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, background: insiderTicker === t && insiderData ? `${C.accent}22` : C.surface, border: `1px solid ${insiderTicker === t && insiderData ? C.accent : C.border}`, color: insiderTicker === t && insiderData ? C.accent : C.textDim, borderRadius: 6, padding: "5px 10px", cursor: "pointer" }}>{t}</button>
              ))}
            </div>
            {insiderLoading && <div style={{ ...card({ padding: 40, textAlign: "center" }) }}><span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading insider data…</span></div>}
            {insiderData && !insiderLoading && (() => {
              const ins = insiderData;
              return (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                  {/* Insider Transactions */}
                  <div style={{ ...card({ padding: 16 }) }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, marginBottom: 12, letterSpacing: "0.05em" }}>INSIDER TRANSACTIONS — {ins.symbol}</div>
                    {ins.error ? <div style={{ color: C.red, fontFamily: MONO, fontSize: 12 }}>{ins.error}</div> : ins.transactions?.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {ins.transactions.slice(0, 12).map((t, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: t.type === "BUY" ? C.greenBg : C.redBg, borderRadius: 6, borderLeft: `3px solid ${t.type === "BUY" ? C.green : C.red}` }}>
                            <div>
                              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: t.type === "BUY" ? C.green : C.red }}>{t.type} · {t.name}</div>
                              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{t.role} · {t.date}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{t.shares?.toLocaleString()} shares</div>
                              {t.value > 0 && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>${(t.value / 1e6).toFixed(1)}M</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: 20, textAlign: "center" }}>No recent insider transactions</div>}
                  </div>
                  {/* Institutional Ownership */}
                  <div style={{ ...card({ padding: 16 }) }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.purple, marginBottom: 12, letterSpacing: "0.05em" }}>INSTITUTIONAL OWNERSHIP</div>
                    {ins.error ? <div style={{ color: C.red, fontFamily: MONO, fontSize: 12 }}>{ins.error}</div> : (
                      <>
                        {(ins.insidersPct != null || ins.institutionsPct != null) && (
                          <div style={{ display: "flex", gap: 20, marginBottom: 14, flexWrap: "wrap" }}>
                            {ins.insidersPct != null && (
                              <div style={{ textAlign: "center" }}>
                                <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.amber }}>{Number(ins.insidersPct).toFixed(1)}%</div>
                                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>INSIDERS HELD</div>
                              </div>
                            )}
                            {ins.institutionsPct != null && (
                              <div style={{ textAlign: "center" }}>
                                <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.purple }}>{Number(ins.institutionsPct).toFixed(1)}%</div>
                                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>INSTITUTIONS HELD</div>
                              </div>
                            )}
                          </div>
                        )}
                        {ins.institutions?.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {ins.institutions.slice(0, 10).map((inst, i) => (
                              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: C.surface, borderRadius: 5 }}>
                                <div style={{ fontFamily: MONO, fontSize: 12, color: C.text, fontWeight: 700 }}>{inst.name}</div>
                                <div style={{ fontFamily: MONO, fontSize: 12, color: inst.change > 0 ? C.green : inst.change < 0 ? C.red : C.textDim }}>
                                  {inst.pctHeld != null ? `${Number(inst.pctHeld).toFixed(2)}%` : "—"}
                                  {inst.change != null && <span style={{ marginLeft: 8 }}>{inst.change > 0 ? "+" : ""}{inst.change?.toLocaleString()}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
            {!insiderData && !insiderLoading && (
              <div style={{ ...card({ padding: 60, textAlign: "center" }) }}>
                <div style={{ fontFamily: MONO, fontSize: 32, marginBottom: 12 }}>🏦</div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>Enter a ticker to track smart money</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 6 }}>See who's buying and selling before price moves</div>
              </div>
            )}
          </div>
        );
}
