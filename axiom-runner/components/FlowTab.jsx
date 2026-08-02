import { Badge, formatNum } from "./ui-atoms.jsx";

export default function FlowTab({
  C, MONO, optionsFlow, flowBias, flowCallNotional, flowPutNotional,
  flowFilters, setFlowFilters, setLoading, fetchAll, apiKey,
  flowBySymbol, setTerminalSymbol, setActiveTab, setWatchlistSymbols, watchlistSymbols, flowRows,
}) {
  return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                OPTIONS FLOW — UNUSUAL ACTIVITY
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Badge color={String(optionsFlow?.source || "").includes("estimated") ? C.amber : C.green}>
                  {String(optionsFlow?.source || "").includes("estimated") ? "ESTIMATED" : "LIVE"}
                </Badge>
                <Badge color={flowBias === "CALL BIAS" ? C.green : flowBias === "PUT BIAS" ? C.red : C.amber}>{flowBias}</Badge>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                  Calls {formatNum(flowCallNotional)} · Puts {formatNum(flowPutNotional)}
                </span>
              </div>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 8 }}>FLOW FILTERS</div>
              <div style={{ display: "grid", gridTemplateColumns: "160px 140px 170px 180px auto", gap: 8, alignItems: "center" }}>
                <select
                  value={flowFilters.flowType}
                  onChange={(e) => setFlowFilters((prev) => ({ ...prev, flowType: e.target.value }))}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }}
                >
                  <option value="all">All Flow</option>
                  <option value="sweep">Sweeps</option>
                  <option value="darkpool">Dark Pool</option>
                  <option value="block">Block</option>
                </select>
                <input
                  value={flowFilters.minNotional}
                  onChange={(e) => setFlowFilters((prev) => ({ ...prev, minNotional: e.target.value.replace(/[^\d]/g, "") }))}
                  placeholder="Min notional"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 12, color: C.textSec }}>
                  <input
                    type="checkbox"
                    checked={Boolean(flowFilters.unusualOnly)}
                    onChange={(e) => setFlowFilters((prev) => ({ ...prev, unusualOnly: e.target.checked }))}
                  />
                  Unusual only
                </label>
                <input
                  value={flowFilters.autoAlertNotional}
                  onChange={(e) => setFlowFilters((prev) => ({ ...prev, autoAlertNotional: e.target.value.replace(/[^\d]/g, "") }))}
                  placeholder="Auto-alert threshold"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }}
                />
                <button
                  onClick={() => { setLoading(true); fetchAll(apiKey).finally(() => setLoading(false)); }}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, padding: "8px 10px", borderRadius: 6, fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                >
                  APPLY
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.9fr", gap: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                  BY SYMBOL
                </div>
                <div>
                  {flowBySymbol.map((row) => (
                    <div key={row.symbol} style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: MONO, fontSize: 13, color: C.text, fontWeight: 700 }}>{row.symbol}</span>
                        <Badge color={Number(row.callPutRatio || 0) >= 1 ? C.green : C.red}>C/P {Number(row.callPutRatio || 0).toFixed(2)}</Badge>
                      </div>
                      <div style={{ fontSize: 12, color: C.textDim, marginTop: 4, marginBottom: 6 }}>Expiry {row.expiration || "—"}</div>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button
                          onClick={() => { setTerminalSymbol(row.symbol); try { localStorage.setItem("mterminal_load_sym", row.symbol); } catch {} setActiveTab("mterminal"); }}
                          style={{ fontFamily: MONO, fontSize: 12, padding: "3px 8px", background: `${C.accent}15`, color: C.accent, border: `1px solid ${C.accent}40`, borderRadius: 5, cursor: "pointer" }}
                        >CHART</button>
                        <button
                          onClick={() => setWatchlistSymbols(prev => watchlistSymbols.includes(row.symbol) ? prev.filter(s => s !== row.symbol) : Array.from(new Set([...prev, row.symbol])))}
                          style={{ fontFamily: MONO, fontSize: 12, padding: "3px 8px", background: watchlistSymbols.includes(row.symbol) ? `${C.red}18` : `${C.green}18`, color: watchlistSymbols.includes(row.symbol) ? C.red : C.green, border: `1px solid ${watchlistSymbols.includes(row.symbol) ? C.red : C.green}44`, borderRadius: 5, cursor: "pointer" }}
                        >{watchlistSymbols.includes(row.symbol) ? "−WL" : "+WL"}</button>
                      </div>
                    </div>
                  ))}
                  {!flowBySymbol.length && <div style={{ padding: 12, color: C.textDim, fontSize: 12 }}>No options flow yet.</div>}
                </div>
              </div>

              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 12, color: C.textDim }}>
                  TOP FLOW TAPE — interpreted
                </div>
                <div>
                  {flowRows.map((row, idx) => (
                    <div key={`${row.symbol}-${row.side}-${row.strike}-${idx}`} style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
                      {/* Smart Options Flow interpretation (options platform
                          redesign, Phase 6): real institutional label + rating
                          instead of raw CALL/strike/volume/OI numbers. Every
                          field here (institutionalLabel/sizeBucket/execution/
                          confidence/institutionalRating/summary) comes from
                          interpretFlowRow (src/options-math.js), applied
                          server-side to this same real row. */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontFamily: MONO, fontSize: 13, color: C.text, fontWeight: 800 }}>{row.symbol}</span>
                          <Badge color={row.side === "CALL" ? C.green : C.red}>{row.side}</Badge>
                          {row.institutionalRating && (
                            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "1px 6px", borderRadius: 4, color: "#fff",
                              background: row.institutionalRating.startsWith("A") ? "#0d9465" : row.institutionalRating === "B+" || row.institutionalRating === "B" ? "#22a06b" : row.institutionalRating === "C" ? "#d6a312" : "#c8282a" }}>
                              {row.institutionalRating}
                            </span>
                          )}
                          {row.estimated && <Badge color={C.amber}>ESTIMATED</Badge>}
                        </div>
                        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: (row.confidence || 0) >= 70 ? C.green : (row.confidence || 0) >= 45 ? C.amber : C.textDim }}>
                          {row.confidence != null ? `${row.confidence}% confidence` : ""}
                        </span>
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.text, marginBottom: 4 }}>{row.institutionalLabel}</div>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 6 }}>
                        Size {row.sizeBucket || "—"} · Premium {formatNum(row.notional || 0)} · Execution {row.execution || "—"} · K {Number(row.strike || 0).toFixed(0)} {row.expiry || "—"} · Vol {row.volume || 0} / OI {row.openInterest || 0} · {row.tradeType || "TAPE"}
                      </div>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button
                          onClick={() => { setTerminalSymbol(row.symbol); try { localStorage.setItem("mterminal_load_sym", row.symbol); } catch {} setActiveTab("mterminal"); }}
                          style={{ border: `1px solid ${C.accent}40`, background: `${C.accent}15`, color: C.accent, borderRadius: 6, padding: "4px 6px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                        >CHART</button>
                        <button
                          onClick={async () => {
                            try {
                              await fetch("/api/journal", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  ticker: row.symbol,
                                  side: row.side === "CALL" ? "BUY" : "SELL",
                                  score: row.confidence ?? (row.unusual ? 85 : 72),
                                  entry: Number(row.underlyingPrice || row.strike || 0),
                                  notes: row.summary || `${row.tradeType || "FLOW"} · K${Number(row.strike || 0).toFixed(0)} ${row.expiry || ""} · ${formatNum(row.notional || 0)} notional${row.unusual ? " · UNUSUAL" : ""}`,
                                  timeframe: "1D",
                                  style: "Options",
                                }),
                              });
                            } catch {}
                          }}
                          style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.accent, borderRadius: 6, padding: "4px 6px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                        >LOG</button>
                      </div>
                    </div>
                  ))}
                  {!flowRows.length && <div style={{ padding: 12, color: C.textDim, fontSize: 12 }}>No flow tape available yet.</div>}
                </div>
              </div>
            </div>
          </div>
  );
}
