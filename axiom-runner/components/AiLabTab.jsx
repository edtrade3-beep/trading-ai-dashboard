export default function AiLabTab({
  C, MONO, SANS,
  ailabSection, setAilabSection,
  patternInput, setPatternInput, fetchAIPattern, patternLoading, patternResult, patternTicker,
  scenarioInput, setScenarioInput, fetchMacroScenario, scenarioLoading, scenarioResult,
  earningsCallText, setEarningsCallText, summarizeEarningsCall, earningsCallLoad, earningsCallResult,
  sessionRecapLoad, generateSessionRecap, sessionRecapResult,
  checklistItems, setChecklistItems,
}) {
        const card = (extra = {}) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, ...extra });
        const sections = [
          { id: "pattern",    label: "📊 PATTERN" },
          { id: "scenario",   label: "🌐 SCENARIO" },
          { id: "earnings",   label: "📞 EARNINGS" },
          { id: "recap",      label: "📋 RECAP" },
          { id: "checklist",  label: "✅ CHECKLIST" },
        ];
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ ...card({ padding: "10px 16px" }) }}>
              <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.purple, marginBottom: 10 }}>🤖 AI LABORATORY</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {sections.map(s => (
                  <button key={s.id} onClick={() => setAilabSection(s.id)}
                    style={{ fontFamily: MONO, fontSize: 12, fontWeight: ailabSection === s.id ? 800 : 500, background: ailabSection === s.id ? `${C.purple}22` : C.surface, border: `1px solid ${ailabSection === s.id ? C.purple : C.border}`, color: ailabSection === s.id ? C.purple : C.textDim, borderRadius: 5, padding: "7px 14px", cursor: "pointer" }}>{s.label}</button>
                ))}
              </div>
            </div>

            {ailabSection === "pattern" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ ...card({ padding: 16 }), display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.purple }}>AI CHART PATTERN RECOGNIZER</div>
                  <input value={patternInput} onChange={e => setPatternInput(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === "Enter" && patternInput.trim()) fetchAIPattern(patternInput.trim()); }}
                    placeholder="Ticker…"
                    style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "7px 12px", width: 120, outline: "none" }} />
                  <button onClick={() => patternInput.trim() && fetchAIPattern(patternInput.trim())} disabled={patternLoading}
                    style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, background: patternLoading ? C.surface : C.purple, border: "none", color: patternLoading ? C.textDim : "#fff", borderRadius: 6, padding: "9px 16px", cursor: patternLoading ? "default" : "pointer" }}>
                    {patternLoading ? "ANALYZING…" : "ANALYZE"}
                  </button>
                </div>
                {patternLoading && <div style={{ ...card({ padding: 40, textAlign: "center" }) }}><span style={{ fontFamily: MONO, color: C.textDim }}>AI analyzing price action…</span></div>}
                {patternResult && !patternLoading && (
                  <div style={{ ...card({ padding: 20, borderLeft: `4px solid ${C.purple}` }) }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.purple, marginBottom: 10 }}>PATTERN ANALYSIS — {patternTicker}</div>
                    {patternResult.error ? (
                      <div style={{ fontFamily: MONO, color: C.red }}>{patternResult.error}</div>
                    ) : (
                      <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{patternResult.analysis || patternResult.result}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {ailabSection === "scenario" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ ...card({ padding: 16 }) }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.purple, marginBottom: 10 }}>MACRO SCENARIO PLANNER</div>
                  <textarea value={scenarioInput} onChange={e => setScenarioInput(e.target.value)}
                    placeholder="Describe a macro scenario (e.g. 'Fed cuts rates by 50bps in September amid recession fears')"
                    rows={3}
                    style={{ width: "100%", fontFamily: SANS, fontSize: 13, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "10px 12px", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
                  <button onClick={() => fetchMacroScenario(scenarioInput)} disabled={scenarioLoading || !scenarioInput.trim()}
                    style={{ marginTop: 10, fontFamily: MONO, fontSize: 12, fontWeight: 700, background: scenarioLoading || !scenarioInput.trim() ? C.surface : C.purple, border: "none", color: scenarioLoading ? C.textDim : "#fff", borderRadius: 6, padding: "10px 20px", cursor: "pointer" }}>
                    {scenarioLoading ? "ANALYZING…" : "ANALYZE IMPACT"}
                  </button>
                </div>
                {scenarioLoading && <div style={{ ...card({ padding: 40, textAlign: "center" }) }}><span style={{ fontFamily: MONO, color: C.textDim }}>Running scenario analysis…</span></div>}
                {scenarioResult && !scenarioLoading && (
                  <div style={{ ...card({ padding: 20, borderLeft: `4px solid ${C.purple}` }) }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.purple, marginBottom: 10 }}>SCENARIO IMPACT</div>
                    {scenarioResult.error ? (
                      <div style={{ fontFamily: MONO, color: C.red }}>{scenarioResult.error}</div>
                    ) : (
                      <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{scenarioResult.analysis || scenarioResult.result}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {ailabSection === "earnings" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ ...card({ padding: 16 }) }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.purple, marginBottom: 10 }}>EARNINGS CALL SUMMARIZER</div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 8 }}>Paste earnings call transcript below (up to 12,000 characters)</div>
                  <textarea value={earningsCallText} onChange={e => setEarningsCallText(e.target.value)}
                    placeholder="Paste earnings call transcript here…"
                    rows={8}
                    style={{ width: "100%", fontFamily: SANS, fontSize: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "10px 12px", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{earningsCallText.length} / 12,000 chars</span>
                    <button onClick={summarizeEarningsCall} disabled={earningsCallLoad || !earningsCallText.trim()}
                      style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, background: earningsCallLoad || !earningsCallText.trim() ? C.surface : C.purple, border: "none", color: earningsCallLoad ? C.textDim : "#fff", borderRadius: 6, padding: "10px 20px", cursor: "pointer" }}>
                      {earningsCallLoad ? "SUMMARIZING…" : "SUMMARIZE"}
                    </button>
                  </div>
                </div>
                {earningsCallLoad && <div style={{ ...card({ padding: 40, textAlign: "center" }) }}><span style={{ fontFamily: MONO, color: C.textDim }}>AI reading the call…</span></div>}
                {earningsCallResult && !earningsCallLoad && (
                  <div style={{ ...card({ padding: 20, borderLeft: `4px solid ${C.purple}` }) }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.purple, marginBottom: 10 }}>SUMMARY</div>
                    {earningsCallResult.error ? (
                      <div style={{ fontFamily: MONO, color: C.red }}>{earningsCallResult.error}</div>
                    ) : (
                      <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{earningsCallResult.summary || earningsCallResult.result}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {ailabSection === "recap" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ ...card({ padding: 20 }), display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.purple }}>SESSION RECAP GENERATOR</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 4 }}>AI reviews today's closed trades and market performance</div>
                  </div>
                  <button onClick={generateSessionRecap} disabled={sessionRecapLoad}
                    style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, background: sessionRecapLoad ? C.surface : C.purple, border: "none", color: sessionRecapLoad ? C.textDim : "#fff", borderRadius: 6, padding: "10px 20px", cursor: "pointer" }}>
                    {sessionRecapLoad ? "GENERATING…" : "GENERATE RECAP"}
                  </button>
                </div>
                {sessionRecapLoad && <div style={{ ...card({ padding: 40, textAlign: "center" }) }}><span style={{ fontFamily: MONO, color: C.textDim }}>Writing your session recap…</span></div>}
                {sessionRecapResult && !sessionRecapLoad && (
                  <div style={{ ...card({ padding: 20, borderLeft: `4px solid ${C.purple}` }) }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.purple, marginBottom: 10 }}>TODAY'S SESSION RECAP</div>
                    {sessionRecapResult.error ? (
                      <div style={{ fontFamily: MONO, color: C.red }}>{sessionRecapResult.error}</div>
                    ) : (
                      <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{sessionRecapResult.recap || sessionRecapResult.result}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {ailabSection === "checklist" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ ...card({ padding: 16 }), display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.purple }}>PRE-TRADE CHECKLIST</div>
                  <div>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: checklistItems.filter(c => c.done).length === checklistItems.length ? C.green : C.amber }}>
                      {checklistItems.filter(c => c.done).length}/{checklistItems.length}
                    </span>
                    <button onClick={() => setChecklistItems(prev => prev.map(c => ({ ...c, done: false })))}
                      style={{ marginLeft: 12, fontFamily: MONO, fontSize: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>RESET</button>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {checklistItems.map(item => (
                    <div key={item.id} onClick={() => setChecklistItems(prev => prev.map(c => c.id === item.id ? { ...c, done: !c.done } : c))}
                      style={{ ...card({ padding: "12px 16px" }), display: "flex", alignItems: "center", gap: 12, cursor: "pointer", borderLeft: `4px solid ${item.done ? C.green : C.border}`, opacity: item.done ? 0.85 : 1 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${item.done ? C.green : C.border}`, background: item.done ? C.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {item.done && <span style={{ color: "#fff", fontSize: 12, lineHeight: 1 }}>✓</span>}
                      </div>
                      <span style={{ fontFamily: SANS, fontSize: 13, color: item.done ? C.textDim : C.text, textDecoration: item.done ? "line-through" : "none" }}>{item.label}</span>
                    </div>
                  ))}
                </div>
                {checklistItems.filter(c => c.done).length === checklistItems.length && (
                  <div style={{ ...card({ padding: 16, borderLeft: `4px solid ${C.green}`, textAlign: "center" }) }}>
                    <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.green }}>✅ ALL CHECKS PASSED — CLEAR TO TRADE</div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
}
