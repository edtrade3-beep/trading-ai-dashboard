import { useState, useEffect } from "react";

// SeasonalCycleChart.jsx — real S&P 500 seasonal/presidential/decennial
// cycle composite (explicit user request, 2026-08-12, after seeing Ned
// Davis Research's proprietary "Cycle Composite" chart via a Mark
// Minervini post: "How to have chart like this"). This is NOT NDR's
// chart or dataset — it's an independently computed version of the same
// well-known public technique (equal-weighted 1-year seasonal + 4-year
// presidential + 10-year decennial cycles), built from real S&P 500
// daily closes back to 1970 (src/routes/seasonal-cycle.js). Every number
// on this chart is a real historical average or the real current year's
// actual return — nothing here is a forecast presented as certain, and
// the meta line discloses exactly how much real data backs each line.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function SeasonalCycleChart({ C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/market/cycle-composite")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setData(j); else setError(j.error || "Unavailable"); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, padding: 20 }}>Computing real seasonal cycle from 50+ years of S&P 500 history…</div>;
  if (error || !data) return <div style={{ fontFamily: SANS, fontSize: 12, color: "#c8282a", padding: 20 }}>DATA UNAVAILABLE — {error}</div>;

  const { composite, actual, monthTicks, currentYear, cyclePositionLabel, decennialDigit, seasonalYearsCount, presidentialYearsCount, decennialYearsCount, dataFrom, dataTo } = data;

  const W = 760, H = 320, padL = 46, padR = 16, padT = 16, padB = 30;
  const maxLen = composite.length;
  const allVals = [...composite, ...actual].filter((v) => v != null);
  const maxV = Math.max(...allVals, 0) * 1.08;
  const minV = Math.min(...allVals, 0) * 1.08;
  const span = (maxV - minV) || 1;

  const xf = (i) => padL + (i / (maxLen - 1)) * (W - padL - padR);
  const yf = (v) => padT + ((maxV - v) / span) * (H - padT - padB);

  const compositePts = composite.map((v, i) => (v == null ? null : `${xf(i).toFixed(1)},${yf(v).toFixed(1)}`)).filter(Boolean).join(" ");
  const actualIdx = actual.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
  const actualPts = actualIdx.map((i) => `${xf(i).toFixed(1)},${yf(actual[i]).toFixed(1)}`).join(" ");
  const lastActualIdx = actualIdx.length ? actualIdx[actualIdx.length - 1] : null;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text }}>📅 S&P 500 CYCLE COMPOSITE — {currentYear}</div>
        <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>{cyclePositionLabel} · years ending in {decennialDigit}</div>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginBottom: 10, lineHeight: 1.4 }}>
        Equal-weighted average of the real 1-year seasonal ({seasonalYearsCount} yrs), 4-year presidential ({presidentialYearsCount} yrs), and 10-year decennial ({decennialYearsCount} yrs) cycles — computed from real S&P 500 daily closes, {dataFrom} to {dataTo}. Same public methodology Ned Davis Research's Cycle Composite uses; independently computed here, not their proprietary dataset.
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {/* Zero line */}
        <line x1={padL} x2={W - padR} y1={yf(0)} y2={yf(0)} stroke={C.border} strokeWidth="1" />
        <text x={padL - 6} y={yf(0) + 3} textAnchor="end" fontSize="9" fontFamily={MONO} fill={C.textDim}>0%</text>
        <text x={padL - 6} y={yf(maxV * 0.92) + 3} textAnchor="end" fontSize="9" fontFamily={MONO} fill={C.textDim}>{maxV.toFixed(0)}%</text>
        <text x={padL - 6} y={yf(minV * 0.92) + 3} textAnchor="end" fontSize="9" fontFamily={MONO} fill={C.textDim}>{minV.toFixed(0)}%</text>

        {/* Month gridlines */}
        {monthTicks.map((t, i) => t == null ? null : (
          <g key={i}>
            <line x1={xf(t)} x2={xf(t)} y1={padT} y2={H - padB} stroke={C.border} strokeWidth="0.5" opacity="0.5" />
            <text x={xf(t)} y={H - padB + 12} textAnchor="middle" fontSize="9" fontFamily={MONO} fill={C.textDim}>{MONTHS[i]}</text>
          </g>
        ))}

        {/* Composite (real historical average) */}
        <polyline points={compositePts} fill="none" stroke="#4a7bd6" strokeWidth="2" vectorEffect="non-scaling-stroke" />

        {/* Actual current year (real, through today) */}
        {actualPts && <polyline points={actualPts} fill="none" stroke="#e08a1e" strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
        {lastActualIdx != null && (
          <circle cx={xf(lastActualIdx)} cy={yf(actual[lastActualIdx])} r="3.5" fill="#e08a1e" />
        )}
      </svg>

      <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 16, height: 2, background: "#4a7bd6", display: "inline-block" }} />
          <span style={{ fontFamily: SANS, fontSize: 10.5, color: C.textSec }}>Cycle Composite (real historical average)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 16, height: 2, background: "#e08a1e", display: "inline-block", borderTop: "2px dashed #e08a1e" }} />
          <span style={{ fontFamily: SANS, fontSize: 10.5, color: C.textSec }}>{currentYear} Actual (real, through today{lastActualIdx != null ? `: ${actual[lastActualIdx] >= 0 ? "+" : ""}${actual[lastActualIdx].toFixed(1)}%` : ""})</span>
        </div>
      </div>
    </div>
  );
}
