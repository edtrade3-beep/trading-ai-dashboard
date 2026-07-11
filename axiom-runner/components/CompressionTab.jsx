export default function CompressionTab({ C, MONO, SANS, setActiveTab, onDeepDive, watchlistSymbols }) {
  const [data,       setData]       = React.useState(null);
  const [loading,    setLoading]    = React.useState(false);
  const [error,      setError]      = React.useState(null);
  const [scanScores, setScanScores] = React.useState({});
  const [gradeF,     setGradeF]     = React.useState("ALL");   // ALL | PRIME | BUILDING | WATCH
  const [trendF,     setTrendF]     = React.useState("ALL");   // ALL | UP | FLAT
  const [signalF,    setSignalF]    = React.useState("ALL");   // ALL | READY (2+ GO signals)

  const load = React.useCallback(() => {
    setLoading(true);
    const wlParam = watchlistSymbols && watchlistSymbols.length
      ? `?symbols=${watchlistSymbols.slice(0, 30).join(",")}`
      : "";
    fetch(`/api/scanner/compression${wlParam}`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok) { setError(d.error); return; }
        setData(d);
        // Fetch Smart Scan scores for top results
        const syms = (d.results || []).slice(0, 12).map(r => r.sym);
        if (syms.length) {
          fetch(`/api/scanner/scan?symbols=${syms.join(",")}&lite=1`)
            .then(r => r.ok ? r.json() : null)
            .then(sd => {
              if (!sd?.results) return;
              const map = {};
              sd.results.forEach(r => { map[r.ticker] = { signal: r.signal, score: r.score }; });
              setScanScores(map);
            }).catch(() => {});
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Signal bar: shows compression level visually (0–100%)
  function SignalBar({ ratio, goodBelow, label }) {
    const pct    = Math.min(100, Math.round(ratio * 100));
    const hot    = ratio < goodBelow;
    const color  = hot ? C.green : ratio < goodBelow + 0.2 ? C.amber : C.textDim;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 60, height: 6, background: `${C.border}`, borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
        </div>
        <span style={{ fontFamily: MONO, fontSize: 10, color, fontWeight: hot ? 800 : 400 }}>
          {hot ? "🔥" : ratio.toFixed(2)}
        </span>
      </div>
    );
  }

  const allRows = (data?.results || []);
  const rows = allRows.filter(r => {
    const goCount = [r.atrRatio < 0.80, r.volRatio < 0.85, r.nearHigh < 8].filter(Boolean).length;
    if (gradeF === "PRIME"    && r.score < 70)  return false;
    if (gradeF === "BUILDING" && (r.score < 50 || r.score >= 70)) return false;
    if (gradeF === "WATCH"    && (r.score < 20 || r.score >= 50)) return false;
    if (trendF === "UP"   && r.trending !== "UP")   return false;
    if (trendF === "FLAT" && r.trending !== "FLAT") return false;
    if (signalF === "READY" && goCount < 2) return false;
    if (signalF === "ALL3"  && goCount < 3) return false;
    return true;
  });

  const btnStyle = (active) => ({
    fontFamily: MONO, fontSize: 10, fontWeight: active ? 800 : 500,
    padding: "4px 10px", borderRadius: 5, cursor: "pointer",
    border: `1px solid ${active ? C.accent : C.border}`,
    background: active ? `${C.accent}18` : "transparent",
    color: active ? C.accent : C.textDim,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text }}>
            🌀 COMPRESSION SCANNER
          </div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
            Stocks coiling before a big move · {rows.length} of {allRows.length} shown
            {data?.total ? ` · ${data.total} scanned` : ""}
            {data?.updatedAt ? ` · ${new Date(data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          </div>
        </div>
        <button onClick={load} style={{ fontFamily: MONO, fontSize: 11, padding: "6px 14px",
          borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent",
          color: C.textDim, cursor: "pointer" }}>{loading ? "⏳ Scanning…" : "↻ Refresh"}</button>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "10px 12px",
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, alignItems: "center" }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginRight: 4 }}>GRADE</span>
        {[["ALL","All"],["PRIME","🔥 Prime"],["BUILDING","⚡ Building"],["WATCH","👀 Watch"]].map(([k,l]) => (
          <button key={k} onClick={() => setGradeF(k)} style={btnStyle(gradeF===k)}>{l}</button>
        ))}
        <div style={{ width: 1, height: 16, background: C.border, margin: "0 4px" }} />
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginRight: 4 }}>TREND</span>
        {[["ALL","All"],["UP","↑ Up"],["FLAT","→ Flat"]].map(([k,l]) => (
          <button key={k} onClick={() => setTrendF(k)} style={btnStyle(trendF===k)}>{l}</button>
        ))}
        <div style={{ width: 1, height: 16, background: C.border, margin: "0 4px" }} />
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginRight: 4 }}>SIGNALS</span>
        {[["ALL","Any"],["READY","2+ GO"],["ALL3","All 3 GO 🔥"]].map(([k,l]) => (
          <button key={k} onClick={() => setSignalF(k)} style={btnStyle(signalF===k)}>{l}</button>
        ))}
        {(gradeF !== "ALL" || trendF !== "ALL" || signalF !== "ALL") && (
          <button onClick={() => { setGradeF("ALL"); setTrendF("ALL"); setSignalF("ALL"); }}
            style={{ ...btnStyle(false), color: C.red, borderColor: `${C.red}44`, marginLeft: 4 }}>
            ✕ Clear
          </button>
        )}
      </div>

      {error && <div style={{ padding: 12, background: `${C.red}15`, border: `1px solid ${C.red}44`,
        borderRadius: 8, fontFamily: MONO, fontSize: 12, color: C.red }}>⚠ {error}</div>}

      {loading && !data && (
        <div style={{ padding: 50, textAlign: "center", fontFamily: MONO, fontSize: 13, color: C.textDim }}>
          🌀 Analyzing stocks…
        </div>
      )}

      {/* Cards grid */}
      {rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {rows.map(r => {
            const isPrime    = r.score >= 70;
            const isBuilding = r.score >= 50 && r.score < 70;
            const borderColor = isPrime ? C.green : isBuilding ? C.amber : C.border;
            const bgColor     = isPrime ? `${C.green}0c` : isBuilding ? `${C.amber}0a` : C.card;

            // Action status
            const action = isPrime && r.trending !== "DOWN"
              ? { label: "READY — WATCH BREAKOUT", color: C.green }
              : isBuilding && r.trending !== "DOWN"
              ? { label: "BUILDING — WAIT", color: C.amber }
              : r.trending === "DOWN"
              ? { label: "AVOID — TRENDING DOWN", color: C.red }
              : { label: "EARLY — MONITOR", color: C.textDim };

            return (
              <div key={r.sym} style={{ background: bgColor, border: `1.5px solid ${borderColor}44`,
                borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>

                {/* Top row: ticker + score + action */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.accent }}>{r.sym}</span>
                    <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.text }}>${r.price}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: action.color }}>
                      {action.label}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>
                      Score {r.score}/100
                    </div>
                  </div>
                </div>

                {/* Score bar */}
                <div>
                  <div style={{ height: 6, background: `${C.border}`, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${r.score}%`, height: "100%", borderRadius: 3,
                      background: isPrime ? C.green : isBuilding ? C.amber : C.textDim,
                      transition: "width 0.4s" }} />
                  </div>
                </div>

                {/* 3 signals — same rule everywhere: 🔥=GO ✅=OK ⬜=NO */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[
                    {
                      label: "VOLATILITY",
                      icon:  r.atrRatio < 0.65 ? "🔥" : r.atrRatio < 0.80 ? "✅" : "⬜",
                      text:  r.atrRatio < 0.65 ? "GO" : r.atrRatio < 0.80 ? "OK" : "NO",
                      color: r.atrRatio < 0.65 ? C.green : r.atrRatio < 0.80 ? C.amber : C.textDim,
                      tip:   r.atrRatio < 0.65 ? "Crushed — coiling" : r.atrRatio < 0.80 ? "Low — quieting" : "Normal — not ready",
                      hot:   r.atrRatio < 0.65,
                    },
                    {
                      label: "VOLUME",
                      icon:  r.volRatio < 0.65 ? "🔥" : r.volRatio < 0.85 ? "✅" : "⬜",
                      text:  r.volRatio < 0.65 ? "GO" : r.volRatio < 0.85 ? "OK" : "NO",
                      color: r.volRatio < 0.65 ? C.green : r.volRatio < 0.85 ? C.amber : C.textDim,
                      tip:   r.volRatio < 0.65 ? "Dried up — loading" : r.volRatio < 0.85 ? "Quiet — slowing" : "Normal — not ready",
                      hot:   r.volRatio < 0.65,
                    },
                    {
                      label: "PROXIMITY",
                      icon:  r.nearHigh < 3 ? "🔥" : r.nearHigh < 8 ? "✅" : "⬜",
                      text:  r.nearHigh < 3 ? "GO" : r.nearHigh < 8 ? "OK" : "NO",
                      color: r.nearHigh < 3 ? C.green : r.nearHigh < 8 ? C.amber : C.textDim,
                      tip:   `-${r.nearHigh}% to breakout`,
                      hot:   r.nearHigh < 3,
                    },
                  ].map(s => (
                    <div key={s.label} title={s.tip} style={{ textAlign: "center", padding: "8px 4px", background: C.surface,
                      borderRadius: 8, border: `1px solid ${s.hot ? s.color + "66" : C.border}` }}>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginBottom: 3 }}>{s.label}</div>
                      <div style={{ fontSize: 16 }}>{s.icon}</div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: s.color, marginTop: 2, fontWeight: 800 }}>{s.text}</div>
                    </div>
                  ))}
                </div>

                {/* Smart Scan verdict badge — combined signal */}
                {(() => {
                  const ss = scanScores[r.sym];
                  const allGo = r.atrRatio < 0.80 && r.volRatio < 0.85 && r.trending !== "DOWN";
                  const ssSignal = ss?.signal || null;
                  const ssBuy    = ssSignal && (ssSignal.includes("BUY") || ssSignal === "LONG" || ssSignal === "A+ LONG");
                  const combined = allGo && ssBuy;
                  return (
                    <div style={{ padding: "7px 10px", borderRadius: 7, marginBottom: 2,
                      background: combined ? `${C.green}15` : ss ? `${C.surface}` : `${C.border}18`,
                      border: `1px solid ${combined ? C.green + "55" : C.border}`,
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginBottom: 1 }}>SMART SCAN</div>
                        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800,
                          color: ssBuy ? C.green : ss ? C.red : C.textDim }}>
                          {ss ? ssSignal : "Loading…"}
                          {ss ? ` · ${ss.score}/100` : ""}
                        </div>
                      </div>
                      {combined && <span style={{ fontSize: 14 }}>✅ CONFIRMED</span>}
                      {ss && !ssBuy && <span style={{ fontFamily: MONO, fontSize: 9, color: C.red }}>⚠ SKIP</span>}
                    </div>
                  );
                })()}

                {/* Breakout level + trend + action button */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>BREAK ABOVE</div>
                    <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.accent }}>${r.high20}</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>TREND</div>
                    <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800,
                      color: r.trending === "UP" ? C.green : r.trending === "DOWN" ? C.red : C.textDim }}>
                      {r.trending === "UP" ? "↑ UP" : r.trending === "DOWN" ? "↓ DOWN" : "→ FLAT"}
                    </div>
                  </div>
                  <button onClick={() => onDeepDive ? onDeepDive(r.sym) : setActiveTab("smartscan")}
                    style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "7px 16px",
                      borderRadius: 7, border: "none", cursor: "pointer",
                      background: scanScores[r.sym]?.signal?.includes("BUY") ? C.green : isPrime ? C.accent : C.surface,
                      color: scanScores[r.sym]?.signal?.includes("BUY") || isPrime ? "#fff" : C.textDim }}>
                    Deep Dive →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && data && rows.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", fontFamily: SANS, fontSize: 13, color: C.textDim }}>
          No compression setups found right now. Check back later or click Refresh.
        </div>
      )}
    </div>
  );
}

