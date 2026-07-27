import { useState } from "react";
import { computeRegime, computeAPlusScore, computeNextAction } from "./market-helpers.js";
import { BEST_OPP_UNIVERSE } from "./terminal-panels.jsx";
import { addPaperTrade } from "./trading-utils.js";

// ── AI Trade Session — one-click "what would the AI do right now" tool ──
// Explicit user request: a button that "goes around the platform" to find a
// real setup, places a SIMULATED order with a stop + 3 targets, shows it —
// or honestly says "no trade at the moment" and why. A learning tool, not a
// real-money action: reuses the exact same real scan BestOpportunities/
// TopOpportunityCard already run (BEST_OPP_UNIVERSE + /api/market/trend-screen
// + computeAPlusScore ranking), and the exact same simulated-position engine
// Green Light's "⚡ PAPER BUY" button already uses (addPaperTrade, localStorage
// GL_TRADES_KEY, auto-managed by AutoPilotEngine's trailing-stop/scale-out
// loop) — nothing here touches Alpaca or real money.
export default function AiTradeSessionPanel({ C, MONO, SANS, macroData, statusBarH = 40, fabFading = false, isMobile = false, setActiveTab }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState("idle"); // idle | loading | ok | none | err
  const [result, setResult] = useState(null); // { row, next, stop, t1, t2, t3, placeResult, scannedCount }

  const runSession = () => {
    setState("loading");
    fetch("/api/market/trend-screen?symbols=" + encodeURIComponent(BEST_OPP_UNIVERSE.join(",")))
      .then(r => r.json())
      .then(j => {
        const regime = computeRegime(macroData);
        const allScored = (j.results || []).filter(r => !r.error);
        const qualified = allScored.filter(r => Number(r.entry) > Number(r.stop) && (r.passCount || 0) >= 6 && !r.extended && (r.rsRating || 0) >= 70);
        const top = qualified.map(r => ({ ...r, _aplus: computeAPlusScore(r, regime) })).sort((a, b) => b._aplus.score - a._aplus.score)[0] || null;

        if (!top) {
          setResult({ scannedCount: allScored.length, regime });
          setState("none");
          return;
        }

        const entry = Number(top.entry), stop = Number(top.stop);
        const riskPerShare = entry - stop;
        const t1 = +(entry + riskPerShare * 1).toFixed(2);
        const t2 = +(entry + riskPerShare * 2).toFixed(2);
        const t3 = +(entry + riskPerShare * 3).toFixed(2);
        const next = computeNextAction(top);
        const placeResult = addPaperTrade(top.symbol, entry, { stop, t1, t2, t3, glScore: top._aplus.score });

        setResult({ row: top, next, entry, stop, t1, t2, t3, placeResult, regime });
        setState("ok");
      })
      .catch(() => setState("err"));
  };

  const openPanel = () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && state === "idle") runSession();
  };

  const numCard = (label, val, col) => (
    <div style={{ flex: 1, minWidth: 72, textAlign: "center", background: `${col}12`, border: `1px solid ${col}44`, borderRadius: 8, padding: "8px 6px" }}>
      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, fontWeight: 800, letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: col }}>${val}</div>
    </div>
  );

  return (
    <>
      {/* FAB — left stack, paired with QuickTrade (the other action tool).
          Desktop stacks above it (same convention as FloatingChecklistButton
          stacking above Copilot on the right); mobile sits inline in the same
          row as QuickTrade, matching the tightened mobile spacing (QuickTrade
          left:10-52, this button left:60-102). */}
      <div style={{ position: "fixed", bottom: (isMobile ? 10 : 82) + statusBarH, left: isMobile ? 60 : 18, zIndex: 8500 }}>
        <button
          onClick={openPanel}
          title="AI Trade Session — learning mode, simulated only"
          style={{ width: isMobile ? 42 : 52, height: isMobile ? 42 : 52, borderRadius: "50%", border: "none", cursor: "pointer",
            background: "#7c5cff", color: "#fff", boxShadow: "0 4px 18px #7c5cff66",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: isMobile ? 17 : 20, transition: "opacity 0.2s",
            opacity: fabFading && !open ? 0 : 1, pointerEvents: fabFading && !open ? "none" : "auto" }}>
          {open ? "✕" : "🎓"}
        </button>
      </div>

      {open && (
        <div style={{ position: "fixed", bottom: (isMobile ? 62 : 144) + statusBarH, left: isMobile ? 10 : 18, zIndex: 8500,
          width: "min(360px, 92vw)", maxHeight: "min(560px, 70vh)", display: "flex", flexDirection: "column",
          background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: "0 10px 40px rgba(0,0,0,0.4)", overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: "#7c5cff" }}>🎓 AI TRADE SESSION</div>
              <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim }}>learning mode — simulated only</div>
            </div>
            <button onClick={runSession} disabled={state === "loading"}
              style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, border: "1px solid #7c5cff66", background: "#7c5cff18", color: "#7c5cff",
                borderRadius: 6, padding: "6px 10px", cursor: state === "loading" ? "default" : "pointer", whiteSpace: "nowrap", opacity: state === "loading" ? 0.6 : 1 }}>
              {state === "loading" ? "SCANNING…" : "▶ RUN AGAIN"}
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            {state === "loading" && (
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center", padding: "20px 0" }}>
                Scanning {BEST_OPP_UNIVERSE.length} leaders for a real setup…
              </div>
            )}

            {state === "err" && (
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.red, textAlign: "center", padding: "20px 0" }}>
                ⚠ Scan failed — try again shortly.
              </div>
            )}

            {state === "none" && result && (
              <div style={{ textAlign: "center", padding: "20px 8px" }}>
                <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text, marginBottom: 8 }}>No trade at the moment</div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, lineHeight: 1.6 }}>
                  Scanned {result.scannedCount} leaders — 0 cleared the real trend-template + RS ≥ 70 bar right now.
                  Regime is {result.regime.label} ({result.regime.score}/100). Cash is a position — no rush.
                </div>
              </div>
            )}

            {state === "ok" && result && (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.text }}>{result.row.symbol}</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{result.row.passCount}/8 template · RS {result.row.rsRating}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span title={result.row._aplus.reasons.join(" · ")} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: "#fff", cursor: "help",
                      background: result.row._aplus.score >= 80 ? "#0d9465" : result.row._aplus.score >= 60 ? "#d6a312" : "#c8282a", borderRadius: 5, padding: "3px 8px" }}>
                      A+ {result.row._aplus.score}
                    </span>
                    <span title={result.next.reason} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: "#fff", cursor: "help",
                      background: result.next.color, borderRadius: 5, padding: "3px 8px" }}>
                      {result.next.action}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {numCard("ENTRY", result.entry, C.accent)}
                  {numCard("STOP", result.stop, C.red)}
                  {numCard("T1 (1R)", result.t1, C.green)}
                  {numCard("T2 (2R)", result.t2, C.green)}
                  {numCard("T3 (3R)", result.t3, C.green)}
                </div>

                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, fontWeight: 800, letterSpacing: "0.08em", marginBottom: 6 }}>WHY THIS ONE</div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontFamily: SANS, fontSize: 12, color: C.textSec, lineHeight: 1.6 }}>
                    {result.row._aplus.reasons.slice(0, 5).map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>

                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, textAlign: "center", padding: "8px 0",
                  color: result.placeResult === "DUP" ? C.amber : result.placeResult === "OK" ? C.green : C.red }}>
                  {result.placeResult === "OK" && `✅ Simulated position opened in ${result.row.symbol}`}
                  {result.placeResult === "DUP" && `Already have an open simulated position in ${result.row.symbol}`}
                  {!result.placeResult && "⚠ Could not open the simulated position"}
                </div>

                <button onClick={() => setActiveTab && setActiveTab("mytrades")}
                  style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, border: `1px solid ${C.border}`, background: C.surface, color: C.textSec,
                    borderRadius: 8, padding: "8px 0", cursor: "pointer" }}>
                  View in My Trades
                </button>
              </>
            )}
          </div>

          <div style={{ padding: "8px 14px", borderTop: `1px solid ${C.border}`, fontFamily: SANS, fontSize: 10, color: C.textDim, textAlign: "center" }}>
            Simulated — not a real order. Auto-managed with a trailing stop + 3 scale-out targets, same engine as Green Light's Paper Buy.
          </div>
        </div>
      )}
    </>
  );
}
