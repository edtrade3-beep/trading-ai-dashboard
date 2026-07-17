// ── Gap Fill Tracker ─────────────────────────────────────────────────────────
export default function GapFillTab({ C, MONO, SANS, setActiveTab }) {
  const [data,    setData]    = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [filter,  setFilter]  = React.useState("ALL");

  const load = React.useCallback(() => {
    setLoading(true);
    fetch("/api/scanner/gapfill")
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const gaps = (data?.gaps || []).filter(g =>
    filter === "ALL"    ? true :
    filter === "UP"     ? g.type === "UP" :
    filter === "DOWN"   ? g.type === "DOWN" :
    filter === "CLOSE"  ? g.distToFill <= 5 : true
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text }}>🎯 GAP FILL TRACKER</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
            Open price gaps from the last 60 days · Gaps fill ~70% of the time · Closest gaps = highest probability
            {data?.updatedAt ? ` · ${new Date(data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {[["ALL","All"],["CLOSE","🎯 Within 5%"],["UP","↑ Gap Up"],["DOWN","↓ Gap Down"]].map(([k,lbl]) => (
            <button key={k} onClick={() => setFilter(k)}
              style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "5px 12px",
                borderRadius: 6, border: `1px solid ${filter === k ? C.accent : C.border}`,
                background: filter === k ? `${C.accent}18` : "transparent",
                color: filter === k ? C.accent : C.textDim, cursor: "pointer" }}>{lbl}</button>
          ))}
          <button onClick={load} style={{ fontFamily: MONO, fontSize: 11, padding: "5px 12px",
            borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent",
            color: C.textDim, cursor: "pointer" }}>{loading ? "…" : "↻"}</button>
        </div>
      </div>

      {loading && !data && <div style={{ padding: 40, textAlign: "center", fontFamily: MONO, fontSize: 13, color: C.textDim }}>🎯 Scanning for open gaps…</div>}

      {gaps.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {gaps.map((g, i) => {
            const isUp    = g.type === "UP";
            const gColor  = isUp ? C.green : C.red;
            const urgent  = g.distToFill <= 3;
            const soon    = g.distToFill <= 8;
            return (
              <div key={`${g.sym}-${i}`} style={{ background: urgent ? `${gColor}12` : C.card,
                border: `1.5px solid ${urgent ? gColor + "55" : C.border}`,
                borderRadius: 12, padding: 14 }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.accent }}>{g.sym}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>${g.currentPrice}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900,
                      color: isUp ? C.green : C.red,
                      background: `${gColor}18`, borderRadius: 5, padding: "2px 8px" }}>
                      {isUp ? "↑ GAP UP" : "↓ GAP DOWN"}  {g.gapPct}%
                    </span>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 2 }}>
                      {g.daysOpen}d open · {g.date}
                    </div>
                  </div>
                </div>

                {/* Gap visual */}
                <div style={{ marginBottom: 10, padding: "10px 12px", background: C.surface, borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>GAP ZONE</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{g.gapPct}% gap</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>${isUp ? g.gapBottom : g.gapBottom}</span>
                    <div style={{ flex: 1, height: 8, background: `${gColor}30`, borderRadius: 3,
                      border: `1px dashed ${gColor}55`, position: "relative" }}>
                      <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
                        fontFamily: MONO, fontSize: 9, color: gColor, whiteSpace: "nowrap" }}>
                        UNFILLED GAP
                      </div>
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>${isUp ? g.gapTop : g.gapTop}</span>
                  </div>
                </div>

                {/* Fill target + distance */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>FILL TARGET</div>
                    <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: gColor }}>${g.fillTarget}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>DISTANCE</div>
                    <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900,
                      color: urgent ? C.red : soon ? C.amber : C.text }}>
                      {g.distToFill}% {urgent ? "🎯" : soon ? "⚡" : ""}
                    </div>
                  </div>
                </div>

                {/* Urgency note — distToFill/daysOpen below are real, computed
                    from actual price data; this line is a rule-of-thumb read
                    on them, not a modeled probability, and shouldn't look
                    like one (no fabricated "~80%" precision, no data bar
                    styled the same as the genuinely computed fields above) */}
                <div style={{ marginBottom: 8, fontFamily: SANS, fontSize: 10, color: C.textDim }}>
                  {urgent ? "Very close to fill — highest-probability zone" : g.daysOpen < 7 ? "Recent gap, still likely to fill soon" : g.daysOpen < 30 ? "Aging gap — fill less certain" : "Old gap — lower odds of a clean fill"}
                </div>

                <button onClick={() => { navigator.clipboard?.writeText(g.sym).catch(()=>{}); setActiveTab("smartscan"); }}
                  style={{ width: "100%", fontFamily: MONO, fontSize: 11, fontWeight: 800,
                    padding: "7px", borderRadius: 7, border: "none", cursor: "pointer",
                    background: urgent ? gColor : `${gColor}20`, color: urgent ? "#fff" : gColor }}>
                  {urgent ? "🎯 NEAR FILL — Scan Now →" : "Scan →"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!loading && data && gaps.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", fontFamily: SANS, fontSize: 13, color: C.textDim }}>
          No open gaps matching your filter. Try "All" or refresh.
        </div>
      )}

      <div style={{ padding: "10px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
        fontFamily: SANS, fontSize: 11, color: C.textDim }}>
        <strong>How gaps work:</strong> When a stock opens significantly above or below the prior day's close, it creates a gap.
        Price almost always comes back to fill it. <strong style={{ color: C.accent }}>Within 5% = high probability fill soon.</strong>
        Use the Fill Target as your price target when price approaches the gap zone.
      </div>
    </div>
  );
}
