export default function OpenStockTab({
  C, MONO, themeMode, isMobile, tvOsSymbol, tvOsInput, setTvOsInput, setTvOsSymbol,
}) {
          const tvTheme = themeMode === "dark" ? "dark" : "light";
          const bgColor = C.bg;

          // Use a real served HTML file (not srcDoc) so the iframe has a proper
          // same-origin URL — TradingView scripts are blocked in null-origin frames.
          function tvFrame(widgetName, cfg, height) {
            const sym    = cfg.symbol || "SPY";
            const src    = `/client/tv-widget.html?w=${widgetName}&s=${encodeURIComponent(sym)}&t=${tvTheme}&h=${height}`;
            return (
              <iframe
                key={`${widgetName}-${sym}-${tvTheme}-${height}`}
                src={src}
                style={{ width: "100%", height, border: "none", display: "block" }}
                scrolling="no" title={widgetName}
              />
            );
          }

          const D = { colorTheme: tvTheme, locale: "en", isTransparent: false };
          const sym = tvOsSymbol.toUpperCase();

          const QUICK = ["SPY","QQQ","NVDA","AAPL","MSFT","TSLA","BBAI","PLTR","RKLB","ASTS","SMR","OKLO"];

          const card = (extraStyle = {}) => ({
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
            overflow: "hidden", ...extraStyle,
          });

          const sectionLabel = (icon, text) => (
            <div style={{ display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderBottom: `1px solid ${C.border}`,
              background: C.surface }}>
              <span style={{ fontSize: 13 }}>{icon}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                color: C.textDim, letterSpacing: "0.07em" }}>{text}</span>
            </div>
          );

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* ── Search bar ── */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                padding: "12px 16px", background: C.card,
                border: `1px solid ${C.border}`, borderRadius: 10 }}>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900,
                  color: C.text, letterSpacing: "0.05em" }}>📈 STOCKS</span>
                <input
                  value={tvOsInput}
                  onChange={e => setTvOsInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === "Enter") setTvOsSymbol(tvOsInput.trim() || "SPY"); }}
                  placeholder="Enter ticker…"
                  style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700,
                    background: C.surface, border: `1px solid ${C.accent}`,
                    color: C.text, borderRadius: 6, padding: "6px 12px",
                    width: 130, outline: "none", letterSpacing: "0.05em" }}
                />
                <button onClick={() => setTvOsSymbol(tvOsInput.trim() || "SPY")}
                  style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                    background: C.accent, border: "none", color: "#fff",
                    borderRadius: 6, padding: "7px 16px", cursor: "pointer" }}>
                  GO
                </button>
                {/* Quick tickers */}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {QUICK.map(t => (
                    <button key={t} onClick={() => { setTvOsInput(t); setTvOsSymbol(t); }}
                      style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                        background: sym === t ? `${C.accent}22` : C.surface,
                        border: `1px solid ${sym === t ? C.accent : C.border}`,
                        color: sym === t ? C.accent : C.textDim,
                        borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}>
                      {t}
                    </button>
                  ))}
                </div>
                <a href={`https://www.tradingview.com/chart/?symbol=${sym}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, color: C.textDim,
                    textDecoration: "none", border: `1px solid ${C.border}`,
                    borderRadius: 6, padding: "5px 10px" }}>
                  Open in TradingView ↗
                </a>
              </div>

              {/* ── Symbol info strip (price, change, key stats) ── */}
              <div key={`si-${sym}-${tvTheme}`} style={card()}>
                {sectionLabel("📌", `${sym} — OVERVIEW`)}
                {tvFrame("symbol-info", { ...D, symbol: sym, largeChartUrl: "" }, 90)}
              </div>

              {/* ── Main row: Chart (left) + Technical Analysis (right) ── */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.6fr 1fr", gap: 12 }}>
                <div key={`ch-${sym}-${tvTheme}`} style={card()}>
                  {sectionLabel("📊", "ADVANCED CHART — RSI + MACD")}
                  {tvFrame("advanced-chart", {
                    ...D, symbol: sym, interval: "D", style: "1",
                    details: false, hotlist: false, calendar: false,
                    studies: ["STD;MACD", "STD;RSI"],
                    allow_symbol_change: false, save_image: false,
                    hide_top_toolbar: false, hide_legend: false,
                  }, isMobile ? 360 : 520)}
                </div>
                <div key={`ta-${sym}-${tvTheme}`} style={card()}>
                  {sectionLabel("🎯", "TECHNICAL ANALYSIS — MULTI TIMEFRAME")}
                  {tvFrame("technical-analysis", {
                    ...D, symbol: sym, interval: "1D", showIntervalTabs: true,
                    displayMode: "multiple",
                  }, isMobile ? 300 : 520)}
                </div>
              </div>

              {/* ── Bottom row: Financials (left) + News (right) ── */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr", gap: 12 }}>
                <div key={`fn-${sym}-${tvTheme}`} style={card()}>
                  {sectionLabel("💰", "FINANCIALS — INCOME / BALANCE / CASH FLOW")}
                  {tvFrame("financials", {
                    ...D, symbol: sym, displayMode: "regular",
                  }, isMobile ? 400 : 500)}
                </div>
                <div key={`nl-${sym}-${tvTheme}`} style={card()}>
                  {sectionLabel("📰", `NEWS — ${sym}`)}
                  {tvFrame("timeline", {
                    ...D, feedMode: "symbol", symbol: sym, displayMode: "regular",
                  }, isMobile ? 300 : 500)}
                </div>
              </div>

            </div>
          );
}
