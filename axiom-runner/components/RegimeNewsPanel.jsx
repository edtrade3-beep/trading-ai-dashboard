import { useState, useEffect } from "react";

export default function RegimeNewsPanel({ C, MONO, SANS }) {
  const [items, setItems] = useState([]);
  const [ts, setTs] = useState(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  useEffect(() => {
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
    // No maxWidth/borderLeft here anymore — this used to sit beside another
    // panel in an older layout; it's now the sole content of its own
    // full-width Card (DashboardTab.jsx), and those leftover styles just
    // squeezed it into roughly half the card for no reason.
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em" }}>📰 MARKET NEWS</div>
        {ts && <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
      </div>
      {items.length === 0 && <div style={{ fontSize: 11, color: C.textDim }}>Loading…</div>}
      {items.slice(0, 6).map((n, i) => (
        <a key={i} href={n.url} target="_blank" rel="noreferrer"
          onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}
          style={{
            display: "block", textDecoration: "none", padding: "8px 10px", margin: "0 -10px",
            borderRadius: 8, borderBottom: `1px solid ${C.border}`,
            background: hoverIdx === i ? C.surface : "transparent",
          }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            {n.source && (
              <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.04em",
                border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 5px" }}>{n.source}</span>
            )}
            {n.time && <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{n.time}</span>}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: hoverIdx === i ? C.accent : C.text, fontWeight: 600, lineHeight: 1.4 }}>{n.title}</div>
        </a>
      ))}
    </div>
  );
}
