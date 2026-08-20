import { useState } from "react";

// MTF Decision System's real historical backtest (Task #112, 2026-08-20) —
// unlike AplusScoreTrackCard/MtfOutcomeTrackCard right above this in Mission
// Status (both passive, pure forward logs that auto-load), this is an
// on-demand tool: pick real symbols + a lookback window, run a real
// walk-forward replay of the Minervini trend template + Sniper Decision's
// ENTER_LONG trigger over each symbol's real daily history, broken out by
// real SPY-based market regime. Daily-layer only — see backtest-engine.js's
// own header for exactly why 4H/1H/the state machine aren't included; this
// card surfaces that same scope note verbatim rather than implying more
// coverage than the backend actually has.
const HORIZONS = [
  { key: "d5", label: "5 DAYS" },
  { key: "d10", label: "10 DAYS" },
  { key: "d20", label: "20 DAYS" },
  { key: "d40", label: "40 DAYS" },
];
const REGIME_META = {
  BULL: { icon: "🟢", label: "BULL" },
  BEAR: { icon: "🔴", label: "BEAR" },
  SIDEWAYS: { icon: "🟡", label: "SIDEWAYS" },
  UNKNOWN: { icon: "⚪", label: "UNKNOWN" },
};

function StatBlock({ C, MONO, SANS, stat }) {
  if (!stat) return <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, fontStyle: "italic" }}>Not enough history yet</div>;
  return (
    <div style={{ fontFamily: MONO, fontSize: 10.5, lineHeight: 1.6 }}>
      <div><span style={{ color: stat.avgReturnPct >= 0 ? C.green : C.red, fontWeight: 800 }}>{stat.avgReturnPct >= 0 ? "+" : ""}{stat.avgReturnPct}%</span> avg · {stat.winRate}% win</div>
      <div style={{ color: C.textDim }}>MFE +{stat.avgMfePct}% / MAE {stat.avgMaePct}%</div>
      {stat.stopHitRate != null && <div style={{ color: C.textDim }}>Stop hit {stat.stopHitRate}% · Target1 {stat.target1HitRate}%</div>}
      <div style={{ color: C.textDim }}>n={stat.count}</div>
    </div>
  );
}

export default function BacktestCard({ C, MONO, SANS, defaultSymbols }) {
  const [symbolsInput, setSymbolsInput] = useState((defaultSymbols || []).slice(0, 10).join(","));
  const [years, setYears] = useState(5);
  const [state, setState] = useState("idle"); // idle | loading | ok | err
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function runBacktest() {
    const symbols = symbolsInput.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    if (!symbols.length) { setError("Enter at least one symbol."); setState("err"); return; }
    setState("loading"); setError(null);
    try {
      const r = await fetch(`/api/market/backtest?symbols=${encodeURIComponent(symbols.join(","))}&years=${years}`);
      const d = await r.json();
      if (!d.ok) { setError(d.error || "Backtest failed."); setState("err"); return; }
      setResult(d); setState("ok");
    } catch (e) {
      setError(e.message || "Backtest failed."); setState("err");
    }
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 10 }}>📊 MTF DECISION — HISTORICAL BACKTEST</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <input
          value={symbolsInput}
          onChange={(e) => setSymbolsInput(e.target.value)}
          placeholder="AAPL,MSFT,NVDA…"
          style={{ flex: "1 1 220px", minWidth: 160, fontFamily: MONO, fontSize: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", color: C.text }}
        />
        <select value={years} onChange={(e) => setYears(Number(e.target.value))} style={{ fontFamily: MONO, fontSize: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", color: C.text }}>
          {[1, 2, 3, 5].map(y => <option key={y} value={y}>{y}y</option>)}
        </select>
        <button
          onClick={runBacktest}
          disabled={state === "loading"}
          style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, background: C.accent, color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", cursor: state === "loading" ? "default" : "pointer", opacity: state === "loading" ? 0.6 : 1 }}
        >
          {state === "loading" ? "RUNNING…" : "RUN BACKTEST"}
        </button>
      </div>

      {state === "err" && <div style={{ fontFamily: SANS, fontSize: 12, color: C.red, marginBottom: 8 }}>{error}</div>}

      {result && state === "ok" && (
        <>
          <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginBottom: 4 }}>
            {result.report.totalEvents} real ENTER_LONG signal{result.report.totalEvents === 1 ? "" : "s"} across {result.symbols.length} symbol{result.symbols.length === 1 ? "" : "s"}, {result.range} of real daily history.
          </div>
          {!!result.skipped?.length && (
            <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginBottom: 8 }}>
              Skipped (not enough history): {result.skipped.map(s => s.symbol).join(", ")}
            </div>
          )}

          {result.report.totalEvents === 0 ? (
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.textSec, lineHeight: 1.5, marginBottom: 8 }}>
              No real ENTER_LONG signal fired for these symbols over this window — Sniper Decision is a hard, high-conviction gate (trend + volume + momentum + a confirmed breakout, all at once), so this is genuinely rare on any single name. Try a broader list or a longer window.
            </div>
          ) : (
            <>
              <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.text, marginBottom: 6 }}>OVERALL</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 12 }}>
                {HORIZONS.map(h => (
                  <div key={h.key} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 8 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginBottom: 4 }}>{h.label}</div>
                    <StatBlock C={C} MONO={MONO} SANS={SANS} stat={result.report.overall[h.key]} />
                  </div>
                ))}
              </div>

              {Object.keys(result.report.byRegime).map(regime => {
                const meta = REGIME_META[regime] || REGIME_META.UNKNOWN;
                const bucket = result.report.byRegime[regime];
                return (
                  <div key={regime} style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.text, marginBottom: 6 }}>{meta.icon} {meta.label} · {bucket.eventCount} signal{bucket.eventCount === 1 ? "" : "s"}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                      {HORIZONS.map(h => (
                        <div key={h.key} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 8 }}>
                          <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginBottom: 4 }}>{h.label}</div>
                          <StatBlock C={C} MONO={MONO} SANS={SANS} stat={bucket[h.key]} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </>
      )}

      <div style={{ marginTop: 4, fontFamily: SANS, fontSize: 10, color: C.textDim }}>{result?.scopeNote || "Daily-layer only (trend template + Sniper Decision entry trigger) — 4H/1H and the state machine aren't backtested. Runs live, on-demand — not a stored track record."}</div>
    </div>
  );
}
