// BacktestTab — real walk-forward backtest UI (2026-08-26, Market
// Opportunity Engine Phase 2, plan item #9: "unify the two disconnected
// backtesters"). Was rendering a completely separate, simpler naive
// breakout strategy's fake trade list — now renders the SAME real
// GET /api/market/backtest response (src/backtest-engine.js:
// runBacktestUniverse) the mission-status page's BacktestCard.jsx
// already used, so this tab and that one can never disagree about the
// same symbol again. Real walk-forward, no-lookahead, daily-layer-only
// (the engine's own honest scope disclosure — see scopeNote below) —
// fills at the next bar's open, outcomes measured strictly after that.
const HORIZONS = [5, 10, 20, 40];
const REGIME_COLOR = (C, r) => r === "BULL" ? C.green : r === "BEAR" ? C.red : r === "SIDEWAYS" ? C.amber : C.textDim;

function StatTile({ C, MONO, label, value, color }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: color || C.text }}>{value}</div>
    </div>
  );
}

function HorizonRow({ C, MONO, horizon, stats }) {
  return (
    <tr>
      <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 12, color: C.text, fontWeight: 700 }}>d{horizon}</td>
      {stats ? (
        <>
          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>{stats.count}</td>
          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: stats.winRate >= 50 ? C.green : C.red }}>{stats.winRate}%</td>
          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: stats.avgReturnPct >= 0 ? C.green : C.red }}>{stats.avgReturnPct >= 0 ? "+" : ""}{stats.avgReturnPct}%</td>
          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.green }}>+{stats.avgMfePct}%</td>
          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.red }}>{stats.avgMaePct}%</td>
          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>{stats.stopHitRate != null ? `${stats.stopHitRate}%` : "—"}</td>
          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>{stats.target1HitRate != null ? `${stats.target1HitRate}%` : "—"}</td>
          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.green }}>{stats.avgWin != null ? `+${stats.avgWin}%` : "—"}</td>
          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.red }}>{stats.avgLoss != null ? `-${stats.avgLoss}%` : "—"}</td>
          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }} title={stats.profitFactorNote || ""}>{stats.profitFactor != null ? `${stats.profitFactor}x` : (stats.profitFactorNote ? "no losses" : "—")}</td>
        </>
      ) : (
        <td colSpan={10} style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "center", fontFamily: MONO, fontSize: 11, color: C.textDim }}>Not enough real completed outcomes yet at this horizon</td>
      )}
    </tr>
  );
}

export default function BacktestTab({
  C, MONO, backtestSymbol, setBacktestSymbol, backtestYears, setBacktestYears,
  runBacktest, backtestLoading, backtestResult,
}) {
  const report = backtestResult?.report;
  // Prefer d20 as the "headline" horizon (a common real swing-trade
  // duration) for the journal-log summary line; honestly fall back to
  // whichever horizon actually has real completed data if d20 doesn't.
  const headline = report ? (report.overall?.d20 || HORIZONS.map((h) => report.overall?.[`d${h}`]).find(Boolean) || null) : null;

  return (
    <div>
      <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em", marginBottom: 14 }}>
        BACKTEST LAB — REAL TREND TEMPLATE + SNIPER DECISION (WALK-FORWARD, NO LOOKAHEAD)
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 12, display: "grid", gridTemplateColumns: "180px 130px auto", gap: 8, alignItems: "center" }}>
        <input value={backtestSymbol} onChange={(e) => setBacktestSymbol(e.target.value.toUpperCase())} placeholder="Ticker" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }} />
        <select value={backtestYears} onChange={(e) => setBacktestYears(e.target.value)} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 12 }}>
          <option value="1">1 year</option>
          <option value="2">2 years</option>
          <option value="3">3 years</option>
          <option value="5">5 years</option>
        </select>
        <button onClick={runBacktest} style={{ justifySelf: "start", border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "8px 12px", fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>
          {backtestLoading ? "RUNNING..." : "RUN BACKTEST"}
        </button>
      </div>

      {backtestResult?.error && (
        <div style={{ background: C.redBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, color: C.red, marginBottom: 12, fontSize: 12 }}>
          {backtestResult.error}
        </div>
      )}

      {report && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={async () => {
                if (!headline) return;
                try {
                  await fetch("/api/journal", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      ticker: backtestSymbol,
                      side: "BUY",
                      score: Math.min(99, Math.round(50 + headline.winRate / 2)),
                      notes: `Real walk-forward backtest, ${backtestResult.range} · ${report.totalEvents} real signals · d${HORIZONS.find((h) => report.overall?.[`d${h}`] === headline)} win rate ${headline.winRate}% · avg return ${headline.avgReturnPct >= 0 ? "+" : ""}${headline.avgReturnPct}%`,
                      style: "Backtest",
                    }),
                  });
                } catch {}
              }}
              disabled={!headline}
              style={{ border: `1px solid ${C.accent}55`, background: `${C.accent}12`, color: C.accent, borderRadius: 6, padding: "6px 12px", fontFamily: MONO, fontSize: 12, cursor: headline ? "pointer" : "default", opacity: headline ? 1 : 0.5 }}
            >LOG BACKTEST TO JOURNAL</button>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{backtestResult.symbol} · {backtestResult.range} · {report.totalEvents} real signals</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
            <StatTile C={C} MONO={MONO} label="Real Signals" value={report.totalEvents} />
            <StatTile C={C} MONO={MONO} label="d20 Win Rate" value={report.overall?.d20 ? `${report.overall.d20.winRate}%` : "—"} color={report.overall?.d20 && report.overall.d20.winRate >= 50 ? C.green : C.red} />
            <StatTile C={C} MONO={MONO} label="d20 Avg Return" value={report.overall?.d20 ? `${report.overall.d20.avgReturnPct >= 0 ? "+" : ""}${report.overall.d20.avgReturnPct}%` : "—"} color={report.overall?.d20 && report.overall.d20.avgReturnPct >= 0 ? C.green : C.red} />
            <StatTile C={C} MONO={MONO}
              label="d20 Profit Factor"
              value={report.overall?.d20?.profitFactor != null ? `${report.overall.d20.profitFactor}x` : (report.overall?.d20?.profitFactorNote ? "no losses" : "—")}
              color={report.overall?.d20?.profitFactor != null ? (report.overall.d20.profitFactor >= 1 ? C.green : C.red) : undefined}
            />
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 12, color: C.textDim }}>REAL FORWARD OUTCOMES BY HORIZON — real trading days after fill, never estimated</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: C.surface }}>
                    <th style={{ padding: "8px", textAlign: "left", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Horizon</th>
                    <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>N</th>
                    <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Win Rate</th>
                    <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Avg Return</th>
                    <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Avg MFE</th>
                    <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Avg MAE</th>
                    <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Stop Hit</th>
                    <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Target Hit</th>
                    <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Avg Win</th>
                    <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Avg Loss</th>
                    <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Profit Factor</th>
                  </tr>
                </thead>
                <tbody>
                  {HORIZONS.map((h) => <HorizonRow key={h} C={C} MONO={MONO} horizon={h} stats={report.overall?.[`d${h}`]} />)}
                </tbody>
              </table>
            </div>
          </div>

          {Object.keys(report.byRegime || {}).length > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
              <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 12, color: C.textDim }}>REAL PERFORMANCE BY MARKET REGIME (d20)</div>
              <div style={{ display: "flex", gap: 8, padding: 12, flexWrap: "wrap" }}>
                {Object.entries(report.byRegime).map(([regime, data]) => (
                  <div key={regime} style={{ border: `1px solid ${REGIME_COLOR(C, regime)}55`, background: `${REGIME_COLOR(C, regime)}12`, borderRadius: 8, padding: "8px 12px", minWidth: 130 }}>
                    <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: REGIME_COLOR(C, regime) }}>{regime} · {data.eventCount} signals</div>
                    {data.d20 ? (
                      <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 2 }}>
                        Win {data.d20.winRate}% · Avg {data.d20.avgReturnPct >= 0 ? "+" : ""}{data.d20.avgReturnPct}%
                      </div>
                    ) : (
                      <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 2 }}>Not enough real d20 outcomes yet</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, lineHeight: 1.6 }}>{backtestResult.scopeNote}</div>
        </>
      )}
    </div>
  );
}
