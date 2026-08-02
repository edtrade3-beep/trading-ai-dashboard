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
  deriveTopLevelScores, computeAiTradeScore, computeInstitutionScore,
} from "./market-helpers.js";
import AiScoreExplainer, {
  AplusBadge, TRADE_SETUP_DIMENSIONS, STOCK_QUALITY_DIMENSIONS, INSTITUTIONAL_GRADE_DIMENSIONS,
  TECHNICAL_DIMENSIONS, TIMING_DIMENSIONS, INSTITUTIONAL_GRADE_NOTE, AI_TRADE_ENGINE_DIMENSIONS,
} from "./AiScoreExplainer.jsx";
import { stockQualityBreakdown } from "./rhpro-shared.jsx";
import { mapToAiAction } from "./ai-actions.js";
import SmartMoneyPanel from "./SmartMoneyPanel.jsx";

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

  // AI Trade Engine inputs (options platform redesign, Phase 3) — real
  // dark pool prints, real per-symbol news sentiment, and real gamma
  // exposure, each already-real data this app fetches elsewhere for other
  // pages, just also pulled here (same "additive, lightweight, no new
  // backend" pattern as symOptionsFlow above) to feed
  // computeAiTradeScore's 4 genuinely-new dimensions. Each honestly
  // degrades to null on fetch failure — the score function itself already
  // handles null inputs with a neutral midpoint, never a guess.
  const [symDarkPool, setSymDarkPool] = useState(null);
  const [symNewsSentiment, setSymNewsSentiment] = useState(null);
  const [symGamma, setSymGamma] = useState(null);
  // Institution Score input (Phase 4) — real shares-short vs. prior month,
  // same real Yahoo-sourced field short-interest tools elsewhere in this
  // app already use.
  const [symShortInterest, setSymShortInterest] = useState(null);
  useEffect(() => {
    if (!sym) return;
    setSymDarkPool(null); setSymNewsSentiment(null); setSymGamma(null); setSymShortInterest(null);
    fetch(`/api/market/darkpool?symbol=${encodeURIComponent(sym)}`).then(r => r.json()).then(j => setSymDarkPool(j?.ok ? j : null)).catch(() => {});
    fetch(`/api/market/gamma?symbol=${encodeURIComponent(sym)}`).then(r => r.json()).then(j => setSymGamma(j?.ok ? j : null)).catch(() => {});
    fetch(`/api/market/short-interest?tickers=${encodeURIComponent(sym)}`).then(r => r.json()).then(j => setSymShortInterest(j?.ok ? (j.results || [])[0] || null : null)).catch(() => {});
    fetch(`/api/market/news?tickers=${encodeURIComponent(sym)}&limit=20`).then(r => r.json())
      .then(j => {
        // /api/market/news returns a bare array of {title, publisher, ...} — see fetchMarketNews, routes/market.js.
        const headlines = (Array.isArray(j) ? j : []).map(a => a.title || "").filter(Boolean);
        if (!headlines.length) return;
        return fetch("/api/agent/sentiment-by-symbol", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ headlines }) })
          .then(r => r.json()).then(d => { if (d?.ok) setSymNewsSentiment(d); });
      }).catch(() => {});
  }, [sym]);

  // Real forward-return win-probability log — market-wide, fetched once
  // (not per-symbol), same real source RhProScanner already uses.
  const [aplusTrack, setAplusTrack] = useState(null);
  useEffect(() => {
    fetch("/api/market/aplus-track").then(r => r.json()).then(d => { if (d?.ok) setAplusTrack(d); }).catch(() => {});
  }, []);

  // Section 7 (Catalysts, institutional redesign 2026-07-29) — real
  // per-symbol insider transactions + analyst ratings, same existing
  // endpoints InsiderTab/AnalystPeerPanel already use market-wide, scoped
  // here to just the loaded symbol. No new backend routes.
  const [symInsider, setSymInsider] = useState(null);
  const [symAnalyst, setSymAnalyst] = useState(null);
  useEffect(() => {
    if (!sym) return;
    setSymInsider(null); setSymAnalyst(null);
    fetch(`/api/market/insider?ticker=${encodeURIComponent(sym)}`).then(r => r.json()).then(j => setSymInsider(j?.ok ? j : null)).catch(() => {});
    fetch(`/api/market/analyst?tickers=${encodeURIComponent(sym)}`).then(r => r.json()).then(j => setSymAnalyst(Array.isArray(j?.results) ? j.results[0] : (Array.isArray(j) ? j[0] : null))).catch(() => {});
  }, [sym]);

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
  const stockQuality = symTrend ? stockQualityBreakdown(symTrend, sectorPerf) : null;
  const aPlusScore = symTrend ? computeAPlusScore(symTrend, regime) : null;
  const winProb = (symTrend && aplusTrack) ? winProbFor(aplusTrack, aPlusScore.score) : null;
  const riskLevel = symTrend?.riskPct != null ? (symTrend.riskPct <= 5 ? "Low" : symTrend.riskPct <= 8 ? "Medium" : "High") : null;

  // Six-score consolidation (institutional redesign, 2026-07-29) — the
  // first real consumer of Phase 0/3's deriveTopLevelScores. Presentation
  // layer only, same real inputs computed just above; none of the four
  // underlying scoring functions are touched.
  const topScores = (symTrend && institutionalGrade && stockQuality && aPlusScore) ? deriveTopLevelScores({
    regime, sectorInfo: symSectorInfo, technicals: chart?.technicals, institutionalGrade, stockQuality, aPlusScore,
  }) : null;
  const primaryAction = institutionalGrade ? mapToAiAction({ institutionalScore: institutionalGrade.score }) : null;

  // AI Trade Engine (options platform redesign, Phase 3) — the 10-dimension
  // Trend/Momentum/Volume/RS/Options Flow/Dark Pool/News/Gamma/Liquidity/
  // Institutional Activity score + calls-vs-puts Final Recommendation.
  // liquidityScore is intentionally omitted here (this page hasn't fetched
  // a real options chain for `sym`) — computeAiTradeScore already degrades
  // that one dimension to an honest neutral midpoint rather than a guess;
  // Phase 4's Option Recommender will wire a real one in.
  const aiTradeScore = symTrend ? computeAiTradeScore({
    row: symTrend, optionsFlow: symOptionsFlow, darkPool: symDarkPool, newsSentiment: symNewsSentiment, gammaExposure: symGamma,
  }) : null;

  // Institution Score (options platform redesign, Phase 4) — "what is
  // institutional money doing right now," combining real dark pool +
  // options flow + insider transactions + 13F-derived institutional
  // position change + short interest into one score. symInsider already
  // carries both real insider transactions AND real 13F-derived
  // institutional data (fetchYahooInstitutional) from the existing fetch
  // above — no duplicate fetch needed for that part.
  const institutionScore = symOptionsFlow || symDarkPool || symInsider || symShortInterest ? computeInstitutionScore({
    darkPool: symDarkPool, optionsFlow: symOptionsFlow, insiderData: symInsider, shortInterest: symShortInterest,
  }) : null;

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
        {/* SECTION 1 — Ticker / Overall Grade / AI Conviction / Primary
            Action (institutional redesign, 2026-07-29, explicit user spec).
            Overall Grade is the real, additive Institutional Grade
            (computeInstitutionalGrade) — Stock Quality/Trade Setup below are
            untouched. Recommendation/stars are a deterministic label on that
            same real score. Primary Action is Phase 0's unified AI_ACTIONS
            reducer applied to this same score. Confidence/Expected Move
            reuse the real computePrediction engine (Quick Read card below).
            Probability of Success reuses the real aplus-track forward-return
            win-rate log, honestly gated below its real sample floor. No
            fabricated metrics (no DCF, no gamma exposure, no 13F, etc — see
            the plan's "explicitly NOT building" list). */}
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
                <div style={{ fontFamily: SANS, fontSize: 18, fontWeight: 900, color: C.text }}>{sym}</div>
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
                {primaryAction && (
                  <span title="Unified AI Action — reduces this same real institutional score to one shared label used app-wide" style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: primaryAction.color, border: `1px solid ${primaryAction.color}`, borderRadius: 6, padding: "3px 10px" }}>
                    {primaryAction.label}
                  </span>
                )}
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
                Prediction Confidence and Prob. of Success measure different things — the model's certainty in its own call vs. the real historical win rate for setups graded this well — and can legitimately disagree.
              </div>
            </div>
          );
        })()}
        {/* SECTION 2 — Six core scores (institutional redesign, 2026-07-29,
            explicit user spec: "Market, Sector, Stock Quality, Institutional,
            Technical, Timing"), each clickable into a real breakdown.
            deriveTopLevelScores (market-helpers.js) is presentation-layer
            only — Stock Quality/Institutional pass through the exact same
            real objects computed above (their own real dimension arrays,
            unchanged); Technical/Timing are the two genuinely new derived
            scores (Phase 0/3), each with its own real breakdown/reasons
            wired into the same AiScoreExplainer pattern. Market/Sector are
            single real numbers with no sub-dimension breakdown, so they get
            a plain tooltip instead of the full modal. */}
        {topScores && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 10 }}>
            {[
              { key: "market", label: "MARKET", tile: topScores.market, onClick: null,
                title: `Real market regime score (SPY/QQQ/VIX-derived) — ${regime.label}` },
              { key: "sector", label: "SECTOR", tile: topScores.sector, onClick: null,
                title: symSectorInfo ? `${symSectorInfo.name} ranked #${symSectorInfo.rank} of ${symSectorInfo.of} S&P sectors today` : "Sector rank unavailable" },
              { key: "stockQuality", label: "STOCK QUALITY", tile: topScores.stockQuality,
                onClick: () => setExplain({ symbol: sym, aplus: stockQuality, dimensions: STOCK_QUALITY_DIMENSIONS, label: "STOCK QUALITY SCORE" }) },
              { key: "institutional", label: "INSTITUTIONAL", tile: topScores.institutional,
                onClick: () => setExplain({ symbol: sym, aplus: institutionalGrade, dimensions: INSTITUTIONAL_GRADE_DIMENSIONS, label: "INSTITUTIONAL GRADE", note: INSTITUTIONAL_GRADE_NOTE }) },
              { key: "technical", label: "TECHNICAL", tile: topScores.technical,
                onClick: () => setExplain({ symbol: sym, aplus: topScores.technical, dimensions: TECHNICAL_DIMENSIONS, label: "TECHNICAL" }) },
              { key: "timing", label: "TIMING", tile: topScores.timing,
                onClick: () => setExplain({ symbol: sym, aplus: topScores.timing, dimensions: TIMING_DIMENSIONS, label: "TIMING" }) },
            ].map(({ key, label, tile, onClick, title }) => {
              const Tag = onClick ? "button" : "div";
              return (
                <Tag key={key} onClick={onClick || undefined} title={title}
                  style={{ font: "inherit", textAlign: "left", border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 12px",
                    background: C.card, cursor: onClick ? "pointer" : title ? "help" : "default" }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: tile.color }}>
                    {tile.score ?? "—"}{tile.score != null && <span style={{ fontSize: 11, color: C.textDim }}> /100</span>}
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 10, color: tile.color, fontWeight: 700 }}>{tile.label}</div>
                </Tag>
              );
            })}
          </div>
        )}
        {/* AI Trade Engine — options platform redesign, Phase 3 (spec: "AI
            Score 0-100" + "Final Recommendation"). A NEW composite,
            distinct from Institutional Grade above (that stays untouched)
            — 10 real dimensions including the 4 genuinely-new ones this
            redesign adds (Dark Pool/News/Gamma/Liquidity). Clickable into
            the same real AiScoreExplainer modal pattern every other score
            on this page uses. */}
        {aiTradeScore && (
          <button onClick={() => setExplain({ symbol: sym, aplus: aiTradeScore, dimensions: AI_TRADE_ENGINE_DIMENSIONS, label: "AI TRADE ENGINE" })}
            style={{ font: "inherit", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10,
              width: "100%", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 10, background: C.card, cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>AI TRADE ENGINE — click for breakdown</div>
                <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: aiTradeScore.score >= 70 ? C.green : aiTradeScore.score >= 45 ? C.amber : C.red }}>
                  {aiTradeScore.score}<span style={{ fontSize: 12, color: C.textDim }}> /100</span>
                </div>
              </div>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "5px 10px", borderRadius: 6, background: `${aiTradeScore.recommendation.color}18`, color: aiTradeScore.recommendation.color }}>
                {aiTradeScore.recommendation.label}
              </span>
            </div>
          </button>
        )}
        {/* Institution Score — options platform redesign, Phase 4. "What is
            institutional money doing right now": real dark pool + options
            flow + insider transactions + 13F-derived institutional
            position change + short interest, combined into one score with
            an honest disclosure of the one real gap (real-time ETF flow
            data isn't available). */}
        {institutionScore && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10,
            border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 10, background: C.card }}
            title={institutionScore.reasons.join(" · ")}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>INSTITUTION SCORE — hover for real signals</div>
                <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: institutionScore.score >= 60 ? C.green : institutionScore.score <= 40 ? C.red : C.amber }}>
                  {institutionScore.score}<span style={{ fontSize: 12, color: C.textDim }}> /100</span>
                </div>
              </div>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "5px 10px", borderRadius: 6,
                background: institutionScore.score >= 60 ? `${C.green}18` : institutionScore.score <= 40 ? `${C.red}18` : `${C.amber}18`,
                color: institutionScore.score >= 60 ? C.green : institutionScore.score <= 40 ? C.red : C.amber }}>
                {institutionScore.label}
              </span>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, maxWidth: 260 }}>{institutionScore.disclosure}</div>
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
            {/* SECTION 3 — AI Summary (institutional redesign, 2026-07-29).
                Same real, free, deterministic BullBearPanel — splits the
                real Institutional Grade dimensions by which side of the
                case they support, zero new fetch/API cost. Moved ahead of
                the chart to match the spec's section order (Header→Scores→
                Summary→Trade Plan→Chart). */}
            {chart && (
              <div style={{ marginBottom: 14 }}>
                <SectionHeader icon="🧠" label="AI SUMMARY" />
                <BullBearPanel symbol={sym} bullBear={bullBear} C={C} MONO={MONO} SANS={SANS} />
              </div>
            )}
            {/* SECTION 4 — Trade Plan (institutional redesign, 2026-07-29):
                Entry/Stop/Targets (TrendSetupPanel, real _buildTrendTemplate
                pivot/stop/2R/3R) + position sizing (TradeExtrasPanel, real
                account-size/risk% from Settings). Visual consolidation only
                — no new computation, moved ahead of the chart to match the
                spec's section order. */}
            <div style={{ marginBottom: 14 }}>
              <SectionHeader icon="🎯" label="TRADE PLAN" />
              <TrendSetupPanel data={chart} C={C} MONO={MONO} SANS={SANS} />
              <TradeExtrasPanel data={chart} macroData={macroData} C={C} MONO={MONO} SANS={SANS} />
            </div>
            {/* SECTION 5 — large interactive chart. Right padding reserves
                clearance for the fixed bottom-right FAB cluster (Copilot/
                QuickTrade/RealityCheck, right:18, ~54-70px wide each) — the
                chart's own right price scale/PIVOT-STOP-BASE LOW labels
                would otherwise render directly under those icons and get
                covered (confirmed live). */}
            <div style={{ paddingRight: 90 }}>
              {chart
                ? <TrendChart data={chart} C={C} MONO={MONO} SANS={SANS} height="fill" />
                : <div style={{ height: 620, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 13, color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 12 }}>Select a mover to load the chart…</div>}
            </div>
            {/* SECTION 6 — Smart Money panel (institutional redesign,
                2026-07-29, explicit user spec: "Order Blocks, Fair Value
                Gaps, Liquidity, VWAP, Volume Profile, Dark Pool Activity").
                New standalone component extracting/generalizing the SMC
                surface that was previously scattered (Institutional Grade's
                own dimension, the scanner's hover badge) — same real
                src/smc-engine.js detectors this app already used everywhere
                else, via the existing standalone /api/market/smc + the
                existing per-symbol /api/market/darkpool filter. */}
            {chart && sym && (
              <div style={{ marginTop: 14, marginBottom: 14 }}>
                <SectionHeader icon="🧱" label="SMART MONEY" />
                <SmartMoneyPanel symbol={sym} chart={chart} C={C} MONO={MONO} SANS={SANS} />
              </div>
            )}
            {/* SECTION 7 — Catalysts (institutional redesign, 2026-07-29,
                explicit user spec: "Earnings, Analyst Upgrades/Downgrades,
                Insider Activity, Options Flow, News, Economic Events").
                Real per-symbol insider transactions + analyst ratings
                (existing endpoints, previously only market-wide list-scoped
                — InsiderTab/AnalystPeerPanel — now filtered here to just
                this symbol), real options-flow bias (symOptionsFlow, already
                fetched for the AI Score Card above), real earnings date
                (fund.earningsDate). News/Economic Events stay one click away
                via the existing "Symbol News" sub-tab and Calendar page
                rather than duplicating that real data a second time here. */}
            {chart && sym && (
              <div style={{ marginBottom: 14 }}>
                <SectionHeader icon="📅" label="CATALYSTS" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", background: C.card }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 6 }}>EARNINGS</div>
                    <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>{fund?.earningsDate ? new Date(fund.earningsDate).toLocaleDateString() : "—"}</div>
                  </div>
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", background: C.card }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 6 }}>ANALYSTS</div>
                    {symAnalyst?.numAnalysts ? (
                      <>
                        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>{symAnalyst.recommendation || "—"} · {symAnalyst.numAnalysts} analysts</div>
                        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>Target ${symAnalyst.targetLow}–${symAnalyst.targetHigh} (mean ${symAnalyst.targetMean})</div>
                        {symAnalyst.history?.[0] && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, marginTop: 3 }}>{symAnalyst.history[0].firm}: {symAnalyst.history[0].action} ({symAnalyst.history[0].toGrade}) {symAnalyst.history[0].date}</div>}
                      </>
                    ) : <div style={{ fontFamily: MONO, fontSize: 13, color: C.textDim }}>—</div>}
                  </div>
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", background: C.card }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 6 }}>INSIDER ACTIVITY</div>
                    {symInsider?.insiderTransactions?.transactions?.length ? symInsider.insiderTransactions.transactions.slice(0, 2).map((t, i) => (
                      <div key={i} style={{ fontFamily: SANS, fontSize: 11, color: t.type === "BUY" ? C.green : C.red, marginBottom: 2 }}>
                        {t.type === "BUY" ? "🟢" : "🔴"} {t.name} — {t.type} {t.shares ? t.shares.toLocaleString() + " sh" : ""} {t.date}
                      </div>
                    )) : <div style={{ fontFamily: MONO, fontSize: 13, color: C.textDim }}>No recent real filings</div>}
                  </div>
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", background: C.card }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 6 }}>OPTIONS FLOW</div>
                    {symOptionsFlow ? (
                      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: Number(symOptionsFlow.callNotional) > Number(symOptionsFlow.putNotional) ? C.green : C.red }}>
                        {Number(symOptionsFlow.callNotional) > Number(symOptionsFlow.putNotional) ? "Call-weighted" : "Put-weighted"}
                      </div>
                    ) : <div style={{ fontFamily: MONO, fontSize: 13, color: C.textDim }}>—</div>}
                  </div>
                </div>
              </div>
            )}
            <AiWhyPanel symbol={sym} price={chart && chart.price} changePct={symDayPct} C={C} MONO={MONO} SANS={SANS} />
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
