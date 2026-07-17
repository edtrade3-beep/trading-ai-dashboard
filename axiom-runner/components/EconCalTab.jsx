// Tag normalization between the two data sources: econ-calendar's hardcoded
// placeholder list uses NFP/RTLS; econ-events' real FMP feed uses JOBS/RETAIL
// for the same events.
const REAL_TAG_ALIAS = { NFP: "JOBS", RTLS: "RETAIL" };

// Merges the platform's hardcoded, approximate release-date list (every
// date in it is a guess — see the "approximate" flag from
// /api/market/econ-calendar's own route comment: "in production would
// fetch from an API") with real confirmed dates from FMP
// (/api/market/econ-events, only populated when FMP_API_KEY is set).
// Previously this tab showed ONLY the guessed dates, rendered as a precise
// "TODAY"/"in 2d" countdown with an actionable "reduce position size"
// directive — with no indication anywhere that the date wasn't real. A
// wrong guess telling someone to cut risk on the wrong day is worse than
// showing nothing. Real dates now silently supersede guesses per event;
// remaining guesses are visually marked and lose the confident countdown +
// action directive (matching the same honest fallback pattern already used
// by the compact MacroEventsWidget).
function mergeEvents(approx, live) {
  const now = Date.now();
  const liveByTag = new Map();
  for (const e of (live || [])) {
    const tag = REAL_TAG_ALIAS[e.tag] || e.tag;
    if (!liveByTag.has(tag)) liveByTag.set(tag, e);
  }
  return (approx || []).map(e => {
    const real = liveByTag.get(e.tag);
    if (!real || !real.date) return { ...e, approximate: true };
    const d = new Date(real.date);
    if (Number.isNaN(d.getTime())) return { ...e, approximate: true };
    const dte = Math.round((d - now) / 86400000);
    return {
      ...e, approximate: false,
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      dte, countdown: dte <= 0 ? "TODAY" : dte === 1 ? "TOMORROW" : `in ${dte}d`,
      isUrgent: dte >= 0 && dte <= 2,
      estimate: real.estimate, previous: real.previous, actual: real.actual,
    };
  }).filter(e => e.dte >= -1).sort((a, b) => a.dte - b.dte);
}

export default function EconCalTab({
  C, MONO, SANS, evData, evLiveData,
}) {
        const IMPACT_COL = { HIGH: C.red, MED: C.amber, LOW: C.green };
        const events = mergeEvents(evData?.events, evLiveData);
        return (
          <div style={{ padding: "16px 20px" }}>
            <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.text, marginBottom: 12 }}>🗓 ECONOMIC CALENDAR</div>
            {events.filter(e => e.isUrgent && !e.approximate).length > 0 && (
              <div style={{ padding: "12px 16px", background: `${C.red}12`, border: `1px solid ${C.red}44`,
                borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.red, marginBottom: 4 }}>
                  ⚠ HIGH-IMPACT EVENT WITHIN 48 HOURS
                </div>
                {events.filter(e => e.isUrgent && !e.approximate).map((e,i) => (
                  <div key={i} style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, marginTop: 4 }}>
                    <strong>{e.name}</strong> — {e.countdown} · {e.note}
                  </div>
                ))}
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.red, marginTop: 8 }}>
                  Action: Reduce position size. Avoid new entries until after the print.
                </div>
              </div>
            )}
            {!evData && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>⌛ Loading…</div>}
            {evData && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {events.map((e, i) => (
                  <div key={i} style={{ padding: "14px 18px", borderRadius: 10,
                    background: e.isUrgent && !e.approximate ? `${C.red}0d` : C.card,
                    border: `1px solid ${e.isUrgent && !e.approximate ? C.red : C.border}44`,
                    borderLeft: `5px solid ${e.approximate ? C.textDim : (IMPACT_COL[e.impact] || C.amber)}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.text }}>{e.name}</span>
                          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                            background: (IMPACT_COL[e.impact]||C.amber) + "22",
                            color: IMPACT_COL[e.impact] || C.amber }}>{e.impact}</span>
                          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.textDim, background: C.surface, borderRadius: 4, padding: "2px 6px" }}>{e.tag}</span>
                          {e.approximate ? (
                            <span title="No confirmed date available (add FMP_API_KEY for real dates) — this is an estimate based on the event's typical schedule."
                              style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.amber, background: `${C.amber}18`, borderRadius: 4, padding: "2px 7px" }}>
                              ≈ ESTIMATED DATE
                            </span>
                          ) : (
                            <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.green, background: `${C.green}18`, borderRadius: 4, padding: "2px 7px" }}>● CONFIRMED</span>
                          )}
                        </div>
                        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, marginTop: 4 }}>{e.note}</div>
                        {!e.approximate && (e.previous != null || e.estimate != null || e.actual != null) && (
                          <div style={{ display: "flex", gap: 12, fontFamily: MONO, fontSize: 11, marginTop: 4 }}>
                            {e.previous != null && <span style={{ color: C.textDim }}>Prior <b style={{ color: C.text }}>{e.previous}</b></span>}
                            {e.estimate != null && <span style={{ color: C.textDim }}>Est. <b style={{ color: C.accent }}>{e.estimate}</b></span>}
                            {e.actual != null && <span style={{ color: C.textDim }}>Actual <b style={{ color: C.green }}>{e.actual}</b></span>}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontFamily: MONO, fontSize: e.approximate ? 13 : 16, fontWeight: 900,
                          color: e.approximate ? C.textDim : (e.isUrgent ? C.red : e.dte <= 5 ? C.amber : C.text) }}>
                          {e.approximate ? `~${e.countdown.toLowerCase()}` : e.countdown}
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{e.approximate ? `~${e.date}` : e.date}</div>
                      </div>
                    </div>
                    {e.isUrgent && !e.approximate && (
                      <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.red }}>
                        ⚠ HIGH-IMPACT EVENT SOON — Reduce size, avoid new entries
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 4 }}>
                  ≈ ESTIMATED DATE = no confirmed release date available for this event — add FMP_API_KEY in Render for real dates, consensus &amp; actuals.
                </div>
              </div>
            )}
          </div>
        );
}
