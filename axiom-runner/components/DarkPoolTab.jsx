// AI TAKE — a real Claude call over the same real dark pool prints this tab
// already renders (never a ticker/value the model typed): what to do, what
// to avoid, and why. Same "real data in, judgment out" pattern as CotTab's
// AiTakeSection. Depends entirely on UNUSUAL_WHALES_API_KEY being
// configured server-side — with no key, GENERATE will honestly report that
// rather than fabricate a read on data that doesn't exist.
function AiTakeSection({ C, MONO, SANS }) {
  const [take, setTake] = React.useState(null);
  const [state, setState] = React.useState("loading"); // loading | ok | empty | error
  const [error, setError] = React.useState(null);
  const [generating, setGenerating] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/market/darkpool/ai-take").then(r => r.json()).then(d => {
      if (d && d.ok && d.take) { setTake(d.take); setState("ok"); }
      else setState("empty");
    }).catch(() => setState("error"));
  }, []);

  const generate = () => {
    setGenerating(true); setError(null);
    fetch("/api/market/darkpool/ai-take/refresh", { method: "POST" }).then(r => r.json()).then(d => {
      if (d && d.ok && d.take) { setTake(d.take); setState("ok"); }
      else { setError(d?.error || "Unknown error"); setState("error"); }
    }).catch((e) => { setError(e.message || "Network error"); setState("error"); }).finally(() => setGenerating(false));
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.accent}44`, borderRadius: 12, padding: "14px 16px", marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: "0.08em" }}>
          🤖 AI TAKE — WHAT TO DO
        </div>
        <button onClick={generate} disabled={generating}
          style={{ background: generating ? C.surface : `${C.accent}1a`, border: `1px solid ${C.accent}55`, color: generating ? C.textDim : C.accent,
            fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 5, cursor: generating ? "not-allowed" : "pointer" }}>
          {generating ? "⏳ THINKING…" : take ? "↻ NEW TAKE" : "GENERATE TAKE"}
        </button>
      </div>

      {state === "loading" && !take && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading…</div>}
      {state === "error" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>Couldn't generate a take: {error || "unknown error"}</div>}
      {state === "empty" && !generating && !take && (
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Click "GENERATE TAKE" for an honest AI read on what today's real dark pool prints mean — what to do, what to avoid, and why.</div>
      )}

      {take && (
        <>
          <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.6, marginBottom: 14 }}>{take.overallTake}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.green, letterSpacing: "0.06em", marginBottom: 8 }}>✅ DO</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(take.doThis || []).map((d, i) => (
                  <div key={i} style={{ background: `${C.green}0c`, border: `1px solid ${C.green}33`, borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{d.action}</div>
                    <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginTop: 3, lineHeight: 1.4 }}>{d.why}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.red, letterSpacing: "0.06em", marginBottom: 8 }}>🚫 AVOID</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(take.avoidThis || []).map((d, i) => (
                  <div key={i} style={{ background: `${C.red}0c`, border: `1px solid ${C.red}33`, borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{d.action}</div>
                    <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginTop: 3, lineHeight: 1.4 }}>{d.why}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {take.watchFor && (
            <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, lineHeight: 1.5, fontStyle: "italic", borderTop: `1px solid ${C.border}55`, paddingTop: 8 }}>
              👁 Watch for: {take.watchFor}
            </div>
          )}
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 8 }}>
            AI-synthesized from real dark pool print data — not financial advice, cross-check before acting.
          </div>
        </>
      )}
    </div>
  );
}

export default function DarkPoolTab({
  C, MONO, SANS, dpSym, setDpSym, dpLoad, setDpLoad, dpData, setDpData, dpErr, setDpErr,
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

              <AiTakeSection C={C} MONO={MONO} SANS={SANS} />

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
