export default function RiskLabTab({
  C, MONO, portfolioRows, scanDeepData,
}) {
        const card = (extra = {}) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, ...extra });
        // Compute portfolio metrics from positions
        const totalValue = portfolioRows.reduce((s, p) => s + p.shares * (p.currentPrice || p.avgCost || 0), 0);
        const positions = portfolioRows.map(p => {
          const val = p.shares * (p.currentPrice || p.avgCost || 0);
          const weight = totalValue > 0 ? val / totalValue : 0;
          const pnlPct = p.avgCost > 0 && p.currentPrice ? (p.currentPrice - p.avgCost) / p.avgCost : 0;
          // Use deep scan ATR if available, else estimate 2% daily vol
          const bars = scanDeepData[p.ticker]?.candles || [];
          let vol = 0.02;
          if (bars.length >= 14) {
            const highs = bars.map(b => b.high), lows = bars.map(b => b.low), closes = bars.map(b => b.close);
            const trs = [];
            for (let i = 1; i < Math.min(bars.length, 20); i++) {
              trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
            }
            const atr = trs.reduce((a, b) => a + b, 0) / trs.length;
            vol = (p.currentPrice || p.avgCost) > 0 ? atr / (p.currentPrice || p.avgCost) : 0.02;
          }
          return { ticker: p.ticker, val, weight, pnlPct, vol };
        });
        // Portfolio VaR (95%, 1-day) — simplified parametric
        const portVol = positions.length > 0 ? positions.reduce((s, p) => s + p.weight * p.vol, 0) : 0;
        const var95 = totalValue * portVol * 1.645;
        const var99 = totalValue * portVol * 2.326;
        // Beta: weighted sum (SPY beta = 1 baseline; use vol ratio as proxy if no beta data)
        const approxBeta = positions.length > 0 ? positions.reduce((s, p) => s + p.weight * (p.vol / 0.015), 0) : 1;
        // Stress scenarios
        const scenarios = [
          { name: "Flash Crash -10%", spyShock: -0.10, label: "2020 COVID Flash" },
          { name: "Recession -30%",   spyShock: -0.30, label: "2022 Bear Market" },
          { name: "GFC -50%",        spyShock: -0.50, label: "2008/09 Level" },
          { name: "Bull Run +20%",   spyShock: +0.20, label: "2023-style Rally" },
        ];
        // Tax-loss harvesting: positions with unrealized loss
        const losers = portfolioRows.filter(p => p.currentPrice && p.avgCost && p.currentPrice < p.avgCost)
          .map(p => ({ ticker: p.ticker, loss: (p.currentPrice - p.avgCost) * p.shares, lossAmt: Math.abs((p.currentPrice - p.avgCost) * p.shares) }))
          .sort((a, b) => a.loss - b.loss);

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ ...card({ padding: "14px 18px" }), display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.amber }}>⚠ RISK LABORATORY</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 2 }}>Stress testing · VaR · Beta exposure · Tax-loss harvesting</div>
              </div>
              <div style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, color: C.textDim }}>{portfolioRows.length} positions · ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} total</div>
            </div>
            {portfolioRows.length === 0 ? (
              <div style={{ ...card({ padding: 60, textAlign: "center" }) }}>
                <div style={{ fontFamily: MONO, fontSize: 32, marginBottom: 12 }}>⚠</div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>Add positions to Portfolio first</div>
              </div>
            ) : (
              <>
                {/* VaR + Beta row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                  <div style={{ ...card({ padding: 18, textAlign: "center", borderLeft: `4px solid ${C.red}` }) }}>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.red }}>-${var95.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>VaR 95% (1-DAY)</div>
                  </div>
                  <div style={{ ...card({ padding: 18, textAlign: "center", borderLeft: `4px solid ${C.red}` }) }}>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.red }}>-${var99.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>VaR 99% (1-DAY)</div>
                  </div>
                  <div style={{ ...card({ padding: 18, textAlign: "center", borderLeft: `4px solid ${C.amber}` }) }}>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.amber }}>{approxBeta.toFixed(2)}</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>PORTFOLIO BETA</div>
                  </div>
                  <div style={{ ...card({ padding: 18, textAlign: "center" }) }}>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.text }}>{(portVol * 100).toFixed(1)}%</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>AVG DAILY VOLATILITY</div>
                  </div>
                </div>
                {/* Stress tests */}
                <div style={{ ...card({ padding: 16 }) }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.amber, marginBottom: 12 }}>STRESS TEST SCENARIOS</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                    {scenarios.map((sc, i) => {
                      const impact = totalValue * approxBeta * sc.spyShock;
                      return (
                        <div key={i} style={{ padding: "14px 16px", background: C.surface, borderRadius: 8, borderLeft: `4px solid ${sc.spyShock < 0 ? C.red : C.green}` }}>
                          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{sc.name}</div>
                          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 2 }}>{sc.label}</div>
                          <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: sc.spyShock < 0 ? C.red : C.green, marginTop: 8 }}>
                            {impact >= 0 ? "+" : ""}${impact.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Tax-loss harvesting */}
                <div style={{ ...card({ padding: 16 }) }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.green, marginBottom: 10 }}>TAX-LOSS HARVESTING OPPORTUNITIES</div>
                  {losers.length === 0 ? (
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "12px 0" }}>No unrealized losses in portfolio — all positions are profitable</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {losers.map((l, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: C.redBg, borderRadius: 6 }}>
                          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{l.ticker}</div>
                          <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>Loss: ${l.lossAmt.toFixed(0)} · Tax savings ≈ ${(l.lossAmt * 0.22).toFixed(0)} (22%)</div>
                        </div>
                      ))}
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 6 }}>
                        * Estimated at 22% federal tax rate. Consult a tax professional. Wash-sale rule: do not repurchase within 30 days.
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        );
}
