import { useEffect, useState } from "react";

// CommandSearchPanel — Command Center's left column (2026-08-25, explicit
// user request: unified one-screen layout with "search or left portfolio
// ... sniper ai on right" — search/opportunities on the left in the final
// agreed layout). A search box that sets the shared active symbol, plus
// the real ranked Sniper AI scan (the same real hard-gated ENTER_LONG/
// WAIT/NO_CHASE/AVOID verdict SniperAITab.jsx already shows, same
// /api/market/sniper-scan endpoint — no second ranking engine). Narrower/
// denser than SniperAITab.jsx (a compact row instead of a wide table row)
// since this lives in a fixed left column, not a full page.
export default function CommandSearchPanel({ symbol, onSelectSymbol, C, MONO, SANS }) {
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/market/sniper-scan").then((res) => res.json());
      if (!r.ok) throw new Error(r.error || "Scan failed");
      setData(r);
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const results = data?.results || [];
  const counts = data?.counts || { ENTER_LONG: 0, WAIT: 0, NO_CHASE: 0, AVOID: 0 };

  const submitSearch = () => {
    const s = query.trim().toUpperCase().replace(/[^A-Z.]/g, "");
    if (s) { onSelectSymbol(s); setQuery(""); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "10px 10px 8px" }}>
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 6 }}>🔎 SEARCH</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); }}
            placeholder="Symbol…"
            style={{ flex: 1, minWidth: 0, border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "7px 9px", fontFamily: MONO, fontSize: 12.5, outline: "none" }}
          />
          <button onClick={submitSearch} style={{ border: "none", background: C.accent, color: "#fff", borderRadius: 6, padding: "0 10px", fontFamily: MONO, fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>GO</button>
        </div>
      </div>

      <div style={{ padding: "4px 10px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.6 }}>OPPORTUNITIES</div>
        <button onClick={load} disabled={loading} title="Refresh Sniper AI scan" style={{ border: "none", background: "transparent", color: C.textDim, cursor: loading ? "not-allowed" : "pointer", fontFamily: MONO, fontSize: 11 }}>
          {loading ? "⏳" : "↻"}
        </button>
      </div>

      {data && (
        <div style={{ padding: "0 10px 6px", display: "flex", gap: 6, flexWrap: "wrap", fontFamily: MONO, fontSize: 9.5 }}>
          <span style={{ color: "#0d9465", fontWeight: 800 }}>🟢{counts.ENTER_LONG || 0}</span>
          <span style={{ color: "#d6a312", fontWeight: 800 }}>🟡{counts.WAIT || 0}</span>
          <span style={{ color: "#f97316", fontWeight: 800 }}>🟠{counts.NO_CHASE || 0}</span>
          <span style={{ color: "#c8282a", fontWeight: 800 }}>🔴{counts.AVOID || 0}</span>
        </div>
      )}

      {error && <div style={{ padding: "0 10px", fontFamily: SANS, fontSize: 11, color: "#c8282a" }}>{error}</div>}
      {loading && !data && <div style={{ padding: "12px 10px", fontFamily: SANS, fontSize: 11, color: C.textDim }}>Scanning…</div>}

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
        {results.map((r) => {
          const active = r.symbol === symbol;
          return (
            <button
              key={r.symbol}
              onClick={() => onSelectSymbol(r.symbol)}
              style={{
                textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                background: active ? `${C.accent}14` : C.card,
                borderTop: `1px solid ${active ? C.accent : r.meta.color + "33"}`,
                borderRight: `1px solid ${active ? C.accent : r.meta.color + "33"}`,
                borderBottom: `1px solid ${active ? C.accent : r.meta.color + "33"}`,
                borderLeft: `3px solid ${r.meta.color}`, borderRadius: 6, padding: "6px 8px",
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 10 }}>{r.meta.icon}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.text }}>{r.symbol}</span>
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginLeft: "auto" }}>{r.price != null ? `$${Number(r.price).toFixed(2)}` : "—"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
