import { useState, useEffect } from "react";
import JournalPatternsPanel from "./JournalPatternsPanel.jsx";

// ── Coach's Notes — ai-coach.js's scheduled functions (morning game plan,
// after-close trade coach, weekly review) have always run on a cron and
// generated real content; it just only ever reached Telegram. This is the
// first time it's visible in the app itself.
const COACH_LABELS = {
  gameplan: "🌅 MORNING GAME PLAN", tradeCoach: "🎯 TRADE COACH",
  weekly: "📅 WEEKLY REVIEW", monthly: "🔬 MONTHLY DEEP REVIEW", apex: "🧠 MORNING BRIEF",
};
function CoachNotesPanel({ C, MONO, SANS }) {
  const [log, setLog] = useState(null);
  useEffect(() => {
    fetch("/api/ai-hub/coach-log").then(r => r.json()).then(d => { if (d && d.ok) setLog(d.log); }).catch(() => {});
  }, []);
  const entries = Object.entries(log || {})
    .filter(([type]) => type !== "apex" && COACH_LABELS[type])
    .sort((a, b) => (b[1]?.savedAt || 0) - (a[1]?.savedAt || 0));
  if (!entries.length) return null;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 10 }}>COACH'S NOTES</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {entries.slice(0, 4).map(([type, entry]) => (
          <div key={type} style={{ borderLeft: `3px solid ${C.purple}`, paddingLeft: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.purple }}>{COACH_LABELS[type]}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{entry.savedAt ? new Date(entry.savedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</span>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{entry.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function JournalTab({
  C, MONO, SANS,
  journalCloseId, journalClosePrice, journalDateRange, journalEditEntry, journalEditId,
  journalEditNotes, journalEditSize, journalEditSL, journalEditTarget, journalEntries,
  journalFilter, journalLoading, journalRevError, journalReview, journalRevLoad, journalSort,
  journalStats, journalStyleFilter, journalTickerSearch, liveJournalPnl,
  setJournalCloseId, setJournalClosePrice, setJournalDateRange, setJournalEditEntry,
  setJournalEditId, setJournalEditNotes, setJournalEditSize, setJournalEditSL, setJournalEditTarget,
  setJournalFilter, setJournalReview, setJournalSort, setJournalStyleFilter, setJournalTickerSearch,
  setActiveTab, setTerminalSymbol,
  fetchJournalReview, loadJournalTab,
}) {
  return (
          <div>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                TRADE JOURNAL — PERFORMANCE TRACKER
              </div>
              <button onClick={fetchJournalReview} disabled={journalRevLoad || journalEntries.filter(e => e.closedAt).length < 3}
                style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, fontWeight: 700,
                  background: journalRevLoad ? C.surface : `${C.purple}22`,
                  border: `1px solid ${C.purple}66`, color: journalRevLoad ? C.textDim : C.purple,
                  borderRadius: 6, padding: "7px 14px", cursor: journalRevLoad ? "default" : "pointer" }}>
                {journalRevLoad ? "🤖 ANALYZING…" : "🤖 AI COACHING REVIEW"}
              </button>
            </div>

            {/* AI Journal Review panel */}
            {(journalReview || journalRevError) && (
              <div style={{ background: C.card, border: `1px solid ${C.purple}44`, borderLeft: `3px solid ${C.purple}`,
                borderRadius: 10, padding: 16, marginBottom: 14 }}>
                {journalRevError ? (
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>{journalRevError}</div>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.purple }}>🤖 AI COACHING REVIEW</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{journalReview?.at ? new Date(journalReview.at).toLocaleString() : ""}</span>
                        <button onClick={() => setJournalReview(null)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 12 }}>✕</button>
                      </div>
                    </div>
                    <pre style={{ fontFamily: SANS, fontSize: 12, color: C.text, lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0 }}>{journalReview?.text}</pre>
                  </>
                )}
              </div>
            )}

            <CoachNotesPanel C={C} MONO={MONO} SANS={SANS} />
            <JournalPatternsPanel C={C} MONO={MONO} SANS={SANS} />

            {/* Today / Week P&L strip */}
            {journalEntries.length > 0 && (() => {
              const todayStr = new Date().toISOString().slice(0, 10);
              const weekStart = (() => {
                const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10);
              })();
              const closed = journalEntries.filter(e => e.status === "closed" && e.pnl != null && e.closedAt);
              const todayTrades = closed.filter(e => (e.closedAt || "").slice(0, 10) === todayStr);
              const weekTrades  = closed.filter(e => (e.closedAt || "").slice(0, 10) >= weekStart);
              const todayPnl = todayTrades.reduce((s, e) => s + e.pnl, 0);
              const weekPnl  = weekTrades.reduce((s, e) => s + e.pnl, 0);
              const todayWins = todayTrades.filter(e => e.pnl > 0).length;
              const curStreak = journalStats?.currentStreak || 0;
              const streakLabel = curStreak > 0 ? `🔥 ${curStreak}W` : curStreak < 0 ? `❄️ ${Math.abs(curStreak)}L` : "—";
              const streakColor = curStreak > 0 ? C.green : curStreak < 0 ? C.red : C.textDim;
              return (
                <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  {[
                    { label: "TODAY P/L", value: todayTrades.length ? `${todayPnl >= 0 ? "+" : ""}$${Math.round(todayPnl)}` : "—", color: todayTrades.length ? (todayPnl >= 0 ? C.green : C.red) : C.textDim, sub: todayTrades.length ? `${todayTrades.length} trade${todayTrades.length !== 1 ? "s" : ""} · ${todayWins}W/${todayTrades.length - todayWins}L` : "no trades today" },
                    { label: "THIS WEEK", value: weekTrades.length ? `${weekPnl >= 0 ? "+" : ""}$${Math.round(weekPnl)}` : "—", color: weekTrades.length ? (weekPnl >= 0 ? C.green : C.red) : C.textDim, sub: weekTrades.length ? `${weekTrades.length} trades` : "no trades this week" },
                    { label: "STREAK", value: streakLabel, color: streakColor, sub: `best ${journalStats?.longestWinStreak || 0}W` },
                    { label: "WIN RATE", value: journalStats?.closed ? `${journalStats.winRate ?? 0}%` : "—", color: (journalStats?.winRate || 0) >= 50 ? C.green : C.amber, sub: journalStats?.closed ? `${journalStats.wins}W / ${journalStats.losses}L` : "" },
                  ].map(({ label, value, color, sub }) => (
                    <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px", minWidth: 110 }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.06em" }}>{label}</div>
                      <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color, marginTop: 1 }}>{value}</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 1 }}>{sub}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Stats bar */}
            {journalStats && journalEntries.length > 0 && (() => {
              const closedTrades = [...journalEntries]
                .filter(e => e.status === "closed" && e.pnl != null && e.closedAt)
                .sort((a, b) => new Date(a.closedAt) - new Date(b.closedAt));
              const equityCurve = closedTrades.reduce((acc, e) => {
                acc.push((acc[acc.length - 1] || 0) + e.pnl);
                return acc;
              }, []);
              const totalPnl = journalStats.totalPnl;
              const equityFinal = totalPnl != null ? `${totalPnl >= 0 ? "+" : ""}$${Math.round(totalPnl)}` : "—";
              const equityColor = totalPnl == null ? C.textDim : totalPnl >= 0 ? C.green : C.red;
              const eW = 280, eH = 52;
              let sparkPath = "";
              if (equityCurve.length >= 2) {
                const minY = Math.min(...equityCurve, 0);
                const maxY = Math.max(...equityCurve, 0);
                const range = Math.max(maxY - minY, 1);
                const pts = equityCurve.map((v, i) => {
                  const x = (i / (equityCurve.length - 1)) * eW;
                  const y = eH - ((v - minY) / range) * (eH - 6) - 3;
                  return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
                });
                sparkPath = pts.join(" ");
              }
              const openIds = Object.keys(liveJournalPnl);
              const totalLivePnl = openIds.reduce((s, id) => s + liveJournalPnl[id].livePnl, 0);
              const livePnlColor = openIds.length === 0 ? C.textDim : totalLivePnl >= 0 ? C.green : C.red;
              const livePnlDisplay = openIds.length > 0 ? `${totalLivePnl >= 0 ? "+" : ""}$${Math.round(totalLivePnl)}` : "—";
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 12 }}>
                  {[
                    { label: "TRADES", value: journalEntries.length },
                    { label: "OPEN", value: journalStats.open ?? 0 },
                    { label: "WIN RATE", value: journalStats.closed ? `${journalStats.winRate ?? 0}%` : "—" },
                    { label: "TOTAL P/L", value: equityFinal, color: equityColor },
                    { label: "AVG P/L", value: journalStats.avgPnl != null ? `${journalStats.avgPnl >= 0 ? "+" : ""}$${Math.round(journalStats.avgPnl)}` : "—" },
                    { label: "BEST TRADE", value: journalStats.bestTrade ? `${journalStats.bestTrade.ticker} +$${Math.round(journalStats.bestTrade.pnl)}` : "—" },
                    { label: `LIVE UNRLZD (${openIds.length})`, value: livePnlDisplay, color: livePnlColor },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{label}</div>
                      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: color || C.text, marginTop: 2 }}>{value}</div>
                    </div>
                  ))}
                  {equityCurve.length >= 2 && (
                    <div style={{ gridColumn: "1 / -1", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 16 }}>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 2 }}>EQUITY CURVE ({equityCurve.length} closed)</div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: equityColor, fontWeight: 700 }}>{equityFinal} cumulative P/L</div>
                      </div>
                      <svg width={eW} height={eH} style={{ overflow: "visible", flex: 1 }}>
                        <line x1="0" y1={eH / 2} x2={eW} y2={eH / 2} stroke={C.border} strokeWidth="1" strokeDasharray="3,3" />
                        <path d={sparkPath} fill="none" stroke={equityColor} strokeWidth="1.8" strokeLinejoin="round" />
                        <circle cx={eW} cy={(() => {
                          const minY = Math.min(...equityCurve, 0);
                          const maxY = Math.max(...equityCurve, 0);
                          const range = Math.max(maxY - minY, 1);
                          return eH - ((equityCurve[equityCurve.length - 1] - minY) / range) * (eH - 6) - 3;
                        })()} r="3" fill={equityColor} />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Performance analytics row */}
            {journalEntries.length > 0 && (() => {
              const closed = journalEntries.filter(e => e.status === "closed" && e.pnl != null).sort((a, b) => new Date(a.closedAt) - new Date(b.closedAt));
              if (closed.length < 2) return null;
              const wins = closed.filter(e => e.pnl > 0);
              const losses = closed.filter(e => e.pnl <= 0);
              const avgWin = wins.length ? wins.reduce((s, e) => s + e.pnl, 0) / wins.length : 0;
              const avgLoss = losses.length ? Math.abs(losses.reduce((s, e) => s + e.pnl, 0) / losses.length) : 0;
              const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : wins.length ? Infinity : 0;
              const rFactor = avgLoss > 0 ? avgWin / avgLoss : 0;
              let curStreak = 0, maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
              closed.forEach(e => {
                if (e.pnl > 0) { curWin++; curLoss = 0; maxWinStreak = Math.max(maxWinStreak, curWin); }
                else { curLoss++; curWin = 0; maxLossStreak = Math.max(maxLossStreak, curLoss); }
              });
              const lastPnl = closed[closed.length - 1].pnl;
              curStreak = closed.slice().reverse().findIndex(e => lastPnl > 0 ? e.pnl <= 0 : e.pnl > 0);
              if (curStreak === -1) curStreak = closed.length;
              let peak = 0, runningPnl = 0, maxDd = 0;
              closed.forEach(e => { runningPnl += e.pnl; if (runningPnl > peak) peak = runningPnl; const dd = peak - runningPnl; if (dd > maxDd) maxDd = dd; });
              const expectancy = closed.length ? closed.reduce((s, e) => s + e.pnl, 0) / closed.length : 0;
              return (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>PERFORMANCE ANALYTICS ({closed.length} closed trades)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
                    <div><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>AVG WIN</div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.green }}>+${avgWin.toFixed(0)}</div></div>
                    <div><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>AVG LOSS</div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.red }}>-${avgLoss.toFixed(0)}</div></div>
                    <div><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>R-FACTOR</div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: rFactor >= 1.5 ? C.green : rFactor >= 1 ? C.amber : C.red }}>{isFinite(rFactor) ? rFactor.toFixed(2) : "∞"}</div></div>
                    <div><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>PROFIT FACTOR</div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: profitFactor >= 1.5 ? C.green : profitFactor >= 1 ? C.amber : C.red }}>{isFinite(profitFactor) ? profitFactor.toFixed(2) : "∞"}</div></div>
                    <div><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>EXPECTANCY</div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: expectancy >= 0 ? C.green : C.red }}>{expectancy >= 0 ? "+" : ""}${expectancy.toFixed(0)}</div></div>
                    <div><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>MAX DRAWDOWN</div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: maxDd > 0 ? C.red : C.textDim }}>{maxDd > 0 ? `-$${maxDd.toFixed(0)}` : "—"}</div></div>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>STREAKS</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>
                        <span style={{ color: closed.length ? (closed[closed.length-1].pnl > 0 ? C.green : C.red) : C.textDim }}>
                          {closed.length ? `${closed[closed.length-1].pnl > 0 ? "▲" : "▼"}${curStreak}` : "—"}
                        </span>
                        <span style={{ color: C.textDim, fontSize: 12 }}>{" "}NOW</span>
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 2 }}>
                        <span style={{ color: C.green }}>W{maxWinStreak}</span>
                        <span>{" / "}</span>
                        <span style={{ color: C.red }}>L{maxLossStreak}</span>
                        <span>{" best"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Style breakdown */}
            {journalEntries.length > 2 && (() => {
              const closed = journalEntries.filter(e => e.status === "closed" && e.pnl != null);
              if (closed.length < 2) return null;
              const byStyle = {};
              closed.forEach(e => {
                const s = e.style || "Other";
                if (!byStyle[s]) byStyle[s] = { trades: 0, wins: 0, pnl: 0 };
                byStyle[s].trades++;
                if (e.pnl > 0) byStyle[s].wins++;
                byStyle[s].pnl += e.pnl;
              });
              const rows = Object.entries(byStyle).sort((a, b) => b[1].pnl - a[1].pnl);
              if (rows.length < 2) return null;
              return (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>PERFORMANCE BY STYLE</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {rows.map(([style, s]) => {
                      const wr = Math.round((s.wins / s.trades) * 100);
                      const pnlColor = s.pnl >= 0 ? C.green : C.red;
                      return (
                        <div key={style} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", minWidth: 100 }}>
                          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 3 }}>{style.toUpperCase()}</div>
                          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: pnlColor }}>{s.pnl >= 0 ? "+" : ""}${Math.round(s.pnl)}</div>
                          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 1 }}>{s.trades} trades · <span style={{ color: wr >= 50 ? C.green : C.red }}>{wr}% WR</span></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* ── Weekly Review Generator ── */}
            {(() => {
              const today     = new Date();
              const dow       = today.getDay(); // 0=Sun
              const isSunday  = dow === 0;
              // Get last 7 days of closed trades
              const cutoff    = new Date(today); cutoff.setDate(cutoff.getDate() - 7);
              const weekTrades = journalEntries.filter(e =>
                e.status === "closed" && e.pnl != null && e.closedAt &&
                new Date(e.closedAt) >= cutoff
              );
              const weekPnl   = weekTrades.reduce((s, e) => s + e.pnl, 0);
              const weekWins  = weekTrades.filter(e => e.pnl > 0).length;
              const weekWR    = weekTrades.length ? Math.round(weekWins / weekTrades.length * 100) : 0;
              const bestTrade = weekTrades.length ? [...weekTrades].sort((a,b) => b.pnl - a.pnl)[0] : null;
              const worstTrade = weekTrades.length ? [...weekTrades].sort((a,b) => a.pnl - b.pnl)[0] : null;
              // Best setup this week
              const byStyle   = {};
              weekTrades.forEach(e => {
                const s = e.style || "Other";
                if (!byStyle[s]) byStyle[s] = { pnl: 0, trades: 0 };
                byStyle[s].pnl += e.pnl; byStyle[s].trades++;
              });
              const topSetup  = Object.entries(byStyle).sort((a,b) => b[1].pnl - a[1].pnl)[0];
              return (
                <div style={{ background: C.card, border: `1px solid ${C.purple}44`, borderRadius: 10,
                  padding: 16, marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.text }}>
                        📋 WEEKLY REVIEW — Last 7 Days
                      </div>
                      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 2 }}>
                        {isSunday ? "✅ It's Sunday — perfect time for your weekly review" : `${7 - dow} days until Sunday review`}
                      </div>
                    </div>
                    <button onClick={fetchJournalReview} disabled={journalRevLoad || weekTrades.length < 2}
                      style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "8px 16px",
                        borderRadius: 7, border: `1px solid ${C.purple}66`, cursor: "pointer",
                        background: journalRevLoad ? C.surface : `${C.purple}22`,
                        color: journalRevLoad ? C.textDim : C.purple }}>
                      {journalRevLoad ? "🤖 Analyzing…" : "🤖 Generate AI Review"}
                    </button>
                  </div>
                  {weekTrades.length === 0 ? (
                    <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, padding: "10px 0" }}>
                      No closed trades in the last 7 days. Log trades in your Journal to see the weekly review.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: journalReview ? 12 : 0 }}>
                      {[
                        { label: "WEEK P&L",  val: `${weekPnl >= 0 ? "+" : ""}$${Math.round(weekPnl)}`, color: weekPnl >= 0 ? C.green : C.red },
                        { label: "TRADES",    val: weekTrades.length, color: C.text },
                        { label: "WIN RATE",  val: `${weekWR}%`, color: weekWR >= 60 ? C.green : weekWR >= 45 ? C.amber : C.red },
                        { label: "BEST TRADE",val: bestTrade ? `${bestTrade.ticker} +$${Math.round(bestTrade.pnl)}` : "—", color: C.green },
                        { label: "WORST TRADE",val: worstTrade ? `${worstTrade.ticker} -$${Math.abs(Math.round(worstTrade.pnl))}` : "—", color: C.red },
                        { label: "TOP SETUP", val: topSetup ? topSetup[0] : "—", color: C.accent },
                      ].map(({ label, val, color }) => (
                        <div key={label} style={{ padding: "10px 12px", background: C.surface, borderRadius: 8,
                          border: `1px solid ${C.border}`, textAlign: "center" }}>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 3 }}>{label}</div>
                          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* AI Review output */}
                  {journalReview?.text && (
                    <div style={{ marginTop: 12, padding: 12, background: `${C.purple}10`,
                      border: `1px solid ${C.purple}33`, borderRadius: 8,
                      fontFamily: SANS, fontSize: 13, color: C.text, lineHeight: 1.7,
                      whiteSpace: "pre-wrap" }}>
                      {journalReview.text}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Monthly P/L chart */}
            {journalEntries.length > 1 && (() => {
              const closed = journalEntries.filter(e => e.status === "closed" && e.pnl != null && e.closedAt);
              if (closed.length < 3) return null;
              const byMonth = {};
              closed.forEach(e => {
                const d = new Date(e.closedAt);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                if (!byMonth[key]) byMonth[key] = { pnl: 0, trades: 0, wins: 0 };
                byMonth[key].pnl += e.pnl;
                byMonth[key].trades++;
                if (e.pnl > 0) byMonth[key].wins++;
              });
              const months = Object.keys(byMonth).sort().slice(-8);
              if (months.length < 2) return null;
              const rows = months.map(k => ({ key: k, ...byMonth[k] }));
              const maxAbs = Math.max(...rows.map(r => Math.abs(r.pnl)), 1);
              const MABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
              return (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, letterSpacing: "0.08em", marginBottom: 10 }}>MONTHLY P/L</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 80 }}>
                    {rows.map(r => {
                      const [yr, mo] = r.key.split("-");
                      const label = MABBR[parseInt(mo, 10) - 1] + " '" + yr.slice(2);
                      const pct = Math.abs(r.pnl) / maxAbs;
                      const barH = Math.max(Math.round(pct * 60), 4);
                      const col = r.pnl >= 0 ? C.green : C.red;
                      const wr = Math.round((r.wins / r.trades) * 100);
                      return (
                        <div key={r.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }} title={`${r.trades} trades · ${wr}% WR · ${r.pnl >= 0 ? "+" : ""}$${Math.round(r.pnl)}`}>
                          <div style={{ fontFamily: MONO, fontSize: 12, color: col, fontWeight: 700 }}>{r.pnl >= 0 ? "+" : ""}${Math.round(r.pnl)}</div>
                          <div style={{ width: "100%", height: barH, background: col, borderRadius: "3px 3px 0 0", opacity: 0.75, transition: "height 0.3s ease" }} />
                          <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, whiteSpace: "nowrap" }}>{label}</div>
                          <div style={{ fontFamily: MONO, fontSize: 12, color: wr >= 50 ? C.green : C.red }}>{wr}%</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* ── Performance by Time of Day ── */}
            {(() => {
              const closed = journalEntries.filter(e => e.status === "closed" && e.pnl != null && e.closedAt);
              const byHour = {};
              closed.forEach(e => {
                const h = new Date(e.closedAt).getHours();
                if (!byHour[h]) byHour[h] = { trades: 0, wins: 0, pnl: 0 };
                byHour[h].trades++;
                byHour[h].pnl += e.pnl;
                if (e.pnl > 0) byHour[h].wins++;
              });
              const hours = Object.entries(byHour)
                .map(([h, d]) => ({ h: Number(h), ...d, wr: Math.round(d.wins / d.trades * 100) }))
                .sort((a, b) => a.h - b.h);
              if (hours.length < 2) return (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, marginBottom: 14 }}>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.text, marginBottom: 6 }}>⏱ PERFORMANCE BY TIME OF DAY</div>
                  <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, lineHeight: 1.6 }}>
                    No trade data yet. Log closed trades in your <strong style={{ color: C.accent, cursor: "pointer" }} onClick={() => setActiveTab("journal")}>Journal</strong> tab and this chart will show your best and worst trading hours automatically.
                  </div>
                </div>
              );
              const maxAbs = Math.max(...hours.map(h => Math.abs(h.pnl)), 1);
              const bestHour  = [...hours].sort((a, b) => b.pnl - a.pnl)[0];
              const worstHour = [...hours].sort((a, b) => a.pnl - b.pnl)[0];
              const fmt12 = h => { const ampm = h >= 12 ? "PM" : "AM"; const h12 = h % 12 || 12; return `${h12}${ampm}`; };
              return (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.text, marginBottom: 4 }}>⏱ PERFORMANCE BY TIME OF DAY</div>
                  <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, marginBottom: 14 }}>
                    Your P&L and win rate broken down by the hour you closed each trade.
                    {bestHour && <span style={{ color: C.green }}> Best hour: <strong>{fmt12(bestHour.h)}</strong> ({bestHour.wr}% WR · +${Math.round(bestHour.pnl)}).</span>}
                    {worstHour && <span style={{ color: C.red }}> Worst hour: <strong>{fmt12(worstHour.h)}</strong> ({worstHour.wr}% WR · ${Math.round(worstHour.pnl)}).</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
                    {hours.map(({ h, trades, wins, pnl, wr }) => {
                      const col   = pnl >= 0 ? C.green : C.red;
                      const barH  = Math.max(6, Math.round(Math.abs(pnl) / maxAbs * 80));
                      const isTop = h === bestHour?.h;
                      const isBot = h === worstHour?.h;
                      return (
                        <div key={h} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flex: 1, minWidth: 44,
                          background: (isTop || isBot) ? `${col}12` : "transparent", borderRadius: 6, padding: "4px 2px",
                          border: (isTop || isBot) ? `1px solid ${col}33` : "1px solid transparent" }}>
                          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: col }}>
                            {pnl >= 0 ? "+" : ""}${Math.abs(pnl) >= 1000 ? (pnl / 1000).toFixed(1) + "k" : Math.round(pnl)}
                          </div>
                          <div style={{ width: "80%", height: barH, background: col, borderRadius: "3px 3px 0 0", opacity: 0.7 }} />
                          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{fmt12(h)}</div>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: wr >= 50 ? C.green : C.red, fontWeight: 700 }}>{wr}%</div>
                          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{trades}t</div>
                        </div>
                      );
                    })}
                  </div>
                  {bestHour && (
                    <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 7, background: `${C.green}12`, border: `1px solid ${C.green}33`,
                      fontFamily: SANS, fontSize: 12, color: C.green, fontWeight: 600 }}>
                      💡 Trade most between <strong>{fmt12(bestHour.h)}–{fmt12(bestHour.h + 1)}</strong> — your highest win rate and best average P&L.
                      {worstHour && worstHour.pnl < 0 && <span style={{ color: C.red }}> Avoid <strong>{fmt12(worstHour.h)}</strong> — you lose money consistently at this hour.</span>}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Toolbar */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
              {["all", "open", "closed", "cancelled"].map(f => (
                <button key={f} onClick={() => setJournalFilter(f)}
                  style={{ border: `1px solid ${journalFilter === f ? C.accent : C.border}`, background: journalFilter === f ? `${C.accent}18` : C.surface, color: journalFilter === f ? C.accent : C.textSec, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer", textTransform: "uppercase" }}>
                  {f}
                </button>
              ))}
              <input
                value={journalTickerSearch}
                onChange={e => setJournalTickerSearch(e.target.value.toUpperCase())}
                placeholder="Search ticker…"
                style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 8px", width: 120, borderRadius: 6 }}
              />
              <select value={journalStyleFilter} onChange={e => setJournalStyleFilter(e.target.value)}
                style={{ background: C.surface, border: `1px solid ${journalStyleFilter !== "all" ? C.purple : C.border}`, color: journalStyleFilter !== "all" ? C.purple : C.textSec, fontFamily: MONO, fontSize: 12, padding: "6px 8px", borderRadius: 6 }}>
                <option value="all">All Styles</option>
                {["Breakout","Pullback","Reversal","Momentum","Scalp","Swing","Day Trade","Watchlist","Scanner","Workflow","Terminal","Backtest","Analyzer"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={journalDateRange} onChange={e => setJournalDateRange(e.target.value)}
                style={{ background: C.surface, border: `1px solid ${journalDateRange !== "all" ? C.amber : C.border}`, color: journalDateRange !== "all" ? C.amber : C.textSec, fontFamily: MONO, fontSize: 12, padding: "6px 8px", borderRadius: 6 }}>
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
              </select>
              <button onClick={loadJournalTab} disabled={journalLoading}
                style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer", marginLeft: "auto" }}>
                {journalLoading ? "LOADING…" : "REFRESH"}
              </button>
              <a href="/api/journal/export.csv" download
                style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer", textDecoration: "none" }}>
                EXPORT CSV
              </a>
            </div>

            {/* Journal table */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              {journalEntries.length === 0 && !journalLoading && (
                <div style={{ padding: 24, textAlign: "center", color: C.textDim, fontSize: 13, fontFamily: MONO }}>
                  No journal entries yet. Use LOG buttons throughout the platform to start tracking trades.
                </div>
              )}
              {journalLoading && (
                <div style={{ padding: 24, textAlign: "center", color: C.textDim, fontSize: 12, fontFamily: MONO }}>LOADING…</div>
              )}
              {journalEntries.length > 0 && (() => {
                const SORT_KEYS = { DATE: "openedAt", TICKER: "ticker", SIDE: "side", TF: "timeframe", SCORE: "score", ENTRY: "entry", "P/L": "pnl", STATUS: "status" };
                const sortFn = (a, b) => {
                  const key = SORT_KEYS[journalSort.col];
                  if (!key) return 0;
                  const va = a[key] ?? "";
                  const vb = b[key] ?? "";
                  const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
                  return journalSort.dir === "asc" ? cmp : -cmp;
                };
                const _drStart = (() => {
                  const now = new Date();
                  if (journalDateRange === "today") { const d = new Date(now); d.setHours(0,0,0,0); return d; }
                  if (journalDateRange === "week")  { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d; }
                  if (journalDateRange === "month") { return new Date(now.getFullYear(), now.getMonth(), 1); }
                  if (journalDateRange === "quarter") { const q = Math.floor(now.getMonth() / 3); return new Date(now.getFullYear(), q * 3, 1); }
                  return null;
                })();
                const filtered = journalEntries.filter(e => {
                  if (journalFilter !== "all" && e.status !== journalFilter) return false;
                  if (journalTickerSearch && !String(e.ticker || "").toUpperCase().includes(journalTickerSearch)) return false;
                  if (journalStyleFilter !== "all" && String(e.style || "").toLowerCase() !== journalStyleFilter.toLowerCase()) return false;
                  if (_drStart) { const t = new Date(e.openedAt || 0); if (t < _drStart) return false; }
                  return true;
                }).sort(sortFn);
                if (!filtered.length) return (
                  <div style={{ padding: 20, textAlign: "center", color: C.textDim, fontSize: 12, fontFamily: MONO }}>
                    No entries {journalFilter !== "all" ? `with status "${journalFilter}"` : ""}{journalTickerSearch ? ` matching "${journalTickerSearch}"` : ""}{journalStyleFilter !== "all" ? ` with style "${journalStyleFilter}"` : ""}.
                  </div>
                );
                const SortTh = ({ col, children, align }) => {
                  const sortable = !!SORT_KEYS[col];
                  const active = journalSort.col === col;
                  return (
                    <th onClick={sortable ? () => setJournalSort(s => ({ col, dir: s.col === col && s.dir === "desc" ? "asc" : "desc" })) : undefined}
                      style={{ padding: "8px 10px", textAlign: align || "center", fontFamily: MONO, fontSize: 12, color: active ? C.accent : C.textDim, fontWeight: 600, cursor: sortable ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap" }}>
                      {children}{active ? (journalSort.dir === "desc" ? " ↓" : " ↑") : ""}
                    </th>
                  );
                };
                return (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: C.surface }}>
                        {["DATE","TICKER","SIDE","TF","SCORE","ENTRY","SL","TARGET","R:R","P/L","STATUS","NOTES","ACTION"].map(h => (
                          <SortTh key={h} col={h} align={h === "NOTES" ? "left" : "center"}>{h}</SortTh>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(e => {
                        const livePnlData = liveJournalPnl[e.id];
                        const pnlColor = livePnlData ? (livePnlData.livePnl >= 0 ? C.green : C.red) : e.pnl == null ? C.textSec : e.pnl >= 0 ? C.green : C.red;
                        return (
                          <React.Fragment key={e.id}>
                            <tr style={{ borderTop: `1px solid ${C.border}` }}>
                              <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textSec }}>{new Date(e.openedAt).toLocaleDateString()}</td>
                              <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text }}>
                                <button onClick={() => { setTerminalSymbol(e.ticker); try { localStorage.setItem("mterminal_load_sym", e.ticker); } catch {} setActiveTab("mterminal"); }}
                                  style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 12, fontWeight: 800, cursor: "pointer", padding: 0 }}>{e.ticker}</button>
                              </td>
                              <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: e.side === "BUY" ? C.green : e.side === "SELL" ? C.red : C.amber, fontWeight: 700 }}>{e.side}</td>
                              <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textSec }}>{e.timeframe || "—"}</td>
                              <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textSec }}>{e.score}</td>
                              <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.text }}>
                                {e.entry ? `$${e.entry}` : "—"}
                                {livePnlData && <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, marginTop: 1 }}>{`$${livePnlData.livePrice.toFixed(2)}`}</div>}
                              </td>
                              <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.red }}>{e.stopLoss ? `$${e.stopLoss}` : "—"}</td>
                              <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.green }}>{e.target ? `$${e.target}` : "—"}</td>
                              <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12 }}>
                                {(() => {
                                  if (!e.entry || !e.stopLoss || !e.target) return <span style={{ color: C.textDim }}>—</span>;
                                  const risk = Math.abs(e.entry - e.stopLoss);
                                  const reward = Math.abs(e.target - e.entry);
                                  if (risk <= 0) return <span style={{ color: C.textDim }}>—</span>;
                                  const rr = reward / risk;
                                  const rrColor = rr >= 3 ? C.green : rr >= 2 ? C.accent : rr >= 1 ? C.amber : C.red;
                                  return <span style={{ color: rrColor, fontWeight: 700 }}>{rr.toFixed(1)}R</span>;
                                })()}
                              </td>
                              <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: pnlColor }}>
                                {livePnlData ? (
                                  <div>
                                    <div>{livePnlData.livePnl >= 0 ? "+" : ""}${livePnlData.livePnl.toFixed(2)}</div>
                                    <div style={{ fontSize: 12, color: pnlColor, opacity: 0.8 }}>{livePnlData.livePnlPct >= 0 ? "+" : ""}{livePnlData.livePnlPct.toFixed(2)}% LIVE</div>
                                  </div>
                                ) : e.pnl != null ? `${e.pnl >= 0 ? "+" : ""}$${e.pnl.toFixed(2)}` : "—"}
                              </td>
                              <td style={{ padding: "8px 10px", textAlign: "center" }}>
                                <span style={{ background: e.status === "open" ? `${C.green}22` : e.status === "closed" ? `${C.accent}22` : `${C.amber}22`, color: e.status === "open" ? C.green : e.status === "closed" ? C.accent : C.amber, borderRadius: 6, padding: "3px 7px", fontFamily: MONO, fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>{e.status}</span>
                              </td>
                              <td style={{ padding: "8px 10px", textAlign: "left", fontFamily: MONO, fontSize: 12, color: C.textSec, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.notes || "—"}</td>
                              <td style={{ padding: "8px 10px", textAlign: "center" }}>
                                <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
                                  {e.status === "open" && (
                                    <button onClick={() => { setJournalCloseId(e.id); setJournalClosePrice(livePnlData ? String(livePnlData.livePrice.toFixed(2)) : ""); }}
                                      style={{ border: `1px solid ${C.green}55`, background: `${C.green}12`, color: C.green, borderRadius: 6, padding: "4px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>CLOSE</button>
                                  )}
                                  <button
                                    onClick={() => {
                                      const rr = e.entry && e.stopLoss && e.target ? ((e.target - e.entry) / Math.max(0.001, e.entry - e.stopLoss)).toFixed(2) : "—";
                                      const w = window.open("", "_blank", "width=700,height=820");
                                      w.document.write(`<!DOCTYPE html><html><head><title>Trade Sheet – ${e.ticker}</title>
<style>body{font-family:Inter,Arial,sans-serif;padding:32px 40px;color:#0f172a;font-size:13px;}h1{font-size:22px;font-weight:900;margin:0 0 4px;}h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:24px 0 8px;}table{width:100%;border-collapse:collapse;margin-bottom:16px;}td{padding:7px 10px;border-bottom:1px solid #e2e8f0;}td:first-child{font-weight:700;width:36%;}.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:800;}.green{background:#dcfce7;color:#15803d;}.red{background:#fee2e2;color:#b91c1c;}.blue{background:#dbeafe;color:#1d4ed8;}.amber{background:#fef9c3;color:#92400e;}.footer{margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;}@media print{body{padding:16px;}}</style>
</head><body>
<h1>${e.ticker} Trade Sheet</h1>
<span class="badge ${e.side === "BUY" ? "green" : e.side === "SELL" ? "red" : "blue"}">${e.side}</span>
<span class="badge ${e.status === "open" ? "blue" : e.status === "closed" ? "green" : "amber"}" style="margin-left:6px">${String(e.status).toUpperCase()}</span>
<h2>Plan</h2>
<table>
<tr><td>Entry</td><td>${e.entry ? "$" + e.entry : "—"}</td></tr>
<tr><td>Stop Loss</td><td>${e.stopLoss ? "$" + e.stopLoss : "—"}</td></tr>
<tr><td>Target</td><td>${e.target ? "$" + e.target : "—"}</td></tr>
<tr><td>R:R</td><td>${rr}</td></tr>
<tr><td>Score</td><td>${e.score}/100</td></tr>
<tr><td>Timeframe</td><td>${e.timeframe || "—"}</td></tr>
<tr><td>Style</td><td>${e.style || "—"}</td></tr>
</table>
<h2>Result</h2>
<table>
<tr><td>Status</td><td>${String(e.status).toUpperCase()}</td></tr>
<tr><td>Close Price</td><td>${e.closePrice ? "$" + e.closePrice : "—"}</td></tr>
<tr><td>P/L</td><td>${e.pnl != null ? (e.pnl >= 0 ? "+" : "") + "$" + Number(e.pnl).toFixed(2) : "—"}</td></tr>
</table>
<h2>Notes</h2>
<p style="line-height:1.6;padding:8px;background:#f8fafc;border-radius:6px;white-space:pre-wrap">${e.notes || "No notes."}</p>
<div class="footer">Dixie AM Trading Platform · Logged ${new Date(e.openedAt).toLocaleString()} · Printed ${new Date().toLocaleString()}</div>
<script>setTimeout(()=>{window.print();},300);</script>
</body></html>`);
                                      w.document.close();
                                    }}
                                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "4px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                                  >PRINT</button>
                                  <button
                                    onClick={async () => {
                                      if (!window.confirm(`Delete journal entry for ${e.ticker}?`)) return;
                                      await fetch(`/api/journal/${e.id}`, { method: "DELETE" });
                                      loadJournalTab();
                                    }}
                                    style={{ border: `1px solid ${C.red}55`, background: `${C.red}0f`, color: C.red, borderRadius: 6, padding: "4px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                                  >DEL</button>
                                  <button
                                    onClick={() => { setJournalEditId(journalEditId === e.id ? null : e.id); setJournalEditNotes(e.notes || ""); setJournalEditEntry(String(e.entry || "")); setJournalEditSL(String(e.stopLoss || "")); setJournalEditTarget(String(e.target || "")); setJournalEditSize(String(e.size || "")); }}
                                    style={{ border: `1px solid ${C.accent}55`, background: journalEditId === e.id ? `${C.accent}28` : `${C.accent}0f`, color: C.accent, borderRadius: 6, padding: "4px 7px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}
                                  >EDIT</button>
                                </div>
                              </td>
                            </tr>
                            {journalEditId === e.id && (
                              <tr style={{ background: `${C.accent}06`, borderTop: `1px solid ${C.accent}33` }}>
                                <td colSpan={13} style={{ padding: "10px 12px" }}>
                                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "0 0 auto" }}>
                                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>ENTRY</div>
                                      <input type="number" step="0.01" value={journalEditEntry} onChange={e2 => setJournalEditEntry(e2.target.value)} placeholder="Entry $"
                                        style={{ width: 90, background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "5px 8px", fontFamily: MONO, fontSize: 12, borderRadius: 6 }} />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "0 0 auto" }}>
                                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>STOP</div>
                                      <input type="number" step="0.01" value={journalEditSL} onChange={e2 => setJournalEditSL(e2.target.value)} placeholder="SL $"
                                        style={{ width: 90, background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "5px 8px", fontFamily: MONO, fontSize: 12, borderRadius: 6 }} />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "0 0 auto" }}>
                                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>TARGET</div>
                                      <input type="number" step="0.01" value={journalEditTarget} onChange={e2 => setJournalEditTarget(e2.target.value)} placeholder="Target $"
                                        style={{ width: 90, background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "5px 8px", fontFamily: MONO, fontSize: 12, borderRadius: 6 }} />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "0 0 auto" }}>
                                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>SHARES</div>
                                      <input type="number" step="1" value={journalEditSize} onChange={e2 => setJournalEditSize(e2.target.value)} placeholder="Qty"
                                        style={{ width: 80, background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "5px 8px", fontFamily: MONO, fontSize: 12, borderRadius: 6 }} />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 160 }}>
                                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>NOTES</div>
                                      <textarea
                                        value={journalEditNotes}
                                        onChange={e2 => setJournalEditNotes(e2.target.value)}
                                        autoFocus
                                        rows={2}
                                        placeholder="Trade notes…"
                                        style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "5px 8px", fontFamily: SANS, fontSize: 12, resize: "vertical", borderRadius: 6 }}
                                      />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignSelf: "flex-end" }}>
                                      <button onClick={async () => {
                                        const patch = { notes: journalEditNotes };
                                        if (journalEditEntry) patch.entry = Number(journalEditEntry);
                                        if (journalEditSL) patch.stopLoss = Number(journalEditSL);
                                        if (journalEditTarget) patch.target = Number(journalEditTarget);
                                        if (journalEditSize) patch.size = Number(journalEditSize);
                                        await fetch(`/api/journal/${e.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
                                        setJournalEditId(null);
                                        loadJournalTab();
                                      }} style={{ border: `1px solid ${C.accent}55`, background: `${C.accent}18`, color: C.accent, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>SAVE</button>
                                      <button onClick={() => setJournalEditId(null)} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>CANCEL</button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                            {journalCloseId === e.id && (
                              <tr style={{ background: `${C.green}08`, borderTop: `1px solid ${C.green}44` }}>
                                <td colSpan={13} style={{ padding: "10px 12px" }}>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec }}>Close price:</span>
                                    <input type="number" step="0.01" value={journalClosePrice} onChange={e2 => setJournalClosePrice(e2.target.value)}
                                      placeholder="e.g. 184.50" autoFocus
                                      style={{ width: 120, background: C.surface, border: `1px solid ${C.green}55`, color: C.text, padding: "6px 8px", fontFamily: MONO, fontSize: 12 }} />
                                    {liveJournalPnl[e.id] && <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Live: ${liveJournalPnl[e.id].livePrice.toFixed(2)}</span>}
                                    <button onClick={async () => {
                                      const cp = Number(journalClosePrice);
                                      if (!cp) return;
                                      await fetch(`/api/journal/${e.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "closed", closePrice: cp }) });
                                      setJournalCloseId(null);
                                      loadJournalTab();
                                    }} style={{ border: `1px solid ${C.green}55`, background: `${C.green}18`, color: C.green, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>CONFIRM</button>
                                    <button onClick={() => setJournalCloseId(null)} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>CANCEL</button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
  );
}
