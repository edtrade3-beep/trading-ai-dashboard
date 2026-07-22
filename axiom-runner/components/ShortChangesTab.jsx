// AI TAKE — a real Claude call over the same real short-interest change
// data this tab already renders (never a symbol/percentage the model
// typed): what to do, what to avoid, and why. Same "real data in, judgment
// out" pattern as CotTab's AiTakeSection.
function AiTakeSection({ C, MONO, SANS }) {
  const [take, setTake] = React.useState(null);
  const [state, setState] = React.useState("loading"); // loading | ok | empty | error
  const [error, setError] = React.useState(null);
  const [generating, setGenerating] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/market/short-changes/ai-take").then(r => r.json()).then(d => {
      if (d && d.ok && d.take) { setTake(d.take); setState("ok"); }
      else setState("empty");
    }).catch(() => setState("error"));
  }, []);

  const generate = () => {
    setGenerating(true); setError(null);
    fetch("/api/market/short-changes/ai-take/refresh", { method: "POST" }).then(r => r.json()).then(d => {
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
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Click "GENERATE TAKE" for an honest AI read on what this real short-interest data means — what to do, what to avoid, and why.</div>
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
            AI-synthesized from real weekly short-interest data — not financial advice, cross-check before acting.
          </div>
        </>
      )}
    </div>
  );
}

// No hooks here — state hoisted to App()
export default function ShortChangesTab({ C, MONO, SANS, shortChgData, setTerminalSymbol, setActiveTab }) {
  const scLoad = !shortChgData;
  const fmtPct = v => v > 0 ? "+" + v.toFixed(1) + "%" : v.toFixed(1) + "%";
  const Section = ({ title, col, rows, cols }) => (
    <div style={{ flex: 1, minWidth: 280 }}>
      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: col, marginBottom: 10, letterSpacing: "0.06em" }}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ background: C.surface }}>
          {cols.map(c => <th key={c} style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "6px 8px", textAlign: "left", borderBottom: `1px solid ${C.border}` }}>{c}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : C.surface, cursor: "pointer" }}
              onClick={() => { setTerminalSymbol(r.sym); try { localStorage.setItem("mterminal_load_sym", r.sym); } catch {} setActiveTab("mterminal"); }}>
              <td style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.accent, padding: "9px 8px" }}>{r.sym}</td>
              <td style={{ fontFamily: MONO, fontSize: 12, color: C.text, padding: "9px 8px" }}>${r.price}</td>
              <td style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: r.shortFloat > 20 ? C.red : r.shortFloat > 10 ? C.amber : C.text, padding: "9px 8px" }}>{r.shortFloat > 0 ? r.shortFloat.toFixed(1) + "%" : "—"}</td>
              <td style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: r.shortChange > 5 ? C.red : r.shortChange < -5 ? C.green : C.text, padding: "9px 8px" }}>{r.shortChange != null ? fmtPct(r.shortChange) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div style={{ padding: "16px 20px" }}>
      <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text, marginBottom: 16 }}>🩳 SHORT INTEREST CHANGES</div>
      <AiTakeSection C={C} MONO={MONO} SANS={SANS} />
      {scLoad && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>⌛ Loading short interest data…</div>}
      {shortChgData && (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <Section title="🔴 SHORTS INCREASING — Bears Adding" col={C.red} rows={shortChgData.increasing || []} cols={["TICKER","PRICE","FLOAT SHORT","WK CHG%"]} />
          <Section title="🟢 SHORT COVERING — Bears Running" col={C.green} rows={shortChgData.covering || []} cols={["TICKER","PRICE","FLOAT SHORT","WK CHG%"]} />
          <Section title="⚡ HIGHEST SHORT FLOAT — Squeeze Candidates" col={C.amber} rows={shortChgData.highShort || []} cols={["TICKER","PRICE","FLOAT SHORT","WK CHG%"]} />
        </div>
      )}
    </div>
  );
}
