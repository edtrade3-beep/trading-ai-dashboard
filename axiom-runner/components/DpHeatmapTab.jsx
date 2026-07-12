export default function DpHeatmapTab({
  C, MONO, SANS, dpHeatData, setDpHeatData, dpLoad, setDpLoad, setTerminalSymbol, setActiveTab,
}) {
          // No hooks here — state hoisted to top level
          const dpHeatLoad = !dpHeatData;
          const fmtM = v => v >= 1000 ? "$" + (v/1000).toFixed(1) + "B" : "$" + v.toFixed(0) + "M";
          return (
            <div style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>🏦 DARK POOL HEAT MAP</span>
                <button onClick={() => { setDpLoad(true); fetch("/api/market/darkpool-heatmap").then(r=>r.json()).then(d=>{ if(d.ok) setDpHeatData(d); }).catch(()=>{}).finally(()=>setDpLoad(false)); }}
                  style={{ fontFamily: MONO, fontSize: 12, border: `1px solid ${C.accent}`, background: `${C.accent}18`, color: C.accent, borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>
                  {dpLoad ? "⌛" : "↺ REFRESH"}
                </button>
                {dpHeatData && <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Updated: {new Date(dpHeatData.scannedAt).toLocaleTimeString()}</span>}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginBottom: 16 }}>
                Most active dark pool tickers by total premium today. Institutions buy/sell in dark pools before moving the public market.
              </div>
              {dpHeatLoad && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>⌛ Loading dark pool activity…</div>}
              {dpHeatData && dpHeatData.stocks.length === 0 && (
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>No dark pool data. Check UNUSUAL_WHALES_API_KEY in settings.</div>
              )}
              {dpHeatData && dpHeatData.stocks.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                  {dpHeatData.stocks.map((s, i) => {
                    const intensity = Math.min(1, s.value / Math.max(...dpHeatData.stocks.map(x=>x.value)));
                    const col = intensity > 0.7 ? C.accent : intensity > 0.4 ? C.green : "#4caf50";
                    return (
                      <div key={i} onClick={() => { setTerminalSymbol(s.sym); try { localStorage.setItem("mterminal_load_sym", s.sym); } catch {} setActiveTab("mterminal"); }}
                        style={{ padding: "12px 14px", borderRadius: 8, cursor: "pointer",
                          background: `${col}${Math.round(intensity * 30).toString(16).padStart(2,"0")}`,
                          border: `1px solid ${col}${Math.round(intensity * 60).toString(16).padStart(2,"0")}` }}>
                        <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: col }}>{s.sym}</div>
                        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.text, marginTop: 4 }}>{fmtM(s.value)}</div>
                        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>{s.prints} prints</div>
                        <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: C.border }}>
                          <div style={{ width: `${intensity * 100}%`, height: "100%", background: col, borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
}
