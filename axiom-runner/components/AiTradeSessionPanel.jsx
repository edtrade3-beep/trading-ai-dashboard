import { useState, useEffect, useRef } from "react";
import { computeRegime, computeAPlusScore, computeNextAction } from "./market-helpers.js";
import { BEST_OPP_UNIVERSE } from "./terminal-panels.jsx";

// ── AI Trade Session — one click, then it runs itself while you watch ──
// Follow-up feedback (2026-07-27): after the earlier localStorage-only
// simulated version, the user said "not satisfied" — specifically (1) same
// stock every run, (2) too slow, (3) "not a real trade". Confirmed via
// follow-up questions: this should place a REAL order through the user's
// actual Alpaca PAPER account (same account Autopilot/Quick Trade already
// use — real broker mechanics, no real money, but a genuine order that
// shows up in Alpaca's own history and the real Performance Report Card),
// show the top 3 real candidates for variety, and move faster. Real Alpaca
// bracket orders only support one stop + one take-profit leg (confirmed —
// no 3-way scale-out exists anywhere in this app for real positions), so
// T2 (2R) is the real take-profit; T1/T3 stay as reference levels only.
// Scan shows 3 candidates; only the #1 ranked one gets a real order.
// Reuses the real, already-gated /api/quick-trade/precheck + /order routes
// (same risk gate — account health, daily loss breaker, open risk %,
// sector cap, market hours — Quick Trade itself uses). Auth is automatic:
// a global fetch wrapper (axiom-live.jsx) attaches x-api-token from
// localStorage.axiom_api_token to every /api/* call.
const PAUSE_MARKET = 1800;
const PAUSE_NEWS = 2000;
const PAUSE_RESULT = 2200;
const PAUSE_END = 4000;

export default function AiTradeSessionPanel({ C, MONO, SANS, macroData, newsData, statusBarH = 40, fabFading = false, isMobile = false, activeTab, setActiveTab, topOffset = 64 }) {
  // step: 0 idle | 1 market | 2 news | 3 scanning | 4 trade placed
  const [step, setStep] = useState(0);
  const [startTab, setStartTab] = useState(null);
  const [scanState, setScanState] = useState("idle"); // idle | loading | ok | none | err
  const [scan, setScan] = useState(null); // { top: [row,row,row], scannedCount, regime }
  const [tradeState, setTradeState] = useState("idle"); // idle | checking | placed | dup | blocked | err
  const [trade, setTrade] = useState(null); // { entry, stop, t1, t2, t3, qty, orderId, reason }
  const endedRef = useRef(true);
  const timerRef = useRef(null);

  const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };

  const endSession = () => {
    endedRef.current = true;
    clearTimer();
    setStep(0); setScanState("idle"); setScan(null); setTradeState("idle"); setTrade(null);
    if (startTab && setActiveTab) setActiveTab(startTab);
    setStartTab(null);
  };

  const goToPlaceTrade = async (row) => {
    if (endedRef.current) return;
    setStep(4);
    setTradeState("checking");
    if (setActiveTab) setActiveTab("mytrades");

    const entry = Number(row.entry), stop = Number(row.stop);
    const riskPerShare = entry - stop;
    const t1 = +(entry + riskPerShare * 1).toFixed(2);
    const t2 = +(entry + riskPerShare * 2).toFixed(2);
    const t3 = +(entry + riskPerShare * 3).toFixed(2);
    const base = { entry, stop, t1, t2, t3 };

    try {
      const posRes = await fetch("/api/alpaca/positions");
      if (posRes.status === 401) { setTrade(base); setTradeState("noauth"); return; }
      const positions = await posRes.json().catch(() => []);
      if (endedRef.current) return;
      if (Array.isArray(positions) && positions.some(p => p.symbol === row.symbol)) {
        setTrade(base); setTradeState("dup"); return;
      }

      const preRes = await fetch(`/api/quick-trade/precheck?symbol=${encodeURIComponent(row.symbol)}&riskPct=1&entry=${entry}&stop=${stop}&side=long`);
      if (preRes.status === 401) { setTrade(base); setTradeState("noauth"); return; }
      const pre = await preRes.json().catch(() => ({}));
      if (endedRef.current) return;
      if (!pre.ok) { setTrade({ ...base, reason: pre.reason || pre.error || "real risk gate blocked this trade" }); setTradeState("blocked"); return; }
      const qty = pre.sizing?.qty || 0;
      if (!(qty > 0)) { setTrade({ ...base, reason: "real position size came out to 0 shares" }); setTradeState("blocked"); return; }

      const orderRes = await fetch("/api/quick-trade/order", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: row.symbol, qty, side: "buy", type: "market", stopLoss: stop, takeProfit: t2 }),
      });
      if (orderRes.status === 401) { setTrade(base); setTradeState("noauth"); return; }
      const order = await orderRes.json().catch(() => ({}));
      if (endedRef.current) return;
      if (!order.ok) { setTrade({ ...base, reason: order.reason || order.error || "order was rejected" }); setTradeState("blocked"); return; }
      setTrade({ ...base, qty, orderId: order.id || order.order?.id });
      setTradeState("placed");
      timerRef.current = setTimeout(() => { if (!endedRef.current) endSession(); }, PAUSE_END);
    } catch {
      if (!endedRef.current) { setTrade(base); setTradeState("err"); }
    }
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
        const ranked = qualified.map(r => ({ ...r, _aplus: computeAPlusScore(r, regime) })).sort((a, b) => b._aplus.score - a._aplus.score);
        const top = ranked.slice(0, 3);
        if (!top.length) {
          setScan({ scannedCount: allScored.length, regime });
          setScanState("none");
          timerRef.current = setTimeout(() => { if (!endedRef.current) endSession(); }, PAUSE_RESULT);
          return;
        }
        setScan({ top, next: computeNextAction(top[0]), regime });
        setScanState("ok");
        timerRef.current = setTimeout(() => { if (!endedRef.current) goToPlaceTrade(top[0]); }, PAUSE_RESULT);
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
  const candCard = (row) => (
    <div key={row.symbol} style={{ flex: 1, minWidth: 100, textAlign: "center", background: `${C.accent}0d`, border: `1px solid ${C.accent}33`, borderRadius: 8, padding: "8px 6px" }}>
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.text }}>{row.symbol}</div>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: row._aplus.score >= 80 ? "#0d9465" : row._aplus.score >= 60 ? "#d6a312" : "#c8282a" }}>A+ {row._aplus.score}</div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 2 }}>${row.entry} → ${row.stop}</div>
    </div>
  );

  return (
    <>
      {/* FAB — left stack, paired with QuickTrade (the other action tool). */}
      <div style={{ position: "fixed", bottom: (isMobile ? 10 : 82) + statusBarH, left: isMobile ? 60 : 18, zIndex: 8500 }}>
        <button
          onClick={startSession}
          title="AI Trade Session — places a real order on your Alpaca paper account"
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
                  : regime.label === "ORANGE"
                  ? "Deteriorating conditions — raising the bar, most setups won't qualify."
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
                <>
                  <Body>
                    Top {scan.top.length} real candidate{scan.top.length > 1 ? "s" : ""} right now — placing a real order on <b>{scan.top[0].symbol}</b>, the #1 ranked pick.
                  </Body>
                  <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>{scan.top.map(candCard)}</div>
                </>
              )}
              {scanState === "none" && scan && (
                <Body>
                  Scanned {scan.scannedCount} leaders — 0 cleared the real trend-template + RS ≥ 70 bar right now.
                  <b> No trade at the moment</b> — cash is a position. Ending the session.
                </Body>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <EndBtn />
                {scanState === "ok" && <SkipBtn onClick={() => goToPlaceTrade(scan.top[0])} />}
                {scanState === "err" && <SkipBtn onClick={goToScan} />}
              </div>
            </>
          )}

          {step === 4 && trade && (
            <>
              <StepLabel n={4} title="PLACING THE TRADE" />
              <Body>
                Entry ${trade.entry} · Stop ${trade.stop} · Real target (2R) ${trade.t2} <span style={{ color: C.textDim }}>(1R ${trade.t1} / 3R ${trade.t3} for reference)</span>.
              </Body>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, marginBottom: 12,
                color: tradeState === "placed" ? C.green : tradeState === "dup" ? C.amber : tradeState === "checking" ? C.textDim : C.red }}>
                {tradeState === "checking" && "Checking your real account and risk limits…"}
                {tradeState === "placed" && `✅ Real order placed — ${trade.qty} sh ${scan.top[0].symbol} on your Alpaca paper account${trade.orderId ? ` (order ${trade.orderId})` : ""}.`}
                {tradeState === "dup" && `You already hold a real position in ${scan.top[0].symbol} — no duplicate order placed.`}
                {tradeState === "blocked" && `⚠ Real order blocked: ${trade.reason}`}
                {tradeState === "noauth" && "⚠ Real order failed — add your API token in Green Light's 🔒 API TOKEN field first."}
                {tradeState === "err" && "⚠ Could not reach the order service — try again shortly."}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginBottom: 14 }}>
                Real order on your Alpaca <b>paper</b> account — no real money, but a genuine broker order, same account as Autopilot/Quick Trade.
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
