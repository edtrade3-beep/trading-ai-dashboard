// ExtendedHoursMovers.jsx — real pre-market/after-market mover detection,
// surfaced as real opportunities (explicit user request, 2026-08-31: "i
// need the system to detect pre market mover aftermarket movers trade
// desk needs to be for opportunities not just non need data").
//
// Reuses two real, already-existing pieces, zero new scoring logic:
//   - GET /api/market/premarket-movers / /api/market/aftermarket-movers
//     (src/routes/monitor-extras.js) — real session-aware (marketState-
//     based) movers across the real ~100-symbol SCAN_UNIVERSE, fixed the
//     same day this component shipped (the old version compared
//     meta.regularMarketPrice, which live-verified carries NO real
//     extended-hours movement at all).
//   - GET /api/market/trend-screen?withDecision=1 (routes/market.js) —
//     the SAME real computeOpportunity verdict every other opportunity
//     surface in this app uses, attached per real mover here so this
//     reads as "real opportunities," not just a raw %-change ticker.
import { useState, useEffect, useCallback } from "react";

const VERDICT_COLOR = (C) => ({
  EARLY_BUY: C.green, BUY: C.green, WATCH: C.amber, AVOID_LONG: C.textDim,
});

function MoverCard({ C, MONO, SANS, m, onSelect }) {
  const color = m.chg >= 0 ? C.green : C.red;
  const vColor = m.verdict ? (VERDICT_COLOR(C)[m.verdict] || C.textDim) : C.textDim;
  return (
    <button onClick={() => onSelect(m.sym)} style={{
      display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3, minWidth: 130,
      padding: "8px 10px", borderRadius: 8, cursor: "pointer", textAlign: "left",
      background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: C.text }}>{m.sym}</span>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color }}>{m.chg >= 0 ? "+" : ""}{m.chg}%</span>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim }}>${m.price} <span style={{ opacity: 0.7 }}>(reg ${m.regularPrice})</span></div>
      {m.verdict && (
        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: vColor, letterSpacing: 0.3 }}>{m.verdict}</div>
      )}
    </button>
  );
}

export default function ExtendedHoursMovers({ C, MONO, SANS, onSelectSymbol }) {
  const [pre, setPre] = useState(null);
  const [post, setPost] = useState(null);
  const [scored, setScored] = useState({});
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/market/premarket-movers").then((r) => r.json()).catch(() => ({ ok: false })),
      fetch("/api/market/aftermarket-movers").then((r) => r.json()).catch(() => ({ ok: false })),
    ]).then(([p, a]) => {
      const preMovers = p.ok ? p.movers || [] : [];
      const postMovers = a.ok ? a.movers || [] : [];
      setPre(preMovers);
      setPost(postMovers);
      if (!p.ok && !a.ok) setError("Could not load real extended-hours movers.");
      else setError(null);

      const top = [...preMovers.slice(0, 4), ...postMovers.slice(0, 4)];
      if (top.length) {
        fetch(`/api/market/trend-screen?symbols=${top.map((m) => m.sym).join(",")}&withDecision=1`)
          .then((r) => r.json())
          .then((d) => {
            const map = {};
            for (const row of d.results || []) map[row.symbol] = row.opportunity?.verdict || null;
            setScored(map);
          })
          .catch(() => {});
      }
    });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const withVerdict = (list) => (list || []).map((m) => ({ ...m, verdict: scored[m.sym] }));
  const preList = withVerdict(pre);
  const postList = withVerdict(post);
  const hasAny = preList.length > 0 || postList.length > 0;

  return (
    <div style={{ padding: "12px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
      <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 8 }}>
        PRE/AFTER-MARKET MOVERS — REAL OPPORTUNITIES, NOT JUST DATA
      </div>
      {error && <div style={{ fontSize: 12, color: C.red }}>{error}</div>}
      {!error && pre === null && post === null && <div style={{ fontSize: 12, color: C.textDim }}>Loading real extended-hours movers…</div>}
      {!error && (pre !== null || post !== null) && !hasAny && (
        <div style={{ fontSize: 12, color: C.textDim }}>No real pre/after-market movers ≥0.5% right now — regular session, or a quiet extended session.</div>
      )}
      {(preList.length > 0 || postList.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {preList.length > 0 && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: C.textDim, marginBottom: 6 }}>🌅 PRE-MARKET</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {preList.map((m) => <MoverCard key={m.sym} C={C} MONO={MONO} SANS={SANS} m={m} onSelect={onSelectSymbol} />)}
              </div>
            </div>
          )}
          {postList.length > 0 && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: C.textDim, marginBottom: 6 }}>🌙 AFTER-MARKET</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {postList.map((m) => <MoverCard key={m.sym} C={C} MONO={MONO} SANS={SANS} m={m} onSelect={onSelectSymbol} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
