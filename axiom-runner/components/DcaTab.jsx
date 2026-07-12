export default function DcaTab({
  C, MONO, dcaTicker, setDcaTicker, dcaAmount, setDcaAmount, dcaPeriod, setDcaPeriod,
  dcaMonths, setDcaMonths, dcaReturn, setDcaReturn, computeDCA, dcaResult,
}) {
        const card = (extra = {}) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, ...extra });
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ ...card({ padding: "14px 18px" }) }}>
              <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.green, marginBottom: 14 }}>📈 DCA PLANNER</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 5 }}>TICKER</div>
                  <input value={dcaTicker} onChange={e => setDcaTicker(e.target.value.toUpperCase())}
                    style={{ width: "100%", fontFamily: MONO, fontSize: 13, fontWeight: 700, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "8px 10px", boxSizing: "border-box", outline: "none" }} />
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 5 }}>AMOUNT ($)</div>
                  <input type="number" value={dcaAmount} onChange={e => setDcaAmount(e.target.value)}
                    style={{ width: "100%", fontFamily: MONO, fontSize: 13, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "8px 10px", boxSizing: "border-box", outline: "none" }} />
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 5 }}>FREQUENCY</div>
                  <select value={dcaPeriod} onChange={e => setDcaPeriod(e.target.value)}
                    style={{ width: "100%", fontFamily: MONO, fontSize: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "8px 10px", boxSizing: "border-box", outline: "none" }}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 5 }}>MONTHS</div>
                  <input type="number" value={dcaMonths} onChange={e => setDcaMonths(e.target.value)} min={1} max={120}
                    style={{ width: "100%", fontFamily: MONO, fontSize: 13, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "8px 10px", boxSizing: "border-box", outline: "none" }} />
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 5 }}>ANNUAL RETURN (%)</div>
                  <input type="number" value={dcaReturn} onChange={e => setDcaReturn(e.target.value)} min={0} max={100}
                    style={{ width: "100%", fontFamily: MONO, fontSize: 13, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "8px 10px", boxSizing: "border-box", outline: "none" }} />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button onClick={computeDCA}
                    style={{ width: "100%", fontFamily: MONO, fontSize: 12, fontWeight: 700, background: C.green, border: "none", color: "#fff", borderRadius: 6, padding: "10px 0", cursor: "pointer" }}>
                    CALCULATE
                  </button>
                </div>
              </div>
            </div>
            {dcaResult && (() => {
              const { fv, invested, gain, gainPct, curve } = dcaResult;
              const maxVal = Math.max(...curve.map(c => c.value));
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Summary metrics */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                    <div style={{ ...card({ padding: 18, textAlign: "center", borderLeft: `4px solid ${C.green}` }) }}>
                      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.green }}>${fv.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>FINAL VALUE</div>
                    </div>
                    <div style={{ ...card({ padding: 18, textAlign: "center" }) }}>
                      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.text }}>${invested.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>TOTAL INVESTED</div>
                    </div>
                    <div style={{ ...card({ padding: 18, textAlign: "center", borderLeft: `4px solid ${C.accent}` }) }}>
                      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.accent }}>${gain.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>TOTAL GAIN</div>
                    </div>
                    <div style={{ ...card({ padding: 18, textAlign: "center", borderLeft: `4px solid ${C.accent}` }) }}>
                      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.accent }}>{gainPct.toFixed(1)}%</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>RETURN</div>
                    </div>
                  </div>
                  {/* Equity curve */}
                  <div style={{ ...card({ padding: 16 }) }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.green, marginBottom: 12 }}>EQUITY CURVE — {dcaTicker}</div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 120, padding: "0 4px" }}>
                      {curve.map((pt, i) => (
                        <div key={i} title={`Month ${pt.month}: $${pt.value.toFixed(0)}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, height: "100%" }}>
                          <div style={{ width: "100%", background: `${C.green}88`, borderRadius: "2px 2px 0 0", height: `${(pt.invested / maxVal) * 100}%`, minHeight: 2 }} />
                          <div style={{ width: "100%", background: C.green, borderRadius: "2px 2px 0 0", height: `${Math.max(0, (pt.value - pt.invested) / maxVal * 100)}%`, marginTop: "-2px" }} />
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 12, height: 8, background: `${C.green}88`, borderRadius: 2 }} /><span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Invested</span></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 12, height: 8, background: C.green, borderRadius: 2 }} /><span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Growth</span></div>
                    </div>
                  </div>
                </div>
              );
            })()}
            {!dcaResult && (
              <div style={{ ...card({ padding: 60, textAlign: "center" }) }}>
                <div style={{ fontFamily: MONO, fontSize: 32, marginBottom: 12 }}>📈</div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>Set parameters and click CALCULATE</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 6 }}>Projects the future value of regular investments using compound growth</div>
              </div>
            )}
          </div>
        );
}
