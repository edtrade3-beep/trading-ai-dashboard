// MacroCommandCenter.jsx — Visual Intelligence redesign, Phase 1 "spine"
// (2026-09-09, user's own 37-section spec: "the user does NOT receive
// page after page of identical cards... every visualization must answer
// a specific question").
//
// Deliberately reuses ONLY already-real, already-computed data:
// useMacroRegime() (macro-engine.js's regime + narrative-engine.js's
// narrative + sector-rotation-engine.js's sectorRotation, all bundled by
// /api/market/macro-regime, already fetched elsewhere in this app) plus
// the `fred`/`macroData` MacroTab already has in scope. No new backend
// engine, no fabricated field — where the spec asks for something this
// app doesn't compute yet (per-sector earnings/valuation/flows, scenario
// PROBABILITIES rather than one classified narrative, best stock/options
// picks), this file either substitutes the closest real read (disclosed)
// or omits the field rather than inventing a number. Stock/options
// sections of the spec are an explicit later phase (per the phase-1 scope
// answer to the redesign question).

import { useMacroRegime } from "./MacroStatusStrip.jsx";

function bandColor(C, score, invert = false) {
  const s = invert ? 100 - score : score;
  if (s >= 70) return C.green;
  if (s >= 45) return C.amber;
  return C.red;
}

// One real 6-block Command Center. Each block only shows a state it can
// back with a real number — no decorative gauges (spec's own §26 rule:
// "Do not create decorative gauges. Each must feed the scenario model.").
function Block({ C, MONO, SANS, title, icon, label, color, sub }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${color}55`, borderTop: `3px solid ${color}`, borderRadius: 10, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em", marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        {icon && <span style={{ fontSize: 15 }}>{icon}</span>}
        <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color }}>{label}</span>
      </div>
      {sub && <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textSec, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function MacroCommandCenter({ C, MONO, SANS, macroData, fred, macroEventCalendar }) {
  const mr = useMacroRegime();
  if (!mr) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 14, fontFamily: MONO, fontSize: 11, color: C.textDim }}>
        Loading macro regime…
      </div>
    );
  }

  const f = mr.factors || {};
  const fedLabel = f.fedFundsTrend === "falling" ? "EASING" : f.fedFundsTrend === "rising" ? "HAWKISH RISK" : f.fedFundsTrend === "flat" ? "ON HOLD" : "—";
  const fedColor = f.fedFundsTrend === "falling" ? C.green : f.fedFundsTrend === "rising" ? C.red : f.fedFundsTrend === "flat" ? C.amber : C.textDim;

  const inflYoy = Number.isFinite(f.corePceYoy) ? f.corePceYoy : (Number.isFinite(f.cpiYoy) ? f.cpiYoy : null);
  const inflSource = Number.isFinite(f.corePceYoy) ? "Core PCE" : "CPI";
  const inflThreshold = Number.isFinite(f.corePceYoy) ? 3 : 3.5;
  const inflLabel = inflYoy == null ? "—" : inflYoy > inflThreshold ? "ELEVATED" : inflYoy > inflThreshold - 1 ? "MODERATE" : "COOLING";
  const inflColor = inflYoy == null ? C.textDim : inflYoy > inflThreshold ? C.red : inflYoy > inflThreshold - 1 ? C.amber : C.green;

  const empScore = mr.employment?.score;
  const growthLabel = empScore == null ? "—" : empScore >= 70 ? "RESILIENT" : empScore >= 45 ? "MIXED" : "SLOWING";
  const growthColor = empScore == null ? C.textDim : bandColor(C, empScore);

  const oilRow = (macroData || []).find((m) => m.symbol === "BNO" || m.symbol === "USO");
  const oilChg = Number(oilRow?.changesPercentage ?? 0);
  const oilLabel = !oilRow ? "—" : oilChg > 1 ? "SPIKING" : oilChg > 0 ? "RISING" : oilChg < -1 ? "FALLING" : "STEADY";
  const oilColor = !oilRow ? C.textDim : oilChg > 1 ? C.red : oilChg > 0 ? C.amber : oilChg < -1 ? C.green : C.textSec;

  const us10y = fred?.us10y;
  const y10Chg = Number(us10y?.changePct ?? 0);
  const y10Label = !us10y ? "—" : y10Chg > 0.02 ? "RISING" : y10Chg < -0.02 ? "FALLING" : "STEADY";
  const y10Color = !us10y ? C.textDim : y10Chg > 0.02 ? C.red : y10Chg < -0.02 ? C.green : C.textSec;

  const rotation = mr.sectorRotation || {};
  const preferred = (rotation.ranked || []).slice(0, 2).map((s) => s.name).filter(Boolean);
  const avoid = rotation.weakestSector?.name;
  const narrative = mr.narrative || {};
  const nextEvent = (macroEventCalendar || [])[0];

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.1em", marginBottom: 8 }}>
        {new Date().toLocaleString([], { month: "long" }).toUpperCase()} COMMAND CENTER
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 10 }}>
        <Block C={C} MONO={MONO} SANS={SANS} title="MARKET REGIME" icon={mr.icon} label={mr.label} color={mr.color} sub={`Score ${mr.score}/100`} />
        <Block C={C} MONO={MONO} SANS={SANS} title="FED" label={fedLabel} color={fedColor} sub={f.fedFundsTrend ? `Fed funds trend: ${f.fedFundsTrend}` : "No real trend read yet"} />
        <Block C={C} MONO={MONO} SANS={SANS} title="INFLATION" label={inflLabel} color={inflColor} sub={inflYoy != null ? `${inflSource} YoY ${inflYoy.toFixed(1)}%` : "No real YoY read yet"} />
        <Block C={C} MONO={MONO} SANS={SANS} title="GROWTH (LABOR PROXY)" label={growthLabel} color={growthColor} sub={empScore != null ? `Employment score ${empScore}/100` : "No real read yet"} />
        <Block C={C} MONO={MONO} SANS={SANS} title="OIL" label={oilLabel} color={oilColor} sub={oilRow ? `${oilRow.symbol} ${oilChg >= 0 ? "+" : ""}${oilChg.toFixed(2)}% today` : "No real quote yet"} />
        <Block C={C} MONO={MONO} SANS={SANS} title="10Y YIELD" label={y10Label} color={y10Color} sub={us10y ? `${Number(us10y.value).toFixed(2)}% (${y10Chg >= 0 ? "+" : ""}${y10Chg.toFixed(2)})` : "No real read yet"} />
      </div>

      {/* Master Verdict + One-Screen Final Verdict, combined (spec §1 +
          §37) — stock/options picks are an explicit later phase, disclosed
          below rather than faked. */}
      <div style={{ background: `${mr.color}0d`, border: `1px solid ${mr.color}55`, borderLeft: `4px solid ${mr.color}`, borderRadius: 10, padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16 }}>{narrative.icon || mr.icon}</span>
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: narrative.color || mr.color }}>
            {(narrative.label || mr.label || "").toUpperCase()}
          </span>
          {narrative.shifted && narrative.previousLabel && (
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>(shifted from {narrative.previousLabel})</span>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, fontFamily: SANS, fontSize: 12 }}>
          <div>
            <div style={{ color: C.textDim, fontFamily: MONO, fontSize: 10, marginBottom: 2 }}>PREFERRED</div>
            <div style={{ color: C.green, fontWeight: 700 }}>{preferred.length ? preferred.join(" / ") : "—"}</div>
          </div>
          <div>
            <div style={{ color: C.textDim, fontFamily: MONO, fontSize: 10, marginBottom: 2 }}>AVOID</div>
            <div style={{ color: C.red, fontWeight: 700 }}>{avoid || "—"}</div>
          </div>
          <div>
            <div style={{ color: C.textDim, fontFamily: MONO, fontSize: 10, marginBottom: 2 }}>ROTATION BIAS</div>
            <div style={{ color: C.text, fontWeight: 700 }}>{rotation.rotationBias || "—"}</div>
          </div>
          <div>
            <div style={{ color: C.textDim, fontFamily: MONO, fontSize: 10, marginBottom: 2 }}>NEXT EVENT</div>
            <div style={{ color: C.text, fontWeight: 700 }}>{nextEvent ? nextEvent.title : "—"}</div>
          </div>
        </div>
        <div style={{ marginTop: 8, fontFamily: SANS, fontSize: 10, color: C.textDim }}>
          Best stock / hidden gem / options picks land in a later phase of this redesign — not shown here rather than guessed.
        </div>
      </div>
    </div>
  );
}
