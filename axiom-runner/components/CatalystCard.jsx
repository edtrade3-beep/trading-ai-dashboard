import { useEffect, useState } from "react";

// CatalystCard — Trade Desk redesign Phase 2, §19 (Catalyst Calendar).
// Two real, independent forward-looking sources:
//  1. The symbol's own next real earnings date (GET /api/market/next-
//     earnings, a real Yahoo quote field).
//  2. Real upcoming US macro/Fed releases — GET /api/market/econ-calendar,
//     a real forward-looking read of the SAME fetchEconCalendar/
//     classifyEconEvents FMP pipeline /api/market/macro-news already uses
//     (ECON_EVENT_TAGS covers FOMC/CPI/PCE/Jobs/PMI/PPI/GDP), just pointed
//     forward and filtered for events that haven't happened yet instead of
//     macro-news's backward "already released" filter. An earlier version
//     of this card said no real forward Fed/econ calendar existed in this
//     codebase — that was wrong (found on a closer pass); this corrects
//     it. Still honestly empty (never fabricated) when no FMP key is
//     configured — the route discloses that directly.
export default function CatalystCard({ symbol, C, MONO, SANS }) {
  const [earnings, setEarnings] = useState(null);
  const [econ, setEcon] = useState(null);
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setEarnings(null);
    fetch(`/api/market/next-earnings?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json())
      .then((d) => { if (!cancelled && d?.ok) setEarnings(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [symbol]);

  // Econ calendar isn't symbol-specific — fetched once, not re-fetched
  // per symbol change (a real 5-min cache would be reasonable server-side
  // too, but the FMP call itself is cheap and this component only mounts
  // once per Trade Desk session anyway).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/market/econ-calendar?days=14").then((r) => r.json())
      .then((d) => { if (!cancelled && d?.ok) setEcon(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!symbol) return null;
  const soon = earnings?.available && Number.isFinite(earnings.dte) && earnings.dte >= 0 && earnings.dte <= 10;

  return (
    <div style={{ border: `1px solid ${soon ? C.amber : C.border}`, borderRadius: 10, padding: "12px 14px", background: C.card }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 8 }}>📅 CATALYST — {symbol}</div>
      {!earnings && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>Loading real earnings date…</div>}
      {earnings && !earnings.available && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>No real forward earnings date available for {symbol}.</div>}
      {earnings && earnings.available && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: soon ? C.amber : C.text }}>
              {new Date(earnings.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{earnings.timing}</span>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 11, color: soon ? C.amber : C.textSec, marginTop: 3 }}>
            {earnings.dte >= 0 ? `Earnings in ${earnings.dte} day${earnings.dte === 1 ? "" : "s"}` : `Reported ${Math.abs(earnings.dte)} day${Math.abs(earnings.dte) === 1 ? "" : "s"} ago`}
            {soon && " — real elevated event risk into this print."}
          </div>
        </>
      )}

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 6 }}>UPCOMING MACRO EVENTS</div>
        {!econ && <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>Loading…</div>}
        {econ && econ.reason && <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>{econ.reason}</div>}
        {econ && !econ.reason && !econ.events.length && <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>No real US macro releases scheduled in the next 14 days.</div>}
        {econ && econ.events?.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {econ.events.slice(0, 6).map((e, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 10.5 }}>
                <span style={{ color: C.textDim, width: 42 }}>{new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                <span style={{ color: e.tag === "FED" ? C.amber : C.text, fontWeight: e.tag === "FED" ? 800 : 500, flex: 1 }}>{e.event}</span>
                {e.estimate != null && <span style={{ color: C.textDim }}>est {e.estimate}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
