import { Badge } from "./ui-atoms.jsx";

export default function BacktestTab({
  C, MONO, backtestSymbol, setBacktestSymbol, backtestTf, setBacktestTf,
  backtestLookback, setBacktestLookback, runBacktest, backtestLoading, backtestResult,
}) {
  return (
          <div>
            <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em", marginBottom: 14 }}>
              BACKTEST LAB - BREAKOUT + RISK MODEL
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 12, display: "grid", gridTemplateColumns: "180px 130px 130px auto", gap: 8, alignItems: "center" }}>
              <input value={backtestSymbol} onChange={(e) => setBacktestSymbol(e.target.value.toUpperCase())} placeholder="Ticker" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }} />
              <select value={backtestTf} onChange={(e) => setBacktestTf(e.target.value)} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }}>
                <option value="1D">1D</option>
                <option value="1H">1H</option>
                <option value="15M">15M</option>
                <option value="5M">5M</option>
              </select>
              <input value={backtestLookback} onChange={(e) => setBacktestLookback(e.target.value.replace(/[^\d]/g, ""))} placeholder="Breakout bars" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }} />
              <button onClick={runBacktest} style={{ justifySelf: "start", border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "8px 12px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>
                {backtestLoading ? "RUNNING..." : "RUN BACKTEST"}
              </button>
            </div>

            {backtestResult?.error && (
              <div style={{ background: C.redBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, color: C.red, marginBottom: 12, fontSize: 12 }}>
                {backtestResult.error}
              </div>
            )}

            {backtestResult && !backtestResult.error && (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                  <button
                    onClick={async () => {
                      try {
                        await fetch("/api/journal", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            ticker: backtestSymbol,
                            side: "BUY",
                            score: Math.min(99, Math.round(50 + backtestResult.winRate / 2)),
                            entry: backtestResult.trades?.[0]?.entry || 0,
                            notes: `Backtest ${backtestTf} ${backtestResult.totalTrades} trades · ${backtestResult.winRate.toFixed(1)}% WR · ${backtestResult.netRet >= 0 ? "+" : ""}${backtestResult.netRet.toFixed(2)}% net · MaxDD ${backtestResult.maxDrawdown.toFixed(2)}%`,
                            timeframe: backtestTf,
                            style: "Backtest",
                          }),
                        });
                      } catch {}
                    }}
                    style={{ border: `1px solid ${C.accent}55`, background: `${C.accent}12`, color: C.accent, borderRadius: 6, padding: "6px 12px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                  >LOG BACKTEST TO JOURNAL</button>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{backtestSymbol} · {backtestTf} · {backtestResult.totalTrades} trades</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Trades</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800 }}>{backtestResult.totalTrades}</div></div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Win Rate</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: backtestResult.winRate >= 50 ? C.green : C.red }}>{backtestResult.winRate.toFixed(1)}%</div></div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Avg Return</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: backtestResult.avgRet >= 0 ? C.green : C.red }}>{backtestResult.avgRet >= 0 ? "+" : ""}{backtestResult.avgRet.toFixed(2)}%</div></div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Net Return</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: backtestResult.netRet >= 0 ? C.green : C.red }}>{backtestResult.netRet >= 0 ? "+" : ""}{backtestResult.netRet.toFixed(2)}%</div></div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Max DD</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.red }}>{backtestResult.maxDrawdown.toFixed(2)}%</div></div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Rule</div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800 }}>Breakout {backtestResult.lookback}</div></div>
                </div>

                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 12, color: C.textDim }}>RECENT TRADES</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: C.surface }}>
                          <th style={{ padding: "8px", textAlign: "left", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Date</th>
                          <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Entry</th>
                          <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Stop</th>
                          <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Target</th>
                          <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Exit</th>
                          <th style={{ padding: "8px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Outcome</th>
                          <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Return %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backtestResult.trades.map((t, i) => (
                          <tr key={`bt-${i}`}>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.textSec }}>{String(t.date || "").replace("T", " ").slice(0, 16)}</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12 }}>${Number(t.entry || 0).toFixed(2)}</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12 }}>${Number(t.stop || 0).toFixed(2)}</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12 }}>${Number(t.target || 0).toFixed(2)}</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12 }}>${Number(t.exit || 0).toFixed(2)}</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
                              <Badge color={t.outcome === "target" ? C.green : t.outcome === "stop" ? C.red : C.amber}>{String(t.outcome || "").toUpperCase()}</Badge>
                            </td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: Number(t.retPct || 0) >= 0 ? C.green : C.red }}>
                              {Number(t.retPct || 0) >= 0 ? "+" : ""}{Number(t.retPct || 0).toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
  );
}
