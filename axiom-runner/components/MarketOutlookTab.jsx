import { useState, useCallback, useEffect } from "react";

export default function MarketOutlookTab({ C, MONO, SANS }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const load = useCallback(() => {
    setLoading(true); setErr(null);
    fetch("/api/market/outlook").then(r => r.json())
      .then(x => { if (x.error) { setErr(x.error); setD(null); } else setD(x); })
      .catch(e => setErr(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const leanCol = !d ? C.textDim : d.lean === "BULLISH" ? C.green : d.lean === "BEARISH" ? C.red : "#d6a312";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text }}>🧭 30-DAY MARKET OUTLOOK</div>
        <button onClick={load} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "6px 14px", borderRadius: 6, border: `1px solid ${C.accent}`, background: `${C.accent}18`, color: C.accent, cursor: "pointer" }}>{loading ? "…" : "↻ Refresh"}</button>
        <div style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 11, color: C.textDim }}>Composite of trend · breadth · vol · seasonality · Fed odds</div>
      </div>
      {err && <div style={{ color: C.red, fontFamily: SANS, fontSize: 13 }}>Could not load: {err}</div>}
      {!d && !err && <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim }}>Computing outlook…</div>}

      {d && (<>
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14 }}>
          {/* Lean + range */}
          <div style={{ background: C.bg, border: `1px solid ${leanCol}55`, borderRadius: 12, padding: 18, textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 900, color: leanCol }}>{d.lean}</div>
            <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>next ~30 days · {d.confidence}% conviction</div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 4 }}>composite {d.composite > 0 ? "+" : ""}{d.composite}</div>
            <div style={{ borderTop: `1px solid ${C.border}`, margin: "14px 0", paddingTop: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>SPY {d.spy}</div>
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, margin: "2px 0 8px" }}>expected 30-day move ±{d.range.expectedMovePct}%</div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.green }}>68%: {d.range.low1} – {d.range.high1}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 2 }}>95%: {d.range.low2} – {d.range.high2}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-around", fontFamily: MONO, fontSize: 11 }}>
              <div><div style={{ color: C.textDim }}>VIX</div><div style={{ color: C.text, fontWeight: 700 }}>{d.vix ?? "—"}</div></div>
              <div><div style={{ color: C.textDim }}>Breadth</div><div style={{ color: C.text, fontWeight: 700 }}>{d.breadthPct ?? "—"}%</div></div>
              <div><div style={{ color: C.textDim }}>Season</div><div style={{ color: C.text, fontWeight: 700 }}>{d.seasonality >= 0 ? "+" : ""}{d.seasonality ?? "—"}%</div></div>
            </div>
          </div>

          {/* Signal breakdown */}
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 10 }}>What's driving the read</div>
            {d.signals.map(s => { const pos = s.score >= 0; const w = Math.min(50, Math.abs(s.score) / 25 * 50);
              return (
                <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", fontFamily: MONO, fontSize: 12 }}>
                  <div style={{ width: 110, color: C.text }}>{s.name}</div>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", position: "relative", height: 14 }}>
                    <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: C.border }} />
                    <div style={{ position: "absolute", left: pos ? "50%" : `calc(50% - ${w}%)`, width: w + "%", height: 10, top: 2, borderRadius: 3, background: pos ? C.green : C.red, opacity: .85 }} />
                  </div>
                  <div style={{ width: 52, textAlign: "right", color: pos ? C.green : C.red, fontWeight: 700 }}>{pos ? "+" : ""}{s.score}</div>
                  <div style={{ width: 240, color: C.textDim, fontFamily: SANS, fontSize: 11 }}>{s.detail}</div>
                </div>
              ); })}
          </div>
        </div>

        {/* Prediction markets */}
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 8 }}>🔮 Prediction markets <span style={{ color: C.textDim, fontWeight: 400, fontSize: 11 }}>(Polymarket — what the crowd is pricing)</span></div>
          {d.predictionMarkets.fed ? (
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontFamily: MONO, fontSize: 13 }}>
              <div style={{ color: C.textDim, fontSize: 12 }}>Next FOMC ({d.predictionMarkets.fed.meeting}):</div>
              <div><b style={{ color: C.green }}>CUT {d.predictionMarkets.fed.cut}%</b></div>
              <div><b style={{ color: "#d6a312" }}>HOLD {d.predictionMarkets.fed.hold}%</b></div>
              <div><b style={{ color: C.red }}>HIKE {d.predictionMarkets.fed.hike}%</b></div>
              {d.predictionMarkets.recession && <div style={{ color: C.textDim }}>· Recession odds <b style={{ color: C.text }}>{d.predictionMarkets.recession.prob}%</b></div>}
            </div>
          ) : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Prediction-market data unavailable right now.</div>}
        </div>

        <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, lineHeight: 1.5 }}>
          ⚠ {d.note} The lean is a weighted snapshot of current conditions; the range is a statistical 1σ/2σ band from realized volatility — both shift as conditions change. Not financial advice.</div>
      </>)}
    </div>
  );
}
