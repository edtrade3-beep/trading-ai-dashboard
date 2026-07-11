export default function SpyVolumeWidget({ C, MONO, SANS, macroData }) {
  const spy = (macroData || []).find(q => q.symbol === "SPY") || null;
  const [opt, setOpt] = React.useState(null);
  React.useEffect(() => {
    const load = () => {
      fetch("/api/market/options-flow?symbols=SPY").then(r => r.json()).then(d => {
        const sym = d?.bySymbol?.[0];
        if (!sym) return;
        const rows = sym.topContracts || [];
        const cv = rows.filter(x => x.side === "CALL").reduce((s, x) => s + (Number(x.volume) || 0), 0);
        const pv = rows.filter(x => x.side === "PUT").reduce((s, x) => s + (Number(x.volume) || 0), 0);
        let cpr = Number(sym.callPutRatio) || null;   // call/put ratio
        if (!cpr && d.summary?.putNotional > 0) cpr = d.summary.callNotional / d.summary.putNotional;
        setOpt({ cv, pv, cpr, pcr: cpr ? 1 / cpr : null, est: String(d.source || "").includes("estimated") });
      }).catch(() => {});
    };
    load();
    const t = setInterval(load, 120000);
    return () => clearInterval(t);
  }, []);
  const fmt = v => v >= 1e9 ? `${(v/1e9).toFixed(2)}B` : v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : (v || "—");
  const vol = Number(spy?.volume || 0), avgVol = Number(spy?.avgVolume || 0);
  const rvol = avgVol > 0 ? vol / avgVol : 0;
  const pcr = opt?.pcr;
  const cpr = opt?.cpr;   // call/put ratio (notional-based, from chain)
  const pcrCol = pcr == null ? C.textDim : pcr > 1.1 ? C.red : pcr < 0.7 ? C.green : C.amber;
  const cprCol = cpr == null ? C.textDim : cpr > 1.4 ? C.green : cpr < 0.9 ? C.red : C.amber;
  const pcrNote = pcr == null ? "" : pcr > 1.1 ? "bearish (puts heavy)" : pcr < 0.7 ? "bullish (calls heavy)" : "balanced";
  const cell = (label, value, col) => (
    <div style={{ textAlign: "center", flex: "0 0 auto", minWidth: 64 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: col || C.text }}>{value}</div>
    </div>
  );
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 8 }}>
        📊 SPY VOLUME + OPTIONS {spy?.price ? <span style={{ color: C.text }}>· ${Number(spy.price).toFixed(2)} <span style={{ color: Number(spy.changesPercentage) >= 0 ? C.green : C.red }}>{Number(spy.changesPercentage) >= 0 ? "+" : ""}{Number(spy.changesPercentage || 0).toFixed(2)}%</span></span> : null}{opt?.est ? <span style={{ color: C.textDim, fontWeight: 400 }}> · options est.</span> : null}
      </div>
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "flex-start" }}>
        {cell("VOLUME", fmt(vol), C.text)}
        {cell("RVOL", rvol > 0 ? `${rvol.toFixed(2)}x` : "—", rvol > 1.2 ? C.amber : C.text)}
        {cell("CALL VOL", opt ? fmt(opt.cv) : "…", C.green)}
        {cell("PUT VOL", opt ? fmt(opt.pv) : "…", C.red)}
        {cell("CALL/PUT", cpr != null ? cpr.toFixed(2) : "…", cprCol)}
        {cell("PUT/CALL", pcr != null ? pcr.toFixed(2) : "…", pcrCol)}
      </div>
      {pcr != null && <div style={{ fontFamily: SANS, fontSize: 10, color: pcrCol, marginTop: 6, textAlign: "left" }}>P/C {pcr.toFixed(2)} — {pcrNote}</div>}
    </div>
  );
}
