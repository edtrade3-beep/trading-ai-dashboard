import TerminalWorkspace from "./TerminalWorkspace.jsx";

// Legacy multi-panel Terminal chart area — the "terminal" tab (reachable via
// TF/LAYOUT palette commands), distinct from the consolidated MarketTerminalTab.
// Three modes gated on tvChartMode: embed the users own saved TradingView chart
// (once a URL is connected), a one-time setup form to connect that URL, or the
// built-in multi-panel TerminalWorkspace widget.
export default function TerminalChartArea({
  C, MONO, SANS, activeTab, tvChartMode, myTvChartUrl, setTvChartMode, setMyTvChartUrl,
  watchlistData, macroData, sectorData, newsData, alerts, terminalSymbol, setTerminalSymbol,
  terminalTf, setTerminalTf, terminalCandles, terminalCandlesLoading, terminalLayout, setTerminalLayout,
  hotkeyProfile, setHotkeyProfile, drawTools, setDrawTools, activePanelSymbols, handlePanelSymbolChange,
  terminalPanelCandles, terminalFundamentals, marketSession, setQuickLogModal, watchlistSymbols,
  setWatchlistSymbols, setWatchlistInput,
}) {
  if (activeTab !== "terminal") return null;

  if (tvChartMode === "my_chart" && myTvChartUrl) {
    return (
          <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 90px)" }}>
            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
              background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.accent }}>📊 MY TRADINGVIEW CHART</span>
              <span style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Your saved layout with all your indicators and data</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button onClick={() => { setTvChartMode("widget"); localStorage.setItem("tv_chart_mode","widget"); }}
                  style={{ fontFamily: MONO, fontSize: 12, border: `1px solid ${C.border}`, background: C.card, color: C.textSec, borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>
                  ← BACK TO BUILT-IN
                </button>
                <a href={myTvChartUrl} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: MONO, fontSize: 12, border: `1px solid ${C.accent}44`, background: `${C.accent}12`, color: C.accent, borderRadius: 6, padding: "3px 10px", textDecoration: "none" }}>
                  OPEN IN TRADINGVIEW ↗
                </a>
              </div>
            </div>
            {/* Full chart embed */}
            <iframe
              src={myTvChartUrl}
              title="My TradingView Chart"
              allow="fullscreen; clipboard-write"
              style={{ flex: 1, border: "none", width: "100%", display: "block" }}
            />
          </div>
    );
  }

  // ── MY CHART SETUP — shown when no chart URL set yet ──
  if (tvChartMode === "my_chart" && !myTvChartUrl) {
    return (
          <div style={{ padding: "40px 30px", maxWidth: 600, margin: "0 auto" }}>
            <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.text, marginBottom: 8 }}>
              📊 Connect Your TradingView Chart
            </div>
            <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, marginBottom: 24, lineHeight: 1.7 }}>
              Embed your personal TradingView chart with all your custom indicators, Pine Scripts, and saved layouts directly here.
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px 24px", marginBottom: 20 }}>
              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12 }}>HOW TO GET YOUR CHART URL:</div>
              {[
                "Open TradingView and go to your chart",
                'Click Share → "Get Link" → Copy the URL',
                'Or just copy the URL from your browser address bar',
                "Paste it below and click CONNECT",
              ].map((step, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.accent, flexShrink: 0 }}>{i+1}.</span>
                  <span style={{ fontFamily: SANS, fontSize: 12, color: C.textSec }}>{step}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                placeholder="https://www.tradingview.com/chart/XXXXXX/"
                style={{ flex: 1, border: `1px solid ${C.border}`, background: C.surface, color: C.text,
                  borderRadius: 6, padding: "10px 14px", fontFamily: MONO, fontSize: 12, outline: "none" }}
                id="tv-chart-url-input"
              />
              <button
                onClick={() => {
                  const url = document.getElementById("tv-chart-url-input").value.trim();
                  if (url && url.includes("tradingview.com")) {
                    setMyTvChartUrl(url);
                    localStorage.setItem("my_tv_chart_url", url);
                  } else {
                    alert("Please enter a valid TradingView chart URL");
                  }
                }}
                style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, background: C.accent,
                  border: "none", color: "#fff", borderRadius: 6, padding: "10px 20px", cursor: "pointer" }}>
                CONNECT
              </button>
            </div>
            <button onClick={() => { setTvChartMode("widget"); localStorage.setItem("tv_chart_mode","widget"); }}
              style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, background: "none", border: "none",
                cursor: "pointer", marginTop: 12, textDecoration: "underline" }}>
              Use built-in chart instead
            </button>
          </div>
    );
  }

  if (tvChartMode === "widget" && watchlistData.length > 0) {
    return (
          <TerminalWorkspace
            watchlistData={watchlistData}
            macroData={macroData}
            sectorData={sectorData}
            newsData={newsData}
            alerts={alerts}
            selectedSymbol={terminalSymbol}
            onSelectSymbol={setTerminalSymbol}
            timeframe={terminalTf}
            onTimeframeChange={setTerminalTf}
            candleData={terminalCandles}
            loadingCandles={terminalCandlesLoading}
            terminalLayout={terminalLayout}
            onLayoutChange={setTerminalLayout}
            hotkeyProfile={hotkeyProfile}
            onHotkeyProfileChange={setHotkeyProfile}
            drawTools={drawTools}
            onDrawToolsChange={setDrawTools}
            panelSymbols={activePanelSymbols}
            onPanelSymbolChange={handlePanelSymbolChange}
            panelCandleMap={terminalPanelCandles}
            fundamentals={terminalFundamentals}
            marketSession={marketSession}
            onQuickLog={setQuickLogModal}
            watchlistSymbols={watchlistSymbols}
            onWatchlistChange={(next) => { setWatchlistSymbols(next); setWatchlistInput(next.join(",")); }}
          />
    );
  }

  return null;
}
