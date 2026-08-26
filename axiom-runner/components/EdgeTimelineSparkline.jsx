import { useEffect, useState } from "react";

// EdgeTimelineSparkline — Phase 2 (2026-08-26), the UI half of the
// same-session Edge Timeline (src/opportunity-timeline-store.js). Real,
// same-day-only samples of a symbol's actual score, throttled to ~1 per
// 10 real minutes. Deliberately NOT the spec's full multi-day "Probability
// Shift"/"Edge Decay" ask (BUILDING/PEAK/STABLE/DECAYING classification)
// — that needs real accumulated history this store doesn't have yet, and
// fabricating a trend label off 1-2 real points would be exactly the kind
// of dishonest inference this app's own discipline forbids. Fetch is
// auto (not button-gated) — this is a cheap same-file JSON read, nothing
// like the correlation check's real per-symbol historical-bars fetch.
// Edge Velocity status chip (Phase 3, 2026-08-26) — real server-computed
// rate-of-change (src/opportunity-timeline-store.js's computeEdgeVelocity),
// not re-derived client-side, so the sparkline and the ranking tie-breaker
// (routes/market.js's computeAllOpportunities) can never disagree about
// the same symbol's velocity.
function VelocityChip({ edgeVelocity, C, MONO }) {
  if (!edgeVelocity || edgeVelocity.status === "INSUFFICIENT_DATA") return null;
  const meta = {
    ACCELERATING: { icon: "🟢", label: "ACCELERATING", color: "#0d9465" },
    DECAYING: { icon: "🟠", label: "DECAYING", color: "#c8282a" },
    STABLE: { icon: "⚪", label: "STABLE", color: C.textDim },
  }[edgeVelocity.status];
  if (!meta) return null;
  return (
    <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: meta.color }}>
      {meta.icon} {meta.label} {edgeVelocity.velocity > 0 ? "+" : ""}{edgeVelocity.velocity}
    </span>
  );
}

export default function EdgeTimelineSparkline({ symbol, C, MONO, SANS }) {
  const [samples, setSamples] = useState(null);
  const [edgeVelocity, setEdgeVelocity] = useState(null);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setSamples(null);
    setEdgeVelocity(null);
    fetch(`/api/market/opportunity-timeline?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setSamples(d && d.ok ? d.samples : []);
        setEdgeVelocity(d && d.ok ? d.edgeVelocity : null);
      })
      .catch(() => { if (!cancelled) { setSamples([]); setEdgeVelocity(null); } });
    return () => { cancelled = true; };
  }, [symbol]);

  if (samples == null) return null;

  // Honest "not enough real data yet" — never draws a line (or infers a
  // direction) from fewer than 2 real same-day points.
  if (samples.length < 2) {
    return (
      <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, textAlign: "center", padding: "4px 0" }}>
        📈 Edge Timeline: {samples.length === 0 ? "building today's history — check back later" : "1 real reading so far today"}
      </div>
    );
  }

  const W = 220, H = 32, PAD = 3;
  const scores = samples.map((s) => s.score);
  const min = Math.min(...scores), max = Math.max(...scores);
  const range = max - min || 1;
  const points = samples.map((s, i) => {
    const x = PAD + (i / (samples.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((s.score - min) / range) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const first = samples[0], last = samples[samples.length - 1];
  const delta = last.score - first.score;
  const deltaColor = delta > 0 ? C.green : delta < 0 ? C.red : C.textDim;
  const firstTime = new Date(first.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const lastTime = new Date(last.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div style={{ padding: "6px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>📈 EDGE TIMELINE — TODAY ({samples.length} real readings)</span>
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: deltaColor }}>{delta > 0 ? "+" : ""}{delta} today</span>
      </div>
      {edgeVelocity && edgeVelocity.status !== "INSUFFICIENT_DATA" && (
        <div style={{ marginBottom: 3 }}><VelocityChip edgeVelocity={edgeVelocity} C={C} MONO={MONO} /></div>
      )}
      <svg width={W} height={H} style={{ display: "block" }}>
        <polyline points={points.join(" ")} fill="none" stroke={deltaColor} strokeWidth="1.6" />
        <circle cx={points[points.length - 1].split(",")[0]} cy={points[points.length - 1].split(",")[1]} r="2.4" fill={deltaColor} />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 8.5, color: C.textDim }}>
        <span>{firstTime} · {first.score}</span>
        <span>{lastTime} · {last.score}</span>
      </div>
    </div>
  );
}
