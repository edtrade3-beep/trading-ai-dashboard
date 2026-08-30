import { useEffect, useState } from "react";
import { classifyMtfAlignment } from "./market-helpers.js";

const ALIGN_META = {
  CONFIRMS: { color: "#0d9465", label: "CONFIRMS" },
  CONFLICTS: { color: "#c8282a", label: "CONFLICTS" },
  NEUTRAL: { color: "#d6a312", label: "NEUTRAL" },
  REFERENCE: { color: "#7a8699", label: "REFERENCE" },
};

// MultiTimeframePanel — Trade Desk redesign Phase 2, §10 ("Multi-Timeframe
// Engine"). Real GET /api/market/mtf (mtf-swing-engine.js's 4H SWING_SETUP,
// mtf-early-engine.js's 1H RSI-trend, day-trade-calc.js's 15M
// classifyEntryTrigger — the SAME real engines MarketTerminalTab.jsx's own
// MTF panel already uses) plus the real daily bias already derived from
// `chart` (stage + passCount, same one-liner used elsewhere in this app).
// Capped to real 1D/4H/1H/15M — no fabricated 1m/5m rows, since this
// codebase has no real sub-5-minute bar source anywhere.
export default function MultiTimeframePanel({ symbol, chart, C, MONO, SANS }) {
  const [mtf, setMtf] = useState(null);
  const dailyBias = chart
    ? ((String(chart.stage || "").includes("2") && Number(chart.passCount || 0) >= 6) ? "BULLISH"
      : String(chart.stage || "").includes("4") ? "BEARISH" : "NEUTRAL")
    : null;

  useEffect(() => {
    if (!symbol || !chart) return;
    let cancelled = false;
    setMtf(null);
    const apctParam = Number.isFinite(chart.setup?.abovePivotPct) ? `&abovePivotPct=${chart.setup.abovePivotPct}` : "";
    const dirParam = dailyBias ? `&direction=${dailyBias}` : "";
    fetch(`/api/market/mtf?symbol=${encodeURIComponent(symbol)}${apctParam}${dirParam}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setMtf(j?.ok ? j : null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [symbol, chart?.setup?.abovePivotPct, dailyBias]);

  if (!symbol || !chart) return null;

  const { rows, confirmCount, conflictCount, knownCount } = classifyMtfAlignment({
    dailyBias,
    swing4hState: mtf?.swing4h?.state ?? null,
    early1hDirection: mtf?.early1h?.rsiTrend?.direction ?? null,
    entry15mStatus: mtf?.entry15m?.status ?? null,
  });

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", background: C.card }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 8 }}>⏱ MULTI-TIMEFRAME — {symbol}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {rows.map((r) => {
          const meta = r.alignment ? ALIGN_META[r.alignment] : null;
          return (
            <div key={r.tf} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 11 }}>
              <span style={{ width: 28, color: C.textDim, fontWeight: 800 }}>{r.tf}</span>
              <span style={{ flex: 1, color: C.text }}>{r.read || "unavailable"}</span>
              {meta && <span style={{ fontSize: 9.5, fontWeight: 800, color: meta.color, background: `${meta.color}18`, borderRadius: 999, padding: "1px 8px" }}>{meta.label}</span>}
            </div>
          );
        })}
      </div>
      {knownCount > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: conflictCount > 0 ? "#c8282a" : confirmCount === knownCount ? "#0d9465" : C.textDim }}>
          {confirmCount}/{knownCount} REAL TIMEFRAMES CONFIRM THE {dailyBias || "DAILY"} BIAS
        </div>
      )}
      {!mtf && (
        <div style={{ marginTop: 6, fontFamily: SANS, fontSize: 10, color: C.textDim, fontStyle: "italic" }}>Loading real 4H/1H/15M reads…</div>
      )}
    </div>
  );
}
