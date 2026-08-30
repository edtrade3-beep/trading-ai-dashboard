import { useState, useEffect, useCallback } from "react";

// MarketContextCard — Trade Desk's real Market Context surface (moved
// here 2026-08-30 per explicit user request, "move market context to that
// area" — the Workspace Grid's blank last-row space, per a live
// screenshot; retired the old full-width top-level MarketContextPanel.jsx
// strip entirely rather than showing the same real data twice). Same real
// GET /api/market/context fetch that panel used, condensed to the grid's
// own bordered-card visual style.
//
// Labeling fix (Central Opportunity & Options Engine goal, 2026-08-30):
// this card takes no `symbol` prop — market-context-engine.js's
// classifyTradingEnvironment is 100% cross-asset/macro (2Y, DXY, VIX,
// SPY/QQQ divergence), never a per-symbol input, and confirmed (grep)
// never consumed by any real trade-decision path (am-core-engine.js,
// opportunity-engine.js, autopilot2-engine.js all ignore it) — it is
// correctly evidence, not a competing verdict, already. But its badge
// used the exact same words ("DO NOT CHASE", "SHORT FAVORABLE") the
// real per-symbol chase-risk/verdict system uses, sitting in a Trade
// Desk grid next to a specific stock's own real AI Verdict — a real,
// live screenshot this session showed exactly how easy it'd be to read
// as a call on the ticker being viewed rather than the broad tape. Every
// label now explicitly says "BROAD MARKET" so it can't be mistaken for
// a symbol-specific verdict.
const ENV_META = {
  LONG_FAVORABLE: { label: "BROAD MARKET: LONG FAVORABLE", color: "#0d9465" },
  SHORT_FAVORABLE: { label: "BROAD MARKET: SHORT FAVORABLE", color: "#c8282a" },
  RANGE: { label: "BROAD MARKET: RANGE", color: "#d6a312" },
  HIGH_VOLATILITY: { label: "BROAD MARKET: HIGH VOLATILITY", color: "#e07b1a" },
  WAIT: { label: "BROAD MARKET: WAIT", color: "#8a94a6" },
  DO_NOT_CHASE: { label: "BROAD MARKET: DO NOT CHASE", color: "#c8282a" },
};
function fmtChg(v) {
  if (!Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function chgColor(v, C) {
  if (!Number.isFinite(v)) return C.textDim;
  return v > 0 ? C.green : v < 0 ? C.red : C.text;
}

export default function MarketContextCard({ C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    fetch("/api/market/context").then((r) => r.json()).then((d) => {
      if (d?.ok) { setData(d); setError(null); } else setError(d?.error || d?.reason || "context fetch failed");
    }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60_000); // matches the route's own 5-min cache window
    return () => clearInterval(t);
  }, [load]);

  const inst = data?.instruments || {};
  const env = data ? (ENV_META[data.tradingEnvironment] || ENV_META.WAIT) : null;

  const chip = (label, value, color) => (
    <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 46 }}>
      <span style={{ fontFamily: MONO, fontSize: 8.5, color: C.textDim }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: color || C.text }}>{value}</span>
    </div>
  );

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", background: C.card }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 2 }}>🌍 MARKET CONTEXT</div>
      <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.textDim, marginBottom: 6 }}>Cross-asset macro read (2Y/DXY/VIX/SPY/QQQ) — not a call on the ticker you're viewing. See the AI Verdict above for that.</div>
      {error && !data?.available && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>Unavailable: {error}</div>}
      {!data && !error && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>Loading real cross-asset regime…</div>}
      {data?.available && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: data.regime.color || C.text }}>{data.regime.icon} {data.regime.label}</span>
            <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: env.color, background: `${env.color}18`, borderRadius: 999, padding: "1px 8px" }}>{env.label}</span>
          </div>
          <div style={{ display: "flex", gap: 10, fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginBottom: 8 }}>
            <span>FED <b style={{ color: C.text }}>{data.fedSignal?.signal?.replace("_REPRICING", "") || "—"}</b></span>
            <span>SCORE <b style={{ color: data.macroScore >= 0 ? C.green : C.red }}>{data.macroScore >= 0 ? "+" : ""}{data.macroScore}</b></span>
            <span>CONF <b style={{ color: C.text }}>{data.confidence}%</b></span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            {chip("2Y", inst.twoYear ? `${inst.twoYear.value?.toFixed(2)}%` : "—")}
            {chip("VIX", inst.vix ? inst.vix.level.toFixed(1) : "—")}
            {chip("DXY", inst.dxy ? fmtChg(inst.dxy.chgPct) : "—", chgColor(inst.dxy?.chgPct, C))}
            {chip("SPY", inst.spy ? fmtChg(inst.spy.chgPct) : "—", chgColor(inst.spy?.chgPct, C))}
            {chip("QQQ", inst.qqq ? fmtChg(inst.qqq.chgPct) : "—", chgColor(inst.qqq?.chgPct, C))}
          </div>
          {data.divergence !== "ALIGNED" && (
            <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: "#e07b1a", background: "#e07b1a18", borderRadius: 6, padding: "3px 8px", marginBottom: 6 }}>
              ⚠️ {data.divergence === "MACRO_EQUITY_DIVERGENCE" ? "MACRO/EQUITY DIVERGENCE" : "EQUITY WEAKNESS DESPITE DOVISH"}
            </div>
          )}
          {data.explanation?.summary && (
            <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textSec, lineHeight: 1.4 }}>{data.explanation.summary}</div>
          )}
        </>
      )}
    </div>
  );
}
