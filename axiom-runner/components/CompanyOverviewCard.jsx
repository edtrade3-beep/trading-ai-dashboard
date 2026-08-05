import { useState, useEffect } from "react";

// Company Overview + Last Earnings — Chart page, right underneath the
// ticker/price hero (2026-08-05, explicit user request: "everything i need
// to know about company and last earning right underneath ticker and price
// and deep dive about company"). Real data only: /api/market/company-
// overview reuses the same real fundamentals chain (FMP -> stockanalysis.com
// -> Yahoo) already powering /api/market/fundamentals, plus a real
// last-reported-quarter earnings result (FMP-only, honest "—" without a key
// — no guessed EPS/beat-miss). Deep Dive (description/margins/growth/
// analyst breakdown) collapsed by default, same established pattern as AI
// Summary's Supporting Detail and Smart Money's Advanced Analysis.
const fmtCap = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v}`;
};
const fmtNum = (n, digits = 2) => (Number.isFinite(Number(n)) ? Number(n).toFixed(digits) : "—");
const fmtPct = (n, digits = 1) => (Number.isFinite(Number(n)) ? `${Number(n) >= 0 ? "+" : ""}${(Number(n) * 100).toFixed(digits)}%` : "—");

export default function CompanyOverviewCard({ symbol, C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDeepDive, setShowDeepDive] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true); setData(null);
    fetch(`/api/market/company-overview?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((d) => setData(d?.ok ? d : null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [symbol]);

  const f = data?.fundamentals;
  const le = data?.lastEarnings;

  const stat = (label, val, color, title) => (
    <div title={title} style={{ minWidth: 90 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: color || C.text, marginTop: 2 }}>{val}</div>
    </div>
  );

  const resultColor = le?.result === "BEAT" ? C.green : le?.result === "MISS" ? C.red : le?.result === "INLINE" ? C.amber : C.textDim;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 10 }}>COMPANY OVERVIEW</div>

      {loading && <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>⟳ Loading real company data…</div>}

      {!loading && f && (
        <>
          <div style={{ display: "flex", gap: 22, rowGap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            {stat("SECTOR", f.sector || "—", C.text)}
            {stat("INDUSTRY", f.industry || "—", C.text)}
            {stat("MARKET CAP", fmtCap(f.marketCap), C.text)}
            {stat("P/E", fmtNum(f.pe, 1), C.text)}
            {stat("FWD P/E", fmtNum(f.forwardPE, 1), C.text)}
            {stat("BETA", fmtNum(f.beta, 2), C.text)}
            {stat("ANALYST TARGET", f.analystTarget != null ? `$${fmtNum(f.analystTarget)}` : "—", C.accent,
              f.numberOfAnalystOpinions ? `${f.numberOfAnalystOpinions} analysts` : null)}
            {stat("NEXT EARNINGS", f.earningsDate || "—", C.text)}
          </div>

          {/* LAST EARNINGS — real last-reported-quarter actual vs estimate */}
          <div style={{ borderTop: `1px solid ${C.border}55`, paddingTop: 10, marginBottom: 10 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 8 }}>LAST EARNINGS</div>
            {le ? (
              <div style={{ display: "flex", gap: 22, rowGap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {stat("REPORTED", le.date || "—", C.text)}
                {stat("EPS ACTUAL", le.epsActual != null ? `$${fmtNum(le.epsActual)}` : "—", C.text)}
                {stat("EPS EST.", le.epsEstimated != null ? `$${fmtNum(le.epsEstimated)}` : "—", C.textDim)}
                {le.revenueActual != null && stat("REVENUE", fmtCap(le.revenueActual), C.text)}
                {le.result && (
                  <span style={{
                    fontFamily: MONO, fontSize: 11, fontWeight: 900, color: "#fff",
                    background: resultColor, borderRadius: 5, padding: "3px 10px",
                  }}>
                    {le.result}{le.surprisePercent != null ? ` ${le.surprisePercent >= 0 ? "+" : ""}${le.surprisePercent}%` : ""}
                  </span>
                )}
              </div>
            ) : (
              <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim }} title="Requires an FMP API key for real quarterly earnings-surprise data">
                Real earnings-surprise data unavailable — add an FMP key for last-quarter actual vs. estimate.
              </div>
            )}
          </div>

          {/* Deep Dive — collapsed by default, same pattern as AI Summary's
              Supporting Detail / Smart Money's Advanced Analysis. */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <button onClick={() => setShowDeepDive((v) => !v)}
              style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.accent, background: "transparent", border: `1px solid ${C.accent}55`, borderRadius: 6, padding: "3px 9px", cursor: "pointer" }}>
              {showDeepDive ? "Hide Deep Dive ▴" : "Deep Dive ▾"}
            </button>
          </div>

          {showDeepDive && (
            <div style={{ marginTop: 12 }}>
              {f.description && (
                <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.textSec, lineHeight: 1.6, marginBottom: 14 }}>{f.description}</div>
              )}
              <div style={{ display: "flex", gap: 22, rowGap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                {stat("GROSS MARGIN", fmtPct(f.grossMargin), C.text)}
                {stat("PROFIT MARGIN", fmtPct(f.profitMargin), C.text)}
                {stat("ROE", fmtPct(f.roe), C.text)}
                {stat("REVENUE GROWTH", fmtPct(f.revenueGrowth), f.revenueGrowth > 0 ? C.green : f.revenueGrowth < 0 ? C.red : C.text)}
                {stat("EARNINGS GROWTH", fmtPct(f.earningsGrowth), f.earningsGrowth > 0 ? C.green : f.earningsGrowth < 0 ? C.red : C.text)}
                {stat("DIVIDEND YIELD", fmtPct(f.dividendYield), C.text)}
              </div>
              {(f.analystStrongBuy != null || f.analystBuy != null) && (
                <div style={{ display: "flex", gap: 22, rowGap: 10, flexWrap: "wrap" }}>
                  {stat("STRONG BUY", f.analystStrongBuy ?? "—", C.green)}
                  {stat("BUY", f.analystBuy ?? "—", C.green)}
                  {stat("HOLD", f.analystHold ?? "—", C.amber)}
                  {stat("SELL", f.analystSell ?? "—", C.red)}
                  {stat("STRONG SELL", f.analystStrongSell ?? "—", C.red)}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!loading && !f && (
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>No real company data available for {symbol}.</div>
      )}
    </div>
  );
}
