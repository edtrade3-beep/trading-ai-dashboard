import { useState } from "react";
import { computeSniperDecision } from "./sniper-decision.js";

// AI Sniper Decision Screen — Phase 1 of the redesign (explicit user spec,
// 2026-08-10: "redesign my AI Sniper Scanner into a true 10-second trading
// decision workspace... the primary problem is information overload and
// contradictory signals"). Phase 1 scope: the decision engine
// (sniper-decision.js) + this Level 1/2 hero screen. Deep Analysis below is
// a real, already-computed summary (Stock Quality/Trade Setup/Trend/RS/SMC
// — the same fields RhProScanner's row-expansion already shows), not yet
// the full 6-tab Technical/Minervini/Fundamental/Market/Options/Risk panel
// from the spec — that's Phase 2, deliberately deferred rather than padded
// with placeholder content.
//
// `row` is one of RhProScanner's already-fully-computed displayRows (score,
// aplus, institutionalGrade, quality, prediction, smc, riskState, etc. all
// already attached) — this component adds zero new fetches, only the new
// computeSniperDecision() combinator on top of data that already exists.
export default function SniperDecisionModal({ C, MONO, SANS, row, onClose, onOpenPlan }) {
  const [showDeep, setShowDeep] = useState(false);
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

        {/* Deep Analysis — collapsed by default, real already-computed
            summary (Phase 2 will expand this into the spec's full 6-tab
            panel). */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
          <button onClick={() => setShowDeep(v => !v)}
            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", font: "inherit", fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textSec, background: "transparent", border: "none", cursor: "pointer", padding: "4px 0" }}>
            <span>DEEP ANALYSIS</span><span>{showDeep ? "▴" : "▾"}</span>
          </button>
          {showDeep && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginTop: 8, fontFamily: SANS, fontSize: 11.5 }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 2 }}>STOCK QUALITY</div>
                <div style={{ color: C.text, fontWeight: 800 }}>{row.score ?? row.quality?.score ?? "—"}/100</div>
              </div>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 2 }}>RS RATING</div>
                <div style={{ color: (row.rsRating || 0) >= 70 ? C.green : C.text, fontWeight: 800 }}>{row.rsRating ?? "—"}</div>
              </div>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 2 }}>VWAP (20D)</div>
                <div style={{ color: C.text, fontWeight: 800 }}>{d.vwap20 != null ? `$${d.vwap20.toFixed(2)}` : "—"}</div>
              </div>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 2 }}>STAGE</div>
                <div style={{ color: C.text, fontWeight: 800 }}>{row.stage || "—"}</div>
              </div>
              {row.smc && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 2 }}>SMART MONEY</div>
                  <div style={{ color: C.textSec }}>{[row.smc.bos?.label, row.smc.choch?.label].filter(Boolean).join(" · ") || "No real SMC signal right now"}</div>
                </div>
              )}
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
