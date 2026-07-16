import { Badge } from "./ui-atoms.jsx";

export default function RotationTab({
  C, MONO, rotationRank, watchlistSymbols, setWatchlistSymbols, setTerminalSymbol, setActiveTab,
}) {
  return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                ROTATION ENGINE — CAPITAL FLOW RANKING
              </div>
              {rotationRank.length > 0 && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={async () => {
                      const msg = rotationRank.slice(0, 10).map((q, i) =>
                        `${i + 1}. *${q.symbol}* RS ${q.relVsSpy >= 0 ? "+" : ""}${q.relVsSpy.toFixed(2)}% RVOL ${q.rvol.toFixed(2)}x`
                      ).join("\n");
                      try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `📊 *Rotation Top 10*\n\n${msg}` }) }); } catch {}
                    }}
                    style={{ border: `1px solid ${C.textDim}44`, background: C.surface, color: C.textDim, borderRadius: 6, padding: "5px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                  >PUSH TOP 10</button>
                  <button
                    onClick={() => {
                      const header = "Rank,Symbol,Name,RS vs SPY %,RVOL,Price,Tag\n";
                      const rows = rotationRank.slice(0, 20).map((q, i) =>
                        `${i + 1},${q.symbol},"${q.name || ""}",${q.relVsSpy.toFixed(2)},${q.rvol.toFixed(2)},${q.price || ""},${q.relVsSpy >= 1 ? "LEADER" : q.relVsSpy <= -1 ? "LAGGER" : "NEUTRAL"}`
                      ).join("\n");
                      const blob = new Blob([header + rows], { type: "text/csv" });
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = `rotation-${new Date().toISOString().slice(0, 10)}.csv`;
                      a.click();
                    }}
                    style={{ border: `1px solid ${C.accent}40`, background: `${C.accent}10`, color: C.accent, borderRadius: 6, padding: "5px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                  >EXPORT CSV</button>
                </div>
              )}
            </div>
            {rotationRank.length > 0 && (() => {
              const leaders = rotationRank.filter(q => q.relVsSpy >= 1).length;
              const laggers = rotationRank.filter(q => q.relVsSpy <= -1).length;
              const neutral = rotationRank.length - leaders - laggers;
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 10 }}>
                  {[
                    { label: "TOTAL", value: rotationRank.length, color: C.text },
                    { label: "LEADERS (RS ≥ +1%)", value: leaders, color: C.green },
                    { label: "NEUTRAL", value: neutral, color: C.amber },
                    { label: "LAGGERS (RS ≤ -1%)", value: laggers, color: C.red },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px" }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{label}</div>
                      <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              {[...rotationRank].slice(0, 20).map((q, idx) => (
                <div key={q.symbol} style={{ display: "grid", gridTemplateColumns: "56px 1fr 150px 128px 116px auto", gap: 12, alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontFamily: MONO, color: C.textDim, fontSize: 12 }}>#{idx + 1}</span>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700 }}>{q.symbol}</div>
                    <div style={{ fontSize: 12, color: C.textDim }}>{q.name}</div>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 15, color: q.relVsSpy >= 0 ? C.green : C.red, fontWeight: 700 }}>
                    RS vs SPY {q.relVsSpy >= 0 ? "+" : ""}{q.relVsSpy.toFixed(2)}%
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 15, color: C.textSec, fontWeight: 700 }}>
                    RVOL {q.rvol.toFixed(2)}x
                  </div>
                  <Badge color={q.relVsSpy >= 1 ? C.green : q.relVsSpy <= -1 ? C.red : C.amber}>
                    {q.relVsSpy >= 1 ? "LEADER" : q.relVsSpy <= -1 ? "LAGGER" : "NEUTRAL"}
                  </Badge>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => { setTerminalSymbol(q.symbol); try { localStorage.setItem("mterminal_load_sym", q.symbol); } catch {} setActiveTab("mterminal"); }}
                      style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.accent, borderRadius: 6, padding: "5px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                    >CHART</button>
                    <button
                      onClick={() => setWatchlistSymbols(prev => watchlistSymbols.includes(q.symbol) ? prev.filter(s => s !== q.symbol) : Array.from(new Set([...prev, q.symbol])))}
                      style={{ border: `1px solid ${watchlistSymbols.includes(q.symbol) ? C.red : C.green}55`, background: C.surface, color: watchlistSymbols.includes(q.symbol) ? C.red : C.green, borderRadius: 6, padding: "5px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                    >{watchlistSymbols.includes(q.symbol) ? "−WL" : "+WL"}</button>
                    <button
                      onClick={async () => {
                        try {
                          await fetch("/api/journal", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              ticker: q.symbol,
                              side: q.relVsSpy >= 0 ? "BUY" : "SELL",
                              score: Math.round(Math.min(99, 60 + (q.composite || 0) * 0.3 + Number(q.relVsSpy || 0))),
                              entry: Number(q.price || 0),
                              notes: `Rotation #${idx + 1} · RS ${q.relVsSpy >= 0 ? "+" : ""}${q.relVsSpy.toFixed(2)}% · RVOL ${q.rvol.toFixed(2)}x`,
                              timeframe: "1D",
                              style: "Swing",
                            }),
                          });
                        } catch {}
                      }}
                      style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "5px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                    >LOG</button>
                    <button
                      onClick={async () => {
                        const msg = `🔄 *${q.symbol}* Rotation #${idx + 1}\nRS vs SPY: ${q.relVsSpy >= 0 ? "+" : ""}${q.relVsSpy.toFixed(2)}%  RVOL: ${q.rvol.toFixed(2)}x\nStatus: ${q.relVsSpy >= 1 ? "LEADER" : q.relVsSpy <= -1 ? "LAGGER" : "NEUTRAL"}`;
                        try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }); } catch {}
                      }}
                      style={{ border: `1px solid ${C.textDim}44`, background: C.surface, color: C.textDim, borderRadius: 6, padding: "5px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                      title="Send to Telegram"
                    >PUSH</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
  );
}
