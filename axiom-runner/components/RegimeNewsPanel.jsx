export default function RegimeNewsPanel({ C, MONO, SANS }) {
  const [items, setItems] = React.useState([]);
  const [ts, setTs] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/finviz/news?limit=8")
        .then(r => r.json())
        .then(d => { if (alive) { setItems(d.items || []); setTs(new Date()); } })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <div style={{ flex: 1, minWidth: 260, maxWidth: 480, borderLeft: `1px solid rgba(255,255,255,0.08)`, paddingLeft: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em" }}>📰 MARKET NEWS</div>
        {ts && <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{ts.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>}
      </div>
      {items.length === 0 && <div style={{ fontSize: 11, color: C.textDim }}>Loading…</div>}
      {items.slice(0, 6).map((n, i) => (
        <a key={i} href={n.url} target="_blank" rel="noreferrer"
          style={{ display: "block", textDecoration: "none", padding: "4px 0", borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
            {n.time && <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, flexShrink: 0 }}>{n.time}</span>}
          </div>
          <div style={{ fontSize: 11, color: C.text, fontWeight: 600, lineHeight: 1.35, marginTop: 1 }}>{n.title}</div>
        </a>
      ))}
    </div>
  );
}
