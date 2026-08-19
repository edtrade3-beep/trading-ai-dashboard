// FoundationCard — Technical Foundation & V-Recovery Engine's user-facing
// card (2026-08-19, explicit user spec: "TECHNICAL FOUNDATION & V-RECOVERY
// ENGINE"). Pure presentational, same convention as DecisionCard.jsx — the
// caller (MarketTerminalTab.jsx) fetches `/api/market/foundation` and
// passes the raw response in as `data`; this component does zero
// computation of its own. Never shows a bare score number (same house
// rule as AiScoreExplainer.jsx) — the Foundation Score is always
// clickable into the real breakdown via `onExplain`.
//
// Spec §13's hard rule: the primary verdict shown here is always one of
// the 5 named Foundation states, never "V-RECOVERY" itself — Recovery
// Type is its own labeled row, not the headline.

const STATE_META = {
  WEAK_FOUNDATION: { icon: "🔴", label: "WEAK FOUNDATION", color: "#c8282a" },
  V_RECOVERY_FOUNDATION_BUILDING: { icon: "🟡", label: "FOUNDATION BUILDING", color: "#d6a312" },
  FOUNDATION_STRENGTHENING: { icon: "🟡", label: "FOUNDATION STRENGTHENING", color: "#d6a312" },
  STRONG_FOUNDATION: { icon: "🟢", label: "STRONG FOUNDATION", color: "#0d9465" },
  STRONG_FOUNDATION_VALID_PIVOT: { icon: "🟢", label: "STRONG FOUNDATION + VALID PIVOT", color: "#0d9465" },
};
const ACTION_META = {
  AVOID_WAIT: { label: "AVOID / WAIT", color: "#c8282a" },
  WAIT: { label: "WAIT", color: "#d6a312" },
  WATCH: { label: "WATCH", color: "#d6a312" },
  BUY_CANDIDATE_WATCH_FOR_ENTRY: { label: "BUY CANDIDATE — WATCH FOR VALID ENTRY", color: "#0d9465" },
  BUY_CANDIDATE: { label: "BUY CANDIDATE", color: "#0d9465" },
};
// Component-row label colors — same 🟢/🟡/🔴 dot convention DecisionCard's
// trend/volume/risk dots already use.
function dotColor(label) {
  const GREEN = ["STRONG", "SUFFICIENT", "PROGRESSIVE_TIGHTENING", "LOW", "YES"];
  const AMBER = ["DEVELOPING", "MODERATE", "STRENGTHENING", "NEUTRAL", "MIXED"];
  const RED = ["WEAK", "INSUFFICIENT", "VOLATILITY_EXPANSION", "HIGH", "EXTREME", "NOT_READY", "NO"];
  if (GREEN.includes(label)) return "#0d9465";
  if (AMBER.includes(label)) return "#d6a312";
  if (RED.includes(label)) return "#c8282a";
  return null; // honest-dim for null/unavailable
}

export default function FoundationCard({ C, MONO, SANS, NUM, symbol, data, onExplain }) {
  if (!data) return null;

  const row = (label, val, valColor) => (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: valColor || C.text }}>{val}</span>
    </div>
  );

  // Spec's own literal requirement — reserved for genuinely insufficient
  // real bars, not for every minor missing comparison (those degrade
  // gracefully elsewhere with honest mid-point credit instead).
  if (data.dataInsufficient) {
    return (
      <div style={{ marginBottom: 14, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", background: C.card }}>
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 6 }}>TECHNICAL FOUNDATION</div>
        <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: C.textDim }}>DATA INSUFFICIENT</div>
        <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginTop: 4 }}>{data.reason}</div>
      </div>
    );
  }

  if (data.recoveryType === "NONE") {
    return (
      <div style={{ marginBottom: 14, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", background: C.card }}>
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 6 }}>TECHNICAL FOUNDATION</div>
        <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: C.textSec }}>No V-Recovery pattern detected</div>
        <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginTop: 4 }}>{data.reason} This engine only produces a Foundation verdict for stocks recovering from a real, meaningful prior decline.</div>
      </div>
    );
  }

  const verdict = data.verdict || {};
  const stateMeta = STATE_META[verdict.state] || { icon: "⚪", label: verdict.state || "—", color: C.textDim };
  const actionMeta = ACTION_META[verdict.action] || { label: verdict.action || "—", color: C.textDim };

  return (
    <div style={{ marginBottom: 14, border: `2px solid ${stateMeta.color}55`, borderRadius: 14, padding: "14px 16px", background: `${stateMeta.color}0a` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>RECOVERY TYPE</span>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.text }}>
          V-RECOVERY {data.majorStructuralRisk && <span title="45%+ decline — major structural-risk warning, not automatically bearish, but demands real evidence of repair" style={{ color: "#d6a312" }}>⚠️</span>}
        </span>
      </div>

      <button onClick={onExplain} title="Click to see the full real breakdown"
        style={{ display: "block", width: "100%", textAlign: "left", font: "inherit", background: "transparent", border: "none", cursor: "pointer", padding: 0, marginBottom: 10 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>FOUNDATION SCORE — click for breakdown</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontFamily: NUM, fontSize: 28, fontWeight: 900, color: stateMeta.color }}>{data.foundationScore}</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>/ 100 ▸ why?</span>
        </div>
      </button>

      <div style={{ textAlign: "center", padding: "8px 0", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, marginBottom: 10 }}>
        <div style={{ fontFamily: SANS, fontSize: 18, fontWeight: 900, color: stateMeta.color }}>{stateMeta.icon} {stateMeta.label}</div>
      </div>

      {row("SUPPORT", data.support.label || "—", dotColor(data.support.label))}
      {row("TIGHTNESS", data.tightness.label || "—", dotColor(data.tightness.label))}
      {row("OVERHEAD SUPPLY", data.supply.label || "—", dotColor(data.supply.label))}
      {row("SUPPLY ABSORPTION", data.absorption.label || "—", dotColor(data.absorption.label))}
      {row("HIGHER LOWS", data.higherLows.isAscending == null ? "—" : (data.higherLows.isAscending ? "YES" : "NO"), dotColor(data.higherLows.isAscending == null ? null : (data.higherLows.isAscending ? "YES" : "NO")))}
      {row("PIVOT", data.pivot && data.pivot.valid ? "VALID" : "NOT READY", data.pivot && data.pivot.valid ? "#0d9465" : "#d6a312")}
      {row("RS RATING", data.rsRating != null ? String(data.rsRating) : "—", data.rsRating != null ? (data.rsRating >= 70 ? "#0d9465" : C.text) : null)}

      <div style={{ marginTop: 10, textAlign: "center" }}>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "5px 12px", borderRadius: 6, background: `${actionMeta.color}18`, color: actionMeta.color }}>
          {actionMeta.label}
        </span>
      </div>

      {verdict.waitFor && verdict.waitFor.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 4 }}>WAIT FOR</div>
          {verdict.waitFor.map((w, i) => (
            <div key={i} style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec }}>→ {w}</div>
          ))}
        </div>
      )}
    </div>
  );
}
