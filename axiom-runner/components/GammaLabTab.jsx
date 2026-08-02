import { useState, useEffect, useCallback } from "react";

// ─── GammaLabTab ────────────────────────────────────────────────────────
// The real UI page Phase 2's GEX engine never got. Options platform
// redesign Phase 7. Every number here is real — GET /api/market/gamma
// (src/gamma-exposure.js) — hard-gated on a real Polygon options chain
// with Greeks; honest "unavailable" everywhere when that isn't configured,
// same convention Phase 2 already established. Expected Pin/Magnet/Dealer
// Bias are real interpretive reads on top of the same real GEX numbers,
// explicitly labeled as an industry-standard convention, not a certainty.
export default function GammaLabTab({ C, MONO, SANS, defaultSymbol, setActiveTab }) {
  const [symbol, setSymbol] = useState(defaultSymbol || "AAPL");
  const [input, setInput] = useState(defaultSymbol || "AAPL");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (sym) => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/market/gamma?symbol=${encodeURIComponent(sym)}`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Failed");
      setData(d);
    } catch (e) { setError(e.message); setData(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(symbol); }, [symbol]);

  const row = (label, value, color, title) => (
    <div title={title} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}55` }}>
      <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: color || C.text }}>{value}</span>
    </div>
  );

  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" };

  return (
    <div style={{ padding: "0 0 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>GAMMA LAB</span>
        <div style={{ display: "flex", gap: 0, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === "Enter") { setSymbol(input); load(input); } }}
            placeholder="AAPL"
            style={{ width: 80, background: C.surface, border: "none", color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 10px", outline: "none" }}
          />
          <button onClick={() => { setSymbol(input); load(input); }}
            style={{ background: C.accent, border: "none", color: "#fff", fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "6px 12px", cursor: "pointer" }}>
            GO
          </button>
        </div>
        {data?.underlying > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.text }}>
            {symbol} @ <span style={{ color: C.accent }}>${data.underlying}</span>
          </span>
        )}
        {loading && <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>⟳ Loading…</span>}
        {error && <span style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>⚠ {error}</span>}
      </div>

      {data && !data.available && (
        <div style={{ ...card, borderColor: `${C.amber}55` }}>
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.amber, marginBottom: 6 }}>Gamma data unavailable</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>{data.reason || "Gamma data requires a real options chain with Greeks (Polygon) — unavailable."}</div>
        </div>
      )}

      {data && data.available && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
            <div style={card}>
              <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 6 }}>DEALER GAMMA</div>
              {row("Net GEX", data.netGEX?.toLocaleString() ?? "—", data.netGEX > 0 ? C.green : data.netGEX < 0 ? C.red : C.textDim,
                "Real dealer gamma exposure per 1% underlying move — standard public-GEX sign convention (customer-bought calls -> dealers net short calls), documented in src/gamma-exposure.js")}
              {row("Gamma Flip (Zero Gamma)", data.gammaFlipPoint != null ? `$${data.gammaFlipPoint}` : "—", C.text,
                "Real strike where cumulative GEX crosses zero — the level where dealer hedging behavior theoretically flips")}
              {row("Call Wall", data.callWall != null ? `$${data.callWall}` : "—", C.green)}
              {row("Put Wall", data.putWall != null ? `$${data.putWall}` : "—", C.red)}
            </div>

            <div style={card}>
              <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 6 }}>EXPECTED LEVELS</div>
              {row("Expected Pin", data.expectedPin != null ? `$${data.expectedPin}` : "—", C.text,
                "Real highest-OI strike closest to the real gamma flip point — a commonly-cited 'price tends to pin here on OPEX' read, not a guarantee")}
              {row("Expected Magnet", data.expectedMagnet != null ? `$${data.expectedMagnet} (${data.expectedMagnetSide})` : "—", C.accent,
                "Whichever real wall sits closer to current price — price is being 'pulled toward' this level, not a guaranteed target")}
              {row("Gamma Squeeze Risk", data.gammaSqueezeProbability != null ? `${data.gammaSqueezeProbability}%` : "Real short-interest data unavailable",
                data.gammaSqueezeProbability >= 60 ? C.red : C.textDim,
                "Real composite of dealer-short-gamma + real short-float % — src/options-math.js's gammaSqueezeProbability")}
            </div>

            <div style={card}>
              <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 6 }}>DEALER HEDGING</div>
              <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: data.dealerBias?.sign === "positive" ? C.green : data.dealerBias?.sign === "negative" ? C.red : C.textDim, marginBottom: 4 }}>
                {data.dealerBias?.label || "—"}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, lineHeight: 1.4 }}>{data.dealerBias?.note}</div>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 8 }}>
              GEX BY STRIKE — {data.expirySampleRange ? `${data.expirySampleRange.from} to ${data.expirySampleRange.to}` : ""} ({data.contractsSampled || 0} real contracts sampled)
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["STRIKE", "CALL GEX", "PUT GEX", "NET GEX", "TOTAL OI"].map(h => (
                      <th key={h} style={{ padding: "6px 10px", fontFamily: MONO, fontSize: 11, color: C.textDim, textAlign: "right", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.byStrike || []).map((r) => (
                    <tr key={r.strike} style={{ background: r.strike === data.gammaFlipPoint ? `${C.accent}0a` : "transparent" }}>
                      <td style={{ padding: "5px 10px", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text, textAlign: "right", borderBottom: `1px solid ${C.border}33` }}>${r.strike}</td>
                      <td style={{ padding: "5px 10px", fontFamily: MONO, fontSize: 12, color: C.green, textAlign: "right", borderBottom: `1px solid ${C.border}33` }}>{r.callContribution.toLocaleString()}</td>
                      <td style={{ padding: "5px 10px", fontFamily: MONO, fontSize: 12, color: C.red, textAlign: "right", borderBottom: `1px solid ${C.border}33` }}>{r.putContribution.toLocaleString()}</td>
                      <td style={{ padding: "5px 10px", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: r.netGEX >= 0 ? C.green : C.red, textAlign: "right", borderBottom: `1px solid ${C.border}33` }}>{r.netGEX.toLocaleString()}</td>
                      <td style={{ padding: "5px 10px", fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "right", borderBottom: `1px solid ${C.border}33` }}>{r.totalOI.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
