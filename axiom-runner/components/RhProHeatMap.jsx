import { useState, useEffect } from "react";
import { SECTOR_ETFS } from "./market-helpers.js";

// Real XY Rotation Quadrant (Visual Intelligence redesign, 2026-09-09) —
// replaces the old 4 bucketed chip-lists below with an actual scatter:
// every sector plotted at its own real (rs, mom) position instead of
// sorted into one of 4 boxes, so two sectors in the same bucket (e.g. both
// "LEADING") are still visually distinguishable by how strong/weak each
// really is. Same real rsRating/momentum from /api/market/trend-screen —
// no new data, no fabricated axis. Quadrant split lines match this file's
// own existing thresholds (rs>=55, mom>=0), not a fresh arbitrary 50/50.
function RotationQuadrantChart({ C, MONO, SANS, sectors, quadOf, quads }) {
  const plottable = sectors.filter((s) => Number.isFinite(s.rs) && s.rs > 0);
  if (!plottable.length) {
    return <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, padding: "12px 0" }}>No real RS/momentum read available yet.</div>;
  }
  const W = 480, H = 320, PAD = 34;
  const rsMin = 1, rsMax = 99;
  const momAbs = Math.max(0.5, ...plottable.map((s) => Math.abs(s.mom)));
  const xOf = (rs) => PAD + ((rs - rsMin) / (rsMax - rsMin)) * (W - PAD * 2);
  const yOf = (mom) => H / 2 - (mom / momAbs) * (H / 2 - PAD * 0.6);
  const splitX = xOf(55);

  // Cluster de-overlap — with only ~11 sectors, several often land within
  // a few RS points of each other (confirmed live: XLU/XLY/XLB/XLV/XLF/XLI
  // all inside a 15-point RS band at once), which put their labels flush
  // on top of one another above a shared dot. Sorting by x and alternating
  // each close-together label above/below its dot is a cheap, real fix —
  // no full collision-detection engine needed for ~11 points.
  const sorted = [...plottable].sort((a, b) => a.rs - b.rs);
  const labelAbove = new Map();
  let lastX = -Infinity, toggle = false;
  sorted.forEach((s) => {
    const cx = xOf(s.rs);
    if (cx - lastX < 34) toggle = !toggle; else toggle = false;
    labelAbove.set(s.symbol, !toggle);
    lastX = cx;
  });

  return (
    <div style={{ marginBottom: 16 }}>
      {/* maxWidth caps how tall this gets at full dashboard width — a
          1.5:1 viewBox stretched to a ~1100px-wide container would render
          ~730px tall, dwarfing every other block on the page. */}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 560, height: "auto", display: "block", margin: "0 auto" }}>
        {/* Quadrant fills — top-left (Before It Pops) gets a visible glow
            per spec: "investigate the TOP-LEFT QUADRANT... may contain
            opportunities BEFORE the crowd arrives." */}
        <rect x={splitX} y={0} width={W - splitX} height={H / 2} fill={`${quads.leading.c}14`} />
        <rect x={0} y={0} width={splitX} height={H / 2} fill={`${quads.improving.c}22`} stroke={`${quads.improving.c}55`} strokeWidth={1} strokeDasharray="4 3" />
        <rect x={splitX} y={H / 2} width={W - splitX} height={H / 2} fill={`${quads.weakening.c}14`} />
        <rect x={0} y={H / 2} width={splitX} height={H / 2} fill={`${quads.lagging.c}10`} />
        <line x1={splitX} y1={0} x2={splitX} y2={H} stroke={C.border} strokeWidth={1} />
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke={C.border} strokeWidth={1} />
        {/* Quadrant labels — inset well clear of the axis-title captions
            below the chart (those live in HTML, outside the viewBox, so
            they can never collide with these). */}
        <text x={W - 8} y={16} textAnchor="end" fontFamily={MONO} fontSize={10} fontWeight={800} fill={quads.leading.c}>LEADERS</text>
        <text x={8} y={16} textAnchor="start" fontFamily={MONO} fontSize={10} fontWeight={800} fill={quads.improving.c}>BEFORE IT POPS</text>
        <text x={W - 8} y={H - 10} textAnchor="end" fontFamily={MONO} fontSize={10} fontWeight={800} fill={quads.weakening.c}>LATE / DETERIORATING</text>
        <text x={8} y={H - 10} textAnchor="start" fontFamily={MONO} fontSize={10} fontWeight={800} fill={quads.lagging.c}>AVOID</text>
        {/* Sector dots */}
        {plottable.map((s) => {
          const cx = xOf(s.rs), cy = yOf(s.mom);
          const color = quads[quadOf(s)].c;
          const above = labelAbove.get(s.symbol);
          return (
            <g key={s.symbol}>
              <circle cx={cx} cy={cy} r={7} fill={color} fillOpacity={0.85} stroke={C.card} strokeWidth={1.5}>
                <title>{`${s.name} (${s.symbol}) — RS ${s.rs}, momentum ${s.mom >= 0 ? "+" : ""}${s.mom.toFixed(2)}`}</title>
              </circle>
              <text x={cx} y={above ? cy - 11 : cy + 20} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={800} fill={C.text}>{s.symbol}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontFamily: SANS, fontSize: 10, color: C.textDim }}>X = relative strength (RS rating, multi-week trend).</span>
        <span style={{ fontFamily: SANS, fontSize: 10, color: C.textDim }}>Y = momentum (weighted trend acceleration) — up is accelerating, down is decelerating.</span>
      </div>
    </div>
  );
}

// `compact` — 2026-07-28, embedded into CEO AI to cut down on separate
// tabs (explicit user request). Skips the full heat grid + RRG rotation
// quadrants, keeps just the real Strongest/Weakest 3 sectors today — same
// real sectorData/macroData, same real ranking, report-length instead of
// the full page.
export default function RhProHeatMap({ C, MONO, SANS, sectorData, macroData, compact = false }) {
  const [screen, setScreen] = useState({}); // symbol -> {rsRating, momentum, stage}
  useEffect(() => {
    fetch(`/api/market/trend-screen?symbols=${SECTOR_ETFS.map(s => s.symbol).join(",")}&withDecision=1`)
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
    <div style={compact ? { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 } : { padding: "8px 4px" }}>
      <div style={{ fontFamily: MONO, fontSize: compact ? 14 : 20, fontWeight: 900, color: C.text, marginBottom: 12 }}>🗺 {compact ? "SECTOR HEAT" : "MARKET HEAT MAP"}</div>

      {!compact && (
      <>
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
      <RotationQuadrantChart C={C} MONO={MONO} SANS={SANS} sectors={sectors} quadOf={quad} quads={quads} />
      </>
      )}

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
      <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 10, color: C.textDim }}>
        {compact ? "Real sector-ETF % change today. Analysis only — no orders." : "Trade leaders in the Leading/Improving quadrants; avoid Lagging. Analysis only — no orders."}
      </div>
    </div>
  );
}
