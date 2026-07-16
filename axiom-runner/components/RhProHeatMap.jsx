import { useState, useEffect } from "react";
import { SECTOR_ETFS } from "./market-helpers.js";

export default function RhProHeatMap({ C, MONO, SANS, sectorData, macroData }) {
  const [screen, setScreen] = useState({}); // symbol -> {rsRating, momentum, stage}
  useEffect(() => {
    fetch(`/api/market/trend-screen?symbols=${SECTOR_ETFS.map(s => s.symbol).join(",")}`)
      .then(r => r.json())
      .then(d => { const m = {}; (d.results || []).forEach(x => { if (!x.error) m[x.symbol] = x; }); setScreen(m); })
      .catch(() => {});
  }, []);
  const chg = x => Number(x?.changesPercentage ?? 0);
  const spy = (macroData || []).find(m => (m.symbol || "").toUpperCase() === "SPY");
  const spyChg = chg(spy);

  const sectors = SECTOR_ETFS.map(se => {
    const sd = (sectorData || []).find(x => (x.symbol || "").toUpperCase() === se.symbol);
    const sc = screen[se.symbol] || {};
    return { ...se, chg: chg(sd), rs: Number(sc.rsRating || 0), mom: Number(sc.momentum || 0), stage: sc.stage || "", rel: chg(sd) - spyChg };
  });
  const ranked = [...sectors].sort((a, b) => b.chg - a.chg);

  // Rotation quadrants (RRG-style): x = relative strength (RS), y = momentum.
  const quad = (s) => s.rs >= 55 ? (s.mom >= 0 ? "leading" : "weakening") : (s.mom >= 0 ? "improving" : "lagging");
  const quads = {
    leading:  { t: "🟢 LEADING", d: "strong + rising", c: C.green, items: [] },
    weakening:{ t: "🟡 WEAKENING", d: "strong but rolling over", c: C.amber, items: [] },
    improving:{ t: "🔵 IMPROVING", d: "weak but turning up", c: C.accent, items: [] },
    lagging:  { t: "🔴 LAGGING", d: "weak + falling", c: C.red, items: [] },
  };
  sectors.forEach(s => { if (s.rs) quads[quad(s)].items.push(s); });

  const heatCol = (v) => { const a = Math.min(1, Math.abs(v) / 2.5); return v >= 0 ? `rgba(34,212,126,${0.12 + a * 0.55})` : `rgba(239,68,68,${0.12 + a * 0.55})`; };

  return (
    <div style={{ padding: "8px 4px" }}>
      <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 12 }}>🗺 MARKET HEAT MAP</div>

      {/* Heat grid — money flow (green = inflow / red = outflow) */}
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, marginBottom: 6 }}>SECTOR PERFORMANCE TODAY · green = money in / red = money out</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginBottom: 18 }}>
        {ranked.map(s => (
          <div key={s.symbol} style={{ background: heatCol(s.chg), border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 10px", textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: "#fff" }}>{s.symbol}</div>
            <div style={{ fontFamily: SANS, fontSize: 10, color: "#fff", opacity: 0.85 }}>{s.name}</div>
            <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: "#fff", marginTop: 4 }}>{s.chg >= 0 ? "+" : ""}{s.chg.toFixed(2)}%</div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: "#fff", opacity: 0.8 }}>vs SPY {s.rel >= 0 ? "+" : ""}{s.rel.toFixed(2)}%</div>
          </div>
        ))}
      </div>

      {/* Rotation quadrants */}
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, marginBottom: 2 }}>SECTOR ROTATION · relative strength × momentum</div>
      {/* RS Rating here is a multi-week trend-strength percentile from the
          trend-screen engine, not today's session — deliberately a
          different timeframe than the "today" heat grid above and the
          Strongest/Weakest boxes below. Without this line, a sector red
          today (e.g. Technology -2%) could show up in LEADING here at the
          same time it's listed under "avoid / short bias" a few rows down
          for today's move — same "RS 99" number in both places — which
          reads as a flat contradiction unless the timeframe difference is
          spelled out. */}
      <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginBottom: 6 }}>
        RS Rating = multi-week trend strength, not today's move — a sector can be LEADING here and still red today (see Weakest, below).
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {["leading", "weakening", "improving", "lagging"].map(k => {
          const q = quads[k];
          return (
            <div key={k} style={{ background: C.card, border: `1px solid ${q.c}44`, borderLeft: `3px solid ${q.c}`, borderRadius: 10, padding: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: q.c }}>{q.t}</div>
              <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginBottom: 6 }}>{q.d}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {q.items.length ? q.items.map(s => (
                  <span key={s.symbol} title={`${s.name} · RS ${s.rs}`} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 8px" }}>{s.symbol}</span>
                )) : <span style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>—</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Strongest / weakest */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ background: `${C.green}0d`, border: `1px solid ${C.green}44`, borderRadius: 10, padding: 12 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.green, marginBottom: 6 }}>💪 STRONGEST TODAY — favor longs here</div>
          {ranked.slice(0, 3).map(s => <div key={s.symbol} style={{ fontFamily: SANS, fontSize: 13, color: C.text, padding: "2px 0" }}>{s.name} <span style={{ fontFamily: MONO, color: C.green }}>+{s.chg.toFixed(2)}%</span> {s.rs ? <span style={{ fontSize: 10, color: C.textDim }}>RS {s.rs} (trend)</span> : null}</div>)}
        </div>
        <div style={{ background: `${C.red}0d`, border: `1px solid ${C.red}44`, borderRadius: 10, padding: 12 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.red, marginBottom: 6 }}>🩸 WEAKEST TODAY — avoid / short bias</div>
          {ranked.slice(-3).reverse().map(s => <div key={s.symbol} style={{ fontFamily: SANS, fontSize: 13, color: C.text, padding: "2px 0" }}>{s.name} <span style={{ fontFamily: MONO, color: C.red }}>{s.chg.toFixed(2)}%</span> {s.rs ? <span style={{ fontSize: 10, color: C.textDim }}>RS {s.rs} (trend)</span> : null}</div>)}
        </div>
      </div>
      <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 10, color: C.textDim }}>Trade leaders in the Leading/Improving quadrants; avoid Lagging. Analysis only — no orders.</div>
    </div>
  );
}
