// ── CME FedWatch (inline) — market-implied Fed rate read from fed funds futures ──
export default function FedWatchWidget({ C, MONO, SANS }) {
  const [d, setD] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/market/fedwatch").then(r => r.json()).then(x => { if (alive) setD(x); }).catch(() => {});
    load();
    const t = setInterval(load, 15 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const link = "https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html";
  const ok = d && d.ok;
  const leanColor = !ok ? C.textDim : d.lean === "CUTS" ? C.green : d.lean === "HIKES" ? C.red : C.amber;
  const leanText = !ok ? "" : d.lean === "CUTS" ? "leaning toward CUTS ✂️" : d.lean === "HIKES" ? "leaning toward HIKES ⬆️" : "STEADY — no move priced";
  return (
    <div style={{ margin: "8px 0", padding: "10px 14px", background: `${C.accent}0c`, border: `1px solid ${C.accent}44`, borderRadius: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 16 }}>🏛️</span>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent }}>FED RATE WATCH</span>
        {ok ? (
          <>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>implied rate <strong>{d.impliedRate}%</strong></span>
            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: leanColor, background: `${leanColor}18`, borderRadius: 5, padding: "2px 8px" }}>{leanText}</span>
            {d.moveProb > 0 && <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>~{d.moveProb}% of a 25bp move priced (1m)</span>}
          </>
        ) : <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>loading fed funds futures…</span>}
        <a href={link} target="_blank" rel="noopener noreferrer" style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.accent, textDecoration: "none", border: `1px solid ${C.accent}55`, borderRadius: 5, padding: "3px 9px" }}>CME odds ↗</a>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginTop: 5 }}>From 30-day fed funds futures (ZQ) — approximate. For exact per-meeting probabilities, open the CME FedWatch tool.</div>
    </div>
  );
}
