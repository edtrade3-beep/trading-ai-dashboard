export default function HeatmapTab({
  C, MONO, portfolioHoldings, watchlistData, setActiveTab, setTerminalSymbol,
}) {
        const positions = (portfolioHoldings || []).filter(h => h.shares > 0);
        const enriched = positions.map(h => {
          const live = (watchlistData || []).find(q => q.symbol === h.symbol) || {};
          const avgCost = Number(h.avgCost || 0);
          // portfolioHoldings' real field is avgCost (see DEFAULT_PORTFOLIO /
          // PortfolioTab.jsx / RiskLabTab.jsx — every other consumer in the
          // app reads it) — this tab was the one place reading avgPrice/cost
          // instead, which don't exist on the object, so every position's
          // cost basis and P&L silently rendered as $0.00 / 0.00% no matter
          // what was actually entered in the Portfolio tab.
          const price = Number(live.price || avgCost || 0);
          const value = price * h.shares;
          const pnl = price && avgCost ? (price - avgCost) / avgCost * 100 : 0;
          return { ...h, price, value, pnlPct: pnl };
        });
        const totalValue = enriched.reduce((s, h) => s + h.value, 0);
        const sorted = [...enriched].sort((a, b) => b.value - a.value);

        function pnlColor(pct) {
          const absP = Math.min(Math.abs(pct), 10) / 10; // 0–1 scale
          if (pct > 0) return `rgba(34,212,126,${0.15 + absP * 0.65})`;
          if (pct < 0) return `rgba(255,69,96,${0.15 + absP * 0.65})`;
          return C.card;
        }

        const card = (extra = {}) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, ...extra });

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ ...card({ padding: "14px 18px" }), display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text }}>🔥 PORTFOLIO HEAT MAP</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 3 }}>Tile size = position value · Color = P&L</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
                {[{ c: C.green, l: "Gain" }, { c: C.red, l: "Loss" }, { c: C.textDim, l: "Flat" }].map(({ c, l }) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, background: c, opacity: 0.7 }} />
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>

            {sorted.length === 0 ? (
              <div style={{ ...card({ padding: 40 }), textAlign: "center" }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>No positions — add holdings in the PORTFOLIO tab</div>
              </div>
            ) : (
              <>
                {/* Heat map tiles */}
                <div style={card({ padding: 16 })}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {sorted.map(h => {
                      const sizePct = totalValue > 0 ? (h.value / totalValue) * 100 : 0;
                      const tileW   = Math.max(80, Math.min(220, sizePct * 8));
                      const tileH   = Math.max(64, Math.min(140, tileW * 0.6));
                      return (
                        <button key={h.symbol}
                          onClick={() => { setTerminalSymbol(h.symbol); try { localStorage.setItem("mterminal_load_sym", h.symbol); } catch {} setActiveTab("mterminal"); }}
                          title={`${h.symbol}: ${h.pnlPct >= 0 ? "+" : ""}${h.pnlPct.toFixed(2)}% · $${h.value.toFixed(0)}`}
                          style={{ width: tileW, height: tileH, background: pnlColor(h.pnlPct),
                            border: `1px solid ${h.pnlPct > 0 ? C.green : h.pnlPct < 0 ? C.red : C.border}44`,
                            borderRadius: 8, cursor: "pointer", display: "flex", flexDirection: "column",
                            alignItems: "center", justifyContent: "center", gap: 4, padding: 6 }}>
                          <div style={{ fontFamily: MONO, fontSize: Math.max(10, tileW / 9), fontWeight: 800, color: C.text }}>{h.symbol}</div>
                          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: h.pnlPct >= 0 ? C.green : C.red }}>
                            {h.pnlPct >= 0 ? "+" : ""}{h.pnlPct.toFixed(2)}%
                          </div>
                          {tileH > 80 && (
                            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>${(h.value / 1000).toFixed(1)}K</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Summary stats */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
                  {sorted.map(h => (
                    <div key={h.symbol} style={{ ...card({ padding: "10px 14px" }), borderLeft: `3px solid ${h.pnlPct >= 0 ? C.green : C.red}` }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>{h.symbol}</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 2 }}>{h.shares} shares @ ${Number(h.avgCost || 0).toFixed(2)}</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: h.pnlPct >= 0 ? C.green : C.red, marginTop: 4 }}>
                        {h.pnlPct >= 0 ? "▲" : "▼"} {Math.abs(h.pnlPct).toFixed(2)}%
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textSec }}>${h.value.toFixed(0)} ({totalValue > 0 ? (h.value / totalValue * 100).toFixed(1) : 0}%)</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
}
