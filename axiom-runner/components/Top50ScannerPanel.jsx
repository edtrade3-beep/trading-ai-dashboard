import { useEffect, useState } from "react";

// Top50ScannerPanel.jsx (2026-09-16, "Build Telegram Alerts for the AI
// Top 50 Scanner" master prompt) — "AI Trade Desk should show only the
// Top 5 by default... Add VIEW ALL 50. Do not create another top-level
// tab." A real, SEPARATE panel from TopOpportunities.jsx (which ranks by
// the existing canonical decision.opportunityScore) — this one ranks by
// the new, disclosed-additive 30/20/20/15/15 EMA/VWAP/MACD/RSI/RVOL score
// (src/top50-scanner-score.js), shown with its own distinct READY/WAIT/
// SETTING UP/WATCH vocabulary so the two real scores are never visually
// conflated as the same number. GET /api/market/top50-scanner, same real
// canonical scan every other Trade Desk surface reads — no client-side
// scoring, this component only presents server-computed fields.
const POLL_MS = 60_000;

const STATUS_COLOR_KEY = { READY: "green", "SETTING UP": "amber", WATCH: "amber", WAIT: "textDim" };
// "What Price to Pay" (2026-09-16) — a real, separate status ladder from
// executionStatus above (score-based vs. price-zone-based, deliberately
// never conflated — see src/what-to-pay.js's own header). Reused here so
// the 50-stock watchlist satisfies "CURRENT PRICE -> WHAT TO PAY ->
// DISTANCE -> STATUS ... without opening individual stock pages."
const PRICE_STATUS_COLOR = {
  "ENTRY CONFIRMED": "green", "STRONG BUY ZONE": "amber", "IN BUY ZONE": "amber",
  "APPROACHING BUY ZONE": "amber", "WAIT FOR PRICE": "textDim", "EXTENDED — DON'T CHASE": "red",
};

function money(v) { return Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : "—"; }

export default function Top50ScannerPanel({ onSelectSymbol, C, MONO, SANS }) {
  const [top5, setTop5] = useState(null);
  const [all50, setAll50] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState(null);
  // sortBy toggle (2026-09-16, "Add sorting based on opportunity
  // proximity... CLOSEST TO BUY ZONE") — real server-side sort
  // (scanTop50's own real quality-floor-then-distance order), never a
  // client-side re-sort of already-fetched rows.
  const [sortBy, setSortBy] = useState("score");

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch(`/api/market/top50-scanner?limit=5&sortBy=${sortBy}`).then((r) => r.json()).then((d) => {
        if (!alive) return;
        if (d?.ok === false) { setError(d.error || "unavailable"); return; }
        setTop5(d?.symbols || []);
        setError(null);
      }).catch((err) => { if (alive) setError(err.message); });
    };
    load();
    const iv = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, [sortBy]);

  useEffect(() => { setAll50(null); }, [sortBy]); // real sort change invalidates the already-fetched full 50, re-fetch on next expand

  const viewAll = () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (all50) return; // already fetched once this mount, don't re-fetch on every toggle
    setLoadingAll(true);
    fetch(`/api/market/top50-scanner?limit=50&sortBy=${sortBy}`).then((r) => r.json()).then((d) => {
      setAll50(d?.ok !== false ? (d?.symbols || []) : []);
    }).catch(() => setAll50([])).finally(() => setLoadingAll(false));
  };

  const rows = expanded ? all50 : top5;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: C.textDim }}>AI TOP {expanded ? "50" : "5"} SCANNER</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setSortBy((s) => (s === "distance" ? "score" : "distance"))}
            title="Sort by real proximity to the WHAT TO PAY zone (quality-floored — a weak setup never outranks a strong one purely for being close)"
            style={{ border: `1px solid ${sortBy === "distance" ? C.accent : C.border}`, background: sortBy === "distance" ? `${C.accent}18` : "transparent", color: sortBy === "distance" ? C.accent : C.textSec, borderRadius: 6, padding: "3px 8px", fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
          >
            CLOSEST TO BUY ZONE
          </button>
          <button
            onClick={viewAll}
            style={{ border: `1px solid ${C.border}`, background: "transparent", color: C.accent, borderRadius: 6, padding: "3px 8px", fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
          >
            {expanded ? "SHOW TOP 5" : "VIEW ALL 50"}
          </button>
        </div>
      </div>
      {!top5 && !error && <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim }}>Scanning…</div>}
      {error && <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim }}>No qualified opportunities right now.</div>}
      {loadingAll && expanded && <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim }}>Loading full Top 50…</div>}
      {rows && rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((r, i) => {
            const statusColor = C[STATUS_COLOR_KEY[r.executionStatus]] || C.textSec;
            const wtp = r.whatToPay;
            const priceStatusColor = wtp ? C[PRICE_STATUS_COLOR[wtp.priceStatus]] || C.textSec : C.textDim;
            const distanceLabel = wtp ? (wtp.distancePct > 0 ? `${wtp.distancePct}% away` : "IN ZONE") : "—";
            return (
              <div
                key={r.symbol}
                {...(onSelectSymbol ? { onClick: () => onSelectSymbol(r.symbol), role: "button", tabIndex: 0 } : {})}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 8px", borderRadius: 6, background: C.surface, cursor: onSelectSymbol ? "pointer" : "default", flexWrap: "wrap" }}
              >
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, minWidth: 22 }}>{i + 1}.</div>
                <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: C.text, minWidth: 56 }}>{r.symbol}</div>
                <div style={{ fontFamily: MONO, fontSize: 13, color: C.textSec, minWidth: 68 }}>{money(r.price)}</div>
                <div style={{ fontFamily: MONO, fontSize: 13, color: C.textSec, minWidth: 80 }}>{r.top50Score}/100</div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: r.direction === "SHORT" ? C.red : C.green, minWidth: 50 }}>{r.direction}</div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: statusColor, minWidth: 90 }}>{r.executionStatus}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, minWidth: 70 }}>{distanceLabel}</div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: priceStatusColor, minWidth: 130 }}>{wtp?.priceStatus || "—"}</div>
              </div>
            );
          })}
        </div>
      )}
      {rows && rows.length === 0 && !error && <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim }}>No qualified opportunities right now.</div>}
    </div>
  );
}
