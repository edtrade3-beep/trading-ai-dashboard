import { useState } from "react";
import { computeSniperDecision } from "./sniper-decision.js";
import { FundamentalsPanel, OptionsFlowPanel } from "./terminal-panels.jsx";

// AI Sniper Decision Screen — explicit user spec (2026-08-10): "redesign my
// AI Sniper Scanner into a true 10-second trading decision workspace...
// the primary problem is information overload and contradictory signals."
// Phase 1: the decision engine (sniper-decision.js) + this Level 1/2 hero
// screen. Phase 2 (this update): the full 6-tab Deep Analysis panel from
// the spec — Technical/Minervini/Fundamental/Market·Sector/Options·Flow/
// Risk. Fundamental and Options/Flow reuse the app's own existing
// FundamentalsPanel/OptionsFlowPanel components as-is (terminal-panels.jsx)
// rather than re-fetching/re-deriving the same real data a second way;
// they only fetch once their tab is actually opened (lazy mount).
//
// `row` is one of RhProScanner's already-fully-computed displayRows (score,
// aplus, institutionalGrade, quality, prediction, smc, riskState, criteria,
// etc. all already attached) — this component adds zero new fetches for
// the first 4 tabs, only the new computeSniperDecision() combinator on top
// of data that already exists.
export default function SniperDecisionModal({ C, MONO, SANS, row, regime, sectorInfo, onClose, onOpenPlan }) {
  const [showDeep, setShowDeep] = useState(false);
  const [deepTab, setDeepTab] = useState("technical");
  if (!row) return null;
  const d = computeSniperDecision(row);

  const chgPct = Number(row.dayChangePct ?? row.chgPct);
  const chgKnown = Number.isFinite(chgPct);

  const riskAmt = (d.entry != null && d.stop != null) ? Math.abs(d.entry - d.stop) : null;
  const rewardAmt = (d.entry != null && d.target2 != null) ? Math.abs(d.target2 - d.entry) : null;
  const riskFrac = (riskAmt != null && rewardAmt != null && riskAmt + rewardAmt > 0) ? riskAmt / (riskAmt + rewardAmt) : 0.35;

  // LOCATION card — VWAP position plus how far from the pivot, the two real
  // "is price in a good spot" signals this app already computes.
  const locationGood = d.gates.aboveVwap !== false && !d.gates.extended;
  const locationSub = d.gates.aboveVwap == null ? "VWAP unavailable"
    : d.gates.aboveVwap ? "Above VWAP" : "Below VWAP";

  // TRADE QUALITY card — real Trade Setup Score (computeAPlusScore), the
  // dimension that already blends entry timing/breakout/volume/risk
  // discipline — closest real analog to "how good is THIS entry", distinct
  // from the Stock Quality / Institutional Grade shown elsewhere in the app.
  const setupScore = row.aplus?.score;
  const setupWord = setupScore >= 75 ? "Excellent" : setupScore >= 65 ? "Strong" : setupScore >= 50 ? "Fair" : "Weak";

  const riskWord = row.riskState === "LOW" ? "Manageable" : row.riskState === "MEDIUM" ? "Moderate" : row.riskState === "HIGH" ? "Elevated" : "—";
  const riskCol = row.riskState === "LOW" ? "#0d9465" : row.riskState === "MEDIUM" ? "#d6a312" : row.riskState === "HIGH" ? "#c8282a" : C.textDim;

  const trendWord = (row.stage || "").includes("2") ? "Bullish" : (row.stage || "").includes("4") ? "Bearish" : "Neutral";
  const trendCol = trendWord === "Bullish" ? "#0d9465" : trendWord === "Bearish" ? "#c8282a" : C.textDim;

  const miniCard = (label, value, valueColor, sub, icon) => (
    <div style={{ flex: "1 1 140px", minWidth: 120, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: valueColor }}>{value}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const numBox = (label, value, color, sub) => (
    <div style={{ flex: "1 1 100px", minWidth: 90 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color, ...{ fontVariantNumeric: "tabular-nums" } }}>{value != null ? `$${value.toFixed(2)}` : "—"}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginTop: 1 }}>{sub}</div>}
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(8,18,34,0.6)", zIndex: 10600, display: "grid", placeItems: "center", padding: 16, overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 620, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto",
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: "0 28px 70px rgba(15,27,45,0.35)", padding: 20 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em" }}>⊕ AI SNIPER · 10-SECOND DECISION</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 3 }}>
              <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 900, color: C.text }}>{row.symbol}</span>
              {row.longName && <span style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>{row.longName}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
              <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: C.text }}>${Number(row.price).toFixed(2)}</span>
              {chgKnown && <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: chgPct >= 0 ? C.green : C.red }}>{chgPct >= 0 ? "+" : ""}{chgPct.toFixed(2)}%</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: C.textDim, fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {/* AI SNIPER ACTION hero */}
        <div style={{ background: `${d.meta.color}12`, border: `1px solid ${d.meta.color}55`, borderRadius: 12, padding: "16px 18px", marginBottom: 12, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.1em", marginBottom: 6 }}>AI SNIPER ACTION</div>
          <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 900, color: d.meta.color, lineHeight: 1.1, marginBottom: 8 }}>{d.meta.icon} {d.meta.label.toUpperCase()}</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 18, flexWrap: "wrap", fontFamily: MONO, fontSize: 12.5 }}>
            {Number.isFinite(row.confidence) && <span>CONFIDENCE: <b style={{ color: row.confidence >= 70 ? C.green : row.confidence >= 40 ? C.amber : C.textDim }}>{Math.round(row.confidence)}%</b></span>}
            {Number.isFinite(setupScore) && <span>SCORE: <b style={{ color: setupScore >= 65 ? C.green : setupScore >= 50 ? C.amber : C.textDim }}>{setupScore}/100</b></span>}
            {Number.isFinite(setupScore) && setupScore >= 75 && <span style={{ color: "#0d9465", fontWeight: 800 }}>A+ SETUP</span>}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, marginTop: 8, lineHeight: 1.5 }}>{d.reason}</div>
        </div>

        {/* 5 mini-cards */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {miniCard("TREND", trendWord, trendCol, (row.passCount ?? "?") + "/8", trendWord === "Bullish" ? "📈" : trendWord === "Bearish" ? "📉" : "➡️")}
          {miniCard("LOCATION", locationGood ? "Good" : "Poor", locationGood ? "#0d9465" : "#c8282a", locationSub, "🎯")}
          {miniCard("CONFIRMATION", d.gates.volumeConfirmed ? "Strong" : "Weak", d.gates.volumeConfirmed ? "#0d9465" : "#d6a312", Number.isFinite(row.volRatio) ? `RVOL ${row.volRatio.toFixed(1)}x` : "—", "📊")}
          {miniCard("TRADE QUALITY", setupWord, setupWord === "Excellent" || setupWord === "Strong" ? "#0d9465" : setupWord === "Fair" ? "#d6a312" : "#c8282a", d.rr != null ? `R:R ${d.rr.toFixed(1)}` : "—", "⚖️")}
          {miniCard("RISK", riskWord, riskCol, row.riskState ? `${row.riskState} risk` : "—", "🛡️")}
        </div>

        {/* Entry / Stop / Targets / R:R */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 10 }}>
            {numBox("ENTRY TRIGGER", d.entry, C.text)}
            {numBox("CURRENT PRICE", d.price, C.text)}
            {numBox("STOP LOSS", d.stop, "#c8282a")}
            {numBox("TARGET 1", d.target1, "#5ab552", "1R · scale out")}
            {numBox("TARGET 2", d.target2, "#0d9465", d.rr != null ? `R:R ${d.rr.toFixed(1)} : 1` : null)}
          </div>
          {riskAmt != null && rewardAmt != null && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>
                <span>RISK ${riskAmt.toFixed(2)}</span>
                <span>REWARD ${rewardAmt.toFixed(2)}</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${riskFrac * 100}%`, background: "#c8282a" }} />
                <div style={{ width: `${(1 - riskFrac) * 100}%`, background: "#0d9465" }} />
              </div>
            </div>
          )}
        </div>

        {/* WHY THIS SETUP */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 6 }}>WHY THIS SETUP?</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {d.reasons.map((r, i) => (
              <span key={i} style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, color: r.ok ? "#0d9465" : "#c8282a" }}>
                {r.ok ? "✓" : "✗"} {r.text}
              </span>
            ))}
          </div>
        </div>

        {/* Early Reversal Watch — "add when to get out before stock goes
            down and get in before stock goes up" (2026-08-10). Near-top
            (get-out) risk already feeds the hard-gated action above (see
            sniper-decision.js); near-bottom (get-in) risk is deliberately
            NOT allowed to override a weak-trend AVOID/WAIT into an entry —
            it's real, but speculative before the trend actually confirms —
            so it's shown here as its own watch flag instead. */}
        {d.reversal?.isBottom && (
          <div style={{ background: "#0d946512", border: "1px solid #0d946555", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: "#0d9465", letterSpacing: "0.06em", marginBottom: 4 }}>🟢 EARLY REVERSAL WATCH — {d.reversal.verdict}</div>
            <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec, lineHeight: 1.5 }}>{d.reversal.sigs.map(s => s.txt).join(" · ")}</div>
            <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: 4 }}>Real early signs only — trend quality above hasn't confirmed yet, so this isn't a buy trigger. Worth watching for confirmation.</div>
          </div>
        )}

        {/* Waiting for */}
        {d.waitingFor && (
          <div style={{ background: `${d.meta.color}10`, border: `1px solid ${d.meta.color}44`, borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontFamily: SANS, fontSize: 12.5, color: C.text, textAlign: "center", fontWeight: 700 }}>
            {d.meta.label === "Wait" ? "WAITING FOR: " : ""}{d.waitingFor}
          </div>
        )}

        {onOpenPlan && (
          <button onClick={() => onOpenPlan(row.symbol)} style={{ width: "100%", fontFamily: MONO, fontSize: 12.5, fontWeight: 800, padding: "10px 0", borderRadius: 8, border: "none", color: "#fff", background: C.accent, cursor: "pointer", marginBottom: 12 }}>
            Open Full Chart + Trade Plan →
          </button>
        )}

        {/* Deep Analysis — full 6-tab panel (Phase 2, 2026-08-10). Collapsed
            by default; the trader shouldn't need this during the normal
            10-second read. */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
          <button onClick={() => setShowDeep(v => !v)}
            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", font: "inherit", fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textSec, background: "transparent", border: "none", cursor: "pointer", padding: "4px 0" }}>
            <span>DEEP ANALYSIS</span><span>{showDeep ? "▴" : "▾"}</span>
          </button>
          {showDeep && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
                {[
                  ["technical", "Technical"], ["minervini", "Minervini"], ["fundamental", "Fundamental"],
                  ["market", "Market/Sector"], ["options", "Options/Flow"], ["risk", "Risk"],
                ].map(([id, label]) => (
                  <button key={id} onClick={() => setDeepTab(id)}
                    style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, padding: "5px 10px", borderRadius: 6, cursor: "pointer",
                      border: `1px solid ${deepTab === id ? C.accent : C.border}`, background: deepTab === id ? C.accent : "transparent", color: deepTab === id ? "#fff" : C.textSec }}>
                    {label}
                  </button>
                ))}
              </div>

              {deepTab === "technical" && (() => {
                const adx = row.technicals?.adx;
                const statRow = (label, value, color) => (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontFamily: SANS, fontSize: 12 }}>
                    <span style={{ color: C.textDim }}>{label}</span><span style={{ fontWeight: 800, color: color || C.text }}>{value}</span>
                  </div>
                );
                return (
                  <div>
                    {statRow("ADX (trend strength)", adx ? `${adx.adx} — ${adx.strength}, ${adx.direction}` : "—", adx?.direction === "Bullish" ? "#0d9465" : adx?.direction === "Bearish" ? "#c8282a" : C.textDim)}
                    {statRow("20-day VWAP", d.vwap20 != null ? `$${d.vwap20.toFixed(2)} — price is ${d.gates.aboveVwap ? "above" : "below"}` : "—", d.gates.aboveVwap ? "#0d9465" : "#c8282a")}
                    {statRow("RSI (14)", Number.isFinite(row.rsi) ? row.rsi.toFixed(1) : "—")}
                    {statRow("52-week range", (row.lo52 != null && row.hi52 != null) ? `$${row.lo52.toFixed(2)} – $${row.hi52.toFixed(2)}` : "—")}
                    {statRow("% from 52w high", row.pctFromHigh != null ? `${row.pctFromHigh}%` : "—")}
                    {statRow("50-day MA", row.ma50 != null ? `$${Number(row.ma50).toFixed(2)}` : "—")}
                    {statRow("Volume vs 50d avg (RVOL)", row.volRatio != null ? `${row.volRatio.toFixed(2)}x` : "—", d.gates.volumeConfirmed ? "#0d9465" : C.textDim)}
                    {statRow("1-day / 1-week change", `${row.dayChangePct != null ? row.dayChangePct.toFixed(2) + "%" : "—"} / ${row.weekChangePct != null ? row.weekChangePct.toFixed(2) + "%" : "—"}`)}
                    <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 900, color: C.textDim, marginTop: 10, marginBottom: 2 }}>TECHNICAL: <span style={{ color: d.gates.trendBullish ? "#0d9465" : C.textDim }}>{d.gates.trendBullish ? "BULLISH" : (row.stage || "").includes("4") ? "BEARISH" : "NEUTRAL"}</span></div>
                  </div>
                );
              })()}

              {deepTab === "minervini" && (
                <div>
                  {Array.isArray(row.criteria) && row.criteria.length ? row.criteria.map(c => (
                    <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontFamily: SANS, fontSize: 12 }}>
                      <span style={{ color: c.pass ? "#0d9465" : "#c8282a", fontWeight: 700 }}>{c.pass ? "✓" : "✗"} {c.label}</span>
                      <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, whiteSpace: "nowrap" }}>{String(c.value)}</span>
                    </div>
                  )) : <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Criteria detail unavailable — {row.passCount ?? "?"}/8 pass overall.</div>}
                  <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: 10, lineHeight: 1.5 }}>Minervini determines stock quality; the Sniper engine above determines entry timing on top of it — never used as an automatic buy signal by itself.</div>
                </div>
              )}

              {deepTab === "fundamental" && (
                <div style={{ margin: "-6px" }}>
                  <FundamentalsPanel symbol={row.symbol} C={C} MONO={MONO} SANS={SANS} />
                </div>
              )}

              {deepTab === "market" && (() => {
                const statRow = (label, value, color) => (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontFamily: SANS, fontSize: 12 }}>
                    <span style={{ color: C.textDim }}>{label}</span><span style={{ fontWeight: 800, color: color || C.text }}>{value}</span>
                  </div>
                );
                return (
                  <div>
                    {regime ? statRow("Market regime", `${regime.label} (${regime.score}/100)`, regime.color) : statRow("Market regime", "—")}
                    {sectorInfo ? statRow("Sector rank", `#${sectorInfo.rank} of ${sectorInfo.of} S&P sectors today`) : statRow("Sector rank", "—")}
                    {row.smc && statRow("Smart Money structure", [row.smc.bos?.label, row.smc.choch?.label].filter(Boolean).join(" · ") || "No real SMC signal right now", row.smc.bos?.type === "BULL_BOS" ? "#0d9465" : row.smc.bos?.type === "BEAR_BOS" ? "#c8282a" : C.textDim)}
                    <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: 10, lineHeight: 1.5 }}>Market regime and sector rank are the same market-wide/sector-wide reads used across this app — not stock-specific, and not something this setup controls.</div>
                  </div>
                );
              })()}

              {deepTab === "options" && (
                <div style={{ margin: "-6px" }}>
                  <OptionsFlowPanel symbol={row.symbol} C={C} MONO={MONO} SANS={SANS} />
                </div>
              )}

              {deepTab === "risk" && (() => {
                const statRow = (label, value, color) => (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontFamily: SANS, fontSize: 12 }}>
                    <span style={{ color: C.textDim }}>{label}</span><span style={{ fontWeight: 800, color: color || C.text }}>{value}</span>
                  </div>
                );
                return (
                  <div>
                    {statRow("Risk level", row.riskState || "—", riskCol)}
                    {statRow("Risk to stop", row.riskPct != null ? `${row.riskPct}%` : "—")}
                    {statRow("VCP grade", row.vcpGrade && row.vcpGrade !== "-" ? row.vcpGrade : "—")}
                    {statRow("Base tightening", row.tightening ? "Yes — each pullback shallower than the last" : "No", row.tightening ? "#0d9465" : C.textDim)}
                    {statRow("Extended above pivot", d.gates.extended ? "Yes — chasing risk" : "No", d.gates.extended ? "#c8282a" : "#0d9465")}
                    {statRow("Real early get-out signs", d.gates.reversalTopRisk ? `Yes — ${d.reversal?.verdict}` : "No", d.gates.reversalTopRisk ? "#c8282a" : "#0d9465")}
                    <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: 10, lineHeight: 1.5 }}>Risk level and stop distance come from this app's real VCP risk report — not a prediction the trade fails, just how much downside exposure it carries.</div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Static explainer footer — matches the app's existing "explain the
            methodology" convention (e.g. Scanner's own How-to-read panel),
            not a computed value. */}
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${C.border}`, fontFamily: SANS, fontSize: 10.5, color: C.textDim, lineHeight: 1.5 }}>
          <b style={{ color: C.textSec }}>Do you need Minervini Trend?</b> Yes — it's the foundation. It keeps this screen aligned with the strongest stocks and the highest-probability setups. Minervini determines <b>stock quality</b>; this Sniper engine determines <b>entry timing</b> on top of it. Analysis only — no orders placed automatically.
        </div>
      </div>
    </div>
  );
}
