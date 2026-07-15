import { useState, useEffect } from "react";

// ── Journal Patterns — journal-analytics.js's day/hour/sector win-rate math
// was already built and already wired into ai-coach.js's weekly/monthly
// Telegram reviews, but never shown directly in the app. Pure display of
// already-computed, already-tested stats — no new math here. Respects the
// same small-sample honesty convention as MyTradesTab's "N/20 trades — keep
// going": a null bucket renders as "not enough data yet," never fabricated.
export default function JournalPatternsPanel({ C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | empty | error

  useEffect(() => {
    fetch("/api/ai-hub/journal-patterns").then(r => r.json()).then(d => {
      if (d && d.ok) { setData(d); setState(d.tradeCount > 0 ? "ok" : "empty"); }
      else { setState("empty"); }
    }).catch(() => setState("error"));
  }, []);

  if (state === "loading" || state === "error") return null;

  const row = { display: "flex", justifyContent: "space-between", padding: "4px 0", fontFamily: MONO, fontSize: 12 };
  const dim = { color: C.textDim };

  if (state === "empty") {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 6 }}>PATTERNS</div>
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Not enough closed trades yet to find real patterns — this fills in as you trade.</div>
      </div>
    );
  }

  const bestDay = Object.entries(data.byDayOfWeek || {}).filter(([, v]) => v).sort((a, b) => b[1].winRate - a[1].winRate)[0];
  const bestSector = Object.entries(data.bySector || {}).filter(([, v]) => v).sort((a, b) => b[1].winRate - a[1].winRate)[0];
  const hold = data.holdTime;
  const best = (data.bestWorst?.best || [])[0];
  const worst = (data.bestWorst?.worst || [])[0];
  const anyPattern = bestDay || bestSector || hold;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 6 }}>
        PATTERNS <span style={{ fontWeight: 400 }}>· {data.tradeCount} closed trades</span>
      </div>
      {!anyPattern && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Not enough trades in any single bucket yet — keep going.</div>}
      {bestDay && <div style={row}><span style={dim}>Best day</span><span style={{ color: C.text, fontWeight: 700 }}>{bestDay[0]} — {bestDay[1].winRate}% win ({bestDay[1].n} trades)</span></div>}
      {bestSector && <div style={row}><span style={dim}>Best sector</span><span style={{ color: C.text, fontWeight: 700 }}>{bestSector[0]} — {bestSector[1].winRate}% win ({bestSector[1].n} trades)</span></div>}
      {hold && <div style={row}><span style={dim}>Avg hold time</span><span style={{ color: C.text, fontWeight: 700 }}>{hold.label} ({hold.n} trades)</span></div>}
      {best && <div style={row}><span style={dim}>Best trade</span><span style={{ color: C.green, fontWeight: 700 }}>{best.symbol} +${best.pnl}</span></div>}
      {worst && <div style={row}><span style={dim}>Worst trade</span><span style={{ color: C.red, fontWeight: 700 }}>{worst.symbol} ${worst.pnl}</span></div>}
    </div>
  );
}
