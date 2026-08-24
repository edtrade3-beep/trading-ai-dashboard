// VcpStatusPanel — the real VCP status panel (2026-08-24, VCP Visual
// Analysis Layer, explicit user request): VCP SCORE / CONTRACTIONS /
// VOLATILITY CONTRACTION / VOLUME DRY-UP / PIVOT / RELATIVE STRENGTH /
// BREAKOUT STATUS, all sourced from data already fetched by
// MarketTerminalTab's own /api/market/trend-template call — zero new
// fetch, zero new computation. `data` is that same chart/setup object
// TrendChart.jsx renders.
//
// VCP is evidence, never a second verdict — this panel intentionally
// carries no BUY/SELL/entry-recommendation language, only a real status
// label (a pure presentation-layer mapping of vcpBreakoutEngine's own
// already-real state machine, not a new computation).
const STATUS_META = {
  NO_VCP:      { label: "NO VCP",         color: "#6b7280", icon: "⚪" },
  DEVELOPING:  { label: "VCP DEVELOPING", color: "#d6a312", icon: "🟡" },
  READY:       { label: "VCP READY",      color: "#2563eb", icon: "🔵" },
  BREAKOUT:    { label: "VCP BREAKOUT",   color: "#0d9465", icon: "🟢" },
  FAILED:      { label: "VCP FAILED",     color: "#c8282a", icon: "🔴" },
};
function statusKeyFor(vcp, breakout) {
  if (!vcp || !vcp.count) return "NO_VCP";
  const state = breakout?.state;
  if (state === "FAILED") return "FAILED";
  if (state === "BREAKOUT_ACTIVE" || state === "CONFIRMED") return "BREAKOUT";
  if (state === "SETUP_READY") return "READY";
  return "DEVELOPING"; // WATCH, or any other real state — still forming
}

function Row({ MONO, SANS, C, label, value, sub }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim }}>{label}</span>
      <span style={{ textAlign: "right" }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>{value}</span>
        {sub && <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: 2 }}>{sub}</div>}
      </span>
    </div>
  );
}

export default function VcpStatusPanel({ data, C, MONO, SANS }) {
  const setup = data?.setup;
  const vcp = setup?.vcp;
  const breakout = setup?.breakout;
  const report = setup?.report;

  const statusKey = statusKeyFor(vcp, breakout);
  const meta = STATUS_META[statusKey];

  const depths = Array.isArray(vcp?.contractions) ? vcp.contractions.map((c) => `-${c.depth}%`) : [];
  const rs = Number.isFinite(data?.rsRating) ? data.rsRating : null;

  return (
    <div style={{ background: C.card, border: `1px solid ${meta.color}55`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: C.textDim, letterSpacing: "0.06em" }}>VCP STATUS</div>
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: meta.color }}>{meta.icon} {meta.label}</div>
      </div>

      <Row MONO={MONO} SANS={SANS} C={C} label="VCP SCORE"
        value={report ? `${report.score}/100` : "—"}
        sub={report?.verdict ? `Verdict: ${report.verdict}` : null} />

      <Row MONO={MONO} SANS={SANS} C={C} label="CONTRACTIONS"
        value={vcp?.count ? `${vcp.count} (${vcp.footprint || ""})` : "0"}
        sub={depths.length ? depths.join(" → ") : null} />

      <Row MONO={MONO} SANS={SANS} C={C} label="VOLATILITY CONTRACTION"
        value={vcp?.tightening ? "✓ Tightening" : "✗ Not tightening"}
        sub={Number.isFinite(vcp?.tighterSteps) ? `${vcp.tighterSteps} progressively tighter step(s)` : null} />

      <Row MONO={MONO} SANS={SANS} C={C} label="VOLUME DRY-UP"
        value={Number.isFinite(breakout?.volume?.dryUpScore) ? `${breakout.volume.dryUpScore}/100` : "—"}
        sub={Number.isFinite(vcp?.volTrend) ? `${vcp.volTrend < 1 ? "−" : "+"}${Math.abs(Math.round((1 - vcp.volTrend) * 100))}% into the base` : null} />

      <Row MONO={MONO} SANS={SANS} C={C} label="PIVOT"
        value={breakout?.pivot?.price ? `$${breakout.pivot.price.toFixed(2)}` : "—"}
        sub={Number.isFinite(breakout?.pivot?.distancePct) ? `${breakout.pivot.distancePct > 0 ? breakout.pivot.distancePct.toFixed(1) + "% below pivot" : Math.abs(breakout.pivot.distancePct).toFixed(1) + "% above pivot"}` : null} />

      <Row MONO={MONO} SANS={SANS} C={C} label="RELATIVE STRENGTH"
        value={rs != null ? `RS ${rs}` : "—"}
        sub={data?.rsApprox ? "vs. SPY (approx.)" : (rs != null ? "real percentile rank" : null)} />

      <Row MONO={MONO} SANS={SANS} C={C} label="BREAKOUT STATUS"
        value={breakout?.volume?.breakoutRatio ? `${breakout.volume.breakoutRatio.toFixed(1)}x avg volume` : "—"}
        sub={breakout?.volume?.grade ? `Volume grade: ${breakout.volume.grade}` : null} />

      <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${C.border}`, lineHeight: 1.4 }}>
        Real technical evidence — feeds the Master Engine's own score, not a second verdict. The app's one real trade decision stays whatever Cortex/Discover show for this symbol.
      </div>
    </div>
  );
}
