import { useState, useEffect } from "react";
import { computeRegime } from "./market-helpers.js";
import { computeGreenLight } from "./trading-utils.js";
import { findWeakestPosition } from "./portfolio-rotation-engine.js";
import { AI_ACTIONS } from "./ai-actions.js";

// ── Active Positions — the one genuinely missing piece research found:
// PortfolioSnapshotCard shows aggregate equity/cash/P&L but never the
// actual list of what's open. Same /api/alpaca/positions endpoint
// PortfolioSnapshotCard/AutoPilotEngine.jsx/MyTradesTab.jsx already fetch.
//
// Weakest Position badge (Green Light AI spec gap, 2026-08-03) — real,
// not speculative: the exact same computeGreenLight + findWeakestPosition
// AutoPilotEngine.jsx's live rotation tick already uses, applied here so
// a human sees "this is the real weakest link" BEFORE (or even without)
// the autopilot ever acting on it. Honest limitation, matching the
// Rotation Engine's own documented scope: only real held symbols that are
// ALSO in the live watchlist get a real quote to score against — a
// held-but-unwatched symbol has no real current data here to score
// fairly, so it's silently excluded from "weakest," never guessed.
export default function ActivePositionsCard({ C, MONO, SANS, setTerminalSymbol, setActiveTab, watchlistData, macroData }) {
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

  // Real weakest-position read — same computeGreenLight/findWeakestPosition
  // AutoPilotEngine.jsx's live rotation uses, only over positions with a
  // real current watchlist quote (rest are honestly unscored, not guessed).
  const spyQ = (macroData || []).find(m => m.symbol === "SPY") || (watchlistData || []).find(w => w.symbol === "SPY");
  const spyChg = Number(spyQ?.changesPercentage || 0);
  const regimeScore = (macroData || []).length ? computeRegime(macroData)?.score ?? null : null;
  const scoredOpen = positions
    .map(p => {
      const wq = (watchlistData || []).find(w => w.symbol === p.symbol);
      if (!wq) return null;
      const pgl = computeGreenLight(wq, spyChg, null, regimeScore);
      return { symbol: p.symbol, quality: pgl.aScore };
    })
    .filter(Boolean);
  const weakest = positions.length >= 2 ? findWeakestPosition(scoredOpen) : null;

  const num = { fontVariantNumeric: "tabular-nums" };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: C.shadow, padding: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: C.textDim, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 10 }}>
        Active Positions {positions.length > 0 && <span style={{ fontWeight: 400, textTransform: "none" }}>· {positions.length}</span>}
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
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, display: "flex", alignItems: "center", gap: 6 }}>
                    {p.symbol}
                    {weakest?.symbol === p.symbol && (
                      <span title="Lowest real Green Light quality score among your open, watchlist-scored positions — the same read AutoPilot's rotation logic uses to decide what to close first."
                        style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: AI_ACTIONS.ROTATE.color, border: `1px solid ${AI_ACTIONS.ROTATE.color}`, borderRadius: 4, padding: "1px 5px" }}>
                        WEAKEST
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, ...num }}>{p.qty} sh @ ${Number(p.avgEntry || 0).toFixed(2)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: pl >= 0 ? C.green : C.red, ...num }}>
                    {pl >= 0 ? "+" : ""}${Math.abs(pl).toFixed(0)}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: pl >= 0 ? C.green : C.red, ...num }}>
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
