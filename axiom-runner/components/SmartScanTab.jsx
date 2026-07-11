import { computeGreenLight } from "./trading-utils.js";
import { smartScanZoneOf, exportSmartScanZonePDF } from "./smartscan-shared.js";
import { FIVEX_REF } from "./fivex-data.js";

export default function SmartScanTab({
  C, MONO, SANS, isTablet, macroData, watchlistSymbols,
  scanResults, scanExpanded, scanError, scanLoading, scanProgress, scanLastRun,
  scanFavorites, scanHistory, scanDeepData, scanDeepLoad, scanTickerInput, customScanTickers,
  deepSocialData, autoScanMins, autoScanOn, autoScanCountdown, autoExecStatus,
  riskAccount, riskPct, sfMaxPrice, sfMinScore, sfSig, sfZone,
  tradeSetups, tradeSetupLoad, tradeSetupError,
  setScanResults, setScanExpanded, setScanError, setScanLoading, setScanTickerInput, setScanLastRun,
  setAutoScanMins, setAutoScanOn, setAutoExecStatus, setRiskAccount, setRiskPct,
  setSfMaxPrice, setSfMinScore, setSfSig, setSfZone, setQuickLogModal, setTradeSetups,
  setActiveTab, setTerminalSymbol,
  addScanTicker, removeScanTicker, scoreTicker, toggleFavorite, fetchTradeSetup, loadDeepDive, loadDeepSocial,
  runSmartScan, FIVEX_TICKERS, themeMode,
}) {
          // ── Signal badge style helper ─────────────────────────────────────
          const SIG_STYLE = (sColor) => ({
            display: "inline-block", fontFamily: MONO, fontSize: 12, fontWeight: 800,
            color: sColor, background: sColor + "22", border: `1px solid ${sColor}44`,
            borderRadius: 6, padding: "3px 8px", whiteSpace: "nowrap",
          });

          // ── Apply filters using hoisted state (sfSig, sfMinScore, sfMaxPrice, sfZone) ──
          const filteredResults = scanResults.filter(r => {
            const px = Number(r.quote?.price || 0);
            if (sfSig !== "ALL" && r.signal !== sfSig) return false;
            if (sfMinScore > 0 && (r.score || 0) < sfMinScore) return false;
            if (sfMaxPrice > 0 && px > sfMaxPrice) return false;
            // eslint-disable-next-line no-unused-vars
            if (sfZone !== "ALL") {
              const ref2 = FIVEX_REF[r.ticker];
              let z = "";
              if (px > 0 && ref2) {
                if (px <= ref2.stop) z = "STOP";
                else if (px <= ref2.e3) z = "DEEP";
                else if (px <= ref2.e2) z = "BETTER";
                else if (px <= ref2.e1) z = "STARTER";
                else if (px >= ref2.trigger) z = "ABOVE";
                else z = "WAIT";
              }
              if (!z.includes(sfZone)) return false;
            }
            return true;
          // Sort: favorites pinned to top
          }).sort((a, b) => {
            const aFav = scanFavorites.has(a.ticker) ? 1 : 0;
            const bFav = scanFavorites.has(b.ticker) ? 1 : 0;
            return bFav - aFav; // favorites first, then original order
          });

          // ── Summary counts ────────────────────────────────────────────────
          const sigCounts = { "STRONG BUY": 0, "BUY": 0, "WATCH": 0, "NEUTRAL": 0, "AVOID": 0 };
          scanResults.forEach(r => { if (sigCounts[r.signal] !== undefined) sigCounts[r.signal]++; });

          const STAT_CARDS = [
            { label: "STRONG BUY", count: sigCounts["STRONG BUY"], color: "#00e676" },
            { label: "BUY",        count: sigCounts["BUY"],        color: "#4caf50" },
            { label: "WATCH",      count: sigCounts["WATCH"],      color: "#26a69a" },
            { label: "NEUTRAL",    count: sigCounts["NEUTRAL"],    color: "#ffaa00" },
            { label: "AVOID",      count: sigCounts["AVOID"],      color: "#ff4444" },
          ];

          return (
            <div style={{ padding: "0 2px" }}>

              {/* ── PDF zone export ── */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.textDim }}>📄 EXPORT PDF:</span>
                {[["BUY", C.green], ["WATCH", "#d97706"], ["SELL", C.red]].map(([z, col]) => {
                  const zoneRows = scanResults.filter(r => smartScanZoneOf(r.signal) === z);
                  return (
                    <button key={z} onClick={() => exportSmartScanZonePDF(zoneRows, z)}
                      title={`Export the ${zoneRows.length} ${z}-zone symbols to a PDF`}
                      style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 6,
                        border: `1px solid ${col}`, background: `${col}14`, color: col, cursor: "pointer" }}>
                      {z} ({zoneRows.length})
                    </button>
                  );
                })}
              </div>

              {/* ── Header ── */}
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12,
                marginBottom: 14, padding: "12px 16px",
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.text,
                    letterSpacing: "0.06em" }}>🧠 SMART SCANNER</div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 2 }}>
                    AI-scored momentum + SMC structure + trend quality — Final Verdict for every setup
                  </div>
                </div>
                {/* ── Risk Position Sizer — always visible in scanner ── */}
                {(() => {
                  // Uses hoisted riskAccount / riskPct state (Rules of Hooks)
                  const riskDollars = Math.round(Number(riskAccount) * Number(riskPct) / 100);
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.textDim }}>💰 RISK</span>
                      <span style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>$</span>
                      <input type="number" value={riskAccount} onChange={e => { setRiskAccount(e.target.value); try{localStorage.setItem("risk_account",e.target.value);}catch{} }}
                        style={{ width: 72, fontFamily: MONO, fontSize: 12, background: "transparent", border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "3px 5px", textAlign: "right" }} />
                      <span style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>@</span>
                      <input type="number" value={riskPct} min="0.25" max="5" step="0.25" onChange={e => { setRiskPct(e.target.value); try{localStorage.setItem("risk_pct",e.target.value);}catch{} }}
                        style={{ width: 42, fontFamily: MONO, fontSize: 12, background: "transparent", border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "3px 5px", textAlign: "right" }} />
                      <span style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>%</span>
                      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.amber }}>= ${riskDollars.toLocaleString()}</span>
                    </div>
                  );
                })()}

                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {scanLastRun && (
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                      Last scan: {scanLastRun.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})} · {scanResults.length} stocks
                    </span>
                  )}
                  {scanLoading && false && (
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent }}>
                      ⌛ Scanning {scanProgress.done}/{scanProgress.total} stocks…
                      <div style={{ marginTop: 4, width: 160, height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${Math.round((scanProgress.done / scanProgress.total) * 100)}%`,
                          height: "100%", background: C.accent, borderRadius: 2, transition: "width 0.3s" }} />
                      </div>
                    </div>
                  )}
                  {/* Auto-scan interval selector */}
                  <select value={autoScanMins} onChange={e => {
                    const v = Number(e.target.value);
                    setAutoScanMins(v);
                    localStorage.setItem("smartscan_auto_mins", String(v));
                    // Selecting an interval implies the user wants auto on
                    setAutoScanOn(true);
                    localStorage.setItem("smartscan_auto_on", "true");
                  }}
                    style={{ fontFamily: MONO, fontSize: 12, background: C.surface, border: `1px solid ${C.border}`,
                      color: C.textSec, borderRadius: 6, padding: "4px 6px", cursor: "pointer" }}>
                    <option value={1}>1 min</option>
                    <option value={5}>5 min</option>
                    <option value={10}>10 min</option>
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                  </select>
                  {/* Auto toggle */}
                  <button onClick={() => setAutoScanOn(v => {
                    localStorage.setItem("smartscan_auto_on", String(!v));
                    return !v;
                  })}
                    style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                      background: autoScanOn ? `${C.amber}18` : C.surface,
                      border: `1px solid ${autoScanOn ? C.amber : C.border}`,
                      color: autoScanOn ? C.amber : C.textDim,
                      borderRadius: 6, padding: "7px 12px", cursor: "pointer", minWidth: 90, textAlign: "center" }}>
                    {autoScanOn
                      ? `⏱ NEXT SCAN ${Math.floor(autoScanCountdown / 60)}:${String(autoScanCountdown % 60).padStart(2, "0")}`
                      : "▶ AUTO ON"}
                  </button>
                  <button onClick={runSmartScan} disabled={scanLoading}
                    style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                      background: scanLoading ? C.surface : `${C.green}18`,
                      border: `1px solid ${scanLoading ? C.border : C.green}`,
                      color: scanLoading ? C.textDim : C.green,
                      borderRadius: 6, padding: "7px 18px", cursor: scanLoading ? "default" : "pointer" }}>
                    {scanLoading ? "⌛ SCANNING…" : "▶ RUN SCAN"}
                  </button>
                </div>
              </div>

              {/* ── Add / Remove custom tickers ── */}
              {(() => {
                const SUGGESTIONS = [
                  "NVDA","TSLA","MSFT","AAPL","AMZN","META","GOOGL","AMD","AVGO","ARM",
                  "MSTR","COIN","HOOD","IBIT","SHOP","UBER","CRWD","SNOW","DDOG","NET",
                  "ENPH","FSLR","NEE","WOLF","ON","LAZR","AEHR","ANET","FTNT","ZS",
                  "RXRX","BEAM","EDIT","NTLA","CRSP","MRNA","BNTX","TDOC","HIMS","ACMR",
                ];
                const allCurrent = new Set(FIVEX_TICKERS);
                const suggestions = SUGGESTIONS.filter(s => !allCurrent.has(s));

                const addTicker    = (sym) => addScanTicker(sym);
                const removeTicker = (sym) => removeScanTicker(sym);

                return (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
                    padding: "12px 16px", marginBottom: 10 }}>
                    {/* Add row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, whiteSpace: "nowrap" }}>
                        ➕ ADD STOCK:
                      </span>
                      <input
                        value={scanTickerInput}
                        onChange={e => setScanTickerInput(e.target.value.toUpperCase().replace(/[^A-Z0-9.-]/g, ""))}
                        onKeyDown={e => { if (e.key === "Enter") addTicker(scanTickerInput); }}
                        placeholder="TICKER…"
                        style={{ width: 100, background: C.surface, border: `1px solid ${C.border}`, color: C.text,
                          fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "5px 10px", borderRadius: 6, outline: "none" }}
                      />
                      <button onClick={() => addTicker(scanTickerInput)} disabled={!scanTickerInput.trim()}
                        style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                          background: scanTickerInput.trim() ? `${C.green}18` : C.surface,
                          border: `1px solid ${scanTickerInput.trim() ? C.green : C.border}`,
                          color: scanTickerInput.trim() ? C.green : C.textDim,
                          borderRadius: 6, padding: "5px 14px", cursor: scanTickerInput.trim() ? "pointer" : "default" }}>
                        ADD
                      </button>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                        {FIVEX_TICKERS.length} stocks in scan
                      </span>
                      {/* Scan my watchlist button */}
                      <button
                        onClick={() => {
                          const wlSyms = watchlistSymbols.slice(0, 40);
                          if (!wlSyms.length) return;
                          // Temporarily replace scan universe with watchlist
                          setScanLoading(true); setScanError(null); setScanResults([]);
                          fetch(`/api/scanner/smart-scan?tickers=${wlSyms.join(",")}`)
                            .then(r => r.json()).then(data => {
                              if (!data.ok) throw new Error(data.error || "Scan failed");
                              const scored = (data.results||[]).map(({ticker,quote,candles}) => ({...scoreTicker(ticker,quote,candles), quote, candles})).sort((a,b) => b.score - a.score);
                              setScanResults(scored); setScanLastRun(new Date());
                            }).catch(e => setScanError(e.message)).finally(() => setScanLoading(false));
                        }}
                        style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, border: `1px solid ${C.accent}44`,
                          background: `${C.accent}12`, color: C.accent, borderRadius: 6, padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
                        📋 SCAN MY WATCHLIST ({watchlistSymbols.length})
                      </button>
                    </div>

                    {/* Custom tickers chips */}
                    {customScanTickers.length > 0 && (
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                        {customScanTickers.map(sym => (
                          <span key={sym} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                            color: C.accent, background: `${C.accent}18`, border: `1px solid ${C.accent}44`,
                            borderRadius: 6, padding: "3px 8px", display: "flex", alignItems: "center", gap: 4 }}>
                            {sym}
                            <span onClick={() => removeTicker(sym)}
                              style={{ cursor: "pointer", color: C.red, fontWeight: 900, fontSize: 12, lineHeight: 1 }}>
                              ×
                            </span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Suggestion chips */}
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, whiteSpace: "nowrap", marginRight: 4 }}>
                        💡 SUGGESTIONS:
                      </span>
                      {suggestions.slice(0, 20).map(sym => (
                        <button key={sym} onClick={() => addTicker(sym)}
                          style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                            color: C.textSec, background: C.surface, border: `1px solid ${C.border}`,
                            borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>
                          + {sym}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ── Error ── */}
              {scanError && (
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.red,
                  background: C.redBg, border: `1px solid ${C.red}44`,
                  borderRadius: 6, padding: "8px 14px", marginBottom: 10 }}>
                  ⚠ {scanError}
                </div>
              )}

              {/* ── Empty state ── */}
              {!scanLoading && !scanError && scanResults.length === 0 && (
                <div style={{ textAlign: "center", padding: "50px 20px" }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8 }}>
                    Auto-scanning {FIVEX_TICKERS.length} stocks…
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, maxWidth: 400, margin: "0 auto" }}>
                    Checking RSI · MACD · EMA · Entry zones · Volume · 52W position · Sentiment
                  </div>
                </div>
              )}

              {/* ── Summary stat cards ── */}
              {scanResults.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                  {STAT_CARDS.map(sc => (
                    <div key={sc.label} style={{ flex: "1 1 100px", minWidth: 90,
                      background: C.card, border: `1px solid ${sc.color}44`,
                      borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
                      <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 900, color: sc.color,
                        lineHeight: 1 }}>
                        {sc.count}
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: sc.color + "cc",
                        marginTop: 4, letterSpacing: "0.06em" }}>
                        {sc.label}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── FILTER BAR — always shown ── */}
              {(
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                  marginBottom: 10, padding: "10px 14px",
                  background: C.card, border: `1px solid ${C.border}`, borderRadius: 8 }}>

                  {/* Signal filter */}
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginRight: 2 }}>SIGNAL</span>
                    {["ALL","STRONG BUY","BUY","WATCH","NEUTRAL","AVOID"].map(s => (
                      <button key={s} onClick={() => { setSfSig(s); try{localStorage.setItem("sf_sig",s);}catch{} }}
                        style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, border: "none",
                          background: sfSig === s ? C.accent : C.surface,
                          color: sfSig === s ? "#fff" : C.textDim,
                          borderRadius: 6, padding: "4px 8px", cursor: "pointer",
                          minHeight: 28 }}>
                        {s === "ALL" ? "ALL" : s}
                      </button>
                    ))}
                  </div>

                  <span style={{ width: 1, height: 20, background: C.border }} />

                  {/* Zone filter */}
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginRight: 2 }}>ZONE</span>
                    {["ALL","DEEP","BETTER","STARTER","ABOVE","WAIT"].map(z => (
                      <button key={z} onClick={() => setSfZone(z)}
                        style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, border: "none",
                          background: sfZone === z ? "#26a69a" : C.surface,
                          color: sfZone === z ? "#fff" : C.textDim,
                          borderRadius: 6, padding: "4px 8px", cursor: "pointer",
                          minHeight: 28 }}>
                        {z}
                      </button>
                    ))}
                  </div>

                  <span style={{ width: 1, height: 20, background: C.border }} />

                  {/* Score filter */}
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginRight: 2 }}>MIN SCORE</span>
                    {[[0,"ALL"],[60,"60+"],[70,"70+"],[80,"80+"],[90,"90+"]].map(([v,lbl]) => (
                      <button key={v} onClick={() => { setSfMinScore(v); try{localStorage.setItem("sf_score",String(v));}catch{} }}
                        style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, border: "none",
                          background: sfMinScore === v ? C.green : C.surface,
                          color: sfMinScore === v ? "#fff" : C.textDim,
                          borderRadius: 6, padding: "4px 8px", cursor: "pointer",
                          minHeight: 28 }}>
                        {lbl}
                      </button>
                    ))}
                  </div>

                  <span style={{ width: 1, height: 20, background: C.border }} />

                  {/* Price filter */}
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <span style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>MAX $</span>
                    <input type="number" value={sfMaxPrice || ""} placeholder="Any"
                      onChange={e => setSfMaxPrice(Number(e.target.value) || 0)}
                      style={{ width: 70, fontFamily: MONO, fontSize: 12,
                        background: C.surface, border: `1px solid ${C.border}`,
                        color: C.text, borderRadius: 6, padding: "4px 6px" }} />
                  </div>

                  {/* A+ ONE-CLICK filter */}
                  <button
                    onClick={() => {
                      const isAPlus = sfMinScore === 80 && sfZone === "ALL" && sfSig === "ALL";
                      if (isAPlus) { setSfMinScore(0); setSfZone("ALL"); setSfSig("ALL"); try{localStorage.setItem("sf_score","0");localStorage.setItem("sf_sig","ALL");}catch{} }
                      else { setSfMinScore(80); setSfZone("ALL"); setSfSig("ALL"); try{localStorage.setItem("sf_score","80");localStorage.setItem("sf_sig","ALL");}catch{} }
                    }}
                    style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, border: "none",
                      background: sfMinScore === 80 ? C.accent : `${C.accent}18`,
                      color: sfMinScore === 80 ? "#fff" : C.accent,
                      borderRadius: 6, padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
                    {sfMinScore === 80 ? "✓ A+ ONLY" : "⚡ A+ FILTER"}
                  </button>

                  {/* Active filter count + clear */}
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: filteredResults.length < scanResults.length ? C.accent : C.textDim }}>
                      {filteredResults.length}/{scanResults.length} shown
                    </span>
                    {(sfSig !== "ALL" || sfZone !== "ALL" || sfMinScore > 0 || sfMaxPrice > 0) && (
                      <button onClick={() => { setSfSig("ALL"); setSfZone("ALL"); setSfMinScore(0); setSfMaxPrice(0); }}
                        style={{ fontFamily: MONO, fontSize: 12, border: `1px solid ${C.border}`,
                          background: C.surface, color: C.red, borderRadius: 6,
                          padding: "3px 8px", cursor: "pointer" }}>
                        ✕ CLEAR
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ── Results table ── */}
              {scanResults.length > 0 && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 10, overflow: "hidden" }}>
                  {/* Tablet: show scroll hint */}
                  {isTablet && (
                    <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim,
                      padding: "6px 12px", background: C.surface,
                      borderBottom: `1px solid ${C.border}22`, textAlign: "center" }}>
                      ← Swipe table to see all columns · Tap row to expand deep dive →
                    </div>
                  )}
                  <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isTablet ? 900 : "auto" }}>
                    <thead>
                      <tr style={{ background: C.surface }}>
                        {(isTablet
                          ? ["#","SCORE","SIGNAL","TICKER","PRICE","ZONE",""]
                          : ["#","SCORE","SIGNAL","TICKER","PRICE","RSI","ZONE","UPSIDE","THESIS",""]
                        ).map(h => (
                          <th key={h} style={{ fontFamily: MONO, fontSize: isTablet ? 11 : 10, fontWeight: 700,
                            color: C.textDim, padding: isTablet ? "10px 10px" : "8px 10px",
                            textAlign: h === "#" ? "center" : "left",
                            letterSpacing: "0.05em", borderBottom: `1px solid ${C.border}`,
                            whiteSpace: "nowrap" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.map((row, idx) => {
                        const isExpanded = scanExpanded === row.ticker;
                        const ref = FIVEX_REF[row.ticker];
                        const livePrice = Number(row.quote?.price || 0);
                        // ── Master verdict (composite) — computed once so the score bar AND the badge agree. ──
                        const _px2 = Number(livePrice || row.quote?.price || 0);
                        const _hi = Number(row.quote?.yearHigh || 0), _lo = Number(row.quote?.yearLow || 0);
                        const _ma50 = Number(row.quote?.priceAvg50 || 0), _ma200 = Number(row.quote?.priceAvg200 || 0);
                        const _ttChecks = [
                          _ma200 > 0 && _px2 > _ma200, _ma50 > 0 && _ma200 > 0 && _ma50 > _ma200, _ma50 > 0 && _px2 > _ma50,
                          _lo > 0 && _px2 >= _lo * 1.30, _hi > 0 && _px2 >= _hi * 0.75,
                          (row.rsiVal || 50) >= 55, !!(row.ema9v && row.ema21v && row.ema9v > row.ema21v),
                        ].filter(Boolean).length;
                        const _ttScore = Math.round(_ttChecks / 7 * 100);
                        const _macdScore = row.macdBull === true ? 72 : row.macdBull === false ? 30 : 50;
                        const composite = (row.score || 50) * 0.35 + _ttScore * 0.35 + _macdScore * 0.15 + 50 * 0.15;
                        const verdictColor = composite >= 72 ? "#00e676" : composite >= 62 ? C.green : composite >= 53 ? C.amber : composite >= 40 ? C.red : "#ff2244";
                        const verdictLabel = composite >= 72 ? "STRONG BUY" : composite >= 62 ? "BUY" : composite >= 53 ? "WATCH" : composite >= 40 ? "AVOID" : "SELL/SHORT";
                        const liveChg   = Number(row.quote?.changePercent || 0);
                        const yH = Number(row.quote?.yearHigh || 0);
                        const yL = Number(row.quote?.yearLow  || 0);

                        // Zone label — use ref levels if available, else compute from live price %
                        let zoneLbl = "—", zoneCol = C.textDim;
                        if (livePrice > 0) {
                          if (ref) {
                            if      (livePrice <= ref.stop)    { zoneLbl = "⚠ STOP";    zoneCol = C.red; }
                            else if (livePrice <= ref.e3)      { zoneLbl = "🟢 DEEP";    zoneCol = "#00e676"; }
                            else if (livePrice <= ref.e2)      { zoneLbl = "⚡ BETTER";  zoneCol = "#4caf50"; }
                            else if (livePrice <= ref.e1)      { zoneLbl = "🔵 STARTER"; zoneCol = "#26a69a"; }
                            else if (livePrice >= ref.trigger) { zoneLbl = "🔶 ABOVE";   zoneCol = "#ff9900"; }
                            else                               { zoneLbl = "WAIT";       zoneCol = C.textDim; }
                          } else {
                            // Dynamic zone from live price for custom tickers
                            const d1w = livePrice * 0.95;  // -5%  starter
                            const d2w = livePrice * 0.88;  // -12% better
                            const d3w = livePrice * 0.80;  // -20% deep
                            const trg = livePrice * 1.05;  // +5%  above
                            const stp = livePrice * 0.75;  // -25% stop
                            // For a flat current price, show zone relative to day change
                            const chg = Number(row.quote?.changePercent || 0);
                            if      (chg >= 5)   { zoneLbl = "🔶 ABOVE";   zoneCol = "#ff9900"; }
                            else if (chg >= 1)   { zoneLbl = "🔵 STARTER"; zoneCol = "#26a69a"; }
                            else if (chg >= -3)  { zoneLbl = "WATCH";      zoneCol = C.textSec; }
                            else if (chg >= -8)  { zoneLbl = "⚡ BETTER";  zoneCol = "#4caf50"; }
                            else if (chg >= -15) { zoneLbl = "🟢 DEEP";    zoneCol = "#00e676"; }
                            else                 { zoneLbl = "⚠ STOP";    zoneCol = C.red; }
                          }
                        }

                        const emaLabel = (row.ema9v && row.ema21v)
                          ? (row.ema9v > row.ema21v ? "9>21 ▲" : "9<21 ▼")
                          : "—";
                        const emaCol   = (row.ema9v && row.ema21v)
                          ? (row.ema9v > row.ema21v ? C.green : C.red)
                          : C.textDim;

                        const deepData = scanDeepData[row.ticker];
                        const isLoading = scanDeepLoad[row.ticker];
                        const fd = deepData?.fundamentals;
                        const fv = deepData?.fv; // Finviz stats — primary for analyst/ownership data

                        const $ = v => (v == null || isNaN(v)) ? "—" : `$${Number(v).toFixed(2)}`;
                        const fmt = (v, decimals = 2) => (v == null || isNaN(v)) ? "—" : Number(v).toFixed(decimals);

                        return (
                          <React.Fragment key={row.ticker}>
                            {/* ── Main row ── */}
                            <tr
                              onClick={() => {
                                if (scanExpanded === row.ticker) {
                                  setScanExpanded(null);
                                } else {
                                  setScanExpanded(row.ticker);
                                  loadDeepDive(row.ticker);
                                  loadDeepSocial(row.ticker);
                                  setTimeout(() => fetchTradeSetup(row.ticker, row), 1200);
                                }
                              }}
                              style={{
                                cursor: "pointer",
                                // Color-code rows by signal for instant scanning
                                background: isExpanded
                                  ? `${row.sColor}18`
                                  : row.score >= 82 ? `${C.green}0c`   // A+ strong green
                                  : row.score >= 70 ? `${C.green}06`   // BUY mild green
                                  : row.score <= 30 ? `${C.red}0a`     // SHORT red
                                  : row.score <= 40 ? `${C.red}06`     // AVOID mild red
                                  : (idx % 2 === 0 ? "transparent" : C.surface),
                                borderLeft: isExpanded ? `4px solid ${row.sColor}` :
                                  row.score >= 82 ? `4px solid ${C.green}` :
                                  row.score >= 70 ? `3px solid ${C.green}66` :
                                  row.score <= 30 ? `4px solid ${C.red}` :
                                  row.score <= 40 ? `3px solid ${C.red}66` : "3px solid transparent",
                                transition: "background 0.1s",
                              }}
                              onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = C.cardHover; }}
                              onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = row.score >= 82 ? C.green+"0c" : row.score >= 70 ? C.green+"06" : row.score <= 30 ? C.red+"0a" : row.score <= 40 ? C.red+"06" : idx % 2 === 0 ? "transparent" : C.surface; }}
                            >
                              {/* Rank + Favorite star */}
                              <td style={{ textAlign: "center", padding: "8px 6px",
                                borderBottom: `1px solid ${C.border}22` }}>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                  <button onClick={e => { e.stopPropagation(); toggleFavorite(row.ticker); }}
                                    title={scanFavorites.has(row.ticker) ? "Unpin" : "Pin to top"}
                                    style={{ border: "none", background: "transparent", cursor: "pointer",
                                      fontSize: 14, lineHeight: 1, padding: 0,
                                      color: scanFavorites.has(row.ticker) ? "#f59e0b" : C.textDim + "66" }}>
                                    {scanFavorites.has(row.ticker) ? "★" : "☆"}
                                  </button>
                                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{idx + 1}</span>
                                </div>
                              </td>

                              {/* Score bar */}
                              <td style={{ padding: "12px 12px", borderBottom: `1px solid ${C.border}22`,
                                minWidth: 90 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <div style={{ flex: 1, height: 6, background: C.border, borderRadius: 5,
                                    overflow: "hidden", minWidth: 50 }}>
                                    {/* Bar is colored by the FINAL verdict so it never looks green next to an AVOID badge */}
                                    <div style={{ width: `${row.score}%`, height: "100%",
                                      background: verdictColor, borderRadius: 5, transition: "width 0.4s" }} />
                                  </div>
                                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800,
                                    color: verdictColor, minWidth: 22, textAlign: "right" }}>
                                    {row.score}
                                  </span>
                                </div>
                              </td>

                              {/* Signal badge — uses the hoisted verdict so bar + badge always agree */}
                              <td style={{ padding: "12px 10px", borderBottom: `1px solid ${C.border}22` }}>
                                <div><span style={{ ...SIG_STYLE(verdictColor), background: `${verdictColor}22`, borderColor: `${verdictColor}55`, fontSize: 12 }}>{verdictLabel}</span><div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: verdictColor, marginTop: 2 }}>{composite.toFixed(0)}/100</div></div>
                              </td>

                              {/* Ticker + Quick Read */}
                              <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}22`, minWidth: 180 }}>
                                <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.text }}>
                                  {row.ticker}
                                  {ref?.company && <span style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, fontWeight: 400, marginLeft: 6 }}>{ref.company}</span>}
                                </div>
                                {/* ── QUICK READ: key signals in one line ── */}
                                {(() => {
                                  const chips = [];
                                  const rsi = row.rsiVal;
                                  const ema9 = row.ema9v, ema21 = row.ema21v;
                                  const px = livePrice;
                                  const hi52 = Number(row.quote?.yearHigh || 0);
                                  const lo52 = Number(row.quote?.yearLow  || 0);
                                  const ma50 = Number(row.quote?.priceAvg50 || 0);
                                  const rvol = row.quote?.volume && row.quote?.avgVolume ? row.quote.volume / row.quote.avgVolume : 0;
                                  const chg1w = Number(row.quote?.delta1w || 0);

                                  // ── 🟢 GREEN LIGHT SYSTEM — same engine as the Green Light card ──
                                  (() => {
                                    const spyChgGL = Number((macroData || []).find(m => m.symbol === "SPY")?.changesPercentage || 0);
                                    const passed = computeGreenLight({ ...(row.quote || {}), price: px }, spyChgGL, row).passed;
                                    if (passed >= 4)      chips.push({ txt: `🟢 GREEN LIGHT ${passed}/5`, col: C.green, title: "Green Light System: 4+ checks passed — BUY zone" });
                                    else if (passed === 3) chips.push({ txt: `🟡 ALMOST ${passed}/5`,     col: C.amber, title: "Green Light System: 3/5 — watch, almost ready" });
                                  })();

                                  // RSI signal
                                  if (rsi != null) {
                                    if (rsi < 30)      chips.push({ txt: `RSI ${rsi.toFixed(0)} 🔥`, col: C.green, title: "Oversold — bounce candidate" });
                                    else if (rsi > 70) chips.push({ txt: `RSI ${rsi.toFixed(0)} ⚠`, col: C.red,   title: "Overbought — watch for pullback" });
                                    else               chips.push({ txt: `RSI ${rsi.toFixed(0)}`,   col: C.textDim });
                                  }
                                  // EMA alignment
                                  if (ema9 && ema21) {
                                    chips.push({ txt: ema9 > ema21 ? "EMA ▲" : "EMA ▼", col: ema9 > ema21 ? C.green : C.red, title: ema9 > ema21 ? "EMA 9 above 21 — bullish" : "EMA 9 below 21 — bearish" });
                                  }
                                  // Near 52w extremes
                                  if (hi52 > 0 && lo52 > 0 && px > 0) {
                                    const distLo = (px - lo52) / lo52 * 100;
                                    const distHi = (hi52 - px) / hi52 * 100;
                                    if (distLo < 10)  chips.push({ txt: "Near 52wLo", col: C.green, title: "Within 10% of 52-week low — potential bottom" });
                                    if (distHi < 5)   chips.push({ txt: "Near 52wHi", col: C.amber, title: "Within 5% of 52-week high — watch for top" });
                                  }
                                  // Volume spike
                                  if (rvol > 2.5) chips.push({ txt: `Vol ${rvol.toFixed(1)}x 🔥`, col: C.amber, title: "Volume spike — unusual activity" });
                                  else if (rvol > 1.5) chips.push({ txt: `Vol ${rvol.toFixed(1)}x`, col: C.textDim });
                                  // Sharp move
                                  if (chg1w < -15) chips.push({ txt: `${chg1w.toFixed(0)}% 1w ↘`, col: C.green, title: "Sharp weekly drop — oversold bounce?" });
                                  if (chg1w > 20)  chips.push({ txt: `+${chg1w.toFixed(0)}% 1w ↗`, col: C.red,   title: "Parabolic weekly move — top forming?" });
                                  // MA50 distance
                                  if (ma50 > 0 && px > 0) {
                                    const d50 = (px - ma50) / ma50 * 100;
                                    if (d50 < -15) chips.push({ txt: `${d50.toFixed(0)}% vs MA50`, col: C.green, title: "Far below 50MA — stretched low" });
                                    if (d50 > 20)  chips.push({ txt: `+${d50.toFixed(0)}% vs MA50`, col: C.red,   title: "Far above 50MA — extended high" });
                                  }
                                  // ── ADVANCED PATTERN SIGNALS ─────────────────────────────
                                  const chg1d = Number(row.quote?.changePercent || row.chgPct || 0);
                                  const ma200 = Number(row.quote?.priceAvg200 || 0);

                                  // POSSIBLE BOTTOM — oversold + near low + volume
                                  if (rsi != null && rsi < 35 && hi52 > 0 && lo52 > 0) {
                                    const distLo2 = (px - lo52) / lo52 * 100;
                                    if (distLo2 < 20 && rvol > 1.2)
                                      chips.push({ txt: "🟢 POSSIBLE BOTTOM", col: C.green, title: "RSI oversold + near 52W low + volume — bottom forming?" });
                                  }

                                  // POSSIBLE TOP — overbought + near high + weakening
                                  if (rsi != null && rsi > 68 && hi52 > 0) {
                                    const distHi2 = (hi52 - px) / hi52 * 100;
                                    if (distHi2 < 8)
                                      chips.push({ txt: "🔴 POSSIBLE TOP", col: C.red, title: "RSI overbought + near 52W high — top forming?" });
                                  }

                                  // REBOUND SETUP — was down hard, now recovering
                                  if (chg1w < -10 && chg1d > 0 && rsi != null && rsi < 50)
                                    chips.push({ txt: "↩ REBOUND", col: C.cyan, title: "Down hard last week, bouncing today — rebound setup" });

                                  // OVERSOLD BOUNCE — RSI < 30 + price up today
                                  if (rsi != null && rsi < 32 && chg1d > 0)
                                    chips.push({ txt: "⚡ OVERSOLD BOUNCE", col: C.green, title: "RSI oversold + green today — bounce in progress" });

                                  // CAPITULATION — massive drop + huge volume
                                  if (chg1d < -5 && rvol > 3)
                                    chips.push({ txt: "🩸 CAPITULATION", col: "#ff6b6b", title: "Massive drop on huge volume — potential exhaustion bottom" });

                                  // BREAKOUT WATCH — near 52W high + volume
                                  if (hi52 > 0 && px > 0 && (hi52 - px) / hi52 * 100 < 3 && rvol > 1.5 && rsi > 55)
                                    chips.push({ txt: "🚀 BREAKOUT WATCH", col: C.amber, title: "Near 52W high with volume — potential breakout" });

                                  // DEAD CAT — big bounce after big drop, still bearish trend
                                  if (chg1d > 5 && chg1w < -15 && ema9 && ema21 && ema9 < ema21)
                                    chips.push({ txt: "☠ DEAD CAT?", col: C.red, title: "Big bounce but trend still bearish — dead cat bounce warning" });

                                  // TREND REVERSAL — EMA crossover + volume
                                  if (ema9 && ema21 && Math.abs(ema9 - ema21) / ema21 * 100 < 1 && rvol > 1.5)
                                    chips.push({ txt: "🔀 EMA CROSS", col: C.purple || "#9c27b0", title: "EMA 9 and 21 crossing — trend change forming" });

                                  // DEEP VALUE — RSI < 40 + far below MA50 + above MA200
                                  if (rsi != null && rsi < 40 && ma50 > 0 && (px - ma50) / ma50 * 100 < -10 && ma200 > 0 && px > ma200)
                                    chips.push({ txt: "💎 DEEP VALUE", col: C.cyan, title: "Oversold, below 50MA, but above 200MA — quality dip" });

                                  // PULLBACK TO MA — price just touched MA50
                                  if (ma50 > 0 && Math.abs((px - ma50) / ma50 * 100) < 1.5 && ema9 && ema21 && ema9 > ema21)
                                    chips.push({ txt: "📍 MA50 PULLBACK", col: C.green, title: "Pulling back to 50D MA in uptrend — high probability bounce" });

                                  // SQUEEZE BUILD — low RSI + low volume = coiling
                                  if (rsi != null && rsi > 40 && rsi < 55 && rvol < 0.7)
                                    chips.push({ txt: "🌀 SQUEEZE BUILD", col: C.amber, title: "Low volatility coiling — big move coming soon" });

                                  // Zone
                                  if (zoneLbl && zoneLbl !== "—" && zoneLbl !== "WAIT") {
                                    chips.push({ txt: zoneLbl, col: zoneCol, title: "Current entry zone" });
                                  }
                                  // Thesis
                                  if (ref?.thesis) chips.push({ txt: ref.thesis.slice(0, 35) + (ref.thesis.length > 35 ? "…" : ""), col: C.textDim, italic: true });

                                  if (!chips.length) return null;
                                  return (
                                    <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                                      {chips.map((ch, ci) => (
                                        <span key={ci} title={ch.title || ""}
                                          style={{ fontFamily: ch.italic ? SANS : MONO, fontSize: 10,
                                            color: ch.col, fontStyle: ch.italic ? "italic" : "normal",
                                            fontWeight: ch.col === C.textDim ? 400 : 700,
                                            ...(ch.col !== C.textDim && !ch.italic ? {
                                              background: `${ch.col}18`, borderRadius: 3,
                                              padding: "1px 5px", border: `1px solid ${ch.col}33`
                                            } : {}),
                                          }}>
                                          {ci > 0 && ch.col === C.textDim && !ch.italic && <span style={{ opacity: 0.3, marginRight: 5 }}>·</span>}
                                          {ch.txt}
                                        </span>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </td>

                              {/* Sector — hidden on tablet */}
                              {!isTablet && (
                              <td style={{ fontFamily: MONO, fontSize: 12, color: C.textDim,
                                padding: "12px 12px", borderBottom: `1px solid ${C.border}22`,
                                whiteSpace: "nowrap" }}>
                                {ref?.sector || row.quote?.sector || row.quote?.quoteType || "—"}
                              </td>
                              )}

                              {/* Live price */}
                              <td style={{ padding: "12px 12px", borderBottom: `1px solid ${C.border}22`,
                                textAlign: "right", minWidth: 72 }}>
                                {livePrice > 0 ? (
                                  <>
                                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800,
                                      color: liveChg >= 0 ? C.green : C.red }}>
                                      ${livePrice.toFixed(2)}
                                    </div>
                                    <div style={{ fontFamily: MONO, fontSize: 12,
                                      color: liveChg >= 0 ? C.green : C.red }}>
                                      {liveChg >= 0 ? "+" : ""}{liveChg.toFixed(2)}%
                                    </div>
                                  </>
                                ) : (
                                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>—</span>
                                )}
                              </td>

                              {/* RSI — shown inline in Quick Read, hidden as separate column */}
                              {!isTablet && (
                              <td style={{ fontFamily: MONO, fontSize: 12, textAlign: "center",
                                padding: "12px 10px", borderBottom: `1px solid ${C.border}22`,
                                color: row.rsiVal === null ? C.textDim : row.rsiVal < 30 ? C.green : row.rsiVal > 70 ? C.red : C.text,
                                fontWeight: row.rsiVal !== null ? 700 : 400 }}>
                                {row.rsiVal !== null ? row.rsiVal.toFixed(0) : "—"}
                              </td>
                              )}

                              {/* Zone */}
                              <td style={{ fontFamily: MONO, fontSize: 12, textAlign: "center",
                                padding: "12px 10px", borderBottom: `1px solid ${C.border}22`,
                                color: zoneCol, fontWeight: 700, whiteSpace: "nowrap" }}>
                                {zoneLbl}
                              </td>

                              {/* Vol Pace — hidden, shown in Quick Read */}
                              {false && (() => {
                                const vol    = Number(row.quote?.volume || 0);
                                const avgVol = Number(row.quote?.avgVolume || 0);
                                if (!vol || !avgVol) return <td style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: "12px 10px", borderBottom: `1px solid ${C.border}22`, textAlign: "center" }}>—</td>;
                                const etDate = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
                                const elapsed = Math.max(0.1, (etDate.getHours() - 9) + (etDate.getMinutes() - 30) / 60);
                                const pace = (elapsed > 0 && elapsed < 6.5) ? (vol / elapsed * 6.5) / avgVol : vol / avgVol;
                                const paceCol = pace >= 3 ? C.accent : pace >= 2 ? C.green : pace >= 1.5 ? "#4caf50" : C.textDim;
                                return (
                                  <td style={{ fontFamily: MONO, fontSize: 12, textAlign: "center", padding: "12px 10px", borderBottom: `1px solid ${C.border}22`, color: paceCol, fontWeight: pace >= 1.5 ? 700 : 400 }}>
                                    {pace >= 0.1 ? `${pace.toFixed(1)}×` : "—"}
                                  </td>
                                );
                              })()}
                              {/* Chart Pattern */}
                              {(() => {
                                const px   = Number(livePrice || row.quote?.price || 0);
                                const hi52 = Number(row.quote?.yearHigh || 0);
                                const lo52 = Number(row.quote?.yearLow  || 0);
                                const rsi  = row.rsiVal || 0;
                                const e9   = row.ema9v  || 0;
                                const e21  = row.ema21v || 0;
                                const vol2 = Number(row.quote?.volume || 0);
                                const avg2 = Number(row.quote?.avgVolume || 1);
                                const rvol = avg2 > 0 ? vol2 / avg2 : 0;
                                const chg2 = Number(row.quote?.changePercent || row.quote?.changesPercentage || 0);
                                const yPos = (hi52 > lo52 && px > 0) ? (px - lo52) / (hi52 - lo52) : 0.5;
                                let pat = null, patCol = C.textDim;
                                // Institutional Accumulation: high RVOL + uptrend + near 52w high
                                const smc3  = scanDeepData[row.ticker]?.smc;
                                const bosBull3 = smc3?.bos?.type === "BULL_BOS";
                                const instAccum = rvol >= 2.0 && chg2 > 0 && yPos > 0.6 && e9 > e21 && bosBull3;

                                if (instAccum) { pat = '🏦 SMART $'; patCol = C.accent; }
                                else if (hi52 > 0 && px >= hi52 * 0.97 && rvol >= 1.5 && chg2 > 0) { pat = '🚀 BREAKOUT'; patCol = "#ffd700"; }
                                else if (hi52 > 0 && px >= hi52 * 0.93 && e9 > e21 && rsi >= 55 && rsi <= 72) { pat = '☕ CUP HDL'; patCol = C.green; }
                                else if (chg2 > 3 && rvol >= 1.5 && e9 > e21 && rsi < 72) { pat = '🏈 BULL FLAG'; patCol = '#4caf50'; }
                                else if (yPos > 0.65 && e9 > e21 && rsi >= 50 && rsi <= 65) { pat = '📐 TREND'; patCol = C.cyan; }
                                else if (rsi < 32 && px < e21) { pat = '🔄 OVERSOLD'; patCol = C.amber; }
                                return (
                                  <td style={{ padding: "12px 10px", borderBottom: `1px solid ${C.border}22`, whiteSpace: "nowrap" }}>
                                    {pat ? <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: patCol }}>{pat}</span>
                                         : <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>—</span>}
                                  </td>
                                );
                              })()}

                              {/* Short % */}
                              {/* Short % — hidden on tablet */}
                              {!isTablet && (() => {
                                const sf = Number(row.quote?.shortFloat || row.quote?.shortPercentOfFloat || 0);
                                const shortPct = sf > 1 ? sf : sf > 0 ? sf * 100 : null;
                                const shortCol = shortPct == null ? C.textDim : shortPct > 20 ? C.red : shortPct > 10 ? C.amber : C.textSec;
                                return (
                                  <td style={{ fontFamily: MONO, fontSize: 12, textAlign: "center",
                                    padding: "12px 10px", borderBottom: `1px solid ${C.border}22`,
                                    color: shortCol, fontWeight: shortPct != null ? 700 : 400 }}>
                                    {shortPct != null ? `${shortPct.toFixed(1)}%` : "—"}
                                  </td>
                                );
                              })()}

                              {/* Upside — hidden on tablet */}
                              {!isTablet && (
                              <td style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800,
                                textAlign: "center", padding: "12px 10px",
                                borderBottom: `1px solid ${C.border}22`,
                                color: C.amber }}>
                                {ref?.upside || "—"}
                              </td>
                              )}

                              {/* Thesis — tap to expand indicator */}
                              <td style={{ fontFamily: MONO, fontSize: 12, color: C.textSec,
                                padding: "12px 12px", borderBottom: `1px solid ${C.border}22`,
                                whiteSpace: "nowrap" }}>
                                {!isTablet && (ref?.thesis || "—")}
                                <span style={{ marginLeft: isTablet ? 0 : 6, color: C.accent, fontSize: isTablet ? 18 : 11 }}>
                                  {isExpanded ? "▲" : "▼"}
                                </span>
                              </td>
                            </tr>

                            {/* ── Deep Dive row ── */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={isTablet ? 10 : 15}
                                  style={{ background: C.bg,
                                    borderLeft: `3px solid ${row.sColor}`,
                                    borderBottom: `2px solid ${row.sColor}44`,
                                    padding: isTablet ? "10px 4px" : "14px 8px",
                                    overflowX: "auto", WebkitOverflowScrolling: "touch" }}>

                                  {/* ── AUTO-REFRESH BADGE ── */}
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px 6px", marginBottom: 4 }}>
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4,
                                      fontFamily: MONO, fontSize: 10, color: C.green,
                                      background: `${C.green}15`, border: `1px solid ${C.green}33`,
                                      borderRadius: 4, padding: "2px 7px" }}>
                                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green,
                                        display: "inline-block", animation: "pulse 2s infinite" }} />
                                      LIVE · refreshes every 30s
                                    </span>
                                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: liveChg >= 0 ? C.green : C.red }}>
                                      {row.ticker} ${livePrice > 0 ? livePrice.toFixed(2) : "—"} {liveChg >= 0 ? "+" : ""}{liveChg.toFixed(2)}%
                                    </span>
                                  </div>

                                  {isLoading ? (
                                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim,
                                      textAlign: "center", padding: "24px 0" }}>
                                      ⌛ Loading deep dive data for {row.ticker}…
                                    </div>
                                  ) : (
                                    <>
                                    {/* ── FINAL VERDICT BANNER ── */}
                                    {(() => {
                                      const smc  = deepData?.smc;
                                      const sd   = deepSocialData[row.ticker];
                                      const px   = Number(livePrice || row.quote?.price || 0);
                                      const ma50v = Number(row.quote?.priceAvg50  || 0);
                                      const ma200v= Number(row.quote?.priceAvg200 || 0);
                                      const hi52v = Number(row.quote?.yearHigh || 0);
                                      const lo52v = Number(row.quote?.yearLow  || 0);

                                      // Trend score
                                      const ttChecks = [
                                        ma200v > 0 && px > ma200v, ma50v > 0 && ma200v > 0 && ma50v > ma200v,
                                        ma50v > 0 && px > ma50v, lo52v > 0 && px >= lo52v * 1.30,
                                        hi52v > 0 && px >= hi52v * 0.75, (row.rsiVal || 50) >= 55,
                                        !!(row.ema9v && row.ema21v && row.ema9v > row.ema21v),
                                      ].filter(Boolean).length;
                                      const trendScore = Math.round(ttChecks / 7 * 100);

                                      // Build verdict using the engine
                                      const bosType  = smc?.bos?.type || null;
                                      const chochType= smc?.choch?.type || null;
                                      const smcScore = bosType === "BULL_BOS" ? 80 : bosType === "BEAR_BOS" ? 20 : chochType === "CHOCH_BEAR" ? 35 : 50;
                                      const macdScore= row.macdBull === true ? 72 : row.macdBull === false ? 30 : 50;
                                      const techScore= row.score || 50;

                                      const composite = Math.round(techScore * 0.30 + trendScore * 0.35 + smcScore * 0.20 + macdScore * 0.15);

                                      // Hard rules
                                      const bearBOS     = bosType === "BEAR_BOS";
                                      const bullBOS     = bosType === "BULL_BOS";
                                      const belowEMA21  = row.ema21v && px > 0 && px < row.ema21v;
                                      const trendWeak   = trendScore < 45;
                                      const techBull    = techScore >= 65;
                                      const smcBear     = smcScore <= 35 || bearBOS;

                                      let vLabel, vColor, vIcon, vAction, vSetup, vWarnings = [];

                                      if (bearBOS && belowEMA21) {
                                        vLabel = "AVOID / WAIT"; vColor = "#ff4444"; vIcon = "⛔";
                                        vAction = "Bear BOS + below EMA21 — institutional sellers in control. Do not buy.";
                                        vSetup = "Distribution / Topping";
                                        vWarnings = ["Bear BOS: structure broke down", "Price below EMA21", "Wait for reversal signal"];
                                      } else if (techBull && smcBear && trendWeak) {
                                        vLabel = "CONFLICT SETUP"; vColor = "#ffaa00"; vIcon = "⚠️";
                                        vAction = "Momentum bullish but trend/structure bearish. Reduce size or wait.";
                                        vSetup = "Conflicting Signals";
                                        vWarnings = ["SMC structure is bearish", "Trend is weak", "Not a quality long setup"];
                                      } else if (techBull && smcBear) {
                                        vLabel = "CONFLICT SETUP"; vColor = "#ffaa00"; vIcon = "⚠️";
                                        vAction = "Technical score is high but smart money signals are bearish.";
                                        vSetup = "Tech vs SMC Conflict";
                                        vWarnings = ["Tech momentum: bullish", "SMC structure: bearish", "Wait for alignment"];
                                      } else if (composite >= 82 && bullBOS && !trendWeak) {
                                        vLabel = "A+ LONG"; vColor = "#00e676"; vIcon = "🚀";
                                        vAction = "Full alignment. Enter now or on next pullback to MA50.";
                                        vSetup = bullBOS ? "Breakout" : "Trend Continuation";
                                      } else if (composite >= 68 && !trendWeak) {
                                        vLabel = "LONG"; vColor = "#4caf50"; vIcon = "✅";
                                        vAction = "Good setup — confirm with volume before entry.";
                                        vSetup = "Trend Continuation";
                                        if (trendWeak) vWarnings.push("Trend is weak — use smaller size");
                                      } else if (composite >= 55) {
                                        vLabel = "WATCH LONG"; vColor = "#26a69a"; vIcon = "👁";
                                        vAction = "Setup forming — wait for clearer trigger.";
                                        vSetup = "Developing Setup";
                                        vWarnings = ["Not confirmed — wait for Bull BOS or volume spike"];
                                      } else if (composite <= 32) {
                                        vLabel = "SHORT"; vColor = "#ff2244"; vIcon = "🔴";
                                        vAction = "Bearish confluence — reduce longs or short.";
                                        vSetup = "Breakdown";
                                      } else if (composite <= 44) {
                                        vLabel = "WATCH SHORT"; vColor = "#ff9800"; vIcon = "👁";
                                        vAction = "Weakness developing — monitor for breakdown.";
                                        vSetup = "Distribution";
                                      } else {
                                        vLabel = "NEUTRAL"; vColor = "#607494"; vIcon = "—";
                                        vAction = "No clear edge — stay flat.";
                                        vSetup = "No Setup";
                                      }

                                      const vBg = `${vColor}0e`;

                                      // Signal boxes — same language as Compression Scanner
                                      const sigBoxes = [
                                        {
                                          label: "TECHNICALS",
                                          score: Math.round((techScore + macdScore) / 2),
                                          icon: (techScore + macdScore) / 2 >= 65 ? "🔥" : (techScore + macdScore) / 2 >= 45 ? "✅" : "⬜",
                                          status: (techScore + macdScore) / 2 >= 65 ? "STRONG" : (techScore + macdScore) / 2 >= 45 ? "OK" : "WEAK",
                                          color: (techScore + macdScore) / 2 >= 65 ? C.green : (techScore + macdScore) / 2 >= 45 ? C.amber : C.red,
                                        },
                                        {
                                          label: "TREND",
                                          score: trendScore,
                                          icon: trendScore >= 65 ? "🔥" : trendScore >= 45 ? "✅" : "⬜",
                                          status: trendScore >= 65 ? "WITH TREND" : trendScore >= 45 ? "MIXED" : "AGAINST",
                                          color: trendScore >= 65 ? C.green : trendScore >= 45 ? C.amber : C.red,
                                        },
                                        {
                                          label: "STRUCTURE",
                                          score: smcScore,
                                          icon: smcScore >= 65 ? "🔥" : smcScore >= 45 ? "✅" : "⬜",
                                          status: smcScore >= 65 ? "BULLISH" : smcScore >= 45 ? "NEUTRAL" : "BEARISH",
                                          color: smcScore >= 65 ? C.green : smcScore >= 45 ? C.amber : C.red,
                                        },
                                      ];

                                      return (
                                        <div style={{ padding: "14px 16px", marginBottom: 12,
                                          background: vBg, borderRadius: 10,
                                          border: `1px solid ${vColor}55`,
                                          borderLeft: `6px solid ${vColor}` }}>

                                          {/* Row 1: Verdict + Score */}
                                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap", minWidth: 0 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                              <span style={{ fontSize: 24 }}>{vIcon}</span>
                                              <div>
                                                <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: vColor, letterSpacing: "0.05em" }}>
                                                  {vLabel}
                                                </div>
                                                <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 2 }}>
                                                  Setup: {vSetup}
                                                </div>
                                              </div>
                                            </div>
                                            <div style={{ flex: 1, minWidth: 120, maxWidth: 280 }}>
                                              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 3 }}>
                                                <span>ALIGNMENT</span>
                                                <span style={{ color: vColor, fontWeight: 900, fontSize: 13 }}>{composite}/100</span>
                                              </div>
                                              <div style={{ height: 8, borderRadius: 5, background: C.border, overflow: "hidden" }}>
                                                <div style={{ width: `${composite}%`, height: "100%", background: vColor, borderRadius: 5, transition: "width 0.5s" }} />
                                              </div>
                                            </div>
                                            {/* 3 Signal boxes — compact inline */}
                                            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                              {sigBoxes.map(s => (
                                                <div key={s.label} style={{ textAlign: "center", padding: "5px 8px",
                                                  background: C.surface, borderRadius: 7,
                                                  border: `1px solid ${s.score >= 65 ? s.color + "55" : C.border}` }}>
                                                  <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, marginBottom: 2, letterSpacing: "0.05em" }}>{s.label}</div>
                                                  <div style={{ fontSize: 14, lineHeight: 1 }}>{s.icon}</div>
                                                  <div style={{ fontFamily: MONO, fontSize: 8, color: s.color, marginTop: 2, fontWeight: 800 }}>{s.status}</div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>

                                          {/* Row 2: Action */}
                                          <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec, marginBottom: vWarnings.length ? 8 : 0, lineHeight: 1.5 }}>
                                            {vAction}
                                          </div>

                                          {/* Row 3: Warnings */}
                                          {vWarnings.length > 0 && (
                                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                              {vWarnings.map((w, wi) => (
                                                <div key={wi} style={{ fontFamily: SANS, fontSize: 12, color: C.amber }}>
                                                  ⚠ {w}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                          {/* ── POSITION CALCULATOR (direction-aware) ── */}
                                          {(() => {
                                            const px5   = Number(livePrice || row.quote?.price || 0);
                                            const ma505 = Number(row.quote?.priceAvg50 || 0);
                                            const acct  = Number(riskAccount || 10000);
                                            const pct   = Number(riskPct || 1) / 100;
                                            const riskAmt = acct * pct;
                                            if (!px5) return null;
                                            const isShort = /SHORT|SELL/i.test(vLabel);
                                            const isAvoid = !isShort && /AVOID|WAIT|NEUTRAL/i.test(vLabel);

                                            // No actionable trade → show a wait notice instead of a misleading BUY plan.
                                            if (isAvoid) {
                                              return (
                                                <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 10, background: `${C.amber}12`, border: `1px solid ${C.amber}44` }}>
                                                  <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, color: C.amber }}>⏸ NO TRADE — verdict is {vLabel}</div>
                                                  <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 3 }}>The trend is against a long here. Wait for a reversal/confirmation signal before sizing a position.</div>
                                                </div>
                                              );
                                            }

                                            // Long: stop below, targets above. Short: stop above, targets below.
                                            const stop5 = isShort
                                              ? Math.max(ma505 > px5 ? ma505 * 1.03 : px5 * 1.03, px5 * 1.03)
                                              : Math.min(ma505 > 0 && ma505 < px5 ? ma505 * 0.97 : px5 * 0.97, px5 * 0.97);
                                            const riskPerShare = Math.max(px5 * 0.01, Math.abs(px5 - stop5));
                                            const shares = Math.floor(riskAmt / riskPerShare);
                                            const cost   = shares * px5;
                                            const t1     = isShort ? px5 * 0.92 : px5 * 1.08;
                                            const t2     = isShort ? px5 * 0.85 : px5 * 1.15;
                                            const profitT1 = shares * Math.abs(t1 - px5);
                                            const stopPct  = (Math.abs(px5 - stop5) / px5 * 100).toFixed(1);
                                            if (shares <= 0) return null;
                                            const dirLabel = isShort ? "SHORT" : "BUY";
                                            const tgtSign  = isShort ? "-" : "+";
                                            return (
                                              <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 10,
                                                background: isShort ? `${C.red}08` : `${C.accent}08`, border: `1px solid ${isShort ? C.red : C.accent}22` }}>
                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                                                  <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em" }}>
                                                    💰 POSITION SIZING {isShort ? "· SHORT" : ""}
                                                  </div>
                                                  <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim }}>
                                                    ${acct.toLocaleString()} acct · {(pct*100).toFixed(1)}% risk = <strong style={{ color: C.red }}>${riskAmt.toFixed(0)} max loss</strong>
                                                  </div>
                                                </div>
                                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                                                  <div style={{ background: C.surface, borderRadius: 8, padding: "10px 12px" }}>
                                                    <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginBottom: 3 }}>{dirLabel}</div>
                                                    <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: isShort ? C.red : C.text }}>{shares} shares</div>
                                                    <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>@ ${px5.toFixed(2)} = ${cost >= 1000 ? (cost/1000).toFixed(1)+"k" : cost.toFixed(0)}</div>
                                                  </div>
                                                  <div style={{ background: C.surface, borderRadius: 8, padding: "10px 12px" }}>
                                                    <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginBottom: 3 }}>IF TARGET HIT ({tgtSign}8%)</div>
                                                    <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.green }}>+${profitT1.toFixed(0)}</div>
                                                    <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>@ ${t1.toFixed(2)} · T2 ${t2.toFixed(2)}</div>
                                                  </div>
                                                </div>
                                                <div style={{ display: "flex", gap: 6, fontSize: 11, flexWrap: "wrap" }}>
                                                  <span style={{ fontFamily: MONO, color: C.red, fontWeight: 700 }}>🛑 Stop ${stop5.toFixed(2)} ({isShort ? "+" : "-"}{stopPct}%)</span>
                                                  <span style={{ color: C.textDim }}>·</span>
                                                  <span style={{ fontFamily: MONO, color: C.textDim }}>Max loss ${riskAmt.toFixed(0)}</span>
                                                  <span style={{ color: C.textDim }}>·</span>
                                                  <span style={{ fontFamily: MONO, color: C.green }}>T1 {tgtSign}8% · T2 {tgtSign}15%</span>
                                                </div>
                                              </div>
                                            );
                                          })()}

                                          {/* Copy Trade Plan */}
                                          <button onClick={() => {
                                            const px4 = Number(livePrice || row.quote?.price || 0);
                                            const ma504 = Number(row.quote?.priceAvg50 || 0);
                                            const short4 = /SHORT|SELL/i.test(vLabel);
                                            const avoid4 = !short4 && /AVOID|WAIT|NEUTRAL/i.test(vLabel);
                                            const s4 = short4 ? (px4*1.03).toFixed(2) : (ma504 > 0 ? (ma504*0.97).toFixed(2) : (px4*0.92).toFixed(2));
                                            const sign4 = short4 ? "-" : "+";
                                            const t1m = short4 ? 0.92 : 1.08, t2m = short4 ? 0.85 : 1.15;
                                            const plan = avoid4 ? [
                                              "TRADE PLAN — " + row.ticker,
                                              "Verdict: " + vLabel + " — NO TRADE (trend against a long)",
                                              "Wait for a reversal/confirmation signal before entering.",
                                              "Score: " + row.score + "/100  Generated: " + new Date().toLocaleString()
                                            ].join("\n") : [
                                              "TRADE PLAN — " + row.ticker + (short4 ? " (SHORT)" : ""),
                                              "Verdict: " + vLabel + "  Alignment: " + composite + "/100",
                                              (short4 ? "Short: $" : "Entry: $") + px4.toFixed(2) + "  Stop: $" + s4,
                                              "T1: $" + (px4*t1m).toFixed(2) + " (" + sign4 + "8%)  T2: $" + (px4*t2m).toFixed(2) + " (" + sign4 + "15%)",
                                              vWarnings.length ? "Warnings: " + vWarnings.join(" | ") : "No warnings",
                                              "Score: " + row.score + "/100  Generated: " + new Date().toLocaleString()
                                            ].join("\n");
                                            try { navigator.clipboard.writeText(plan); } catch {}
                                          }}
                                            style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, border: "1px solid " + C.border,
                                              background: C.surface, color: C.textDim, borderRadius: 6, padding: "4px 10px",
                                              cursor: "pointer", marginTop: 8 }}>
                                            📋 COPY TRADE PLAN
                                          </button>

                                          {/* ── QUICK ACTIONS ── */}
                                          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                                            {/* Set Price Alert */}
                                            <button onClick={() => {
                                              const px = Number(livePrice || row.quote?.price || 0);
                                              const t1 = (px * 1.08).toFixed(2);
                                              setActiveTab("alerts");
                                            }} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700,
                                              border: `1px solid ${C.amber}55`, background: `${C.amber}12`,
                                              color: C.amber, borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}>
                                              🔔 Set T1 Alert
                                            </button>
                                            {/* Log Trade */}
                                            <button onClick={() => {
                                              const px = Number(livePrice || row.quote?.price || 0);
                                              setQuickLogModal({
                                                symbol: row.ticker, price: px,
                                                entry: px.toFixed(2),
                                                stopLoss: (px * 0.97).toFixed(2),
                                                target: (px * 1.08).toFixed(2),
                                                side: "BUY", timeframe: "1D",
                                                style: "Breakout", notes: `Smart Scan · Score ${row.score}`,
                                                score: row.score, chg: row.quote?.changePercent || 0, rvol: 0
                                              });
                                            }} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700,
                                              border: `1px solid ${C.green}55`, background: `${C.green}12`,
                                              color: C.green, borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}>
                                              📓 Log Trade
                                            </button>
                                            {/* Add to watchlist */}
                                            <button onClick={() => {
                                              const sym = row.ticker;
                                              fetch("/api/watchlist", { method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ symbol: sym, action: "add" })
                                              }).then(() => {}).catch(() => {});
                                            }} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700,
                                              border: `1px solid ${C.accent}55`, background: `${C.accent}12`,
                                              color: C.accent, borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}>
                                              ⭐ Watch
                                            </button>
                                            {/* Send to Telegram — no state, use DOM directly */}
                                            {(() => {
                                              const r2   = n => Math.round(n * 100) / 100;
                                              const px   = Number(livePrice || row.quote?.price || 0);
                                              const stop = r2(px * 0.97);
                                              const t1   = r2(px * 1.08);
                                              const t2   = r2(px * 1.15);
                                              const rr   = r2((t1 - px) / Math.max(px - stop, 0.01));
                                              const chg  = Number(row.quote?.changePercent || 0);
                                              const msg  = [
                                                `📊 ${row.ticker} SETUP — $${px} (${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%)`,
                                                `Score: ${row.score}/100  Signal: ${row.signal || "WATCH"}`,
                                                ``,
                                                `💰 TRADE LEVELS`,
                                                `Entry: $${px}`,
                                                `Stop:  $${stop} (-3%)`,
                                                `T1:    $${t1} (+8%)`,
                                                `T2:    $${t2} (+15%)`,
                                                `R:R:   ${rr}:1`,
                                                ``,
                                                `⚠️ Not financial advice. Manage risk.`,
                                              ].join("\n");
                                              return (
                                                <button
                                                  onClick={e => {
                                                    const btn = e.currentTarget;
                                                    fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) })
                                                      .then(() => { btn.textContent = "✅ Sent!"; btn.style.color = "#22c55e"; setTimeout(() => { btn.textContent = "📱 Telegram"; btn.style.color = ""; }, 3000); })
                                                      .catch(() => {});
                                                  }}
                                                  style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700,
                                                    border: `1px solid ${C.textDim}44`, background: "transparent",
                                                    color: C.textDim, borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}>
                                                  📱 Telegram
                                                </button>
                                              );
                                            })()}
                                          </div>

                                        {/* ── OPTIONS RECOMMENDATION ── */}
                                        {(() => {
                                          const px      = Number(livePrice || row.quote?.price || 0);
                                          if (!px) return null;
                                          const rsi     = Number(row.rsiVal || 50);
                                          const macd    = row.macdBull;
                                          const ema9    = row.ema9v, ema21 = row.ema21v;
                                          const score   = row.score || 50;
                                          const smc     = scanDeepData[row.ticker]?.smc;
                                          const bosType = smc?.bos?.type || null;
                                          const fd2     = scanDeepData[row.ticker]?.fundamentals || {};
                                          const earnDate= fd2.earningsDate;
                                          const ma50    = Number(row.quote?.priceAvg50 || 0);
                                          const ma200   = Number(row.quote?.priceAvg200 || 0);

                                          // Days to earnings
                                          let daysToEarn = null;
                                          if (earnDate) {
                                            const d = new Date(typeof earnDate === "number" ? earnDate * 1000 : earnDate);
                                            daysToEarn = Math.round((d - Date.now()) / 86400000);
                                          }
                                          const earningsRisk = daysToEarn != null && daysToEarn >= 0 && daysToEarn <= 7;

                                          // CALL signals (bullish)
                                          const callSigs = [];
                                          if (bosType === "BULL_BOS")              callSigs.push("✅ Bull BOS confirmed");
                                          if (ema9 && ema21 && ema9 > ema21)       callSigs.push("✅ EMA 9 above 21 (bullish)");
                                          if (rsi >= 45 && rsi <= 65)              callSigs.push("✅ RSI in sweet spot (" + rsi.toFixed(0) + ")");
                                          if (macd === true)                        callSigs.push("✅ MACD bullish crossover");
                                          if (ma50 > 0 && px > ma50)               callSigs.push("✅ Above 50-day MA");
                                          if (score >= 70)                         callSigs.push("✅ Strong score (" + score + "/100)");

                                          // PUT signals (bearish)
                                          const putSigs = [];
                                          if (bosType === "BEAR_BOS")              putSigs.push("✅ Bear BOS confirmed");
                                          if (ema9 && ema21 && ema9 < ema21)       putSigs.push("✅ EMA 9 below 21 (bearish)");
                                          if (rsi > 70)                            putSigs.push("✅ RSI overbought (" + rsi.toFixed(0) + ") — fade");
                                          if (macd === false)                       putSigs.push("✅ MACD bearish crossover");
                                          if (ma50 > 0 && px < ma50 * 0.97)        putSigs.push("✅ Below 50-day MA");
                                          if (score <= 35)                         putSigs.push("✅ Weak score (" + score + "/100)");

                                          // Decide direction
                                          const callScore = callSigs.length;
                                          const putScore  = putSigs.length;
                                          const neutral   = callScore < 2 && putScore < 2;

                                          let direction, dirColor, dirBg, dirIcon, strikeNote, expNote, sigs, exitNote;

                                          // Strike + expiry logic
                                          const itmStrike  = px > 100 ? Math.round(px / 5) * 5 : Math.round(px);
                                          const otmStrike1 = px > 100 ? itmStrike + 5   : itmStrike + 1;
                                          const otmStrike2 = px > 100 ? itmStrike - 5   : itmStrike - 1;

                                          if (neutral || earningsRisk) {
                                            direction = earningsRisk
                                              ? "⚠️ EARNINGS RISK — AVOID"
                                              : "〰️ NO CLEAR SIGNAL";
                                            dirColor  = C.textDim;
                                            dirBg     = C.card;
                                            dirIcon   = earningsRisk ? "⚠️" : "〰️";
                                            sigs      = earningsRisk
                                              ? [`⚠️ Earnings in ${daysToEarn} days — IV will spike then crush`, "❌ Buying options before earnings = high risk", "Wait until after earnings report"]
                                              : ["Mixed signals — no clear direction", "Risk:reward not favorable right now", "Wait for Bull BOS or Bear BOS confirmation"];
                                            expNote   = "—";
                                            strikeNote= "—";
                                            exitNote  = "Do not trade options on this setup.";
                                          } else if (callScore >= putScore) {
                                            direction = callScore >= 4 ? "🟢 BUY CALLS" : "🔵 CONSIDER CALLS";
                                            dirColor  = C.green;
                                            dirBg     = `${C.green}10`;
                                            dirIcon   = callScore >= 4 ? "🟢" : "🔵";
                                            sigs      = callSigs;
                                            strikeNote= `$${otmStrike1} strike (1 OTM) or $${itmStrike} (ATM)`;
                                            expNote   = "21-35 days out (not weekly — avoid theta decay)";
                                            exitNote  = `Sell at +50-80% profit OR if price breaks below $${(px * 0.97).toFixed(2)}`;
                                          } else {
                                            direction = putScore >= 4 ? "🔴 BUY PUTS" : "🟡 CONSIDER PUTS";
                                            dirColor  = C.red;
                                            dirBg     = `${C.red}10`;
                                            dirIcon   = putScore >= 4 ? "🔴" : "🟡";
                                            sigs      = putSigs;
                                            strikeNote= `$${otmStrike2} strike (1 OTM) or $${itmStrike} (ATM)`;
                                            expNote   = "21-35 days out (not weekly — avoid theta decay)";
                                            exitNote  = `Sell at +50-80% profit OR if price breaks above $${(px * 1.03).toFixed(2)}`;
                                          }

                                          return (
                                            <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10,
                                              background: dirBg, border: `1px solid ${dirColor}44` }}>
                                              {/* Header */}
                                              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                                                <span style={{ fontSize: 20 }}>{dirIcon}</span>
                                                <div>
                                                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: dirColor }}>
                                                    OPTIONS: {direction}
                                                  </div>
                                                  <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginTop: 1 }}>
                                                    Based on current technicals · Not financial advice
                                                  </div>
                                                </div>
                                              </div>

                                              {/* Signals */}
                                              <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
                                                {sigs.map((s, si) => (
                                                  <div key={si} style={{ fontFamily: SANS, fontSize: 12, color: dirColor }}>{s}</div>
                                                ))}
                                              </div>

                                              {/* Trade details */}
                                              {!neutral && !earningsRisk && (
                                                <div style={{ display: "flex", flexDirection: "column", gap: 5,
                                                  padding: "8px 10px", background: C.surface, borderRadius: 7 }}>
                                                  {[
                                                    ["Strike", strikeNote],
                                                    ["Expiration", expNote],
                                                    ["Exit", exitNote],
                                                    ["Max loss", "100% of premium paid — size small"],
                                                  ].map(([k, v]) => (
                                                    <div key={k} style={{ display: "flex", gap: 8 }}>
                                                      <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, flexShrink: 0, minWidth: 70 }}>{k}:</span>
                                                      <span style={{ fontFamily: SANS, fontSize: 11, color: C.text }}>{v}</span>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}

                                              <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginTop: 8, fontStyle: "italic" }}>
                                                ⚠️ Options carry significant risk. Never risk more than 1-2% of account per options trade.
                                              </div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                      );
                                    })()}

                                    <div
                                      ref={el => {
                                        if (!el) return;
                                        // Mouse drag (desktop)
                                        el.onmousedown = e => {
                                          const startX = e.pageX - el.offsetLeft;
                                          const scrollLeft = el.scrollLeft;
                                          el.style.cursor = "grabbing";
                                          el.style.userSelect = "none";
                                          const onMove = mv => { el.scrollLeft = scrollLeft - (mv.pageX - el.offsetLeft - startX); };
                                          const onUp = () => { el.style.cursor = "grab"; el.style.userSelect = ""; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
                                          window.addEventListener("mousemove", onMove);
                                          window.addEventListener("mouseup", onUp);
                                        };
                                        // Touch drag (iPad / iPhone)
                                        el.ontouchstart = e => {
                                          const touch = e.touches[0];
                                          const startX = touch.pageX;
                                          const scrollLeft = el.scrollLeft;
                                          const onMove = mv => {
                                            const dx = mv.touches[0].pageX - startX;
                                            el.scrollLeft = scrollLeft - dx;
                                          };
                                          const onEnd = () => { el.removeEventListener("touchmove", onMove); el.removeEventListener("touchend", onEnd); };
                                          el.addEventListener("touchmove", onMove, { passive: true });
                                          el.addEventListener("touchend", onEnd);
                                        };
                                      }}
                                      style={{ display: "flex", gap: 10, height: isTablet ? 520 : 460, overflowX: "auto", overflowY: "hidden", cursor: "grab", scrollbarWidth: "thin", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>

                                      {/* ── Col 1: TradingView mini chart ── */}
                                      <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", height: "100%", padding: "0 12px 0 0", borderRight: `1px solid ${C.border}33`}}>
                                        <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 8, letterSpacing: "0.06em", paddingBottom: 5, borderBottom: `2px solid ${C.border}`, minHeight: 32, display: "flex", alignItems: "center", position: "sticky", top: 0, background: C.bg, zIndex: 2 }}>
                                          📊 CHART
                                        </div>
                                        <div style={{ borderRadius: 6, overflow: "hidden", flex: 1,
                                          border: `1px solid ${C.border}` }}>
                                          <iframe
                                            title={`tv-${row.ticker}`}
                                            scrolling="no"
                                            style={{ width: "100%", height: "100%", display: "block", border: "none" }}
                                            src={`/client/tv-widget.html?w=mini-symbol-overview&s=${encodeURIComponent(row.ticker)}&t=${themeMode === "dark" ? "dark" : "light"}&h=400`}
                                          />
                                        </div>
                                      </div>

                                      {/* ── Col 2: TECHNICALS (indicators + signals + entry zones) ── */}
                                      <div style={{ width: 215, flexShrink: 0, display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", padding: "0 12px", borderRight: `1px solid ${C.border}33`}}>
                                        <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 8, letterSpacing: "0.06em", paddingBottom: 5, borderBottom: `2px solid ${C.border}`, minHeight: 32, display: "flex", alignItems: "center", position: "sticky", top: 0, background: C.bg, zIndex: 2 }}>
                                          ⚡ TECHNICALS
                                        </div>
                                        {/* Key indicator values */}
                                        <div style={{ display: "flex", flexDirection: "column", gap: 1, marginBottom: 12 }}>
                                          {[
                                            { k: "RSI (14)", v: row.rsiVal != null ? row.rsiVal.toFixed(0) : "—",
                                              col: row.rsiVal == null ? C.textDim : row.rsiVal < 30 ? C.green : row.rsiVal > 70 ? C.red : C.text },
                                            { k: "MACD", v: row.macdBull == null ? "—" : row.macdBull ? "▲ BULLISH" : "▼ BEARISH",
                                              col: row.macdBull == null ? C.textDim : row.macdBull ? C.green : C.red },
                                            { k: "EMA 9/21", v: (row.ema9v && row.ema21v) ? (row.ema9v > row.ema21v ? "9 > 21 ▲" : "9 < 21 ▼") : "—",
                                              col: (row.ema9v && row.ema21v) ? (row.ema9v > row.ema21v ? C.green : C.red) : C.textDim },
                                            { k: "Zone", v: zoneLbl, col: zoneCol },
                                            { k: "Momentum", v: `${row.score}/100 (tech only)`, col: row.sColor },
                                          ].map(({ k, v, col }) => (
                                            <div key={k} style={{ display: "flex", justifyContent: "space-between",
                                              fontFamily: MONO, fontSize: 13, padding: "6px 0",
                                              borderBottom: `1px solid ${C.border}22` }}>
                                              <span style={{ fontFamily: SANS, color: C.textDim, fontSize: 12 }}>{k}</span>
                                              <span style={{ color: col, fontWeight: 700 }}>{v}</span>
                                            </div>
                                          ))}
                                        </div>
                                        {/* Signal reasons */}
                                        {(row.signals || []).length > 0 && (
                                          <>
                                            <div style={{ fontFamily: MONO, fontSize: 12, fontFamily: SANS, fontWeight: 700, color: C.textDim, letterSpacing: "0.1em", marginBottom: 5, marginTop: 8, textTransform: "uppercase" }}>REASONS</div>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                              {(row.signals || []).map((sig, si) => (
                                                <div key={si} style={{ display: "flex", alignItems: "center",
                                                  gap: 5, fontFamily: MONO, fontSize: 12,
                                                  color: sig.bull ? C.green : C.red }}>
                                                  <span>{sig.bull ? "▲" : "▼"}</span>
                                                  <span>{sig.txt}</span>
                                                </div>
                                              ))}
                                            </div>
                                          </>
                                        )}
                                        {/* Entry zones */}
                                        {ref && (
                                          <div style={{ marginTop: 12 }}>
                                            <div style={{ fontFamily: MONO, fontSize: 12, fontFamily: SANS, fontWeight: 700, color: C.textDim, letterSpacing: "0.1em", marginBottom: 5, marginTop: 8, textTransform: "uppercase" }}>ENTRY ZONES</div>
                                            {[
                                              { label: "Deep", val: ref.e3, col: "#00e676" },
                                              { label: "Better", val: ref.e2, col: "#4caf50" },
                                              { label: "Starter", val: ref.e1, col: "#26a69a" },
                                              { label: "Trigger ▲", val: ref.trigger, col: "#ffd700" },
                                              { label: "Stop ✂", val: ref.stop, col: C.red },
                                            ].map(z => (
                                              <div key={z.label} style={{ display: "flex", justifyContent: "space-between",
                                                fontFamily: MONO, fontSize: 13, padding: "6px 0",
                                                borderBottom: `1px solid ${C.border}22` }}>
                                                <span style={{ color: z.col }}>{z.label}</span>
                                                <span style={{ color: z.col, fontWeight: 700 }}>${Number(z.val).toFixed(2)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        {/* ── BOTTOM / TOP DETECTOR ── */}
                                        {(() => {
                                          const px     = Number(livePrice || row.quote?.price || 0);
                                          if (!px) return null;
                                          // Use deep dive fundamentals if available, fallback to scan data, then proxies
                                          const fd2    = deepData?.fundamentals || {};
                                          const hi52   = Number(fd2.fiftyTwoWeekHigh || row.quote?.yearHigh || row.quote?.fiftyTwoWeekHigh || px * 1.3);
                                          const lo52   = Number(fd2.fiftyTwoWeekLow  || row.quote?.yearLow  || row.quote?.fiftyTwoWeekLow  || px * 0.7);
                                          const rsi    = Number(row.rsiVal || fd2.rsi || 50);
                                          const rvol   = row.quote?.volume && row.quote?.avgVolume ? row.quote.volume / row.quote.avgVolume : 1;
                                          const chg1d  = Number(row.quote?.changePercent || row.quote?.changesPercentage || 0);
                                          const chg1w  = Number(row.quote?.delta1w || 0);
                                          const ma50   = Number(row.quote?.priceAvg50  || fd2.fiftyDayAverage || 0);
                                          const ma200  = Number(row.quote?.priceAvg200 || fd2.twoHundredDayAverage || 0);

                                          const distFromLo = (px - lo52) / lo52 * 100;  // % above 52w low
                                          const distFromHi = (hi52 - px) / hi52 * 100;  // % below 52w high

                                          // ── Bottom signals ──
                                          const bottomSigs = [];
                                          if (distFromLo < 10)            bottomSigs.push({ txt: `Near 52w low (-${distFromLo.toFixed(1)}%)`, weight: 3 });
                                          if (rsi < 30)                   bottomSigs.push({ txt: `RSI oversold (${rsi.toFixed(0)})`, weight: 3 });
                                          if (rsi < 40 && chg1d > 1)      bottomSigs.push({ txt: "RSI recovering + price up", weight: 2 });
                                          if (rvol > 2.5 && chg1d < -3)   bottomSigs.push({ txt: `Climax sell volume (${rvol.toFixed(1)}x) — exhaustion`, weight: 2 });
                                          if (chg1w < -15 && chg1d > 0)   bottomSigs.push({ txt: "Sharp drop + reversal candle", weight: 2 });
                                          if (ma50 > 0 && px < ma50 * 0.85) bottomSigs.push({ txt: "Far below 50MA — stretched", weight: 1 });
                                          if (row.macdBull === true && rsi < 45) bottomSigs.push({ txt: "MACD bullish while RSI low", weight: 2 });

                                          // ── Top signals ──
                                          const topSigs = [];
                                          if (distFromHi < 5)             topSigs.push({ txt: `Near 52w high (-${distFromHi.toFixed(1)}%)`, weight: 3 });
                                          if (rsi > 70)                   topSigs.push({ txt: `RSI overbought (${rsi.toFixed(0)})`, weight: 3 });
                                          if (rsi > 65 && chg1d < -1)     topSigs.push({ txt: "RSI dropping + price down", weight: 2 });
                                          if (rvol > 2.5 && chg1d > 5)    topSigs.push({ txt: `Climax buy volume (${rvol.toFixed(1)}x) — exhaustion`, weight: 2 });
                                          if (chg1w > 20 && chg1d < 0)    topSigs.push({ txt: "Parabolic run + reversal candle", weight: 2 });
                                          if (ma50 > 0 && px > ma50 * 1.20) topSigs.push({ txt: "Far above 50MA — extended", weight: 1 });
                                          if (row.macdBull === false && rsi > 60) topSigs.push({ txt: "MACD bearish while RSI high", weight: 2 });

                                          const bottomScore = bottomSigs.reduce((s, x) => s + x.weight, 0);
                                          const topScore    = topSigs.reduce((s, x) => s + x.weight, 0);
                                          const threshold   = 2; // lower threshold = always shows something

                                          const isBottom = bottomScore >= threshold && bottomScore >= topScore;
                                          const isTop    = topScore    >= threshold && topScore    >  bottomScore;
                                          const isNeutral= !isBottom && !isTop;
                                          const verdict  = isNeutral ? "〰️ MID RANGE" :
                                            isBottom ? (bottomScore >= 6 ? "🟢 LIKELY BOTTOM" : "🔵 POSSIBLE BOTTOM") :
                                                       (topScore    >= 6 ? "🔴 LIKELY TOP"    : "🟡 POSSIBLE TOP");
                                          const vColor   = isNeutral ? C.textDim : isBottom ? C.green : C.red;
                                          const vBg      = isNeutral ? C.card : isBottom ? `${C.green}10` : `${C.red}10`;
                                          const sigs     = isBottom ? bottomSigs : isTop ? topSigs : [];

                                          return (
                                            <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8,
                                              background: vBg, border: `1px solid ${vColor}44` }}>
                                              {/* Header */}
                                              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim,
                                                letterSpacing: "0.1em", marginBottom: 4 }}>REVERSAL DETECTOR</div>
                                              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900,
                                                color: vColor, marginBottom: sigs.length ? 6 : 0 }}>
                                                {verdict}
                                              </div>
                                              {/* 52w context bar */}
                                              {hi52 > lo52 && (
                                                <div style={{ marginBottom: 6 }}>
                                                  <div style={{ display: "flex", justifyContent: "space-between",
                                                    fontFamily: MONO, fontSize: 9, color: C.textDim, marginBottom: 2 }}>
                                                    <span>52w Lo ${lo52.toFixed(0)}</span>
                                                    <span style={{ color: vColor, fontWeight: 800 }}>
                                                      {distFromLo.toFixed(0)}% from Lo · {distFromHi.toFixed(0)}% from Hi
                                                    </span>
                                                    <span>52w Hi ${hi52.toFixed(0)}</span>
                                                  </div>
                                                  <div style={{ height: 5, background: C.border, borderRadius: 3, overflow: "hidden" }}>
                                                    <div style={{ width: `${Math.min(100, distFromLo / (distFromLo + distFromHi) * 100)}%`,
                                                      height: "100%", background: vColor, borderRadius: 3 }} />
                                                  </div>
                                                </div>
                                              )}
                                              {/* Evidence */}
                                              {sigs.length > 0 && (
                                                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 6 }}>
                                                  {sigs.map((s, si) => (
                                                    <div key={si} style={{ display: "flex", alignItems: "flex-start", gap: 5,
                                                      fontFamily: SANS, fontSize: 11, color: vColor }}>
                                                      <span style={{ flexShrink: 0, opacity: 0.7 }}>{"●".repeat(Math.min(s.weight, 3))}</span>
                                                      <span>{s.txt}</span>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                              {isNeutral && (
                                                <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>
                                                  Price in the middle of its range — no clear reversal signal yet.
                                                </div>
                                              )}
                                              {!isNeutral && (
                                                <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, lineHeight: 1.5 }}>
                                                  {isBottom
                                                    ? "Wait for green candle + volume spike to confirm"
                                                    : "Watch for red candle close below support to confirm"}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })()}

                                        <div style={{ flex: 1 }} />
                                      </div>

                                      {/* ── Col 3: SMC ANALYSIS ── */}
                                      {(() => {
                                        const smc = deepData?.smc;
                                        const px  = Number(livePrice || row.quote?.price || 0);
                                        return (
                                          <div style={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", padding: "0 12px", borderRight: `1px solid ${C.border}33`}}>
                                            <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 8, letterSpacing: "0.06em", paddingBottom: 5, borderBottom: `2px solid ${C.border}`, minHeight: 32, display: "flex", alignItems: "center", position: "sticky", top: 0, background: C.bg, zIndex: 2 }}>
                                              🧱 SMC ANALYSIS
                                            </div>
                                            {!smc ? (
                                              <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Loading SMC data…</div>
                                            ) : (
                                              <>
                                                {/* BOS / ChoCh */}
                                                {(smc.bos || smc.choch) && (
                                                  <div style={{ marginBottom: 10 }}>
                                                    <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: C.textDim, marginBottom: 5 }}>📐 STRUCTURE</div>
                                                    {smc.bos && (
                                                      <div style={{ padding: "6px 8px", borderRadius: 5, marginBottom: 4,
                                                        background: smc.bos.type === "BULL_BOS" ? `${C.green}14` : `${C.red}14`,
                                                        border: `1px solid ${smc.bos.type === "BULL_BOS" ? C.green : C.red}44` }}>
                                                        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: smc.bos.type === "BULL_BOS" ? C.green : C.red }}>{smc.bos.label}</div>
                                                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>@ ${smc.bos.level}</div>
                                                      </div>
                                                    )}
                                                    {smc.choch && (
                                                      <div style={{ padding: "6px 8px", borderRadius: 5,
                                                        background: `${C.amber}14`, border: `1px solid ${C.amber}44` }}>
                                                        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.amber }}>{smc.choch.label}</div>
                                                      </div>
                                                    )}
                                                  </div>
                                                )}

                                                {/* Order Blocks */}
                                                {smc.orderBlocks && smc.orderBlocks.length > 0 && (
                                                  <div style={{ marginBottom: 10 }}>
                                                    <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: C.textDim, marginBottom: 5 }}>🔲 ORDER BLOCKS</div>
                                                    {smc.orderBlocks.map((ob, i) => {
                                                      const isBull = ob.type === "BULL_OB";
                                                      const col = isBull ? C.green : C.red;
                                                      const dist = px > 0 ? Math.abs(ob.mid - px) / px * 100 : 0;
                                                      return (
                                                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}22` }}>
                                                          <span style={{ fontFamily: SANS, fontSize: 12, color: col }}>{isBull ? "🟢 Bull OB" : "🔴 Bear OB"}</span>
                                                          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: col }}>${ob.top} – ${ob.bot}</span>
                                                          <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{dist.toFixed(1)}%</span>
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                )}

                                                {/* Fair Value Gaps */}
                                                {smc.fvgs && smc.fvgs.length > 0 && (
                                                  <div style={{ marginBottom: 10 }}>
                                                    <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: C.textDim, marginBottom: 5 }}>🕳 FAIR VALUE GAPS</div>
                                                    {smc.fvgs.slice(0, 4).map((f, i) => {
                                                      const isBull = f.type === "BULL_FVG";
                                                      const col = isBull ? C.green : C.red;
                                                      return (
                                                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}22` }}>
                                                          <span style={{ fontFamily: SANS, fontSize: 12, color: col }}>{isBull ? "▲ Bull FVG" : "▼ Bear FVG"}</span>
                                                          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: col }}>${f.bot} – ${f.top}</span>
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                )}

                                                {/* Volume Profile */}
                                                {smc.volumeProfile && smc.volumeProfile.vpoc > 0 && (
                                                  <div style={{ marginBottom: 10 }}>
                                                    <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: C.textDim, marginBottom: 5 }}>📊 VOLUME PROFILE</div>
                                                    {[
                                                      ["VPOC", smc.volumeProfile.vpoc, C.accent, "Value Area Point of Control"],
                                                      ["VAH",  smc.volumeProfile.vah,  C.green,  "Value Area High (70%)"],
                                                      ["VAL",  smc.volumeProfile.val,  C.red,    "Value Area Low (70%)"],
                                                    ].map(([lbl, val, col, tip]) => (
                                                      <div key={lbl} title={tip} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}22` }}>
                                                        <span style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>{lbl}</span>
                                                        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: col }}>${val}</span>
                                                      </div>
                                                    ))}
                                                    {/* Mini volume bar chart */}
                                                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 1 }}>
                                                      {(smc.volumeProfile.profile || []).slice().reverse().map((b, i) => {
                                                        const isNearVpoc = Math.abs(b.price - smc.volumeProfile.vpoc) / Math.max(smc.volumeProfile.vpoc, 1) < 0.01;
                                                        const isInVA = b.price >= smc.volumeProfile.val && b.price <= smc.volumeProfile.vah;
                                                        const barCol = isNearVpoc ? C.accent : isInVA ? C.green : C.border;
                                                        return (
                                                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                            <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, width: 44, textAlign: "right" }}>${b.price}</span>
                                                            <div style={{ flex: 1, height: 6, background: C.surface, borderRadius: 2 }}>
                                                              <div style={{ width: `${Math.min(100, b.pct * 3)}%`, height: "100%", background: barCol, borderRadius: 2 }} />
                                                            </div>
                                                          </div>
                                                        );
                                                      })}
                                                    </div>
                                                  </div>
                                                )}

                                                {/* Liquidity Levels */}
                                                {smc.liquidity && smc.liquidity.length > 0 && (
                                                  <div>
                                                    <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: C.textDim, marginBottom: 5 }}>💧 LIQUIDITY LEVELS</div>
                                                    {smc.liquidity.map((l, i) => {
                                                      const isAbove = l.price > px;
                                                      const col = l.strength === "HIGH" ? (isAbove ? C.green : C.red) : C.amber;
                                                      const dist = px > 0 ? ((l.price - px) / px * 100).toFixed(1) : "0";
                                                      return (
                                                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}22` }}>
                                                          <div>
                                                            <div style={{ fontFamily: SANS, fontSize: 12, color: col }}>{l.label}</div>
                                                          </div>
                                                          <div style={{ textAlign: "right" }}>
                                                            <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: col }}>${l.price}</div>
                                                            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{dist > 0 ? "+" : ""}{dist}%</div>
                                                          </div>
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                )}
                                              </>
                                            )}
                                          </div>
                                        );
                                      })()}

                                      {/* ── Col 5: RECENT NEWS ── */}
                                      <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", padding: "0 12px", borderRight: `1px solid ${C.border}33`}}>
                                        <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 8, letterSpacing: "0.06em", paddingBottom: 5, borderBottom: `2px solid ${C.border}`, minHeight: 32, display: "flex", alignItems: "center", gap: 8, position: "sticky", top: 0, background: C.bg, zIndex: 2 }}>
                                          📰 RECENT NEWS
                                          {/* WHY MOVING — computed from keywords, no state needed */}
                                          {deepData?.news?.length > 0 && (() => {
                                            const headlines = (deepData.news||[]).slice(0,5).map(n => n.title||n.headline||"").filter(Boolean);
                                            const tl  = headlines.join(" ").toLowerCase();
                                            const chg6 = Number(row.quote?.changePercent || row.quote?.changesPercentage || 0);
                                            const why =
                                              (tl.includes("earn") || tl.includes("report") || tl.includes("quarter")) ? "📅 Earnings" :
                                              (tl.includes("upgrade") || tl.includes("price target")) ? "🎯 Analyst upgrade" :
                                              (tl.includes("downgrade")) ? "🎯 Analyst downgrade" :
                                              (tl.includes("contract") || tl.includes("awarded") || tl.includes("partnership")) ? "📄 New contract" :
                                              (tl.includes("fda") || tl.includes("approval")) ? "🧬 FDA news" :
                                              (tl.includes("insider") || tl.includes("purchased") || tl.includes("bought")) ? "🏦 Insider buy" :
                                              (tl.includes("lawsuit") || tl.includes("probe")) ? "⚠️ Legal risk" :
                                              (tl.includes("buyback") || tl.includes("dividend")) ? "💰 Corp action" :
                                              chg6 > 5 ? "📈 Momentum" : chg6 < -5 ? "📉 Selling" : "🔄 Rotation";
                                            return (
                                              <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.accent,
                                                background: `${C.accent}14`, borderRadius: 4, padding: "2px 7px", marginLeft: "auto", whiteSpace: "nowrap" }}>
                                                {why}
                                              </span>
                                            );
                                          })()}
                                        </div>
                                        {deepData?.news?.length > 0 ? (
                                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                            {deepData.news.slice(0, 5).map((n, ni) => {
                                              const title = n.title || n.headline || "";
                                              const src2  = n.source || n.publisher || "";
                                              const url   = n.url || n.link || "#";
                                              const tl    = title.toLowerCase();
                                              // Enhanced sentiment + catalyst tagging
                                              const bear  = ["fall","drop","loss","miss","cut","lawsuit","probe","fraud","decline","sell","downgrade","warning","fail","crash","plunge","sink","weak","disappoint"].some(w => tl.includes(w));
                                              const bull  = ["win","award","contract","surge","beat","record","launch","expand","partnership","upgrade","buy","strong","profit","growth","milestone","outperform","raise","boost","soar"].some(w => tl.includes(w));
                                              // Catalyst tags
                                              const catalysts = [];
                                              if (tl.includes("earn") || tl.includes("report") || tl.includes("quarter")) catalysts.push("📅 Earnings");
                                              if (tl.includes("upgrade") || tl.includes("downgrade") || tl.includes("analyst") || tl.includes("price target")) catalysts.push("🎯 Analyst");
                                              if (tl.includes("fda") || tl.includes("approval") || tl.includes("trial") || tl.includes("drug")) catalysts.push("🧬 FDA");
                                              if (tl.includes("contract") || tl.includes("deal") || tl.includes("awarded") || tl.includes("partnership")) catalysts.push("📄 Contract");
                                              if (tl.includes("insider") || tl.includes("bought") || tl.includes("purchased") || tl.includes("filing")) catalysts.push("🏦 Insider");
                                              if (tl.includes("buyback") || tl.includes("dividend") || tl.includes("split")) catalysts.push("💰 Corp Action");
                                              const sentIcon = bull ? "🟢" : bear ? "🔴" : "⚪";
                                              return (
                                                <a key={ni} href={url} target="_blank" rel="noopener noreferrer"
                                                  style={{ display: "block", textDecoration: "none",
                                                    padding: "8px 10px", borderRadius: 6,
                                                    background: bear ? `${C.red}0d` : bull ? `${C.green}0d` : C.card,
                                                    border: `1px solid ${bear ? C.red : bull ? C.green : C.border}44` }}>
                                                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                                                    <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>{sentIcon}</span>
                                                    <div style={{ flex: 1 }}>
                                                      <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: bull || bear ? 600 : 400,
                                                        color: bear ? C.red : bull ? C.green : C.text, lineHeight: 1.5 }}>
                                                        {title.length > 85 ? title.slice(0, 85) + "…" : title}
                                                      </div>
                                                      <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap" }}>
                                                        {catalysts.map((c,ci) => (
                                                          <span key={ci} style={{ fontFamily: MONO, fontSize: 11, color: C.accent,
                                                            background: `${C.accent}14`, borderRadius: 3, padding: "1px 5px" }}>{c}</span>
                                                        ))}
                                                        {src2 && <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{src2}</span>}
                                                      </div>
                                                    </div>
                                                  </div>
                                                </a>
                                              );
                                            })}
                                          </div>
                                        ) : (
                                          <div style={{ fontFamily: MONO, fontSize: 13, color: C.textDim }}>
                                            {deepData ? "No news found" : "Loading…"}
                                          </div>
                                        )}
                                      </div>

                                      {/* ── Col 6: ANALYST RATINGS + EARNINGS ── */}
                                      <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", padding: "0 12px", borderRight: `1px solid ${C.border}33`}}>
                                        <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 8, letterSpacing: "0.06em", paddingBottom: 5, borderBottom: `2px solid ${C.border}`, minHeight: 32, display: "flex", alignItems: "center", position: "sticky", top: 0, background: C.bg, zIndex: 2 }}>
                                          🎯 ANALYST & EARNINGS
                                        </div>

                                        {/* Analyst Ratings — Finviz is primary source (Yahoo v10 = 401) */}
                                        {(() => {
                                          // fv.recom: 1=Strong Buy, 2=Buy, 3=Hold, 4=Sell, 5=Strong Sell
                                          const recomScore = fv?.recom || 0;
                                          const recKey  = fd?.recommendationKey || null;
                                          const target  = fv?.targetPrice || Number(fd?.analystTarget || fd?.targetMeanPrice || 0);
                                          const tHigh   = Number(fd?.targetHighPrice || 0);
                                          const tLow    = Number(fd?.targetLowPrice  || 0);
                                          const price   = Number(livePrice || row.quote?.price || 0);
                                          const upside  = (target > 0 && price > 0) ? ((target - price) / price * 100) : null;
                                          const numAnal = Number(fd?.numberOfAnalystOpinions || 0);
                                          const ratingScore = Number(fd?.recommendationMean || recomScore || 0);

                                          // Breakdown counts from recommendationTrend
                                          const sb = Number(fd?.analystStrongBuy  || 0);
                                          const b  = Number(fd?.analystBuy        || 0);
                                          const h  = Number(fd?.analystHold       || 0);
                                          const s  = Number(fd?.analystSell       || 0);
                                          const ss = Number(fd?.analystStrongSell || 0);
                                          const totalRec = sb + b + h + s + ss;

                                          // Convert Finviz recom score to label
                                          const fvRecLabel = recomScore > 0
                                            ? (recomScore <= 1.5 ? "STRONG BUY" : recomScore <= 2.5 ? "BUY" : recomScore <= 3.5 ? "HOLD" : recomScore <= 4.5 ? "SELL" : "STRONG SELL")
                                            : null;
                                          const recLabel = recKey
                                            ? recKey.replace(/_/g, " ").toUpperCase()
                                            : fvRecLabel || (numAnal > 0 ? "COVERAGE" : "—");
                                          const recColor = (recLabel.includes("BUY") || recLabel.includes("OUTPERFORM")) ? C.green
                                            : (recLabel.includes("SELL") || recLabel.includes("UNDERPERFORM")) ? C.red
                                            : recLabel === "HOLD" ? C.amber : C.textDim;

                                          return (
                                            <div style={{ marginBottom: 12 }}>
                                              <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: C.textDim,
                                                letterSpacing: "0.08em", marginBottom: 6 }}>📊 ANALYST CONSENSUS</div>

                                              {/* Consensus badge */}
                                              <div style={{ padding: "8px 10px", borderRadius: 6, marginBottom: 8,
                                                background: `${recColor}18`, border: `1px solid ${recColor}44`,
                                                textAlign: "center" }}>
                                                <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: recColor }}>
                                                  {recLabel}
                                                </div>
                                                {numAnal > 0 && (
                                                  <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 2 }}>
                                                    {numAnal} analyst{numAnal !== 1 ? "s" : ""}
                                                    {ratingScore > 0 ? ` · score ${ratingScore.toFixed(1)}/5` : ""}
                                                  </div>
                                                )}
                                              </div>

                                              {/* Buy/Hold/Sell breakdown bar */}
                                              {totalRec > 0 && (
                                                <div style={{ marginBottom: 8 }}>
                                                  <div style={{ height: 10, borderRadius: 5, overflow: "hidden",
                                                    display: "flex", marginBottom: 4 }}>
                                                    {[[sb + b, C.green], [h, C.amber], [s + ss, C.red]].map(([v, col], i) => (
                                                      v > 0 ? <div key={i} style={{ width: `${(v / totalRec * 100).toFixed(1)}%`, background: col }} /> : null
                                                    ))}
                                                  </div>
                                                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                                                    <span style={{ color: C.green }}>BUY {sb + b}</span>
                                                    <span style={{ color: C.amber }}>HOLD {h}</span>
                                                    <span style={{ color: C.red }}>SELL {s + ss}</span>
                                                  </div>
                                                </div>
                                              )}

                                              {[
                                                ["Price Target", target > 0 ? `$${target.toFixed(2)}` : "—", C.text],
                                                ["High Target",  tHigh > 0  ? `$${tHigh.toFixed(2)}`  : "—", C.green],
                                                ["Low Target",   tLow > 0   ? `$${tLow.toFixed(2)}`   : "—", C.red],
                                                ["Upside", upside != null ? `${upside > 0 ? "+" : ""}${upside.toFixed(1)}%` : "—",
                                                  upside == null ? C.textDim : upside > 0 ? C.green : C.red],
                                              ].map(([k, v, col]) => (
                                                <div key={k} style={{ display: "flex", justifyContent: "space-between",
                                                  fontFamily: MONO, fontSize: 13, padding: "5px 0",
                                                  borderBottom: `1px solid ${C.border}22` }}>
                                                  <span style={{ fontFamily: SANS, color: C.textDim, fontSize: 12 }}>{k}</span>
                                                  <span style={{ color: col, fontWeight: 700 }}>{v}</span>
                                                </div>
                                              ))}
                                            </div>
                                          );
                                        })()}

                                        {/* Earnings — Finviz as primary data source */}
                                        {(() => {
                                          const earnDate  = fd?.earningsDate;
                                          const epsEst    = Number(fd?.epsForward || fd?.epsCurrentYear || 0);
                                          const epsTrail  = Number(fd?.epsTrailingTwelveMonths || fd?.eps || 0);
                                          const revGrowth = Number(fd?.revenueGrowth || 0);
                                          const earnGrowth= Number(fd?.earningsGrowth || 0);

                                          let daysToEarn  = null;
                                          let earnLabel   = "—";
                                          if (earnDate) {
                                            const d = new Date(typeof earnDate === "number" ? earnDate * 1000 : earnDate);
                                            const diff = Math.round((d - Date.now()) / 86400000);
                                            daysToEarn = diff;
                                            earnLabel = diff === 0 ? "TODAY 🔥"
                                              : diff > 0 ? `in ${diff}d`
                                              : `${Math.abs(diff)}d ago`;
                                          }

                                          const pxE = Number(livePrice || row.quote?.price || 0);
                                          const hiE = Number(row.quote?.yearHigh || 0);
                                          const loE = Number(row.quote?.yearLow  || 0);
                                          const annVol = (hiE > loE && pxE > 0) ? (hiE - loE) / pxE : 0;
                                          const expMove = (daysToEarn != null && daysToEarn >= 0 && daysToEarn <= 14 && annVol > 0) ? (annVol / Math.sqrt(252) * 100).toFixed(1) : null;

                                          return (
                                            <div>
                                              <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: C.textDim,
                                                letterSpacing: "0.08em", marginBottom: 6 }}>📅 EARNINGS</div>
                                              {expMove && daysToEarn <= 7 && (
                                                <div style={{ padding: "7px 10px", borderRadius: 6, marginBottom: 8,
                                                  background: `${C.amber}14`, border: `1px solid ${C.amber}44` }}>
                                                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.amber }}>
                                                    ⚡ {daysToEarn === 0 ? "EARNINGS TODAY" : `EARNINGS IN ${daysToEarn}d`}
                                                  </div>
                                                  <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, marginTop: 3 }}>
                                                    Expected move: <span style={{ fontFamily: MONO, fontWeight: 700, color: C.amber }}>±{expMove}%</span>
                                                  </div>
                                                </div>
                                              )}
                                              {[
                                                ["Next Report", earnLabel, daysToEarn != null && daysToEarn >= 0 && daysToEarn <= 7 ? C.amber : C.text],
                                                ["EPS Est",  epsEst  ? `$${epsEst.toFixed(2)}`  : "—", C.text],
                                                ["EPS TTM",  epsTrail? `$${epsTrail.toFixed(2)}` : "—", C.textSec],
                                                ["Rev Grw",  revGrowth  ? `${(revGrowth*100).toFixed(1)}%`   : "—",
                                                  revGrowth > 0 ? C.green : revGrowth < 0 ? C.red : C.textDim],
                                                ["Earn Grw", earnGrowth ? `${(earnGrowth*100).toFixed(1)}%`  : "—",
                                                  earnGrowth > 0 ? C.green : earnGrowth < 0 ? C.red : C.textDim],
                                                // Finviz ownership + short data
                                                ...(fv ? [
                                                  ["Short Float", fv.shortFloat ? `${fv.shortFloat.toFixed(1)}%` : "—", fv.shortFloat > 20 ? C.red : fv.shortFloat > 10 ? C.amber : C.green],
                                                  ["Days to Cover", fv.shortRatio ? `${fv.shortRatio.toFixed(1)}d` : "—", fv.shortRatio > 5 ? C.amber : C.text],
                                                  ["Inst Own", fv.institutionalPct ? `${fv.institutionalPct.toFixed(1)}%` : "—", C.text],
                                                  ["Insider Own", fv.insiderPct ? `${fv.insiderPct.toFixed(1)}%` : "—", fv.insiderPct > 10 ? C.green : C.text],
                                                  ["Beta", fv.beta ? fv.beta.toFixed(2) : "—", fv.beta > 1.5 ? C.red : fv.beta < 0.8 ? C.green : C.text],
                                                  ["P/B", fv.pb ? fv.pb.toFixed(2) : "—", fv.pb > 0 && fv.pb < 1 ? C.green : fv.pb > 5 ? C.red : C.text],
                                                  ["ROE", fv.roe ? `${fv.roe.toFixed(1)}%` : "—", fv.roe > 15 ? C.green : fv.roe < 0 ? C.red : C.text],
                                                ] : []),
                                              ].map(([k, v, col]) => (
                                                <div key={k} style={{ display: "flex", justifyContent: "space-between",
                                                  fontFamily: MONO, fontSize: 13, padding: "6px 0",
                                                  borderBottom: `1px solid ${C.border}22` }}>
                                                  <span style={{ fontFamily: SANS, color: C.textDim, fontSize: 12 }}>{k}</span>
                                                  <span style={{ color: col, fontWeight: 700 }}>{v}</span>
                                                </div>
                                              ))}

                                              {/* ── Earnings Surprise History ── */}
                                              {(() => {
                                                const hist = fd?.earningsHistory || deepData?.earningsHistory || [];
                                                if (!hist.length) return null;
                                                return (
                                                  <div style={{ marginTop: 10 }}>
                                                    <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: C.textDim,
                                                      letterSpacing: "0.08em", marginBottom: 6 }}>📊 SURPRISE HISTORY</div>
                                                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                                      {hist.slice(0, 4).map((q, qi) => {
                                                        const surprise = q.surprise || q.epsDiff || 0;
                                                        const beat = surprise >= 0;
                                                        const pct  = q.surprisePct || (q.estimate > 0 ? surprise / Math.abs(q.estimate) * 100 : 0);
                                                        const rxn  = q.reaction || q.priceChange || null;
                                                        return (
                                                          <div key={qi} style={{ display: "flex", alignItems: "center", gap: 6,
                                                            padding: "5px 8px", borderRadius: 6,
                                                            background: beat ? `${C.green}10` : `${C.red}10`,
                                                            border: `1px solid ${beat ? C.green : C.red}33` }}>
                                                            <span style={{ fontSize: 14 }}>{beat ? "✅" : "❌"}</span>
                                                            <div style={{ flex: 1 }}>
                                                              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{q.quarter || q.date || `Q${4 - qi}`}</div>
                                                              <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: beat ? C.green : C.red }}>
                                                                {beat ? "BEAT" : "MISS"} {pct ? `${Math.abs(pct).toFixed(0)}%` : ""}
                                                              </div>
                                                            </div>
                                                            {rxn != null && (
                                                              <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800,
                                                                color: rxn >= 0 ? C.green : C.red, textAlign: "right" }}>
                                                                {rxn >= 0 ? "+" : ""}{rxn.toFixed(1)}%
                                                              </div>
                                                            )}
                                                          </div>
                                                        );
                                                      })}
                                                    </div>
                                                  </div>
                                                );
                                              })()}
                                            </div>
                                          );
                                        })()}
                                      </div>

                                      {/* ── Col 7: AI Trade Setup + Auto-Execute ── */}
                                      <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", padding: "0 12px", borderRight: `1px solid ${C.border}33`}}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700,
                                            color: C.textDim, letterSpacing: "0.06em" }}>
                                            🤖 AI TRADE SETUP
                                          </div>
                                          {!tradeSetups[row.ticker] && (
                                            <button
                                              onClick={() => { if (!deepData) { loadDeepDive(row.ticker).then(() => fetchTradeSetup(row.ticker, row)); } else { fetchTradeSetup(row.ticker, row); } }}
                                              disabled={tradeSetupLoad[row.ticker]}
                                              style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                                                background: tradeSetupLoad[row.ticker] ? C.surface : `${C.purple}18`,
                                                border: `1px solid ${tradeSetupLoad[row.ticker] ? C.border : C.purple}`,
                                                color: tradeSetupLoad[row.ticker] ? C.textDim : C.purple,
                                                borderRadius: 6, padding: "4px 12px",
                                                cursor: tradeSetupLoad[row.ticker] ? "default" : "pointer" }}>
                                              {tradeSetupLoad[row.ticker] ? "⌛ Generating…" : "▶ GENERATE"}
                                            </button>
                                          )}
                                          {tradeSetups[row.ticker] && (
                                            <button
                                              onClick={() => { setTradeSetups(prev => { const n = {...prev}; delete n[row.ticker]; return n; }); }}
                                              style={{ fontFamily: MONO, fontSize: 12, color: C.textDim,
                                                background: "none", border: "none", cursor: "pointer" }}>
                                              ↺ Regenerate
                                            </button>
                                          )}
                                        </div>

                                        {tradeSetupError[row.ticker] && (
                                          <div style={{ fontFamily: MONO, fontSize: 12, color: C.red,
                                            background: C.redBg, borderRadius: 6, padding: "8px 10px" }}>
                                            ⚠ {tradeSetupError[row.ticker]}
                                          </div>
                                        )}

                                        {tradeSetupLoad[row.ticker] && (
                                          <div style={{ fontFamily: MONO, fontSize: 12, color: C.purple,
                                            background: `${C.purple}10`, borderRadius: 6, padding: "12px 10px",
                                            textAlign: "center" }}>
                                            ⌛ Claude is analysing {row.ticker}…
                                          </div>
                                        )}

                                        {tradeSetups[row.ticker] && (() => {
                                          const plan = tradeSetups[row.ticker].plan || "";
                                          // Parse sections from plain-text response
                                          const sections = plan.split(/\n(?=[A-Z /]{4,}$)/m);
                                          const SECTION_COLORS = {
                                            "VERDICT": C.amber, "ENTRY": C.green, "STOP": C.red,
                                            "PRICE TARGETS": C.cyan, "RISK": C.amber, "KEY": C.accent,
                                            "RED": C.red, "SETUP": C.text,
                                          };
                                          const getCol = (line) => {
                                            const up = line.toUpperCase();
                                            for (const [k, v] of Object.entries(SECTION_COLORS)) {
                                              if (up.startsWith(k)) return v;
                                            }
                                            return null;
                                          };
                                          return (
                                            <div style={{ flex: 1, overflowY: "auto",
                                              background: C.surface,
                                              border: `1px solid ${C.border}`, borderRadius: 6,
                                              padding: "12px 14px" }}>
                                              {plan.split("\n").map((line, li) => {
                                                const col = getCol(line.trim());
                                                const isEmpty = !line.trim();
                                                return (
                                                  <div key={li} style={{
                                                    fontFamily: MONO,
                                                    fontSize: col ? 11 : 10,
                                                    fontWeight: col ? 800 : 400,
                                                    color: col || C.textSec,
                                                    marginTop: (col || isEmpty) ? (col ? 8 : 4) : 0,
                                                    lineHeight: 1.6,
                                                  }}>
                                                    {isEmpty ? null : line}
                                                  </div>
                                                );
                                              })}
                                              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim,
                                                marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
                                                Generated {new Date(tradeSetups[row.ticker].generatedAt).toLocaleTimeString()} · Claude AI
                                              </div>
                                            </div>
                                          );
                                        })()}

                                        {!tradeSetups[row.ticker] && !tradeSetupLoad[row.ticker] && !tradeSetupError[row.ticker] && (
                                          <div style={{ flex: 1, fontFamily: SANS, fontSize: 13, color: C.textDim,
                                            background: `${C.purple}08`, border: `1px dashed ${C.purple}44`,
                                            borderRadius: 8, padding: "16px 14px", textAlign: "center",
                                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                                            <div style={{ fontSize: 20 }}>🤖</div>
                                            <div style={{ color: C.textDim, fontSize: 12, lineHeight: 1.6 }}>
                                              Auto-generating trade plan…<br/>
                                              <span style={{ color: C.purple }}>entry · stop · targets · R:R · risks</span>
                                            </div>
                                          </div>
                                        )}

                                        {/* ── Auto-Execute button — uses Master Verdict not raw scanner signal ── */}
                                        {(() => {
                                          // Re-compute master verdict here to decide buy/sell/block
                                          const px3    = Number(livePrice || row.quote?.price || 0);
                                          const smc3   = deepData?.smc;
                                          const sd3    = deepSocialData[row.ticker];
                                          const ma503  = Number(row.quote?.priceAvg50  || 0);
                                          const ma2003 = Number(row.quote?.priceAvg200 || 0);
                                          const hi523  = Number(row.quote?.yearHigh || 0);
                                          const lo523  = Number(row.quote?.yearLow  || 0);
                                          const bosBull3  = smc3?.bos?.type === "BULL_BOS";
                                          const bosBear3  = smc3?.bos?.type === "BEAR_BOS";
                                          const sentBull3 = sd3?.stocktwits?.bullPct ?? 50;
                                          const ttPx3 = [
                                            ma2003 > 0 && px3 > ma2003, ma503 > 0 && ma2003 > 0 && ma503 > ma2003,
                                            ma503 > 0 && px3 > ma503, lo523 > 0 && px3 >= lo523*1.30,
                                            hi523 > 0 && px3 >= hi523*0.75, (row.rsiVal||50) >= 60,
                                            row.ema9v && row.ema21v && row.ema9v > row.ema21v,
                                          ].filter(Boolean).length;
                                          const smcScore3 = bosBull3 ? 80 : bosBear3 ? 20 : 50;
                                          const macdScore3 = row.macdBull === true ? 70 : row.macdBull === false ? 30 : 50;
                                          const master3 = (row.score||50)*0.20 + smcScore3*0.25 + (ttPx3/7*100)*0.20 + sentBull3*0.15 + 50*0.10 + macdScore3*0.10;

                                          // Only show button for clear high-conviction signals
                                          const masterVerdict = master3 >= 68 ? "buy" : master3 <= 38 ? "sell" : null;
                                          const signal  = masterVerdict; // Master Verdict drives the button
                                          const price   = Number(row.quote?.price || 0);
                                          const status  = autoExecStatus[row.ticker];

                                          // Show warning if scanner signal contradicts master verdict
                                          const scanSaysBuy  = row.signal === "STRONG BUY" || row.signal === "BUY";
                                          const conflict = (scanSaysBuy && masterVerdict === "sell") || (!scanSaysBuy && masterVerdict === "buy");

                                          if (conflict && !masterVerdict) return (
                                            <div style={{ marginTop: 10, padding: "10px 12px", background: `${C.amber}0d`,
                                              border: `1px solid ${C.amber}44`, borderRadius: 6 }}>
                                              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.amber }}>
                                                ⚠ CONFLICTING SIGNALS — NO AUTO TRADE
                                              </div>
                                              <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 4 }}>
                                                Scanner: {row.signal} vs Master Verdict: {master3.toFixed(0)}/100<br/>
                                                Signals must agree before executing. Review manually.
                                              </div>
                                            </div>
                                          );

                                          if (!signal || !price) return (
                                            <div style={{ marginTop: 10, padding: "10px 12px", background: C.surface,
                                              border: `1px solid ${C.border}`, borderRadius: 6 }}>
                                              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                                                🤖 AUTO TRADE — Master Score {master3.toFixed(0)}/100
                                              </div>
                                              <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 4 }}>
                                                No clear signal (need ≥68 to BUY or ≤38 to SELL). Wait for conviction.
                                              </div>
                                            </div>
                                          );
                                          if (!signal || !price) return null;
                                          return (
                                            <div style={{ marginTop: 10, padding: "10px 12px",
                                              background: signal === "buy" ? `${C.green}0d` : `${C.red}0d`,
                                              border: `1px solid ${signal === "buy" ? C.green : C.red}44`,
                                              borderRadius: 6 }}>
                                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                                <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>🤖 AUTO TRADE</span>
                                                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                                                  color: signal === "buy" ? C.green : C.red }}>
                                                  Master: {master3.toFixed(0)}/100
                                                </span>
                                              </div>
                                              {conflict && (
                                                <div style={{ fontFamily: SANS, fontSize: 12, color: C.amber, marginBottom: 6 }}>
                                                  ⚠ Scanner says {row.signal} but Master Verdict overrides
                                                </div>
                                              )}
                                              {status === "placing" && (
                                                <div style={{ fontFamily: MONO, fontSize: 12, color: C.amber }}>⌛ Placing order…</div>
                                              )}
                                              {status === "done" && (
                                                <div style={{ fontFamily: MONO, fontSize: 12, color: C.green }}>✅ Order placed! Check Telegram for confirmation.</div>
                                              )}
                                              {status === "error" && (
                                                <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>⚠ Order failed — check AUTO-EXEC tab.</div>
                                              )}
                                              {!status && (
                                                <button
                                                  onClick={async () => {
                                                    setAutoExecStatus(p => ({ ...p, [row.ticker]: "placing" }));
                                                    try {
                                                      const cfgR = await fetch("/api/autoexec/config");
                                                      const cfg  = await cfgR.json();
                                                      const qty  = Math.max(1, Math.floor((cfg.positionSize || 500) / price));
                                                      const r    = await fetch("/api/autoexec/order", {
                                                        method: "POST",
                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({ side: signal, symbol: row.ticker, quantity: qty, type: cfg.orderType || "market" }),
                                                      });
                                                      const d = await r.json();
                                                      if (d.error) throw new Error(d.error);
                                                      setAutoExecStatus(p => ({ ...p, [row.ticker]: "done" }));
                                                    } catch {
                                                      setAutoExecStatus(p => ({ ...p, [row.ticker]: "error" }));
                                                    }
                                                  }}
                                                  style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800,
                                                    background: signal === "buy" ? C.green : C.red,
                                                    color: "#fff", border: "none", borderRadius: 5,
                                                    padding: "7px 16px", cursor: "pointer", width: "100%" }}>
                                                  {signal === "buy" ? "🟢 BUY" : "🔴 SELL"} {row.ticker} NOW
                                                </button>
                                              )}
                                              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 5 }}>
                                                Uses position size from AUTO-EXEC settings · Confirm in Telegram
                                              </div>
                                            </div>
                                          );
                                        })()}
                                      </div>

                                    </div>
                                    </>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  </div> {/* end overflow scroll wrapper */}
                </div>
              )}

              {/* ── Legend ── */}
              {scanResults.length > 0 && (
                <div style={{ marginTop: 10, padding: "8px 14px",
                  background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
                  display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                    {[["STRONG BUY","#00e676"],["BUY","#4caf50"],["WATCH","#26a69a"],["NEUTRAL","#ffaa00"],["AVOID","#ff4444"]].map(([l,c]) => (
                      <span key={l} style={{ marginRight: 14 }}>
                        <span style={{ color: c }}>■</span> {l}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginLeft: "auto" }}>
                    Click any row to expand deep dive ↓ · Score = RSI + MACD + EMA + Zone + Volume + Sentiment
                  </div>
                </div>
              )}
            {/* ── SCAN HISTORY ── */}
            {scanHistory.length > 0 && (
              <div style={{ marginTop: 16, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px" }}>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.textDim, marginBottom: 10, letterSpacing: "0.06em" }}>
                  📋 SCAN HISTORY
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {scanHistory.map((h, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px",
                      background: i === 0 ? `${C.accent}08` : "transparent",
                      border: `1px solid ${i === 0 ? C.accent : C.border}22`, borderRadius: 6 }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, flexShrink: 0, width: 48 }}>
                        {h.ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, flexShrink: 0 }}>
                        {h.total} stocks
                      </span>
                      <div style={{ display: "flex", gap: 5, flex: 1, flexWrap: "wrap" }}>
                        {h.topBuys.map(s => (
                          <span key={s.ticker} onClick={() => { setTerminalSymbol(s.ticker); setActiveTab("smartscan"); }}
                            style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.green,
                              background: `${C.green}14`, borderRadius: 4, padding: "1px 6px", cursor: "pointer" }}>
                            🟢 {s.ticker} {s.score}
                          </span>
                        ))}
                        {h.topSells.map(s => (
                          <span key={s.ticker} onClick={() => { setTerminalSymbol(s.ticker); setActiveTab("smartscan"); }}
                            style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.red,
                              background: `${C.red}12`, borderRadius: 4, padding: "1px 6px", cursor: "pointer" }}>
                            🔴 {s.ticker} {s.score}
                          </span>
                        ))}
                      </div>
                      {i === 0 && <span style={{ fontFamily: SANS, fontSize: 10, color: C.accent, flexShrink: 0 }}>LATEST</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            </div>
          );
}
