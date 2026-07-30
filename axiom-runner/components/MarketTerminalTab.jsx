import { useState, useEffect, useCallback, useRef } from "react";
import TrendChart from "./TrendChart.jsx";
import TrendSetupPanel from "./TrendSetupPanel.jsx";
import SmartScanPanel from "./SmartScanPanel.jsx";
import {
  EarningsSnapshot, EarningsBars, AiWhyPanel, BullBearPanel, NewsPanel, SectorHeatStrip,
  MarketPulseBar, SentimentRow, MarketNewsWire, AnalystPeerPanel,
  FundamentalsPanel, CompanyProfile, AiPredictPanel, COTPanel,
  PredictionMarkets, SocialFeed, InvestorsPanel, TradeExtrasPanel,
  OptionsFlowPanel,
} from "./terminal-panels.jsx";
// SCORE + real RVOL for the Movers/Watchlist mini-list — explicit user
// request 2026-07-27 ("add score and rvol in list before i click on each
// one"). Watchlist rows previously hardcoded volRatio: null (this list's
// own quote fetch is the fast price-only path, same one that never
// populates avgVolume) and had no score at all. Real trend-screen data,
// same A+ Score used everywhere else this session — additive, not a new
// 4th scoring system.
import {
  computeAPlusScore, computeRegime, computePrediction, STOCK_TO_SECTOR, SECTOR_ETFS,
  computeInstitutionalGrade, institutionalLetterGrade, institutionalRecommendation, winProbFor, computeBullBearCase,
} from "./market-helpers.js";
import AiScoreExplainer, { AplusBadge, TRADE_SETUP_DIMENSIONS, STOCK_QUALITY_DIMENSIONS, INSTITUTIONAL_GRADE_DIMENSIONS } from "./AiScoreExplainer.jsx";
import { stockQualityBreakdown } from "./rhpro-shared.jsx";

// Combined Market-Terminal page: movers leaderboard on the left, pro chart with
// AI overlays on the right. Click a mover → it loads in the chart.
export default function MarketTerminalTab({ C, MONO, SANS, sectorData, macroData, onDeepDive, setActiveTab }) {
  const [lb, setLb] = useState(null);
  const [view, setView] = useState("moversUp");
  const [sym, setSym] = useState("NVDA");
  const [chart, setChart] = useState(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const [query, setQuery] = useState("");
  const [dTab, setDTab] = useState("chart");   // per-symbol detail tab
  const [chartTf, setChartTf] = useState("1d"); // chart candle granularity, 5m → 1wk
  const [sortBy, setSortBy] = useState("bucket");  // movers sort
  const [source, setSource] = useState("movers");  // movers | watchlist
  const [wlRows, setWlRows] = useState(null);
  // Real "back" navigation (2026-07-28, explicit user request) — any
  // caller that hands off into Market Terminal (Sniper Scanner's 📈 chart
  // button, RotationTab/SectorsTab's CHART button, etc) can set
  // mterminal_back_to to its own real tab id first; read once on mount and
  // clear immediately so a direct visit via the sidebar/palette later
  // never shows a stale back button.
  const BACK_LABELS = { "rhpro-scan": "Sniper Scanner" };
  const [backTo, setBackTo] = useState(null);
  useEffect(() => {
    try {
      const b = localStorage.getItem("mterminal_back_to");
      if (b) { setBackTo(b); localStorage.removeItem("mterminal_back_to"); }
    } catch {}
  }, []);
  useEffect(() => {
    if (source !== "watchlist") return;
    setWlRows(null);
    // localStorage is the durable source (survives Render free-tier redeploys that
    // wipe the server file); merge with whatever the server still has.
    let local = [];
    try { local = JSON.parse(localStorage.getItem("dm_watchlist") || "[]"); } catch {}
    fetch("/api/watchlist").then(r => r.json()).catch(() => ({ symbols: [] })).then(async (d) => {
      const server = Array.isArray(d.symbols) ? d.symbols : [];
      const syms = [...new Set([...local, ...server].map(s => String(s).toUpperCase()))].slice(0, 150);
      if (!syms.length) { setWlRows([]); return; }
      // Fetch quotes in chunks of 40 so a big watchlist doesn't time out one call.
      const out = [];
      for (let i = 0; i < syms.length; i += 40) {
        const chunk = syms.slice(i, i + 40);
        try {
          const q = await fetch("/api/market/quote?symbols=" + encodeURIComponent(chunk.join(","))).then(r => r.json());
          const arr = Array.isArray(q) ? q : (q.quotes || []);
          out.push(...arr.filter(x => typeof x.price === "number")
            .map(x => ({ symbol: String(x.symbol).toUpperCase(), price: x.price, dayPct: Number(x.changesPercentage) || 0, volRatio: null })));
        } catch {}
      }
      setWlRows(out.sort((a, b) => b.dayPct - a.dayPct));
    }).catch(() => setWlRows([]));
  }, [source]);

  useEffect(() => {
    const load = () => fetch("/api/market/leaderboard?n=12").then(r => r.json()).then(setLb).catch(() => {});
    load(); const t = setInterval(load, 90000); return () => clearInterval(t);
  }, []);

  // Real Telegram notification every time a stock chart is actually viewed
  // (2026-07-28, explicit user request) — reuses the same /api/notify
  // endpoint the manual "PUSH" buttons elsewhere (RotationTab/SectorsTab)
  // already use, so it's a real direct send, not subject to the AI-alert
  // daily-info-message budget (a different real gate for a different
  // category of message). firstLoadRef only suppresses the bare default
  // landing (no real handoff, falls back to NVDA) — a genuine handoff into
  // this component's first mount (Sniper Scanner's chart button, Rotation/
  // Sectors' CHART button) still counts as a real click and does notify;
  // see the mount effect below for exactly how.
  //
  // Per-symbol cooldown (2026-07-29, "too many alerts in telegram") — was
  // completely un-throttled, so clicking through timeframe buttons (1D/1W/
  // 1M — loadSym re-runs on each) on the SAME symbol fired a fresh Telegram
  // ping every time, not just on a genuinely new chart. localStorage-backed
  // so it survives a page reload/new tab, not just this component instance.
  const NOTIFY_COOLDOWN_MS = 15 * 60 * 1000; // 15 min
  const firstLoadRef = useRef(true);
  // tf param lets a caller (timeframe buttons) override the current chartTf
  // in the same click that also changes it, avoiding a stale-closure refetch.
  const loadSym = useCallback((s, tf) => {
    const symbol = String(s || "").trim().toUpperCase();
    if (!symbol) return;
    const useTf = tf || chartTf;
    setSym(symbol); setLoadingChart(true);
    fetch(`/api/market/trend-template?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(useTf)}`)
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          setChart(d);
          if (!firstLoadRef.current) {
            let cooldowns = {};
            try { cooldowns = JSON.parse(localStorage.getItem("mterminal_notify_cooldown") || "{}"); } catch {}
            const now = Date.now();
            if (now - (cooldowns[symbol] || 0) >= NOTIFY_COOLDOWN_MS) {
              const chg = Number(d.setup?.abovePivotPct) || 0;
              const msg = `📈 Chart viewed: ${symbol} — $${Number(d.price || 0).toFixed(2)}${d.stage ? ` · ${d.stage}` : ""}${Number.isFinite(chg) && d.setup ? ` · ${chg >= 0 ? "+" : ""}${chg.toFixed(1)}% from pivot` : ""}`;
              fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) }).catch(() => {});
              cooldowns[symbol] = now;
              try { localStorage.setItem("mterminal_notify_cooldown", JSON.stringify(cooldowns)); } catch {}
            }
          }
          firstLoadRef.current = false;
        }
      })
      .catch(() => {})
      .finally(() => setLoadingChart(false));
  }, [chartTf]);
  useEffect(() => {
    let pending = null;
    try { pending = localStorage.getItem("mterminal_load_sym"); if (pending) localStorage.removeItem("mterminal_load_sym"); } catch {}
    // A real handoff (Sniper Scanner's chart button, Rotation/Sectors'
    // CHART button, etc) IS a real "click on a stock chart" and should
    // notify even though it lands on this component's own first mount;
    // only the bare default landing (no handoff, falls back to NVDA) is
    // not a click.
    firstLoadRef.current = !pending;
    loadSym(pending || "NVDA");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live refresh — silently re-pull the loaded symbol every 45s (no spinner, keeps
  // chart zoom) so price + setup stay current during the session.
  useEffect(() => {
    if (!sym) return;
    const t = setInterval(() => {
      fetch(`/api/market/trend-template?symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(chartTf)}`)
        .then(r => r.json()).then(d => { if (d && !d.error) setChart(d); }).catch(() => {});
    }, 45000);
    return () => clearInterval(t);
  }, [sym, chartTf]);

  const setTf = useCallback((tf) => { setChartTf(tf); loadSym(sym, tf); }, [sym, loadSym]);

  // Real "jump to the chart" behavior — user asked for the chart to open
  // "underneath the search" after Movers & Watchlist got moved back above
  // the Chart zone; a full reorder would just re-flip the same back-and-
  // forth preference already reversed once this session, so this scrolls
  // to the existing chart zone instead of moving it. Only wired at the two
  // real user-initiated symbol-load sites (search submit, mover/watchlist
  // row click) — not the initial mount load or the silent 45s refresh, and
  // not the timeframe buttons (user is already looking at the chart then).
  const chartZoneRef = useRef(null);
  const scrollToChart = useCallback(() => {
    chartZoneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Market cap + P/E from fundamentals (Yahoo local / FMP on cloud). Best-effort.
  const [fund, setFund] = useState(null);
  useEffect(() => {
    if (!sym) return;
    setFund(null);
    fetch("/api/market/fundamentals?symbol=" + encodeURIComponent(sym))
      .then(r => r.json()).then(j => setFund(j && !j.error ? j : null)).catch(() => {});
  }, [sym]);

  // Own trend-screen row for the loaded symbol — the Movers/Watchlist
  // termTrendMap below only covers rows currently on screen in that list,
  // but the chart symbol can be anything typed/searched, so it needs its
  // own real fetch to drive the Stock Quality + Trade Setup score chips
  // (2026-07-28, Phase 1 institutional research consolidation).
  const [symTrend, setSymTrend] = useState(null);
  useEffect(() => {
    if (!sym) return;
    setSymTrend(null);
    fetch(`/api/market/trend-screen?symbols=${encodeURIComponent(sym)}`)
      .then(r => r.json())
      .then(j => { const row = (j.results || []).find(r => !r.error); setSymTrend(row || null); })
      .catch(() => {});
  }, [sym]);

  // Real call/put notional summary for the loaded symbol — the one input
  // the new Institutional Grade / AI Score Card (below) needs that isn't
  // already fetched elsewhere on this page. Lightweight (limit=1, only the
  // summary block is used, not the contract list already shown in full on
  // the Options Flow tab). Explicit user request 2026-07-29 ("institutional
  // AI grade") — additive, doesn't touch Stock Quality/Trade Setup scores.
  const [symOptionsFlow, setSymOptionsFlow] = useState(null);
  useEffect(() => {
    if (!sym) return;
    setSymOptionsFlow(null);
    fetch(`/api/market/options-flow?symbols=${encodeURIComponent(sym)}&limit=1`)
      .then(r => r.json())
      .then(j => setSymOptionsFlow(j && !j.error ? j.summary || null : null))
      .catch(() => {});
  }, [sym]);

  // Real forward-return win-probability log — market-wide, fetched once
  // (not per-symbol), same real source RhProScanner already uses.
  const [aplusTrack, setAplusTrack] = useState(null);
  useEffect(() => {
    fetch("/api/market/aplus-track").then(r => r.json()).then(d => { if (d?.ok) setAplusTrack(d); }).catch(() => {});
  }, []);

  const [wlMsg, setWlMsg] = useState("");
  const addToWatchlist = useCallback(() => {
    const s = String(sym || "").trim().toUpperCase();
    if (!s) return;
    // Durable store = localStorage (survives Render redeploys). Also push to the
    // server so the scanner/autopilot sees it (best effort).
    let local = [];
    try { local = JSON.parse(localStorage.getItem("dm_watchlist") || "[]"); } catch {}
    local = local.map(x => String(x).toUpperCase());
    if (local.includes(s)) { setWlMsg(`${s} already on watchlist`); setTimeout(() => setWlMsg(""), 2500); return; }
    const next = [...local, s];
    try { localStorage.setItem("dm_watchlist", JSON.stringify(next)); } catch {}
    setWlMsg(`⭐ Added ${s} to watchlist`); setTimeout(() => setWlMsg(""), 2500);
    fetch("/api/watchlist").then(r => r.json()).then(d => {
      const server = Array.isArray(d.symbols) ? d.symbols.map(x => String(x).toUpperCase()) : [];
      const merged = [...new Set([...server, ...next])];
      return fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: merged }) });
    }).catch(() => {});
  }, [sym]);

  const removeFromWatchlist = useCallback((s) => {
    s = String(s).toUpperCase();
    let local = [];
    try { local = JSON.parse(localStorage.getItem("dm_watchlist") || "[]").map(x => String(x).toUpperCase()); } catch {}
    const next = local.filter(x => x !== s);
    try { localStorage.setItem("dm_watchlist", JSON.stringify(next)); } catch {}
    setWlRows(prev => (prev || []).filter(r => r.symbol !== s));
    fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: next }) }).catch(() => {});
  }, []);

  const VIEWS = [
    { id: "moversUp", label: "Up", icon: "🟢" },
    { id: "moversDown", label: "Down", icon: "🔴" },
    { id: "upOnVolume", label: "Up Vol", icon: "📈" },
    { id: "downOnVolume", label: "Dn Vol", icon: "📉" },
  ];
  const rows = (() => {
    if (source === "watchlist") return wlRows || [];
    const base = (lb && lb[view]) || [];
    if (sortBy === "bucket") return base;
    const s = [...base];
    if (sortBy === "chg") s.sort((a, b) => b.dayPct - a.dayPct);
    else if (sortBy === "vol") s.sort((a, b) => (b.volRatio || 0) - (a.volRatio || 0));
    else if (sortBy === "price") s.sort((a, b) => b.price - a.price);
    return s;
  })();
  // Real trend-screen data for whichever rows are currently shown — A+
  // Score for both movers/watchlist, and the real volRatio fallback for
  // watchlist rows (their own quote fetch never gets one). Re-fetches only
  // when the actual symbol SET changes (order-independent key), not on
  // every render/resort.
  const [termTrendMap, setTermTrendMap] = useState({});
  const rowsSymKey = [...new Set(rows.map(r => r.symbol))].sort().join(",");
  useEffect(() => {
    if (!rowsSymKey) { setTermTrendMap({}); return; }
    fetch(`/api/market/trend-screen?symbols=${encodeURIComponent(rowsSymKey)}`)
      .then(r => r.json())
      .then(j => {
        const map = {};
        (j.results || []).forEach(r => { if (!r.error) map[r.symbol] = r; });
        setTermTrendMap(map);
      })
      .catch(() => {});
  }, [rowsSymKey]);
  const regime = computeRegime(macroData);
  // Sector context for the loaded symbol — real %chg-per-ETF map (same
  // shape stockQualityBreakdown's Sector Strength dimension expects) plus
  // a real rank of that sector among all 11 today, both derived from the
  // sectorData prop already fetched for the Sector Heat Strip, no new call.
  const sectorPerf = {};
  (sectorData || []).forEach(x => { if (x.symbol) sectorPerf[String(x.symbol).toUpperCase()] = Number(x.changesPercentage) || 0; });
  // stockQualityBreakdown's Sector Strength dimension also needs a real SPY
  // %chg to compare the sector against (see rhpro-shared.jsx) — sectorData
  // only carries the 11 sector ETFs, so pull SPY from macroData, already in scope.
  const spyQuote = (macroData || []).find(m => (m.symbol || "").toUpperCase() === "SPY");
  if (spyQuote) sectorPerf.SPY = Number(spyQuote.changesPercentage) || 0;
  const symSectorEtf = STOCK_TO_SECTOR[sym];
  const symSectorInfo = (() => {
    if (!symSectorEtf || !(sectorData || []).length) return null;
    const ranked = [...SECTOR_ETFS].map(se => ({ ...se, chg: sectorPerf[se.symbol] ?? 0 })).sort((a, b) => b.chg - a.chg);
    const rank = ranked.findIndex(se => se.symbol === symSectorEtf) + 1;
    const info = ranked.find(se => se.symbol === symSectorEtf);
    return rank > 0 ? { name: info?.name || symSectorEtf, rank, of: ranked.length, chg: info?.chg } : null;
  })();
  const [explain, setExplain] = useState(null); // { symbol, aplus, dimensions, label } | null

  // AI Score Card — explicit user request 2026-07-29 ("institutional AI
  // grade"). Every field below reuses a real, already-computed value
  // (nothing here is a new fabricated metric): Overall Grade blends real
  // trend/technicals/smart-money/options-flow/fundamentals/macro/sector
  // (computeInstitutionalGrade — additive, does not touch Stock Quality or
  // Trade Setup Score). Confidence/Expected Move reuse the same real
  // computePrediction engine already driving the "Quick Read" card lower on
  // this page. Probability of Success reuses the exact real forward-return
  // win-rate log (aplus-track) RhProScanner already surfaces, honestly gated
  // below its real sample floor. Risk Level reuses the real ATR-based
  // riskPct already computed server-side for every trend-screen row.
  // Holding Time is deliberately NOT included — there's no real per-stock
  // time-to-target dataset in this app to draw it from honestly.
  const institutionalGrade = (symTrend && chart) ? computeInstitutionalGrade(symTrend, chart.technicals, regime, symSectorInfo, symOptionsFlow) : null;
  const prediction = chart ? computePrediction(chart, chart) : null;
  const winProb = (symTrend && aplusTrack) ? winProbFor(aplusTrack, computeAPlusScore(symTrend, regime).score) : null;
  const riskLevel = symTrend?.riskPct != null ? (symTrend.riskPct <= 5 ? "Low" : symTrend.riskPct <= 8 ? "Medium" : "High") : null;

  // Bull Case / Bear Case — free, deterministic (2026-07-29, "use free
  // data": the paid Claude version hit the account's API usage limit, so
  // this replaces it entirely). Splits the real Institutional Grade
  // dimensions by which side of the case they support — zero new fetch,
  // zero API cost, same real reasons already powering the "why?" modal.
  const bullBear = computeBullBearCase(institutionalGrade, INSTITUTIONAL_GRADE_DIMENSIONS);
  const pct = (v) => v == null ? "—" : (v > 0 ? "+" : "") + v.toFixed(2) + "%";
  const col = (v) => v == null ? C.textDim : v > 0 ? "#22d47e" : v < 0 ? "#ef4444" : C.text;
  // Day-change % for the loaded symbol, looked up across all movers buckets.
  const symDayPct = (() => {
    if (!lb) return null;
    for (const k of ["moversUp", "moversDown", "upOnVolume", "downOnVolume"]) {
      const hit = (lb[k] || []).find(r => r.symbol === sym);
      if (hit) return hit.dayPct;
    }
    return null;
  })();

  // Section header — same treatment for all 3 zones on this page (Chart /
  // Movers & Watchlist / Market Snapshot) so a long page reads as clearly
  // delineated zones instead of one undifferentiated scroll.
  const SectionHeader = ({ icon, label }) => (
    <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: 1, color: C.textDim,
      textTransform: "uppercase", paddingBottom: 6, marginBottom: 4, borderBottom: `1px solid ${C.border}` }}>
      {icon} {label}
    </div>
  );

  return (
    <div style={{ width: "100%" }}>
    {backTo && (
      <button onClick={() => setActiveTab && setActiveTab(backTo)}
        style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "7px 14px", marginBottom: 10, borderRadius: 8, cursor: "pointer",
          border: `1px solid ${C.accent}`, background: `${C.accent}14`, color: C.accent }}>
        ← Back to {BACK_LABELS[backTo] || "previous page"}
      </button>
    )}
    {/* Movers/Watchlist on top, chart below — both full-width (stacked,
        not side-by-side) so the chart still keeps the room it earned
        earlier, just second in scroll order now. */}
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── ZONE 1: movers / watchlist / wires — back on top (2026-07-25,
          user request), reversing the earlier "chart takes the big space"
          reorder. Preferences here have changed turn to turn as the user
          looks at the real app; this reflects the current one. ── */}
      <div style={{ width: "100%" }}>
        <SectionHeader icon="🔥" label="Movers & Watchlist" />
        <form onSubmit={(e) => { e.preventDefault(); loadSym(query); setQuery(""); scrollToChart(); }} style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="🔍 Load any symbol…"
            style={{ flex: 1, fontFamily: MONO, fontSize: 13, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text }} />
        </form>
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {[["movers", "🔥 Movers"], ["watchlist", "⭐ My Watchlist"]].map(([id, lbl]) => (
            <button key={id} onClick={() => setSource(id)}
              style={{ flex: 1, fontFamily: SANS, fontSize: 12, fontWeight: 800, padding: "7px 0", borderRadius: 8, cursor: "pointer",
                border: `1px solid ${source === id ? C.accent : C.border}`, background: source === id ? `${C.accent}16` : C.card, color: source === id ? C.accent : C.textDim }}>{lbl}</button>
          ))}
        </div>
        {source === "movers" && (
          <>
            <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
              {VIEWS.map(v => (
                <button key={v.id} onClick={() => setView(v.id)}
                  style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                    border: `1px solid ${view === v.id ? "#22d47e" : C.border}`, background: view === v.id ? "rgba(34,212,126,0.14)" : C.card, color: view === v.id ? "#22d47e" : C.textDim }}>
                  {v.icon} {v.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>SORT</span>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                style={{ fontFamily: MONO, fontSize: 11, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}>
                <option value="bucket">Default (bucket rank)</option>
                <option value="chg">Day % change</option>
                <option value="vol">Volume vs 50d</option>
                <option value="price">Price</option>
              </select>
            </div>
          </>
        )}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: C.card }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.9fr 0.9fr 0.7fr 0.6fr", padding: "8px 12px", background: C.bg, borderBottom: `2px solid ${C.border}`, fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.textDim }}>
            <div>SYMBOL</div><div style={{ textAlign: "right" }}>PRICE</div><div style={{ textAlign: "right" }}>DAY%</div><div style={{ textAlign: "right" }}>RVOL</div><div title="A+ Score — a real 9-dimension composite" style={{ textAlign: "right", cursor: "help" }}>A+</div>
          </div>
          {((source === "movers" && !lb) || (source === "watchlist" && wlRows === null)) && <div style={{ padding: "24px 0", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Loading…</div>}
          {source === "watchlist" && Array.isArray(wlRows) && wlRows.length === 0 && <div style={{ padding: "24px 12px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: C.textDim }}>Your watchlist is empty — add names from any tab.</div>}
          {rows.map((r, i) => {
            // Real RVOL: movers rows already carry a real, server-computed
            // volRatio (leaderboard endpoint); watchlist rows never did
            // (their own quote fetch is the fast price-only path) — same
            // real trend-screen fallback used everywhere else this session.
            const trend = termTrendMap[r.symbol];
            const rvol = r.volRatio != null ? r.volRatio : (trend?.volRatio ?? null);
            const aplus = computeAPlusScore(trend || {}, regime);
            return (
            <div key={r.symbol} onClick={() => { loadSym(r.symbol); scrollToChart(); }}
              style={{ display: "grid", gridTemplateColumns: "1.2fr 0.9fr 0.9fr 0.7fr 0.6fr", padding: "9px 12px", alignItems: "center", cursor: "pointer",
                borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none",
                background: r.symbol === sym ? "rgba(34,212,126,0.10)" : (i % 2 ? "transparent" : "rgba(127,127,127,0.03)") }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 13, color: r.symbol === sym ? "#22d47e" : C.text, overflow: "hidden", textOverflow: "ellipsis" }}>{r.symbol}</span>
                {source === "watchlist" && (
                  <span onClick={(e) => { e.stopPropagation(); removeFromWatchlist(r.symbol); }} title="Remove from watchlist"
                    style={{ cursor: "pointer", color: C.textDim, fontWeight: 800, fontSize: 12, flexShrink: 0, padding: "0 2px" }}>×</span>
                )}
              </div>
              <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.text }}>${r.price.toFixed(2)}</div>
              <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: col(r.dayPct) }}>{pct(r.dayPct)}</div>
              <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: rvol >= 1.5 ? "#f59e0b" : C.textDim }}>
                {rvol == null ? "—" : rvol.toFixed(1) + "×"}
              </div>
              <div style={{ textAlign: "right" }}>
                <span title={aplus.reasons.join(" · ")} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900, color: "#fff", cursor: "help",
                  background: aplus.score >= 80 ? "#0d9465" : aplus.score >= 60 ? "#d6a312" : "#c8282a", borderRadius: 4, padding: "1px 5px" }}>{aplus.score}</span>
              </div>
            </div>
            );
          })}
        </div>
        <MarketNewsWire C={C} MONO={MONO} SANS={SANS} />
        <COTPanel C={C} MONO={MONO} SANS={SANS} />
        <PredictionMarkets C={C} MONO={MONO} SANS={SANS} />
      </div>

      {/* ── ZONE 2: pro chart ── */}
      <div ref={chartZoneRef} style={{ width: "100%" }}>
        <SectionHeader icon="📈" label="Chart" />
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: SANS, fontSize: 24, fontWeight: 900, color: C.text }}>{sym}</span>
          {/* Real company/fund name from the same fundamentals fetch already
              used for Market Cap/P/E above — no new API call. Honest-null:
              some tickers (esp. thin ETFs) never resolve a name from any of
              the 3 fallback providers, so this just doesn't render rather
              than showing the bare symbol twice or a fabricated title. */}
          {fund && fund.name && fund.name !== sym && <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: C.textDim }}>{fund.name}</span>}
          {chart && chart.price != null && <span style={{ fontFamily: MONO, fontSize: 18, color: C.text }}>${chart.price.toFixed(2)}</span>}
          {chart && !loadingChart && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: MONO, fontSize: 10, fontWeight: 700, color: "#0d9465" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#0d9465", display: "inline-block" }} /> LIVE
            </span>
          )}
          {chart && chart.stage && <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{chart.stage}</span>}
          {loadingChart && <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>loading…</span>}
          <button onClick={() => setDTab("smart")} title="Smart Money analysis inline (structure, order blocks, FVGs, AI review)"
            style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 8, cursor: "pointer", marginLeft: "auto",
              border: `1px solid ${C.accent}`, background: dTab === "smart" ? C.accent : `${C.accent}14`, color: dTab === "smart" ? "#fff" : C.accent }}>
            🔬 Smart Scan
          </button>
          <button onClick={addToWatchlist}
            style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 8, cursor: "pointer",
              border: `1px solid #d6a312`, background: "rgba(214,163,18,0.14)", color: "#d6a312" }}>
            ⭐ Add to Watchlist
          </button>
          {wlMsg && <span style={{ fontFamily: MONO, fontSize: 12, color: "#22d47e" }}>{wlMsg}</span>}
        </div>
        {chart && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            {(() => {
              const s = chart, pill = (label, val, col) => (
                <div key={label} style={{ flex: "1 1 120px", minWidth: 110, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px", background: C.card }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: 0.5 }}>{label}</div>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: col || C.text }}>{val}</div>
                </div>
              );
              const num = (v) => (v == null || isNaN(v)) ? null : v;
              const mc = fund && Number(fund.marketCap) > 0 ? Number(fund.marketCap) : null;
              const mcStr = mc == null ? "—" : mc >= 1e12 ? "$" + (mc / 1e12).toFixed(2) + "T" : mc >= 1e9 ? "$" + (mc / 1e9).toFixed(1) + "B" : "$" + (mc / 1e6).toFixed(0) + "M";
              const pe = fund && Number(fund.pe || fund.trailingPE) > 0 ? Number(fund.pe || fund.trailingPE) : null;
              return [
                pill("MARKET CAP", mcStr),
                pill("P/E", pe != null ? pe.toFixed(1) : "—"),
                pill("% TO 52W HIGH", s.pctFromHigh != null ? s.pctFromHigh.toFixed(1) + "%" : "—", s.pctFromHigh != null && s.pctFromHigh > -3 ? "#22d47e" : C.text),
                pill("52W HIGH", num(s.hi52) != null ? "$" + s.hi52.toFixed(2) : "—"),
                pill("52W LOW", num(s.lo52) != null ? "$" + s.lo52.toFixed(2) : "—"),
                pill("RS RATING", num(s.rsRating) != null ? String(s.rsRating) : "—", s.rsRating >= 80 ? "#22d47e" : s.rsRating >= 70 ? "#d6a312" : "#ef4444"),
                pill("VOL vs AVG", num(s.volRatio) != null ? s.volRatio.toFixed(2) + "×" : "—", s.volRatio >= 1.5 ? "#f59e0b" : C.text),
                pill("MOMENTUM", num(s.momentum) != null ? (s.momentum > 0 ? "+" : "") + s.momentum.toFixed(1) + "%" : "—", s.momentum > 0 ? "#22d47e" : "#ef4444"),
              ];
            })()}
          </div>
        )}
        {/* Score + macro/sector context strip — real Stock Quality + Trade
            Setup scores for the loaded symbol (click to see the full real
            breakdown, same AiScoreExplainer used in Sniper Scanner), plus
            the already-computed real market regime and this symbol's real
            sector rank today. Symbol-relative context that previously only
            existed market-wide (2026-07-28, Phase 1 institutional research
            consolidation). Renders once symTrend arrives; no fabricated
            placeholders while loading. */}
        {symTrend && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <AplusBadge C={C} MONO={MONO} aplus={stockQualityBreakdown(symTrend, sectorPerf)}
              onClick={() => setExplain({ symbol: sym, aplus: stockQualityBreakdown(symTrend, sectorPerf), dimensions: STOCK_QUALITY_DIMENSIONS, label: "STOCK QUALITY SCORE" })} />
            <AplusBadge C={C} MONO={MONO} aplus={computeAPlusScore(symTrend, regime)}
              onClick={() => setExplain({ symbol: sym, aplus: computeAPlusScore(symTrend, regime), dimensions: TRADE_SETUP_DIMENSIONS, label: "TRADE SETUP SCORE" })} />
            <span title={(regime.factors || []).map(f => `${f.pass ? "✓" : "✗"} ${f.label}`).join(" · ")}
              style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 7, cursor: "help",
                border: `1px solid ${regime.color}55`, color: regime.color, background: `${regime.color}14` }}>
              {regime.label} ({regime.score}/100)
            </span>
            {symSectorInfo && (
              <span title="Real sector ETF %chg rank today, out of all 11 S&P sectors"
                style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 7,
                  border: `1px solid ${C.border}`, color: symSectorInfo.rank <= 3 ? "#22d47e" : symSectorInfo.rank >= 9 ? "#ef4444" : C.textDim }}>
                {symSectorInfo.name} #{symSectorInfo.rank}/{symSectorInfo.of} ({pct(symSectorInfo.chg)})
              </span>
            )}
          </div>
        )}
        {/* Real technical indicators — ADX (trend strength/direction),
            Donchian Channel (20d), Bollinger Bands (20d) — all computed
            server-side on the same daily bars the chart already fetched
            (chart.technicals, from /api/market/trend-template). Phase 2 of
            the Institutional Research Upgrade (2026-07-29). Each renders
            "—" on its own if that indicator's real function returned null
            (insufficient history), never a guessed number. */}
        {chart && chart.technicals && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            {(() => {
              const t = chart.technicals, pill = (label, val, col, title) => (
                <div key={label} title={title} style={{ flex: "1 1 150px", minWidth: 140, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px", background: C.card, cursor: title ? "help" : "default" }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: 0.5 }}>{label}</div>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: col || C.text }}>{val}</div>
                </div>
              );
              const adx = t.adx, don = t.donchian, bb = t.bollinger;
              const adxCol = !adx ? C.text : adx.strength === "Strong" ? (adx.direction === "Bullish" ? "#22d47e" : "#ef4444") : C.textDim;
              const bbSqueeze = bb && bb.bandwidthPct != null && bb.bandwidthPct < 8;
              return [
                pill("ADX (14d)", adx ? `${adx.adx} · ${adx.strength}` : "—", adxCol, adx ? `+DI ${adx.plusDI} / -DI ${adx.minusDI} — ${adx.direction} trend, ${adx.strength.toLowerCase()}` : "Insufficient history"),
                pill("DONCHIAN (20d)", don ? `${don.pctPosition}% of range` : "—", don ? (don.pctPosition >= 90 ? "#22d47e" : don.pctPosition <= 10 ? "#ef4444" : C.text) : C.text, don ? `Upper $${don.upper} · Lower $${don.lower} — price is ${don.pctPosition}% of the way up the 20-day range` : "Insufficient history"),
                pill("BOLLINGER %B", bb ? `${bb.percentB}%${bbSqueeze ? " · squeeze" : ""}` : "—", bb ? (bb.percentB >= 100 ? "#22d47e" : bb.percentB <= 0 ? "#ef4444" : bbSqueeze ? "#d6a312" : C.text) : C.text, bb ? `Upper $${bb.upper} · Mid $${bb.mid} · Lower $${bb.lower} · Bandwidth ${bb.bandwidthPct}%${bbSqueeze ? " — tight, coiling" : ""}` : "Insufficient history"),
              ];
            })()}
          </div>
        )}
        {/* AI SCORE CARD — explicit user request 2026-07-29 ("institutional
            AI grade"). Overall Grade is the new, additive Institutional
            Grade (computeInstitutionalGrade, market-helpers.js) — Stock
            Quality Score and Trade Setup Score above are untouched.
            Recommendation/stars are a deterministic label on that same real
            score. Confidence and Expected Move reuse the real computePrediction
            engine (same one driving the Quick Read card below). Probability
            of Success reuses the real aplus-track forward-return win-rate
            log, honestly gated below its real sample floor. Risk Level
            reuses the real ATR-based riskPct already on every trend-screen
            row. No fabricated metrics (no DCF, no gamma exposure, no 13F,
            etc — see the plan's "explicitly NOT building" list). */}
        {institutionalGrade && (() => {
          const rec = institutionalRecommendation(institutionalGrade.score);
          const letter = institutionalLetterGrade(institutionalGrade.score);
          const stat = (label, val, col, title) => (
            <div title={title} style={{ minWidth: 110, cursor: title ? "help" : "default" }}>
              <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: col || C.text }}>{val}</div>
            </div>
          );
          const riskCol = riskLevel === "Low" ? "#22d47e" : riskLevel === "Medium" ? "#d6a312" : riskLevel === "High" ? "#ef4444" : C.text;
          return (
            <div style={{ marginBottom: 10, border: `1px solid ${rec.color}55`, borderRadius: 12, padding: "14px 16px", background: `${rec.color}0c` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 900, color: C.text }}>🏛 AI SCORE CARD</div>
                <button onClick={() => setExplain({ symbol: sym, aplus: institutionalGrade, dimensions: INSTITUTIONAL_GRADE_DIMENSIONS, label: "INSTITUTIONAL GRADE" })}
                  title="Click to see the full real breakdown"
                  style={{ display: "inline-flex", alignItems: "baseline", gap: 8, fontFamily: MONO, fontWeight: 900, color: rec.color, background: `${rec.color}18`,
                    border: `1px solid ${rec.color}55`, borderRadius: 8, padding: "4px 12px", cursor: "pointer" }}>
                  <span style={{ fontSize: 20 }}>{letter}</span>
                  <span style={{ fontSize: 13 }}>{institutionalGrade.score}/100</span>
                  <span style={{ fontSize: 11, opacity: 0.85 }}>▸ why?</span>
                </button>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: rec.color }}>
                  {"★".repeat(rec.stars)}{"☆".repeat(5 - rec.stars)} {rec.label}
                </span>
              </div>
              <div style={{ display: "flex", gap: 22, rowGap: 10, flexWrap: "wrap" }}>
                {/* Renamed from bare "CONFIDENCE" (2026-07-29, real
                    user-reported confusion) — read next to PROB. OF SUCCESS
                    as if the two should agree. They measure different real
                    things: this is how sure the prediction engine is in its
                    own directional call; Prob. of Success is the real
                    historical win rate for setups scoring this well. A
                    confident call can still have a middling real track
                    record — that's not a contradiction, it just wasn't
                    labeled clearly enough to tell them apart. */}
                {stat("PREDICTION CONFIDENCE", prediction ? `${prediction.conf}%` : "—", null, prediction ? "How sure the trend/volume/momentum engine is in its own directional call — not the same as Prob. of Success's real historical win rate, and the two can disagree" : null)}
                {stat("EXPECTED MOVE (1WK)", prediction ? `${prediction.movePct >= 0 ? "+" : ""}${prediction.movePct}%` : "—", prediction ? (prediction.movePct > 0 ? "#22d47e" : prediction.movePct < 0 ? "#ef4444" : C.text) : null, prediction ? `Target $${prediction.target} — real, deterministic, trend-template based` : null)}
                {stat("RISK LEVEL", riskLevel || "—", riskLevel ? riskCol : null, symTrend?.riskPct != null ? `${symTrend.riskPct.toFixed(1)}% real ATR-based distance to stop` : null)}
                {stat("PROB. OF SUCCESS", winProb?.winRate != null ? `${winProb.winRate}%` : winProb?.count != null ? `n=${winProb.count} (need ${10})` : "—",
                  winProb?.winRate != null ? (winProb.winRate >= 55 ? "#22d47e" : winProb.winRate >= 45 ? "#d6a312" : "#ef4444") : C.textDim,
                  winProb?.winRate != null ? `Real forward ${winProb.horizon}-day win rate for this Trade Setup Score band, n=${winProb.count} — a different real measurement than Prediction Confidence, the two can disagree` : "Real forward-return log exists but sample is below the honest floor for this score band")}
                {stat("HOLDING TIME", "—", C.textDim, "Not built — no real per-stock time-to-target dataset exists in this app to draw an honest number from")}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: 10, lineHeight: 1.4 }}>
                Prediction Confidence and Prob. of Success measure different things — the model's certainty in its own call vs. the real historical win rate for setups graded this well — and can legitimately disagree. Also see 📊 Trend & Base Rating on the chart below: a different real lens (trend-template/VCP structure) from this card's 7-dimension Institutional Grade — the two can disagree too, that's not a bug.
              </div>
            </div>
          );
        })()}
        {/* ── Per-symbol detail tabs ──
            "Symbol News" not bare "News" — this is a per-symbol detail
            tab, and the Sidebar has its own separate, global "📰 News"
            nav item (different page entirely). Same exact-label-collision
            class already found and fixed once this session in
            XIntelTab.jsx's sub-nav.
            Horizontal-scroll single row, not flexWrap — standardized
            across every tab's internal sub-nav in the 2026-07-22 site
            reorg, same fix already shipped for XIntelTab.jsx after
            flexWrap wrapped into the fixed FAB cluster's screen position
            on mobile there. 9 tabs here is the widest sub-nav in the app,
            so this one benefits most from scrolling instead of wrapping. */}
        <div style={{ display: "flex", gap: 4, margin: "4px 0 12px", flexWrap: "nowrap", overflowX: "auto", scrollbarWidth: "none", borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
          {[["chart", "📈 Chart"], ["smart", "🔬 Smart Scan"], ["flow", "💵 Options Flow"], ["valuation", "📊 Valuation"], ["analysts", "🎯 Analysts"], ["investors", "🏦 Investors"], ["earnings", "💰 Earnings"], ["company", "🏢 Company"], ["social", "💬 Social"], ["news", "📰 Symbol News"]].map(([id, lbl]) => (
            <button key={id} onClick={() => setDTab(id)}
              style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: 7, cursor: "pointer",
                whiteSpace: "nowrap", flexShrink: 0, minHeight: 40,
                border: `1px solid ${dTab === id ? C.accent : "transparent"}`, background: dTab === id ? `${C.accent}16` : "transparent", color: dTab === id ? C.accent : C.textDim }}>
              {lbl}
            </button>
          ))}
        </div>

        {dTab === "chart" && (
          <>
            {/* Candle timeframe — 5 min through weekly. Real Alpaca intraday
                bars under a day, real Yahoo weekly bars for 1W; the daily
                Minervini rating/pivot/stop/target never change with this —
                see the "Rating reflects the daily setup" note on the chart
                for anything other than 1D. */}
            <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
              {[["5m", "5m"], ["15m", "15m"], ["30m", "30m"], ["1h", "1H"], ["1d", "1D"], ["1wk", "1W"]].map(([id, lbl]) => (
                <button key={id} onClick={() => setTf(id)} disabled={loadingChart}
                  style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "5px 12px", borderRadius: 7, cursor: loadingChart ? "default" : "pointer",
                    border: `1px solid ${chartTf === id ? C.accent : C.border}`, background: chartTf === id ? `${C.accent}18` : "transparent",
                    color: chartTf === id ? C.accent : C.textDim, opacity: loadingChart ? 0.6 : 1 }}>
                  {lbl}
                </button>
              ))}
            </div>
            {/* Right padding reserves clearance for the fixed bottom-right FAB
                cluster (Copilot/QuickTrade/RealityCheck, right:18, ~54-70px
                wide each) — the chart's own right price scale/PIVOT-STOP-
                BASE LOW labels would otherwise render directly under those
                icons and get covered (confirmed live). */}
            <div style={{ paddingRight: 90 }}>
              {chart
                ? <TrendChart data={chart} C={C} MONO={MONO} SANS={SANS} height="fill" />
                : <div style={{ height: 620, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 13, color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 12 }}>Select a mover to load the chart…</div>}
            </div>
            <TrendSetupPanel data={chart} C={C} MONO={MONO} SANS={SANS} />
            <TradeExtrasPanel data={chart} macroData={macroData} C={C} MONO={MONO} SANS={SANS} />
            <AiWhyPanel symbol={sym} price={chart && chart.price} changePct={symDayPct} C={C} MONO={MONO} SANS={SANS} />
            {chart && <BullBearPanel symbol={sym} bullBear={bullBear} C={C} MONO={MONO} SANS={SANS} />}
            {chart && (() => {
              // Real, free, deterministic ~1-week read — the same engine
              // formerly the standalone Predictions tab (moved 2026-07-28
              // so it shows inline with whatever's already loaded here
              // instead of needing its own tab). Distinct from AiPredictPanel
              // below, which is a manual, paid (Fable) AI-generated target —
              // this one is always-on and costs nothing. Reuses the `prediction`
              // computed once above (also feeds the new AI Score Card) instead
              // of recomputing the same real read twice.
              const p = prediction;
              if (!p) return null;
              const dirCol = p.dir.includes("BULL") || p.dir === "LEAN UP" ? C.green : p.dir.includes("BEAR") || p.dir === "LEAN DOWN" ? C.red : C.textDim;
              const dirIcon = p.dir.includes("BULL") || p.dir === "LEAN UP" ? "📈" : p.dir.includes("BEAR") || p.dir === "LEAN DOWN" ? "📉" : "➡️";
              return (
                <div style={{ marginTop: 14, border: `1px solid ${dirCol}55`, borderRadius: 12, padding: "12px 14px", background: `${dirCol}0d` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: C.text }}>{dirIcon} Quick Read — next ~1 week</div>
                    <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: dirCol }}>{p.dir}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>target ${p.target} ({p.movePct >= 0 ? "+" : ""}{p.movePct}%) · {p.conf}% confidence</span>
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec, marginTop: 6 }}>
                    {p.why.length ? p.why.join(" · ") : "No strong real signal either way — real trend template + volume are roughly neutral right now."}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 6 }}>Free, deterministic, real trend-template based — not an AI call. Educational, not advice.</div>
                </div>
              );
            })()}
            <AiPredictPanel symbol={sym} chart={chart} C={C} MONO={MONO} SANS={SANS} />
            {/* Real per-symbol news, inline on the default chart view
                (2026-07-28, explicit user request: "add news to market") —
                same real NewsPanel already reachable one click away via the
                "📰 Symbol News" sub-tab below, just surfaced immediately
                instead of requiring the extra click. */}
            <div style={{ marginTop: 14 }}>
              <SectionHeader icon="📰" label={`${sym} News`} />
              <NewsPanel symbol={sym} C={C} MONO={MONO} SANS={SANS} />
            </div>
          </>
        )}
        {dTab === "smart" && <SmartScanPanel symbol={sym} chart={chart} C={C} MONO={MONO} SANS={SANS} />}
        {dTab === "flow" && <OptionsFlowPanel symbol={sym} C={C} MONO={MONO} SANS={SANS} />}
        {dTab === "valuation" && <FundamentalsPanel symbol={sym} C={C} MONO={MONO} SANS={SANS} />}
        {dTab === "analysts" && <AnalystPeerPanel symbol={sym} price={chart && chart.price} lb={lb} C={C} MONO={MONO} SANS={SANS} />}
        {dTab === "investors" && <InvestorsPanel symbol={sym} C={C} MONO={MONO} SANS={SANS} />}
        {dTab === "earnings" && <><EarningsSnapshot symbol={sym} C={C} MONO={MONO} SANS={SANS} /><EarningsBars symbol={sym} C={C} MONO={MONO} SANS={SANS} /></>}
        {dTab === "company" && <CompanyProfile symbol={sym} C={C} MONO={MONO} SANS={SANS} />}
        {dTab === "social" && <SocialFeed symbol={sym} C={C} MONO={MONO} SANS={SANS} />}
        {dTab === "news" && <NewsPanel symbol={sym} C={C} MONO={MONO} SANS={SANS} />}
      </div>
    </div>

    {/* ── ZONE 3: market-wide snapshot ──
        BestOpportunities used to also render here — removed (2026-07-25,
        user request) since it's genuinely the same real component/scan
        already on its own dedicated sidebar tab; keeping both was pure
        duplication, not two different views of it. My Performance moved
        out the same day, to Mission Status (with Portfolio Risk/A+ Score
        Track — the other performance/risk-health cards it belongs with),
        since this page is for browsing charts, not tracking your P&L. */}
    <div style={{ marginTop: 14 }}>
      <SectionHeader icon="🌍" label="Market Snapshot" />
      <MarketPulseBar C={C} MONO={MONO} SANS={SANS} />
      <SentimentRow C={C} MONO={MONO} SANS={SANS} />
      <SectorHeatStrip sectorData={sectorData} C={C} MONO={MONO} SANS={SANS} />
    </div>
    {explain && <AiScoreExplainer C={C} MONO={MONO} SANS={SANS} symbol={explain.symbol} aplus={explain.aplus} dimensions={explain.dimensions} label={explain.label} onClose={() => setExplain(null)} />}
    </div>
  );
}
