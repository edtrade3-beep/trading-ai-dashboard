import { useEffect, useState } from "react";

// OptionsIntelligencePanel — Phase 2 (2026-08-26, spec: "unified Options
// panel — volume/OI/unusual/sweeps/IV/IV rank/skew/strike concentration").
// Consolidates real, already-built pieces that were scattered across
// separate pages into one panel keyed to Trade Desk's selected symbol —
// zero new signal math, zero new server routes:
//   - IV / HV / IV Rank / skew  <- GET /api/market/volatility (real
//     iv-history-store.js honest-bootstrap IV Rank, volatility-lab.js's
//     real computeSkew — same route VolatilityLabTab.jsx already uses)
//   - Gamma / strike concentration <- GET /api/market/gamma (real
//     gamma-exposure.js byStrike clustering + gammaFlipPoint/callWall/
//     putWall — same route the Gamma Lab already uses)
//   - Call/put flow, unusual activity <- GET /api/market/options-flow
//     (Phase 1's existing real fetchOptionsFlow route)
// Every section honestly shows the real route's own disclosed
// unavailable-reason (e.g. no POLYGON_API_KEY, IV Rank still building
// under 10 real snapshots) rather than hiding the gap or guessing.
export default function OptionsIntelligencePanel({ symbol, C, MONO, SANS }) {
  const [vol, setVol] = useState(null);
  const [gamma, setGamma] = useState(null);
  const [flow, setFlow] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true); setVol(null); setGamma(null); setFlow(null);
    Promise.all([
      fetch(`/api/market/volatility?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/market/gamma?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/market/options-flow?symbols=${encodeURIComponent(symbol)}&limit=15`).then((r) => r.json()).catch(() => null),
    ]).then(([v, g, f]) => {
      if (cancelled) return;
      setVol(v && v.ok ? v : null);
      setGamma(g && g.ok ? g : null);
      setFlow(f && !f.error ? f : null);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol]);

  const tile = (label, value, sub, color) => (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", background: C.card, flex: "1 1 110px", minWidth: 100 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: color || C.text }}>{value}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.textDim, marginTop: 1 }}>{sub}</div>}
    </div>
  );

  if (!symbol) return null;

  const bySymbolFlow = flow?.bySymbol?.find((s) => s.symbol === symbol) || null;
  const callN = Number(flow?.summary?.callNotional) || 0;
  const putN = Number(flow?.summary?.putNotional) || 0;
  const flowTotal = callN + putN;

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", background: C.surface, marginBottom: 12 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 8 }}>
        🧬 OPTIONS INTELLIGENCE — {symbol}{loading && " · loading…"}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {tile("IV RANK", vol?.ivRankState?.available ? `${vol.ivRank}%` : "—", vol?.ivRankState?.available ? `${vol.ivPercentile}th pctile` : (vol?.ivRankState?.reason || "No real data yet"))}
        {tile("HV20 / HV60", vol ? `${vol.hv20 ?? "—"}% / ${vol.hv60 ?? "—"}%` : "—", "Real realized volatility")}
        {tile("SKEW", vol?.skew?.available ? `${vol.skew.skew > 0 ? "+" : ""}${vol.skew.skew}` : "—", vol?.skew?.available ? vol.skew.label : (vol?.skew?.reason || "Unavailable"),
          vol?.skew?.available ? (vol.skew.skew > 3 ? C.red : vol.skew.skew < -3 ? C.green : C.textDim) : undefined)}
        {tile("GAMMA FLIP", gamma?.available ? `$${gamma.gammaFlipPoint ?? "—"}` : "—", gamma?.available ? `Wall: $${gamma.callWall ?? "—"} / $${gamma.putWall ?? "—"}` : (gamma?.reason || "Unavailable"))}
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 5 }}>REAL FLOW — evidence, not an automatic direction call</div>
        {flowTotal > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: MONO, fontSize: 11.5 }}>
            <span style={{ color: C.green, fontWeight: 800 }}>${(callN / 1000).toFixed(0)}K calls</span>
            <span style={{ color: C.textDim }}>vs</span>
            <span style={{ color: C.red, fontWeight: 800 }}>${(putN / 1000).toFixed(0)}K puts</span>
            {bySymbolFlow?.callPutRatio != null && <span style={{ color: C.textDim }}>· C/P {bySymbolFlow.callPutRatio}</span>}
          </div>
        ) : (
          <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>No real unusual options flow recorded for {symbol} right now.</div>
        )}
      </div>
    </div>
  );
}
