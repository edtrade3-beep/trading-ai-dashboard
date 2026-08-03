import { useState, useEffect } from "react";
import { computeCompositeRiskScore, aggregatePortfolioGreeks } from "./risk-composite.js";

// ── Portfolio Risk — renders the exact risk-guardrails.js math that already
// silently gates the Alpaca/Tradier autopilots (open-risk %, sector
// concentration, daily-loss breaker, account health), visible to a human
// for the first time. Zero new risk logic — pure display of what already
// decides whether an automated trade is allowed to fire.
export default function PortfolioRiskCard({ C, MONO, SANS, distData }) {
  const [snap, setSnap] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | nokey | error

  // Correlation/sector/factor analysis — real, but needs a per-symbol
  // historical-bars fetch, so it's button-gated rather than polled every
  // 60s alongside the cheap risk snapshot above. Same real math as
  // HoldingsTab.jsx's manual-portfolio version, applied to the actual live
  // Alpaca account (src/portfolio-correlation-calc.js).
  const [corr, setCorr] = useState(null);
  const [corrState, setCorrState] = useState("idle"); // idle | loading | ok | error
  const runCorrelationAnalysis = () => {
    setCorrState("loading");
    fetch("/api/ai-hub/portfolio-correlation").then(r => r.json()).then(d => {
      if (d && d.ok) { setCorr(d); setCorrState("ok"); }
      else setCorrState("error");
    }).catch(() => setCorrState("error"));
  };

  // VaR95/99 + regression beta + volatility — real (src/risk-lab-calc.js,
  // already built for command-center-ai.js's narrative, now exposed as its
  // own route: GET /api/ai-hub/risk-lab). Same button-gated shape as
  // correlation above — also needs a real per-symbol historical-bars fetch.
  const [riskLab, setRiskLab] = useState(null);
  const [riskLabState, setRiskLabState] = useState("idle"); // idle | loading | ok | error
  const runRiskLab = () => {
    setRiskLabState("loading");
    fetch("/api/ai-hub/risk-lab").then(r => r.json()).then(d => {
      if (d && d.ok) { setRiskLab(d); setRiskLabState("ok"); }
      else setRiskLabState("error");
    }).catch(() => setRiskLabState("error"));
  };

  // Portfolio Greeks — real per-position delta/gamma/theta/vega, Phase 11's
  // already-polled Position Manager data (Polygon-sourced, honest null on
  // Yahoo fallback / no key). Zero new fetch cadence — one fetch on mount,
  // this card doesn't need 15-min-fresh Greeks the way the reprice job does.
  const [openPositions, setOpenPositions] = useState([]);
  useEffect(() => {
    fetch("/api/paper-positions").then(r => r.json()).then(d => {
      if (d && d.ok) setOpenPositions(d.open || []);
    }).catch(() => {});
  }, []);
  const greeks = aggregatePortfolioGreeks(openPositions);

  const composite = computeCompositeRiskScore({
    riskSnapshot: snap,
    riskLab: riskLabState === "ok" ? riskLab?.riskLab : null,
    correlation: corrState === "ok" ? corr : null,
    marketRiskScore: distData?.riskScore,
  });

  useEffect(() => {
    const load = () => {
      fetch("/api/ai-hub/risk-snapshot").then(r => r.json()).then(d => {
        if (d && d.ok) { setSnap(d); setState("ok"); }
        else if (d && d.reason === "no-alpaca-key") { setState("nokey"); }
        else { setState("error"); }
      }).catch(() => setState("error"));
    };
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  if (state === "nokey") return null;
  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.shadow, padding: 14, display: "flex", flexDirection: "column" };
  const title = <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 10 }}>PORTFOLIO RISK</div>;

  if (state === "loading") return <div style={card}>{title}<div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading…</div></div>;
  if (state === "error" || !snap) return <div style={card}>{title}<div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>Couldn't load risk snapshot.</div></div>;

  const riskCap = 6; // matches the maxRiskPct default used by both autopilot engines
  const riskPct = Math.min(100, (snap.openRiskPct / riskCap) * 100);
  const riskColor = snap.openRiskPct >= riskCap ? C.red : snap.openRiskPct >= riskCap * 0.7 ? C.amber : C.green;
  const sectors = Object.entries(snap.sectorConcentration || {}).sort((a, b) => b[1] - a[1]);
  const maxSectorCount = sectors.length ? sectors[0][1] : 0;

  const compositeColor = composite.score == null ? C.textDim : composite.score >= 80 ? C.green : composite.score >= 60 ? C.accent : composite.score >= 40 ? C.amber : C.red;

  return (
    <div style={card}>
      {title}

      {/* Composite Portfolio Score — Phase 13, weighted real blend of
          open-risk%/concentration (always available), VaR/beta and
          correlation (button-gated, blend in once run), and market-wide
          risk backdrop (already-fetched distData). Honest "no real risk
          data yet" until at least one dimension is available. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, background: `${compositeColor}14`, border: `1px solid ${compositeColor}44`, marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.04em" }}>PORTFOLIO SCORE</div>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: compositeColor }}>{composite.label}{composite.score != null && ` · ${composite.dimensionsUsed}/5 dimensions`}</div>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 900, color: compositeColor }}>{composite.score != null ? composite.score : "—"}</div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>OPEN RISK</span>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: riskColor }}>{snap.openRiskPct}% <span style={{ color: C.textDim, fontWeight: 400 }}>/ {riskCap}% cap</span></span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ height: "100%", width: `${riskPct}%`, background: riskColor, borderRadius: 3 }} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: C.textDim }}>Daily loss breaker</span>
        <span style={{ fontWeight: 700, color: snap.dailyBreakerTripped ? C.red : C.green }}>{snap.dailyBreakerTripped ? "🔴 TRIPPED" : "✅ OK"}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: C.textDim }}>Account health</span>
        <span style={{ fontWeight: 700, color: snap.accountHealth?.ok ? C.green : C.red }}>{snap.accountHealth?.ok ? "✅ OK" : `🔴 ${snap.accountHealth?.reason || "blocked"}`}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, marginBottom: 10 }}>
        <span style={{ color: C.textDim }}>Open positions</span>
        <span style={{ fontWeight: 700, color: C.text }}>{snap.positionCount}</span>
      </div>

      {snap.topPositionPct > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, marginBottom: 10 }}>
          <span style={{ color: C.textDim }}>Largest position ($-weighted)</span>
          <span style={{ fontWeight: 700, color: snap.topPositionPct >= 30 ? C.red : snap.topPositionPct >= 20 ? C.amber : C.text }}>{snap.topPositionPct}%</span>
        </div>
      )}
      {(snap.concentrationFlags || []).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
          {snap.concentrationFlags.map((f) => (
            <div key={f.symbol} style={{ fontFamily: MONO, fontSize: 10.5, color: f.pct >= 30 ? C.red : C.amber }}>
              ⚖️ {f.symbol} is {f.pct}% of the account — single-name risk
            </div>
          ))}
        </div>
      )}

      {sectors.length > 0 && (
        <>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.04em", marginBottom: 6 }}>SECTOR CONCENTRATION</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {sectors.map(([sec, count]) => (
              <div key={sec} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, minWidth: 70 }}>{sec}</span>
                <div style={{ flex: 1, height: 5, borderRadius: 3, background: C.border, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(count / maxSectorCount) * 100}%`, background: count >= 3 ? C.amber : C.accent, borderRadius: 3 }} />
                </div>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, minWidth: 14, textAlign: "right" }}>{count}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Portfolio Greeks — real sum of Position Manager's open positions'
          real per-contract delta/gamma/theta/vega × qty × 100 (Phase 13,
          reuses Phase 11's already-fetched data, zero new fetches beyond
          the one mount-time /api/paper-positions call above). */}
      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 12, marginBottom: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.04em", marginBottom: 6 }}>PORTFOLIO GREEKS — open paper positions</div>
        {!greeks.available ? (
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim }}>{greeks.reason}</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11 }}>
              <span style={{ color: C.textDim }}>Net Delta</span>
              <span style={{ fontWeight: 700, color: C.text }}>{greeks.netDelta != null ? `${greeks.netDelta >= 0 ? "+" : ""}${greeks.netDelta}` : "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11 }}>
              <span style={{ color: C.textDim }}>Net Gamma</span>
              <span style={{ fontWeight: 700, color: C.text }}>{greeks.netGamma != null ? `${greeks.netGamma >= 0 ? "+" : ""}${greeks.netGamma}` : "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11 }}>
              <span style={{ color: C.textDim }}>Net Theta</span>
              <span style={{ fontWeight: 700, color: greeks.netTheta != null && greeks.netTheta < 0 ? C.red : C.text }}>{greeks.netTheta != null ? `${greeks.netTheta >= 0 ? "+" : ""}${greeks.netTheta}` : "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11 }}>
              <span style={{ color: C.textDim }}>Net Vega</span>
              <span style={{ fontWeight: 700, color: C.text }}>{greeks.netVega != null ? `${greeks.netVega >= 0 ? "+" : ""}${greeks.netVega}` : "—"}</span>
            </div>
          </div>
        )}
        {greeks.available && <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim, marginTop: 6 }}>{greeks.positionsWithGreeks}/{greeks.positionsTotal} open positions have real Greeks (Polygon-sourced)</div>}
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 12 }}>
        <button onClick={runCorrelationAnalysis} disabled={corrState === "loading"}
          style={{ width: "100%", fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "8px 0", borderRadius: 8, cursor: corrState === "loading" ? "default" : "pointer",
            border: `1px solid ${C.accent}`, background: `${C.accent}14`, color: C.accent }}>
          {corrState === "loading" ? "Analyzing real correlation…" : "🔬 Run Correlation & Factor Analysis"}
        </button>
        {corrState === "error" && <div style={{ fontFamily: MONO, fontSize: 11, color: C.red, marginTop: 8 }}>Couldn't compute — try again.</div>}
        {corrState === "ok" && corr && (
          <div style={{ marginTop: 12 }}>
            {corr.syms.length < 2 ? (
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Need ≥2 positions with enough real price history for correlation.</div>
            ) : (
              <>
                {corr.clusters.length > 0 && (
                  <>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.04em", marginBottom: 6 }}>CORRELATION CLUSTERS (≥0.70)</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                      {corr.clusters.slice(0, 6).map((c) => (
                        <div key={c.a + c.b} style={{ fontFamily: MONO, fontSize: 10.5, color: C.textSec }}>
                          🔗 {c.a} + {c.b} move together ({c.correlation.toFixed(2)}) — effectively one bet
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {corr.clusters.length === 0 && (
                  <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.green, marginBottom: 12 }}>✅ No highly-correlated pairs (≥0.70) — real diversification across holdings.</div>
                )}
                {corr.factorExposure.length > 0 && (
                  <>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.04em", marginBottom: 6 }}>FACTOR EXPOSURE — real $-weighted correlation to style proxies, not a fabricated factor model</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                      {corr.factorExposure.map((f) => (
                        <div key={f.proxy} style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11 }}>
                          <span style={{ color: C.textDim }}>{f.label}</span>
                          <span style={{ fontWeight: 700, color: Math.abs(f.correlation) >= 0.7 ? C.amber : C.text }}>{f.correlation >= 0 ? "+" : ""}{f.correlation.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {corr.insufficientData.length > 0 && (
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>No correlation data yet for: {corr.insufficientData.join(", ")} (needs ≥20 days of real price history).</div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* VaR95/99 + regression beta + volatility — real, button-gated
          (Phase 13, GET /api/ai-hub/risk-lab, same real math already
          exposed on RiskLabTab.jsx, now sourced from the live Alpaca
          account). */}
      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 12 }}>
        <button onClick={runRiskLab} disabled={riskLabState === "loading"}
          style={{ width: "100%", fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "8px 0", borderRadius: 8, cursor: riskLabState === "loading" ? "default" : "pointer",
            border: `1px solid ${C.accent}`, background: `${C.accent}14`, color: C.accent }}>
          {riskLabState === "loading" ? "Computing real VaR/beta…" : "📉 Run VaR / Beta Analysis"}
        </button>
        {riskLabState === "error" && <div style={{ fontFamily: MONO, fontSize: 11, color: C.red, marginTop: 8 }}>Couldn't compute — try again.</div>}
        {riskLabState === "ok" && riskLab && !riskLab.riskLab && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 8 }}>{riskLab.reason === "no-open-positions" ? "No open Alpaca positions to analyze." : "Couldn't compute real VaR/beta right now."}</div>
        )}
        {riskLabState === "ok" && riskLab?.riskLab && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11 }}>
              <span style={{ color: C.textDim }}>1-day VaR (95%)</span>
              <span style={{ fontWeight: 700, color: C.text }}>${riskLab.riskLab.var95?.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11 }}>
              <span style={{ color: C.textDim }}>1-day VaR (99%)</span>
              <span style={{ fontWeight: 700, color: C.text }}>${riskLab.riskLab.var99?.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11 }}>
              <span style={{ color: C.textDim }}>Beta vs SPY{!riskLab.riskLab.betaAllReal && " (partial)"}</span>
              <span style={{ fontWeight: 700, color: C.text }}>{riskLab.riskLab.beta?.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11 }}>
              <span style={{ color: C.textDim }}>Avg daily volatility</span>
              <span style={{ fontWeight: 700, color: C.text }}>{riskLab.riskLab.avgDailyVolatilityPct?.toFixed(2)}%</span>
            </div>
            {/* Real open-portfolio Sharpe/Sortino/MaxDD — honest-null below
                20 real trading days (risk-lab-calc.js's own floor), never a
                guess off a short series. */}
            {riskLab.riskLab.sharpe != null ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11 }}>
                  <span style={{ color: C.textDim }}>Sharpe (annualized)</span>
                  <span style={{ fontWeight: 700, color: riskLab.riskLab.sharpe >= 0 ? C.green : C.red }}>{riskLab.riskLab.sharpe.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11 }}>
                  <span style={{ color: C.textDim }}>Sortino (annualized)</span>
                  <span style={{ fontWeight: 700, color: riskLab.riskLab.sortino >= 0 ? C.green : C.red }}>{Number.isFinite(riskLab.riskLab.sortino) ? riskLab.riskLab.sortino.toFixed(2) : "∞"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11 }}>
                  <span style={{ color: C.textDim }}>Max drawdown</span>
                  <span style={{ fontWeight: 700, color: C.text }}>{riskLab.riskLab.maxDrawdownPct?.toFixed(1)}%</span>
                </div>
              </>
            ) : (
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 4 }}>Sharpe/Sortino/Max drawdown building — {riskLab.riskLab.performanceDaysUsed || 0}/20 real trading days.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
