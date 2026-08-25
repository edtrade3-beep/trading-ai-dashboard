import { useEffect, useState } from "react";

// CommandSearchPanel — Command Center's left column, the real Opportunity
// Inbox (Market Opportunity Engine Phase 1, 2026-08-25 — user's 36-section
// spec §21: "DON'T MAKE ME FIND THE OPPORTUNITY. FIND THE OPPORTUNITY FOR
// ME."). A search box that sets the shared active symbol, plus the real
// 5-tier ACTIONABLE/DEVELOPING/WAIT/EXTENDED/INVALIDATED scan from
// /api/market/opportunities (opportunity-engine.js — wraps am-core-
// engine.js, no second ranking engine). Was a flat Sniper AI list off
// /api/market/sniper-scan; that route/verdict vocabulary is unchanged and
// still powers Sniper Mode (CortexMiniPanel.jsx) — this panel now shows
// the richer tiered read instead of one flat ranking.
//
// ACTIONABLE/DEVELOPING default open (real, usually-small counts — the
// tiers worth a glance every time); WAIT/EXTENDED/INVALIDATED default
// collapsed, since on a real scan day these can be the majority of the
// ~100-symbol universe (spec's own non-negotiable: "never overwhelm with
// alerts" — collapsing the noisy tiers by default is that same principle
// applied to a list, not just push alerts). Each expanded section caps
// at ROW_CAP rows (real, disclosed via a "+N more" line) — never a
// silent truncation.
const TIER_META = {
  actionable: { label: "ACTIONABLE", icon: "🚨", color: "#0d9465", defaultOpen: true },
  developing: { label: "DEVELOPING", icon: "🟢", color: "#4fa87e", defaultOpen: true },
  wait:       { label: "WAIT",       icon: "🟡", color: "#d6a312", defaultOpen: false },
  extended:   { label: "EXTENDED",   icon: "🟠", color: "#e08a1e", defaultOpen: false },
  invalidated:{ label: "INVALIDATED",icon: "🔴", color: "#c8282a", defaultOpen: false },
};
const TIER_ORDER = ["actionable", "developing", "wait", "extended", "invalidated"];
const ROW_CAP = 25;

const fmtPrice = (v) => Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : "—";
const fmtPct = (v) => Number.isFinite(v) ? `${v > 0 ? "+" : ""}${v}%` : "—";

export default function CommandSearchPanel({ symbol, onSelectSymbol, C, MONO, SANS }) {
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(() => Object.fromEntries(TIER_ORDER.map((k) => [k, TIER_META[k].defaultOpen])));

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/market/opportunities").then((res) => res.json());
      if (!r.ok) throw new Error(r.error || "Scan failed");
      setData(r);
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const tiers = data?.tiers || {};
  const counts = data?.counts || {};

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
        <button onClick={load} disabled={loading} title="Refresh Opportunity Engine scan" style={{ border: "none", background: "transparent", color: C.textDim, cursor: loading ? "not-allowed" : "pointer", fontFamily: MONO, fontSize: 11 }}>
          {loading ? "⏳" : "↻"}
        </button>
      </div>

      {error && <div style={{ padding: "0 10px", fontFamily: SANS, fontSize: 11, color: "#c8282a" }}>{error}</div>}
      {loading && !data && <div style={{ padding: "12px 10px", fontFamily: SANS, fontSize: 11, color: C.textDim }}>Scanning…</div>}

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
        {data && TIER_ORDER.map((key) => {
          const meta = TIER_META[key];
          const rows = tiers[key] || [];
          const count = counts[key] ?? rows.length;
          const isOpen = open[key];
          return (
            <div key={key}>
              <button
                onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                  background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`,
                  padding: "4px 2px", textAlign: "left",
                }}
              >
                <span style={{ fontFamily: MONO, fontSize: 11 }}>{meta.icon}</span>
                <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: meta.color, letterSpacing: 0.5 }}>{meta.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{count}</span>
                <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, color: C.textDim }}>{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && (
                count === 0 ? (
                  <div style={{ padding: "6px 4px", fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>No real setups in this tier right now.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "4px 0" }}>
                    {rows.slice(0, ROW_CAP).map((o) => {
                      const active = o.symbol === symbol;
                      return (
                        <button
                          key={o.symbol}
                          onClick={() => onSelectSymbol(o.symbol)}
                          title={o.verdictReason || ""}
                          style={{
                            textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 2,
                            background: active ? `${C.accent}14` : C.card,
                            borderTop: `1px solid ${active ? C.accent : meta.color + "33"}`,
                            borderRight: `1px solid ${active ? C.accent : meta.color + "33"}`,
                            borderBottom: `1px solid ${active ? C.accent : meta.color + "33"}`,
                            borderLeft: `3px solid ${meta.color}`, borderRadius: 6, padding: "6px 8px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.text }}>{o.symbol}</span>
                            <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginLeft: "auto" }}>{fmtPrice(o.price)}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 9.5, color: C.textDim }}>
                            <span>SCORE {o.score ?? "—"}</span>
                            <span>WIN {o.probability != null ? `${o.probability}%` : "—"}</span>
                            <span>EV {fmtPct(o.expectedValue)}</span>
                            {o.options?.status === "CONTRADICTS" && <span title={o.options.note} style={{ color: "#c8282a" }}>⚠ OPT</span>}
                          </div>
                        </button>
                      );
                    })}
                    {rows.length > ROW_CAP && (
                      <div style={{ padding: "2px 4px", fontFamily: SANS, fontSize: 10, color: C.textDim }}>+{rows.length - ROW_CAP} more not shown</div>
                    )}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
