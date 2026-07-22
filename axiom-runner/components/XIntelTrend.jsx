import { useState, useEffect } from "react";
import { cardStyle } from "./ui-helpers.js";
import SeverityBadge from "./SeverityBadge.jsx";

// TREND — Module 4 (Trend Engine) + Module 8 (Unusual Activity). Real,
// deterministic, zero-AI-cost: src/x-intel-engine.js's computeTrendVelocity
// (today's real mention rate vs. a real prior-week daily average) and
// computeUnusualActivity (today vs. a real 7-day median baseline, mapped
// onto the shared severity-scale.js ladder). Neither existed before this
// session — X Intel's old "trending topics"/"most mentioned" stats were
// recomputed from the last 150 items on every page load and thrown away,
// with no real historical baseline to compare against.
export default function XIntelTrend({ C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    fetch("/api/x-intel/trend").then((r) => r.json()).then((d) => {
      if (d.ok) { setData(d); setState("ok"); } else setState("error");
    }).catch(() => setState("error"));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.text, marginBottom: 4 }}>📈 TREND VELOCITY</div>
        <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginBottom: 12 }}>
          Real mentions in the last 24h vs. each symbol's real prior-week daily average — not a raw mention count, a rate-of-change.
        </div>
        {state === "loading" && <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Loading…</div>}
        {state === "ok" && (!data.velocity || data.velocity.length === 0) && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>No real mention history yet — this builds up as X Intel logs items over the next several days.</div>
        )}
        {data?.velocity?.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 11.5 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ textAlign: "left", padding: "4px 8px", color: C.textDim, fontWeight: 700 }}>SYMBOL</th>
                  <th style={{ textAlign: "right", padding: "4px 8px", color: C.textDim, fontWeight: 700 }}>24H MENTIONS</th>
                  <th style={{ textAlign: "right", padding: "4px 8px", color: C.textDim, fontWeight: 700 }}>PRIOR DAILY AVG</th>
                  <th style={{ textAlign: "right", padding: "4px 8px", color: C.textDim, fontWeight: 700 }}>VELOCITY</th>
                </tr>
              </thead>
              <tbody>
                {data.velocity.slice(0, 15).map((v, i) => (
                  <tr key={v.symbol} style={{ borderBottom: i < data.velocity.length - 1 ? `1px solid ${C.border}66` : "none" }}>
                    <td style={{ padding: "6px 8px", color: C.text, fontWeight: 800 }}>{v.symbol}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: C.textSec, fontVariantNumeric: "tabular-nums" }}>{v.mentions24h}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: C.textDim, fontVariantNumeric: "tabular-nums" }}>{v.priorDailyAvg}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 800, color: v.velocityPct > 0 ? C.green : v.velocityPct < 0 ? C.red : C.textDim, fontVariantNumeric: "tabular-nums" }}>
                      {v.velocityPct > 0 ? "+" : ""}{v.velocityPct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.text, marginBottom: 4 }}>⚡ UNUSUAL ACTIVITY</div>
        <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginBottom: 12 }}>
          Today's real mention count vs. each symbol's real 7-day median baseline, mapped onto the shared 5-tier severity scale.
        </div>
        {data?.unusualActivity?.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.unusualActivity.filter((u) => u.level !== "NORMAL").length === 0 && (
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>All tracked symbols reading NORMAL — no real spikes right now.</div>
            )}
            {data.unusualActivity.filter((u) => u.level !== "NORMAL").map((u) => (
              <div key={u.symbol} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: C.surface, borderRadius: 6 }}>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>{u.symbol}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{u.mentionsToday} today vs. {u.baselineMedian} median ({u.ratio}x)</span>
                <SeverityBadge severity={u} MONO={MONO} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>No real mention history yet.</div>
        )}
      </div>
    </div>
  );
}
