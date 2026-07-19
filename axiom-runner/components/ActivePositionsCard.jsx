import { useState, useEffect } from "react";

// ── Active Positions — the one genuinely missing piece research found:
// PortfolioSnapshotCard shows aggregate equity/cash/P&L but never the
// actual list of what's open. Same /api/alpaca/positions endpoint
// PortfolioSnapshotCard/AutoPilotEngine.jsx/MyTradesTab.jsx already fetch.
export default function ActivePositionsCard({ C, MONO, SANS, setTerminalSymbol, setActiveTab }) {
  const [positions, setPositions] = useState([]);
  const [state, setState] = useState("loading"); // loading | ok | nokey | error

  useEffect(() => {
    const load = () => {
      fetch("/api/alpaca/positions").then(r => r.json()).then(d => {
        if (d?.reason === "no-alpaca-key") { setState("nokey"); return; }
        if (!d?.ok) { setState("error"); return; }
        setPositions(d.positions || []);
        setState("ok");
      }).catch(() => setState("error"));
    };
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  // Stays a silent null here (not a duplicate message) -- PortfolioSnapshotCard,
  // which sits directly above this on the Portfolio tab, now shows the
  // "No brokerage connected" explanation for the same nokey state, so a
  // second identical message right below it would just be noise.
  if (state === "nokey") return null;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.shadow, padding: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 10 }}>
        ACTIVE POSITIONS {positions.length > 0 && <span style={{ fontWeight: 400 }}>· {positions.length}</span>}
      </div>
      {state === "loading" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading…</div>}
      {state === "error" && <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>Couldn't load positions.</div>}
      {state === "ok" && !positions.length && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>No open positions.</div>}
      {state === "ok" && positions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {positions.map(p => {
            const pl = Number(p.unrealizedPL) || 0;
            const plPct = Number(p.unrealizedPLpc) || 0;
            return (
              <div key={p.symbol} onClick={() => { setTerminalSymbol?.(p.symbol); setActiveTab?.("mterminal"); }}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 4px", borderRadius: 6, cursor: "pointer", gap: 8 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent }}>{p.symbol}</div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{p.qty} sh @ ${Number(p.avgEntry || 0).toFixed(2)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: pl >= 0 ? C.green : C.red }}>
                    {pl >= 0 ? "+" : ""}${Math.abs(pl).toFixed(0)}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: pl >= 0 ? C.green : C.red }}>
                    {plPct >= 0 ? "+" : ""}{plPct.toFixed(1)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
