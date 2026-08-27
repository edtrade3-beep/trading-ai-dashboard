import { useState, useEffect, useCallback } from "react";

// MarketContextPanel — Market Context Phase 1 (2026-08-27), the real
// top-level primary section of Trade Desk. Self-contained (fetches its
// own real /api/market/context, src/market-context-engine.js's additive
// cross-asset layer on top of the already-real macro-regime stack).
// Replaces the old collapsed MacroStatusStrip sub-panel that used to live
// in Trade Desk's 280px right column — this is the promoted, always-
// visible version, matching the spec's own "top-level brain" framing.
const ENV_META = {
  LONG_FAVORABLE: { label: "LONG FAVORABLE", color: "#0d9465" },
  SHORT_FAVORABLE: { label: "SHORT FAVORABLE", color: "#c8282a" },
  RANGE: { label: "RANGE", color: "#d6a312" },
  HIGH_VOLATILITY: { label: "HIGH VOLATILITY", color: "#e07b1a" },
  WAIT: { label: "WAIT", color: "#8a94a6" },
  DO_NOT_CHASE: { label: "DO NOT CHASE", color: "#c8282a" },
};

function fmtChg(v, digits = 2) {
  if (!Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}
function chgColor(v, C) {
  if (!Number.isFinite(v)) return C.textDim;
  return v > 0 ? C.green : v < 0 ? C.red : C.text;
}
function trendArrow(trend) {
  return trend === "rising" ? "↑" : trend === "falling" ? "↓" : trend === "flat" ? "→" : "—";
}

export default function MarketContextPanel({ C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(() => {
    fetch("/api/market/context").then(r => r.json()).then(d => {
      if (d?.ok) { setData(d); setError(null); } else setError(d?.error || d?.reason || "context fetch failed");
    }).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60_000); // matches the route's own 5-min cache window
    return () => clearInterval(t);
  }, [load]);

  if (error && !data?.available) {
    return (
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: SANS, fontSize: 11, color: C.textDim }}>
        🌍 Market Context unavailable: {error}
      </div>
    );
  }
  if (!data?.available) {
    return <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 11, color: C.textDim }}>Loading Market Context…</div>;
  }

  const env = ENV_META[data.tradingEnvironment] || ENV_META.WAIT;
  const inst = data.instruments || {};

  const chip = (label, value, color) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 54 }}>
      <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: color || C.text }}>{value}</span>
    </div>
  );

  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, background: C.card }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.text }}>🌍 MARKET CONTEXT</span>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: data.regime.color || C.text }}>{data.regime.icon} {data.regime.label}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>FED: <b style={{ color: C.text }}>{data.fedSignal?.signal?.replace("_REPRICING", "") || "—"}</b></span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>MACRO SCORE: <b style={{ color: data.macroScore >= 0 ? C.green : C.red }}>{data.macroScore >= 0 ? "+" : ""}{data.macroScore}</b></span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>CONF: <b style={{ color: C.text }}>{data.confidence}%</b></span>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: env.color, background: `${env.color}18`, borderRadius: 999, padding: "2px 10px" }}>{env.label}</span>
        {data.divergence !== "ALIGNED" && (
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: "#e07b1a", background: "#e07b1a18", borderRadius: 999, padding: "2px 8px" }}>
            ⚠️ {data.divergence === "MACRO_EQUITY_DIVERGENCE" ? "MACRO/EQUITY DIVERGENCE" : "EQUITY WEAKNESS DESPITE DOVISH"}
          </span>
        )}
        <button onClick={() => setExpanded(v => !v)} style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, color: C.textDim, background: "transparent", border: "none", cursor: "pointer" }}>
          {expanded ? "▾ less" : "▸ more"}
        </button>
      </div>

      {expanded && (
        <div style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: "6px 0" }}>
            {chip("2Y", inst.twoYear ? `${inst.twoYear.value?.toFixed(2)}% ${trendArrow(inst.twoYear.trend)}` : "—")}
            {chip("10Y", inst.tenYear ? trendArrow(inst.tenYear.trend) : "—")}
            {chip("DXY", inst.dxy ? fmtChg(inst.dxy.chgPct) : "—", chgColor(inst.dxy?.chgPct, C))}
            {chip("VIX", inst.vix ? inst.vix.level.toFixed(1) : "—")}
            {chip("OIL", inst.oil ? fmtChg(inst.oil.chgPct) : "—", chgColor(inst.oil?.chgPct, C))}
            {chip("GOLD", inst.gold ? fmtChg(inst.gold.chgPct) : "—", chgColor(inst.gold?.chgPct, C))}
            {chip("BTC", inst.btc ? fmtChg(inst.btc.chgPct) : "—", chgColor(inst.btc?.chgPct, C))}
            {chip("SPY", inst.spy ? fmtChg(inst.spy.chgPct) : "—", chgColor(inst.spy?.chgPct, C))}
            {chip("QQQ", inst.qqq ? fmtChg(inst.qqq.chgPct) : "—", chgColor(inst.qqq?.chgPct, C))}
          </div>

          {data.explanation?.summary && (
            <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, lineHeight: 1.4 }}>
              <b style={{ color: C.text }}>WHY THE MARKET IS MOVING: </b>{data.explanation.summary}
            </div>
          )}
          {data.explanation?.whatMattersNext && (
            <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, lineHeight: 1.4 }}>
              <b>WHAT MATTERS NEXT: </b>{data.explanation.whatMattersNext}
            </div>
          )}

          {data.sectorRotation?.ranked?.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim }}>TOP SECTORS:</span>
              {data.sectorRotation.ranked.slice(0, 5).map((s) => (
                <span key={s.sym} style={{ fontFamily: MONO, fontSize: 10, color: C.textSec, background: C.surface, borderRadius: 4, padding: "2px 6px" }}>{s.sym}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
