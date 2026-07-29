export default function RiskLabTab({
  C, MONO, portfolioRows,
}) {
        const card = (extra = {}) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, ...extra });
        // Real portfolio VaR/beta — server-side computeRiskLab (same real
        // regression-beta-vs-SPY math command-center-ai.js uses for live
        // Alpaca positions, Phase 3 of the Institutional Research Upgrade,
        // 2026-07-29). Was previously an inline client vol-ratio proxy
        // duplicated from risk-lab-calc.js; now one real source for both.
        // `portfolioRows` here is the real Alpaca-positions feed built at
        // the root app level (riskLabPositions in axiom-live.jsx) -- NOT
        // the manual CSV/paste-import portfolioHoldings the Portfolio tab
        // uses. Fixed 2026-07-29 (CTO audit item #3 + explicit user
        // confirmation that Alpaca is the real/primary account): this
        // component's own code always expected {ticker,shares,
        // currentPrice,avgCost}, but was previously fed the manual list's
        // {symbol,shares,avgCost,live,marketValue,...} shape -- meaning
        // every position posted to /api/market/portfolio-risk silently had
        // symbol:undefined and currentPrice:undefined regardless of which
        // account it should have reflected.
        const [riskLab, setRiskLab] = React.useState(null);
        const [riskLabState, setRiskLabState] = React.useState("idle"); // idle | loading | ok | err
        const posKey = portfolioRows.map(p => `${p.ticker}:${p.shares}:${p.currentPrice || p.avgCost}`).join(",");
        React.useEffect(() => {
          if (!portfolioRows.length) { setRiskLab(null); setRiskLabState("idle"); return; }
          setRiskLabState("loading");
          fetch("/api/market/portfolio-risk", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ positions: portfolioRows.map(p => ({ symbol: p.ticker, shares: p.shares, currentPrice: p.currentPrice, avgCost: p.avgCost })) }),
          }).then(r => r.json()).then(d => {
            if (d.ok && d.riskLab) { setRiskLab(d.riskLab); setRiskLabState("ok"); }
            else setRiskLabState("err");
          }).catch(() => setRiskLabState("err"));
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [posKey]);

        const totalValue = riskLab ? riskLab.totalValue : portfolioRows.reduce((s, p) => s + p.shares * (p.currentPrice || p.avgCost || 0), 0);
        const loading = riskLabState === "loading" || (riskLabState === "idle" && portfolioRows.length > 0);
        const var95 = riskLab ? riskLab.var95 : 0;
        const var99 = riskLab ? riskLab.var99 : 0;
        const approxBeta = riskLab ? riskLab.beta : 1;
        const portVol = riskLab ? riskLab.avgDailyVolatilityPct / 100 : 0;
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
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>No open Alpaca positions</div>
              </div>
            ) : (
              <>
                {/* VaR + Beta row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                  <div style={{ ...card({ padding: 18, textAlign: "center", borderLeft: `4px solid ${C.red}` }) }}>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.red }}>{loading ? "…" : riskLab ? "-$" + var95.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"}</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>VaR 95% (1-DAY)</div>
                  </div>
                  <div style={{ ...card({ padding: 18, textAlign: "center", borderLeft: `4px solid ${C.red}` }) }}>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.red }}>{loading ? "…" : riskLab ? "-$" + var99.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"}</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>VaR 99% (1-DAY)</div>
                  </div>
                  <div style={{ ...card({ padding: 18, textAlign: "center", borderLeft: `4px solid ${C.amber}` }) }} title={riskLab && !riskLab.betaAllReal ? "One or more holdings lack enough real history for a regression beta — falls back to a vol-ratio estimate for those" : "Real OLS regression vs SPY daily returns"}>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.amber }}>{loading ? "…" : riskLab ? approxBeta.toFixed(2) : "—"}{riskLab && !riskLab.betaAllReal && <span style={{ fontSize: 12 }}> *</span>}</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>PORTFOLIO BETA{riskLab && !riskLab.betaAllReal ? " *" : ""}</div>
                  </div>
                  <div style={{ ...card({ padding: 18, textAlign: "center" }) }}>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.text }}>{loading ? "…" : riskLab ? (portVol * 100).toFixed(1) + "%" : "—"}</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>AVG DAILY VOLATILITY</div>
                  </div>
                </div>
                {riskLabState === "err" && <div style={{ fontFamily: MONO, fontSize: 11, color: C.red }}>⚠ Couldn't compute real risk metrics — try again shortly.</div>}
                {/* Stress tests */}
                <div style={{ ...card({ padding: 16 }) }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.amber, marginBottom: 12 }}>STRESS TEST SCENARIOS</div>
                  {!riskLab ? (
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "8px 0" }}>{loading ? "Computing real beta…" : "Real beta unavailable — can't project a stress scenario."}</div>
                  ) : (
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
                  )}
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
