import { useEffect, useState } from "react";
import { sectionLabelStyle } from "./ui-atoms.jsx";

// MarketCommandCenter — A+ Market Intelligence V1.1 (2026-09-05, see
// .claude/plans/proud-yawning-unicorn.md). Replaces MarketNowStrip.jsx
// at the same Trade Desk mount point: same compact, always-visible
// collapsed line by default (regime + top headline), now with a
// click-to-expand section for the fuller Command Center read — pressure/
// confidence/top drivers, strongest/weakest sector, next earnings
// catalyst (+ expectation gap when available), and a risk-level read.
// One fetch to the new GET /api/market/command-center (src/market-
// command-center.js, a real aggregator over already-existing engines) —
// not two separate polls the way the old strip's news-feed-only fetch
// was heading toward once this panel needed more than a headline.
// Renders nothing when the backend has nothing real to show yet
// (never a fabricated "all clear" banner).
const POLL_MS = 5 * 60_000; // matches the news ingestion job's own tick cadence

const VERDICT_COLOR = (C, verdict) => {
  if (verdict === "STRONG_BULLISH_CONFIRMATION" || verdict === "BULLISH_CATALYST") return C.green;
  if (verdict === "HIGH_RISK" || verdict === "BEARISH_CATALYST") return C.red;
  if (verdict === "CONFLICTING_SIGNAL") return C.amber;
  return C.textDim;
};
const REGIME_COLOR = (C, regime) => {
  if (regime === "RISK_ON" || regime === "SELECTIVE_RISK_ON") return C.green;
  if (regime === "RISK_OFF" || regime === "CRISIS") return C.red;
  return C.textDim; // NEUTRAL
};
const RISK_COLOR = (C, level) => {
  if (level === "LOW" || level === "NORMAL") return C.green;
  if (level === "ELEVATED") return C.amber;
  if (level === "HIGH" || level === "EXTREME") return C.red;
  return C.textDim;
};
const REJECTION_LABEL_TEXT = {
  BEARISH_NEWS_REJECTED: "⚠ MARKET REJECTING BEARISH NEWS",
  BULLISH_NEWS_REJECTED: "⚠ MARKET REJECTING BULLISH NEWS",
};

function Row({ label, children, C, MONO }) {
  return (
    <div style={{ display: "flex", gap: 8, fontFamily: MONO, fontSize: 11 }}>
      <span style={{ color: C.textDim, minWidth: 130, flexShrink: 0 }}>{label}</span>
      <span style={{ color: C.text }}>{children}</span>
    </div>
  );
}

export default function MarketCommandCenter({ onOpenNews, C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/market/command-center");
        const j = await r.json();
        if (alive && j.ok) setData(j);
      } catch {}
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!data) return null;
  const { regime, pressure, sectorRotation, topNews, topDivergence, nextCatalyst, expectationGap, riskLevel } = data;
  if (!topNews && !regime?.regime) return null; // honest nothing-to-show yet, never a fabricated "all clear"

  return (
    <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
      <div
        onClick={() => setExpanded((v) => !v)}
        title="Market Command Center — click to expand"
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 14px", cursor: "pointer", overflow: "hidden" }}
      >
        <span style={sectionLabelStyle({ flexShrink: 0 })}>{expanded ? "▾" : "▸"} MARKET NOW</span>
        {regime?.regime && (
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: REGIME_COLOR(C, regime.regime), flexShrink: 0 }}>
            {String(regime.regime).replace(/_/g, " ")}
          </span>
        )}
        {topNews && (
          <>
            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: VERDICT_COLOR(C, topNews.verdict), flexShrink: 0 }}>
              {String(topNews.verdict || "WATCH").replace(/_/g, " ")}
            </span>
            <span style={{ fontFamily: SANS, fontSize: 11, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
              {topNews.headline}
            </span>
          </>
        )}
        {topDivergence?.rejectionLabel && (
          <span title={topDivergence.divergenceReason} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.amber, flexShrink: 0 }}>
            {REJECTION_LABEL_TEXT[topDivergence.rejectionLabel] || "⚠ DIVERGENCE"}
          </span>
        )}
      </div>

      {expanded && (
        <div style={{ padding: "8px 14px 12px", borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 5 }}>
          {pressure && pressure.score != null && (
            <Row label="MARKET PRESSURE" C={C} MONO={MONO}>
              <b style={{ color: pressure.score > 15 ? C.green : pressure.score < -15 ? C.red : C.textDim }}>
                {pressure.score > 0 ? "BULLISH" : pressure.score < 0 ? "BEARISH" : "NEUTRAL"} {Math.abs(pressure.score)}/100
              </b>
              {" · confidence "}{pressure.confidence}%
              {pressure.drivers?.length ? ` · ${pressure.drivers.join(" · ")}` : ""}
            </Row>
          )}
          {sectorRotation?.topSector && (
            <Row label="STRONGEST SECTOR" C={C} MONO={MONO}>
              <b style={{ color: C.green }}>{sectorRotation.topSector.name || sectorRotation.topSector.sym}</b>
            </Row>
          )}
          {sectorRotation?.weakestSector && (
            <Row label="WEAKEST SECTOR" C={C} MONO={MONO}>
              <b style={{ color: C.red }}>{sectorRotation.weakestSector.name || sectorRotation.weakestSector.sym}</b>
            </Row>
          )}
          {nextCatalyst && (
            <Row label="NEXT CATALYST" C={C} MONO={MONO}>
              {nextCatalyst.symbol} earnings — {Math.round(nextCatalyst.dte * 10) / 10}d ({nextCatalyst.timing})
            </Row>
          )}
          {expectationGap && (
            <Row label="RECENT EARNINGS" C={C} MONO={MONO}>
              {expectationGap.symbol}: EPS {expectationGap.epsActual ?? "—"} vs. est {expectationGap.epsEstimated ?? "—"}
              {expectationGap.result && (
                <b style={{ marginLeft: 6, color: expectationGap.result === "BEAT" ? C.green : expectationGap.result === "MISS" ? C.red : C.textDim }}>
                  {expectationGap.result}
                </b>
              )}
            </Row>
          )}
          {riskLevel?.level && (
            <Row label="RISK" C={C} MONO={MONO}>
              <b style={{ color: RISK_COLOR(C, riskLevel.level) }}>{riskLevel.level}</b>
              <span style={{ color: C.textDim, fontFamily: SANS, marginLeft: 6 }}>{riskLevel.reason}</span>
            </Row>
          )}
          {topDivergence && (
            <Row label="BIGGEST DIVERGENCE" C={C} MONO={MONO}>
              {topDivergence.ticker} — {topDivergence.headline}
            </Row>
          )}
          <div onClick={onOpenNews} style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.accent || C.text, cursor: "pointer", marginTop: 2 }}>
            OPEN FULL NEWS FEED →
          </div>
        </div>
      )}
    </div>
  );
}
