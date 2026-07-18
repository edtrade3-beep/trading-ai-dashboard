import { useState, useEffect, useMemo } from "react";
import { computeMTFSignal, computeScores, r2 } from "./trading-utils.js";

function generateSetup(q, trend) {
  if (!q || !q.price || q.price <= 0) return null;

  const price   = Number(q.price);
  const chg     = Number(q.changesPercentage || 0);
  // NOTE: q.priceAvg50/priceAvg200/yearHigh/yearLow come from /api/market/quote,
  // a fast price-only path that never populates these fields for any
  // Alpaca-covered symbol (confirmed live this session — same root cause
  // fixed in PredictionsTab/GreenLight/DipBuy/EarlyEntryScanner/AutoPilot/
  // Dashboard/Holdings). Real trend structure below comes from
  // /api/market/trend-screen instead — those raw fields are unused here.
  const rvol    = q.avgVolume ? (q.volume / q.avgVolume) : 1;
  const mtf     = computeMTFSignal(q, trend);
  const scores  = computeScores(q, trend);

  if (mtf.signal === "HOLD" && scores.composite < 65) return null;
  if (mtf.score === 0) return null;

  const isBull  = mtf.signal === "BUY";
  const isBear  = mtf.signal === "SELL";
  if (!isBull && !isBear) return null;

  // ── Identify setup type — driven by real trend-screen stage/pctFromHigh,
  // not the always-empty priceAvg50/priceAvg200/yearHigh/yearLow above ──
  const stage         = String(trend?.stage || "");
  const inUptrend      = stage.startsWith("Stage 2");
  const inDowntrend     = stage.startsWith("Stage 3") || stage.startsWith("Stage 4");
  // distToHigh is % BELOW the high (0 = at the high, larger = further below)
  const distToHigh    = trend && Number.isFinite(Number(trend.pctFromHigh)) ? -Number(trend.pctFromHigh) : null;
  const nearYearHigh  = distToHigh !== null && distToHigh >= 0 && distToHigh <= 3;
  const breakoutYHigh = distToHigh !== null && distToHigh >= 0 && distToHigh <= 0.5;
  const aboveSma50    = inUptrend;
  const aboveSma200   = inUptrend;
  const goldenCross    = inUptrend;
  // No real 52-week-low analog exposed by trend-screen (pctFromHigh only) —
  // dropped rather than fabricated, same precedent as EarlyEntryScanner.
  const nearYearLow   = false;
  const highRvol      = rvol >= 1.5;
  const veryHighRvol  = rvol >= 2.5;

  let setupType = "";
  let conviction = mtf.score; // base conviction from MTF score

  if (isBull) {
    if (breakoutYHigh && highRvol)        { setupType = "52W Breakout"; conviction += 3; }
    else if (nearYearHigh && highRvol)    { setupType = "Momentum Breakout"; conviction += 2; }
    else if (goldenCross)                 { setupType = "Golden Cross"; conviction += 2; }
    else if (veryHighRvol && chg > 2)     { setupType = "Volume Surge"; conviction += 2; }
    else if (aboveSma50 && aboveSma200)   { setupType = "Trend Continuation"; conviction += 1; }
    else if (aboveSma200 && chg > 0)      { setupType = "Bull Trend Entry"; conviction += 1; }
    else                                  { setupType = "Momentum"; }
  } else {
    // Was `!aboveSma200 && chg < -2` — since aboveSma200 was always false
    // (dead priceAvg200 field), that condition was unconditionally true,
    // so "Bear Continuation" fired on ANY 2%+ down day regardless of real
    // trend structure. Now requires genuine trend-screen confirmation of
    // an actual Stage 3/4 downtrend.
    if (nearYearLow && highRvol)          { setupType = "Breakdown"; conviction += 2; }
    else if (inDowntrend && chg < -2)     { setupType = "Bear Continuation"; conviction += 2; }
    else if (veryHighRvol && chg < -2)    { setupType = "Distribution"; conviction += 2; }
    else                                  { setupType = "Short Signal"; }
  }

  // ── Calculate entry / stop / targets ──
  // ATR estimate: use 2% of price as a rough ATR proxy (standard for large-caps)
  const atrPct  = price < 10 ? 0.05 : price < 50 ? 0.03 : 0.02;
  const atr     = price * atrPct;

  let entry, stop, target1, target2, stopPct, t1Pct, t2Pct;

  if (isBull) {
    entry   = price;
    // Stop: 1.5× ATR below entry, or below the real technical pivot if close
    // (was `sma50 - atr*0.5`, but sma50 is always 0 from the dead
    // priceAvg50 field — this was permanently dead code, always fell
    // through to the plain ATR stop. trend.pivot is a real level.)
    const pivot   = Number(trend?.pivot || 0);
    const smaBuff = pivot > 0 && price - pivot < atr * 3 ? pivot - atr * 0.5 : null;
    stop    = smaBuff ? Math.min(price - atr * 1.5, smaBuff) : price - atr * 1.5;
    target1 = price + (price - stop) * 2;   // 2:1 R:R
    target2 = price + (price - stop) * 3.5; // 3.5:1 R:R
    stopPct = ((stop - price) / price * 100).toFixed(1);
    t1Pct   = ((target1 - price) / price * 100).toFixed(1);
    t2Pct   = ((target2 - price) / price * 100).toFixed(1);
  } else {
    entry   = price;
    stop    = price + atr * 1.5;
    target1 = price - (stop - price) * 2;
    target2 = price - (stop - price) * 3.5;
    stopPct = ((stop - price) / price * 100).toFixed(1);
    t1Pct   = ((target1 - price) / price * 100).toFixed(1);
    t2Pct   = ((target2 - price) / price * 100).toFixed(1);
  }

  // ── Build reasoning bullets ──
  const reasons = [];
  if (veryHighRvol)                  reasons.push(`🔥 Volume ${rvol.toFixed(1)}× avg — strong institutional interest`);
  else if (highRvol)                 reasons.push(`📈 Volume ${rvol.toFixed(1)}× avg — above-average activity`);
  if (breakoutYHigh)                 reasons.push(`🚀 Breaking 52-week high — new all-time territory, no overhead resistance`);
  else if (nearYearHigh && isBull)   reasons.push(`⚡ Near 52-week high — momentum in control`);
  if (goldenCross)                   reasons.push(`✨ Stage 2 uptrend confirmed — price in a real technical markup phase`);
  if (chg > 3 && isBull)             reasons.push(`💪 Up ${chg.toFixed(1)}% today — strong buying momentum`);
  else if (chg > 1 && isBull)        reasons.push(`📗 Up ${chg.toFixed(1)}% on the day — positive price action`);
  // Was `!aboveSma200` — since aboveSma200 was always false (dead
  // priceAvg200 field), this fired on EVERY bearish setup unconditionally,
  // fabricating a "long-term downtrend" claim regardless of real trend.
  // Now requires genuine trend-screen Stage 3/4 confirmation.
  if (inDowntrend && isBear)         reasons.push(`📉 Stage ${stage.startsWith("Stage 4") ? "4 downtrend" : "3 decline"} — real technical breakdown, not just a down day`);
  if (chg < -3 && isBear)            reasons.push(`🔴 Down ${Math.abs(chg).toFixed(1)}% today — heavy selling pressure`);
  // MTF alignment
  const bullTFs = mtf.timeframes.filter(t => !t.neutral && t.bull).map(t => t.label);
  if (bullTFs.length >= 3 && isBull) reasons.push(`⏱ Bullish across ${bullTFs.join(", ")} timeframes — aligned momentum`);
  const bearTFs = mtf.timeframes.filter(t => !t.neutral && !t.bull).map(t => t.label);
  if (bearTFs.length >= 3 && isBear) reasons.push(`⏱ Bearish across ${bearTFs.join(", ")} timeframes — selling across the board`);

  if (reasons.length === 0) reasons.push(`Score ${scores.composite}/100 — multi-factor analysis supports this direction`);

  return {
    symbol: q.symbol,
    price,
    side: isBull ? "LONG" : "SHORT",
    setupType,
    conviction: Math.min(10, conviction),
    entry: r2(entry),
    stop: r2(stop),
    target1: r2(target1),
    target2: r2(target2),
    stopPct,
    t1Pct,
    t2Pct,
    rrRatio: "2:1 / 3.5:1",
    reasons,
    mtfScore: mtf.score,
    composite: scores.composite,
    rvol,
    chg,
    q,
  };
}

export default function TradeAdvisorTab({ C, MONO, SANS, watchlistData, watchlistSymbols, onOpenTerminal, onAddSymbols }) {
  const [filter, setFilter]     = useState("ALL"); // ALL | LONG | SHORT
  const [minConv, setMinConv]   = useState(3);
  const [expanded, setExpanded] = useState(null);
  const [addInput, setAddInput] = useState("");
  const [addMsg, setAddMsg]     = useState("");
  const [autoAlert, setAutoAlert] = useState(false);       // auto-send conviction 7+ to Telegram
  const [alertedSet, setAlertedSet] = useState(new Set()); // symbols already auto-alerted this session
  const [accountSize, setAccountSize] = useState("50000"); // for position sizer
  const [riskPct, setRiskPct] = useState("1");             // % of account to risk per trade
  const [advisorTablet, setAdvisorTablet] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768 && window.innerWidth <= 1200);
  useEffect(() => {
    const fn = () => setAdvisorTablet(window.innerWidth >= 768 && window.innerWidth <= 1200);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  // Auto-alert: when a new conviction 7+ setup appears, send to Telegram once
  // Auto-alert from watchlist disabled — too noisy. Use server-side scan alerts only.
  // useEffect(() => { if (!autoAlert) ... }, [watchlistData, autoAlert]);

  // Real trend structure (Stage 2 uptrend / Stage 3-4 downtrend) for
  // generateSetup's setup classification — /api/market/quote (source of
  // watchlistData) never populates priceAvg50/priceAvg200/yearHigh/yearLow
  // for any Alpaca-covered symbol, so without this every bullish setup type
  // besides "Volume Surge"/"Momentum" was unreachable, AND every bearish
  // setup mis-classified as "Bear Continuation" with a fabricated "Below
  // 200-day SMA" claim on any 2%+ down day (same root cause already fixed
  // in Holdings/AutoPilot/Dashboard/EarlyEntryScanner this session).
  const [trendMap, setTrendMap] = useState({});
  const wlSyms = (watchlistSymbols?.length ? watchlistSymbols : (watchlistData || []).map(q => q.symbol))
    .filter(Boolean);
  const wlSymsKey = [...new Set(wlSyms)].sort().join(",");
  useEffect(() => {
    if (!wlSymsKey) return;
    fetch(`/api/market/trend-screen?symbols=${encodeURIComponent(wlSymsKey)}`)
      .then(r => r.json())
      .then(j => {
        const map = {};
        (j.results || []).forEach(r => { if (!r.error) map[r.symbol] = r; });
        setTrendMap(map);
      })
      .catch(() => {});
  }, [wlSymsKey]);

  const setups = useMemo(() => {
    if (!watchlistData?.length) return [];
    return watchlistData
      .map(q => generateSetup(q, trendMap[q.symbol]))
      .filter(Boolean)
      .filter(s => filter === "ALL" || s.side === filter)
      .filter(s => s.conviction >= minConv)
      .sort((a, b) => b.conviction - a.conviction || b.composite - a.composite);
  }, [watchlistData, trendMap, filter, minConv]);

  const longCount  = watchlistData ? watchlistData.map(q => generateSetup(q, trendMap[q.symbol])).filter(s => s?.side === "LONG").length : 0;
  const shortCount = watchlistData ? watchlistData.map(q => generateSetup(q, trendMap[q.symbol])).filter(s => s?.side === "SHORT").length : 0;

  const convBar = (n, max = 10) => (
    <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
      {Array.from({ length: max }, (_, i) => (
        <div key={i} style={{ width: 8, height: 8, borderRadius: 2, background: i < n ? (n >= 7 ? C.green : n >= 5 ? C.amber : C.accent) : C.border }} />
      ))}
      <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginLeft: 4 }}>{n}/10</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 0 40px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 4 }}>
            🤖 AI TRADE ADVISOR
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>
            Real-time setups from your watchlist · entry, stop loss, targets & reasoning
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Side filter */}
          {[
            { v: "ALL",   label: `ALL (${longCount + shortCount})`, col: C.accent },
            { v: "LONG",  label: `▲ LONG (${longCount})`,   col: C.green },
            { v: "SHORT", label: `▼ SHORT (${shortCount})`, col: C.red },
          ].map(({ v, label, col }) => (
            <button key={v} onClick={() => setFilter(v)}
              style={{ fontFamily: MONO, fontSize: 12, fontWeight: filter === v ? 800 : 400,
                border: `1px solid ${filter === v ? col : C.border}`,
                background: filter === v ? `${col}18` : C.surface,
                color: filter === v ? col : C.textDim,
                borderRadius: 5, padding: "5px 12px", cursor: "pointer" }}>
              {label}
            </button>
          ))}
          {/* Min conviction */}
          <select value={minConv} onChange={e => setMinConv(Number(e.target.value))}
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: advisorTablet ? 12 : 10, padding: advisorTablet ? "8px 10px" : "5px 8px", borderRadius: 6 }}>
            {[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>Min conviction: {n}+</option>)}
          </select>
          {/* Auto-alert toggle */}
          <button onClick={() => { setAutoAlert(v => !v); setAlertedSet(new Set()); }}
            style={{ fontFamily: MONO, fontSize: advisorTablet ? 12 : 10, fontWeight: 700,
              border: `1px solid ${autoAlert ? C.green : C.border}`,
              background: autoAlert ? `${C.green}18` : C.surface,
              color: autoAlert ? C.green : C.textDim,
              borderRadius: 5, padding: advisorTablet ? "8px 14px" : "5px 12px", cursor: "pointer",
              minHeight: advisorTablet ? 44 : "auto" }}>
            {autoAlert ? "🔔 ALERTS ON" : "🔕 ALERTS OFF"}
          </button>
        </div>
      </div>

      {/* Position Sizer */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: advisorTablet ? 12 : 10, color: C.textDim, whiteSpace: "nowrap" }}>💼 POSITION SIZER:</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontFamily: MONO, fontSize: advisorTablet ? 11 : 9, color: C.textDim }}>Account $</span>
          <input type="number" value={accountSize} onChange={e => setAccountSize(e.target.value)}
            style={{ width: advisorTablet ? 110 : 90, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: advisorTablet ? 12 : 11, padding: advisorTablet ? "7px 8px" : "4px 6px", borderRadius: 6 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontFamily: MONO, fontSize: advisorTablet ? 11 : 9, color: C.textDim }}>Risk %</span>
          <input type="number" value={riskPct} min="0.1" max="5" step="0.1" onChange={e => setRiskPct(e.target.value)}
            style={{ width: 55, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: advisorTablet ? 12 : 11, padding: advisorTablet ? "7px 8px" : "4px 6px", borderRadius: 6 }} />
        </div>
        <span style={{ fontFamily: MONO, fontSize: advisorTablet ? 11 : 9, color: C.textDim }}>
          = <strong style={{ color: C.amber }}>${(Number(accountSize) * Number(riskPct) / 100).toFixed(0)}</strong> risk per trade
        </span>
        {autoAlert && <span style={{ fontFamily: MONO, fontSize: advisorTablet ? 11 : 9, color: C.green, marginLeft: "auto" }}>🔔 Auto-alerting conviction 7+ setups via Telegram</span>}
      </div>

      {/* Quick-add symbols bar */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, whiteSpace: "nowrap" }}>+ ADD TO WATCHLIST:</span>
        <input
          value={addInput}
          onChange={e => setAddInput(e.target.value.toUpperCase())}
          onKeyDown={e => {
            if (e.key === "Enter") {
              const syms = addInput.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(s => /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(s));
              if (syms.length) { onAddSymbols(syms); setAddMsg(`✓ Added: ${syms.join(", ")}`); setAddInput(""); setTimeout(() => setAddMsg(""), 3000); }
            }
          }}
          placeholder="e.g. AAPL, MSFT, SPY  (press Enter)"
          style={{ flex: 1, minWidth: 200, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "7px 10px", borderRadius: 6 }}
        />
        <button onClick={() => {
          const syms = addInput.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(s => /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(s));
          if (syms.length) { onAddSymbols(syms); setAddMsg(`✓ Added: ${syms.join(", ")}`); setAddInput(""); setTimeout(() => setAddMsg(""), 3000); }
        }} style={{ border: `1px solid ${C.accent}55`, background: `${C.accent}12`, color: C.accent, borderRadius: 6, padding: "7px 14px", fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          ADD
        </button>
        {addMsg && <span style={{ fontFamily: MONO, fontSize: 12, color: C.green }}>{addMsg}</span>}
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginLeft: "auto" }}>
          Scanning {watchlistSymbols?.length || 0} stocks
        </span>
      </div>

      {/* No data */}
      {!watchlistData?.length && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 30, textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>
          Waiting for watchlist data to load… Add stocks above and wait for a refresh.
        </div>
      )}

      {watchlistData?.length > 0 && setups.length === 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 30, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 13, color: C.textDim, marginBottom: 8 }}>No high-conviction setups right now</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>
            Try lowering the minimum conviction, or wait for stronger signals to develop.
          </div>
        </div>
      )}

      {/* Setup cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {setups.map((s, i) => {
          const sideCol  = s.side === "LONG" ? C.green : C.red;
          const isOpen   = expanded === s.symbol;
          return (
            <div key={s.symbol} style={{ background: C.card, border: `2px solid ${isOpen ? sideCol + "66" : C.border}`, borderRadius: 10, overflow: "hidden", transition: "border-color 0.2s" }}>
              {/* Card header */}
              <div
                onClick={() => setExpanded(isOpen ? null : s.symbol)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: advisorTablet ? "16px 16px" : "14px 16px", cursor: "pointer", flexWrap: "wrap", minHeight: advisorTablet ? 64 : "auto" }}
              >
                {/* Rank */}
                <div style={{ fontFamily: MONO, fontSize: advisorTablet ? 13 : 11, color: C.textDim, minWidth: 24 }}>#{i + 1}</div>

                {/* Symbol */}
                <button onClick={e => { e.stopPropagation(); onOpenTerminal(s.symbol); }}
                  style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: advisorTablet ? 22 : 18, fontWeight: 900, cursor: "pointer", padding: 0, letterSpacing: "-0.01em" }}>
                  {s.symbol}
                </button>

                {/* Side badge */}
                <span style={{ fontFamily: MONO, fontSize: advisorTablet ? 13 : 11, fontWeight: 800, color: sideCol, background: `${sideCol}20`, border: `1px solid ${sideCol}55`, borderRadius: 6, padding: advisorTablet ? "5px 12px" : "3px 9px" }}>
                  {s.side === "LONG" ? "▲ LONG" : "▼ SHORT"}
                </span>

                {/* Setup type */}
                <span style={{ fontFamily: MONO, fontSize: advisorTablet ? 12 : 10, color: C.accent, background: `${C.accent}12`, borderRadius: 6, padding: advisorTablet ? "5px 10px" : "3px 8px" }}>
                  {s.setupType}
                </span>

                {/* Price + chg */}
                <span style={{ fontFamily: MONO, fontSize: advisorTablet ? 16 : 14, fontWeight: 700, color: C.text }}>${s.price.toFixed(2)}</span>
                <span style={{ fontFamily: MONO, fontSize: advisorTablet ? 14 : 12, color: s.chg >= 0 ? C.green : C.red, fontWeight: 700 }}>
                  {s.chg >= 0 ? "+" : ""}{s.chg.toFixed(2)}%
                </span>

                {/* Conviction dots */}
                <div style={{ marginLeft: "auto" }}>
                  {convBar(s.conviction)}
                </div>

                {/* Expand arrow */}
                <span style={{ fontFamily: MONO, fontSize: 14, color: C.textDim, transition: "transform 0.2s", display: "inline-block", transform: isOpen ? "rotate(180deg)" : "none" }}>▼</span>
              </div>

              {/* Quick stats bar (always visible) */}
              <div style={{ display: "flex", gap: 0, borderTop: `1px solid ${C.border}`, background: C.surface, flexWrap: advisorTablet ? "wrap" : "nowrap" }}>
                {[
                  { label: "ENTRY",    val: `$${s.entry}`,              col: C.text },
                  { label: "STOP",     val: `$${s.stop} (${s.stopPct}%)`, col: C.red },
                  { label: "TARGET 1", val: `$${s.target1} (+${s.t1Pct}%)`, col: C.green },
                  { label: "TARGET 2", val: `$${s.target2} (+${s.t2Pct}%)`, col: C.green },
                  { label: "R:R",      val: s.rrRatio,                  col: C.amber },
                  { label: "RVOL",     val: `${s.rvol.toFixed(1)}×`,   col: s.rvol >= 2 ? C.accent : C.textSec },
                  { label: "SCORE",    val: `${s.composite}/100`,       col: C.accent },
                ].map(({ label, val, col }) => (
                  <div key={label} style={{ flex: advisorTablet ? "1 1 33%" : 1, padding: advisorTablet ? "10px 12px" : "8px 10px", borderRight: `1px solid ${C.border}`, borderBottom: advisorTablet ? `1px solid ${C.border}` : "none", minWidth: 0 }}>
                    <div style={{ fontFamily: MONO, fontSize: advisorTablet ? 9 : 8, color: C.textDim, marginBottom: 2, letterSpacing: "0.06em" }}>{label}</div>
                    <div style={{ fontFamily: MONO, fontSize: advisorTablet ? 13 : 11, fontWeight: 700, color: col, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{ padding: "16px 16px 18px", borderTop: `1px solid ${C.border}` }}>
                  {/* Reasoning */}
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, fontWeight: 700, marginBottom: 10, letterSpacing: "0.06em" }}>WHY THIS SETUP</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                    {s.reasons.map((r, ri) => (
                      <div key={ri} style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>

                  {/* Trade plan */}
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, fontWeight: 700, marginBottom: 10, letterSpacing: "0.06em" }}>TRADE PLAN</div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", fontFamily: SANS, fontSize: 13, color: C.textSec, lineHeight: 1.8 }}>
                    <strong style={{ color: C.text }}>Direction:</strong> {s.side === "LONG" ? "Buy / Long" : "Sell short"}<br />
                    <strong style={{ color: C.text }}>Entry zone:</strong> ${s.entry} (current market price)<br />
                    <strong style={{ color: C.text }}>Stop loss:</strong> ${s.stop} — {s.side === "LONG" ? `${Math.abs(s.stopPct)}% below entry. Exit immediately if price closes below this level.` : `${Math.abs(s.stopPct)}% above entry.`}<br />
                    <strong style={{ color: C.text }}>Target 1:</strong> ${s.target1} (+{s.t1Pct}%) — take partial profits here (50% of position)<br />
                    <strong style={{ color: C.text }}>Target 2:</strong> ${s.target2} (+{s.t2Pct}%) — trail stop on remainder<br />
                    <strong style={{ color: C.text }}>Risk/Reward:</strong> {s.rrRatio} — only take trades where you risk $1 to make $2+<br />
                    <strong style={{ color: C.text }}>Position size:</strong> Risk no more than 1–2% of your account on this trade
                  </div>

                  {/* MTF breakdown */}
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, fontWeight: 700, marginBottom: 8, letterSpacing: "0.06em" }}>TIMEFRAME ALIGNMENT</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {computeMTFSignal(s.q, trendMap[s.symbol]).timeframes.map(tf => {
                        const col = tf.neutral ? C.textDim : (tf.bull ? C.green : C.red);
                        const label = tf.neutral ? "—" : (tf.bull ? "▲" : "▼");
                        return (
                          <div key={tf.label} style={{ background: C.card, border: `1px solid ${col}44`, borderRadius: 6, padding: "6px 12px", textAlign: "center" }}>
                            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{tf.label}</div>
                            <div style={{ fontFamily: MONO, fontSize: 14, color: col, fontWeight: 800 }}>{label}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Position size calculator */}
                  {(() => {
                    const riskDollars = Number(accountSize) * Number(riskPct) / 100;
                    const riskPerShare = Math.abs(s.price - s.stop);
                    const shares = riskPerShare > 0 ? Math.floor(riskDollars / riskPerShare) : 0;
                    const totalCost = shares * s.price;
                    return (
                      <div style={{ marginTop: 14, background: C.surface, border: `1px solid ${C.accent}33`, borderRadius: 8, padding: "12px 14px" }}>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, fontWeight: 700, marginBottom: 10, letterSpacing: "0.06em" }}>💼 POSITION SIZE (based on your ${Number(accountSize).toLocaleString()} account)</div>
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>RISK AMOUNT</div>
                            <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: C.amber }}>${riskDollars.toFixed(0)}</div>
                          </div>
                          <div>
                            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>SHARES TO BUY</div>
                            <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: C.text }}>{shares > 0 ? shares : "—"}</div>
                          </div>
                          <div>
                            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>TOTAL COST</div>
                            <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: C.text }}>{shares > 0 ? `$${totalCost.toLocaleString(undefined, {maximumFractionDigits:0})}` : "—"}</div>
                          </div>
                          <div>
                            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>MAX LOSS</div>
                            <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: C.red }}>{shares > 0 ? `$${riskDollars.toFixed(0)}` : "—"}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Action buttons */}
                  <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                    <button onClick={() => onOpenTerminal(s.symbol)}
                      style={{ border: `1px solid ${C.accent}55`, background: `${C.accent}12`, color: C.accent, borderRadius: 6, padding: advisorTablet ? "12px 20px" : "8px 16px", fontFamily: MONO, fontSize: advisorTablet ? 13 : 11, fontWeight: 700, cursor: "pointer", minHeight: advisorTablet ? 44 : "auto" }}>
                      📈 OPEN CHART
                    </button>
                    <button onClick={async () => {
                      const msg = `${s.side === "LONG" ? "🟢" : "🔴"} *${s.symbol}* — ${s.setupType} ${s.side}\n💰 Entry: $${s.entry} | Stop: $${s.stop} (${s.stopPct}%) | T1: $${s.target1} (+${s.t1Pct}%)\n📊 Conviction: ${s.conviction}/10 | Score: ${s.composite}/100\n${s.reasons[0] || ""}`;
                      try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }); } catch {}
                    }} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: advisorTablet ? "12px 18px" : "8px 14px", fontFamily: MONO, fontSize: advisorTablet ? 13 : 11, cursor: "pointer", minHeight: advisorTablet ? 44 : "auto" }}>
                      📬 SEND TO TELEGRAM
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {setups.length > 0 && (
        <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center" }}>
          ⚠ These are algorithmic signals based on price action & momentum data. Always confirm with your own analysis. Never risk more than you can afford to lose.
        </div>
      )}
    </div>
  );
}
