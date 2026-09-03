import { useState, useEffect } from "react";

// Trade GPS Stage 8 follow-up (2026-09-03) — the one real UI surface for
// trade-gps-audit-store.js's getPerformanceViews(). That store has been
// recording every real closed Autopilot 2.0 setup outcome since Stage 8
// shipped, but nothing ever displayed it. Self-contained/self-fetching,
// same convention as this file's sibling cards — a real, honest "no
// closed setups yet" state when the sample is empty, never a fabricated
// number.
export default function TradeGpsPerformancePanel({ C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [groupBy, setGroupBy] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const qs = groupBy ? `?window=50&groupBy=${groupBy}` : "?window=50";
    fetch(`/api/market/trade-gps-performance${qs}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { if (d.ok) { setData(d); setError(null); } else setError(d.error || "Failed to load"); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [groupBy]);

  const Stat = ({ label, value, col }) => (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 20px", textAlign: "center" }}>
      <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 900, color: col || C.text, lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 6 }}>{label}</div>
    </div>
  );

  const overall = data?.overall;
  const sampleSize = data?.sampleSize ?? 0;

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text }}>🛰️ TRADE GPS PERFORMANCE</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[["Overall", null], ["By Regime", "regime"], ["By Setup", "setup"]].map(([label, key]) => (
            <button key={label} onClick={() => setGroupBy(key)}
              style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "5px 10px", borderRadius: 999, cursor: "pointer",
                border: `1px solid ${groupBy === key ? C.accent : C.border}`, background: groupBy === key ? `${C.accent}18` : "transparent",
                color: groupBy === key ? C.accent : C.textDim }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.red }}>Unable to load Trade GPS performance: {error}</div>
      ) : !data ? (
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Loading real Trade GPS performance…</div>
      ) : sampleSize === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 40, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 13, color: C.text, marginBottom: 8 }}>No closed Trade GPS setups yet</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Fills in automatically as Autopilot 2.0 exits real paper positions — no manual logging needed.</div>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))", gap: 10, marginBottom: data?.groups ? 20 : 0 }}>
            <Stat label="Win Rate" value={overall.winRate != null ? `${overall.winRate}%` : "—"} col={overall.winRate >= 60 ? C.green : overall.winRate >= 45 ? C.amber : C.red} />
            <Stat label="Closed Setups" value={overall.count} />
            <Stat label="Profit Factor" value={overall.profitFactor ?? (overall.profitFactorNote ? "∞" : "—")} col={overall.profitFactor >= 2 ? C.green : overall.profitFactor >= 1 ? C.amber : C.red} />
            <Stat label="Avg Return" value={overall.avgReturnPct != null ? `${overall.avgReturnPct >= 0 ? "+" : ""}${overall.avgReturnPct}%` : "—"} col={overall.avgReturnPct >= 0 ? C.green : C.red} />
            <Stat label="Max Drawdown" value={`${overall.maxDrawdownPct}%`} col={overall.maxDrawdownPct >= -5 ? C.green : overall.maxDrawdownPct >= -15 ? C.amber : C.red} />
            <Stat label="Total P&L" value={`${overall.totalPnl >= 0 ? "+" : ""}$${overall.totalPnl.toFixed(0)}`} col={overall.totalPnl >= 0 ? C.green : C.red} />
          </div>

          {data.groups && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Object.entries(data.groups).sort((a, b) => b[1].count - a[1].count).map(([key, stats]) => {
                const pct = stats.winRate ?? 0;
                const col = pct >= 60 ? C.green : pct >= 45 ? C.amber : C.red;
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface, borderRadius: 6, padding: "8px 12px" }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text, width: 140 }}>{key}</span>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: C.border, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 4 }} />
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: col, width: 50, textAlign: "right" }}>{pct}%</span>
                    <span style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>{stats.count} setups</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
