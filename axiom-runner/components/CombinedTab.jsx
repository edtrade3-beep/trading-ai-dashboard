// ── Combined Scanner (Compress + Smart Scan merged) ──────────────────────────
export default function CombinedTab({ C, MONO, SANS, onDeepDive, watchlistSymbols }) {
  const [rows,    setRows]    = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [filter,  setFilter]  = React.useState("ALL"); // ALL | ENTER | WATCH

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const wlParam = watchlistSymbols?.length ? `?symbols=${watchlistSymbols.slice(0,30).join(",")}` : "";
      const [compRes, scanRes] = await Promise.all([
        fetch(`/api/scanner/compression${wlParam}`).then(r => r.json()).catch(() => ({ ok: false, results: [] })),
        fetch("/api/scanner/scan?symbols=ALL&lite=1").then(r => r.json()).catch(() => ({ ok: false, results: [] })),
      ]);

      const compMap = {};
      (compRes.results || []).forEach(r => { compMap[r.sym] = r; });

      const scanMap = {};
      (scanRes.results || []).forEach(r => { scanMap[r.ticker] = r; });

      // Merge: all compression stocks, enriched with scan signal
      const merged = (compRes.results || []).map(c => {
        const s = scanMap[c.sym] || null;
        const scanSignal = s?.signal || null;
        const scanScore  = s?.score  || 0;
        const isBuy  = scanSignal && (scanSignal.includes("BUY") || scanSignal === "A+ LONG" || scanSignal === "LONG");
        const isAvoid= scanSignal && (scanSignal.includes("AVOID") || scanSignal === "SHORT" || scanSignal === "WATCH SHORT");
        const goCount = [c.atrRatio < 0.80, c.volRatio < 0.85, c.nearHigh < 8].filter(Boolean).length;

        // Combined decision
        let decision, decColor, decIcon;
        if (isBuy && c.score >= 50 && c.trending !== "DOWN" && goCount >= 2) {
          decision = "ENTER"; decColor = C.green; decIcon = "✅";
        } else if (!isAvoid && c.score >= 40 && c.trending !== "DOWN") {
          decision = "WATCH"; decColor = C.amber; decIcon = "👀";
        } else {
          decision = "SKIP";  decColor = C.red;   decIcon = "❌";
        }

        return { ...c, scanSignal, scanScore, isBuy, isAvoid, goCount, decision, decColor, decIcon };
      }).sort((a, b) => {
        const order = { ENTER: 0, WATCH: 1, SKIP: 2 };
        return (order[a.decision] - order[b.decision]) || (b.score - a.score);
      });

      setRows(merged);
    } finally { setLoading(false); }
  }, [watchlistSymbols]);

  React.useEffect(() => { load(); }, [load]);

  const visible = rows.filter(r =>
    filter === "ALL"   ? true :
    filter === "ENTER" ? r.decision === "ENTER" :
    filter === "WATCH" ? r.decision !== "SKIP" : true
  );

  const enterCount = rows.filter(r => r.decision === "ENTER").length;
  const watchCount = rows.filter(r => r.decision === "WATCH").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text }}>⚡ BEST SETUPS</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
            Compression + Smart Scan combined · {enterCount > 0 ? `${enterCount} ready to enter · ` : ""}{watchCount} to watch
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {[["ALL","All"],["ENTER","✅ Enter Now"],["WATCH","👀 Watch List"]].map(([k,l]) => (
            <button key={k} onClick={() => setFilter(k)} style={{
              fontFamily: MONO, fontSize: 11, fontWeight: filter===k ? 800 : 500, padding: "5px 12px",
              borderRadius: 6, border: `1px solid ${filter===k ? C.accent : C.border}`,
              background: filter===k ? `${C.accent}18` : "transparent",
              color: filter===k ? C.accent : C.textDim, cursor: "pointer" }}>{l}</button>
          ))}
          <button onClick={load} style={{ fontFamily: MONO, fontSize: 11, padding: "5px 12px",
            borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent",
            color: C.textDim, cursor: "pointer" }}>{loading ? "⏳" : "↻"}</button>
        </div>
      </div>

      {loading && rows.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", fontFamily: MONO, fontSize: 13, color: C.textDim }}>
          ⚡ Combining scanners…
        </div>
      )}

      {visible.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                {["DECISION","TICKER","PRICE","COIL","SMART SCAN","TREND","SIGNALS","BREAK ABOVE",""].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: h === "TICKER" || h === "DECISION" ? "left" : "center",
                    color: C.textDim, fontWeight: 800, fontSize: 10, letterSpacing: "0.07em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={r.sym} style={{ borderBottom: `1px solid ${C.border}22`,
                  background: r.decision === "ENTER" ? `${C.green}08` : i % 2 === 0 ? "transparent" : `${C.surface}44` }}>

                  {/* Decision */}
                  <td style={{ padding: "10px 10px" }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: r.decColor,
                      background: `${r.decColor}15`, padding: "3px 10px", borderRadius: 5, whiteSpace: "nowrap" }}>
                      {r.decIcon} {r.decision}
                    </span>
                  </td>

                  {/* Ticker + price */}
                  <td style={{ padding: "10px 10px" }}>
                    <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.accent }}>{r.sym}</div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>${r.price}</div>
                  </td>

                  {/* Price (hidden — merged above) */}
                  <td style={{ padding: "10px 8px", textAlign: "center" }}>
                    <div style={{ height: 6, width: 60, background: C.border, borderRadius: 3, overflow: "hidden", margin: "0 auto" }}>
                      <div style={{ width: `${r.score}%`, height: "100%", borderRadius: 3,
                        background: r.score >= 70 ? C.green : r.score >= 50 ? C.amber : C.textDim }} />
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 2 }}>{r.score}/100</div>
                  </td>

                  {/* Coil grade */}
                  <td style={{ padding: "10px 8px", textAlign: "center" }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700,
                      color: r.score >= 70 ? C.green : r.score >= 50 ? C.amber : C.textDim }}>
                      {r.score >= 70 ? "🔥 PRIME" : r.score >= 50 ? "⚡ BUILD" : "👀 WATCH"}
                    </span>
                  </td>

                  {/* Smart Scan */}
                  <td style={{ padding: "10px 8px", textAlign: "center" }}>
                    {r.scanSignal ? (
                      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800,
                        color: r.isBuy ? C.green : r.isAvoid ? C.red : C.amber,
                        background: `${r.isBuy ? C.green : r.isAvoid ? C.red : C.amber}15`,
                        padding: "2px 8px", borderRadius: 4 }}>
                        {r.scanSignal}
                      </span>
                    ) : <span style={{ color: C.textDim, fontSize: 10 }}>—</span>}
                  </td>

                  {/* Trend */}
                  <td style={{ padding: "10px 8px", textAlign: "center" }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800,
                      color: r.trending === "UP" ? C.green : r.trending === "DOWN" ? C.red : C.textDim }}>
                      {r.trending === "UP" ? "↑ UP" : r.trending === "DOWN" ? "↓ DOWN" : "→ FLAT"}
                    </span>
                  </td>

                  {/* Signal boxes mini */}
                  <td style={{ padding: "10px 8px", textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
                      {[
                        r.atrRatio < 0.80 ? "🔥" : "⬜",
                        r.volRatio < 0.85 ? "🔥" : "⬜",
                        r.nearHigh < 8   ? "🔥" : "⬜",
                      ].map((e, ei) => <span key={ei} style={{ fontSize: 13 }}>{e}</span>)}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginTop: 2 }}>V · V · P</div>
                  </td>

                  {/* Break above */}
                  <td style={{ padding: "10px 10px", textAlign: "center" }}>
                    <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.accent }}>${r.high20}</div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>entry level</div>
                  </td>

                  {/* Deep Dive button */}
                  <td style={{ padding: "10px 8px", textAlign: "right" }}>
                    <button onClick={() => onDeepDive ? onDeepDive(r.sym, r) : null}
                      style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, padding: "5px 12px",
                        borderRadius: 6, border: "none", cursor: "pointer", whiteSpace: "nowrap",
                        background: r.decision === "ENTER" ? C.green : `${C.accent}20`,
                        color: r.decision === "ENTER" ? "#fff" : C.accent }}>
                      Deep Dive →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div style={{ padding: 30, textAlign: "center", fontFamily: SANS, fontSize: 13, color: C.textDim }}>
          No setups found. Click ↻ to scan.
        </div>
      )}

      {/* Legend */}
      <div style={{ padding: "8px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
        display: "flex", gap: 20, flexWrap: "wrap", fontFamily: SANS, fontSize: 11 }}>
        <span style={{ color: C.green }}>✅ ENTER — Coiling + Smart Scan confirms BUY + Trend UP</span>
        <span style={{ color: C.amber }}>👀 WATCH — Compression building, not fully confirmed yet</span>
        <span style={{ color: C.red }}>❌ SKIP — Avoid: trending down or Smart Scan says no</span>
        <span style={{ color: C.textDim }}>🔥🔥🔥 = Volatility · Volume · Proximity signals</span>
      </div>
    </div>
  );
}
