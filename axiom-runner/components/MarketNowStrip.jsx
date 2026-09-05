import { useEffect, useState } from "react";

// MarketNowStrip — News Intelligence Engine V1 (2026-09-05, see
// .claude/plans/proud-yawning-unicorn.md). The spec's "open Trade Desk,
// understand the market narrative in seconds" ask, delivered as a
// compact, always-visible line reading the EXISTING scored
// /api/news/feed (src/news/*, already running as a 5-minute background
// job) — not a new feed UI. Click-through opens the existing NEWS dock
// module for the full picture. Renders nothing when there's genuinely no
// high-impact item right now — an honest quiet market, never a
// fabricated "all clear" banner.
const POLL_MS = 5 * 60_000; // matches the ingestion job's own tick cadence — polling faster never surfaces new data anyway

const VERDICT_COLOR = (C, verdict) => {
  if (verdict === "STRONG_BULLISH_CONFIRMATION" || verdict === "BULLISH_CATALYST") return C.green;
  if (verdict === "HIGH_RISK" || verdict === "BEARISH_CATALYST") return C.red;
  if (verdict === "CONFLICTING_SIGNAL") return C.amber;
  return C.textDim; // WATCH / WAIT_FOR_CONFIRMATION
};

export default function MarketNowStrip({ onOpen, C, MONO, SANS }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/news/feed?minImpact=70&limit=3");
        const j = await r.json();
        if (alive && j.ok) setRows(Array.isArray(j.rows) ? j.rows : []);
      } catch {}
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!rows || !rows.length) return null;

  const top = rows[0];
  const divergent = rows.some((r) => r.confirmation?.divergence === "NEWS_PRICE_DIVERGENCE");

  return (
    <div
      onClick={onOpen}
      title="Highest-impact real market news right now — click for the full feed"
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "5px 14px", background: C.surface,
        borderBottom: `1px solid ${C.border}`, cursor: "pointer", overflow: "hidden",
      }}
    >
      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", flexShrink: 0 }}>MARKET NOW</span>
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: VERDICT_COLOR(C, top.verdict), flexShrink: 0 }}>
        {String(top.verdict || top.sentiment || "WATCH").replace(/_/g, " ")}
      </span>
      <span style={{ fontFamily: SANS, fontSize: 11, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
        {top.headline}
      </span>
      {divergent && (
        <span title="Real price action is diverging from at least one headline's sentiment read right now"
          style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.amber, flexShrink: 0 }}>
          ⚠ DIVERGENCE
        </span>
      )}
    </div>
  );
}
