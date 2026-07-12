export default function IpoTab({
  C, MONO, fetchDividendCalendar, dividendLoading, dividendData,
}) {
        const card = (extra = {}) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, ...extra });
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ ...card({ padding: "14px 18px" }), display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.green }}>💸 DIVIDEND TRACKER</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 2 }}>Ex-dividend dates, yields, payout ratios & stock splits</div>
              </div>
              <button onClick={fetchDividendCalendar} disabled={dividendLoading} style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, fontWeight: 700, background: dividendLoading ? C.surface : C.green, border: "none", color: dividendLoading ? C.textDim : "#fff", borderRadius: 6, padding: "9px 18px", cursor: dividendLoading ? "default" : "pointer" }}>
                {dividendLoading ? "LOADING…" : "LOAD DIVIDENDS"}
              </button>
            </div>
            {dividendLoading && <div style={{ ...card({ padding: 40, textAlign: "center" }) }}><span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Fetching dividend data…</span></div>}
            {dividendData && !dividendLoading && (() => {
              const items = dividendData;
              if (!items.length) return (
                <div style={{ ...card({ padding: 40, textAlign: "center" }) }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>No dividend data found for watchlist tickers</div>
                </div>
              );
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {items.map((d, i) => (
                    <div key={i} style={{ ...card({ padding: "14px 18px" }), display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.accent }}>{d.symbol}</div>
                        {/* dates are returned as formatted strings like "2026-03-14", not Unix timestamps */}
                        {d.exDividendDate && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 2 }}>Ex-Div: {d.exDividendDate}</div>}
                        {d.dividendDate && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Pay Date: {d.dividendDate}</div>}
                        {d.lastSplitFactor && <div style={{ fontFamily: MONO, fontSize: 12, color: C.amber, marginTop: 4 }}>Split: {d.lastSplitFactor} ({d.lastSplitDate || "—"})</div>}
                      </div>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        {d.dividendYield > 0 && (
                          <div style={{ textAlign: "center" }}>
                            {/* dividendYield from backend is already a % value (e.g. 1.23 = 1.23%) */}
                            <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.green }}>{Number(d.dividendYield).toFixed(2)}%</div>
                            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>YIELD</div>
                          </div>
                        )}
                        {d.dividendRate > 0 && (
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.text }}>${Number(d.dividendRate).toFixed(2)}</div>
                            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>ANNUAL</div>
                          </div>
                        )}
                        {d.payoutRatio > 0 && (
                          <div style={{ textAlign: "center" }}>
                            {/* payoutRatio is already a % (e.g. 45 = 45%) */}
                            <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: d.payoutRatio > 90 ? C.red : d.payoutRatio > 60 ? C.amber : C.text }}>{Number(d.payoutRatio).toFixed(0)}%</div>
                            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>PAYOUT</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {!dividendData && !dividendLoading && (
              <div style={{ ...card({ padding: 60, textAlign: "center" }) }}>
                <div style={{ fontFamily: MONO, fontSize: 32, marginBottom: 12 }}>💸</div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>Click LOAD DIVIDENDS to fetch your watchlist</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 6 }}>Shows dividend yields, ex-dates, payout ratios, and stock splits</div>
              </div>
            )}
          </div>
        );
}
