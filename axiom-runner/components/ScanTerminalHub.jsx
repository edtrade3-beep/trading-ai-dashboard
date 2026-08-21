import { useState, useEffect, useRef } from "react";
import RhProScanner from "./RhProScanner.jsx";
import SmartScanTab from "./SmartScanTab.jsx";
import MarketTerminalTab from "./MarketTerminalTab.jsx";

// ScanTerminalHub — Discover + Smart Scan + Workspace merged into one tab
// (2026-08-20, explicit user request: "I want one tab combine all three
// somehow"). A full-width scan table on top (toggle between Discover's
// ~100-symbol full market and Smart Scan's curated watchlist — both real
// universes, not merged into one new table), Workspace's single-symbol
// deep-dive in a collapsible panel below it, updating in place — no tab
// navigation. Originally shipped as a side-by-side split with a draggable
// divider; replaced with this collapsible bottom panel per explicit
// follow-up feedback ("dont like it to be dragged i want it to be hidden
// to bottom not side").
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

  // Bottom detail panel (2026-08-20, replaces the side-by-side draggable
  // split per explicit user feedback: "dont like it to be dragged i want
  // it to be hidden to bottom not side") — the scan table now runs full
  // width, and Workspace's deep-dive lives in a collapsible panel below
  // it instead of a resizable side pane. Collapsed by default (matches
  // this app's own established "real content, just not the first thing
  // shown" convention — same as RhProScanner's showManageUniverse etc);
  // selecting a symbol auto-opens it, and it can be collapsed again
  // without losing the selection.
  const [detailOpen, setDetailOpen] = useState(false);
  const detailRef = useRef(null);

  // Detail-panel symbol — lazy (nothing fetches until a real row click),
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
    setDetailOpen(true);
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
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
      {/* Bottom detail panel — collapsible, not a side pane (2026-08-20,
          explicit user feedback). Header always visible so the panel is
          discoverable even before a symbol's been picked; body only
          renders (and MarketTerminalTab only mounts, so nothing fetches)
          while open. */}
      <div ref={detailRef} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        <button onClick={() => setDetailOpen(v => !v)}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", background: C.card, border: "none", cursor: "pointer",
            fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>
          <span>📈 {selectedSymbol ? `${selectedSymbol} — Full Analysis` : "Full Analysis"}</span>
          <span style={{ color: C.accent }}>{detailOpen ? "▴ Hide" : "▾ Show"}</span>
        </button>
        {detailOpen && (
          <div style={{ padding: selectedSymbol ? 14 : "40px 20px", borderTop: `1px solid ${C.border}` }}>
            {selectedSymbol ? (
              <MarketTerminalTab key={selectedSymbol} C={C} MONO={MONO} SANS={SANS} sectorData={sectorData} macroData={macroData}
                distData={distData} onDeepDive={openDeepDiveFor} setActiveTab={setActiveTab}
                preMktMovers={preMktMovers} marketSession={marketSession} isMobile={isMobile} />
            ) : (
              <div style={{ textAlign: "center", fontFamily: SANS, fontSize: 14, color: C.textDim }}>
                Click a symbol above to see its full analysis here — same real Decision / Setup / Technical / Market / Business / Intelligence read Workspace has always shown, just without leaving this tab.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
