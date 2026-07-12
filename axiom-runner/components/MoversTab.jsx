import { useState, useCallback, useEffect } from "react";

// Market-Terminal style movers leaderboard: Movers Up / Down / Up on Volume /
// Down on Volume. Reads /api/market/leaderboard (cached 3 min server-side).
export default function MoversTab({ C, MONO, SANS, openDeepDiveFor }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [view, setView] = useState("moversUp");

  const load = useCallback(() => {
    setLoading(true); setErr("");
    fetch("/api/market/leaderboard?n=12")
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(j => { setData(j); setLoading(false); })
      .catch(e => { setErr(e.message || "Failed to load"); setLoading(false); });
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 90000); return () => clearInterval(t); }, [load]);

  const VIEWS = [
    { id: "moversUp",     label: "Movers Up",       icon: "🟢" },
    { id: "moversDown",   label: "Movers Down",     icon: "🔴" },
    { id: "upOnVolume",   label: "Up On Volume",    icon: "📈" },
    { id: "downOnVolume", label: "Down On Volume",  icon: "📉" },
  ];
  const rows = (data && data[view]) || [];
  const pct = (v) => v == null ? "—" : (v > 0 ? "+" : "") + v.toFixed(2) + "%";
  const col = (v) => v == null ? C.textDim : v > 0 ? "#22d47e" : v < 0 ? "#ef4444" : C.text;
  const volTag = (r) => r.volRatio == null ? "—" : r.volRatio.toFixed(2) + "×";

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontFamily: SANS, fontSize: 20, fontWeight: 800, color: C.text }}>🔥 Market Movers</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>
            {data ? `${data.count} scanned · ${new Date(data.generatedAt).toLocaleTimeString()}` : ""}
          </span>
          <button onClick={load} style={{ fontFamily: MONO, fontSize: 12, padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text, cursor: "pointer" }}>
            {loading ? "…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {VIEWS.map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            style={{
              fontFamily: SANS, fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 10, cursor: "pointer",
              border: `1px solid ${view === v.id ? "#22d47e" : C.border}`,
              background: view === v.id ? "rgba(34,212,126,0.14)" : C.card,
              color: view === v.id ? "#22d47e" : C.textDim,
            }}>
            {v.icon} {v.label}
          </button>
        ))}
      </div>

      {err && <div style={{ fontFamily: MONO, fontSize: 13, color: "#ef4444", padding: "12px 0" }}>⚠ {err}</div>}
      {!data && !err && <div style={{ fontFamily: MONO, fontSize: 14, color: C.textDim, padding: "40px 0", textAlign: "center" }}>Loading market movers…</div>}

      {data && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", background: C.card }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr", padding: "10px 14px", background: C.bg, borderBottom: `2px solid ${C.border}`, fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.textDim, letterSpacing: 0.5 }}>
            <div>SYMBOL</div>
            <div style={{ textAlign: "right" }}>PRICE</div>
            <div style={{ textAlign: "right" }}>DAY %</div>
            <div style={{ textAlign: "right" }}>YTD %</div>
            <div style={{ textAlign: "right" }}>VOL vs 50D</div>
          </div>
          {rows.length === 0 && <div style={{ padding: "28px 0", textAlign: "center", fontFamily: MONO, fontSize: 13, color: C.textDim }}>No names in this bucket right now.</div>}
          {rows.map((r, i) => (
            <div key={r.symbol}
              onClick={() => openDeepDiveFor && openDeepDiveFor(r.symbol)}
              style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr", padding: "11px 14px", alignItems: "center", cursor: "pointer",
                borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none", background: i % 2 ? "transparent" : "rgba(127,127,127,0.03)" }}>
              <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 14, color: C.text }}>{r.symbol}</div>
              <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 13, color: C.text }}>${r.price.toFixed(2)}</div>
              <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 13, fontWeight: 700, color: col(r.dayPct) }}>{pct(r.dayPct)}</div>
              <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 13, color: col(r.ytdPct) }}>{pct(r.ytdPct)}</div>
              <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 13, fontWeight: 700, color: r.volRatio >= 1.5 ? "#f59e0b" : C.textDim }}>{volTag(r)}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 10 }}>
        Tap any row to open the deep-dive chart. Vol vs 50D = today's volume ÷ 50-day average (≥1.5× highlighted). Auto-refreshes every 90s.
      </div>
    </div>
  );
}
