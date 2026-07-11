export default function GapScanner({ C, MONO, SANS }) {
  const [stocks,      setStocks]      = React.useState([]);
  const [loading,     setLoading]     = React.useState(false);
  const [error,       setError]       = React.useState(null);
  const [filter,      setFilter]      = React.useState("All");
  const [minGap,      setMinGap]      = React.useState(0);
  const [selected,    setSelected]    = React.useState(null);
  const [lastRefresh, setLastRefresh] = React.useState(null);
  const [flashing,    setFlashing]    = React.useState({});
  const [sortBy,      setSortBy]      = React.useState("gap");
  const [autoRefresh, setAutoRefresh] = React.useState(false);
  const prevRef  = React.useRef({});
  const timerRef = React.useRef(null);

  function fmtVol(v) {
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(0) + "K";
    return String(v);
  }

  const fetchGaps = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r    = await fetch("/api/scanner/gap-scan");
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || "Scan failed");
      const next = data.results || [];
      // Flash rows that changed price
      const flashMap = {};
      next.forEach(s => {
        const prev = prevRef.current[s.ticker];
        if (prev && prev.price !== s.price)
          flashMap[s.ticker] = s.price > prev.price ? "up" : "down";
      });
      prevRef.current = Object.fromEntries(next.map(s => [s.ticker, s]));
      setFlashing(flashMap);
      setTimeout(() => setFlashing({}), 700);
      setStocks(next);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount
  React.useEffect(() => { fetchGaps(); }, [fetchGaps]);

  // Auto-refresh every 60 s when enabled
  React.useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (!autoRefresh) return;
    timerRef.current = setInterval(fetchGaps, 60_000);
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, fetchGaps]);

  const SETUP_COLORS = {
    "Gap & Go":      { bg: "#0d2b1a", border: "#00ff88", text: "#00ff88" },
    "Gap Fill Risk": { bg: "#2b1a0d", border: "#ff9900", text: "#ff9900" },
    "Short Squeeze": { bg: "#1a0d2b", border: "#bf7fff", text: "#bf7fff" },
    "Gap Fill":      { bg: "#2b0d0d", border: "#ff4466", text: "#ff4466" },
  };
  const SETUP_DESC = {
    "Gap & Go":      "Strong momentum setup. Watch for ORB break with volume confirmation above opening range.",
    "Gap Fill Risk": "Weak open likely. Watch for rejection at VWAP and potential fade back to previous close.",
    "Short Squeeze": "Low float with heavy short interest. Volatile — use tight stops and small size.",
    "Gap Fill":      "Gap fill candidate. Previous close acts as magnet. Watch downside momentum continuation.",
  };

  const MONO_GAP = "'DM Mono','Courier New',monospace";
  const BEBAS    = "'Bebas Neue',sans-serif";
  const filters  = ["All","Gap & Go","Gap Fill","Short Squeeze","Gap Fill Risk"];

  const displayed = stocks
    .filter(s => filter === "All" || s.setupType === filter)
    .filter(s => Math.abs(s.gapPct) >= minGap)
    .sort((a, b) => {
      if (sortBy === "gap")  return Math.abs(b.gapPct) - Math.abs(a.gapPct);
      if (sortBy === "vol")  return b.vol - a.vol;
      if (sortBy === "rvol") return b.rvol - a.rvol;
      return 0;
    });
  const sel = selected ? stocks.find(s => s.ticker === selected) : null;

  const avgGap = stocks.length
    ? (stocks.reduce((a, s) => a + Math.abs(s.gapPct), 0) / stocks.length).toFixed(1) + "%"
    : "—";
  const topSector = stocks.length
    ? (() => { const c = {}; stocks.forEach(s => c[s.sector] = (c[s.sector]||0)+1); return Object.entries(c).sort((a,b) => b[1]-a[1])[0]?.[0] || "—"; })()
    : "—";

  return (
    <div style={{ background: C.bg, fontFamily: MONO_GAP, color: C.text, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", height: "calc(100vh - 120px)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');
        .gap-row:hover { background: var(--gap-hover) !important; cursor: pointer; }
        .gap-flash-up   { animation: gFlashUp   0.7s ease; }
        .gap-flash-down { animation: gFlashDown 0.7s ease; }
        @keyframes gFlashUp   { 0%,100%{background:transparent} 30%{background:rgba(0,255,136,0.15)} }
        @keyframes gFlashDown { 0%,100%{background:transparent} 30%{background:rgba(255,68,102,0.15)} }
        .gap-sort-btn:hover { opacity:1 !important; }
        .gap-filter-btn:hover { opacity:0.85 !important; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontFamily: BEBAS, fontSize: 22, letterSpacing: "0.08em", color: C.text }}>GAP SCANNER</span>
          <span style={{ fontSize: 12, color: C.textDim, letterSpacing: "0.12em" }}>REAL DATA · YAHOO FINANCE · {stocks.length} GAPPERS</span>
          {loading && <span style={{ fontSize: 12, color: C.accent }}>⌛ LOADING…</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {lastRefresh && <span style={{ fontSize: 12, color: C.textDim }}>UPDATED <span style={{ color: C.textSec }}>{lastRefresh.toLocaleTimeString()}</span></span>}
          <button onClick={() => setAutoRefresh(v => !v)}
            style={{ background: autoRefresh ? `${C.green}18` : "none", border: `1px solid ${autoRefresh ? C.green : C.border}`, color: autoRefresh ? C.green : C.textSec, fontSize: 12, padding: "4px 10px", borderRadius: 5, cursor: "pointer", fontFamily: MONO_GAP }}>
            {autoRefresh ? "⏱ AUTO ON" : "⏱ AUTO OFF"}
          </button>
          <button onClick={fetchGaps} disabled={loading}
            style={{ background: "none", border: `1px solid ${C.border}`, color: loading ? C.textDim : C.textSec, fontSize: 12, padding: "4px 12px", borderRadius: 5, cursor: loading ? "default" : "pointer", letterSpacing: "0.08em", fontFamily: MONO_GAP }}>
            ↺ REFRESH
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "10px 20px", background: `${C.red}18`, borderBottom: `1px solid ${C.red}44`, fontSize: 12, color: C.red }}>
          ⚠ {error}
        </div>
      )}

      {/* Stat strip */}
      {stocks.length > 0 && (
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
          {[
            { label: "GAPPERS",    val: stocks.length },
            { label: "GAP UP",     val: stocks.filter(s => s.gapPct > 0).length,  color: C.green },
            { label: "GAP DOWN",   val: stocks.filter(s => s.gapPct < 0).length,  color: C.red },
            { label: "AVG GAP",    val: avgGap },
            { label: "TOP SECTOR", val: topSector },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ flex: 1, padding: "10px 14px", borderRight: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, color: C.textDim, letterSpacing: "0.12em", marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 15, fontFamily: BEBAS, letterSpacing: "0.06em", color: color || C.text }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Main panel */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Filters */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "10px 16px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
            {filters.map(f => (
              <button key={f} className="gap-filter-btn" onClick={() => setFilter(f)} style={{
                background: filter === f ? C.surface : "none",
                border: `1px solid ${filter === f ? C.accent : C.border}`,
                color: filter === f ? C.text : C.textDim,
                fontSize: 12, padding: "3px 10px", borderRadius: 5, cursor: "pointer", fontFamily: MONO_GAP, letterSpacing: "0.06em",
              }}>{f}</button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: C.textDim }}>MIN GAP</span>
              <input type="range" min={0} max={15} value={minGap} onChange={e => setMinGap(+e.target.value)} style={{ accentColor: C.accent, width: 70 }} />
              <span style={{ fontSize: 12, color: C.textSec, width: 26 }}>{minGap}%</span>
            </div>
          </div>

          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "72px 66px 80px 72px 72px 60px 70px 80px 100px", padding: "6px 16px", borderBottom: `1px solid ${C.border}` }}>
            {[
              { label: "TICKER", key: null },
              { label: "PRICE",  key: null },
              { label: "GAP %",  key: "gap" },
              { label: "PREV",   key: null },
              { label: "VOLUME", key: "vol" },
              { label: "RVOL",   key: "rvol" },
              { label: "MKT CAP",key: null },
              { label: "SECTOR", key: null },
              { label: "SETUP",  key: null },
            ].map(({ label, key }) => (
              <span key={label} className={key ? "gap-sort-btn" : ""} onClick={() => key && setSortBy(key)}
                style={{ fontSize: 12, color: sortBy === key ? C.accent : C.textDim, letterSpacing: "0.1em", cursor: key ? "pointer" : "default" }}>
                {label}{key && sortBy === key ? " ▲" : ""}
              </span>
            ))}
          </div>

          {/* Empty / loading state */}
          {loading && stocks.length === 0 && (
            <div style={{ padding: "50px 0", textAlign: "center", color: C.textDim, fontSize: 12 }}>⌛ Fetching real gap data…</div>
          )}
          {!loading && stocks.length === 0 && !error && (
            <div style={{ padding: "50px 0", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: C.textDim, marginBottom: 6 }}>No gappers found for current filter</div>
              <div style={{ fontSize: 12, color: C.textDim }}>Try lowering the MIN GAP slider or press ↺ REFRESH</div>
            </div>
          )}

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {displayed.map(s => {
              const isUp   = s.gapPct >= 0;
              const fClass = flashing[s.ticker] === "up" ? "gap-flash-up" : flashing[s.ticker] === "down" ? "gap-flash-down" : "";
              const isSel  = selected === s.ticker;
              const sc     = SETUP_COLORS[s.setupType] || SETUP_COLORS["Gap Fill Risk"];
              return (
                <div key={s.ticker} className={`gap-row ${fClass}`} onClick={() => setSelected(isSel ? null : s.ticker)}
                  style={{ display: "grid", gridTemplateColumns: "72px 66px 80px 72px 72px 60px 70px 80px 100px", padding: "9px 16px", borderBottom: `1px solid ${C.border}44`, background: isSel ? C.surface : "transparent", alignItems: "center" }}>
                  <div>
                    <div style={{ fontFamily: BEBAS, fontSize: 14, letterSpacing: "0.06em", color: C.text }}>{s.ticker}</div>
                    {s.hasPreMkt && <div style={{ fontSize: 7, color: C.accent, letterSpacing: "0.06em" }}>PRE-MKT</div>}
                  </div>
                  <span style={{ fontSize: 12, color: C.text }}>${s.price.toFixed(2)}</span>
                  <div>
                    <div style={{ fontSize: 12, color: isUp ? C.green : C.red, fontWeight: 500 }}>{isUp ? "+" : ""}{s.gapPct.toFixed(2)}%</div>
                    <div style={{ width: 50, height: 3, background: C.border, borderRadius: 2, overflow: "hidden", marginTop: 3 }}>
                      <div style={{ width: `${Math.min(Math.abs(s.gapPct)/20*100,100)}%`, height: "100%", background: isUp ? C.green : C.red, borderRadius: 2 }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: C.textDim }}>${s.prevClose.toFixed(2)}</span>
                  <span style={{ fontSize: 12, color: C.textSec }}>{fmtVol(s.vol)}</span>
                  <span style={{ fontSize: 12, color: s.rvol >= 2 ? C.amber : C.textSec }}>{s.rvol > 0 ? s.rvol.toFixed(1) + "×" : "—"}</span>
                  <span style={{ fontSize: 12, color: C.textDim }}>{s.mktCapB > 0 ? "$" + s.mktCapB.toFixed(1) + "B" : "—"}</span>
                  <span style={{ fontSize: 12, color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.sector}</span>
                  <span style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, fontSize: 12, fontFamily: MONO_GAP, padding: "2px 5px", borderRadius: 5, whiteSpace: "nowrap" }}>{s.setupType}</span>
                </div>
              );
            })}
            {displayed.length === 0 && stocks.length > 0 && (
              <div style={{ padding: "32px 16px", textAlign: "center", color: C.textDim, fontSize: 12 }}>NO STOCKS MATCH CURRENT FILTERS</div>
            )}
          </div>
        </div>

        {/* Detail side-panel */}
        <div style={{ width: sel ? 230 : 0, overflowY: "auto", overflowX: "hidden", transition: "width 0.25s ease", borderLeft: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
          {sel && (() => {
            const sc = SETUP_COLORS[sel.setupType] || SETUP_COLORS["Gap Fill Risk"];
            return (
              <div style={{ padding: "16px 14px", width: 230 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontFamily: BEBAS, fontSize: 20, color: C.text, letterSpacing: "0.06em" }}>{sel.ticker}</div>
                    <div style={{ fontSize: 12, color: C.textDim, marginTop: 1 }}>{sel.name}</div>
                  </div>
                  <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 14 }}>✕</button>
                </div>
                {[
                  { label: "CURRENT PRICE", val: `$${sel.price.toFixed(2)}` },
                  { label: "PREV CLOSE",    val: `$${sel.prevClose.toFixed(2)}` },
                  { label: "GAP %",         val: `${sel.gapPct > 0 ? "+" : ""}${sel.gapPct.toFixed(2)}%`, color: sel.gapPct >= 0 ? C.green : C.red },
                  { label: "GAP $",         val: `${sel.gapPct >= 0 ? "+" : ""}$${(sel.price - sel.prevClose).toFixed(2)}`, color: sel.gapPct >= 0 ? C.green : C.red },
                  { label: "VOLUME",        val: fmtVol(sel.vol) },
                  { label: "REL. VOLUME",   val: sel.rvol > 0 ? sel.rvol.toFixed(2) + "×" : "—", color: sel.rvol >= 2 ? C.amber : null },
                  { label: "MKT CAP",       val: sel.mktCapB > 0 ? `$${sel.mktCapB.toFixed(1)}B` : "—" },
                  { label: "SECTOR",        val: sel.sector },
                  { label: "DATA SOURCE",   val: sel.hasPreMkt ? "Pre-Market" : "Regular Market" },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ marginBottom: 9 }}>
                    <div style={{ fontSize: 12, color: C.textDim, letterSpacing: "0.1em", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 12, color: color || C.text }}>{val}</div>
                  </div>
                ))}
                <div style={{ marginTop: 12, padding: "10px", background: C.card || C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 12, color: C.textDim, letterSpacing: "0.1em", marginBottom: 6 }}>SETUP</div>
                  <span style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, fontSize: 12, padding: "3px 7px", borderRadius: 5 }}>{sel.setupType}</span>
                  <div style={{ marginTop: 8, fontSize: 12, color: C.textSec, lineHeight: 1.6 }}>{SETUP_DESC[sel.setupType]}</div>
                </div>
                <div style={{ marginTop: 10, padding: "10px", background: `${C.green}12`, borderRadius: 6, border: `1px solid ${C.green}30` }}>
                  <div style={{ fontSize: 12, color: C.textDim, letterSpacing: "0.1em", marginBottom: 6 }}>KEY LEVELS</div>
                  {[
                    { l: "Resistance", v: `$${(sel.price * 1.035).toFixed(2)}` },
                    { l: "VWAP Est.",  v: `$${((sel.price + sel.prevClose) / 2).toFixed(2)}` },
                    { l: "Support",    v: `$${(sel.price * 0.965).toFixed(2)}` },
                    { l: "Fill Target",v: `$${sel.prevClose.toFixed(2)}` },
                  ].map(({ l, v }) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: C.textDim }}>{l}</span>
                      <span style={{ fontSize: 12, color: C.textSec }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
