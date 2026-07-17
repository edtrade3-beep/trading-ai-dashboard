import { Badge } from "./ui-atoms.jsx";

export default function WorkflowTab({
  C, MONO, SANS, DEFAULT_WORKFLOW,
  scannerFilters, setScannerFilters, marketUniverseLoading, marketUniverseData, loadMarketUniverse,
  runWorkflowAuto, setWorkflowState, setWorkflowAutoPlan, dailyGamePlan, setDailyGamePlan, workflowAutoPlan,
  setTerminalSymbol, setActiveTab, applyWorkflowPrimary,
  marketSession, sessionMovers, newsIntel, macroSignalFlags,
  marketMovers, marketMoversLoading, fetchMarketMovers, prePostMovers, earningsSurpriseTracker,
  workflowProgress, workflowState, updateWorkflowCheck, updateWorkflowNotes,
}) {
  return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                TRADER WORKFLOW - DAILY EXECUTION ENGINE
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  value={scannerFilters.scope}
                  onChange={(e) => setScannerFilters((s) => ({ ...s, scope: e.target.value }))}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "6px 8px", fontFamily: MONO, fontSize: 12 }}
                >
                  <option value="watchlist">WATCHLIST MODE</option>
                  <option value="market">MARKET-WIDE MODE</option>
                </select>
                {scannerFilters.scope === "market" && (
                  <button
                    onClick={loadMarketUniverse}
                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                  >
                    {marketUniverseLoading ? "LOADING..." : `UNIVERSE ${marketUniverseData.length}`}
                  </button>
                )}
                <button
                  onClick={runWorkflowAuto}
                  style={{ border: `1px solid ${C.border}`, background: C.accent, color: "#fff", borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                >
                  DO IT FOR ME
                </button>
                <button
                  onClick={() => { setWorkflowState(DEFAULT_WORKFLOW); setWorkflowAutoPlan(null); }}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                >
                  RESET DAY
                </button>
              </div>
            </div>
            {/* Daily Game Plan */}
            <div style={{ background: C.card, border: `1px solid ${dailyGamePlan ? C.accent + "55" : C.border}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em" }}>TODAY'S GAME PLAN</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{new Date().toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</span>
                  {dailyGamePlan && (
                    <button
                      onClick={() => navigator.clipboard.writeText(dailyGamePlan).catch(() => {})}
                      style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 5, padding: "1px 6px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                    >COPY</button>
                  )}
                  {dailyGamePlan && (
                    <button
                      onClick={() => setDailyGamePlan("")}
                      style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.red, borderRadius: 5, padding: "1px 6px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                    >CLEAR</button>
                  )}
                </div>
              </div>
              <textarea
                value={dailyGamePlan}
                onChange={e => setDailyGamePlan(e.target.value)}
                placeholder="Write your plan for today before the market opens:&#10;— What is the market regime? (bullish / bearish / choppy)&#10;— Key names and why&#10;— Max trades today: ___  Max loss: ___&#10;— Rules for today:"
                rows={dailyGamePlan ? Math.min(Math.max(dailyGamePlan.split("\n").length + 1, 3), 8) : 5}
                style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", fontFamily: SANS, fontSize: 13, color: C.text, resize: "vertical", outline: "none", lineHeight: 1.5 }}
              />
            </div>

            {workflowAutoPlan && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Auto Plan</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>Created {workflowAutoPlan.createdAt}</div>
                  </div>
                  <div><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Scope</div><div style={{ fontFamily: MONO, fontSize: 12 }}>{String(workflowAutoPlan.scope || "watchlist").toUpperCase()}</div></div>
                  <div><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Primary</div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800 }}>{workflowAutoPlan.symbol}</div></div>
                  <div><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Inst. Score</div><div style={{ fontFamily: MONO, fontSize: 12, color: C.accent }}>{Number(workflowAutoPlan.score || 0).toFixed(1)}</div></div>
                  <div><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Entry</div><div style={{ fontFamily: MONO, fontSize: 12 }}>${Number(workflowAutoPlan.entry || 0).toFixed(2)}</div></div>
                  <div><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Stop</div><div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>${Number(workflowAutoPlan.stop || 0).toFixed(2)}</div></div>
                  <div><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Target</div><div style={{ fontFamily: MONO, fontSize: 12, color: C.green }}>${Number(workflowAutoPlan.target || 0).toFixed(2)}</div></div>
                </div>
                <div style={{ marginBottom: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>WHY THIS NAME</div>
                    <button
                      onClick={async () => {
                        if (!workflowAutoPlan?.symbol) return;
                        try {
                          await fetch("/api/journal", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              ticker: workflowAutoPlan.symbol,
                              side: "BUY",
                              score: Math.round(Number(workflowAutoPlan.score || 72)),
                              entry: Number(workflowAutoPlan.entry || 0),
                              stopLoss: Number(workflowAutoPlan.stop || 0),
                              target: Number(workflowAutoPlan.target || 0),
                              notes: workflowAutoPlan.why || "Workflow auto-plan",
                              timeframe: "1D",
                              style: "Workflow",
                            }),
                          });
                        } catch {}
                      }}
                      style={{ border: `1px solid ${C.green}55`, background: `${C.green}12`, color: C.green, borderRadius: 6, padding: "4px 8px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                    >LOG PLAN</button>
                  </div>
                  <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.45 }}>{workflowAutoPlan.why || "No rationale available."}</div>
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 6 }}>ALTERNATIVE CANDIDATES</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(180px, 1fr))", gap: 8 }}>
                    {(workflowAutoPlan.candidates || []).slice(0, 3).map((cand) => (
                      <div key={`cand-${cand.symbol}`} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, background: C.surface }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>{cand.symbol}</span>
                          <span style={{ fontFamily: MONO, fontSize: 12, color: C.accent }}>{Number(cand.score || 0).toFixed(1)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: C.textDim, minHeight: 32 }}>{cand.why}</div>
                        <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
                          <button
                            onClick={() => { setTerminalSymbol(cand.symbol); try { localStorage.setItem("mterminal_load_sym", cand.symbol); } catch {} setActiveTab("mterminal"); }}
                            style={{ border: `1px solid ${C.accent}40`, background: `${C.accent}15`, color: C.accent, borderRadius: 6, padding: "4px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                          >CHART</button>
                          {cand.symbol !== workflowAutoPlan.symbol && (
                            <button
                              onClick={() => applyWorkflowPrimary(cand)}
                              style={{ border: `1px solid ${C.border}`, background: C.card, color: C.text, borderRadius: 6, padding: "4px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                            >SET PRIMARY</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 4 }}>SESSION</div>
                <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>{marketSession}</div>
                <div style={{ fontSize: 12, color: C.textSec, marginTop: 6 }}>
                  Gainers: {sessionMovers.gainers.slice(0, 3).map((m) => m.symbol).join(", ") || "N/A"}
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 4 }}>BUY / UPGRADE</div>
                {(newsIntel.upgrades.slice(0, 2)).map((n, i) => (
                  <div key={`up-${i}`} style={{ fontSize: 12, color: C.green, marginBottom: 4 }}>{n.ticker}: {n.title.slice(0, 56)}</div>
                ))}
                {!newsIntel.upgrades.length && <div style={{ fontSize: 12, color: C.textDim }}>No bullish upgrade headlines.</div>}
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 4 }}>SELL / DOWNGRADE</div>
                {(newsIntel.downgrades.slice(0, 2)).map((n, i) => (
                  <div key={`dn-${i}`} style={{ fontSize: 12, color: C.red, marginBottom: 4 }}>{n.ticker}: {n.title.slice(0, 56)}</div>
                ))}
                {!newsIntel.downgrades.length && <div style={{ fontSize: 12, color: C.textDim }}>No bearish downgrade headlines.</div>}
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 4 }}>MACRO FLAGS</div>
                {(macroSignalFlags.red.slice(0, 2)).map((x, i) => <div key={`mr-${i}`} style={{ fontSize: 12, color: C.red, marginBottom: 3 }}>RED: {x}</div>)}
                {(macroSignalFlags.green.slice(0, 2)).map((x, i) => <div key={`mg-${i}`} style={{ fontSize: 12, color: C.green, marginBottom: 3 }}>GREEN: {x}</div>)}
                {!macroSignalFlags.red.length && !macroSignalFlags.green.length && <div style={{ fontSize: 12, color: C.textDim }}>No major macro flags.</div>}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(280px, 1fr))", gap: 12, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em" }}>
                    WATCHLIST MOVERS
                  </div>
                  <button
                    onClick={fetchMarketMovers}
                    disabled={marketMoversLoading}
                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                  >
                    {marketMoversLoading ? "…" : "REFRESH"}
                  </button>
                </div>
                {!marketMovers && !marketMoversLoading && <div style={{ fontSize: 12, color: C.textDim }}>No data yet — click REFRESH.</div>}
                {marketMoversLoading && <div style={{ fontSize: 12, color: C.textDim }}>Fetching movers…</div>}
                {marketMovers && (
                  <>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.green, fontWeight: 700, marginBottom: 4 }}>TOP GAINERS</div>
                    {(marketMovers.gainers || []).map((q) => (
                      <div key={`mv-g-${q.symbol}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}`, padding: "3px 0" }}>
                        <button onClick={() => { setTerminalSymbol(q.symbol); try { localStorage.setItem("mterminal_load_sym", q.symbol); } catch {} setActiveTab("mterminal"); }} style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>{q.symbol}</button>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: C.green, fontWeight: 700 }}>+{Number(q.changesPercentage || 0).toFixed(2)}%</span>
                      </div>
                    ))}
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.red, fontWeight: 700, marginTop: 8, marginBottom: 4 }}>TOP LOSERS</div>
                    {(marketMovers.losers || []).map((q) => (
                      <div key={`mv-l-${q.symbol}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}`, padding: "3px 0" }}>
                        <button onClick={() => { setTerminalSymbol(q.symbol); try { localStorage.setItem("mterminal_load_sym", q.symbol); } catch {} setActiveTab("mterminal"); }} style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>{q.symbol}</button>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: C.red, fontWeight: 700 }}>{Number(q.changesPercentage || 0).toFixed(2)}%</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>
                  PRE / POST MARKET MOVERS
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, fontWeight: 700 }}>PREMARKET</div>
                  {(prePostMovers.pre || []).map((q) => (
                    <div key={`wf-pre-${q.symbol}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}`, padding: "3px 0" }}>
                      <button onClick={() => { setTerminalSymbol(q.symbol); try { localStorage.setItem("mterminal_load_sym", q.symbol); } catch {} setActiveTab("mterminal"); }} style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>{q.symbol}</button>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: q.pre >= 0 ? C.green : C.red, fontWeight: 700 }}>
                        {q.pre >= 0 ? "+" : ""}{q.pre.toFixed(2)}%
                      </span>
                    </div>
                  ))}
                  {!prePostMovers.pre?.length && <div style={{ fontSize: 12, color: C.textDim }}>No premarket movers yet.</div>}
                </div>
                <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.purple, fontWeight: 700 }}>AFTERHOURS</div>
                  {(prePostMovers.post || []).map((q) => (
                    <div key={`wf-post-${q.symbol}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}`, padding: "3px 0" }}>
                      <button onClick={() => { setTerminalSymbol(q.symbol); try { localStorage.setItem("mterminal_load_sym", q.symbol); } catch {} setActiveTab("mterminal"); }} style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>{q.symbol}</button>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: q.post >= 0 ? C.green : C.red, fontWeight: 700 }}>
                        {q.post >= 0 ? "+" : ""}{q.post.toFixed(2)}%
                      </span>
                    </div>
                  ))}
                  {!prePostMovers.post?.length && <div style={{ fontSize: 12, color: C.textDim }}>No afterhours movers yet.</div>}
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>
                  EARNINGS SURPRISE TRACKER
                </div>
                {(earningsSurpriseTracker || []).map((r) => {
                  const tone = r.status === "BEAT" ? C.green : r.status === "MISS" ? C.red : C.amber;
                  const bg = r.status === "BEAT" ? C.greenBg : r.status === "MISS" ? C.redBg : C.amberBg;
                  return (
                    <div key={`wf-est-${r.symbol}`} style={{ borderBottom: `1px solid ${C.border}`, padding: "6px 0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                        <button onClick={() => { setTerminalSymbol(r.symbol); try { localStorage.setItem("mterminal_load_sym", r.symbol); } catch {} setActiveTab("mterminal"); }} style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>{r.symbol}</button>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: tone, background: bg, border: `1px solid ${tone}44`, padding: "1px 6px", borderRadius: 999, fontWeight: 800 }}>{r.status}</span>
                      </div>
                      <div style={{ fontSize: 12, color: C.textDim }}>
                        Beat {r.beats} · Miss {r.misses}
                      </div>
                    </div>
                  );
                })}
                {!earningsSurpriseTracker.length && (
                  <div style={{ fontSize: 12, color: C.textDim }}>
                    No earnings surprise headlines detected yet.
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(260px, 1fr))", gap: 12 }}>
              {[
                { key: "premarket", title: "PREMARKET PLAN", color: C.accent, subtitle: "Build bias before open" },
                { key: "live", title: "LIVE EXECUTION", color: C.green, subtitle: "Only validated setups" },
                { key: "postmarket", title: "POSTMARKET REVIEW", color: C.purple, subtitle: "Close loop and improve" },
              ].map((section) => (
                <div key={section.key} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: section.color }}>{section.title}</div>
                      <div style={{ fontSize: 12, color: C.textDim }}>{section.subtitle}</div>
                    </div>
                    <Badge color={workflowProgress[section.key].pct >= 100 ? C.green : C.amber}>
                      {workflowProgress[section.key].done}/{workflowProgress[section.key].total}
                    </Badge>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ height: 6, borderRadius: 6, background: C.border, overflow: "hidden" }}>
                      <div style={{ width: `${workflowProgress[section.key].pct}%`, height: "100%", background: section.color }} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
                    {(workflowState[section.key]?.checklist || []).map((item) => (
                      <label key={item.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: C.textSec }}>
                        <input
                          type="checkbox"
                          checked={Boolean(item.done)}
                          onChange={(e) => updateWorkflowCheck(section.key, item.id, e.target.checked)}
                          style={{ marginTop: 2 }}
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                  <textarea
                    value={workflowState[section.key]?.notes || ""}
                    onChange={(e) => updateWorkflowNotes(section.key, e.target.value)}
                    placeholder={`${section.title} notes...`}
                    style={{ width: "100%", minHeight: 90, resize: "vertical", background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: 8, fontFamily: SANS, fontSize: 12 }}
                  />
                </div>
              ))}
            </div>
          </div>
  );
}
