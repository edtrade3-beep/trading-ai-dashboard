import { useState, useEffect, useCallback } from "react";

// ─── VolatilityLabTab ───────────────────────────────────────────────────
// Options platform redesign Phase 8. GET /api/market/volatility
// (src/volatility-lab.js) — HV20/HV60/RV10 are real math over real daily
// bars, no gate. IV Rank/Percentile/Trend reuse Phase 5's real
// iv-history-store.js snapshots, honest "building" state included as-is.
// Skew and Term Structure are hard-gated on POLYGON_API_KEY (need real
// per-contract delta / multi-expiry data) — honest "unavailable" card per
// field when not configured, same convention Gamma Lab (Phase 7) uses.
export default function VolatilityLabTab({ C, MONO, SANS, defaultSymbol, setActiveTab }) {
  const [symbol, setSymbol] = useState(defaultSymbol || "AAPL");
  const [input, setInput] = useState(defaultSymbol || "AAPL");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (sym) => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/market/volatility?symbol=${encodeURIComponent(sym)}`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Failed");
      setData(d);
    } catch (e) { setError(e.message); setData(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(symbol); }, [symbol]);

  const row = (label, value, color, title) => (
    <div title={title} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}55` }}>
      <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: color || C.text }}>{value}</span>
    </div>
  );

  const unavailableBlock = (reason) => (
    <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, padding: "8px 0" }}>{reason}</div>
  );

  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" };

  const ivRankState = data?.ivRankState;
  const trend = data?.ivTrend;
  const skew = data?.skew;
  const term = data?.termStructure;

  return (
    <div style={{ padding: "0 0 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>VOLATILITY LAB</span>
        <div style={{ display: "flex", gap: 0, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === "Enter") { setSymbol(input); load(input); } }}
            placeholder="AAPL"
            style={{ width: 80, background: C.surface, border: "none", color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 10px", outline: "none" }}
          />
          <button onClick={() => { setSymbol(input); load(input); }}
            style={{ background: C.accent, border: "none", color: "#fff", fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "6px 12px", cursor: "pointer" }}>
            GO
          </button>
        </div>
        {data?.underlying > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.text }}>
            {symbol} @ <span style={{ color: C.accent }}>${data.underlying}</span>
          </span>
        )}
        {loading && <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>⟳ Loading…</span>}
        {error && <span style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>⚠ {error}</span>}
      </div>

      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 12 }}>
          <div style={card}>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 6 }}>REALIZED VOLATILITY</div>
            {row("HV20 (20d)", data.hv20 != null ? `${data.hv20}%` : "—", C.text, "Real annualized stdev of daily log returns, trailing 20 real trading days")}
            {row("HV60 (60d)", data.hv60 != null ? `${data.hv60}%` : "—", C.text, "Real annualized stdev of daily log returns, trailing 60 real trading days")}
            {row("RV10 (10d)", data.rv10 != null ? `${data.rv10}%` : "—", C.text, "Real short-window realized volatility — compare against IV to judge rich/cheap")}
          </div>

          <div style={card}>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 6 }}>IMPLIED VOLATILITY</div>
            {ivRankState?.available ? (
              <>
                {row("IV Rank", `${data.ivRank}`, data.ivRank >= 70 ? C.red : data.ivRank <= 30 ? C.green : C.text,
                  "Real percentile rank of today's ATM IV within its own recent real history")}
                {row("IV Percentile", `${data.ivPercentile}`, C.text)}
                {row("Trend", trend?.available ? `${trend.direction} (${trend.pctChange}%)` : "—", C.textDim,
                  "Real rising/falling/flat read over the last few real daily IV snapshots — not a forecast")}
              </>
            ) : unavailableBlock(ivRankState?.reason || "IV Rank building — not enough real history yet.")}
          </div>

          <div style={card}>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 6 }}>RECOMMENDATION</div>
            <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: data.recommendation === "Sell Premium" ? C.red : data.recommendation === "Buy Premium" ? C.green : C.textDim, marginBottom: 4 }}>
              {data.recommendation}
            </div>
            <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, lineHeight: 1.4 }}>
              Deterministic threshold off real IV Rank: ≥70 favors selling premium, ≤30 favors buying premium.
            </div>
          </div>

          <div style={card}>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 6 }}>VOLATILITY SKEW (25-DELTA)</div>
            {skew?.available ? (
              <>
                {row("Put IV", `${skew.putIv}% @ $${skew.putStrike}`, C.red)}
                {row("Call IV", `${skew.callIv}% @ $${skew.callStrike}`, C.green)}
                {row("Skew (Put − Call)", `${skew.skew > 0 ? "+" : ""}${skew.skew}`, skew.skew > 3 ? C.red : skew.skew < -3 ? C.green : C.textDim)}
                <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginTop: 4 }}>{skew.label}</div>
              </>
            ) : unavailableBlock(skew?.reason)}
          </div>

          <div style={{ ...card, gridColumn: "span 2" }}>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 6 }}>IV TERM STRUCTURE</div>
            {term?.available ? (
              <>
                <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 6 }}>{term.structure}</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["EXPIRY", "DTE", "ATM IV"].map(h => (
                          <th key={h} style={{ padding: "6px 10px", fontFamily: MONO, fontSize: 11, color: C.textDim, textAlign: "right", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {term.points.map(p => (
                        <tr key={p.expiry}>
                          <td style={{ padding: "5px 10px", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text, textAlign: "right", borderBottom: `1px solid ${C.border}33` }}>{p.expiry}</td>
                          <td style={{ padding: "5px 10px", fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "right", borderBottom: `1px solid ${C.border}33` }}>{p.dte ?? "—"}</td>
                          <td style={{ padding: "5px 10px", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.accent, textAlign: "right", borderBottom: `1px solid ${C.border}33` }}>{p.atmIv}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : unavailableBlock(term?.reason)}
          </div>
        </div>
      )}
    </div>
  );
}
