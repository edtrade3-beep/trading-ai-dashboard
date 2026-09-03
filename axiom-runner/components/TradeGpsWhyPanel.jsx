import React, { useState } from "react";

// Trade GPS (2026-09-03) — the collapsed "Why" detail behind TradeGpsCard's
// 3-second read: the real 7-bucket score breakdown, the real structure
// pick's own reasoning + rejected alternatives, and the real Trap Shield
// read. Pure presentational — every value here is already computed by the
// canonical pipeline, never derived in this component.

function value(v, suffix = "") {
  return v == null || v === "" || Number.isNaN(Number(v)) ? "—" : `${v}${suffix}`;
}

const BUCKET_LABELS = {
  regimeAlignment: "Regime alignment", trendConfirmation: "Trend confirmation", catalystQuality: "Catalyst quality",
  relativeStrength: "Relative strength", volumeConfirmation: "Volume confirmation",
  riskRewardQuality: "R:R quality", optionsLiquidity: "Options liquidity",
};

export default function TradeGpsWhyPanel({ tradeGps, tradeStructure, trapShield, C, MONO, SANS }) {
  const [open, setOpen] = useState(false);
  const breakdown = tradeGps?.breakdown || {};
  const rejected = tradeStructure?.rejectedAlternatives || [];
  const contract = tradeStructure?.contract;

  return (
    <div style={{ borderTop: `1px solid ${C.border}`, background: C.bg }}>
      <button onClick={() => setOpen((v) => !v)} style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: "transparent", border: "none", cursor: "pointer", fontFamily: MONO, fontSize: 10, letterSpacing: 0.8, color: C.textDim }}>
        {open ? "▾" : "▸"} TRADE GPS — WHY {tradeGps?.band ? `(${tradeGps.band})` : ""}
      </button>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, padding: "0 12px 12px" }}>
          <Panel title="SCORE BREAKDOWN" C={C} MONO={MONO}>
            {Object.entries(BUCKET_LABELS).map(([key, label]) => (
              <Row key={key} label={label} value={value(breakdown[key], breakdown[key] != null ? "/100" : "")} C={C} MONO={MONO} />
            ))}
          </Panel>

          <Panel title="STRUCTURE PICK" C={C} MONO={MONO}>
            <Row label="Structure" value={value(tradeStructure?.structure)} C={C} MONO={MONO} />
            {contract && (
              <>
                <Row label="Strike / Expiry" value={`${value(contract.strike)} / ${value(contract.expiry)}`} C={C} MONO={MONO} />
                <Row label="Theta" value={value(tradeStructure?.theta)} C={C} MONO={MONO} danger={Number.isFinite(tradeStructure?.theta) && tradeStructure.theta < 0} />
                <Row label="Break-even" value={value(tradeStructure?.breakEven && `$${Number(tradeStructure.breakEven).toFixed(2)}`)} C={C} MONO={MONO} />
                <Row label="Expected move" value={value(tradeStructure?.expectedMove && `±$${Number(tradeStructure.expectedMove).toFixed(2)}`)} C={C} MONO={MONO} />
              </>
            )}
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, marginTop: 6, lineHeight: 1.4 }}>{tradeStructure?.reason || "No real structure reasoning available."}</div>
          </Panel>

          <Panel title="TRAP SHIELD" C={C} MONO={MONO}>
            <Row label="Status" value={trapShield?.blocked ? "BLOCKED" : (trapShield?.warningLevel || "—")} danger={!!trapShield?.blocked} C={C} MONO={MONO} />
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, marginTop: 6, lineHeight: 1.4 }}>{trapShield?.message || "No real trap conditions detected."}</div>
          </Panel>

          <Panel title="REJECTED ALTERNATIVES" C={C} MONO={MONO}>
            {rejected.length ? rejected.map((r, i) => (
              <div key={i} style={{ fontFamily: SANS, fontSize: 10.5, color: C.textSec, marginTop: i ? 4 : 0 }}>
                <b style={{ color: C.textDim }}>{r.structure}{r.strike != null ? ` $${r.strike}` : ""}:</b> {r.reason}
              </div>
            )) : <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>No real alternatives were rejected.</div>}
          </Panel>
        </div>
      )}
    </div>
  );
}

function Panel({ title, children, C, MONO }) {
  return <section style={{ minWidth: 0, padding: "10px 12px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8 }}><div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 0.8, color: C.textDim, marginBottom: 7 }}>{title}</div>{children}</section>;
}

function Row({ label, value: v, C, MONO, danger }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4, fontFamily: MONO, fontSize: 10.5 }}><span style={{ color: C.textDim }}>{label}</span><b style={{ color: danger ? C.red : C.text, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</b></div>;
}
