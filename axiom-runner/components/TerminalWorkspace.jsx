import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { C, MONO, SANS } from "./theme.js";
import { computeScores } from "./trading-utils.js";
import { STOCK_TO_SECTOR } from "./market-helpers.js";

export default function TerminalWorkspace({
  watchlistData, macroData, sectorData, newsData, alerts,
  selectedSymbol, onSelectSymbol, timeframe, onTimeframeChange,
  candleData, loadingCandles, terminalLayout, onLayoutChange,
  hotkeyProfile, onHotkeyProfileChange, drawTools, onDrawToolsChange,
  panelSymbols, onPanelSymbolChange, panelCandleMap, fundamentals, marketSession,
  onQuickLog, watchlistSymbols, onWatchlistChange,
}) {
  const selected = watchlistData.find((q) => q.symbol === selectedSymbol) || watchlistData[0] || null;

  // ── Watchlist add/remove ─────────────────────────────────────────────────
  const [wlAddInput, setWlAddInput] = useState("");
  const wlAddTicker = () => {
    const sym = wlAddInput.trim().toUpperCase().replace(/[^A-Z0-9.\-^]/g, "");
    if (!sym || !onWatchlistChange) return;
    const cur = watchlistSymbols || watchlistData.map(q => q.symbol);
    if (!cur.includes(sym)) onWatchlistChange([...cur, sym]);
    setWlAddInput("");
  };
  const wlRemoveTicker = (sym) => {
    if (!onWatchlistChange) return;
    const cur = watchlistSymbols || watchlistData.map(q => q.symbol);
    onWatchlistChange(cur.filter(s => s !== sym));
  };

  const [leftW, setLeftW] = useState(220);
  const [rightW, setRightW] = useState(340);
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);

  // ── Tablet detection inside Terminal ────────────────────────────────────────
  const [termIsTablet, setTermIsTablet] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768 && window.innerWidth <= 1200);
  useEffect(() => {
    const fn = () => setTermIsTablet(window.innerWidth >= 768 && window.innerWidth <= 1200);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  // ── Column resize — mouse + touch (iPad) ────────────────────────────────────
  useEffect(() => {
    if (!drag) return;
    const getX = (e) => e.touches ? e.touches[0].clientX : e.clientX;
    let lastX = null;

    const onMove = (e) => {
      const x = getX(e);
      if (lastX === null) { lastX = x; return; }
      const dx = x - lastX;
      lastX = x;
      if (drag === "left")  setLeftW(w  => Math.max(120, Math.min(400, w  + dx)));
      if (drag === "right") setRightW(w => Math.max(200, Math.min(600, w  - dx)));
    };
    const onUp = () => setDrag(null);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend",  onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend",  onUp);
    };
  }, [drag]);

  const [alertFormOpen, setAlertFormOpen] = useState(false);
  const [alertTarget, setAlertTarget] = useState("");
  const [alertDir, setAlertDir] = useState("above");
  const [alertSaving, setAlertSaving] = useState(false);
  const [orderType, setOrderType] = useState("market");
  const [orderSide, setOrderSide] = useState("buy");
  const [orderQty, setOrderQty] = useState("100");
  const [orderPrice, setOrderPrice] = useState("");
  const [orderTp, setOrderTp] = useState("");
  const [orderSl, setOrderSl] = useState("");
  const [orderTrailPct, setOrderTrailPct] = useState("2");
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderConfirmed, setOrderConfirmed] = useState(null);

  // ── Chart mode (canvas = interactive / finviz = image) ───────────────────
  const [chartMode, setChartMode] = useState("canvas");
  const [fvPeriod, setFvPeriod]   = useState("d");
  const [fvStats,  setFvStats]    = useState(null);
  const [fvLoading, setFvLoading] = useState(false);

  const loadFvStats = useCallback(async (sym) => {
    if (!sym) return;
    setFvLoading(true);
    try {
      const res  = await fetch(`/api/finviz/quote?symbol=${encodeURIComponent(sym)}`);
      const data = await res.json();
      if (res.ok) setFvStats(data);
    } catch {}
    finally { setFvLoading(false); }
  }, []);

  // Auto-load Finviz stats when switching to FV mode or symbol changes
  useEffect(() => {
    if (chartMode === "finviz" && selected?.symbol) loadFvStats(selected.symbol);
  }, [chartMode, selected?.symbol]); // eslint-disable-line

  // ── AI Insight ──────────────────────────────────────────────────────────────
  const [insightText, setInsightText]       = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightSymbol, setInsightSymbol]   = useState(null);
  const [insightAt, setInsightAt]           = useState(null);
  const insightPrevRef                       = useRef(null);

  const runInsight = useCallback(async (sym, price, change, scores) => {
    if (!sym || price <= 0) return;
    setInsightLoading(true);
    setInsightSymbol(sym);
    const priceFmt = price.toFixed(2);
    const chgFmt   = `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
    const score    = Number(scores?.composite || 50);
    const prompt   = `Give me a 2-3 sentence technical snapshot of ${sym} at $${priceFmt} (${chgFmt}). Composite score: ${score}/100. Include: current trend status, the single most critical price level right now, and a specific near-term target or support. Be direct and specific. No filler. End with one action bias word: BULLISH / BEARISH / NEUTRAL.`;
    try {
      const res  = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      const data = await res.json();
      if (res.ok && data.output) {
        setInsightText(data.output.trim());
      } else {
        throw new Error("no output");
      }
    } catch {
      // Heuristic fallback when AI not configured
      const dir  = change > 1.5 ? "bullish momentum" : change < -1.5 ? "bearish pressure" : "range consolidation";
      const bias = score >= 72 ? "BULLISH" : score <= 38 ? "BEARISH" : "NEUTRAL";
      const tgt  = (price * (change >= 0 ? 1.028 : 0.972)).toFixed(2);
      const sup  = (price * 0.968).toFixed(2);
      setInsightText(`${sym} in ${dir}, score ${score}/100. Key level: $${sup} support. Near-term target: $${tgt}. ${bias}`);
    } finally {
      setInsightAt(new Date().toLocaleTimeString());
      setInsightLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      if (drag === "left") setLeftW((w) => Math.max(170, Math.min(360, w + (e.movementX || 0))));
      if (drag === "right") setRightW((w) => Math.max(260, Math.min(520, w - (e.movementX || 0))));
    };
    const onUp = () => setDrag(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag]);

  // Auto-run AI Insight whenever the selected symbol changes
  useEffect(() => {
    if (!selected || selected.symbol === insightPrevRef.current) return;
    insightPrevRef.current = selected.symbol;
    const price = Number(selected.price || 0);
    const change = Number(selected.changesPercentage || 0);
    if (price > 0) runInsight(selected.symbol, price, change, computeScores(selected));
  }, [selected?.symbol]); // eslint-disable-line

  if (!selected) return null;
  const chg = selected.changesPercentage || 0;
  const scores = computeScores(selected);
  const rvol = selected.avgVolume ? (selected.volume / selected.avgVolume) : 0;
  const leaderTape = macroData.filter((q) => ["SPY", "QQQ", "IWM", "DIA", "UUP", "USO", "GLD", "TLT", "BTCUSD"].includes(q.symbol));
  const topNews = newsData.filter((n) => !selected?.symbol || n.ticker === selected.symbol).slice(0, 6);
  const terminalAlertMap = useMemo(() => {
    const m = new Map();
    (alerts || []).forEach((a) => {
      const prev = Number(m.get(a.symbol) || 0);
      m.set(a.symbol, Math.max(prev, Number(a.score || 0)));
    });
    return m;
  }, [alerts]);
  const terminalRankRows = useMemo(() => {
    const spy = Number(macroData.find((q) => q.symbol === "SPY")?.changesPercentage || 0);
    return [...(watchlistData || [])]
      .map((q) => {
        const s = computeScores(q);
        const rel = Number(q.changesPercentage || 0) - spy;
        const r = q.avgVolume ? (q.volume / q.avgVolume) : 0;
        const alertBoost = Number(terminalAlertMap.get(q.symbol) || 0) * 0.2;
        const rankScore = s.composite * 0.55 + s.tech * 0.25 + Math.max(-5, Math.min(5, rel)) * 3 + Math.max(0, Math.min(3, r - 1)) * 10 + alertBoost;
        return { ...q, s, rel, r, rankScore };
      })
      .sort((a, b) => b.rankScore - a.rankScore);
  }, [watchlistData, macroData, terminalAlertMap]);
  const executionRows = useMemo(() => {
    return terminalRankRows.slice(0, 6).map((q) => {
      const entry = Number(q.price || 0);
      const stop = entry > 0 ? entry * 0.97 : 0;
      const target = entry > 0 ? entry * 1.06 : 0;
      const rr = entry > stop ? (target - entry) / Math.max(0.01, entry - stop) : 0;
      const status = rr >= 1.8 && q.r >= 1.2 ? "TRIGGERED" : rr >= 1.3 ? "STALK" : "WAIT";
      return { symbol: q.symbol, entry, stop, target, rr, status, score: q.s.composite, rvol: q.r };
    });
  }, [terminalRankRows]);
  const terminalMacroMatrix = useMemo(() => {
    const getQ = (symbol) => macroData.find((m) => m.symbol === symbol) || null;
    const safeNum = (v) => Number(v || 0);
    const gld = getQ("GLD");
    const brent = getQ("BNO") || getQ("USO");
    const y2 = getQ("SHY");
    const y10 = getQ("IEF") || getQ("TLT");
    const usd = getQ("UUP");
    const spy = getQ("SPY");
    const qqq = getQ("QQQ");
    const btc = getQ("BTCUSD");
    const eth = getQ("ETHUSD");

    const stockMove = (safeNum(spy?.changesPercentage) + safeNum(qqq?.changesPercentage)) / 2;
    const cryptoMove = (safeNum(btc?.changesPercentage) + safeNum(eth?.changesPercentage)) / 2;
    const usdMove = safeNum(usd?.changesPercentage);
    const goldMove = safeNum(gld?.changesPercentage);
    const brentMove = safeNum(brent?.changesPercentage);
    const y2Move = safeNum(y2?.changesPercentage);
    const y10Move = safeNum(y10?.changesPercentage);
    const curveProxy = y10Move - y2Move;

    const rel = [];
    rel.push(`Dollar vs Stocks: ${usdMove >= 0 && stockMove <= 0 ? "Inverse (risk-off pressure)" : usdMove <= 0 && stockMove >= 0 ? "Supportive (risk-on)" : "Mixed"}`);
    rel.push(`Dollar vs Crypto: ${usdMove >= 0 && cryptoMove <= 0 ? "Inverse (crypto headwind)" : usdMove <= 0 && cryptoMove >= 0 ? "Supportive (crypto tailwind)" : "Mixed"}`);
    rel.push(`Gold vs Dollar: ${goldMove >= 0 && usdMove <= 0 ? "Classic hedge bid" : goldMove <= 0 && usdMove >= 0 ? "Dollar pressure on metals" : "Mixed"}`);
    rel.push(`Brent vs Equities: ${brentMove > 0.8 && stockMove < 0 ? "Inflation stress signal" : brentMove < 0 && stockMove > 0 ? "Cost relief for risk assets" : "Neutral"}`);
    rel.push(`2Y/10Y Proxy: ${curveProxy > 0 ? "Long-end outperforming short-end" : curveProxy < 0 ? "Front-end pressure > long-end" : "Flat"}`);

    return {
      rows: [
        { key: "Gold", symbol: gld?.symbol || "GLD", price: safeNum(gld?.price), chg: goldMove },
        { key: "Brent", symbol: brent?.symbol || "BNO", price: safeNum(brent?.price), chg: brentMove },
        { key: "2Y", symbol: y2?.symbol || "SHY", price: safeNum(y2?.price), chg: y2Move },
        { key: "10Y", symbol: y10?.symbol || "IEF", price: safeNum(y10?.price), chg: y10Move },
        { key: "Dollar", symbol: usd?.symbol || "UUP", price: safeNum(usd?.price), chg: usdMove },
        { key: "BTC", symbol: btc?.symbol || "BTCUSD", price: safeNum(btc?.price), chg: safeNum(btc?.changesPercentage) },
      ],
      rel,
      stockMove,
      cryptoMove,
      curveProxy,
    };
  }, [macroData]);
  const institutionalRadar = useMemo(() => {
    const advancers = terminalRankRows.filter((x) => Number(x.changesPercentage || 0) > 0).length;
    const total = terminalRankRows.length || 0;
    const breadthPct = total ? (advancers / total) * 100 : 0;
    const vix = Number(macroData.find((m) => m.symbol === "VIXY")?.changesPercentage || 0);
    const usd = Number(macroData.find((m) => m.symbol === "UUP")?.changesPercentage || 0);
    const oil = Number(macroData.find((m) => m.symbol === "USO")?.changesPercentage || 0);
    const macroPressureScore = vix * 0.5 + usd * 0.3 + Math.max(0, oil) * 0.2;
    const macroPressureLabel = macroPressureScore > 1.5 ? "HIGH" : macroPressureScore > 0.4 ? "ELEVATED" : "LOW";
    const focus = executionRows[0] || null;
    const focusStatus = String(focus?.status || "WATCH").toUpperCase();
    const focusTone = focusStatus === "TRIGGERED" ? "green" : focusStatus === "STALK" ? "amber" : "red";
    return { advancers, total, breadthPct, macroPressureScore, macroPressureLabel, focus: focus?.symbol || selected?.symbol || "N/A", focusStatus, focusTone };
  }, [terminalRankRows, macroData, executionRows, selected]);
  const riskSnapshot = useMemo(() => {
    const riskAlerts = (alerts || []).filter((a) => a.type === "risk").length;
    const avgRR = executionRows.length ? executionRows.reduce((sum, r) => sum + r.rr, 0) / executionRows.length : 0;
    const topSectors = {};
    executionRows.forEach((r) => {
      const sec = STOCK_TO_SECTOR[r.symbol] || "OTHER";
      topSectors[sec] = (topSectors[sec] || 0) + 1;
    });
    const concentration = Object.values(topSectors).length ? Math.max(...Object.values(topSectors)) : 0;
    const mode = riskAlerts >= 3 || concentration >= 4 ? "DEFENSIVE" : avgRR >= 1.6 ? "AGGRESSIVE" : "BALANCED";
    return { riskAlerts, avgRR, concentration, mode };
  }, [alerts, executionRows]);

  const [chartTf, setChartTf] = useState("D");
  const [chartInds, setChartInds] = useState({ RSI: true, MACD: true, BB: false, EMA: false, VWAP: false, STOCH: false, VOL: false, ATR: false });
  const toggleInd = (k) => setChartInds(p => ({ ...p, [k]: !p[k] }));
  const studiesStr = Object.entries(chartInds).filter(([,v]) => v).map(([k]) => k).join(",");
  const tvTheme = typeof themeMode !== "undefined" ? (themeMode === "dark" ? "dark" : "light") : "dark";

  if (!selected) return null;

  const scores2 = computeScores(selected);
  // ── Chart indicators state ────────────────────────────────────────────────
  const sig2 = scores2.composite >= 72 ? "BUY" : scores2.composite >= 55 ? "WATCH" : scores2.composite >= 40 ? "HOLD" : "AVOID";
  const sigCol2 = sig2 === "BUY" ? C.green : sig2 === "WATCH" ? C.amber : sig2 === "HOLD" ? C.textDim : C.red;
  const chg2 = Number(selected.changesPercentage || 0);
  const px2  = Number(selected.price || 0);
  const ma50v = Number(selected.priceAvg50 || 0);
  const ma200v= Number(selected.priceAvg200 || 0);
  const hi52v = Number(selected.yearHigh || 0);
  const lo52v = Number(selected.yearLow  || 0);
  const rvolV = selected.avgVolume > 0 ? (selected.volume / selected.avgVolume) : 0;
  const stopV = px2 > 0 ? (Math.min(px2 * 0.97, ma50v > 0 && ma50v < px2 ? ma50v * 0.98 : px2 * 0.97)) : 0;
  const t1V   = px2 > 0 ? px2 + (px2 - stopV) * 1.5 : 0;
  const t2V   = px2 > 0 ? px2 + (px2 - stopV) * 3   : 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 280px", gap: 6, minHeight: "calc(100vh - 130px)", padding: "6px 8px" }}>
      {/* ── LEFT: Watchlist ── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
            <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.1em", marginBottom: 6 }}>WATCHLIST</div>
            <div style={{ display: "flex", gap: 4 }}>
              <input
                value={wlAddInput} onChange={e => setWlAddInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && wlAddTicker()}
                placeholder="+ ADD TICKER"
                style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 5,
                  fontFamily: MONO, fontSize: 11, color: C.accent, padding: "4px 7px", outline: "none" }} />
              <button onClick={wlAddTicker}
                style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 5,
                  fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "4px 8px", cursor: "pointer" }}>+</button>
            </div>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {watchlistData.slice(0, 20).map((q) => {
              const chgPct = q.changesPercentage || 0;
              const up = chgPct >= 0;
              const active = q.symbol === selected.symbol;
              const scores = computeScores(q);
              const sig = scores.composite >= 72 ? "BUY" : scores.composite >= 55 ? "WATCH" : scores.composite >= 40 ? "HOLD" : "AVOID";
              const sigColor = sig === "BUY" ? C.green : sig === "WATCH" ? C.amber : sig === "HOLD" ? C.textDim : C.red;
              const rvol = q.avgVolume > 0 ? q.volume / q.avgVolume : 0;
              const isPreMarket = marketSession === "PREMARKET";
              const isPostMarket = marketSession === "AFTERMARKET";
              const extChg = isPreMarket ? Number(q.preMarketChangePercent || 0) : isPostMarket ? Number(q.postMarketChangePercent || 0) : null;
              return (
                <div key={q.symbol}
                  onClick={() => onSelectSymbol(q.symbol)}
                  style={{ borderBottom: `1px solid ${C.border}22`, cursor: "pointer",
                    background: active ? `${C.accent}12` : "transparent",
                    borderLeft: `3px solid ${active ? C.accent : sigColor + "60"}`,
                    transition: "background 0.1s" }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.cardHover; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>
                  <div style={{ padding: "8px 10px 6px 10px" }}>
                    {/* Row 1: ticker + change */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: active ? C.accent : C.text }}>{q.symbol}</span>
                      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: up ? C.green : C.red }}>
                        {up ? "+" : ""}{chgPct.toFixed(2)}%
                      </span>
                    </div>
                    {/* Row 2: price + signal badge */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>${q.price?.toFixed(2)}</span>
                      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                        {rvol > 1.5 && <span style={{ fontFamily: MONO, fontSize: 9, color: C.amber, fontWeight: 700 }}>{rvol.toFixed(1)}x</span>}
                        {extChg !== null && extChg !== 0 && (
                          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: isPreMarket ? C.accent : C.amber }}>
                            {extChg >= 0 ? "+" : ""}{extChg.toFixed(1)}%
                          </span>
                        )}
                        <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: sigColor,
                          background: `${sigColor}18`, borderRadius: 3, padding: "1px 5px" }}>
                          {sig}
                        </span>
                      </div>
                    </div>
                    {/* Score bar */}
                    <div style={{ marginTop: 4, height: 2, background: `${C.border}`, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${scores.composite}%`, height: "100%", background: sigColor, borderRadius: 2, transition: "width 0.4s" }} />
                    </div>
                  </div>
                  {/* Remove button — shown on hover via active check */}
                  {active && (
                    <div style={{ borderTop: `1px solid ${C.border}22`, padding: "3px 8px", display: "flex", gap: 6 }}>
                      <button onClick={e => { e.stopPropagation(); wlRemoveTicker(q.symbol); }}
                        style={{ fontFamily: MONO, fontSize: 9, border: `1px solid ${C.red}44`, background: `${C.red}12`,
                          color: C.red, borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}>
                        ✕ REMOVE
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      {/* ── CENTER: TradingView Full Chart ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Row 1: symbol info + timeframe */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: `1px solid ${C.border}`, background: C.surface, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.accent }}>{selected.symbol}</span>
          <span style={{ fontFamily: MONO, fontSize: 15, color: C.text }}>${px2.toFixed(2)}</span>
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: chg2 >= 0 ? C.green : C.red }}>{chg2 >= 0 ? "+" : ""}{chg2.toFixed(2)}%</span>
          {rvolV > 1.5 && <span style={{ fontFamily: MONO, fontSize: 10, color: C.amber, background: `${C.amber}18`, borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>RVOL {rvolV.toFixed(1)}x</span>}
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: sigCol2, background: `${sigCol2}18`, borderRadius: 4, padding: "1px 8px" }}>{sig2}</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            {["1","5","15","60","D","W"].map(tf => (
              <button key={tf} onClick={() => setChartTf(tf)}
                style={{ background: chartTf === tf ? C.accent : "transparent", color: chartTf === tf ? "#fff" : C.textSec,
                  border: `1px solid ${chartTf === tf ? C.accent : C.border}`, borderRadius: 5,
                  fontFamily: MONO, fontSize: 11, padding: "3px 9px", cursor: "pointer", fontWeight: chartTf === tf ? 700 : 400 }}>
                {tf === "60" ? "1H" : tf}
              </button>
            ))}
          </div>
        </div>
        {/* Row 2: indicator toggles */}
        <div style={{ display: "flex", gap: 4, padding: "6px 14px", background: C.bg || C.surface, borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, alignSelf: "center", marginRight: 4 }}>INDICATORS:</span>
          {[
            ["RSI",   "RSI 14",   "#a78bfa"],
            ["MACD",  "MACD",     "#3b82f6"],
            ["BB",    "Bollinger","#7c3aed"],
            ["EMA",   "EMA",      "#22d47e"],
            ["VWAP",  "VWAP",     "#f59e0b"],
            ["STOCH", "Stoch",    "#0891b2"],
            ["VOL",   "Volume",   "#6b7280"],
            ["ATR",   "ATR",      "#ef4444"],
          ].map(([k, label, col]) => (
            <button key={k} onClick={() => toggleInd(k)}
              style={{ background: chartInds[k] ? col : "transparent",
                color: chartInds[k] ? "#fff" : C.textDim,
                border: `1px solid ${chartInds[k] ? col : C.border}`,
                borderRadius: 5, fontFamily: MONO, fontSize: 10,
                fontWeight: chartInds[k] ? 700 : 400,
                padding: "2px 8px", cursor: "pointer", transition: "all 0.15s" }}>
              {label}
            </button>
          ))}
        </div>
        <iframe
          key={`chart-${selected.symbol}-${chartTf}-${studiesStr}`}
          src={`/client/tv-widget.html?w=advanced-chart&s=${encodeURIComponent(selected.symbol)}&t=${tvTheme}&h=580&iv=${chartTf}&st=${encodeURIComponent(studiesStr)}`}
          width="100%" height="580"
          style={{ display: "block", border: "none" }}
          title={`${selected.symbol} chart`}
        />
      </div>

      {/* ── RIGHT: One clean card — no empty sections ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflowY: "auto", maxHeight: "calc(100vh - 130px)" }}>

        {/* Score header */}
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.surface, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.08em" }}>SCORE</div>
            <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: sigCol2, lineHeight: 1 }}>{scores2.composite}<span style={{ fontSize: 11, color: C.textDim }}>/100</span></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: sigCol2, background: `${sigCol2}18`, borderRadius: 5, padding: "3px 10px" }}>{sig2}</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 3 }}>T:{scores2.tech} F:{scores2.fund} M:{scores2.macro}</div>
          </div>
        </div>
        <div style={{ height: 4, background: C.surface }}><div style={{ width: `${scores2.composite}%`, height: "100%", background: sigCol2, transition: "width 0.4s" }} /></div>

        {/* All rows in one table — no section headers for empty data */}
        <div style={{ padding: "0 14px" }}>

          {/* Key levels — only show rows with real data */}
          {px2 > 0 && (
            <>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.08em", padding: "10px 0 4px" }}>KEY LEVELS</div>
              {[
                hi52v > 0 && ["52W High", `$${hi52v.toFixed(2)}`, px2 >= hi52v*0.95 ? C.amber : C.text],
                ma50v > 0 && ["MA 50",   `$${ma50v.toFixed(2)}`,  px2 > ma50v ? C.green : C.red],
                            ["Price",    `$${px2.toFixed(2)}`,    C.accent],
                ma200v > 0 && ["MA 200", `$${ma200v.toFixed(2)}`, px2 > ma200v ? C.green : C.red],
                lo52v > 0 && ["52W Low", `$${lo52v.toFixed(2)}`,  px2 <= lo52v*1.08 ? C.amber : C.text],
              ].filter(Boolean).map(([l,v,col]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}22` }}>
                  <span style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>{l}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: col }}>{v}</span>
                </div>
              ))}
            </>
          )}

          {/* Trade setup — only show if we have a price */}
          {px2 > 0 && stopV > 0 && (
            <>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.08em", padding: "10px 0 4px" }}>TRADE SETUP</div>
              {[
                ["Entry",    `$${px2.toFixed(2)}`,     C.text],
                ["Stop",     `$${stopV.toFixed(2)}`,   C.red],
                ["Target 1", `$${t1V.toFixed(2)}`,     C.green],
                ["Target 2", `$${t2V.toFixed(2)}`,     C.green],
              ].map(([l,v,col]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}22` }}>
                  <span style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>{l}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: col }}>{v}</span>
                </div>
              ))}
            </>
          )}

          {/* Market — only show if we have data */}
          {leaderTape.length > 0 && (
            <>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.08em", padding: "10px 0 4px" }}>MARKET</div>
              {leaderTape.slice(0, 5).map(q => {
                const qc = Number(q.changesPercentage || 0);
                return (
                  <div key={q.symbol} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${C.border}22` }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec }}>{q.symbol}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: qc >= 0 ? C.green : C.red }}>{qc >= 0 ? "+" : ""}{qc.toFixed(2)}%</span>
                  </div>
                );
              })}
            </>
          )}

          {/* Watchlist top setups — only if loaded */}
          {terminalRankRows.length > 0 && (
            <>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.08em", padding: "10px 0 4px" }}>TOP SETUPS</div>
              {terminalRankRows.slice(0, 6).map(q => {
                const qc = Number(q.changesPercentage || 0);
                const qs = q.s?.composite >= 72 ? "BUY" : q.s?.composite >= 55 ? "WATCH" : "HOLD";
                const qcol = qs === "BUY" ? C.green : qs === "WATCH" ? C.amber : C.textDim;
                return (
                  <div key={q.symbol} onClick={() => onSelectSymbol(q.symbol)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.border}22`, cursor: "pointer" }}>
                    <div>
                      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: q.symbol === selected.symbol ? C.accent : C.text }}>{q.symbol}</span>
                      <span style={{ fontFamily: MONO, fontSize: 9, color: qcol, background: `${qcol}18`, borderRadius: 3, padding: "1px 4px", marginLeft: 5 }}>{qs}</span>
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: qc >= 0 ? C.green : C.red }}>{qc >= 0 ? "+" : ""}{qc.toFixed(1)}%</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

    </div>
  );
}
