import { useEffect, useState } from "react";

// ValuationCard.jsx (2026-09-17, "VALUATION ENGINE" master prompt;
// extended 2026-09-19, "Valuation Engine inside AI Trade Desk" follow-up
// — Company Quality / Valuation / Entry Quality as three separate real
// scores, a real WHY explanation, a real warning-flags list, and a
// simplified FINAL VALUATION STATE) — "Inside each stock's main Trade
// Desk card add one compact section... the trader should understand the
// valuation situation in under 10 seconds." Real, self-fetching (GET
// /api/market/valuation?symbol=X — src/valuation-engine.js, the one
// canonical valuation authority, now also computing companyQualityScore/
// finalValuationState/warningFlags/whyText; entryQualityScore comes from
// the SEPARATE canonical technical pipeline via the already-cached GET
// /api/market/what-to-pay?symbol=X — valuation-engine.js has no
// price-bar/technical inputs, so this is a second, cheap fetch, never a
// duplicated computation: it hits the same 5-min server cache
// WhatToPayCard already warms). Collapsed by default per the prompt's
// own explicit "keep Trade Desk visually simple, no new tab" rule.
const LEVEL_COLOR = {
  "EXCEPTIONAL VALUE": "green", "STRONGLY UNDERVALUED": "green", "UNDERVALUED": "green", "SLIGHTLY UNDERVALUED": "green",
  "FAIR VALUE": "textDim", "EXPENSIVE": "amber", "VERY EXPENSIVE": "red", "EXTREME VALUATION RISK": "red",
};
const TRAP_COLOR = { LOW: "green", MODERATE: "amber", HIGH: "red", EXTREME: "red" };
const TREND_ARROW = { IMPROVING: "↑", STABLE: "→", DETERIORATING: "↓" };
const TREND_COLOR = { IMPROVING: "green", STABLE: "textDim", DETERIORATING: "red" };
const STATE_COLOR = {
  UNDERVALUED: "green", ATTRACTIVE: "green", "FAIRLY VALUED": "textDim",
  EXPENSIVE: "amber", "EXTREMELY EXPENSIVE": "red", "INSUFFICIENT DATA": "textDim",
};
function scoreColor(v) { return v == null ? "textDim" : v >= 70 ? "green" : v >= 45 ? "amber" : "red"; }

function na(v, suffix = "") { return v == null ? "N/A" : `${v}${suffix}`; }
function fmtRange(range) { return Array.isArray(range) && Number.isFinite(range[0]) && Number.isFinite(range[1]) ? `$${range[0].toFixed(0)}–$${range[1].toFixed(0)}` : "N/A"; }

// Compact score chip — one of the three real Company Quality / Valuation
// / Entry Quality scores, same visual language throughout this card.
function ScoreChip({ label, value, C, MONO, SANS }) {
  const color = C[scoreColor(value)] || C.textDim;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: 0 }}>
      <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 900, color }}>{value == null ? "—" : Math.round(value)}</span>
      <span style={{ fontFamily: SANS, fontSize: 9, color: C.textDim, letterSpacing: "0.03em", textAlign: "center" }}>{label}</span>
    </div>
  );
}

export default function ValuationCard({ symbol, C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [entryQualityScore, setEntryQualityScore] = useState(null);

  useEffect(() => {
    if (!symbol) { setData(null); return; }
    let alive = true;
    setData(null); setError(null); setExpanded(false); setEntryQualityScore(null);
    fetch(`/api/market/valuation?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json()).then((d) => {
      if (!alive) return;
      if (d?.ok === false) { setError(d.error || "unavailable"); return; }
      setData(d);
    }).catch((err) => { if (alive) setError(err.message); });
    // Real Entry Quality — a separate real canonical technical score
    // (asset-decision.js's own breakdown.entryQuality), not something
    // valuation-engine.js computes. Fetched independently so a failure
    // here never blocks the real valuation read above.
    fetch(`/api/market/what-to-pay?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json()).then((d) => {
      if (!alive) return;
      if (d?.ok && Number.isFinite(d.entryQualityScore)) setEntryQualityScore(d.entryQualityScore);
    }).catch(() => {});
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
  const stateColor = C[STATE_COLOR[data.finalValuationState]] || C.textDim;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em" }}>VALUATION</span>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: stateColor }}>{data.finalValuationState || "N/A"}</span>
      </div>

      {/* Company Quality / Valuation / Entry Quality — three separate
          real scores, per the spec's own explicit "a company can show
          Company Quality: 91, Valuation: 58, Entry Quality: 42" example.
          Never merged into one number. */}
      <div style={{ display: "flex", gap: 4, padding: "8px 4px", background: `${C.border}22`, borderRadius: 8, marginBottom: 8 }}>
        <ScoreChip label="COMPANY QUALITY" value={data.companyQualityScore} C={C} MONO={MONO} SANS={SANS} />
        <ScoreChip label="VALUATION" value={data.valuationScore} C={C} MONO={MONO} SANS={SANS} />
        <ScoreChip label="ENTRY QUALITY" value={entryQualityScore} C={C} MONO={MONO} SANS={SANS} />
      </div>

      <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 800, color: levelColor, marginBottom: 8 }}>{data.valuationLevel || "N/A"}</div>

      <div style={{ display: "flex", gap: 16, fontFamily: SANS, fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: C.textDim }}>Trend <b style={{ color: trendColor }}>{TREND_ARROW[data.valuationTrend] || ""} {data.valuationTrend || "N/A"}</b></span>
        <span style={{ color: C.textDim }}>Value Trap: <b style={{ color: trapColor }}>{data.valueTrapLevel || "N/A"}</b></span>
      </div>

      {data.whyText && (
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textSec || C.text, marginTop: 6, lineHeight: 1.4 }}>{data.whyText}</div>
      )}

      <button onClick={() => setExpanded((v) => !v)} style={{ background: "none", border: "none", color: C.accent, fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "6px 0 0", cursor: "pointer" }}>
        {expanded ? "Hide Valuation Details ▲" : "View Valuation Details ▼"}
      </button>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
          {Array.isArray(data.warningFlags) && data.warningFlags.length > 0 && (
            <>
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.red, letterSpacing: "0.05em", marginBottom: 2 }}>⚠ WARNING FLAGS</div>
              {data.warningFlags.map((f) => (
                <div key={f.key} style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec || C.text, paddingLeft: 12, position: "relative" }}>
                  <span style={{ position: "absolute", left: 0, color: C.red }}>•</span>{f.label}
                </div>
              ))}
              <div style={{ height: 4 }} />
            </>
          )}
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
