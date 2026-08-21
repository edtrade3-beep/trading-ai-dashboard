import { useState, useEffect } from "react";
import { DECISION_LABELS } from "./btc-hpc-scan.js";

// BTC + HPC Deep Scan (explicit user request, 2026-08-20). A dedicated
// view for the real BTC-mining/HPC-hosting pivot universe (IREN/WULF/
// CORZ/CIFR/RIOT). Server does all the real work (routes/market.js's
// /api/market/btc-hpc-scan + /api/market/btc-hpc-deep, reusing entry-
// engine.js, future-value-scoring.js, trade-planner-scoring.js — zero new
// scoring systems); this component only renders. The qualitative fields
// with no real API source (BTC economics, MW figures, contract value,
// customer quality, execution risk) are AI-extracted from real fetched
// news only (explicit user choice) — always shown with that disclosure,
// never presented as a verified numeric field.
//
// DECISION_LABELS now lives in btc-hpc-scan.js (client twin) — reused by
// SmartScanTab.jsx's deep-dive verdict too (2026-08-20, "ONE ENGINE"
// unification), so both screens show the exact same words.

function pct(v, digits = 1) { return Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${(v * (Math.abs(v) < 3 ? 100 : 1)).toFixed(digits)}%` : "—"; }
function dollars(v) { return Number.isFinite(v) ? `$${v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v.toLocaleString()}` : "—"; }

function Section({ title, C, MONO, children }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value, C, MONO, valueColor }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 12, padding: "3px 0" }}>
      <span style={{ color: C.textDim }}>{label}</span>
      <span style={{ fontWeight: 700, color: valueColor || C.text }}>{value}</span>
    </div>
  );
}

export default function BtcHpcScanCard({ C, MONO, SANS }) {
  const [scan, setScan] = useState(null);
  const [scanState, setScanState] = useState("loading"); // loading | ok | err
  const [selected, setSelected] = useState(null);
  const [deep, setDeep] = useState(null);
  const [deepState, setDeepState] = useState("idle"); // idle | loading | ok | err

  useEffect(() => {
    fetch("/api/market/btc-hpc-scan").then((r) => r.json()).then((d) => {
      if (d && d.ok) {
        setScan(d); setScanState("ok");
        if (d.rotation?.length) setSelected(d.rotation[0].symbol);
      } else setScanState("err");
    }).catch(() => setScanState("err"));
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setDeepState("loading"); setDeep(null);
    fetch(`/api/market/btc-hpc-deep?symbol=${encodeURIComponent(selected)}`).then((r) => r.json()).then((d) => {
      if (cancelled) return;
      if (d && d.ok) { setDeep(d); setDeepState("ok"); } else setDeepState("err");
    }).catch(() => { if (!cancelled) setDeepState("err"); });
    return () => { cancelled = true; };
  }, [selected]);

  return (
    <div style={{ padding: "16px 20px", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.text, marginBottom: 4 }}>₿ BTC + HPC DEEP SCAN</div>
      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginBottom: 14 }}>Real scan over IREN · WULF · CORZ · CIFR · RIOT — reuses the same engines as the rest of the platform, nothing fabricated.</div>

      {scanState === "loading" && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Loading real scan…</div>}
      {scanState === "err" && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Unavailable right now — try again shortly.</div>}

      {scan && (
        <>
          {/* BTC Regime */}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, background: C.card }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>BTC REGIME</span>
              <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: scan.btcRegime.regime === "BULLISH" ? "#22d47e" : scan.btcRegime.regime === "BEARISH" ? "#ef4444" : "#d6a312" }}>
                {scan.btcRegime.regime === "BULLISH" ? "🟢" : scan.btcRegime.regime === "BEARISH" ? "🔴" : "🟡"} {scan.btcRegime.label}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, fontFamily: MONO, fontSize: 11.5 }}>
              <div><span style={{ color: C.textDim }}>Price </span><b style={{ color: C.text }}>${scan.btcRegime.price?.toLocaleString()}</b></div>
              <div><span style={{ color: C.textDim }}>VWAP(20d) </span><b style={{ color: C.text }}>${scan.btcRegime.vwap?.toLocaleString()}</b></div>
              <div><span style={{ color: C.textDim }}>Momentum </span><b style={{ color: scan.btcRegime.momentum >= 0 ? "#22d47e" : "#ef4444" }}>{scan.btcRegime.momentum >= 0 ? "+" : ""}{scan.btcRegime.momentum}%</b></div>
              <div><span style={{ color: C.textDim }}>vs VWAP </span><b style={{ color: scan.btcRegime.aboveVwap ? "#22d47e" : "#ef4444" }}>{scan.btcRegime.aboveVwap ? "Above" : "Below"}</b></div>
            </div>
          </div>

          {/* Top Rotation */}
          <Section title="TOP ROTATION" C={C} MONO={MONO}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {scan.rotation.map((r, i) => (
                <button key={r.symbol} onClick={() => setSelected(r.symbol)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                    fontFamily: MONO, fontSize: 12.5, padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                    border: `1px solid ${selected === r.symbol ? r.decisionColor : C.border}`,
                    background: selected === r.symbol ? `${r.decisionColor}12` : C.card, textAlign: "left",
                  }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: C.textDim, width: 14 }}>{i + 1}.</span>
                    <b style={{ color: C.text }}>{r.symbol}</b>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 5px" }}>{r.grade}</span>
                  </span>
                  <span style={{ color: r.decisionColor, fontWeight: 800 }}>{r.decisionIcon} {DECISION_LABELS[r.decision] || r.decision}</span>
                </button>
              ))}
            </div>
          </Section>

          {deepState === "loading" && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 14 }}>Loading {selected}…</div>}
          {deepState === "err" && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 14 }}>Deep data unavailable for {selected} right now.</div>}

          {deep && deepState === "ok" && (
            <>
              {/* Final Decision */}
              <Section title={`FINAL DECISION — ${deep.symbol}`} C={C} MONO={MONO}>
                <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: deep.decision.color, marginBottom: 4 }}>
                  {deep.decision.icon} {DECISION_LABELS[deep.decision.decision] || deep.decision.decision}
                </div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec }}>{deep.decision.reason}</div>
              </Section>

              {/* Deep Fundamental Analysis */}
              <Section title="DEEP FUNDAMENTAL ANALYSIS" C={C} MONO={MONO}>
                {deep.fundamentals ? (
                  <>
                    <Row label="Revenue Growth" value={pct(deep.fundamentals.revenueGrowth)} C={C} MONO={MONO} valueColor={deep.fundamentals.revenueGrowth >= 0 ? "#22d47e" : "#ef4444"} />
                    <Row label="EBITDA Growth" value={deep.fundamentals.ebitdaGrowth != null ? pct(deep.fundamentals.ebitdaGrowth) : "Not available"} C={C} MONO={MONO} />
                    <Row label="Free Cash Flow" value={dollars(deep.fundamentals.freeCashFlow)} C={C} MONO={MONO} valueColor={deep.fundamentals.freeCashFlow >= 0 ? "#22d47e" : "#ef4444"} />
                    <Row label="FCF Growth" value={pct(deep.fundamentals.freeCashFlowGrowth)} C={C} MONO={MONO} />
                    <Row label="Cash" value={deep.fundamentals.cash != null ? dollars(deep.fundamentals.cash) : "Not available"} C={C} MONO={MONO} />
                    <Row label="Total Debt" value={deep.fundamentals.totalDebt != null ? dollars(deep.fundamentals.totalDebt) : "Not available"} C={C} MONO={MONO} />
                    <Row label="Net Debt/EBITDA" value={Number.isFinite(deep.fundamentals.netDebtToEbitda) ? `${deep.fundamentals.netDebtToEbitda.toFixed(1)}x` : "—"} C={C} MONO={MONO} />
                    <Row label="Dilution (shares growth)" value={pct(deep.fundamentals.sharesGrowth)} C={C} MONO={MONO} valueColor={deep.fundamentals.sharesGrowth > 0.05 ? "#ef4444" : "#22d47e"} />
                  </>
                ) : <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, fontStyle: "italic" }}>Fundamentals unavailable for {deep.symbol}.</div>}
                {/* AI-extracted qualitative context — real news only, explicitly disclosed as AI-extracted, never a verified field. */}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 4 }}>BTC ECONOMICS / AI-HPC / MW / CONTRACTS / CUSTOMER — AI-EXTRACTED FROM REAL NEWS ({deep.newsCount} headlines)</div>
                  {deep.qualitative ? (
                    <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec, whiteSpace: "pre-line", lineHeight: 1.6 }}>{deep.qualitative}</div>
                  ) : (
                    <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, fontStyle: "italic" }}>
                      {deep.qualitativeAvailable ? "No real news coverage found to extract from." : "AI extraction unavailable right now."}
                    </div>
                  )}
                </div>
              </Section>

              {/* Valuation */}
              <Section title="VALUATION" C={C} MONO={MONO}>
                {deep.valuation?.fairValue ? (
                  <>
                    <Row label="Current Price" value={`$${deep.technical.price}`} C={C} MONO={MONO} />
                    <Row label="Fair Value Range" value={`$${deep.valuation.fairValue.conservative} – $${deep.valuation.fairValue.bull}`} C={C} MONO={MONO} />
                    <Row label="Strong Buy Zone" value={`≤ $${deep.valuation.fairValue.idealBuyZoneMax}`} C={C} MONO={MONO} valueColor="#22d47e" />
                    <Row label="Buy Zone" value={`$${deep.valuation.fairValue.idealBuyZoneMax} – $${deep.valuation.fairValue.fairValue}`} C={C} MONO={MONO} />
                    <Row label="Upside to Fair Value" value={pct((deep.valuation.fairValue.fairValue / deep.technical.price - 1))} C={C} MONO={MONO} valueColor="#22d47e" />
                    <Row label="Margin of Safety" value={deep.valuation.fairValue.marginOfSafetyPct != null ? `${deep.valuation.fairValue.marginOfSafetyPct}%` : "—"} C={C} MONO={MONO} />
                  </>
                ) : <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, fontStyle: "italic" }}>No real analyst price targets available — valuation bands need those to be real, not estimated.</div>}
              </Section>

              {/* Technical */}
              <Section title="TECHNICAL" C={C} MONO={MONO}>
                <Row label="Stage" value={deep.technical.stage || "—"} C={C} MONO={MONO} />
                <Row label="VWAP (20d)" value={deep.technical.vwap20 != null ? `$${deep.technical.vwap20}` : "—"} C={C} MONO={MONO} />
                <Row label="50-day MA" value={deep.technical.ma50 != null ? `$${deep.technical.ma50}` : "—"} C={C} MONO={MONO} />
                <Row label="RSI" value={deep.technical.rsi != null ? deep.technical.rsi.toFixed(1) : "—"} C={C} MONO={MONO} />
                <Row label="Relative Volume" value={deep.technical.volRatio != null ? `${deep.technical.volRatio.toFixed(2)}x` : "—"} C={C} MONO={MONO} />
                <Row label="RS Rating" value={deep.technical.rsRating != null ? deep.technical.rsRating : "—"} C={C} MONO={MONO} />
                <Row label="Support" value={deep.technical.support != null ? `$${deep.technical.support}` : "—"} C={C} MONO={MONO} />
                <Row label="Resistance (Pivot)" value={deep.technical.resistance != null ? `$${deep.technical.resistance}` : "—"} C={C} MONO={MONO} />
              </Section>

              {/* Entry Plan (reuses the fixed Entry Engine) */}
              <Section title="ENTRY PLAN" C={C} MONO={MONO}>
                <Row label="Stage" value={deep.entryPlan.stage.replace(/_/g, " ")} C={C} MONO={MONO} />
                <Row label="Entry" value={deep.entryPlan.entryPrice != null ? `$${deep.entryPlan.entryPrice}` : "BLOCKED"} C={C} MONO={MONO} valueColor={deep.entryPlan.entryPrice != null ? "#22d47e" : "#ef4444"} />
                <Row label="Stop" value={deep.entryPlan.stop != null ? `$${deep.entryPlan.stop}` : "—"} C={C} MONO={MONO} />
                <Row label="Target" value={deep.entryPlan.target1 != null ? `$${deep.entryPlan.target1}` : "—"} C={C} MONO={MONO} />
                <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec, marginTop: 4 }}>{deep.entryPlan.recommendedAction}</div>
              </Section>
            </>
          )}
        </>
      )}
    </div>
  );
}
