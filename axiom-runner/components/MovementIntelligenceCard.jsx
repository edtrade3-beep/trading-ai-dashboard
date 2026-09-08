import { useEffect, useState } from "react";
import { rankMoveDrivers, STOCK_TO_SECTOR, SECTOR_ETFS } from "./market-helpers.js";

// LOW bumped from #7a8699 (2026-09-07 contrast audit: measured 4.2:1 on
// this card's real background, below the 4.5:1 normal-text minimum) to a
// real, measured 5.9:1.
const STRENGTH_COLOR = { HIGH: "#c8282a", MEDIUM: "#d6a312", LOW: "#94a1b0" };

// MovementIntelligenceCard — Trade Desk redesign Phase 1, §9 ("WHY IS THIS
// STOCK MOVING?"). Real day/week/month % change already on the chart
// response (buildTrendTemplate), real SPY/QQQ/sector % change already
// polled app-wide (macroData/sectorData props — no new fetch for those),
// plus one small real news-sentiment tally fetch
// (GET /api/news/ticker/:symbol, the same real aggregation
// CortexMiniPanel.jsx already uses). rankMoveDrivers (market-helpers.js)
// combines these into a ranked, disclosed-rule driver list — no new score,
// no invented driver.
export default function MovementIntelligenceCard({ symbol, chart, macroData, sectorData, C, MONO, SANS }) {
  const [news, setNews] = useState(null);
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    fetch(`/api/news/ticker/${encodeURIComponent(symbol)}`).then((r) => r.json())
      .then((d) => { if (!cancelled && d?.ok) setNews(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [symbol]);

  if (!symbol || !chart) return null;

  const find = (sym) => (macroData || []).find((m) => (m.symbol || "").toUpperCase() === sym);
  const spyPct = Number(find("SPY")?.changesPercentage);
  const qqqPct = Number(find("QQQ")?.changesPercentage);
  const sectorEtf = STOCK_TO_SECTOR[symbol];
  const sectorRow = sectorEtf ? (sectorData || []).find((s) => (s.symbol || "").toUpperCase() === sectorEtf) : null;
  const sectorPct = Number(sectorRow?.changesPercentage);
  const sectorLabel = SECTOR_ETFS.find((s) => s.symbol === sectorEtf)?.name;

  const { drivers, classification } = rankMoveDrivers({
    dayChangePct: chart.dayChangePct, spyChangePct: spyPct, qqqChangePct: qqqPct,
    sectorChangePct: sectorPct, sectorLabel, newsBullish: news?.bullish, newsBearish: news?.bearish,
  });

  // Readability pass (2026-09-07, live user report: "gray colors letter
  // hurting my eyes") — this Workspace Grid card still used the pre-
  // redesign 9-11px/textDim convention (TradeGpsCard's own redesign
  // earlier this session never touched these secondary cards). Bumped to
  // a genuinely readable secondary tier (13-14px, textSec for labels)
  // — smaller than the primary verdict card by design, but no longer
  // sub-11px.
  const chgRow = (label, v) => (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 14 }}>
      <span style={{ color: C.textSec }}>{label}</span>
      <b style={{ color: Number.isFinite(v) ? (v > 0 ? "#0d9465" : v < 0 ? "#c8282a" : C.text) : C.textSec }}>
        {Number.isFinite(v) ? `${v > 0 ? "+" : ""}${v}%` : "—"}
      </b>
    </div>
  );

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", background: C.card }}>
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.textSec, letterSpacing: 0.6, marginBottom: 10 }}>📊 AI MOVEMENT ANALYSIS — {symbol}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
        {chgRow("TODAY", chart.dayChangePct)}
        {chgRow("1W", chart.weekChangePct)}
        {chgRow("1M", chart.monthChangePct)}
      </div>
      {classification !== "UNKNOWN" && (
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, marginBottom: 10 }}>
          {classification === "COMPANY_SPECIFIC" ? "COMPANY-SPECIFIC MOVEMENT" : "MARKET-WIDE MOVEMENT"}
        </div>
      )}
      {drivers.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {drivers.map((d, i) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 14, color: C.text }}>
              <span style={{ fontFamily: MONO, fontSize: 13, color: C.textSec, width: 14 }}>{i + 1}.</span>
              <span style={{ flex: 1 }}>{d.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: STRENGTH_COLOR[d.strength] }}>{d.strength}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontFamily: SANS, fontSize: 13, color: C.textSec }}>No real distinguishing driver found — an unremarkable move today.</div>
      )}
    </div>
  );
}
