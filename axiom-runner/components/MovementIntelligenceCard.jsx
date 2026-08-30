import { useEffect, useState } from "react";
import { rankMoveDrivers, STOCK_TO_SECTOR, SECTOR_ETFS } from "./market-helpers.js";

const STRENGTH_COLOR = { HIGH: "#c8282a", MEDIUM: "#d6a312", LOW: "#7a8699" };

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

  const chgRow = (label, v) => (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11 }}>
      <span style={{ color: C.textDim }}>{label}</span>
      <b style={{ color: Number.isFinite(v) ? (v > 0 ? "#0d9465" : v < 0 ? "#c8282a" : C.text) : C.textDim }}>
        {Number.isFinite(v) ? `${v > 0 ? "+" : ""}${v}%` : "—"}
      </b>
    </div>
  );

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", background: C.card }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 8 }}>📊 AI MOVEMENT ANALYSIS — {symbol}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
        {chgRow("TODAY", chart.dayChangePct)}
        {chgRow("1W", chart.weekChangePct)}
        {chgRow("1M", chart.monthChangePct)}
      </div>
      {classification !== "UNKNOWN" && (
        <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: C.accent, marginBottom: 8 }}>
          {classification === "COMPANY_SPECIFIC" ? "COMPANY-SPECIFIC MOVEMENT" : "MARKET-WIDE MOVEMENT"}
        </div>
      )}
      {drivers.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {drivers.map((d, i) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 11, color: C.textSec }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, width: 14 }}>{i + 1}.</span>
              <span style={{ flex: 1 }}>{d.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: STRENGTH_COLOR[d.strength] }}>{d.strength}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>No real distinguishing driver found — an unremarkable move today.</div>
      )}
    </div>
  );
}
