import { useEffect, useState } from "react";
import { computeKeyLevels } from "./market-helpers.js";

// CommandSearchPanel — Command Center's left column, the real Opportunity
// Inbox (Market Opportunity Engine Phase 1, 2026-08-25 — user's 36-section
// spec §21: "DON'T MAKE ME FIND THE OPPORTUNITY. FIND THE OPPORTUNITY FOR
// ME."). A search box that sets the shared active symbol, plus the real
// 5-tier ACTIONABLE/DEVELOPING/WAIT/EXTENDED/INVALIDATED scan from
// /api/market/opportunities (opportunity-engine.js — wraps am-core-
// engine.js, no second ranking engine). Was a flat Sniper AI list off
// /api/market/sniper-scan; that route/verdict vocabulary is unchanged and
// still powers Sniper Mode (CortexMiniPanel.jsx) — this panel now shows
// the richer tiered read instead of one flat ranking.
//
// ACTIONABLE/DEVELOPING default open (real, usually-small counts — the
// tiers worth a glance every time); WAIT/EXTENDED/INVALIDATED default
// collapsed, since on a real scan day these can be the majority of the
// ~100-symbol universe (spec's own non-negotiable: "never overwhelm with
// alerts" — collapsing the noisy tiers by default is that same principle
// applied to a list, not just push alerts). Each expanded section caps
// at ROW_CAP rows (real, disclosed via a "+N more" line) — never a
// silent truncation.
const TIER_META = {
  actionable: { label: "ACTIONABLE", icon: "🚨", color: "#0d9465", defaultOpen: true },
  developing: { label: "DEVELOPING", icon: "🟢", color: "#4fa87e", defaultOpen: true },
  wait:       { label: "WAIT",       icon: "🟡", color: "#d6a312", defaultOpen: false },
  extended:   { label: "EXTENDED",   icon: "🟠", color: "#e08a1e", defaultOpen: false },
  invalidated:{ label: "INVALIDATED",icon: "🔴", color: "#c8282a", defaultOpen: false },
};
const TIER_ORDER = ["actionable", "developing", "wait", "extended", "invalidated"];
const ROW_CAP = 25;

// Best Opportunity headline (Phase 3, 2026-08-26, spec Parts 38/40/48:
// "the first thing I should see: WHAT DID YOU FIND?"). Zero new signal
// math — a presentation promotion of the exact same real, already-sorted
// tiers this panel already fetches (tier priority, then score, then Edge
// Velocity — routes/market.js's own real sort). INVALIDATED never
// surfaces here (never a "found opportunity"); WAIT/EXTENDED only appear
// if nothing better exists, so the top slot never overstates a symbol
// that isn't actually tradable yet.
const TOP_TIER_ORDER = ["actionable", "developing", "wait", "extended"];
// Exported so TradeDeskTab.jsx's own "default to the real best trade of
// the day" symbol selection uses this EXACT same real ranking (2026-08-30,
// explicit user request: "make trade desk open automatically in best
// trade") — previously that used the older /api/market/sniper-scan's own
// top pick, which could disagree with what this panel visibly labels
// "BEST" on the very same screen. One real ranking, not two.
export function pickTopOpportunities(tiers, n = 3) {
  const flat = [];
  for (const key of TOP_TIER_ORDER) {
    for (const o of tiers[key] || []) flat.push(o);
  }
  return flat.slice(0, n);
}

const fmtPrice = (v) => Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : "—";
const fmtPct = (v) => Number.isFinite(v) ? `${v > 0 ? "+" : ""}${v}%` : "—";

// One-click trade straight from an inbox row (2026-08-25, follow-up to
// "make Trade Desk even easier to trade with" — previously required
// clicking into a symbol, waiting for Sniper Mode to load, then finding
// the Trade Plan card's "Review Trade Plan" button). Only rendered when
// the real Opportunity Object actually carries an executable entry/stop/
// target — same honest gate CortexMiniPanel's Trade Plan card already
// uses, never fabricated for a WAIT/EXTENDED/INVALIDATED row with no
// real entry. Reuses the exact same real shares formula + "open-quick-
// trade" handoff CortexMiniPanel's own button uses, so both paths land
// in the identical confirm-gated Quick Trade flow — no new execution
// path, no auto-fill of a symbol the user didn't pick.
function isTradable(o) {
  return Number.isFinite(o.executableEntry ?? o.entry) && Number.isFinite(o.stop) && Number.isFinite(o.target);
}
function fireQuickTrade(o) {
  const entry = o.executableEntry ?? o.entry;
  const riskPerShare = Math.max(0.01, entry - o.stop);
  const acct = Number(localStorage.getItem("axiom_acct_size")) || 10000;
  const riskPct = Number(localStorage.getItem("axiom_risk_pct")) || 1;
  const shares = riskPerShare > 0 ? Math.floor((acct * riskPct / 100) / riskPerShare) : 0;
  window.dispatchEvent(new CustomEvent("open-quick-trade", { detail: { symbol: o.symbol, shares, stopLoss: o.stop, takeProfit: o.target } }));
}

// Ticker header — name + real 1D/1W/1M % change (2026-08-26, explicit
// user request: "add ticker name and percentage move for the day and
// week and month right under search"). Day/week/month come from `chart`
// (TradeDeskTab's own /api/market/trend-template fetch — buildTrendTemplate's
// real dayChangePct/weekChangePct/monthChangePct, all off the same daily
// bars already loaded for the chart, zero extra fetch here); name comes
// from `symbolQuote` (a small dedicated /api/market/quote fetch, same
// real pattern this file's sibling already uses for the VIX pill). Same
// colored-badge style as MacroTab.jsx's own 1D/1W chips.
function ChangeBadge({ label, pct, C, MONO }) {
  if (!Number.isFinite(pct)) return <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim }}>{label} —</span>;
  const color = pct >= 0 ? "#0d9465" : "#c8282a";
  return <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color }}>{label} {pct >= 0 ? "+" : ""}{pct}%</span>;
}
const fmtLevel = (v) => `$${Number(v).toFixed(2)}`;

// Key Levels card (Trade Desk redesign Phase 1, §12) — real top-3 swing
// highs/lows above/below price (computeKeyLevels, market-helpers.js — the
// SAME real computation TrendChart.jsx now uses for its own R1-R3/S1-S3
// price lines, so this card and the chart never disagree). Nothing new is
// detected here; this is purely a second, list-form presentation of
// already-real chart levels for the left column, per the mockup's own
// "KEY LEVELS" card. computeKeyLevels returns resistance/support nearest-
// first (R1/S1 = closest to price) — resistance is reversed for display so
// the farthest level (R3) renders at the top, price in the middle, nearest
// support (S1) just below it, matching the mockup's visual stack.
export function KeyLevelsCard({ chart, C, MONO, SANS }) {
  if (!chart || !Array.isArray(chart.bars) || !chart.bars.length) return null;
  const lastBar = chart.bars[chart.bars.length - 1];
  const curPrice = Number(chart.livePrice) || Number(chart.price) || (lastBar ? lastBar.close : null);
  if (!Number.isFinite(curPrice)) return null;
  const { resistance, support } = computeKeyLevels(chart.bars, curPrice);
  if (!resistance.length && !support.length) return null;
  const row = (label, value, color) => (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11 }}>
      <span style={{ color: C.textDim }}>{label}</span>
      <b style={{ color }}>{fmtLevel(value)}</b>
    </div>
  );
  return (
    <div style={{ padding: "0 10px 10px", borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 6 }}>📐 KEY LEVELS</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {resistance.map((v, i) => ({ v, label: `R${i + 1}` })).reverse().map(({ v, label }) => row(label, v, "#8b5cf6"))}
        {row("PRICE", curPrice, C.text)}
        {support.map((v, i) => row(`S${i + 1}`, v, "#8b5cf6"))}
      </div>
    </div>
  );
}

// Exported (not just used internally below) so TradeDeskTab.jsx's mobile
// Chart view can mount the identical real header instead of duplicating
// this JSX (explicit user request, 2026-08-26, screenshot of the mobile
// layout: "add in black square area under search" — the empty strip
// between the Search/Chart/Cortex tabs and the VCP toggle on mobile).
const fmtMarketCap = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
};

export function TickerHeader({ symbol, chart, symbolQuote, fundamentals, C, MONO, SANS }) {
  if (!symbol) return null;
  const name = symbolQuote?.name && symbolQuote.name !== symbol ? symbolQuote.name : null;
  return (
    <div style={{ padding: "0 10px 8px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.text }}>{symbol}</span>
        {name && <span style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 3 }}>
        <ChangeBadge label="1D" pct={chart?.dayChangePct} C={C} MONO={MONO} />
        <ChangeBadge label="1W" pct={chart?.weekChangePct} C={C} MONO={MONO} />
        <ChangeBadge label="1M" pct={chart?.monthChangePct} C={C} MONO={MONO} />
      </div>
      {/* 52-week range + volume (Trade Desk redesign Phase 1, §3) — real
          fields already on the trend-template response (hi52/lo52,
          buildTrendTemplate) and the real last daily bar's own volume
          (chart.bars) + volRatio (real ratio vs the 50-day average,
          already computed server-side) — no new fetch, no derived/
          estimated "average volume" number. */}
      {(Number.isFinite(chart?.hi52) || Number.isFinite(chart?.lo52) || Array.isArray(chart?.bars)) && (
        <div style={{ display: "flex", gap: 10, marginTop: 4, fontFamily: MONO, fontSize: 10, color: C.textDim }}>
          {Number.isFinite(chart?.lo52) && Number.isFinite(chart?.hi52) && (
            <span>52W ${chart.lo52.toFixed(2)}–${chart.hi52.toFixed(2)}</span>
          )}
          {Array.isArray(chart?.bars) && chart.bars.length > 0 && (
            <span>VOL {(() => { const v = chart.bars[chart.bars.length - 1].volume; return Number.isFinite(v) ? (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v) : "—"; })()}</span>
          )}
          {Number.isFinite(chart?.volRatio) && <span>RVOL {chart.volRatio}x</span>}
        </div>
      )}
      {/* Beta + market cap (Trade Desk redesign Phase 2, §3) — real fields
          from /api/market/fundamentals, only shown when the real provider
          actually returned them (FMP/stockanalysis.com/Yahoo, in that
          fallback order) — never a fabricated placeholder when a provider
          doesn't carry one (Yahoo's own fundamentals honestly return
          beta: null). */}
      {(Number.isFinite(fundamentals?.beta) || fmtMarketCap(fundamentals?.marketCap)) && (
        <div style={{ display: "flex", gap: 10, marginTop: 4, fontFamily: MONO, fontSize: 10, color: C.textDim }}>
          {fmtMarketCap(fundamentals?.marketCap) && <span>MCAP {fmtMarketCap(fundamentals.marketCap)}</span>}
          {Number.isFinite(fundamentals?.beta) && <span>BETA {fundamentals.beta.toFixed(2)}</span>}
        </div>
      )}
    </div>
  );
}

export default function CommandSearchPanel({ symbol, onSelectSymbol, onOpenDaytrade, chart, symbolQuote, fundamentals, C, MONO, SANS, hideKeyLevels, hideSearch }) {
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(() => Object.fromEntries(TIER_ORDER.map((k) => [k, TIER_META[k].defaultOpen])));

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/market/opportunities").then((res) => res.json());
      if (!r.ok) throw new Error(r.error || "Scan failed");
      setData(r);
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Day Trade Signals (2026-08-26, explicit user request: faster, more
  // frequent trades than this swing-oriented Opportunity Inbox naturally
  // produces — "surface Light Box inside Trade Desk instead of a separate
  // tab"). Real, cheap read of lightbox-state-store.js's own persisted
  // background 5-min tick (GET /api/market/lightbox never triggers a
  // fresh scan in the request path) — genuinely different real cadence
  // from the daily-bar Opportunity Engine above (Light Box runs on real
  // 15-min bars). Deliberately watchlist-scoped (the route's own default,
  // NOT ?universe=full) — that's the only symbol set the background tick
  // continuously confirms; the full DAYTRADE_UNIVERSE can show a stale/
  // incomplete confirmed state per that route's own disclosed caveat.
  const [lightbox, setLightbox] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const loadLightbox = () => fetch("/api/market/lightbox").then((r) => r.json())
      .then((d) => { if (!cancelled) setLightbox(d && d.ok ? d : null); })
      .catch(() => {});
    loadLightbox();
    const iv = setInterval(loadLightbox, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);
  const buySignals = (lightbox?.rows || []).filter((r) => r.state === "BUY").sort((a, b) => (b.quality || 0) - (a.quality || 0));

  const tiers = data?.tiers || {};
  const counts = data?.counts || {};

  const submitSearch = () => {
    const s = query.trim().toUpperCase().replace(/[^A-Z.]/g, "");
    if (s) { onSelectSymbol(s); setQuery(""); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Search box hidden when hideSearch (Trade Desk redesign Phase 1,
          §2) — the real search now lives in TradeDeskTab.jsx's own top
          header bar, calling the identical onSelectSymbol handler; kept
          here (unhidden) for every other real mount of this panel. */}
      {!hideSearch && (
        <div style={{ padding: "10px 10px 8px" }}>
          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 6 }}>🔎 SEARCH</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); }}
              placeholder="Symbol…"
              style={{ flex: 1, minWidth: 0, border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 6, padding: "7px 9px", fontFamily: MONO, fontSize: 12.5, outline: "none" }}
            />
            <button onClick={submitSearch} style={{ border: "none", background: C.accent, color: "#fff", borderRadius: 6, padding: "0 10px", fontFamily: MONO, fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>GO</button>
          </div>
        </div>
      )}

      <TickerHeader symbol={symbol} chart={chart} symbolQuote={symbolQuote} fundamentals={fundamentals} C={C} MONO={MONO} SANS={SANS} />
      {!hideKeyLevels && <KeyLevelsCard chart={chart} C={C} MONO={MONO} SANS={SANS} />}

      {data?.dataQuality?.stale && (
        <div style={{ margin: "0 10px 8px", padding: "6px 8px", border: "1px solid #d6a31255", background: "#d6a31212", borderRadius: 6, fontFamily: SANS, fontSize: 10.5, color: "#d6a312" }}>
          ⚠ DATA QUALITY WARNING — real market quotes are {data.dataQuality.ageMinutes} min old (expected under {data.dataQuality.staleAfterMinutes} min during market hours). Scores below may be based on stale prices.
        </div>
      )}

      {data && (() => {
        const top = pickTopOpportunities(tiers, 3);
        return (
          <div style={{ padding: "0 10px 10px", borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 6 }}>
              {top.length ? `🔭 I FOUND ${top.length} OPPORTUNIT${top.length === 1 ? "Y" : "IES"}` : "🔭 OPPORTUNITIES"}
            </div>
            {!top.length && (
              <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, padding: "2px 0" }}>No high-quality opportunity right now.</div>
            )}
            {top.map((o, i) => {
              const meta = TIER_META[o.tier.toLowerCase()] || TIER_META.wait;
              return (
                <button
                  key={o.symbol}
                  onClick={() => onSelectSymbol(o.symbol)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", textAlign: "left",
                    background: "transparent", border: "none", padding: "3px 0", fontFamily: MONO, fontSize: 11.5,
                  }}
                >
                  <span>{meta.icon}</span>
                  <b style={{ color: C.text }}>{o.symbol}</b>
                  <span style={{ color: meta.color, fontWeight: 700, fontSize: 10 }}>{meta.label}</span>
                  {o.edgeVelocity?.status === "ACCELERATING" && <span style={{ color: "#0d9465", fontSize: 10 }}>▲</span>}
                  {o.edgeVelocity?.status === "DECAYING" && <span style={{ color: "#c8282a", fontSize: 10 }}>▼</span>}
                  <span style={{ marginLeft: "auto", color: C.textDim, fontSize: 10, fontWeight: 700 }}>{i === 0 ? "BEST" : i === 1 ? "2ND" : "3RD"}</span>
                </button>
              );
            })}
          </div>
        );
      })()}

      {lightbox && (
        <div style={{ padding: "0 10px 10px", borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 6 }}>
            🚦 DAY TRADE{buySignals.length ? ` — ${buySignals.length} BUY` : ""}
          </div>
          {!buySignals.length && (
            <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, padding: "2px 0" }}>
              {lightbox.rows.length ? "No real BUY signals right now." : "Add symbols to your watchlist to see real day-trade signals here."}
            </div>
          )}
          {buySignals.slice(0, 4).map((r) => (
            <button
              key={r.symbol}
              onClick={() => (onOpenDaytrade ? onOpenDaytrade(r.symbol) : onSelectSymbol(r.symbol))}
              title={r.reason || ""}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", textAlign: "left", background: "transparent", border: "none", padding: "3px 0", fontFamily: MONO, fontSize: 11.5 }}
            >
              <span style={{ color: "#0d9465" }}>🟢</span>
              <b style={{ color: C.text }}>{r.symbol}</b>
              <span style={{ color: C.textDim, fontSize: 10 }}>{fmtPrice(r.price)}</span>
              {r.grade && <span style={{ color: C.textDim, fontSize: 10 }}>{r.grade}</span>}
              <span style={{ marginLeft: "auto", color: C.textDim, fontSize: 9.5 }}>15m</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: "4px 10px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.6 }}>OPPORTUNITIES</div>
        <button onClick={load} disabled={loading} title="Refresh Opportunity Engine scan" style={{ border: "none", background: "transparent", color: C.textDim, cursor: loading ? "not-allowed" : "pointer", fontFamily: MONO, fontSize: 11 }}>
          {loading ? "⏳" : "↻"}
        </button>
      </div>

      {error && <div style={{ padding: "0 10px", fontFamily: SANS, fontSize: 11, color: "#c8282a" }}>{error}</div>}
      {loading && !data && <div style={{ padding: "12px 10px", fontFamily: SANS, fontSize: 11, color: C.textDim }}>Scanning…</div>}

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
        {data && TIER_ORDER.map((key) => {
          const meta = TIER_META[key];
          const rows = tiers[key] || [];
          const count = counts[key] ?? rows.length;
          const isOpen = open[key];
          return (
            <div key={key}>
              <button
                onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                  background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`,
                  padding: "4px 2px", textAlign: "left",
                }}
              >
                <span style={{ fontFamily: MONO, fontSize: 11 }}>{meta.icon}</span>
                <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: meta.color, letterSpacing: 0.5 }}>{meta.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{count}</span>
                <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, color: C.textDim }}>{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && (
                count === 0 ? (
                  <div style={{ padding: "6px 4px", fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>No real setups in this tier right now.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "4px 0" }}>
                    {rows.slice(0, ROW_CAP).map((o) => {
                      const active = o.symbol === symbol;
                      const tradable = isTradable(o);
                      return (
                        <div
                          key={o.symbol}
                          onClick={() => onSelectSymbol(o.symbol)}
                          title={o.verdictReason || ""}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === "Enter") onSelectSymbol(o.symbol); }}
                          style={{
                            textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 2,
                            background: active ? `${C.accent}14` : C.card,
                            borderTop: `1px solid ${active ? C.accent : meta.color + "33"}`,
                            borderRight: `1px solid ${active ? C.accent : meta.color + "33"}`,
                            borderBottom: `1px solid ${active ? C.accent : meta.color + "33"}`,
                            borderLeft: `3px solid ${meta.color}`, borderRadius: 6, padding: "6px 8px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.text }}>{o.symbol}</span>
                            {o.edgeVelocity?.status === "ACCELERATING" && (
                              <span title={`Edge accelerating +${o.edgeVelocity.velocity} today`} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: "#0d9465" }}>▲</span>
                            )}
                            {o.edgeVelocity?.status === "DECAYING" && (
                              <span title={`Edge decaying ${o.edgeVelocity.velocity} today`} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: "#c8282a" }}>▼</span>
                            )}
                            <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginLeft: "auto" }}>{fmtPrice(o.price)}</span>
                            {tradable && (
                              <button
                                onClick={(e) => { e.stopPropagation(); fireQuickTrade(o); }}
                                title={`Trade ${o.symbol} — entry $${(o.executableEntry ?? o.entry).toFixed(2)} / stop $${o.stop.toFixed(2)} / target $${o.target.toFixed(2)}`}
                                style={{
                                  border: "none", background: C.accent, color: "#fff", borderRadius: 5,
                                  width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                                  fontSize: 11, cursor: "pointer", flexShrink: 0,
                                }}
                              >⚡</button>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 9.5, color: C.textDim }}>
                            <span>SCORE {o.score ?? "—"}</span>
                            <span>WIN {o.probability != null ? `${o.probability}%` : "—"}</span>
                            <span>EV {fmtPct(o.expectedValue)}</span>
                            {o.options?.status === "CONTRADICTS" && <span title={o.options.note} style={{ color: "#c8282a" }}>⚠ OPT</span>}
                          </div>
                        </div>
                      );
                    })}
                    {rows.length > ROW_CAP && (
                      <div style={{ padding: "2px 4px", fontFamily: SANS, fontSize: 10, color: C.textDim }}>+{rows.length - ROW_CAP} more not shown</div>
                    )}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
