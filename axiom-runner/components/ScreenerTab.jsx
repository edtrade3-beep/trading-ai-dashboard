export default function ScreenerTab({
  C, MONO, scanResults, screenerRules, setScreenerRules, screenerResults, setScreenerResults,
  screenerRan, setScreenerRan, themeMode, setActiveTab, setTvOsSymbol, setTvOsInput,
}) {
        const FIELDS = [
          { id: "score",    label: "AI Score",    get: r => r.score },
          { id: "rsi",      label: "RSI",         get: r => r.rsiVal },
          { id: "change",   label: "Change %",    get: r => r.quote?.changesPercentage },
          { id: "price",    label: "Price",       get: r => r.quote?.price },
          { id: "rvol",     label: "Rel Volume",  get: r => r.quote?.volume && r.quote?.avgVolume ? r.quote.volume / r.quote.avgVolume : null },
          { id: "mktcap",   label: "Mkt Cap ($B)",get: r => r.quote?.marketCap ? r.quote.marketCap / 1e9 : null },
        ];
        const OPS = [">=", "<=", ">", "<", "="];

        function runScreener() {
          const rows = (scanResults || []).filter(row => {
            return screenerRules.every(rule => {
              const field = FIELDS.find(f => f.id === rule.field);
              if (!field) return true;
              const val = field.get(row);
              if (val == null || !Number.isFinite(Number(val))) return false;
              const v = Number(val), thresh = Number(rule.val);
              if (!Number.isFinite(thresh)) return true;
              switch (rule.op) {
                case ">=": return v >= thresh;
                case "<=": return v <= thresh;
                case ">":  return v > thresh;
                case "<":  return v < thresh;
                case "=":  return Math.abs(v - thresh) < 0.01;
                default:   return true;
              }
            });
          });
          setScreenerResults(rows);
          setScreenerRan(true);
        }

        function addRule() {
          setScreenerRules(prev => [...prev, { field: "score", op: ">=", val: "60" }]);
        }
        function removeRule(i) {
          setScreenerRules(prev => prev.filter((_, idx) => idx !== i));
        }
        function updateRule(i, key, val) {
          setScreenerRules(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
        }

        const sel = { fontFamily: MONO, fontSize: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 5, padding: "5px 8px", outline: "none" };
        const card = (extra = {}) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, ...extra });

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Header */}
            <div style={{ ...card({ padding: "14px 18px" }) }}>
              <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.text, marginBottom: 6 }}>🔍 CUSTOM SCREENER</div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Build filter rules and screen against Smart Scanner results. Run Smart Scan first to populate data.</div>
            </div>

            {/* Rule builder */}
            <div style={card({ padding: 16 })}>
              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.textDim, marginBottom: 10, letterSpacing: "0.06em" }}>FILTER RULES</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {screenerRules.map((rule, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <select value={rule.field} onChange={e => updateRule(i, "field", e.target.value)} style={sel}>
                      {FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                    <select value={rule.op} onChange={e => updateRule(i, "op", e.target.value)} style={sel}>
                      {OPS.map(op => <option key={op} value={op}>{op}</option>)}
                    </select>
                    <input type="number" value={rule.val} onChange={e => updateRule(i, "val", e.target.value)}
                      style={{ ...sel, width: 80 }} />
                    <button onClick={() => removeRule(i)}
                      style={{ fontFamily: MONO, fontSize: 12, background: C.redBg, border: `1px solid ${C.red}44`,
                        color: C.red, borderRadius: 5, padding: "5px 10px", cursor: "pointer" }}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button onClick={addRule}
                  style={{ fontFamily: MONO, fontSize: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 6, padding: "8px 14px", cursor: "pointer" }}>
                  + ADD RULE
                </button>
                <button onClick={runScreener} disabled={!scanResults.length}
                  style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                    background: scanResults.length ? C.accent : C.surface,
                    border: "none", color: scanResults.length ? "#fff" : C.textDim,
                    borderRadius: 6, padding: "8px 20px", cursor: scanResults.length ? "pointer" : "default" }}>
                  🔍 RUN SCREEN ({scanResults.length} rows)
                </button>
              </div>
            </div>

            {/* Results */}
            {screenerRan && (
              <div style={card({ overflow: "hidden" })}>
                <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 12, fontWeight: 700, color: screenerResults.length ? C.green : C.textDim }}>
                  {screenerResults.length ? `✅ ${screenerResults.length} MATCHES` : "❌ NO MATCHES — Adjust your rules"}
                </div>
                {screenerResults.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: C.surface }}>
                          {["TICKER","SCORE","RSI","CHANGE%","PRICE","REL VOL","ACTION"].map(h => (
                            <th key={h} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.textDim, padding: "8px 12px", textAlign: h === "TICKER" ? "left" : "right", letterSpacing: "0.04em" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {screenerResults.map((row, i) => {
                          const chg = row.quote?.changesPercentage || 0;
                          const rvol = row.quote?.volume && row.quote?.avgVolume ? row.quote.volume / row.quote.avgVolume : null;
                          return (
                            <tr key={row.ticker} style={{ borderTop: `1px solid ${C.border}33`, background: i % 2 === 0 ? "transparent" : (themeMode === "dark" ? "#ffffff04" : "#00000003") }}>
                              <td style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, padding: "8px 12px" }}>{row.ticker}</td>
                              <td style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: row.score >= 70 ? C.green : row.score >= 50 ? C.amber : C.red, textAlign: "right", padding: "8px 12px" }}>{row.score}</td>
                              <td style={{ fontFamily: MONO, fontSize: 12, color: row.rsiVal < 30 ? C.green : row.rsiVal > 70 ? C.red : C.text, textAlign: "right", padding: "8px 12px" }}>{row.rsiVal != null ? row.rsiVal.toFixed(0) : "—"}</td>
                              <td style={{ fontFamily: MONO, fontSize: 12, color: chg >= 0 ? C.green : C.red, textAlign: "right", padding: "8px 12px" }}>{chg >= 0 ? "+" : ""}{Number(chg).toFixed(2)}%</td>
                              <td style={{ fontFamily: MONO, fontSize: 12, color: C.text, textAlign: "right", padding: "8px 12px" }}>${Number(row.quote?.price || 0).toFixed(2)}</td>
                              <td style={{ fontFamily: MONO, fontSize: 12, color: rvol && rvol >= 1.5 ? C.green : C.textDim, textAlign: "right", padding: "8px 12px" }}>{rvol ? rvol.toFixed(2) + "x" : "—"}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right" }}>
                                <button onClick={() => { setActiveTab("openstock"); setTvOsSymbol(row.ticker); setTvOsInput(row.ticker); }}
                                  style={{ fontFamily: MONO, fontSize: 12, background: `${C.accent}22`, border: `1px solid ${C.accent}44`, color: C.accent, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                                  CHART
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            {!scanResults.length && (
              <div style={{ ...card({ padding: 24 }), textAlign: "center" }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>No scan data yet — go to <strong style={{ color: C.accent }}>SCANNER → SMART SCAN</strong> and run a scan first</div>
              </div>
            )}
          </div>
        );
}
