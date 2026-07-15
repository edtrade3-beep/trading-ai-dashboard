import { useState, useEffect } from "react";

// ── Portfolio Risk — renders the exact risk-guardrails.js math that already
// silently gates the Alpaca/Tradier autopilots (open-risk %, sector
// concentration, daily-loss breaker, account health), visible to a human
// for the first time. Zero new risk logic — pure display of what already
// decides whether an automated trade is allowed to fire.
export default function PortfolioRiskCard({ C, MONO, SANS }) {
  const [snap, setSnap] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | nokey | error

  useEffect(() => {
    const load = () => {
      fetch("/api/ai-hub/risk-snapshot").then(r => r.json()).then(d => {
        if (d && d.ok) { setSnap(d); setState("ok"); }
        else if (d && d.reason === "no-alpaca-key") { setState("nokey"); }
        else { setState("error"); }
      }).catch(() => setState("error"));
    };
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  if (state === "nokey") return null;
  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.shadow, padding: 14, display: "flex", flexDirection: "column" };
  const title = <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 10 }}>PORTFOLIO RISK</div>;

  if (state === "loading") return <div style={card}>{title}<div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading…</div></div>;
  if (state === "error" || !snap) return <div style={card}>{title}<div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>Couldn't load risk snapshot.</div></div>;

  const riskCap = 6; // matches the maxRiskPct default used by both autopilot engines
  const riskPct = Math.min(100, (snap.openRiskPct / riskCap) * 100);
  const riskColor = snap.openRiskPct >= riskCap ? C.red : snap.openRiskPct >= riskCap * 0.7 ? C.amber : C.green;
  const sectors = Object.entries(snap.sectorConcentration || {}).sort((a, b) => b[1] - a[1]);
  const maxSectorCount = sectors.length ? sectors[0][1] : 0;

  return (
    <div style={card}>
      {title}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>OPEN RISK</span>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: riskColor }}>{snap.openRiskPct}% <span style={{ color: C.textDim, fontWeight: 400 }}>/ {riskCap}% cap</span></span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ height: "100%", width: `${riskPct}%`, background: riskColor, borderRadius: 3 }} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: C.textDim }}>Daily loss breaker</span>
        <span style={{ fontWeight: 700, color: snap.dailyBreakerTripped ? C.red : C.green }}>{snap.dailyBreakerTripped ? "🔴 TRIPPED" : "✅ OK"}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: C.textDim }}>Account health</span>
        <span style={{ fontWeight: 700, color: snap.accountHealth?.ok ? C.green : C.red }}>{snap.accountHealth?.ok ? "✅ OK" : `🔴 ${snap.accountHealth?.reason || "blocked"}`}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, marginBottom: 10 }}>
        <span style={{ color: C.textDim }}>Open positions</span>
        <span style={{ fontWeight: 700, color: C.text }}>{snap.positionCount}</span>
      </div>

      {sectors.length > 0 && (
        <>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.04em", marginBottom: 6 }}>SECTOR CONCENTRATION</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {sectors.map(([sec, count]) => (
              <div key={sec} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, minWidth: 70 }}>{sec}</span>
                <div style={{ flex: 1, height: 5, borderRadius: 3, background: C.border, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(count / maxSectorCount) * 100}%`, background: count >= 3 ? C.amber : C.accent, borderRadius: 3 }} />
                </div>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, minWidth: 14, textAlign: "right" }}>{count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
