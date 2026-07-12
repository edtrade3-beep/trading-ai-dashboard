export default function DarkPoolTab({
  C, MONO, dpSym, setDpSym, dpLoad, setDpLoad, dpData, setDpData, dpErr, setDpErr,
  setTerminalSymbol, setActiveTab,
}) {
          const fetchDarkPool = async (sym) => {
            setDpLoad(true); setDpErr(null);
            try {
              const r = await fetch("/api/market/darkpool" + (sym ? "?symbol=" + sym : ""));
              const d = await r.json();
              if (!d.ok) throw new Error(d.error || "Failed");
              setDpData(d);
            } catch(e) { setDpErr(e.message); }
            setDpLoad(false);
          };
          const fmtVal = v => v >= 1e9 ? "$" + (v/1e9).toFixed(2) + "B" : v >= 1e6 ? "$" + (v/1e6).toFixed(1) + "M" : "$" + (v/1e3).toFixed(0) + "K";
          return (
            <div style={{ padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>🏦 DARK POOL PRINTS</span>
                <input value={dpSym} onChange={e => setDpSym(e.target.value.toUpperCase())} placeholder="Filter ticker…"
                  style={{ border: "1px solid " + C.border, background: C.surface, color: C.text, borderRadius: 6, padding: "4px 8px", fontFamily: MONO, fontSize: 12, width: 120 }} />
                <button onClick={() => fetchDarkPool(dpSym)}
                  style={{ border: "1px solid " + C.accent, background: C.accent + "18", color: C.accent, borderRadius: 6, padding: "4px 12px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>
                  {dpLoad ? "⌛" : "🔍 SCAN"}
                </button>
                {dpData && <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Updated: {new Date(dpData.scannedAt).toLocaleTimeString()}</span>}
              </div>
              {dpErr && <div style={{ fontFamily: MONO, fontSize: 12, color: C.red, marginBottom: 10 }}>⚠ {dpErr}</div>}
              {dpData && dpData.prints.length === 0 && !dpLoad && (
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center", padding: 40 }}>No block prints found. Configure UNUSUAL_WHALES_API_KEY in env vars.</div>
              )}
              {dpData && dpData.prints.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ background: C.surface }}>
                    {["TICKER","PRICE","SIZE","VALUE","TIME"].map(h => (
                      <th key={h} style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "8px 12px", textAlign: "left", borderBottom: "1px solid " + C.border, letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {dpData.prints.map((p, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : C.surface, cursor: "pointer" }}
                        onClick={() => { setTerminalSymbol(p.ticker); try { localStorage.setItem("mterminal_load_sym", p.ticker); } catch {} setActiveTab("mterminal"); }}>
                        <td style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.accent, padding: "10px 12px", borderBottom: "1px solid " + C.border + "22" }}>{p.ticker}</td>
                        <td style={{ fontFamily: MONO, fontSize: 12, color: C.text, padding: "10px 12px", borderBottom: "1px solid " + C.border + "22" }}>${Number(p.price).toFixed(2)}</td>
                        <td style={{ fontFamily: MONO, fontSize: 12, color: C.textSec, padding: "10px 12px", borderBottom: "1px solid " + C.border + "22" }}>{Number(p.size).toLocaleString()}</td>
                        <td style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: p.value >= 5e6 ? C.accent : C.green, padding: "10px 12px", borderBottom: "1px solid " + C.border + "22" }}>{fmtVal(p.value)}</td>
                        <td style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "10px 12px", borderBottom: "1px solid " + C.border + "22" }}>{p.time ? new Date(p.time).toLocaleTimeString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
}
