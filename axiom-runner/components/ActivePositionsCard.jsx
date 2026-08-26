import { useState, useEffect } from "react";
import { computeRegime } from "./market-helpers.js";
import { computeGreenLight } from "./trading-utils.js";
import { findWeakestPosition } from "./portfolio-rotation-engine.js";
import { AI_ACTIONS } from "./ai-actions.js";

// Day-trade HOLD/TRAIL/TAKE_PARTIAL/EXIT badge — "AM Trading — Final
// Trading Logic Redesign" Phase 2+3 (explicit user request, 2026-08-19).
// Real, server-computed (src/routes/alpaca.js's dayTradeState overlay on
// /api/alpaca/positions), advisory only — this badge never triggers any
// order action, purely informational. HOLD is neutral (not exciting —
// it's the default, "nothing to do" state); TRAIL/TAKE_PARTIAL/EXIT use
// the same green/amber/red semantic tokens Light Box's own states use.
const DAYTRADE_STATE_LABEL = { HOLD: "HOLD", TRAIL: "TRAIL", TAKE_PARTIAL: "PARTIAL", EXIT: "EXIT" };
function DAYTRADE_STATE_COLOR(C, state) {
  if (state === "TRAIL") return C.green;
  if (state === "TAKE_PARTIAL") return C.amber;
  if (state === "EXIT") return C.red;
  return C.textDim; // HOLD
}

// Post-entry Edge Monitoring badge (Phase 3 Tier B, 2026-08-26, spec
// Parts 24-26) — real, server-computed (src/routes/alpaca.js's
// edgeMonitor overlay on /api/alpaca/positions, position-edge-store.js's
// classifyEdgeChange diffing the live Opportunity Engine score against a
// real snapshot captured at the moment this position was actually
// bought). Only rendered when a real entry snapshot exists — a position
// opened before this feature existed or outside the app honestly shows
// nothing here, never a fabricated "STABLE."
const EDGE_MONITOR_META = {
  STRENGTHENING: { icon: "🟢", label: "EDGE ↑", color: "#0d9465" },
  STABLE: { icon: "🟢", label: "EDGE STABLE", color: "#0d9465" },
  WEAKENING: { icon: "🟡", label: "EDGE ↓", color: "#d6a312" },
  UNDER_PRESSURE: { icon: "🟠", label: "UNDER PRESSURE", color: "#e08a1e" },
  INVALIDATED: { icon: "🔴", label: "INVALIDATED", color: "#c8282a" },
};

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
            // Live R-multiple readout (explicit user request, 2026-08-14:
            // "currently at 1.8R of your 3R target" mid-trade, not just a
            // Telegram receipt after the fact). Real risk unit = |planned
            // entry - planned stop| from the /api/alpaca/positions overlay
            // above; honestly hidden (not "0R") when this position has no
            // real matching plan on file.
            const risk = (p.plannedEntry > 0 && p.plannedStop > 0) ? Math.abs(p.plannedEntry - p.plannedStop) : null;
            const rNow = risk ? (Number(p.current || 0) - p.plannedEntry) / risk : null;
            const rTarget = (risk && p.plannedTarget > 0) ? (p.plannedTarget - p.plannedEntry) / risk : null;
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
                    {p.dayTradeState && (
                      <span title={p.dayTradeReason ? `${p.dayTradeReason} (real-time 15m read, advisory only — not auto-executed)` : undefined}
                        style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: DAYTRADE_STATE_COLOR(C, p.dayTradeState),
                          border: `1px solid ${DAYTRADE_STATE_COLOR(C, p.dayTradeState)}`, borderRadius: 4, padding: "1px 5px" }}>
                        {DAYTRADE_STATE_LABEL[p.dayTradeState] || p.dayTradeState}
                      </span>
                    )}
                    {p.edgeMonitor && EDGE_MONITOR_META[p.edgeMonitor.status] && (
                      <span title={`Entry score ${p.edgeMonitor.entryScore} -> now ${p.edgeMonitor.currentScore} (${p.edgeMonitor.delta > 0 ? "+" : ""}${p.edgeMonitor.delta}) — is the original thesis still working?`}
                        style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: EDGE_MONITOR_META[p.edgeMonitor.status].color,
                          border: `1px solid ${EDGE_MONITOR_META[p.edgeMonitor.status].color}`, borderRadius: 4, padding: "1px 5px" }}>
                        {EDGE_MONITOR_META[p.edgeMonitor.status].icon} {EDGE_MONITOR_META[p.edgeMonitor.status].label}
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
                  {rNow != null && (
                    <div title={`Real risk unit $${risk.toFixed(2)}/sh — from plan entry $${p.plannedEntry.toFixed(2)} / stop $${p.plannedStop.toFixed(2)}${p.plannedTarget ? ` / target $${p.plannedTarget.toFixed(2)}` : ""}`}
                      style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim, ...num, marginTop: 1 }}>
                      {rNow >= 0 ? "+" : ""}{rNow.toFixed(1)}R{rTarget != null ? ` / ${rTarget.toFixed(1)}R` : ""}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
