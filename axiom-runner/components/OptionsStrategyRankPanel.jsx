import { useEffect, useState } from "react";

// OptionsStrategyRankPanel — Options Strategy Ranking Engine (Trade Desk
// redesign Phase 2, spec §15). Real GET /api/market/strategy-rank —
// evaluates every real structure strategy-selector.js can build real legs
// for (Long Calls/Puts, Bull Call/Bear Put Spread, Iron Condor) off one
// real chain and ranks them by strategy-ranking.js's own real composite
// (probability of profit, risk/reward, liquidity, directional alignment).
// Distinct from StrategySelectorCard.jsx (MarketTerminalTab's own single
// deterministic bias-driven pick, unchanged) — this shows the full ranked
// comparison the spec explicitly asks for ("rank strategies," not "pick
// one"), with that top pick expanded into its real legs.
const GRADE_COLOR = { A: "#0d9465", B: "#4fa87e", C: "#d6a312", D: "#e07b1a", F: "#c8282a" };

export default function OptionsStrategyRankPanel({ symbol, marketBias, C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true); setData(null); setExpanded(null);
    const params = new URLSearchParams({ symbol });
    if (marketBias?.bias) params.set("bias", marketBias.bias);
    if (marketBias?.character) params.set("character", marketBias.character);
    fetch(`/api/market/strategy-rank?${params.toString()}`).then((r) => r.json())
      .then((d) => { if (!cancelled && d?.ok) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, marketBias?.bias, marketBias?.character]);

  if (!symbol) return null;

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", background: C.card }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 8 }}>🧮 OPTIONS STRATEGY RANKING — {symbol}</div>
      {loading && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>Ranking real strategies off the live chain…</div>}
      {!loading && data && data.reason && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>{data.reason}</div>}
      {!loading && data && !data.reason && !data.ranked.length && (
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>No real structure could be built from the current chain — {(data.unavailable || []).map((u) => u.reason).filter(Boolean)[0] || "insufficient real chain depth."}</div>
      )}
      {!loading && data?.best && (
        <div style={{ border: `1px solid ${GRADE_COLOR[data.best.setupQuality]}66`, background: `${GRADE_COLOR[data.best.setupQuality]}12`, borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>BEST OPTIONS STRUCTURE</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "3px 0" }}>
            <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text }}>{data.best.strategy}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: GRADE_COLOR[data.best.setupQuality] }}>Grade {data.best.setupQuality}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Confidence {data.best.confidence}%</span>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 11, color: C.textSec }}>{data.best.reason}</div>
        </div>
      )}
      {!loading && data?.ranked?.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {data.ranked.map((s, i) => (
            <div key={s.strategy}>
              <button
                onClick={() => setExpanded((e) => (e === s.strategy ? null : s.strategy))}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, background: i === 0 ? `${C.accent}0d` : "transparent", cursor: "pointer", fontFamily: MONO, fontSize: 11 }}
              >
                <span style={{ color: C.textDim, width: 14 }}>#{i + 1}</span>
                <b style={{ color: C.text, flex: 1, textAlign: "left" }}>{s.strategy}</b>
                <span style={{ color: C.textDim }}>POP {s.pop != null ? `${s.pop}%` : "—"}</span>
                <span style={{ color: C.textDim }}>R:R {s.riskReward != null ? `${s.riskReward}` : "—"}</span>
                <span style={{ fontWeight: 800, color: GRADE_COLOR[s.setupQuality] }}>{s.composite}</span>
                <span style={{ color: C.textDim }}>{expanded === s.strategy ? "▾" : "▸"}</span>
              </button>
              {expanded === s.strategy && s.construction?.legs && (
                <div style={{ padding: "8px 10px", border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 6px 6px" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>{["ACTION", "TYPE", "STRIKE", "PREMIUM", "DELTA"].map((h) => (
                          <th key={h} style={{ padding: "4px 6px", fontFamily: MONO, fontSize: 9.5, color: C.textDim, textAlign: "right" }}>{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {s.construction.legs.map((l, li) => (
                          <tr key={li}>
                            <td style={{ padding: "3px 6px", fontFamily: MONO, fontSize: 11, fontWeight: 800, color: l.action === "BUY" ? C.green : C.red, textAlign: "right" }}>{l.action}</td>
                            <td style={{ padding: "3px 6px", fontFamily: MONO, fontSize: 11, color: C.text, textAlign: "right" }}>{l.type.toUpperCase()}</td>
                            <td style={{ padding: "3px 6px", fontFamily: MONO, fontSize: 11, color: C.text, textAlign: "right" }}>${l.strike}</td>
                            <td style={{ padding: "3px 6px", fontFamily: MONO, fontSize: 11, color: C.text, textAlign: "right" }}>${l.premium}</td>
                            <td style={{ padding: "3px 6px", fontFamily: MONO, fontSize: 11, color: C.textDim, textAlign: "right" }}>{l.delta ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 6, fontFamily: MONO, fontSize: 10.5, flexWrap: "wrap" }}>
                    {s.construction.netDebit != null && <span style={{ color: C.textDim }}>Net Debit <b style={{ color: C.text }}>${s.construction.netDebit}</b></span>}
                    {s.construction.netCredit != null && <span style={{ color: C.textDim }}>Net Credit <b style={{ color: C.text }}>${s.construction.netCredit}</b></span>}
                    {s.construction.maxProfit != null && <span style={{ color: C.textDim }}>Max Profit <b style={{ color: C.green }}>${s.construction.maxProfit}</b></span>}
                    {s.construction.maxLoss != null && <span style={{ color: C.textDim }}>Max Loss <b style={{ color: C.red }}>${s.construction.maxLoss}</b></span>}
                    <span style={{ color: C.textDim }}>Liquidity <b style={{ color: C.text }}>{s.liquidity ?? "—"}/100</b></span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {!loading && data?.unavailable?.length > 0 && (
        <div style={{ marginTop: 8, fontFamily: SANS, fontSize: 9.5, color: C.textDim }}>
          Not buildable right now: {data.unavailable.map((u) => u.strategy).join(", ")}
        </div>
      )}
    </div>
  );
}
