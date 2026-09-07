import React, { useState } from "react";

function value(v, suffix = "") {
  return v == null || v === "" || Number.isNaN(Number(v)) ? "—" : `${v}${suffix}`;
}

export default function TradeDeskEvidence({ decision, chart, C, MONO, SANS }) {
  // Collapsible (2026-09-04, explicit user request: "i need this to be
  // dragged/hide") — persisted per-browser, same localStorage-toggle
  // convention this codebase already uses elsewhere (e.g. MarketTerminalTab's
  // Trend & Base Rating visibility toggle). Header stays visible either way
  // so the row is never permanently lost, just collapsed to one line.
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem("tradedesk_evidence_open") !== "off"; } catch { return true; }
  });
  const toggle = () => setOpen((v) => {
    const nv = !v;
    try { localStorage.setItem("tradedesk_evidence_open", nv ? "on" : "off"); } catch {}
    return nv;
  });
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
    <div style={{ background: C.bg, borderTop: `1px solid ${C.border}` }}>
      <button onClick={toggle} title={open ? "Hide evidence/trade plan" : "Show evidence/trade plan"}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, color: C.textDim }}>EVIDENCE · TRADE PLAN · WHY · COMMITTEE · CHART STATUS</span>
      </button>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, padding: "0 12px 10px" }}>
          <Panel title="EVIDENCE" color={C.accent} C={C} MONO={MONO}>
            {/* Deep Analysis (2026-09-07, platform-unification prompt's
                "Evidence Requirement — fact vs inference vs opinion"):
                confidence and the composite scores below are real numbers
                this pipeline already computes (asset-decision.js) but
                never actually surfaced anywhere in the UI before — this
                was a rendering gap, not new computation. Tagged INFERENCE
                (a derived composite/classification) vs FACT (Trade Plan
                panel's raw entry/stop/target prices) so a reader can tell
                which numbers are directly observed vs judgment calls. */}
            <Row label="Confidence" value={value(decision?.confidence, decision?.confidence != null ? "/100" : "")} C={C} MONO={MONO} tier="INFERENCE" />
            {breakdown.map(([label, score]) => <Row key={label} label={label} value={value(score, score != null ? "/100" : "")} C={C} MONO={MONO} tier="INFERENCE" />)}
            <Row label="Data health" value={decision?.dataHealth?.status || (decision?.dataHealth ? "available" : "—")} C={C} MONO={MONO} tier="FACT" />
          </Panel>
          <Panel title="TRADE PLAN" color={C.green} C={C} MONO={MONO}>
            <Row label="Entry" value={value(entry && `$${Number(entry).toFixed(2)}`)} C={C} MONO={MONO} tier="FACT" />
            <Row label="Stop" value={value(stop && `$${Number(stop).toFixed(2)}`)} C={C} MONO={MONO} danger={stop != null} tier="FACT" />
            <Row label="Targets" value={targets.length ? targets.map((t) => `$${Number(t).toFixed(2)}`).join(" · ") : "—"} C={C} MONO={MONO} tier="FACT" />
            <Row label="Risk / reward" value={value(rr, rr != null ? "R" : "")} C={C} MONO={MONO} tier="INFERENCE" />
            <Row label="Invalidation" value={value(invalidation && `$${Number(invalidation).toFixed(2)}`)} C={C} MONO={MONO} danger={invalidation != null} tier="FACT" />
          </Panel>
          {/* Real bug fix (2026-09-06, platform-consolidation Part 4/6 —
              "WHY THIS TRADE" and "WHY NOT THIS TRADE" as two distinct
              lists shown together). This panel used to show only
              decision.reasons[0] OR decision.blockers[0] — whichever
              existed, picking blockers only as a fallback when reasons was
              empty — so a real trade with BOTH supporting evidence and a
              real risk-override blocker only ever showed one or the other,
              never both. Both are already real, already-deduped arrays on
              every AssetDecision (asset-decision.js); this was a rendering
              gap, not a missing data source. */}
          <Panel title="WHY / WHY NOT" color={C.amber} C={C} MONO={MONO} SANS={SANS}>
            {decision?.reasons?.length ? (
              <div style={{ marginBottom: decision?.blockers?.length ? 8 : 0 }}>
                <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.green, marginBottom: 3 }}>WHY</div>
                {decision.reasons.slice(0, 3).map((r, i) => (
                  <div key={i} style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, lineHeight: 1.4 }}>✓ {r}</div>
                ))}
              </div>
            ) : null}
            {decision?.blockers?.length ? (
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.red, marginBottom: 3 }}>WHY NOT</div>
                {decision.blockers.slice(0, 3).map((b, i) => (
                  <div key={i} style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, lineHeight: 1.4 }}>⚠ {b}</div>
                ))}
              </div>
            ) : null}
            {!decision?.reasons?.length && !decision?.blockers?.length && (
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, fontStyle: "italic" }}>No explanation available.</div>
            )}
            {/* Deep Analysis — the real, concrete "confidence drops when
                sources conflict" moment: riskOverride is only ever set
                when applyRiskPolicy (asset-decision.js) actually downgraded
                the verdict because a real signal (regime/data-health/event
                risk/committee) disagreed with it. Shown explicitly rather
                than left implicit in the blockers list above. */}
            {decision?.riskOverride && (
              <div style={{ marginTop: 6, padding: "6px 8px", background: `${C.red}12`, border: `1px solid ${C.red}44`, borderRadius: 6 }}>
                <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.red }}>VERDICT DOWNGRADED — SOURCES CONFLICTED</div>
                <div style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, marginTop: 2 }}>{decision.riskOverride.from} → {decision.riskOverride.to}</div>
              </div>
            )}
            {decision?.changeMyMind?.[0] && <div style={{ marginTop: 6, fontFamily: SANS, fontSize: 11, color: C.amber }}><b>Changes if:</b> {decision.changeMyMind[0]}</div>}
          </Panel>
          {/* Deep Analysis (2026-09-07) — investment-committee.js already
              computes this per-reviewer disagreement breakdown on every
              real AssetDecision (investmentCommittee.reviewers), it just
              never reached the UI before now: a rendering gap, not new
              computation. This is the concrete "Single Final Verdict"
              multi-signal evidence trail the platform-unification prompt
              asks for — real reviewers checking real regime/data/event/
              red-flag signals independently, surfaced together. */}
          {decision?.investmentCommittee && (
            <Panel title="COMMITTEE" color={decision.investmentCommittee.disagreement ? C.red : C.accent} C={C} MONO={MONO} SANS={SANS}>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 6 }}>
                {decision.investmentCommittee.evaluatedCount}/{decision.investmentCommittee.totalReviewers} reviewers evaluated
                {decision.investmentCommittee.disagreement ? <span style={{ color: C.red, fontWeight: 800 }}> · DISAGREEMENT</span> : null}
              </div>
              {Object.entries(decision.investmentCommittee.reviewers).map(([key, r]) => (
                <div key={key} style={{ marginBottom: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 6, fontFamily: MONO, fontSize: 10 }}>
                    <span style={{ color: C.textDim }}>{key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</span>
                    <b style={{ color: r.verdict === "SUPPORTIVE" ? C.green : r.verdict === "CONCERN" ? C.red : r.verdict === "NEUTRAL" ? C.amber : C.textDim }}>{r.verdict}</b>
                  </div>
                  {r.verdict !== "NOT_EVALUATED" && <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, lineHeight: 1.3 }}>{r.reason}</div>}
                </div>
              ))}
            </Panel>
          )}
          <Panel title="CHART STATUS" color={C.text} C={C} MONO={MONO}>
            <Row label="Bars" value={chart?.bars?.length ?? chart?.data?.length ?? "—"} C={C} MONO={MONO} />
            <Row label="Timeframe" value={chart?.interval || "selected"} C={C} MONO={MONO} />
            <Row label="Source" value={chart ? "live chart data" : "loading"} C={C} MONO={MONO} />
          </Panel>
        </div>
      )}
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

// tier ("FACT" | "INFERENCE") — Evidence Requirement (platform-unification
// prompt): a directly-observed real value (a price level) vs a derived
// composite/classification (a 0-100 score, a confidence read). Purely a
// display tag on data that was already real either way — never changes
// what's shown, just how a reader should weigh it.
function Row({ label, value: v, C, MONO, danger, tier }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4, fontFamily: MONO, fontSize: 10.5 }}>
      <span style={{ color: C.textDim }}>
        {label}
        {tier && v !== "—" && <span style={{ fontSize: 8, color: C.textDim, opacity: 0.6, marginLeft: 4 }}>{tier === "FACT" ? "fact" : "inf."}</span>}
      </span>
      <b style={{ color: danger ? C.red : C.text, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</b>
    </div>
  );
}
