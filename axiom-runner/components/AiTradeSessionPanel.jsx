import { useState, useEffect, useRef } from "react";
import { computeRegime, computeAPlusScore, computeNextAction } from "./market-helpers.js";
import { BEST_OPP_UNIVERSE } from "./terminal-panels.jsx";
import { addPaperTrade } from "./trading-utils.js";

// ── AI Trade Session — one click, then it runs itself while you watch ──
// Follow-up request (2026-07-27): "one click and tool do the rest
// automatically — check market, news, check trades, place trades if any —
// all these happening im watching". So beyond the earlier guided-tour
// rewrite (which still required a manual "Continue" click per step), this
// makes the whole sequence self-advancing: Market -> News -> Scan for
// setups -> Place the trade, each step showing for a readable pause before
// automatically moving to the next and navigating (setActiveTab) to the
// real screen for that step. A manual "Skip" and "End Session" stay
// available for anyone who doesn't want to wait out the pauses. Signal/
// order logic is unchanged from before: real BEST_OPP_UNIVERSE +
// trend-screen + A+ Score ranking (same as Best Opportunities), real
// addPaperTrade (same engine as Green Light's Paper Buy, auto-managed
// afterward by AutoPilotEngine). Nothing here touches Alpaca or real money.
const PAUSE_MARKET = 3500;
const PAUSE_NEWS = 4000;
const PAUSE_RESULT = 4500;
const PAUSE_END = 6000;

export default function AiTradeSessionPanel({ C, MONO, SANS, macroData, newsData, statusBarH = 40, fabFading = false, isMobile = false, activeTab, setActiveTab, topOffset = 64 }) {
  // step: 0 idle | 1 market | 2 news | 3 scanning | 4 trade placed
  const [step, setStep] = useState(0);
  const [startTab, setStartTab] = useState(null);
  const [scanState, setScanState] = useState("idle"); // idle | loading | ok | none | err
  const [scan, setScan] = useState(null);
  const [trade, setTrade] = useState(null);
  const endedRef = useRef(true);
  const timerRef = useRef(null);

  const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };

  const endSession = () => {
    endedRef.current = true;
    clearTimer();
    setStep(0); setScanState("idle"); setScan(null); setTrade(null);
    if (startTab && setActiveTab) setActiveTab(startTab);
    setStartTab(null);
  };

  const goToPlaceTrade = (row) => {
    if (endedRef.current) return;
    const entry = Number(row.entry), stop = Number(row.stop);
    const riskPerShare = entry - stop;
    const t1 = +(entry + riskPerShare * 1).toFixed(2);
    const t2 = +(entry + riskPerShare * 2).toFixed(2);
    const t3 = +(entry + riskPerShare * 3).toFixed(2);
    const placeResult = addPaperTrade(row.symbol, entry, { stop, t1, t2, t3, glScore: row._aplus.score });
    setTrade({ entry, stop, t1, t2, t3, placeResult });
    setStep(4);
    if (setActiveTab) setActiveTab("mytrades");
    timerRef.current = setTimeout(() => { if (!endedRef.current) endSession(); }, PAUSE_END);
  };

  const goToScan = () => {
    if (endedRef.current) return;
    setStep(3);
    setScanState("loading");
    if (setActiveTab) setActiveTab("best-opportunities");
    fetch("/api/market/trend-screen?symbols=" + encodeURIComponent(BEST_OPP_UNIVERSE.join(",")))
      .then(r => r.json())
      .then(j => {
        if (endedRef.current) return;
        const regime = computeRegime(macroData);
        const allScored = (j.results || []).filter(r => !r.error);
        const qualified = allScored.filter(r => Number(r.entry) > Number(r.stop) && (r.passCount || 0) >= 6 && !r.extended && (r.rsRating || 0) >= 70);
        const top = qualified.map(r => ({ ...r, _aplus: computeAPlusScore(r, regime) })).sort((a, b) => b._aplus.score - a._aplus.score)[0] || null;
        if (!top) {
          setScan({ scannedCount: allScored.length, regime });
          setScanState("none");
          timerRef.current = setTimeout(() => { if (!endedRef.current) endSession(); }, PAUSE_RESULT);
          return;
        }
        setScan({ row: top, next: computeNextAction(top), regime });
        setScanState("ok");
        timerRef.current = setTimeout(() => { if (!endedRef.current) goToPlaceTrade(top); }, PAUSE_RESULT);
      })
      .catch(() => { if (!endedRef.current) setScanState("err"); });
  };

  const goToNews = () => {
    if (endedRef.current) return;
    setStep(2);
    if (setActiveTab) setActiveTab("news");
    timerRef.current = setTimeout(() => { if (!endedRef.current) goToScan(); }, PAUSE_NEWS);
  };

  const startSession = () => {
    if (step > 0) { endSession(); return; }
    endedRef.current = false;
    setStartTab(activeTab || null);
    if (setActiveTab) setActiveTab("market-pulse");
    setStep(1);
    timerRef.current = setTimeout(() => { if (!endedRef.current) goToNews(); }, PAUSE_MARKET);
  };

  useEffect(() => () => clearTimer(), []); // clear any pending timer on unmount

  const regime = computeRegime(macroData);
  const spyRow = (macroData || []).find(m => m.symbol === "SPY");
  const spyChg = Number(spyRow?.changesPercentage || 0);
  const headlines = (newsData || []).slice(0, 3).map(n => n.title || n.headline).filter(Boolean);

  const SkipBtn = ({ onClick }) => (
    <button onClick={onClick}
      style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, border: "1px solid #7c5cff66", background: "#7c5cff18", color: "#7c5cff",
        borderRadius: 8, padding: "9px 14px", cursor: "pointer", whiteSpace: "nowrap" }}>
      Skip →
    </button>
  );
  const EndBtn = () => (
    <button onClick={endSession}
      style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, border: `1px solid ${C.border}`, background: "transparent", color: C.textDim,
        borderRadius: 8, padding: "9px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
      ✕ End Session
    </button>
  );
  const StepLabel = ({ n, title }) => (
    <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 900, color: "#7c5cff", letterSpacing: "0.1em", marginBottom: 6 }}>
      STEP {n} OF 4 — {title}
    </div>
  );
  const Body = ({ children }) => (
    <div style={{ fontFamily: SANS, fontSize: isMobile ? 13 : 14, color: C.text, lineHeight: 1.6, marginBottom: 12 }}>{children}</div>
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
              <StepLabel n={1} title="CHECKING THE MARKET" />
              <Body>
                Regime is <b>{regime.label}</b> ({regime.score}/100). SPY {spyChg >= 0 ? "+" : ""}{spyChg.toFixed(2)}%
                {regime.vixVal ? ` · VIX ${regime.vixVal}` : ""}.{" "}
                {regime.label === "RED"
                  ? "Unfavorable conditions — let's see if anything still clears the bar."
                  : regime.label === "YELLOW"
                  ? "Mixed conditions — being selective about what qualifies."
                  : "Favorable conditions for new entries."}
              </Body>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <EndBtn />
                <SkipBtn onClick={goToNews} />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <StepLabel n={2} title="CHECKING THE NEWS" />
              <Body>
                {headlines.length > 0 ? (
                  <>Scanned {(newsData || []).length} recent headlines: {headlines.map((h, i) => (
                    <span key={i}>"{h.length > 70 ? h.slice(0, 70) + "…" : h}"{i < headlines.length - 1 ? " · " : ""}</span>
                  ))}</>
                ) : (
                  "No fresh headlines loaded yet — moving on to the scan."
                )}
              </Body>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <EndBtn />
                <SkipBtn onClick={goToScan} />
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <StepLabel n={3} title="SCANNING FOR SETUPS" />
              {scanState === "loading" && (
                <Body><span style={{ color: C.textDim }}>Scanning {BEST_OPP_UNIVERSE.length} leaders for a real setup…</span></Body>
              )}
              {scanState === "err" && (
                <Body><span style={{ color: C.red }}>⚠ Scan failed — try again shortly.</span></Body>
              )}
              {scanState === "ok" && scan && (
                <Body>
                  <b>{scan.row.symbol}</b> clears the {scan.row.passCount}/8 trend template with RS {scan.row.rsRating} —
                  A+ Score {scan.row._aplus.score}. This is the real setup — placing a simulated trade next.
                </Body>
              )}
              {scanState === "none" && scan && (
                <Body>
                  Scanned {scan.scannedCount} leaders — 0 cleared the real trend-template + RS ≥ 70 bar right now.
                  <b> No trade at the moment</b> — cash is a position. Ending the session.
                </Body>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <EndBtn />
                {scanState === "ok" && <SkipBtn onClick={() => goToPlaceTrade(scan.row)} />}
                {scanState === "err" && <SkipBtn onClick={goToScan} />}
              </div>
            </>
          )}

          {step === 4 && trade && (
            <>
              <StepLabel n={4} title="SIMULATED TRADE PLACED" />
              <Body>
                Entry ${trade.entry} · Stop ${trade.stop} · Targets 1R/2R/3R = ${trade.t1} / ${trade.t2} / ${trade.t3}.
              </Body>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, marginBottom: 12,
                color: trade.placeResult === "DUP" ? C.amber : trade.placeResult === "OK" ? C.green : C.red }}>
                {trade.placeResult === "OK" && `✅ Simulated position opened in ${scan.row.symbol}.`}
                {trade.placeResult === "DUP" && `Already had an open simulated position in ${scan.row.symbol} — no duplicate opened.`}
                {!trade.placeResult && "⚠ Could not open the simulated position."}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginBottom: 14 }}>
                Simulated — not a real order. Auto-managed with a trailing stop + 3 scale-out targets from here, same engine as Green Light's Paper Buy. Ending the session shortly.
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
