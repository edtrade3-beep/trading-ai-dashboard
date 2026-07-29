import { useState, useEffect } from "react";
import FedWatchWidget from "./FedWatchWidget.jsx";
import FedInterpreter from "./FedInterpreter.jsx";

// Real 10Y/2Y yields (FRED, already wired for Us10yKpi/MacroTab) plus the
// 2s10s spread — a genuine, widely-watched recession signal computed as a
// plain subtraction of two real numbers, not a new data source.
function YieldsSpreadCard({ C, MONO, SANS }) {
  const [y10, setY10] = useState(null);
  const [y2, setY2] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/market/us10y").then(r => r.json()).then(d => { if (alive && d?.ok) setY10(d); }).catch(() => {});
      fetch("/api/market/us2y").then(r => r.json()).then(d => { if (alive && d?.ok) setY2(d); }).catch(() => {});
    };
    load();
    const t = setInterval(load, 30 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const spread = (y10 && y2) ? Math.round((y10.value - y2.value) * 100) / 100 : null;
  const inverted = spread != null && spread < 0;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 10 }}>REAL YIELDS</div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>10Y</div>
          <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>{y10 ? `${y10.value.toFixed(2)}%` : "—"}</div>
          {y10 && <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: y10.changePct >= 0 ? C.green : C.red }}>{y10.changePct >= 0 ? "+" : ""}{y10.changePct.toFixed(2)}%</div>}
        </div>
        <div>
          <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>2Y</div>
          <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>{y2 ? `${y2.value.toFixed(2)}%` : "—"}</div>
          {y2 && <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: y2.changePct >= 0 ? C.green : C.red }}>{y2.changePct >= 0 ? "+" : ""}{y2.changePct.toFixed(2)}%</div>}
        </div>
        <div>
          <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>2s10s spread</div>
          <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: spread == null ? C.text : inverted ? C.red : C.green }}>{spread != null ? `${spread >= 0 ? "+" : ""}${spread.toFixed(2)}` : "—"}</div>
        </div>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>
        {spread == null ? "Loading real 10Y/2Y yields from FRED…" : inverted
          ? "🔴 Inverted (10Y below 2Y) — the curve is historically flagging tighter growth ahead."
          : "🟢 Normal (10Y above 2Y) — no inversion signal right now."}
      </div>
    </div>
  );
}

// Real, official 2026 FOMC meeting schedule — same FIXED_EVENTS.FOMC dates
// backend already uses for the Upcoming Events countdown
// (monitor-extras.js), exposed in full here rather than just "next one".
function FomcCalendarCard({ C, MONO, SANS }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/market/fomc-calendar").then(r => r.json()).then(d => { if (alive && d?.ok) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const fmt = (d) => { try { return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return d; } };
  const meetings2026 = (data?.meetings || []).filter(m => m.date.startsWith("2026"));
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 10 }}>2026 FOMC MEETING SCHEDULE</div>
      {!data ? (
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>Loading…</div>
      ) : (
        <>
          {data.next && (
            <div style={{ marginBottom: 10, padding: "8px 10px", background: `${C.accent}10`, border: `1px solid ${C.accent}44`, borderRadius: 8 }}>
              <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>Next statement</div>
              <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.accent }}>{fmt(data.next.date)} · {data.next.dte === 0 ? "today" : `${data.next.dte}d`}</div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {meetings2026.map(m => (
              <div key={m.date} style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 12, padding: "3px 0", opacity: m.isPast ? 0.45 : 1 }}>
                <span style={{ color: m.dte === data.next?.dte && !m.isPast ? C.accent : C.text, fontWeight: m.dte === data.next?.dte && !m.isPast ? 800 : 500 }}>{fmt(m.date)}</span>
                <span style={{ color: C.textDim }}>{m.isPast ? "passed" : m.dte === 0 ? "today" : `in ${m.dte}d`}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Fed / FOMC Watch — dedicated always-available Dashboard sub-tab
// (2026-07-29, "create tab under dashboard" -> "Fed / FOMC watch":
// "Real Fed-funds-futures implied rate, real yields, meeting dates,
// hawkish/dovish lean — the kind of analysis I just gave you, always
// available"). Every piece here is a real, already-wired data source —
// FedWatchWidget (implied rate + lean, /api/market/fedwatch),
// YieldsSpreadCard (10Y/2Y, FRED), FomcCalendarCard (real published 2026
// meeting dates, monitor-extras.js), FedInterpreter (real statement
// scoring tool, most relevant right now since today IS a meeting day).
export default function FedWatchTab({ C, MONO, SANS }) {
  return (
    <div>
      <FedWatchWidget C={C} MONO={MONO} SANS={SANS} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 4, marginBottom: 12, alignItems: "start" }}>
        <YieldsSpreadCard C={C} MONO={MONO} SANS={SANS} />
        <FomcCalendarCard C={C} MONO={MONO} SANS={SANS} />
      </div>
      <FedInterpreter C={C} MONO={MONO} SANS={SANS} />
    </div>
  );
}
