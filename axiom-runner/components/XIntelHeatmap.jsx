import { useMemo } from "react";
import { cardStyle } from "./ui-helpers.js";

// HEATMAP — Module 12. Two real heatmaps already exist in this codebase:
// this mention-sentiment grid (moved here unchanged from the old XIntelTab)
// and RhProHeatMap.jsx's real price-performance + RRG-quadrant sector
// heatmap on its own tab. Per the approved plan, this does NOT build a
// third — it keeps the real one that's genuinely X-Intel-specific
// (discussion/sentiment, not price) and points to the other rather than
// duplicating it.
export default function XIntelHeatmap({ C, MONO, SANS, items, setActiveTab }) {
  const mostMentioned = useMemo(() => {
    const counts = {};
    (items || []).forEach((it) => (it.marketImpact || []).forEach((m) => {
      counts[m.symbol] = counts[m.symbol] || { count: 0, bullish: 0, bearish: 0 };
      counts[m.symbol].count++;
      counts[m.symbol][m.direction]++;
    }));
    return Object.entries(counts).sort((a, b) => b[1].count - a[1].count).slice(0, 24);
  }, [items]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...cardStyle(C, { background: C.card }), padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.text }}>🗺️ MENTION-SENTIMENT HEATMAP</div>
          {setActiveTab && (
            <button onClick={() => setActiveTab("rhpro-heat")} style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: C.accent, background: "transparent", border: `1px solid ${C.accent}44`, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
              PRICE HEATMAP ↗
            </button>
          )}
        </div>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginBottom: 12 }}>
          Real, real-time discussion volume + net bullish/bearish tilt from X Intel's own logged items — not price performance (see the price-based heatmap via the button above).
        </div>
        {mostMentioned.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 6 }}>
            {mostMentioned.map(([sym, d]) => {
              const net = d.bullish - d.bearish;
              const col = net > 0 ? C.green : net < 0 ? C.red : C.textDim;
              const intensity = Math.min(1, (Math.abs(net) + 1) / (d.count + 1));
              return (
                <div key={sym} style={{ textAlign: "center", padding: "10px 4px", borderRadius: 6, background: `${col}${Math.round(intensity * 40).toString(16).padStart(2, "0")}`, border: `1px solid ${col}44` }}>
                  <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: col }}>{sym}</div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{d.count}x</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>No items yet.</div>
        )}
      </div>
    </div>
  );
}
