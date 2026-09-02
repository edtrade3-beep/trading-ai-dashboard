import React from "react";

// Real status colors, not hardcoded hex — was a fixed dark-theme-only map
// (STRONG_BUY: "#2ec27e", etc.) that never matched a light theme once
// Trade Desk started following the app's real toggle (2026-09-02). Reuses
// theme.js's own 4-color status system (green/amber/red/textDim) already
// on the passed-in `C`, plus `accent` for HOLD (same role TD's old
// hardcoded palette gave it — a routine/neutral "keep as-is" read, not a
// bull/bear signal).
function verdictColor(verdict, C) {
  if (verdict === "STRONG_BUY" || verdict === "BUY") return C.green;
  if (verdict === "WATCH" || verdict === "REDUCE") return C.amber;
  if (verdict === "EXIT" || verdict === "AVOID") return C.red;
  if (verdict === "HOLD") return C.accent;
  return C.textDim; // WAIT and any unrecognized verdict
}

export default function CanonicalVerdictStrip({ decision, loading, error, C, MONO, SANS }) {
  const verdict = decision?.verdict || "—";
  const color = verdictColor(verdict, C);
  const regime = decision?.marketRegime?.regime || "—";
  const stage = decision?.opportunityStage || "—";
  const confidence = Number.isFinite(decision?.confidence) ? `${decision.confidence}%` : "—";
  const score = Number.isFinite(decision?.opportunityScore) ? decision.opportunityScore : "—";
  const health = decision?.dataHealth;
  const stale = health?.stale || health?.canTrade === false;
  return (
    <section aria-label="Canonical master verdict" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "10px 14px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ minWidth: 150 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, color: C.textDim }}>MASTER VERDICT</div>
        <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color, lineHeight: 1.1 }}>{loading ? "LOADING…" : verdict}</div>
      </div>
      <Metric label="OPPORTUNITY" value={score} C={C} MONO={MONO} />
      <Metric label="CONFIDENCE" value={confidence} C={C} MONO={MONO} />
      <Metric label="STAGE" value={stage} C={C} MONO={MONO} />
      <Metric label="REGIME" value={regime.replace(/_/g, " ")} C={C} MONO={MONO} />
      <div style={{ flex: 1, minWidth: 180, fontFamily: SANS, fontSize: 11, color: stale ? C.amber : C.textSec }}>
        {error ? `Decision unavailable: ${error}` : stale ? `STALE / BLOCKED DATA: ${decision?.blockers?.[0] || "new exposure is blocked until required data is fresh"}` : decision?.reasons?.[0] || (loading ? "Fetching canonical decision…" : "No decision explanation available.")}
      </div>
    </section>
  );
}

function Metric({ label, value, C, MONO }) {
  return <div style={{ minWidth: 78 }}><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: 0.6 }}>{label}</div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>{value}</div></div>;
}
