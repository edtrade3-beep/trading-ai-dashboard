import { formatNum } from "./ui-atoms.jsx";

// ─── parsePortfolioCSV ────────────────────────────────────────────────────────
// Handles three formats:
//  1. Robinhood Activity export (Activity Date, Instrument, Trans Code, Quantity, Price)
//  2. Generic positions CSV (symbol/ticker, shares/quantity, avgcost/average_cost/price)
//  3. Brokerage export with "Symbol", "Quantity", "Average Cost" headers
function parsePortfolioCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { rows: [], format: "empty", errors: ["File is empty or has only a header row."] };

  // Parse CSV line respecting quoted fields
  const parseRow = (line) => {
    const fields = [];
    let cur = "", inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { fields.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    fields.push(cur.trim());
    return fields;
  };

  const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/[\s_-]+/g, ""));
  const rows = lines.slice(1).map(parseRow);

  // ── Format 1: Robinhood Activity export ──
  // Columns: Activity Date, Process Date, Settle Date, Instrument, Description, Trans Code, Quantity, Price, Amount
  const iRH = {
    instrument: headers.findIndex(h => h === "instrument"),
    transCode:  headers.findIndex(h => h.includes("trans") || h === "transcode"),
    quantity:   headers.findIndex(h => h === "quantity"),
    price:      headers.findIndex(h => h === "price"),
  };
  if (iRH.instrument >= 0 && iRH.transCode >= 0 && iRH.quantity >= 0) {
    const positions = {};
    for (const row of rows) {
      const sym      = (row[iRH.instrument] || "").trim().toUpperCase();
      const code     = (row[iRH.transCode]  || "").trim().toUpperCase();
      const qty      = Math.abs(parseFloat(row[iRH.quantity] || "0") || 0);
      const price    = parseFloat(row[iRH.price] || "0") || 0;
      if (!sym || sym === "INSTRUMENT" || !qty) continue;
      const isBuy  = /BUY|BCSA|ACATS|REC/.test(code);
      const isSell = /SELL|SLL/.test(code);
      if (!isBuy && !isSell) continue;
      if (!positions[sym]) positions[sym] = { totalQty: 0, totalCost: 0 };
      if (isBuy)  { positions[sym].totalQty += qty; positions[sym].totalCost += qty * price; }
      if (isSell) { positions[sym].totalQty -= qty; }
    }
    const NON_STOCK = /^(CASH|USD|MMDA\d*|GOLD|RBHGOLD|INT|DIV|ACH|WIRE|FEE|INTEREST|DIVIDEND|OPTIONS?)$/i;
    const result = Object.entries(positions)
      .filter(([sym, p]) => {
        if (p.totalQty < 0.001) return false;               // closed or dust
        if (NON_STOCK.test(sym)) return false;               // cash / fees / gold subscription
        if (!/^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(sym)) return false; // not a valid ticker (skips options)
        return true;
      })
      .map(([sym, p]) => ({
        symbol:  sym,
        shares:  p.totalQty.toFixed(6).replace(/\.?0+$/, ""),
        avgCost: p.totalQty > 0 && p.totalCost > 0 ? (p.totalCost / p.totalQty).toFixed(2) : "0",
      }));
    return { rows: result, format: "Robinhood Activity", errors: result.length ? [] : ["No open positions found — all positions appear to be closed."] };
  }

  // ── Format 2 & 3: Generic positions CSV ──
  const colMap = {
    symbol:  headers.findIndex(h => ["symbol","ticker","instrument","stock"].includes(h)),
    shares:  headers.findIndex(h => ["shares","quantity","qty","units","sharesowned"].includes(h)),
    avgCost: headers.findIndex(h => ["avgcost","averagecost","costpershare","avgprice","purchaseprice","price","averageprice"].includes(h)),
  };
  if (colMap.symbol >= 0 && colMap.shares >= 0) {
    const result = [];
    const errors = [];
    for (const row of rows) {
      const sym  = (row[colMap.symbol] || "").trim().toUpperCase().replace(/[^A-Z.]/g, "");
      const qty  = parseFloat(row[colMap.shares] || "0");
      const cost = colMap.avgCost >= 0 ? parseFloat(row[colMap.avgCost] || "0") : 0;
      if (!sym || !qty || qty < 0.001) continue;
      if (!/^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(sym)) { errors.push(`Skipped: ${sym}`); continue; }
      const NON_STOCK2 = /^(CASH|USD|MMDA\d*|GOLD|RBHGOLD|INT|DIV|FEE)$/i;
      if (NON_STOCK2.test(sym)) continue;
      result.push({ symbol: sym, shares: qty.toFixed(6).replace(/\.?0+$/, ""), avgCost: cost > 0 ? cost.toFixed(2) : "0" });
    }
    return { rows: result, format: "Generic Positions CSV", errors };
  }

  return { rows: [], format: "unknown", errors: ["Could not recognise CSV format. Expected columns: Symbol, Shares/Quantity, Avg Cost."] };
}

export default function PortfolioTab({
  C, MONO, csvImportModal, pasteModal, pasteText, portfolioHoldings, watchlistSymbols,
  csvFileRef, portfolioRows, portfolioSummary,
  setActiveTab, setCsvImportModal, setPasteModal, setPasteText, setPortfolioHoldings,
  setTerminalSymbol, setWatchlistSymbols,
}) {
  return (
          <div>
            <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em", marginBottom: 14 }}>
              PORTFOLIO MANAGER - LIVE P/L TRACKER
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Market Value</div>
                <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.text }}>{formatNum(portfolioSummary.totalValue)}</div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Cost Basis</div>
                <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.text }}>{formatNum(portfolioSummary.totalCost)}</div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Unrealized P/L</div>
                <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: portfolioSummary.totalPnl >= 0 ? C.green : C.red }}>
                  {portfolioSummary.totalPnl >= 0 ? "+" : ""}{formatNum(portfolioSummary.totalPnl)}
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Return %</div>
                <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: portfolioSummary.totalPnlPct >= 0 ? C.green : C.red }}>
                  {portfolioSummary.totalPnlPct >= 0 ? "+" : ""}{portfolioSummary.totalPnlPct.toFixed(2)}%
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Winners / Losers</div>
                <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.text }}>{portfolioSummary.winners} / {portfolioSummary.losers}</div>
              </div>
            </div>
            {/* ── Paste & Scan Modal ── */}
            {pasteModal && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, width: "100%", maxWidth: 700, maxHeight: "88vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>

                  {/* Header */}
                  <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>📋 PASTE & SCAN PORTFOLIO</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 3 }}>
                        {pasteModal === "input"
                          ? "Paste tickers, or tickers + shares + cost — any format"
                          : pasteModal.scanning
                            ? `⟳ Fetching live prices for ${pasteModal.rows.length} symbols…`
                            : `${pasteModal.rows.length} positions scanned — edit then save`}
                      </div>
                    </div>
                    <button onClick={() => { setPasteModal(null); setPasteText(""); }} style={{ background: "none", border: "none", color: C.textDim, fontSize: 20, cursor: "pointer" }}>✕</button>
                  </div>

                  {/* Step 1 — paste input */}
                  {pasteModal === "input" && (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 20, gap: 14 }}>
                      <textarea
                        autoFocus
                        value={pasteText}
                        onChange={e => setPasteText(e.target.value)}
                        placeholder={`Paste anything, for example:\n\nAAPL\nNVDA 10\nTSLA 5 180.00\nMSFT, AMZN, GOOGL\nAMD 20 shares at $120\n\nJust symbols also works — you fill in shares later.`}
                        style={{
                          flex: 1, minHeight: 260,
                          background: C.surface, border: `1px solid ${C.border}`,
                          color: C.text, fontFamily: MONO, fontSize: 13,
                          padding: 14, borderRadius: 8, resize: "none",
                          lineHeight: 1.7,
                        }}
                      />
                      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                        <button onClick={() => { setPasteModal(null); setPasteText(""); }}
                          style={{ fontFamily: MONO, fontSize: 12, background: "none", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 6, padding: "8px 18px", cursor: "pointer" }}>
                          CANCEL
                        </button>
                        <button
                          disabled={!pasteText.trim()}
                          onClick={async () => {
                            // Parse the pasted text
                            const NON_STOCK = /^(CASH|USD|MMDA\d*|GOLD|INT|DIV|FEE|THE|AND|AT|IN|OF|FOR|MY|I|A)$/i;
                            const lines = pasteText.split(/[\n,;]+/).map(l => l.trim()).filter(Boolean);
                            const parsed = [];
                            for (const line of lines) {
                              // Try to extract: SYMBOL [shares] [cost]
                              const tokens = line.replace(/shares?|@|at|\$/gi, " ").trim().split(/\s+/);
                              const sym = (tokens[0] || "").toUpperCase().replace(/[^A-Z.]/g, "");
                              if (!sym || !/^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(sym) || NON_STOCK.test(sym)) continue;
                              const shares  = tokens[1] && /^\d+\.?\d*$/.test(tokens[1]) ? tokens[1] : "";
                              const avgCost = tokens[2] && /^\d+\.?\d*$/.test(tokens[2]) ? tokens[2] : "";
                              if (!parsed.find(r => r.symbol === sym)) {
                                parsed.push({ symbol: sym, shares, avgCost, price: null });
                              }
                            }
                            if (!parsed.length) return;

                            // Fetch live prices
                            setPasteModal({ rows: parsed, scanning: true });
                            try {
                              const syms = parsed.map(r => r.symbol).join(",");
                              const res = await fetch(`/api/market/quote?symbols=${syms}`);
                              const quotes = await res.json();
                              const bySymbol = Object.fromEntries((Array.isArray(quotes) ? quotes : []).map(q => [q.symbol, q]));
                              const enriched = parsed.map(r => ({
                                ...r,
                                price: bySymbol[r.symbol]?.price || null,
                                name:  bySymbol[r.symbol]?.name  || r.symbol,
                              }));
                              setPasteModal({ rows: enriched, scanning: false });
                            } catch {
                              setPasteModal({ rows: parsed, scanning: false });
                            }
                          }}
                          style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, background: C.accent, border: "none", color: "#fff", borderRadius: 6, padding: "8px 20px", cursor: pasteText.trim() ? "pointer" : "not-allowed", opacity: pasteText.trim() ? 1 : 0.5 }}>
                          SCAN PRICES →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 2 — review + edit */}
                  {pasteModal !== "input" && pasteModal && (
                    <>
                      <div style={{ overflowY: "auto", flex: 1 }}>
                        {pasteModal.scanning ? (
                          <div style={{ padding: 40, textAlign: "center", fontFamily: MONO, fontSize: 13, color: C.textDim }}>
                            ⟳ Scanning live prices…
                          </div>
                        ) : (
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ background: C.surface }}>
                                {["Symbol","Name","Live Price","Shares","Avg Cost",""].map((h, i) => (
                                  <th key={i} style={{ padding: "10px 14px", fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: i >= 2 ? "right" : "left", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {pasteModal.rows.map((row, i) => (
                                <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : C.surface }}>
                                  <td style={{ padding: "9px 14px", fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text, borderBottom: `1px solid ${C.border}` }}>{row.symbol}</td>
                                  <td style={{ padding: "9px 14px", fontFamily: MONO, fontSize: 12, color: C.textDim, borderBottom: `1px solid ${C.border}`, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name || "—"}</td>
                                  <td style={{ padding: "9px 14px", fontFamily: MONO, fontSize: 13, color: row.price ? C.text : C.textDim, textAlign: "right", borderBottom: `1px solid ${C.border}` }}>
                                    {row.price ? `$${row.price.toFixed(2)}` : "—"}
                                  </td>
                                  <td style={{ padding: "9px 14px", textAlign: "right", borderBottom: `1px solid ${C.border}` }}>
                                    <input
                                      value={row.shares}
                                      placeholder="0"
                                      onChange={e => setPasteModal(prev => ({ ...prev, rows: prev.rows.map((r, j) => j === i ? { ...r, shares: e.target.value.replace(/[^\d.]/g, "") } : r) }))}
                                      style={{ width: 80, textAlign: "right", background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "5px 8px", fontFamily: MONO, fontSize: 12, borderRadius: 6 }}
                                    />
                                  </td>
                                  <td style={{ padding: "9px 14px", textAlign: "right", borderBottom: `1px solid ${C.border}` }}>
                                    <input
                                      value={row.avgCost}
                                      placeholder={row.price ? row.price.toFixed(2) : "0"}
                                      onChange={e => setPasteModal(prev => ({ ...prev, rows: prev.rows.map((r, j) => j === i ? { ...r, avgCost: e.target.value.replace(/[^\d.]/g, "") } : r) }))}
                                      style={{ width: 90, textAlign: "right", background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "5px 8px", fontFamily: MONO, fontSize: 12, borderRadius: 6 }}
                                    />
                                  </td>
                                  <td style={{ padding: "9px 14px", textAlign: "center", borderBottom: `1px solid ${C.border}` }}>
                                    <button onClick={() => setPasteModal(prev => ({ ...prev, rows: prev.rows.filter((_, j) => j !== i) }))}
                                      style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 14, fontWeight: 700 }}>✕</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                      {!pasteModal.scanning && pasteModal.rows.length > 0 && (
                        <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, flex: 1 }}>
                            {pasteModal.rows.length} position{pasteModal.rows.length !== 1 ? "s" : ""} · fill Shares + Avg Cost then save
                          </span>
                          <button onClick={() => { setPasteModal("input"); }}
                            style={{ fontFamily: MONO, fontSize: 12, background: "none", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 6, padding: "8px 14px", cursor: "pointer" }}>
                            ← EDIT PASTE
                          </button>
                          <button
                            onClick={() => {
                              const valid = pasteModal.rows.filter(r => r.symbol);
                              setPortfolioHoldings(prev => {
                                const merged = [...prev];
                                for (const r of valid) {
                                  const idx = merged.findIndex(h => h.symbol === r.symbol);
                                  const entry = { symbol: r.symbol, shares: r.shares || "0", avgCost: r.avgCost || (r.price ? r.price.toFixed(2) : "0") };
                                  if (idx >= 0) merged[idx] = entry;
                                  else merged.push(entry);
                                }
                                return merged;
                              });
                              setPasteModal(null); setPasteText("");
                            }}
                            style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, background: C.greenBg, border: `1px solid ${C.green}`, color: C.green, borderRadius: 6, padding: "8px 20px", cursor: "pointer" }}>
                            ✓ SAVE TO PORTFOLIO
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* CSV Import Modal */}
            {csvImportModal && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, width: "100%", maxWidth: 680, maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  {/* Modal header */}
                  <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>📥 IMPORT PORTFOLIO</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 3 }}>
                        Format detected: <span style={{ color: C.accent }}>{csvImportModal.parseInfo.format}</span>
                        {csvImportModal.parseInfo.errors.length > 0 && (
                          <span style={{ color: C.amber, marginLeft: 10 }}>⚠ {csvImportModal.parseInfo.errors[0]}</span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => setCsvImportModal(null)} style={{ background: "none", border: "none", color: C.textDim, fontSize: 20, cursor: "pointer" }}>✕</button>
                  </div>
                  {/* Preview table */}
                  <div style={{ overflowY: "auto", flex: 1 }}>
                    {csvImportModal.rows.length === 0 ? (
                      <div style={{ padding: 30, textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.red }}>
                        No positions could be parsed from this file.
                        <div style={{ color: C.textDim, marginTop: 8, fontSize: 12 }}>
                          Expected: Robinhood Activity CSV, or a file with Symbol / Shares / Avg Cost columns.
                        </div>
                      </div>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: C.surface }}>
                            {["Symbol","Shares","Avg Cost","Action"].map(h => (
                              <th key={h} style={{ padding: "10px 14px", fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: h === "Action" ? "center" : h === "Shares" || h === "Avg Cost" ? "right" : "left", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {csvImportModal.rows.map((row, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : C.surface }}>
                              <td style={{ padding: "9px 14px", fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.text, borderBottom: `1px solid ${C.border}` }}>
                                <input
                                  value={row.symbol}
                                  onChange={e => setCsvImportModal(prev => ({ ...prev, rows: prev.rows.map((r, j) => j === i ? { ...r, symbol: e.target.value.toUpperCase() } : r) }))}
                                  style={{ width: 80, background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "4px 6px", fontFamily: MONO, fontSize: 12 }}
                                />
                              </td>
                              <td style={{ padding: "9px 14px", textAlign: "right", borderBottom: `1px solid ${C.border}` }}>
                                <input
                                  value={row.shares}
                                  onChange={e => setCsvImportModal(prev => ({ ...prev, rows: prev.rows.map((r, j) => j === i ? { ...r, shares: e.target.value } : r) }))}
                                  style={{ width: 80, textAlign: "right", background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "4px 6px", fontFamily: MONO, fontSize: 12 }}
                                />
                              </td>
                              <td style={{ padding: "9px 14px", textAlign: "right", borderBottom: `1px solid ${C.border}` }}>
                                <input
                                  value={row.avgCost}
                                  onChange={e => setCsvImportModal(prev => ({ ...prev, rows: prev.rows.map((r, j) => j === i ? { ...r, avgCost: e.target.value } : r) }))}
                                  style={{ width: 90, textAlign: "right", background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "4px 6px", fontFamily: MONO, fontSize: 12 }}
                                />
                              </td>
                              <td style={{ padding: "9px 14px", textAlign: "center", borderBottom: `1px solid ${C.border}` }}>
                                <button
                                  onClick={() => setCsvImportModal(prev => ({ ...prev, rows: prev.rows.filter((_, j) => j !== i) }))}
                                  style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 14, fontWeight: 700 }}
                                >✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  {/* Footer buttons */}
                  {csvImportModal.rows.length > 0 && (
                    <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, flex: 1 }}>
                        {csvImportModal.rows.length} position{csvImportModal.rows.length !== 1 ? "s" : ""} ready to import
                      </span>
                      <button
                        onClick={() => {
                          const valid = csvImportModal.rows.filter(r => r.symbol && parseFloat(r.shares) > 0);
                          // MERGE: keep existing, update matching, add new
                          setPortfolioHoldings(prev => {
                            const merged = [...prev];
                            for (const r of valid) {
                              const idx = merged.findIndex(h => h.symbol === r.symbol);
                              if (idx >= 0) merged[idx] = { ...merged[idx], shares: r.shares, avgCost: r.avgCost };
                              else merged.push(r);
                            }
                            return merged;
                          });
                          setCsvImportModal(null);
                        }}
                        style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, background: C.accentGlow, border: `1px solid ${C.accent}`, color: C.accent, borderRadius: 6, padding: "8px 18px", cursor: "pointer" }}
                      >
                        MERGE INTO EXISTING
                      </button>
                      <button
                        onClick={() => {
                          const valid = csvImportModal.rows.filter(r => r.symbol && parseFloat(r.shares) > 0);
                          setPortfolioHoldings(valid);
                          setCsvImportModal(null);
                        }}
                        style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, background: C.greenBg, border: `1px solid ${C.green}`, color: C.green, borderRadius: 6, padding: "8px 18px", cursor: "pointer" }}
                      >
                        REPLACE ALL
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              {/* Hidden file input */}
              <input
                ref={csvFileRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = ev => {
                    const text = ev.target.result;
                    const parseInfo = parsePortfolioCSV(text);
                    setCsvImportModal({ rows: parseInfo.rows, parseInfo });
                  };
                  reader.readAsText(file);
                  e.target.value = ""; // allow re-upload same file
                }}
              />
              <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>POSITIONS ({portfolioHoldings.length})</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    onClick={() => { setPasteText(""); setPasteModal("input"); }}
                    style={{ border: `1px solid ${C.green}66`, background: `${C.green}15`, color: C.green, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 700 }}
                    title="Paste tickers or positions and scan live prices"
                  >
                    📋 PASTE & SCAN
                  </button>
                  <button
                    onClick={() => csvFileRef.current?.click()}
                    style={{ border: `1px solid ${C.accent}66`, background: `${C.accent}15`, color: C.accent, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer", fontWeight: 700 }}
                    title="Import from Robinhood CSV or any broker CSV"
                  >
                    📥 IMPORT CSV
                  </button>
                  <a
                    href="/api/portfolio/export.csv"
                    download
                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "6px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer", textDecoration: "none" }}
                  >
                    EXPORT CSV
                  </a>
                  <button
                    onClick={() => setPortfolioHoldings((prev) => [...prev, { symbol: "", shares: "0", avgCost: "0" }])}
                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "6px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                  >
                    + ADD ROW
                  </button>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: C.surface }}>
                      <th style={{ padding: "8px", textAlign: "left", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Ticker</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Shares</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Avg Cost</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Last</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Mkt Value</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>P/L</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>P/L %</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.amber }}>TODAY</th>
                      <th style={{ padding: "8px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolioRows.map((row) => (
                      <tr key={`p-${row.idx}`}>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}` }}>
                          <input
                            value={portfolioHoldings[row.idx]?.symbol || ""}
                            onChange={(e) => setPortfolioHoldings((prev) => prev.map((h, i) => i === row.idx ? { ...h, symbol: e.target.value.toUpperCase() } : h))}
                            style={{ width: 90, background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "6px 8px", fontFamily: MONO, fontSize: 12 }}
                          />
                        </td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right" }}>
                          <input
                            value={portfolioHoldings[row.idx]?.shares || ""}
                            onChange={(e) => setPortfolioHoldings((prev) => prev.map((h, i) => i === row.idx ? { ...h, shares: e.target.value.replace(/[^\d.]/g, "") } : h))}
                            style={{ width: 90, textAlign: "right", background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "6px 8px", fontFamily: MONO, fontSize: 12 }}
                          />
                        </td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right" }}>
                          <input
                            value={portfolioHoldings[row.idx]?.avgCost || ""}
                            onChange={(e) => setPortfolioHoldings((prev) => prev.map((h, i) => i === row.idx ? { ...h, avgCost: e.target.value.replace(/[^\d.]/g, "") } : h))}
                            style={{ width: 100, textAlign: "right", background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "6px 8px", fontFamily: MONO, fontSize: 12 }}
                          />
                        </td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.text }}>${(row.live?.price || 0).toFixed(2)}</td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.text }}>{formatNum(row.marketValue)}</td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: row.pnl >= 0 ? C.green : C.red }}>
                          {row.pnl >= 0 ? "+" : ""}{formatNum(row.pnl)}
                        </td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: row.pnlPct >= 0 ? C.green : C.red }}>
                          {row.pnlPct >= 0 ? "+" : ""}{row.pnlPct.toFixed(2)}%
                        </td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12,
                          color: (row.dayPnl || 0) >= 0 ? C.green : C.red, fontWeight: 700 }}>
                          {row.dayPnl ? `${row.dayPnl >= 0 ? "+" : ""}${formatNum(row.dayPnl)}` : "—"}
                        </td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
                          <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                            {row.symbol && (
                              <button
                                onClick={() => { setTerminalSymbol(row.symbol); try { localStorage.setItem("mterminal_load_sym", row.symbol); } catch {} setActiveTab("mterminal"); }}
                                style={{ border: `1px solid ${C.accent}40`, background: `${C.accent}15`, color: C.accent, borderRadius: 6, padding: "5px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                              >CHART</button>
                            )}
                            {row.symbol && (
                              <button
                                onClick={() => setWatchlistSymbols(prev => watchlistSymbols.includes(row.symbol) ? prev.filter(s => s !== row.symbol) : Array.from(new Set([...prev, row.symbol])))}
                                style={{ border: `1px solid ${watchlistSymbols.includes(row.symbol) ? C.red : C.green}44`, background: watchlistSymbols.includes(row.symbol) ? `${C.red}18` : `${C.green}18`, color: watchlistSymbols.includes(row.symbol) ? C.red : C.green, borderRadius: 6, padding: "5px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                              >{watchlistSymbols.includes(row.symbol) ? "−WL" : "+WL"}</button>
                            )}
                            <button
                              onClick={() => setPortfolioHoldings((prev) => prev.filter((_, i) => i !== row.idx))}
                              style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.red, borderRadius: 6, padding: "5px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                            >RM</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!portfolioRows.length && (
                      <tr>
                        <td colSpan={8} style={{ padding: 14, textAlign: "center", color: C.textDim, fontSize: 12 }}>
                          Add positions to start tracking live P/L.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {portfolioRows.length >= 2 && (() => {
              const CHART_COLORS = ["#4f8cff","#22c55e","#f59e0b","#a78bfa","#f43f5e","#06b6d4","#fb923c","#84cc16","#e879f9","#38bdf8","#fbbf24","#34d399","#f87171","#c084fc","#60a5fa"];
              const total = portfolioRows.reduce((s, r) => s + Math.max(r.marketValue, 0), 0);
              if (!total) return null;
              const cx = 100, cy = 100, outerR = 72, innerR = 44;
              let angle = -Math.PI / 2;
              const slices = portfolioRows.map((row, i) => {
                const pct = Math.max(row.marketValue, 0) / total;
                const startAngle = angle;
                angle += pct * 2 * Math.PI;
                return { row, pct, startAngle, endAngle: angle, color: CHART_COLORS[i % CHART_COLORS.length] };
              });
              function arcPath(start, end) {
                const x1 = cx + outerR * Math.cos(start), y1 = cy + outerR * Math.sin(start);
                const x2 = cx + outerR * Math.cos(end), y2 = cy + outerR * Math.sin(end);
                const large = end - start > Math.PI ? 1 : 0;
                return `M ${cx + innerR * Math.cos(start)} ${cy + innerR * Math.sin(start)} L ${x1} ${y1} A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2} L ${cx + innerR * Math.cos(end)} ${cy + innerR * Math.sin(end)} A ${innerR} ${innerR} 0 ${large} 0 ${cx + innerR * Math.cos(start)} ${cy + innerR * Math.sin(start)} Z`;
              }
              return (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginTop: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 12 }}>ALLOCATION</div>
                  <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
                    <svg width={200} height={200} viewBox="0 0 200 200">
                      {slices.map((s, i) => (
                        <path key={i} d={arcPath(s.startAngle, s.endAngle)} fill={s.color} opacity={0.88} />
                      ))}
                      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={11} fill={C.textDim} fontFamily={MONO}>TOTAL</text>
                      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={13} fontWeight={800} fill={C.text} fontFamily={MONO}>{formatNum(total)}</text>
                    </svg>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "6px 16px", flex: 1, minWidth: 0 }}>
                      {slices.map((s, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                          <span style={{ fontFamily: MONO, fontSize: 12, color: C.text, fontWeight: 700 }}>{s.row.symbol}</span>
                          <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{(s.pct * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
  );
}
