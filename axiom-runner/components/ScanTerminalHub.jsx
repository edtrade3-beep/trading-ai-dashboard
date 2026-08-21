import { useState, useEffect, useRef, useCallback } from "react";
import RhProScanner from "./RhProScanner.jsx";
import SmartScanTab from "./SmartScanTab.jsx";
import MarketTerminalTab from "./MarketTerminalTab.jsx";

// ScanTerminalHub — Discover + Smart Scan + Workspace merged into one tab
// (2026-08-20, explicit user request: "I want one tab combine all three
// somehow"). Confirmed via AskUserQuestion: split-screen master/detail (a
// scan table on one side, Workspace's single-symbol deep-dive on the
// other, updating in place — no tab navigation), both real scan universes
// (Discover's ~100-symbol full market, Smart Scan's curated watchlist)
// available via a toggle, not merged into one new table.
//
// Technical approach, chosen after reading MarketTerminalTab.jsx directly:
// it has no controlled `sym` prop — it owns its symbol as internal state
// and only reads localStorage["mterminal_load_sym"] ONCE, on mount
// (consumes/deletes the key). Rather than rewire a 2,700+ line, 27-fetch
// component's internal state model (real regression risk), this reuses
// that existing, already-proven mount contract as-is: render it with
// key={selectedSymbol} so a new symbol forces a real remount, and prime
// mterminal_load_sym right before changing the key — zero changes to
// MarketTerminalTab.jsx itself.
export default function ScanTerminalHub({
  C, MONO, SANS, isTablet, isMobile, macroData, sectorData, distData, preMktMovers, marketSession,
  watchlistData, watchlistSymbols, setWatchlistSymbols,
  setActiveTab, setTerminalSymbol, openDeepDiveFor,
  optionsFlow, flowBias, flowCallNotional, flowPutNotional, flowFilters, setFlowFilters, setLoading, fetchAll, apiKey,
  flowBySymbol, flowRows,
  dpSym, setDpSym, dpLoad, setDpLoad, dpData, setDpData, dpErr, setDpErr,
  earningsUpdatedAt, setEarningsRefreshTick, earningsLoading, earningsRows,
  setQuickLogModal, rotationRank,
  scanResults, scanExpanded, scanError, scanLoading, scanProgress, scanLastRun,
  scanFavorites, scanHistory, scanDeepData, scanDeepLoad, scanTickerInput, customScanTickers,
  deepSocialData, autoScanMins, autoScanOn, autoScanCountdown, autoExecStatus,
  riskAccount, riskPct, sfMaxPrice, sfMinScore, sfSig, sfZone,
  tradeSetups, tradeSetupLoad, tradeSetupError,
  setScanResults, setScanExpanded, setScanError, setScanLoading, setScanTickerInput, setScanLastRun,
  setAutoScanMins, setAutoScanOn, setAutoExecStatus, setRiskAccount, setRiskPct,
  setSfMaxPrice, setSfMinScore, setSfSig, setSfZone, setTradeSetups,
  addScanTicker, removeScanTicker, scoreTicker, toggleFavorite, fetchTradeSetup, loadDeepDive, loadDeepSocial,
  runSmartScan, FIVEX_TICKERS, themeMode,
}) {
  // Which scan table is showing — persisted so returning to this tab
  // remembers your last choice.
  const [scanMode, setScanModeRaw] = useState(() => {
    try { return localStorage.getItem("scanhub_mode") || "discover"; } catch { return "discover"; }
  });
  const setScanMode = (m) => { setScanModeRaw(m); try { localStorage.setItem("scanhub_mode", m); } catch {} };

  // Auto-run Smart Scan on first switch to that mode (2026-08-20, real bug
  // caught during live verification) — axiom-live.jsx's own equivalent
  // effect only fires on activeTab==="smartscan", which never happens
  // anymore now that Smart Scan is a toggle state inside this same
  // "rhpro-scan" tab, not its own activeTab value. Same real staleness
  // condition that effect used (20 min), just re-keyed on scanMode.
  useEffect(() => {
    if (scanMode !== "smartscan" || scanLoading || scanExpanded) return;
    const stale = !scanLastRun || (Date.now() - scanLastRun.getTime() > 20 * 60 * 1000);
    if (scanResults.length === 0 || stale) runSmartScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanMode]);

  // Draggable split (2026-08-20, explicit user request) — left-pane width
  // as a persisted percentage, dragged via a real mousedown/mousemove/
  // mouseup sequence on the divider between the two panes (no drag
  // library — plain DOM listeners, same "small, dependency-free" bar
  // every other interactive bit in this app clears). Clamped to keep both
  // panes usable; only applies in the side-by-side (non-mobile) layout.
  const containerRef = useRef(null);
  const [leftPct, setLeftPct] = useState(() => {
    try { const v = Number(localStorage.getItem("scanhub_split")); return Number.isFinite(v) && v >= 25 && v <= 70 ? v : 44; } catch { return 44; }
  });
  const [dragging, setDragging] = useState(false);
  const onDividerMouseDown = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
    const container = containerRef.current;
    if (!container) return;
    const onMove = (ev) => {
      const rect = container.getBoundingClientRect();
      const pct = Math.round(((ev.clientX - rect.left) / rect.width) * 100);
      setLeftPct(Math.max(25, Math.min(70, pct)));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setLeftPct(v => { try { localStorage.setItem("scanhub_split", String(v)); } catch {} return v; });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // Right-pane symbol — lazy (nothing fetches until a real row click),
  // remembered across visits (separate key from mterminal_load_sym, which
  // is the one-shot mount-time signal consumed by MarketTerminalTab
  // itself; scanhub_last_symbol just remembers the choice for next time).
  const [selectedSymbol, setSelectedSymbolRaw] = useState(() => {
    try {
      const last = localStorage.getItem("scanhub_last_symbol");
      if (last) localStorage.setItem("mterminal_load_sym", last);
      return last || null;
    } catch { return null; }
  });
  const handleSelectSymbol = (sym) => {
    if (!sym) return;
    try { localStorage.setItem("scanhub_last_symbol", sym); localStorage.setItem("mterminal_load_sym", sym); } catch {}
    setSelectedSymbolRaw(sym);
  };

  // "Open in Smart Scan" (Discover's row-expand button, RhProScanner.jsx)
  // — real duplicate of axiom-live.jsx's openDeepDiveFor MINUS its
  // setActiveTab("smartscan") call, which would navigate away from this
  // merged tab back to the old standalone Smart Scan mount (still real,
  // still used by other callers like MoversTab/GreenLightTab, just no
  // longer what THIS button should do now that Smart Scan is a toggle
  // state inside this same tab, not a separate page). Flips the toggle,
  // adds the row to Smart Scan's own list if missing, expands it there,
  // AND updates the shared detail pane — same real end state openDeepDiveFor
  // gives standalone callers, just without leaving this tab.
  const openInSmartScanFromHub = (sym, quote) => {
    if (!sym) return;
    setScanMode("smartscan");
    setScanResults(prev => prev.some(r => r.ticker === sym) ? prev : [{
      ticker: sym, score: 50, signal: "WATCH", scannerScore: 50, signals: [], sColor: "#f59e0b",
      quote: quote || { price: 0, changePercent: 0 }, candles: null,
      rsiVal: null, macdBull: null, ema9v: null, ema21v: null,
    }, ...prev]);
    setScanExpanded(sym);
    setTimeout(() => { setScanExpanded(sym); loadDeepDive(sym); loadDeepSocial(sym); }, 150);
    setTimeout(() => { try { fetchTradeSetup(sym, { ticker: sym, score: 50, signal: "WATCH", signals: [], quote: quote || { price: 0 } }); } catch {} }, 1400);
    handleSelectSymbol(sym);
  };

  const toggleBtn = (mode, label) => (
    <button onClick={() => setScanMode(mode)}
      style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "7px 14px", borderRadius: 7, cursor: "pointer",
        border: `1px solid ${scanMode === mode ? C.accent : C.border}`,
        background: scanMode === mode ? C.accent : "transparent", color: scanMode === mode ? "#fff" : C.textDim }}>
      {label}
    </button>
  );

  const paneHeight = "calc(100vh - 210px)";
  const stack = !!isMobile; // real mobile devices stack top/bottom instead of splitting side by side

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: stack ? "column" : "row", gap: stack ? 14 : 0, alignItems: "flex-start",
      userSelect: dragging ? "none" : undefined }}>
      <div style={{ flex: stack ? "1 1 auto" : `0 0 ${leftPct}%`, minWidth: 0, width: stack ? "100%" : undefined,
        maxHeight: stack ? undefined : paneHeight, overflowY: stack ? "visible" : "auto", overflowX: "auto", paddingRight: stack ? 0 : 10 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {toggleBtn("discover", "🎯 Discover — Full Market")}
          {toggleBtn("smartscan", "🔍 Smart Scan — Watchlist")}
        </div>
        {scanMode === "discover" ? (
          <RhProScanner
            C={C} MONO={MONO} SANS={SANS} macroData={macroData} sectorData={sectorData} watchlistData={watchlistData} setActiveTab={setActiveTab}
            setTerminalSymbol={setTerminalSymbol} watchlistSymbols={watchlistSymbols} setWatchlistSymbols={setWatchlistSymbols}
            openInSmartScan={openInSmartScanFromHub}
            optionsFlow={optionsFlow} flowBias={flowBias} flowCallNotional={flowCallNotional} flowPutNotional={flowPutNotional}
            flowFilters={flowFilters} setFlowFilters={setFlowFilters} setLoading={setLoading} fetchAll={fetchAll} apiKey={apiKey}
            flowBySymbol={flowBySymbol} flowRows={flowRows}
            dpSym={dpSym} setDpSym={setDpSym} dpLoad={dpLoad} setDpLoad={setDpLoad} dpData={dpData} setDpData={setDpData} dpErr={dpErr} setDpErr={setDpErr}
            earningsUpdatedAt={earningsUpdatedAt} setEarningsRefreshTick={setEarningsRefreshTick} earningsLoading={earningsLoading} earningsRows={earningsRows}
            setQuickLogModal={setQuickLogModal} rotationRank={rotationRank}
            onSelectSymbol={handleSelectSymbol}
          />
        ) : (
          <SmartScanTab
            C={C} MONO={MONO} SANS={SANS} isTablet={isTablet} macroData={macroData} sectorData={sectorData} watchlistSymbols={watchlistSymbols}
            scanResults={scanResults} scanExpanded={scanExpanded} scanError={scanError} scanLoading={scanLoading}
            scanProgress={scanProgress} scanLastRun={scanLastRun}
            scanFavorites={scanFavorites} scanHistory={scanHistory} scanDeepData={scanDeepData} scanDeepLoad={scanDeepLoad}
            scanTickerInput={scanTickerInput} customScanTickers={customScanTickers}
            deepSocialData={deepSocialData} autoScanMins={autoScanMins} autoScanOn={autoScanOn}
            autoScanCountdown={autoScanCountdown} autoExecStatus={autoExecStatus}
            riskAccount={riskAccount} riskPct={riskPct} sfMaxPrice={sfMaxPrice} sfMinScore={sfMinScore}
            sfSig={sfSig} sfZone={sfZone}
            tradeSetups={tradeSetups} tradeSetupLoad={tradeSetupLoad} tradeSetupError={tradeSetupError}
            setScanResults={setScanResults} setScanExpanded={setScanExpanded} setScanError={setScanError}
            setScanLoading={setScanLoading} setScanTickerInput={setScanTickerInput} setScanLastRun={setScanLastRun}
            setAutoScanMins={setAutoScanMins} setAutoScanOn={setAutoScanOn} setAutoExecStatus={setAutoExecStatus}
            setRiskAccount={setRiskAccount} setRiskPct={setRiskPct}
            setSfMaxPrice={setSfMaxPrice} setSfMinScore={setSfMinScore} setSfSig={setSfSig} setSfZone={setSfZone}
            setQuickLogModal={setQuickLogModal} setTradeSetups={setTradeSetups}
            setActiveTab={setActiveTab} setTerminalSymbol={setTerminalSymbol}
            addScanTicker={addScanTicker} removeScanTicker={removeScanTicker} scoreTicker={scoreTicker}
            toggleFavorite={toggleFavorite} fetchTradeSetup={fetchTradeSetup}
            loadDeepDive={loadDeepDive} loadDeepSocial={loadDeepSocial} runSmartScan={runSmartScan}
            FIVEX_TICKERS={FIVEX_TICKERS} themeMode={themeMode}
            onSelectSymbol={handleSelectSymbol}
          />
        )}
      </div>
      {!stack && (
        <div onMouseDown={onDividerMouseDown} title="Drag to resize"
          style={{ flex: "0 0 10px", width: 10, cursor: "col-resize", alignSelf: "stretch",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 3, height: dragging ? "100%" : 36, borderRadius: 2,
            background: dragging ? C.accent : C.border, transition: dragging ? "none" : "height 0.15s" }} />
        </div>
      )}
      <div style={{ flex: stack ? "1 1 auto" : "1 1 auto", minWidth: 0, width: stack ? "100%" : undefined,
        maxHeight: stack ? undefined : paneHeight, overflowY: stack ? "visible" : "auto",
        border: `1px solid ${C.border}`, borderRadius: 10, padding: selectedSymbol ? 0 : "40px 20px" }}>
        {selectedSymbol ? (
          <MarketTerminalTab key={selectedSymbol} C={C} MONO={MONO} SANS={SANS} sectorData={sectorData} macroData={macroData}
            distData={distData} onDeepDive={openDeepDiveFor} setActiveTab={setActiveTab}
            preMktMovers={preMktMovers} marketSession={marketSession} isMobile={true} />
        ) : (
          <div style={{ textAlign: "center", fontFamily: SANS, fontSize: 14, color: C.textDim }}>
            Click a symbol on the left to see its full analysis here — same real Decision / Setup / Technical / Market / Business / Intelligence read Workspace has always shown, just without leaving this tab.
          </div>
        )}
      </div>
    </div>
  );
}
