import { useState, useEffect, useMemo } from "react";
import { cardStyle } from "./ui-helpers.js";

const TREND_COLOR = { improving: "#0d9465", deteriorating: "#c8282a", stable: "#94a3b8" };

// SOCIAL — Module 2 (mentioned tickers/sentiment) + Module 5 (per-ticker
// sentiment history/trend direction). Mention/sentiment extraction itself
// was already real (x-intel-ai.js's AI-search output); what's new this
// session is persisting it per ticker over time
// (src/x-intel-sentiment-store.js) so "historical comparison / trend
// direction" — which nothing in X Intel tracked before — is a real answer,
// not a guess.
export default function XIntelSocial({ C, MONO, SANS, items }) {
  const mostMentioned = useMemo(() => {
    const counts = {};
    (items || []).forEach((it) => (it.marketImpact || []).forEach((m) => {
      counts[m.symbol] = (counts[m.symbol] || 0) + 1;
    }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([s]) => s);
  }, [items]);

  const [selected, setSelected] = useState(null);
  const [trend, setTrend] = useState(null);

  useEffect(() => {
    if (mostMentioned.length && !selected) setSelected(mostMentioned[0]);
  }, [mostMentioned]);

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/x-intel/sentiment?symbol=${selected}`).then((r) => r.json()).then((d) => setTrend(d.ok ? d.trend : null));
  }, [selected]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...cardStyle(C, { background: C.card }), padding: 16 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.text, marginBottom: 10 }}>PER-TICKER SENTIMENT HISTORY</div>
        {mostMentioned.length === 0 ? (
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>No mentioned symbols yet.</div>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {mostMentioned.map((s) => (
                <button key={s} onClick={() => setSelected(s)} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "5px 11px", borderRadius: 6, cursor: "pointer",
                  border: `1px solid ${selected === s ? C.accent : C.border}`, background: selected === s ? `${C.accent}18` : "transparent", color: selected === s ? C.accent : C.textDim }}>{s}</button>
              ))}
            </div>
            {trend ? (
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 10 }}>
                  <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 900, color: C.text }}>{selected}</span>
                  {trend.trendDirection && (
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: TREND_COLOR[trend.trendDirection] }}>
                      {trend.trendDirection === "improving" ? "↗ improving" : trend.trendDirection === "deteriorating" ? "↘ deteriorating" : "→ stable"}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 2, height: 26, borderRadius: 5, overflow: "hidden", marginBottom: 8 }}>
                  {trend.bullishPct != null && <div style={{ width: `${trend.bullishPct}%`, background: C.green, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 10, fontWeight: 800, color: "#fff" }}>{trend.bullishPct >= 12 ? `${trend.bullishPct}%` : ""}</div>}
                  {trend.neutralPct != null && <div style={{ width: `${trend.neutralPct}%`, background: C.textDim, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 10, fontWeight: 800, color: "#fff" }}>{trend.neutralPct >= 12 ? `${trend.neutralPct}%` : ""}</div>}
                  {trend.bearishPct != null && <div style={{ width: `${trend.bearishPct}%`, background: C.red, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 10, fontWeight: 800, color: "#fff" }}>{trend.bearishPct >= 12 ? `${trend.bearishPct}%` : ""}</div>}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>
                  Avg confidence {trend.avgConfidence ?? "—"} · {trend.historyDepth} real snapshot{trend.historyDepth === 1 ? "" : "s"} · as of {new Date(trend.asOf).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ) : (
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>No real sentiment history for {selected} yet — builds up after the next AI-search run.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
