import { useState, useEffect } from "react";

// StrategySelectorCard — AI Strategy Selector, options platform redesign
// Phase 9. Receives `marketBias` (computeMarketBias's real output, Phase 1)
// as a prop from the parent page rather than re-deriving its own regime
// formula — one bias source across the app. Self-contained beyond that:
// fetches its own real IV Rank (Phase 8) and the real strategy pick + real
// constructed legs (GET /api/market/strategy, src/strategy-selector.js).
export default function StrategySelectorCard({ symbol, marketBias, C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol || !marketBias?.bias || !marketBias?.character) { setData(null); return; }
    setLoading(true); setData(null);
    (async () => {
      try {
        const ivRes = await fetch(`/api/market/iv-rank?symbol=${encodeURIComponent(symbol)}`).then(r => r.json()).catch(() => null);
        const ivRank = ivRes?.available ? ivRes.rank : null;
        const params = new URLSearchParams({ symbol, bias: marketBias.bias, character: marketBias.character });
        if (ivRank != null) params.set("ivRank", String(ivRank));
        const res = await fetch(`/api/market/strategy?${params.toString()}`).then(r => r.json()).catch(() => null);
        setData(res?.ok ? res : null);
      } finally { setLoading(false); }
    })();
  }, [symbol, marketBias?.bias, marketBias?.character]);

  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" };

  if (!marketBias?.bias) return null;
  if (loading) return <div style={{ ...card, fontFamily: MONO, fontSize: 12, color: C.textDim }}>⟳ Selecting real strategy…</div>;
  if (!data) return null;

  const c = data.construction;
  const legColor = (action) => action === "BUY" ? C.green : C.red;

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>AI STRATEGY SELECTOR</div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{marketBias.bias} · {marketBias.character}{data.ivRank != null ? ` · IV Rank ${data.ivRank}` : ""}</div>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text, marginBottom: 4 }}>{data.strategy}</div>
      <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginBottom: 10, lineHeight: 1.4 }}>{data.reason}</div>

      {c?.available ? (
        <>
          <div style={{ overflowX: "auto", marginBottom: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["ACTION", "TYPE", "STRIKE", "EXPIRY", "PREMIUM", "DELTA", "POP"].map(h => (
                    <th key={h} style={{ padding: "6px 8px", fontFamily: MONO, fontSize: 10, color: C.textDim, textAlign: "right", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.legs.map((l, i) => (
                  <tr key={i}>
                    <td style={{ padding: "5px 8px", fontFamily: MONO, fontSize: 12, fontWeight: 800, color: legColor(l.action), textAlign: "right", borderBottom: `1px solid ${C.border}33` }}>{l.action}</td>
                    <td style={{ padding: "5px 8px", fontFamily: MONO, fontSize: 12, color: C.text, textAlign: "right", borderBottom: `1px solid ${C.border}33` }}>{l.type.toUpperCase()}</td>
                    <td style={{ padding: "5px 8px", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text, textAlign: "right", borderBottom: `1px solid ${C.border}33` }}>${l.strike}</td>
                    <td style={{ padding: "5px 8px", fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "right", borderBottom: `1px solid ${C.border}33` }}>{l.expiry}</td>
                    <td style={{ padding: "5px 8px", fontFamily: MONO, fontSize: 12, color: C.text, textAlign: "right", borderBottom: `1px solid ${C.border}33` }}>${l.premium}</td>
                    <td style={{ padding: "5px 8px", fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "right", borderBottom: `1px solid ${C.border}33` }}>{l.delta != null ? l.delta : "—"}</td>
                    <td style={{ padding: "5px 8px", fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "right", borderBottom: `1px solid ${C.border}33` }}>{l.pop != null ? `${l.pop}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontFamily: MONO, fontSize: 12 }}>
            {c.netDebit != null && <span style={{ color: C.textDim }}>Net Debit: <b style={{ color: C.text }}>${c.netDebit}</b></span>}
            {c.netCredit != null && <span style={{ color: C.textDim }}>Net Credit: <b style={{ color: C.text }}>${c.netCredit}</b></span>}
            {c.maxProfit != null && <span style={{ color: C.textDim }}>Max Profit: <b style={{ color: C.green }}>${c.maxProfit}</b></span>}
            {c.maxLoss != null && <span style={{ color: C.textDim }}>Max Loss: <b style={{ color: C.red }}>${c.maxLoss}</b></span>}
          </div>
        </>
      ) : (
        <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim }}>{c?.reason || "No real legs constructed for this strategy."}</div>
      )}
    </div>
  );
}
