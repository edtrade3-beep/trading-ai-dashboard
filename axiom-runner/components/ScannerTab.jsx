import { Badge } from "./ui-atoms.jsx";
import { SECTOR_ETFS } from "./market-helpers.js";

const scanZoneOf = (score) => score >= 70 ? "BUY" : score >= 50 ? "WATCH" : "SELL";

// Generate a PDF report of scan rows for one zone (client-side, via jsPDF CDN).
function exportScanZonePDF(rows, zone) {
  try {
    const JsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!JsPDF) { alert("PDF engine still loading — try again in a second."); return; }
    const doc = new JsPDF();
    const now = new Date();
    const zc = zone === "BUY" ? [22, 163, 74] : zone === "SELL" ? [220, 38, 38] : [217, 119, 6];
    doc.setFontSize(17); doc.setTextColor(zc[0], zc[1], zc[2]);
    doc.text(`Smart Scan — ${zone} ZONE`, 14, 18);
    doc.setFontSize(9); doc.setTextColor(120, 120, 120);
    doc.text(`${rows.length} symbol${rows.length !== 1 ? "s" : ""} · generated ${now.toLocaleString()}`, 14, 25);
    let y = 36;
    const cols = [["Symbol", 14], ["Price", 50], ["Chg%", 80], ["RVOL", 112], ["Score", 142], ["Sector", 170]];
    doc.setFontSize(10); doc.setTextColor(0, 0, 0); doc.setFont(undefined, "bold");
    cols.forEach(([h, x]) => doc.text(h, x, y));
    doc.setFont(undefined, "normal"); doc.setDrawColor(200, 200, 200); doc.line(14, y + 2, 196, y + 2);
    y += 8;
    if (!rows.length) { doc.setTextColor(120, 120, 120); doc.text("No symbols in this zone right now.", 14, y); }
    rows.forEach((q) => {
      if (y > 282) { doc.addPage(); y = 20; }
      const chg = Number(q.changesPercentage || 0);
      doc.setTextColor(0, 0, 0); doc.text(String(q.symbol || ""), 14, y);
      doc.text("$" + Number(q.price || 0).toFixed(2), 50, y);
      doc.setTextColor(chg >= 0 ? 22 : 220, chg >= 0 ? 163 : 38, chg >= 0 ? 74 : 38);
      doc.text((chg >= 0 ? "+" : "") + chg.toFixed(2) + "%", 80, y);
      doc.setTextColor(0, 0, 0);
      doc.text(Number(q.rvol || 0).toFixed(2) + "x", 112, y);
      doc.text(String(Math.round(q.scannerScore || 0)), 142, y);
      doc.text(String(q.sectorEtf || "-"), 170, y);
      y += 6.5;
    });
    doc.save(`smartscan-${zone.toLowerCase()}-zone-${now.toISOString().slice(0, 10)}.pdf`);
  } catch (e) { alert("PDF export failed: " + e.message); }
}

export default function ScannerTab({
  C, MONO, scannerRows, lastUpdate, dataFreshSec, scannerFilters, setScannerFilters,
  setLoading, fetchAll, apiKey, runServerScreen, serverScreenLoading,
  marketUniverseData, marketUniverseLoading, loadMarketUniverse, flowBySymbol,
  setTerminalSymbol, setActiveTab, openTradingView, setScanResults, setScanExpanded,
  loadDeepDive, loadDeepSocial, setWatchlistSymbols, setQuickLogModal,
  serverScreenResults, setServerScreenResults,
}) {
  return (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                SCANNER BUILDER — MOMENTUM + RELATIVE STRENGTH
              </div>
              <div style={{ display: "flex", align: "center", gap: 10 }}>
                {scannerRows.filter(r => r.scannerScore >= 70).length > 0 && (
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.green, fontWeight: 700 }}>
                    ⭐ {scannerRows.filter(r => r.scannerScore >= 70).length} HIGH-SCORE SETUP{scannerRows.filter(r => r.scannerScore >= 70).length !== 1 ? "S" : ""}
                  </span>
                )}
                {lastUpdate && (
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                    Last scan: {lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {dataFreshSec != null && dataFreshSec < 190 ? ` · refreshes in ${Math.max(0, 180 - dataFreshSec)}s` : ""}
                  </span>
                )}
              </div>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, alignSelf: "center" }}>PRESETS:</span>
                {[
                  { label: "Momentum", f: { minPrice: "15", minChange: "2", minRvol: "1.5", minScore: "65", sector: "ALL" } },
                  { label: "Breakout", f: { minPrice: "20", minChange: "1", minRvol: "2", minScore: "70", sector: "ALL" } },
                  { label: "Pullback", f: { minPrice: "20", minChange: "-2", minRvol: "1.2", minScore: "60", sector: "ALL" } },
                  { label: "Short Setup", f: { minPrice: "15", minChange: "-1.5", minRvol: "1.5", minScore: "55", sector: "ALL" } },
                  { label: "RVOL Spike", f: { minPrice: "10", minChange: "0.5", minRvol: "3", minScore: "55", sector: "ALL" } },
                  { label: "Large Cap", f: { minPrice: "50", minChange: "0.3", minRvol: "1", minScore: "60", sector: "ALL" } },
                  { label: "Reset", f: { minPrice: "10", minChange: "0.5", minRvol: "1", minScore: "55", sector: "ALL" } },
                ].map(({ label, f }) => (
                  <button key={label} onClick={() => setScannerFilters(s => ({ ...s, ...f }))}
                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 999, padding: "3px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>
                    {label}
                  </button>
                ))}
              </div>
              {/* These 4 filters always carry a real value (presets/reset all
                  populate one), so their `placeholder` text — the only
                  labeling they had — was never actually visible: HTML
                  placeholders only show on an empty field. A user just saw
                  bare numbers (10, 0.5, 1, 55) with no indication what any
                  of them meant. Persistent labels above each field instead. */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(120px, 1fr))", gap: 8, alignItems: "end" }}>
                {[
                  ["MIN PRICE", "minPrice", /[^\d.]/g],
                  ["MIN |CHG%|", "minChange", /[^\d.-]/g],
                  ["MIN RVOL", "minRvol", /[^\d.]/g],
                  ["MIN SCORE", "minScore", /[^\d]/g],
                ].map(([label, key, strip]) => (
                  <div key={key}>
                    <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: "0.05em", marginBottom: 3 }}>{label}</div>
                    <input value={scannerFilters[key]} onChange={(e) => setScannerFilters((s) => ({ ...s, [key]: e.target.value.replace(strip, "") }))}
                      style={{ width: "100%", boxSizing: "border-box", background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }} />
                  </div>
                ))}
                <select value={scannerFilters.sector} onChange={(e) => setScannerFilters((s) => ({ ...s, sector: e.target.value }))} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }}>
                  <option value="ALL">All Sectors</option>
                  {SECTOR_ETFS.map((s) => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
                </select>
                <select value={scannerFilters.scope} onChange={(e) => setScannerFilters((s) => ({ ...s, scope: e.target.value }))} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }}>
                  <option value="watchlist">Watchlist Scope</option>
                  <option value="market">Market-Wide Scope</option>
                </select>
                <button onClick={() => { setLoading(true); fetchAll(apiKey).finally(() => setLoading(false)); }} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "8px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>
                  REFRESH SCAN
                </button>
                <button onClick={runServerScreen} disabled={serverScreenLoading} style={{ border: `1px solid ${C.accent}`, background: serverScreenLoading ? C.surface : C.card, color: C.accent, borderRadius: 6, padding: "8px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>
                  {serverScreenLoading ? "SCREENING…" : "SERVER SCREEN"}
                </button>
              </div>
              {scannerFilters.scope === "market" && (
                <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                  Market universe: {marketUniverseData.length} symbols loaded {marketUniverseLoading ? "(loading...)" : ""}.
                  <button onClick={loadMarketUniverse} style={{ marginLeft: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text, borderRadius: 6, padding: "4px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>
                    RELOAD UNIVERSE
                  </button>
                </div>
              )}
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 12, color: C.textDim, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span>MATCHES: {scannerRows.length}</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: C.textDim }}>📄 EXPORT PDF:</span>
                {[["BUY", C.green], ["WATCH", C.amber], ["SELL", C.red]].map(([z, col]) => {
                  const n = scannerRows.filter(q => scanZoneOf(q.scannerScore) === z).length;
                  return (
                    <button key={z} onClick={() => exportScanZonePDF(scannerRows.filter(q => scanZoneOf(q.scannerScore) === z), z)}
                      title={`Export the ${n} ${z}-zone symbols to a PDF`}
                      style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6,
                        border: `1px solid ${col}`, background: `${col}14`, color: col, cursor: "pointer" }}>
                      {z} ({n})
                    </button>
                  );
                })}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: C.surface }}>
                      <th style={{ padding: "8px", textAlign: "left", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Symbol</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Price</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>CHG%</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>RVOL</th>
                      <th style={{ padding: "8px", textAlign: "left", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Sector</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Score</th>
                      <th style={{ padding: "8px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Flow</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scannerRows.map((q) => {
                      const flow = flowBySymbol.find((f) => f.symbol === q.symbol);
                      const chg = Number(q.changesPercentage || 0);
                      return (
                        <tr key={`scan-${q.symbol}`}>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, fontFamily: MONO, fontWeight: 700, color: C.text }}>
                            <div>{q.symbol}</div>
                            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                              <button
                                onClick={() => { setTerminalSymbol(q.symbol); try { localStorage.setItem("mterminal_load_sym", q.symbol); } catch {} setActiveTab("mterminal"); }}
                                style={{ border: `1px solid ${C.accent}40`, background: `${C.accent}15`, color: C.accent, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                              >CHART</button>
                              <button
                                onClick={() => openTradingView(q.symbol)}
                                style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                              >TV</button>
                              <button onClick={() => { setScanResults(prev => prev.some(r=>r.ticker===q.symbol)?prev:[{ticker:q.symbol,score:50,signal:"WATCH",scannerScore:50,signals:[],sColor:C.amber,quote:{price:q.price||0,changePercent:0},candles:null},...prev]); setActiveTab("smartscan"); setTimeout(()=>{setScanExpanded(q.symbol);loadDeepDive(q.symbol);loadDeepSocial(q.symbol);},100); }} style={{ border: `1px solid ${C.accent}44`, background: `${C.accent}15`, color: C.accent, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>DIVE</button>
                              <button
                                onClick={() => setWatchlistSymbols((prev) => Array.from(new Set([...prev, q.symbol])))}
                                style={{ border: `1px solid ${C.green}55`, background: C.surface, color: C.green, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                                title="Add to watchlist"
                              >+WL</button>
                              <button
                                onClick={() => setQuickLogModal({ symbol: q.symbol, price: q.price || 0, entry: (q.price || 0).toFixed(2), stopLoss: "", target: "", size: "", side: "BUY", timeframe: "1D", style: "Breakout", notes: `Scanner hit · CHG ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}% · RVOL ${q.rvol.toFixed(2)}x · Score ${q.scannerScore}`, score: q.scannerScore || 0, chg, rvol: q.rvol || 0 })}
                                style={{ border: `1px solid ${C.accent}55`, background: C.surface, color: C.accent, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                                title="Quick log to journal"
                              >LOG</button>
                              <button
                                onClick={async () => {
                                  const msg = `🔍 *${q.symbol}* Scanner Hit\nPrice: $${q.price.toFixed(2)}  CHG: ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%\nRVOL: ${q.rvol.toFixed(2)}x  Score: ${q.scannerScore}${q.sectorEtf ? "\nSector: " + q.sectorEtf : ""}`;
                                  try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }); } catch {}
                                }}
                                style={{ border: `1px solid ${C.textDim}44`, background: C.surface, color: C.textDim, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                                title="Send to Telegram"
                              >PUSH</button>
                            </div>
                          </td>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, color: C.text }}>${q.price.toFixed(2)}</td>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, color: chg >= 0 ? C.green : C.red }}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</td>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, color: q.rvol >= 1.2 ? C.green : C.text }}>{q.rvol.toFixed(2)}x</td>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, fontFamily: MONO, color: C.textSec }}>{q.sectorEtf || "-"}</td>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right" }}>
                            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: q.scannerScore >= 75 ? C.green : q.scannerScore >= 65 ? C.amber : C.red, background: q.scannerScore >= 75 ? `${C.green}18` : q.scannerScore >= 65 ? `${C.amber}18` : `${C.red}12`, padding: "3px 7px", borderRadius: 6 }}>
                              {q.scannerScore}
                            </span>
                          </td>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
                            {flow ? <Badge color={Number(flow.callPutRatio || 1) >= 1 ? C.green : C.red}>C/P {Number(flow.callPutRatio || 0).toFixed(2)}</Badge> : <span style={{ color: C.textDim, fontSize: 12 }}>-</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {!scannerRows.length && (
                      <tr>
                        <td colSpan={7} style={{ padding: 14, textAlign: "center", color: C.textDim, fontSize: 12 }}>
                          No symbols match current scanner filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {serverScreenResults !== null && (
              <div style={{ background: C.card, border: `1px solid ${C.accent}`, borderRadius: 8, overflow: "hidden", marginTop: 12 }}>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.accent }}>SERVER SCREEN RESULTS: {serverScreenResults.length}</span>
                  <button onClick={() => setServerScreenResults(null)} style={{ border: "none", background: "transparent", color: C.textDim, fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>CLEAR</button>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: C.surface }}>
                        <th style={{ padding: "8px", textAlign: "left", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Symbol</th>
                        <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Price</th>
                        <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>CHG%</th>
                        <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>RVOL</th>
                        <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Tech</th>
                        <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serverScreenResults.map((q) => {
                        const chg = Number(q.changesPercentage || 0);
                        return (
                          <tr key={`srv-${q.symbol}`}>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, fontFamily: MONO, fontWeight: 700, color: C.text }}>
                              <div>{q.symbol}</div>
                              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                                <button onClick={() => { setTerminalSymbol(q.symbol); try { localStorage.setItem("mterminal_load_sym", q.symbol); } catch {} setActiveTab("mterminal"); }} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.accent, borderRadius: 6, padding: "2px 5px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>CHART</button>
                                <button onClick={() => openTradingView(q.symbol)} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "2px 5px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>TV</button>
                                <button onClick={() => { setScanResults(prev => prev.some(r=>r.ticker===q.symbol)?prev:[{ticker:q.symbol,score:50,signal:"WATCH",scannerScore:50,signals:[],sColor:C.amber,quote:{price:Number(q.price)||0,changePercent:0},candles:null},...prev]); setActiveTab("smartscan"); setTimeout(()=>{setScanExpanded(q.symbol);loadDeepDive(q.symbol);loadDeepSocial(q.symbol);},100); }} style={{ border: `1px solid ${C.accent}44`, background: `${C.accent}15`, color: C.accent, borderRadius: 6, padding: "2px 5px", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>DIVE</button>
                                <button onClick={() => setWatchlistSymbols((prev) => Array.from(new Set([...prev, q.symbol])))} style={{ border: `1px solid ${C.green}55`, background: C.surface, color: C.green, borderRadius: 6, padding: "2px 5px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>+WL</button>
                                <button onClick={() => setQuickLogModal({ symbol: q.symbol, price: Number(q.price) || 0, entry: (Number(q.price) || 0).toFixed(2), stopLoss: "", target: "", size: "", side: chg >= 0 ? "BUY" : "SELL", timeframe: "1D", style: "Breakout", notes: `Server scan · RVOL ${Number(q.rvol || 0).toFixed(2)}x · Score ${q.composite}`, score: Number(q.composite || 0), chg, rvol: Number(q.rvol || 0) })} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.green, borderRadius: 6, padding: "2px 5px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>LOG</button>
                                <button onClick={async () => {
                                  const msg = `🔍 *${q.symbol}* Server Screen Hit\nPrice: $${Number(q.price || 0).toFixed(2)}  CHG: ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%\nRVOL: ${Number(q.rvol || 0).toFixed(2)}x  Score: ${q.composite}`;
                                  try { await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }); } catch {}
                                }} style={{ border: `1px solid ${C.textDim}44`, background: C.surface, color: C.textDim, borderRadius: 6, padding: "2px 5px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }} title="Send to Telegram">PUSH</button>
                              </div>
                            </td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, color: C.text }}>${Number(q.price || 0).toFixed(2)}</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, color: chg >= 0 ? C.green : C.red }}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, color: Number(q.rvol || 0) >= 1.2 ? C.green : C.text }}>{Number(q.rvol || 0).toFixed(2)}x</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, color: C.textSec }}>{q.tech}</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, color: Number(q.composite || 0) >= 70 ? C.green : C.text }}>{q.composite}</td>
                          </tr>
                        );
                      })}
                      {!serverScreenResults.length && (
                        <tr>
                          <td colSpan={5} style={{ padding: 14, textAlign: "center", color: C.textDim, fontSize: 12 }}>No symbols matched the server-side screen filters.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
  );
}
