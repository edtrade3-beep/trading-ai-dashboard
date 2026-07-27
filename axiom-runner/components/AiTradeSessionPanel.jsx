import { useState } from "react";
import { computeRegime, computeAPlusScore, computeNextAction } from "./market-helpers.js";
import { BEST_OPP_UNIVERSE } from "./terminal-panels.jsx";
import { addPaperTrade } from "./trading-utils.js";

// ── AI Trade Session — a guided tour, not a static answer card ──
// Explicit user request (2026-07-27): click it and it should "take over my
// screen" — walk through how to check the market, how to check for a setup,
// and how to place a trade, teaching the real workflow, not just hand back a
// final number. So this drives setActiveTab through the app's own real
// screens (Market Pulse -> Best Opportunities -> My Trades), narrating each
// step in a fixed banner that survives the navigation (mounted at the top
// level like the other floating tools, outside any tab's content block).
// The underlying signal/order logic is unchanged and still 100% real/
// simulated: same BEST_OPP_UNIVERSE + trend-screen + A+ Score ranking
// Best Opportunities/TopOpportunityCard already run, same addPaperTrade
// engine (localStorage GL_TRADES_KEY) Green Light's Paper Buy already uses,
// auto-managed afterward by AutoPilotEngine. Nothing here touches Alpaca or
// real money.
export default function AiTradeSessionPanel({ C, MONO, SANS, macroData, statusBarH = 40, fabFading = false, isMobile = false, activeTab, setActiveTab, topOffset = 64 }) {
  // step: 0 idle | 1 checking market | 2 scanning for setups | 3 placing the trade | 4 no trade found
  const [step, setStep] = useState(0);
  const [startTab, setStartTab] = useState(null);
  const [scanState, setScanState] = useState("idle"); // idle | loading | ok | none | err
  const [scan, setScan] = useState(null); // { row, scannedCount }
  const [trade, setTrade] = useState(null); // { entry, stop, t1, t2, t3, placeResult }

  const endSession = () => {
    setStep(0); setScanState("idle"); setScan(null); setTrade(null);
    if (startTab && setActiveTab) setActiveTab(startTab);
    setStartTab(null);
  };

  const startSession = () => {
    if (step > 0) { endSession(); return; }
    setStartTab(activeTab || null);
    if (setActiveTab) setActiveTab("market-pulse");
    setStep(1);
  };

  const goToScan = () => {
    setStep(2);
    setScanState("loading");
    if (setActiveTab) setActiveTab("best-opportunities");
    fetch("/api/market/trend-screen?symbols=" + encodeURIComponent(BEST_OPP_UNIVERSE.join(",")))
      .then(r => r.json())
      .then(j => {
        const regime = computeRegime(macroData);
        const allScored = (j.results || []).filter(r => !r.error);
        const qualified = allScored.filter(r => Number(r.entry) > Number(r.stop) && (r.passCount || 0) >= 6 && !r.extended && (r.rsRating || 0) >= 70);
        const top = qualified.map(r => ({ ...r, _aplus: computeAPlusScore(r, regime) })).sort((a, b) => b._aplus.score - a._aplus.score)[0] || null;
        if (!top) {
          setScan({ scannedCount: allScored.length, regime });
          setScanState("none");
          return;
        }
        setScan({ row: top, next: computeNextAction(top), regime });
        setScanState("ok");
      })
      .catch(() => setScanState("err"));
  };

  const goToPlaceTrade = () => {
    const row = scan.row;
    const entry = Number(row.entry), stop = Number(row.stop);
    const riskPerShare = entry - stop;
    const t1 = +(entry + riskPerShare * 1).toFixed(2);
    const t2 = +(entry + riskPerShare * 2).toFixed(2);
    const t3 = +(entry + riskPerShare * 3).toFixed(2);
    const placeResult = addPaperTrade(row.symbol, entry, { stop, t1, t2, t3, glScore: row._aplus.score });
    setTrade({ entry, stop, t1, t2, t3, placeResult });
    setStep(3);
    if (setActiveTab) setActiveTab("mytrades");
  };

  const regime = computeRegime(macroData);
  const spyRow = (macroData || []).find(m => m.symbol === "SPY");
  const spyChg = Number(spyRow?.changesPercentage || 0);

  const Continue = ({ onClick, label = "Continue →", disabled }) => (
    <button onClick={onClick} disabled={disabled}
      style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, border: "none", background: disabled ? "#7c5cff66" : "#7c5cff", color: "#fff",
        borderRadius: 8, padding: "9px 18px", cursor: disabled ? "default" : "pointer", whiteSpace: "nowrap" }}>
      {label}
    </button>
  );
  const EndBtn = () => (
    <button onClick={endSession}
      style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, border: `1px solid ${C.border}`, background: "transparent", color: C.textDim,
        borderRadius: 8, padding: "9px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
      ✕ End Session
    </button>
  );
  const StepLabel = ({ n, of, title }) => (
    <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 900, color: "#7c5cff", letterSpacing: "0.1em", marginBottom: 6 }}>
      STEP {n} OF {of} — {title}
    </div>
  );

  return (
    <>
      {/* FAB — left stack, paired with QuickTrade (the other action tool). */}
      <div style={{ position: "fixed", bottom: (isMobile ? 10 : 82) + statusBarH, left: isMobile ? 60 : 18, zIndex: 8500 }}>
        <button
          onClick={startSession}
          title="AI Trade Session — learning mode, simulated only"
          style={{ width: isMobile ? 42 : 52, height: isMobile ? 42 : 52, borderRadius: "50%", border: "none", cursor: "pointer",
            background: "#7c5cff", color: "#fff", boxShadow: "0 4px 18px #7c5cff66",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: isMobile ? 17 : 20, transition: "opacity 0.2s",
            opacity: fabFading && step === 0 ? 0 : 1, pointerEvents: fabFading && step === 0 ? "none" : "auto" }}>
          {step > 0 ? "✕" : "🎓"}
        </button>
      </div>

      {step > 0 && (
        <div style={{ position: "fixed", top: topOffset + 10, left: "50%", transform: "translateX(-50%)", zIndex: 9200,
          width: "min(560px, 92vw)", background: C.bg, border: "2px solid #7c5cff", borderRadius: 14,
          boxShadow: "0 14px 40px rgba(0,0,0,0.35)", padding: isMobile ? 14 : 18 }}>

          {step === 1 && (
            <>
              <StepLabel n={1} of={3} title="CHECKING THE MARKET" />
              <div style={{ fontFamily: SANS, fontSize: isMobile ? 13 : 14, color: C.text, lineHeight: 1.6, marginBottom: 12 }}>
                Regime is <b>{regime.label}</b> ({regime.score}/100). SPY {spyChg >= 0 ? "+" : ""}{spyChg.toFixed(2)}%
                {regime.vixVal ? ` · VIX ${regime.vixVal}` : ""}.{" "}
                {regime.label === "RED"
                  ? "Unfavorable conditions — let's see if anything still clears the bar."
                  : regime.label === "YELLOW"
                  ? "Mixed conditions — being selective about what qualifies."
                  : "Favorable conditions for new entries."}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <EndBtn />
                <Continue onClick={goToScan} />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <StepLabel n={2} of={3} title="SCANNING FOR SETUPS" />
              {scanState === "loading" && (
                <div style={{ fontFamily: SANS, fontSize: isMobile ? 13 : 14, color: C.textDim, marginBottom: 12 }}>
                  Scanning {BEST_OPP_UNIVERSE.length} leaders for a real setup…
                </div>
              )}
              {scanState === "err" && (
                <div style={{ fontFamily: SANS, fontSize: 14, color: C.red, marginBottom: 12 }}>⚠ Scan failed — try again shortly.</div>
              )}
              {scanState === "ok" && scan && (
                <div style={{ fontFamily: SANS, fontSize: isMobile ? 13 : 14, color: C.text, lineHeight: 1.6, marginBottom: 12 }}>
                  <b>{scan.row.symbol}</b> clears the {scan.row.passCount}/8 trend template with RS {scan.row.rsRating} —
                  A+ Score {scan.row._aplus.score}. This is the real setup.
                </div>
              )}
              {scanState === "none" && scan && (
                <div style={{ fontFamily: SANS, fontSize: isMobile ? 13 : 14, color: C.text, lineHeight: 1.6, marginBottom: 12 }}>
                  Scanned {scan.scannedCount} leaders — 0 cleared the real trend-template + RS ≥ 70 bar right now.
                  <b> No trade at the moment</b> — cash is a position.
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <EndBtn />
                {scanState === "ok" && <Continue onClick={goToPlaceTrade} label="Place simulated trade →" />}
                {scanState === "err" && <Continue onClick={goToScan} label="Retry" />}
              </div>
            </>
          )}

          {step === 3 && trade && (
            <>
              <StepLabel n={3} of={3} title="SIMULATED TRADE PLACED" />
              <div style={{ fontFamily: SANS, fontSize: isMobile ? 13 : 14, color: C.text, lineHeight: 1.6, marginBottom: 8 }}>
                Entry ${trade.entry} · Stop ${trade.stop} · Targets 1R/2R/3R = ${trade.t1} / ${trade.t2} / ${trade.t3}.
              </div>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, marginBottom: 12,
                color: trade.placeResult === "DUP" ? C.amber : trade.placeResult === "OK" ? C.green : C.red }}>
                {trade.placeResult === "OK" && `✅ Simulated position opened in ${scan.row.symbol}.`}
                {trade.placeResult === "DUP" && `Already had an open simulated position in ${scan.row.symbol} — no duplicate opened.`}
                {!trade.placeResult && "⚠ Could not open the simulated position."}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginBottom: 14 }}>
                Simulated — not a real order. Auto-managed with a trailing stop + 3 scale-out targets from here, same engine as Green Light's Paper Buy.
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button onClick={endSession}
                  style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, border: "none", background: "#7c5cff", color: "#fff",
                    borderRadius: 8, padding: "9px 18px", cursor: "pointer" }}>
                  Done — back to where I was
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
