import { useState } from "react";

// Interactive options payoff visualizer — pick a strategy, edit numbers, see P&L at expiration.
export default function OptionsPayoffTool({ C, MONO, SANS }) {
  const STRATS = {
    "Long Call":         { fields: ["S","K1","p1"], legs: (v) => [{ kind:"call", dir:1, K:v.K1, prem:v.p1 }] },
    "Long Put":          { fields: ["S","K1","p1"], legs: (v) => [{ kind:"put", dir:1, K:v.K1, prem:v.p1 }] },
    "Covered Call":      { fields: ["S","K2","p2"], legs: (v) => [{ kind:"stock", dir:1, prem:v.S }, { kind:"call", dir:-1, K:v.K2, prem:v.p2 }] },
    "Cash-Secured Put":  { fields: ["S","K1","p1"], legs: (v) => [{ kind:"put", dir:-1, K:v.K1, prem:v.p1 }] },
    "Bull Call Spread":  { fields: ["S","K1","p1","K2","p2"], legs: (v) => [{ kind:"call", dir:1, K:v.K1, prem:v.p1 }, { kind:"call", dir:-1, K:v.K2, prem:v.p2 }] },
    "Bull Put Spread":   { fields: ["S","K1","p1","K2","p2"], legs: (v) => [{ kind:"put", dir:-1, K:v.K1, prem:v.p1 }, { kind:"put", dir:1, K:v.K2, prem:v.p2 }] },
    "Iron Condor":       { fields: ["S","K1","p1","K2","p2","K3","p3","K4","p4"],
      legs: (v) => [{ kind:"put", dir:-1, K:v.K1, prem:v.p1 }, { kind:"put", dir:1, K:v.K2, prem:v.p2 }, { kind:"call", dir:-1, K:v.K3, prem:v.p3 }, { kind:"call", dir:1, K:v.K4, prem:v.p4 }] },
  };
  const DEFAULTS = {
    "Long Call":        { S:100, K1:100, p1:3 },
    "Long Put":         { S:100, K1:100, p1:3 },
    "Covered Call":     { S:100, K2:105, p2:2 },
    "Cash-Secured Put": { S:100, K1:97, p1:2 },
    "Bull Call Spread": { S:100, K1:100, p1:3, K2:105, p2:1.2 },
    "Bull Put Spread":  { S:100, K1:98, p1:2.2, K2:93, p2:0.8 },
    "Iron Condor":      { S:100, K1:95, p1:1.2, K2:90, p2:0.6, K3:105, p3:1.2, K4:110, p4:0.6 },
  };
  const LABELS = { S:"Stock $", K1:"Strike 1", p1:"Premium 1", K2:"Strike 2", p2:"Premium 2", K3:"Strike 3", p3:"Premium 3", K4:"Strike 4", p4:"Premium 4" };
  const [strat, setStrat] = useState("Long Call");
  const [v, setV] = useState(DEFAULTS["Long Call"]);
  const pick = (s) => { setStrat(s); setV(DEFAULTS[s]); };
  const set = (k, val) => setV(p => ({ ...p, [k]: Number(val) }));

  const legs = STRATS[strat].legs(v);
  const payoffShare = (ST) => legs.reduce((sum, lg) => {
    const intrinsic = lg.kind === "call" ? Math.max(ST - lg.K, 0) : lg.kind === "put" ? Math.max(lg.K - ST, 0) : ST;
    return sum + lg.dir * (intrinsic - lg.prem);
  }, 0);

  const S = v.S || 100;
  const pMin = Math.max(0.01, S * 0.6), pMax = S * 1.4;
  const N = 80;
  const pts = Array.from({ length: N + 1 }, (_, i) => { const price = pMin + (pMax - pMin) * i / N; return { price, pl: payoffShare(price) * 100 }; });
  const pls = pts.map(p => p.pl);
  let maxP = Math.max(...pls), minP = Math.min(...pls);
  const uncapped = strat === "Long Call";  // upside unbounded
  const yHi = Math.max(maxP, 0) * 1.15 || 100, yLo = Math.min(minP, 0) * 1.15 || -100;
  // breakevens: sign changes
  const bes = [];
  for (let i = 1; i < pts.length; i++) {
    if ((pts[i-1].pl <= 0 && pts[i].pl > 0) || (pts[i-1].pl >= 0 && pts[i].pl < 0)) {
      const t = Math.abs(pts[i-1].pl) / (Math.abs(pts[i-1].pl) + Math.abs(pts[i].pl) || 1);
      bes.push(pts[i-1].price + (pts[i].price - pts[i-1].price) * t);
    }
  }
  const W = 720, H = 240, PADX = 46, PADY = 18;
  const xOf = (price) => PADX + (price - pMin) / (pMax - pMin) * (W - PADX - 12);
  const yOf = (pl) => PADY + (yHi - pl) / (yHi - yLo) * (H - PADY * 2);
  const zeroY = yOf(0);

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.text, marginBottom: 4 }}>🧮 PAYOFF SIMULATOR</div>
      <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginBottom: 12 }}>Pick a strategy and edit the numbers — see profit/loss at expiration. Values are per 1 contract (×100 shares).</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {Object.keys(STRATS).map(s => (
          <button key={s} onClick={() => pick(s)} style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, padding: "6px 11px", borderRadius: 7, cursor: "pointer",
            border: `1px solid ${strat === s ? C.accent : C.border}`, background: strat === s ? C.accent : C.surface, color: strat === s ? "#fff" : C.textSec }}>{s}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {STRATS[strat].fields.map(f => (
          <label key={f} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{LABELS[f]}</span>
            <input type="number" value={v[f]} onChange={e => set(f, e.target.value)} step="0.5"
              style={{ width: 74, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: MONO, fontSize: 12, color: C.text, padding: "5px 7px", outline: "none" }} />
          </label>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: C.surface, borderRadius: 8 }}>
        <line x1={PADX} y1={zeroY} x2={W-12} y2={zeroY} stroke={C.textDim} strokeDasharray="4 4" strokeWidth="1" />
        <line x1={xOf(S)} y1={PADY} x2={xOf(S)} y2={H-PADY} stroke={C.accent} strokeDasharray="2 3" strokeWidth="1" opacity="0.6" />
        <text x={xOf(S)} y={H-4} fill={C.accent} fontSize="9" fontFamily={MONO} textAnchor="middle">now ${S}</text>
        {pts.slice(1).map((p, i) => { const prev = pts[i]; const up = (p.pl + prev.pl) / 2 >= 0;
          return <line key={i} x1={xOf(prev.price)} y1={yOf(prev.pl)} x2={xOf(p.price)} y2={yOf(p.pl)} stroke={up ? C.green : C.red} strokeWidth="2.5" />; })}
        {bes.map((b, i) => <g key={i}><circle cx={xOf(b)} cy={zeroY} r="3.5" fill={C.amber} /><text x={xOf(b)} y={zeroY-6} fill={C.amber} fontSize="9" fontFamily={MONO} textAnchor="middle">${b.toFixed(1)}</text></g>)}
        <text x={4} y={yOf(yHi)+8} fill={C.textDim} fontSize="9" fontFamily={MONO}>+${Math.round(yHi)}</text>
        <text x={4} y={yOf(yLo)} fill={C.textDim} fontSize="9" fontFamily={MONO}>-${Math.abs(Math.round(yLo))}</text>
      </svg>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
        <div><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>MAX PROFIT</div><div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.green }}>{uncapped ? "Unlimited ↑" : `$${Math.round(maxP)}`}</div></div>
        <div><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>MAX LOSS</div><div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.red }}>${Math.round(minP)}</div></div>
        <div><div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>BREAKEVEN</div><div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.amber }}>{bes.length ? bes.map(b => `$${b.toFixed(1)}`).join(" · ") : "—"}</div></div>
      </div>
    </div>
  );
}
