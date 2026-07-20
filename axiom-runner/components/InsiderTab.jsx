// AI TAKE — a real Claude call over the same real SEC Form 4 purchases this
// tab already renders (never a ticker/value the model typed): what to do,
// what to avoid, and why. Same "real data in, judgment out" pattern as
// CotTab's AiTakeSection.
function AiTakeSection({ C, MONO, SANS }) {
  const [take, setTake] = React.useState(null);
  const [state, setState] = React.useState("loading"); // loading | ok | empty | error
  const [generating, setGenerating] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/scanner/insider/ai-take").then(r => r.json()).then(d => {
      if (d && d.ok && d.take) { setTake(d.take); setState("ok"); }
      else setState("empty");
    }).catch(() => setState("error"));
  }, []);

  const generate = () => {
    setGenerating(true);
    fetch("/api/scanner/insider/ai-take/refresh", { method: "POST" }).then(r => r.json()).then(d => {
      if (d && d.ok && d.take) { setTake(d.take); setState("ok"); }
      else setState("error");
    }).catch(() => setState("error")).finally(() => setGenerating(false));
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.accent}44`, borderRadius: 12, padding: "14px 16px" }}>
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

      {state === "loading" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading…</div>}
      {state === "error" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>Couldn't generate a take — check ANTHROPIC_API_KEY is set, and that purchases have loaded above.</div>}
      {state === "empty" && !generating && (
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Click "GENERATE TAKE" for an honest AI read on what these real insider purchases mean — what to do, what to avoid, and why.</div>
      )}

      {take && state === "ok" && (
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
            AI-synthesized from real SEC Form 4 filings — not financial advice, cross-check before acting.
          </div>
        </>
      )}
    </div>
  );
}

// ── Insider Buy Screener ──────────────────────────────────────────────────────
export default function InsiderTab({ C, MONO, SANS, setActiveTab }) {
  const [data,    setData]    = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error,   setError]   = React.useState(null);

  const load = React.useCallback(() => {
    setLoading(true);
    fetch("/api/scanner/insider")
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d); else setError(d.error); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>🏦 INSIDER BUY SCREENER</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
            SEC Form 4 purchases — CEO/CFO/Director buying their own stock with real money · Last 3 days
            {data?.updatedAt ? ` · ${new Date(data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          </div>
        </div>
        <button onClick={load} style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, padding: "5px 14px",
          borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent",
          color: C.textDim, cursor: "pointer" }}>{loading ? "…" : "↻ Refresh"}</button>
      </div>

      <div style={{ padding: "10px 14px", background: `${C.green}10`, border: `1px solid ${C.green}33`,
        borderRadius: 8, fontFamily: SANS, fontSize: 12, color: C.green, fontWeight: 600 }}>
        💡 When a CEO buys their own stock, they know something you don't. This is the strongest signal in the market — legal insider information.
      </div>

      <AiTakeSection C={C} MONO={MONO} SANS={SANS} />

      {error && <div style={{ padding: 12, background: `${C.red}15`, border: `1px solid ${C.red}44`, borderRadius: 8, fontFamily: MONO, fontSize: 12, color: C.red }}>⚠ {error}</div>}
      {loading && !data && <div style={{ padding: 40, textAlign: "center", fontFamily: MONO, fontSize: 13, color: C.textDim }}>🏦 Loading SEC Form 4 filings…</div>}

      {(data?.results || []).length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                {["TICKER","COMPANY","FILED","PRICE","1D CHG","ACTION"].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: h === "COMPANY" ? "left" : h === "TICKER" ? "left" : "right",
                    color: C.textDim, fontWeight: 800, fontSize: 11, letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.results.map((r, i) => (
                <tr key={`${r.ticker}-${i}`}
                  style={{ borderBottom: `1px solid ${C.border}33`,
                    background: i % 2 === 0 ? "transparent" : `${C.surface}66` }}>
                  <td style={{ padding: "8px 10px", color: C.accent, fontWeight: 900 }}>{r.ticker}</td>
                  <td style={{ padding: "8px 10px", color: C.text, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.company || "—"}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: C.textDim }}>{r.date || "—"}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: C.text }}>{r.price > 0 ? `$${r.price}` : "—"}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: r.chg != null ? (r.chg >= 0 ? C.green : C.red) : C.textDim, fontWeight: 700 }}>
                    {r.chg != null && r.price > 0 ? `${r.chg >= 0 ? "+" : ""}${r.chg}%` : "—"}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>
                    <span style={{ background: `${C.green}20`, color: C.green, borderRadius: 4,
                      padding: "2px 8px", fontWeight: 800, fontSize: 10 }}>PURCHASE</span>
                  </td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>
                    <button onClick={() => { navigator.clipboard?.writeText(r.ticker).catch(()=>{}); setActiveTab("smartscan"); }}
                      style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, padding: "3px 10px",
                        borderRadius: 5, border: `1px solid ${C.accent}55`, background: `${C.accent}15`,
                        color: C.accent, cursor: "pointer", whiteSpace: "nowrap" }}>
                      Scan →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && data && data.results?.length === 0 && (
        <div style={{ padding: 30, textAlign: "center", fontFamily: SANS, fontSize: 13, color: C.textDim }}>
          No insider purchases found in the last 3 days. Check back daily — this is the most valuable signal.
        </div>
      )}
    </div>
  );
}
