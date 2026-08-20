import { useState, useEffect } from "react";

// MTF Decision System's Trade Outcome Feedback Engine report (Phase 7,
// 2026-08-20) — same real, honest "pure forward log, no historical
// backfill" discipline as AplusScoreTrackCard.jsx right above this one:
// every real EARLY/START confirmation gets logged with its real evidence
// snapshot (src/mtf-outcome-tracker.js), then compared against real
// future prices to report real win rate/avg return/MFE/MAE/stop-target-
// hit-rate per horizon. A horizon with zero real completed events shows
// "not enough history yet," never an estimate.
const HORIZONS = [
  { key: "d1", label: "1 DAY" },
  { key: "d3", label: "3 DAYS" },
  { key: "d5", label: "5 DAYS" },
  { key: "d10", label: "10 DAYS" },
];
const STATES = [
  { key: "EARLY", label: "EARLY", icon: "🟡" },
  { key: "START", label: "START", icon: "🟢" },
];

export default function MtfOutcomeTrackCard({ C, MONO, SANS }) {
  const [report, setReport] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | err

  useEffect(() => {
    fetch("/api/market/mtf-outcomes").then(r => r.json()).then(d => {
      if (d && d.ok) { setReport(d); setState("ok"); } else setState("err");
    }).catch(() => setState("err"));
  }, []);

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 10 }}>🎯 MTF DECISION — TRADE OUTCOME TRACK</div>

      {state === "loading" && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Loading…</div>}
      {state === "err" && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Unavailable right now — try again shortly.</div>}

      {report && (
        <>
          {report.totalEvents === 0 ? (
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.textSec, lineHeight: 1.5 }}>
              Tracking starts with the next real EARLY/START confirmation — every one gets logged with its full real evidence snapshot (quality, setup, entry trigger, gate result, stop/targets), then compared against real future prices at 1/3/5/10 days out. Check back once a real START has had time to play out.
            </div>
          ) : (
            <>
              <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginBottom: 10 }}>
                Tracking since {report.trackingStartedAt ? new Date(report.trackingStartedAt).toLocaleDateString() : "—"} · {report.totalEvents} real event{report.totalEvents === 1 ? "" : "s"} logged
              </div>
              {STATES.map(s => (
                <div key={s.key} style={{ marginBottom: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.text, marginBottom: 6 }}>{s.icon} {s.label}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                    {HORIZONS.map(h => {
                      const stat = report.report?.[s.key]?.[h.key];
                      return (
                        <div key={h.key} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 8 }}>
                          <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginBottom: 4 }}>{h.label}</div>
                          {stat ? (
                            <div style={{ fontFamily: MONO, fontSize: 10.5, lineHeight: 1.6 }}>
                              <div><span style={{ color: stat.avgReturnPct >= 0 ? C.green : C.red, fontWeight: 800 }}>{stat.avgReturnPct >= 0 ? "+" : ""}{stat.avgReturnPct}%</span> avg · {stat.winRate}% win</div>
                              <div style={{ color: C.textDim }}>MFE +{stat.avgMfePct}% / MAE {stat.avgMaePct}%</div>
                              {stat.stopHitRate != null && <div style={{ color: C.textDim }}>Stop hit {stat.stopHitRate}% · Target1 {stat.target1HitRate}%</div>}
                              <div style={{ color: C.textDim }}>n={stat.count}</div>
                            </div>
                          ) : (
                            <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, fontStyle: "italic" }}>Not enough history yet</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
      <div style={{ marginTop: 4, fontFamily: SANS, fontSize: 10, color: C.textDim }}>Forward-tracking only — no historical backfill or replay. MFE/MAE = max favorable/adverse excursion within the window.</div>
    </div>
  );
}
