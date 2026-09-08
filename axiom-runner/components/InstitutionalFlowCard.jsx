import { useEffect, useState } from "react";
import { computeInstitutionScore } from "./market-helpers.js";

// InstitutionalFlowCard — Trade Desk redesign Phase 1, §16 ("Institutional
// Flow"). Zero new scoring: computeInstitutionScore (market-helpers.js) is
// the same real, already-proven composite MarketTerminalTab.jsx's own
// Institution Score badge and AMCortexTab.jsx already use (dark-pool block
// prints + options-flow call/put skew + insider Form-4 transactions +
// 13F-derived net institutional share change + short interest), just never
// mounted inside Trade Desk before now. Same 4 real per-symbol fetches
// MarketTerminalTab.jsx's own "deep analysis" section makes
// (darkpool/options-flow/insider/short-interest) — no new backend route.
export default function InstitutionalFlowCard({ symbol, C, MONO, SANS }) {
  const [darkPool, setDarkPool] = useState(null);
  const [optionsFlow, setOptionsFlow] = useState(null);
  const [insiderData, setInsiderData] = useState(null);
  const [shortInterest, setShortInterest] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true);
    setDarkPool(null); setOptionsFlow(null); setInsiderData(null); setShortInterest(null);
    Promise.all([
      fetch(`/api/market/darkpool?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json()).then((j) => { if (!cancelled) setDarkPool(j?.ok ? j : null); }).catch(() => {}),
      fetch(`/api/market/options-flow?symbols=${encodeURIComponent(symbol)}&limit=1`).then((r) => r.json()).then((j) => { if (!cancelled) setOptionsFlow(j && !j.error ? j.summary || null : null); }).catch(() => {}),
      fetch(`/api/market/insider?ticker=${encodeURIComponent(symbol)}`).then((r) => r.json()).then((j) => { if (!cancelled) setInsiderData(j?.ok ? j : null); }).catch(() => {}),
      fetch(`/api/market/short-interest?tickers=${encodeURIComponent(symbol)}`).then((r) => r.json()).then((j) => { if (!cancelled) setShortInterest(j?.ok ? (j.results || [])[0] || null : null); }).catch(() => {}),
    ]).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol]);

  if (!symbol) return null;
  const hasAny = darkPool || optionsFlow || insiderData || shortInterest;
  const score = hasAny ? computeInstitutionScore({ darkPool, optionsFlow, insiderData, shortInterest }) : null;

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", background: C.card }}>
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.textSec, letterSpacing: 0.6, marginBottom: 10 }}>🏦 INSTITUTIONAL FLOW — {symbol}</div>
      {loading && !score && <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec }}>Loading real dark-pool/options/insider/short-interest data…</div>}
      {!loading && !score && <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec }}>No real institutional data available for {symbol} right now.</div>}
      {score && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 900, color: score.score >= 60 ? C.green : score.score <= 40 ? C.red : C.amber }}>{score.score}<span style={{ fontSize: 13, color: C.textSec }}> /100</span></span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "2px 9px", borderRadius: 999, color: score.score >= 60 ? C.green : score.score <= 40 ? C.red : C.amber, background: score.score >= 60 ? `${C.green}18` : score.score <= 40 ? `${C.red}18` : `${C.amber}18` }}>{score.label}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {score.reasons.map((r, i) => (
              <div key={i} style={{ fontFamily: SANS, fontSize: 13, color: C.text }}>· {r}</div>
            ))}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, fontStyle: "italic", marginTop: 8 }}>{score.disclosure}</div>
        </>
      )}
    </div>
  );
}
