import { useState, useEffect } from "react";
import TradeGpsPerformancePanel from "./TradeGpsPerformancePanel.jsx";

export default function JournalStatsTab({ C, MONO, SANS, jData }) {
        // Real alpha vs. SPY (2026-08-13, professional-investor audit
        // follow-up: "benchmark-relative performance... being up 12% means
        // nothing if SPY was up 15%"). Real SPY closes on each trade's own
        // real open/close dates (src/spy-history.js) — never a guessed
        // benchmark return.
        const [alpha, setAlpha] = useState(null);
        useEffect(() => {
          fetch("/api/journal/alpha").then(r => r.json()).then(d => { if (d.ok) setAlpha(d); }).catch(() => {});
        }, [jData]);
        // Real journal entries never carry a "outcome" or "date" field (that
        // was this component's own invention) — the actual schema, used
        // consistently everywhere else in JournalTab.jsx, is status==="closed"
        // + pnl (win/loss is derived from pnl>0, there's no separate outcome
        // enum) + closedAt for the close timestamp + style for the setup
        // category. Because e.outcome was never real, this whole tab always
        // filtered every real entry out and permanently showed "No completed
        // trades yet" regardless of how many trades were actually logged.
        const trades = (jData || []).filter(e => e.status === "closed" && e.pnl != null);
        const wins   = trades.filter(e => e.pnl > 0);
        const losses = trades.filter(e => e.pnl < 0);
        const winRate = trades.length ? Math.round(wins.length / trades.length * 100) : 0;
        const avgWin  = wins.length ? wins.reduce((a,e) => a + Number(e.pnl||0), 0) / wins.length : 0;
        const avgLoss = losses.length ? Math.abs(losses.reduce((a,e) => a + Number(e.pnl||0), 0) / losses.length) : 0;
        const rrRatio = avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : "—";
        const totalPnl = trades.reduce((a,e) => a + Number(e.pnl||0), 0);
        // By style
        const alphaById = new Map((alpha?.trades || []).map(t => [t.id, t]));
        const bySetup = {};
        trades.forEach(e => {
          const s = e.style || "Other";
          if (!bySetup[s]) bySetup[s] = { wins:0, total:0, alphaSum:0, alphaCount:0 };
          bySetup[s].total++;
          if (e.pnl > 0) bySetup[s].wins++;
          const a = alphaById.get(e.id);
          if (a) { bySetup[s].alphaSum += a.alphaPct; bySetup[s].alphaCount++; }
        });
        // By day of week
        const byDay = {Sun:0,Mon:0,Tue:0,Wed:0,Thu:0,Fri:0,Sat:0};
        const byDayTotal = {Sun:0,Mon:0,Tue:0,Wed:0,Thu:0,Fri:0,Sat:0};
        trades.forEach(e => {
          if (e.closedAt) { const d = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(e.closedAt).getDay()]; byDayTotal[d]++; if(e.pnl>0) byDay[d]++; }
        });
        const Stat = ({label, value, col}) => (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 20px", textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 900, color: col||C.text, lineHeight: 1 }}>{value}</div>
            <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginTop: 6 }}>{label}</div>
          </div>
        );
        return (
          <div style={{ padding: "16px 20px" }}>
            <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.text, marginBottom: 20 }}>📊 TRADE JOURNAL ANALYTICS</div>
            {trades.length === 0 ? (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 40, textAlign: "center" }}>
                <div style={{ fontFamily: MONO, fontSize: 13, color: C.text, marginBottom: 8 }}>No completed trades yet</div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Journal your trades with outcome (WIN/LOSS) and P&L to see analytics here.</div>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))", gap: 10, marginBottom: 24 }}>
                  <Stat label="Win Rate" value={winRate + "%"} col={winRate >= 60 ? C.green : winRate >= 45 ? C.amber : C.red} />
                  <Stat label="Total Trades" value={trades.length} />
                  <Stat label="Avg Win $" value={avgWin > 0 ? `$${avgWin.toFixed(0)}` : "—"} col={C.green} />
                  <Stat label="Avg Loss $" value={avgLoss > 0 ? `$${avgLoss.toFixed(0)}` : "—"} col={C.red} />
                  <Stat label="Avg R:R" value={rrRatio} col={Number(rrRatio) >= 2 ? C.green : Number(rrRatio) >= 1.5 ? C.amber : C.red} />
                  <Stat label="Total P&L" value={`${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(0)}`} col={totalPnl >= 0 ? C.green : C.red} />
                </div>

                {/* Real alpha vs. SPY — collapses raw P&L into "did this
                    actually beat the real market over the same real dates,"
                    the question raw P&L can't answer on its own. */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 10 }}>Real Alpha vs. SPY</div>
                  {!alpha ? (
                    <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Loading real SPY comparison…</div>
                  ) : alpha.tradesWithAlpha === 0 ? (
                    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 18px", fontFamily: SANS, fontSize: 12, color: C.textDim }}>
                      No closed trades yet have real open/close dates to compare against real SPY prices. This fills in as you close real trades.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))", gap: 10 }}>
                      <Stat label="Avg Alpha vs SPY" value={`${alpha.avgAlphaPct >= 0 ? "+" : ""}${alpha.avgAlphaPct}%`} col={alpha.avgAlphaPct >= 0 ? C.green : C.red} />
                      <Stat label="Beat SPY Rate" value={`${alpha.beatSpyRate}%`} col={alpha.beatSpyRate >= 60 ? C.green : alpha.beatSpyRate >= 45 ? C.amber : C.red} />
                      <Stat label="Trades w/ Real Alpha" value={`${alpha.tradesWithAlpha}/${alpha.tradesTotal}`} />
                    </div>
                  )}
                </div>

                {Object.keys(bySetup).length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 10 }}>Win Rate by Style</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {Object.entries(bySetup).sort((a,b) => b[1].total - a[1].total).map(([setup, data]) => {
                        const pct = Math.round(data.wins / data.total * 100);
                        const col = pct >= 60 ? C.green : pct >= 45 ? C.amber : C.red;
                        const avgAlpha = data.alphaCount ? data.alphaSum / data.alphaCount : null;
                        return (
                          <div key={setup} style={{ display: "flex", alignItems: "center", gap: 10,
                            background: C.surface, borderRadius: 6, padding: "8px 12px" }}>
                            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text, width: 140 }}>{setup}</span>
                            <div style={{ flex: 1, height: 8, borderRadius: 4, background: C.border, overflow: "hidden" }}>
                              <div style={{ width: pct + "%", height: "100%", background: col, borderRadius: 4 }} />
                            </div>
                            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: col, width: 50, textAlign: "right" }}>{pct}%</span>
                            {avgAlpha != null && <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: avgAlpha >= 0 ? C.green : C.red, width: 70, textAlign: "right" }}>{avgAlpha >= 0 ? "+" : ""}{avgAlpha.toFixed(1)}% α</span>}
                            <span style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>{data.total} trades</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 10 }}>Win Rate by Day</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {Object.entries(byDayTotal).filter(([,t]) => t > 0).map(([day, total]) => {
                      const pct = Math.round(byDay[day] / total * 100);
                      const col = pct >= 60 ? C.green : pct >= 45 ? C.amber : C.red;
                      return (
                        <div key={day} style={{ flex: 1, background: C.surface, border: `1px solid ${col}44`, borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
                          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: col }}>{pct}%</div>
                          <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 2 }}>{day}</div>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{total}t</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Trade GPS Performance (2026-09-03) — a real, separate data
                source from the manual journal above: every closed real
                Autopilot 2.0 setup outcome, recorded automatically by
                trade-gps-audit-store.js, no manual logging required.
                Always rendered, independent of whether trades.length is 0
                above — the two data sources have no real relationship. */}
            <TradeGpsPerformancePanel C={C} MONO={MONO} SANS={SANS} />
          </div>
        );
}
