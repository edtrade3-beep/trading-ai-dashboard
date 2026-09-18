import { useEffect, useState } from "react";

// ValuationCard.jsx (2026-09-17, "VALUATION ENGINE" master prompt) —
// "Inside each stock's main Trade Desk card add one compact section...
// Default view should show only: VALUATION 84 / STRONGLY UNDERVALUED /
// Trend ↑ Improving / Value Trap: Low. Add: View Valuation Details."
// Real, self-fetching (GET /api/market/valuation?symbol=X —
// src/valuation-engine.js, the one canonical valuation authority; never
// a second formula computed here). Collapsed by default per the prompt's
// own explicit "keep Trade Desk visually simple" rule.
const LEVEL_COLOR = {
  "EXCEPTIONAL VALUE": "green", "STRONGLY UNDERVALUED": "green", "UNDERVALUED": "green", "SLIGHTLY UNDERVALUED": "green",
  "FAIR VALUE": "textDim", "EXPENSIVE": "amber", "VERY EXPENSIVE": "red", "EXTREME VALUATION RISK": "red",
};
const TRAP_COLOR = { LOW: "green", MODERATE: "amber", HIGH: "red", EXTREME: "red" };
const TREND_ARROW = { IMPROVING: "↑", STABLE: "→", DETERIORATING: "↓" };
const TREND_COLOR = { IMPROVING: "green", STABLE: "textDim", DETERIORATING: "red" };

function na(v, suffix = "") { return v == null ? "N/A" : `${v}${suffix}`; }
function fmtRange(range) { return Array.isArray(range) && Number.isFinite(range[0]) && Number.isFinite(range[1]) ? `$${range[0].toFixed(0)}–$${range[1].toFixed(0)}` : "N/A"; }

export default function ValuationCard({ symbol, C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!symbol) { setData(null); return; }
    let alive = true;
    setData(null); setError(null); setExpanded(false);
    fetch(`/api/market/valuation?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json()).then((d) => {
      if (!alive) return;
      if (d?.ok === false) { setError(d.error || "unavailable"); return; }
      setData(d);
    }).catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [symbol]);

  if (!symbol) return null;
  if (error) return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
      <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginBottom: 4 }}>VALUATION</div>
      <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim }}>{error}</div>
    </div>
  );
  if (!data) return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
      <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginBottom: 4 }}>VALUATION</div>
      <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim }}>Loading real valuation…</div>
    </div>
  );
  if (data.available === false) return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
      <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginBottom: 4 }}>VALUATION</div>
      <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim }}>{data.reason || "No real fundamentals data available."}</div>
    </div>
  );

  const levelColor = C[LEVEL_COLOR[data.valuationLevel]] || C.textDim;
  const trapColor = C[TRAP_COLOR[data.valueTrapLevel]] || C.textDim;
  const trendColor = C[TREND_COLOR[data.valuationTrend]] || C.textDim;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em" }}>VALUATION</span>
        <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: levelColor }}>{na(data.valuationScore)}</span>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 800, color: levelColor, marginBottom: 8 }}>{data.valuationLevel || "N/A"}</div>

      <div style={{ display: "flex", gap: 16, fontFamily: SANS, fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: C.textDim }}>Trend <b style={{ color: trendColor }}>{TREND_ARROW[data.valuationTrend] || ""} {data.valuationTrend || "N/A"}</b></span>
        <span style={{ color: C.textDim }}>Value Trap: <b style={{ color: trapColor }}>{data.valueTrapLevel || "N/A"}</b></span>
      </div>

      <button onClick={() => setExpanded((v) => !v)} style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "6px 0 0", cursor: "pointer" }}>
        {expanded ? "Hide Valuation Details ▲" : "View Valuation Details ▼"}
      </button>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            ["Forward P/E", na(data.forwardPE, "x")],
            ["Trailing P/E", na(data.trailingPE, "x")],
            ["PEG", na(data.peg)],
            ["PEG Status", na(data.pegStatus)],
            ["FCF Yield", na(data.fcfYield, "%")],
            ["FCF Growth", na(data.fcfGrowth, "%")],
            ["Revenue Growth", na(data.latestRevenueGrowth, "%")],
            ["Revenue Trend", na(data.revenueTrend)],
            ["Reported EPS Trend", na(data.reportedEpsGrowthTrend)],
            ["Debt/EBITDA", na(data.netDebtToEbitda, "x")],
            ["Balance Sheet Risk", na(data.balanceSheetRisk)],
            ["GARP", na(data.garpStatus)],
            ["Confidence", na(data.valuationConfidence, "%")],
          ].map(([label, value]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 11.5 }}>
              <span style={{ color: C.textDim }}>{label}</span>
              <span style={{ fontFamily: MONO, fontWeight: 700, color: C.text }}>{value}</span>
            </div>
          ))}

          {data.buyZones && (
            <>
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginTop: 6 }}>BUY PRICE ZONES</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 11.5 }}>
                <span style={{ color: C.textDim }}>Aggressive Buy</span><span style={{ fontFamily: MONO, fontWeight: 700, color: C.green }}>below ${data.buyZones.aggressiveBuyBelow?.toFixed(0) ?? "N/A"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 11.5 }}>
                <span style={{ color: C.textDim }}>Good Buy</span><span style={{ fontFamily: MONO, fontWeight: 700, color: C.text }}>{fmtRange(data.buyZones.goodBuyRange)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 11.5 }}>
                <span style={{ color: C.textDim }}>Fair Value</span><span style={{ fontFamily: MONO, fontWeight: 700, color: C.text }}>{fmtRange(data.buyZones.fairValueRange)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 11.5 }}>
                <span style={{ color: C.textDim }}>Expensive Above</span><span style={{ fontFamily: MONO, fontWeight: 700, color: C.red }}>${data.buyZones.expensiveAbove?.toFixed(0) ?? "N/A"}</span>
              </div>
            </>
          )}

          {data.valueTrapReason && (
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 6, fontStyle: "italic" }}>{data.valueTrapReason}</div>
          )}
          <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.textDim, marginTop: 4 }}>
            Sector/5-year P/E history and analyst EPS-revision history aren't available from this app's real data sources — shown as N/A rather than estimated.
          </div>
        </div>
      )}
    </div>
  );
}
