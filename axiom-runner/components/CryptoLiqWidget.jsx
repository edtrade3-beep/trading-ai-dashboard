import { useState, useEffect } from "react";

export default function CryptoLiqWidget({ C, MONO, SANS }) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const syms = ["BTC", "ETH", "SOL"];
      const out = {};
      await Promise.all(syms.map(async s => {
        try { const r = await fetch(`/api/crypto/liquidations?symbol=${s}`); const d = await r.json(); if (d.ok) out[s] = d; } catch {}
      }));
      if (alive) { setData(out); setLoading(false); }
    };
    load();
    const t = setInterval(load, 3 * 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const fmt = v => v >= 1e9 ? `$${(v/1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${Math.round(v||0)}`;
  const syms = Object.keys(data);

  return (
    <div style={{ marginBottom: 10, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: "#f59e0b", letterSpacing: "0.08em", marginBottom: 8 }}>
        💥 CRYPTO LIQUIDATIONS <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>· 24h</span>
      </div>
      {loading && syms.length === 0 && <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Loading…</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        {["BTC","ETH","SOL"].map(s => {
          const d = data[s];
          if (!d) return null;
          const longs = d.liqs24h?.longs || 0;
          const shorts = d.liqs24h?.shorts || 0;
          const total = longs + shorts;
          const longPct = total > 0 ? Math.round(longs / total * 100) : 50;
          return (
            <div key={s} style={{ background: C.surface, borderRadius: 8, padding: "8px 10px", border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent }}>{s}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: (d.change24h||0) >= 0 ? C.green : C.red }}>
                  ${d.price >= 1000 ? Math.round(d.price).toLocaleString() : d.price?.toFixed(2)}
                </span>
              </div>
              {total > 0 ? (
                <>
                  <div style={{ height: 5, borderRadius: 3, overflow: "hidden", display: "flex", marginBottom: 5 }}>
                    <div style={{ width: `${longPct}%`, background: C.red }} />
                    <div style={{ width: `${100-longPct}%`, background: C.green }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10 }}>
                    <span style={{ color: C.red }}>🔴 Longs {fmt(longs)}</span>
                    <span style={{ color: C.green }}>🟢 Shorts {fmt(shorts)}</span>
                  </div>
                </>
              ) : (
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>No liquidation data</div>
              )}
              {/* Key levels */}
              {d.keyLevels && (d.keyLevels.biggestLongLiq || d.keyLevels.biggestShortLiq) && (
                <div style={{ marginTop: 5, paddingTop: 5, borderTop: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 9, color: C.textDim }}>
                  {d.keyLevels.biggestLongLiq && <div>⚠ Long liq zone: ${Math.round(d.keyLevels.biggestLongLiq.price).toLocaleString()}</div>}
                  {d.keyLevels.biggestShortLiq && <div>⚠ Short liq zone: ${Math.round(d.keyLevels.biggestShortLiq.price).toLocaleString()}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginTop: 6 }}>
        💡 Big long liquidations = forced selling (price crashed). Big shorts = forced buying (squeeze up).
      </div>
    </div>
  );
}
