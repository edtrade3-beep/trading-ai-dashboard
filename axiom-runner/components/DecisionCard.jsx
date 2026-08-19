import { MarketPulseBar } from "./terminal-panels.jsx";

// Shared Decision Card — extracted 2026-08-19 from MarketTerminalTab.jsx's
// original inline implementation, per explicit user request: "this is
// setup I need in smart scan just like setup in workspace." Pure
// presentational component so both pages render the identical MARKET /
// verdict / A+ SCORE / ENTRY-STOP-TARGET / TREND-VOLUME-RISK layout and
// can never visually drift apart — each caller computes its own verdict
// taxonomy/colors (Workspace: GO/WAIT/AVOID off the trend-template verdict;
// Smart Scan: its own richer long/short verdict system) and passes the
// result in as props; this component has no opinion on what a "BUY" means,
// only how to render one.
export default function DecisionCard({
  C, MONO, SANS, NUM,
  symbol,
  verdictIcon, verdictLabel, verdictColor,
  aPlusScore,
  entry, stop, target,
  trendColor, volumeColor, riskColor,
  showMarketRow = true,
  extra,
  showFullAnalysis, onToggleFullAnalysis, fullAnalysisLabel,
}) {
  const statBox = (label, val, col) => (
    <div key={label} style={{ flex: "1 1 90px", textAlign: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: C.textDim, letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontFamily: NUM, fontSize: 18, fontWeight: 800, color: col || C.text }}>{val}</div>
    </div>
  );
  const statDot = (label, col) => (
    <div key={label} style={{ flex: "1 1 90px", textAlign: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: C.textDim, letterSpacing: 0.4, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16 }}>{col === C.textDim ? "⚪" : col === "#0d9465" ? "🟢" : col === "#d6a312" ? "🟡" : "🔴"}</div>
    </div>
  );
  return (
    <div style={{ marginBottom: 14, border: `2px solid ${verdictColor}55`, borderRadius: 14, padding: "14px 16px", background: `${verdictColor}0a` }}>
      {showMarketRow && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 6 }}>MARKET</div>
          <MarketPulseBar C={C} MONO={MONO} SANS={SANS} />
        </div>
      )}
      <div style={{ textAlign: "center", padding: "8px 0", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, marginBottom: 10 }}>
        <div style={{ fontFamily: SANS, fontSize: 24, fontWeight: 900, color: verdictColor }}>{verdictIcon} {verdictLabel}</div>
        <div style={{ fontFamily: MONO, fontSize: 13, color: C.textSec, marginTop: 4 }}>
          A+ SCORE: <b style={{ color: C.text }}>{aPlusScore != null ? aPlusScore : "—"}</b> · {symbol}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        {statBox("ENTRY", entry != null ? "$" + entry : "—", C.accent)}
        {statBox("STOP", stop != null ? "$" + stop : "—", "#c8282a")}
        {statBox("TARGET", target != null ? "$" + target : "—", "#0d9465")}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: extra ? 8 : 12, flexWrap: "wrap" }}>
        {statDot("TREND", trendColor)}
        {statDot("VOLUME", volumeColor)}
        {statDot("RISK", riskColor)}
      </div>
      {extra}
      <button onClick={onToggleFullAnalysis}
        style={{ width: "100%", marginTop: extra ? 4 : 0, fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 12px", borderRadius: 8, cursor: "pointer",
          border: `1px solid ${C.accent}`, background: showFullAnalysis ? `${C.accent}18` : "transparent", color: C.accent }}>
        {showFullAnalysis ? "▲ Hide Full Analysis" : `▼ Show Full Analysis (${fullAnalysisLabel})`}
      </button>
    </div>
  );
}
