import { useState, useEffect } from "react";

// A+ Score forward-tracking report — a real, honest check on whether this
// platform's own composite score actually predicts anything, not just a
// formula trusted on faith. Pure forward log (src/aplus-score-history.js):
// starting the day this shipped, once daily it records every scanned
// symbol's real A+ Score + real price, then later compares against real
// current prices to report real bucketed forward returns. No historical
// backfill/reconstruction — every number here is either real or an honest
// "not enough history yet", never guessed.
const HORIZONS = [
  { key: "d5", label: "5 DAYS" },
  { key: "d10", label: "10 DAYS" },
  { key: "d20", label: "20 DAYS" },
  { key: "d60", label: "60 DAYS" },
];
const BUCKETS = ["80-100", "60-79", "40-59", "0-39"];

export default function AplusScoreTrackCard({ C, MONO, SANS }) {
  const [report, setReport] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | err

  useEffect(() => {
    fetch("/api/market/aplus-track").then(r => r.json()).then(d => {
      if (d && d.ok) { setReport(d); setState("ok"); } else setState("err");
    }).catch(() => setState("err"));
  }, []);

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 10 }}>📈 A+ SCORE FORWARD TRACK</div>

      {state === "loading" && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Loading…</div>}
      {state === "err" && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Unavailable right now — try again shortly.</div>}

      {report && (
        <>
          {report.daysTracked === 0 ? (
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.textSec, lineHeight: 1.5 }}>
              Tracking starts today — every day from now on, the real A+ Score and real price for every scanned symbol gets logged. Check back in about a week to see whether higher scores actually moved more.
            </div>
          ) : (
            <>
              <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginBottom: 10 }}>
                Tracking since {report.trackingStartedAt} · {report.daysTracked} real snapshot{report.daysTracked === 1 ? "" : "s"} logged
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                {HORIZONS.map(h => {
                  const horizon = report.horizons?.[h.key];
                  return (
                    <div key={h.key} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginBottom: 6 }}>{h.label}</div>
                      {horizon ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {BUCKETS.map(b => {
                            const stat = horizon.buckets?.[b];
                            return (
                              <div key={b} style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11 }}>
                                <span style={{ color: C.textDim }}>{b}</span>
                                {stat ? (
                                  <span>
                                    <span style={{ color: stat.avgReturnPct >= 0 ? C.green : C.red, fontWeight: 800 }}>
                                      {stat.avgReturnPct >= 0 ? "+" : ""}{stat.avgReturnPct}%
                                    </span>
                                    <span style={{ color: C.textDim }}> · {stat.winRate}% win · n={stat.count}</span>
                                  </span>
                                ) : <span style={{ color: C.textDim, fontStyle: "italic" }}>no data</span>}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, fontStyle: "italic" }}>Not enough history yet</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
      <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 10, color: C.textDim }}>Forward-tracking only — no historical backfill. Real logged score/price vs. real current price, bucketed by score range.</div>
    </div>
  );
}
