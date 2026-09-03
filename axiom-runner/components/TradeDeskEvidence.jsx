import React from "react";

function value(v, suffix = "") {
  return v == null || v === "" || Number.isNaN(Number(v)) ? "—" : `${v}${suffix}`;
}

export default function TradeDeskEvidence({ decision, chart, C, MONO, SANS }) {
  const breakdown = [
    ["Trend", decision?.trendScore],
    ["Momentum", decision?.momentumScore],
    ["Relative strength", decision?.relativeStrengthScore],
    ["Fundamentals", decision?.fundamentalScore],
  ];
  const entry = decision?.entry;
  const stop = decision?.stop;
  const targets = decision?.targets || [];
  const rr = decision?.riskReward;
  const invalidation = decision?.invalidation;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, padding: "10px 12px", background: C.bg, borderTop: `1px solid ${C.border}` }}>
      <Panel title="EVIDENCE" color={C.accent} C={C} MONO={MONO}>
        {breakdown.map(([label, score]) => <Row key={label} label={label} value={value(score, score != null ? "/100" : "")} C={C} MONO={MONO} />)}
        <Row label="Data health" value={decision?.dataHealth?.status || (decision?.dataHealth ? "available" : "—")} C={C} MONO={MONO} />
      </Panel>
      <Panel title="TRADE PLAN" color={C.green} C={C} MONO={MONO}>
        <Row label="Entry" value={value(entry && `$${Number(entry).toFixed(2)}`)} C={C} MONO={MONO} />
        <Row label="Stop" value={value(stop && `$${Number(stop).toFixed(2)}`)} C={C} MONO={MONO} danger={stop != null} />
        <Row label="Targets" value={targets.length ? targets.map((t) => `$${Number(t).toFixed(2)}`).join(" · ") : "—"} C={C} MONO={MONO} />
        <Row label="Risk / reward" value={value(rr, rr != null ? "R" : "")} C={C} MONO={MONO} />
        <Row label="Invalidation" value={value(invalidation && `$${Number(invalidation).toFixed(2)}`)} C={C} MONO={MONO} danger={invalidation != null} />
      </Panel>
      <Panel title="WHY / WHAT CHANGES IT" color={C.amber} C={C} MONO={MONO} SANS={SANS}>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, lineHeight: 1.4 }}>{decision?.reasons?.[0] || decision?.blockers?.[0] || "No explanation available."}</div>
        {decision?.changeMyMind?.[0] && <div style={{ marginTop: 6, fontFamily: SANS, fontSize: 11, color: C.amber }}><b>Changes if:</b> {decision.changeMyMind[0]}</div>}
      </Panel>
      <Panel title="CHART STATUS" color={C.text} C={C} MONO={MONO}>
        <Row label="Bars" value={chart?.bars?.length ?? chart?.data?.length ?? "—"} C={C} MONO={MONO} />
        <Row label="Timeframe" value={chart?.interval || "selected"} C={C} MONO={MONO} />
        <Row label="Source" value={chart ? "live chart data" : "loading"} C={C} MONO={MONO} />
      </Panel>
    </div>
  );
}

function Panel({ title, color, children, C, MONO }) {
  return (
    <section style={{ minWidth: 0, padding: "10px 12px", background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${color}`, borderRadius: 8 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: 0.8, color, marginBottom: 7 }}>{title}</div>
      {children}
    </section>
  );
}

function Row({ label, value: v, C, MONO, danger }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4, fontFamily: MONO, fontSize: 10.5 }}><span style={{ color: C.textDim }}>{label}</span><b style={{ color: danger ? C.red : C.text, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</b></div>;
}
