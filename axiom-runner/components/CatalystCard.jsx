import { useEffect, useState } from "react";

// CatalystCard — Trade Desk redesign Phase 2, §19 (Catalyst Calendar,
// earnings only). No real forward FOMC/economic-release calendar data
// source exists anywhere in this codebase (confirmed before building
// this — src/routes/fed.js only fetches the LATEST already-published
// statement, never a schedule of upcoming meeting dates; Market Context's
// own "WHAT MATTERS NEXT" is a hardcoded advisory string, not a real
// date), so this card is honestly scoped to the one real forward-looking
// date this app can actually source: the symbol's own next real earnings
// date (GET /api/market/next-earnings, a real Yahoo quote field).
export default function CatalystCard({ symbol, C, MONO, SANS }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setData(null);
    fetch(`/api/market/next-earnings?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json())
      .then((d) => { if (!cancelled && d?.ok) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [symbol]);

  if (!symbol) return null;
  const soon = data?.available && Number.isFinite(data.dte) && data.dte >= 0 && data.dte <= 10;

  return (
    <div style={{ border: `1px solid ${soon ? C.amber : C.border}`, borderRadius: 10, padding: "12px 14px", background: C.card }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 8 }}>📅 CATALYST — {symbol}</div>
      {!data && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>Loading real earnings date…</div>}
      {data && !data.available && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>No real forward earnings date available for {symbol}.</div>}
      {data && data.available && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: soon ? C.amber : C.text }}>
              {new Date(data.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{data.timing}</span>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 11, color: soon ? C.amber : C.textSec, marginTop: 3 }}>
            {data.dte >= 0 ? `Earnings in ${data.dte} day${data.dte === 1 ? "" : "s"}` : `Reported ${Math.abs(data.dte)} day${Math.abs(data.dte) === 1 ? "" : "s"} ago`}
            {soon && " — real elevated event risk into this print."}
          </div>
        </>
      )}
      <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.textDim, marginTop: 8, fontStyle: "italic" }}>Earnings only — no real Fed/economic-release calendar data source available yet.</div>
    </div>
  );
}
