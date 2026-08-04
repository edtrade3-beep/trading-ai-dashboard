import { useState, useEffect, useCallback, useRef } from "react";
import TrendChart from "./TrendChart.jsx";
import TrendSetupPanel from "./TrendSetupPanel.jsx";
import SmartScanPanel from "./SmartScanPanel.jsx";
import {
  EarningsSnapshot, EarningsBars, AiWhyPanel, BullBearPanel, NewsPanel, SectorHeatStrip,
  MarketPulseBar, SentimentRow, MarketNewsWire, AnalystPeerPanel,
  FundamentalsPanel, CompanyProfile, AiPredictPanel, COTPanel,
  PredictionMarkets, SocialFeed, InvestorsPanel,
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
  deriveTopLevelScores, computeAiTradeScore, computeInstitutionScore, computeMarketBias,
} from "./market-helpers.js";
import AiScoreExplainer, {
  AplusBadge, TRADE_SETUP_DIMENSIONS, STOCK_QUALITY_DIMENSIONS, INSTITUTIONAL_GRADE_DIMENSIONS,
  TECHNICAL_DIMENSIONS, TIMING_DIMENSIONS, AI_TRADE_ENGINE_DIMENSIONS,
} from "./AiScoreExplainer.jsx";
import { stockQualityBreakdown } from "./rhpro-shared.jsx";
import { mapToAiAction } from "./ai-actions.js";
import SmartMoneyPanel from "./SmartMoneyPanel.jsx";
import AiTradeCard from "./AiTradeCard.jsx";
import StrategySelectorCard from "./StrategySelectorCard.jsx";
import ChecklistCard from "./ChecklistCard.jsx";
import { computeChecklist } from "./checklist-engine.js";
// Market Context strip (2026-08-04 decision-first redesign, Phase 6) — the
// exact same real component MacroTab.jsx mounts (extracted out of that file
// so both pages share one real implementation instead of a second,
// potentially-diverging copy).
import MacroStatusStrip, { useRealMacroOverrides } from "./MacroStatusStrip.jsx";
// Headline-number display font — same token terminal-panels.jsx/
// TrendSetupPanel.jsx already use for their stat-box values (P/E, targets,
// Fear&Greed score, etc). This file's own price/stat pills previously used
// MONO for those numbers, which read fine but didn't match the rest of the
// app's established "MONO = precise data label, NUM = headline stat" split.
import { NUM } from "./theme.js";

// Combined Market-Terminal page: movers leaderboard on the left, pro chart with
// AI overlays on the right. Click a mover → it loads in the chart.
export default function MarketTerminalTab({ C, MONO, SANS, sectorData, macroData, distData, onDeepDive, setActiveTab, preMktMovers, marketSession }) {
  const [lb, setLb] = useState(null);
  // Real pre-market session auto-default (2026-08-04, "also add pre market
  // movers") — marketSession is axiom-live.jsx's own already-computed
  // getMarketSessionET() read, real time-of-day math, not a new classifier.
  // Only applies on first mount; the user can still switch views manually
  // after that like any other tab.
  const [view, setView] = useState(() => marketSession === "PREMARKET" ? "premarket" : "moversUp");
  const [sym, setSym] = useState("NVDA");
  const [chart, setChart] = useState(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const [query, setQuery] = useState("");
  const [dTab, setDTab] = useState("chart");   // per-symbol detail tab
  // Collapsed by default (2026-08-04, "chart is too crowded") — the 6-tile
  // score grid through the technical-indicator pills are 5-6 separate
  // bordered cards stacked one after another below the hero verdict, the
  // actual source of the crowding complaint. The real price chart itself
  // is NOT part of this toggle (it lives in the dTab sub-nav content below,
  // which stays expanded) — only the extra score cards collapse.
  const [showSupportingDetail, setShowSupportingDetail] = useState(false);
  const [chartTf, setChartTf] = useState("1d"); // chart candle granularity, 5m → 1wk
  const [sortBy, setSortBy] = useState("bucket");  // movers sort
  const [source, setSource] = useState("movers");  // movers | watchlist
  const [wlRows, setWlRows] = useState(null);
  // Real top-ranked contract premium, reported up by AiTradeCard (2026-08-04
  // decision-first redesign) — lets the Execution Card show Recommended
  // Contracts without a second, duplicate options-chain fetch. Null while
  // loading/unavailable, same honest-null discipline as the rest of the page.
  const [topContract, setTopContract] = useState(null);
  const [copiedPlan, setCopiedPlan] = useState(false);
  const { fred: macroFred } = useRealMacroOverrides();
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

  // tf param lets a caller (timeframe buttons) override the current chartTf
  // in the same click that also changes it, avoiding a stale-closure refetch.
  //
  // Previously fired a real Telegram "chart viewed" ping on every load
  // (2026-07-28), then throttled to a 15-min per-symbol cooldown
  // (2026-07-29, "too many alerts in telegram") — still flooded once the
  // Movers panel gained more views to click through (each row is a
  // different symbol, so the per-symbol cooldown never actually applied).
  // Removed entirely 2026-08-04 per explicit user request.
  const loadSym = useCallback((s, tf) => {
    const symbol = String(s || "").trim().toUpperCase();
    if (!symbol) return;
    const useTf = tf || chartTf;
    setSym(symbol); setLoadingChart(true);
    fetch(`/api/market/trend-template?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(useTf)}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setChart(d); })
      .catch(() => {})
      .finally(() => setLoadingChart(false));
  }, [chartTf]);
  useEffect(() => {
    let pending = null;
    try {
      pending = localStorage.getItem("mterminal_load_sym"); if (pending) localStorage.removeItem("mterminal_load_sym");
      if (localStorage.getItem("mterminal_scroll_to") === "plan") { scrollToPlanPendingRef.current = true; localStorage.removeItem("mterminal_scroll_to"); }
    } catch {}
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

  // Real "jump straight to the plan" behavior (2026-08-02, explicit user
  // request: merging Sniper Scanner's old separate "chart"/"plan" buttons
  // into one). Same deferred-scroll pattern as scrollToChart above, but
  // fires once after this symbol's real AI Trade Card content has actually
  // loaded (not on click, since the handoff lands on first mount before
  // any real data exists yet to scroll to) — consumed once, then cleared,
  // so later silent refreshes/timeframe changes don't re-trigger it.
  const tradePlanRef = useRef(null);
  const scrollToPlanPendingRef = useRef(false);

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
    { id: "premarket", label: "Pre-Market", icon: "🌅" },
  ];
  const rows = (() => {
    if (source === "watchlist") return wlRows || [];
    // Real Yahoo-sourced pre-market data (2026-08-04) — /api/market/
    // premarket-movers, a fixed ~38-symbol liquid/momentum universe (not
    // the full market), already fetched in axiom-live.jsx and threaded down
    // as a prop. Distinct from the other 3 views: those come from the
    // Alpaca-IEX leaderboard, which is structurally blind to real
    // pre-market trades until 9:30am ET (free feed tier has no pre-market
    // session) — this is the one real source that actually moves before
    // the open. Mapped into the same {symbol, price, dayPct, volRatio}
    // shape the row renderer below already expects; no real RVOL exists
    // for this source, so volRatio stays honestly null.
    if (view === "premarket") {
      const base = (preMktMovers || []).map(m => ({ symbol: m.sym, price: m.price, dayPct: m.chg, volRatio: null }));
      if (sortBy === "vol") return base; // no real volRatio to sort by — falls back to default order
      const s = [...base];
      if (sortBy === "chg") s.sort((a, b) => b.dayPct - a.dayPct);
      else if (sortBy === "price") s.sort((a, b) => b.price - a.price);
      else s.sort((a, b) => Math.abs(b.dayPct) - Math.abs(a.dayPct)); // bucket default: same |chg| rank the API itself returns
      return s;
    }
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

  useEffect(() => {
    if (aiTradeScore && scrollToPlanPendingRef.current) {
      scrollToPlanPendingRef.current = false;
      // Real content above the AI Trade Card (chart panels, catalysts,
      // prediction markets) keeps loading asynchronously after
      // aiTradeScore itself resolves — an immediate single scroll can land
      // short because the page is still growing taller above the target.
      // A corrective re-scroll ~900ms later (after that slower content has
      // settled) fixes the final resting position without needing to gate
      // the first scroll behind every other fetch on the page.
      tradePlanRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      const t = setTimeout(() => tradePlanRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 900);
      return () => clearTimeout(t);
    }
  }, [aiTradeScore]);

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
  // One-sentence AI summary (2026-08-04 decision-first redesign) — composes
  // computeBullBearCase's own real reason strings into a single sentence
  // instead of a bullet list, so the hero card's verdict has exactly one
  // line of "why" beneath it. Zero new data, no new fabrication — leads
  // with whichever real side (bull/bear) has more supporting dimensions;
  // when genuinely balanced, falls back to a real, honest "nothing stands
  // out" line rather than forcing a one-sided read.
  const oneLiner = institutionalGrade ? (
    bullBear.bull.length > bullBear.bear.length ? bullBear.bull[0]
      : bullBear.bear.length > bullBear.bull.length ? bullBear.bear[0]
      : (bullBear.bull[0] || bullBear.bear[0] || `${institutionalLetterGrade(institutionalGrade.score)} grade — no single dimension stands out as a strong pass or fail today.`)
  ) : null;
  // Trade Readiness / "why this isn't perfect" (2026-08-04 decision-first
  // redesign) — same real computeChecklist() ChecklistCard already renders,
  // computed here too so a filtered "failures only" view can sit right next
  // to it without duplicating the underlying math.
  const checklistResult = (sym && chart?.bars) ? computeChecklist({
    bars: chart.bars, price: chart?.price, rvol: symTrend?.volRatio,
    newsSentiment: symNewsSentiment, darkPool: symDarkPool, optionsFlow: symOptionsFlow,
    gammaExposure: symGamma, smc: chart?.smc,
  }) : null;
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

  // Section header — same treatment for all 12 sections on this page (Chart /
  // Movers & Watchlist / Market Snapshot) so a long page reads as clearly
  // delineated chapters instead of one undifferentiated scroll. `tone`
  // defaults to the brand accent (routine structural color, not a bull/bear
  // signal — see theme.js's 4-color status system note); "gold" is reserved
  // for AI SUMMARY only, matching theme.js's own documented gold contract
  // ("marks the single highest-conviction idea on a page").
  const SectionHeader = ({ icon, label, tone }) => {
    const tc = tone === "gold" ? C.gold : C.accent;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 7, marginBottom: 6, borderBottom: `2px solid ${tc}` }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22,
          borderRadius: 6, background: `${tc}1c`, fontSize: 12, flexShrink: 0 }}>{icon}</span>
        <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 900, letterSpacing: 0.3, color: C.text, textTransform: "uppercase" }}>{label}</span>
      </div>
    );
  };

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
            {view === "premarket" && (
              <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: -4, marginBottom: 10 }}>
                Real Yahoo pre/post-market data for a fixed ~38-symbol high-liquidity/momentum universe — not the full market, and RVOL isn't available for this source. Refreshes every 4 min.
              </div>
            )}
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
      </div>

      {/* ── ZONE 2: pro chart ── */}
      <div ref={chartZoneRef} style={{ width: "100%" }}>
        <SectionHeader icon="📈" label="Chart" />
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: SANS, fontSize: 24, fontWeight: 900, color: C.accent }}>{sym}</span>
          {/* Real company/fund name from the same fundamentals fetch already
              used for Market Cap/P/E above — no new API call. Honest-null:
              some tickers (esp. thin ETFs) never resolve a name from any of
              the 3 fallback providers, so this just doesn't render rather
              than showing the bare symbol twice or a fabricated title. */}
          {fund && fund.name && fund.name !== sym && <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: C.textDim }}>{fund.name}</span>}
          {chart && chart.price != null && <span style={{ fontFamily: NUM, fontSize: 32, fontWeight: 900, color: C.green }}>${chart.price.toFixed(2)}</span>}
          {symDayPct != null && <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: col(symDayPct) }}>{pct(symDayPct)}</span>}
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
                  <div style={{ fontFamily: NUM, fontSize: 14, fontWeight: 800, color: col || C.text }}>{val}</div>
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
              <div style={{ fontFamily: NUM, fontSize: 15, fontWeight: 800, color: col || C.text }}>{val}</div>
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
              {oneLiner && (
                <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: C.text, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${rec.color}33` }}>{oneLiner}</div>
              )}
            </div>
          );
        })()}
        {/* SECTION 2 — Execution Card (2026-08-04 decision-first redesign,
            explicit user spec) — real Entry/Stop/Targets (TrendSetupPanel,
            same _buildTrendTemplate pivot/stop/2R/3R every other real card
            on this page already reads). Promoted from inside the Chart
            sub-tab (where it sat below the score grid/AI Trade Engine/
            Institution Score/AiTradeCard/StrategySelector/Checklist/
            technical pills/sub-nav) to directly under the hero verdict —
            the numbers a trader needs to actually place the trade
            shouldn't require scrolling past 8 other cards first. Same
            real components, no new computation.
            Position sizing (TradeExtrasPanel) was removed from here
            2026-08-04, "move position size from chart" — it now lives on
            Trade Planner, its natural home, via the "Size this trade →"
            handoff button below (real chart.setup.entry/.stop/.target2,
            same localStorage["tradeplanner_load_plan"] shape Green Light's
            "🎯 PLAN" button already writes — GreenLightTab.jsx:581-587 —
            so Trade Planner needed zero changes to receive it). */}
        {chart && (
          <div style={{ marginBottom: 14 }}>
            <SectionHeader icon="🎯" label="EXECUTION" />
            <TrendSetupPanel data={chart} C={C} MONO={MONO} SANS={SANS} />
            {chart.setup && (
              <button onClick={() => {
                  const su = chart.setup;
                  try {
                    localStorage.setItem("tradeplanner_load_plan", JSON.stringify({
                      symbol: sym, entry: Number(su.entry), stop: Number(su.stop),
                      target: Number.isFinite(Number(su.target2)) ? Number(su.target2) : null,
                      aplus: null, next: null, source: "Chart",
                    }));
                  } catch {}
                  setActiveTab && setActiveTab("tradeplanner");
                }}
                title={`Size this trade — opens Trade Planner with ${sym}'s real entry/stop/target already filled in for position sizing`}
                style={{ marginTop: 8, fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "7px 14px", borderRadius: 7, border: `1px solid ${C.accent}`, background: `${C.accent}14`, color: C.accent, cursor: "pointer" }}>
                📐 Size this trade →
              </button>
            )}
            {/* Recommended Contracts (2026-08-04) — real, using AiTradeCard's
                own already-fetched top-ranked contract premium (reported up
                via onTopContract, no duplicate chain fetch) and the same
                real account-size/risk% (axiom_acct_size/axiom_risk_pct from
                Settings) the Execute-via-Quick-Trade button below reads for
                equity share sizing, applied to the option leg. */}
            {topContract && topContract.premium > 0 && (() => {
              const acct = Number(localStorage.getItem("axiom_acct_size")) || 10000;
              const riskPct = Number(localStorage.getItem("axiom_risk_pct")) || 1;
              const maxDollarRisk = acct * riskPct / 100;
              const contracts = Math.max(1, Math.floor(maxDollarRisk / (topContract.premium * 100)));
              return (
                <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 12, color: C.textSec, display: "flex", gap: 6, alignItems: "center" }}
                  title={`Real top-ranked ${topContract.isCall ? "call" : "put"} premium $${topContract.premium.toFixed(2)}, max $${maxDollarRisk.toFixed(0)} risk (${riskPct}% of $${acct.toLocaleString()})`}>
                  <span style={{ color: C.textDim }}>Recommended contracts (options):</span>
                  <b style={{ color: C.text }}>{contracts}</b>
                  <span style={{ color: C.textDim, fontSize: 10 }}>${topContract.premium.toFixed(2)}/contract</span>
                </div>
              );
            })()}
            {/* Copy Trade Plan / Execute via Quick Trade / Log Trade
                (2026-08-04) — real entry/stop/target from this same
                Execution Card's own chart.setup. Execute dispatches the
                identical real "open-quick-trade" event TradePlannerTab's own
                execute button already uses (same shares formula: floor((acct
                × riskPct/100) / (entry−stop)), same field names) — one real
                execution surface, not a second path. The mockup's "Trade
                with Robinhood" has no real backing anywhere in this app (no
                live Robinhood order API) — Log Trade opens the real manual
                journal instead of claiming automated execution this app
                can't perform. */}
            {chart.setup && (
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => {
                    const su = chart.setup;
                    const txt = `${sym} — Entry $${su.entry} · Stop $${su.stop} · T2 $${su.target2} · T3 $${su.target3}`;
                    if (navigator.clipboard?.writeText) {
                      navigator.clipboard.writeText(txt).then(() => { setCopiedPlan(true); setTimeout(() => setCopiedPlan(false), 2000); }).catch(() => {});
                    }
                  }}
                  style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "7px 14px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.text, cursor: "pointer" }}>
                  {copiedPlan ? "✓ Copied" : "📋 Copy Trade Plan"}
                </button>
                <button onClick={() => {
                    const su = chart.setup;
                    const entry = Number(su.entry || chart.price || 0), stop = Number(su.stop || 0);
                    const riskPS = Math.max(0.01, entry - stop);
                    const acct = Number(localStorage.getItem("axiom_acct_size")) || 10000;
                    const riskPct = Number(localStorage.getItem("axiom_risk_pct")) || 1;
                    const shares = riskPS > 0 ? Math.floor((acct * riskPct / 100) / riskPS) : 0;
                    window.dispatchEvent(new CustomEvent("open-quick-trade", { detail: { symbol: sym, shares, stopLoss: su.stop, takeProfit: su.target2 } }));
                  }}
                  style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "7px 14px", borderRadius: 7, border: "none", background: C.accent, color: "#fff", cursor: "pointer" }}>
                  ⚡ Execute via Quick Trade
                </button>
                <button onClick={() => setActiveTab && setActiveTab("rhpro-journal")}
                  title="Opens the manual trade journal to log this trade"
                  style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "7px 14px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.textSec, cursor: "pointer" }}>
                  📝 Log Trade →
                </button>
              </div>
            )}
          </div>
        )}
        {/* SECTION 3 — Trade Readiness gauge (2026-08-04 decision-first
            redesign) — reuses ChecklistCard/computeChecklist's real 11-dot
            pass/fail % and A+/A/B/C/Avoid grade (options platform redesign
            Phase 10), promoted up from below the score grid/AI Trade Engine/
            Institution Score/AiTradeCard/StrategySelector stack. No new
            scoring dimensions invented — the mockup's 10 named components
            (Trend/Momentum/RS/Volume/Institutional Flow/Dark Pools/Options
            Flow/Market/Sector/Risk Reward) don't map 1:1 onto any single
            existing engine in this app; this real, already-built 11-dot
            system covers the same spirit without fabricating a new one. */}
        {checklistResult && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <SectionHeader icon="✅" label="TRADE READINESS" />
              <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: checklistResult.passCount / checklistResult.total >= 0.75 ? C.green : checklistResult.passCount / checklistResult.total >= 0.45 ? C.amber : C.red }}>
                {Math.round((checklistResult.passCount / checklistResult.total) * 100)}%
              </span>
              {checklistResult.passCount / checklistResult.total >= 0.75 && (
                <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 900, color: C.green, border: `1px solid ${C.green}`, borderRadius: 4, padding: "2px 8px" }}>READY TO EXECUTE</span>
              )}
            </div>
            <ChecklistCard
              bars={chart.bars} price={chart?.price} rvol={symTrend?.volRatio}
              newsSentiment={symNewsSentiment} darkPool={symDarkPool} optionsFlow={symOptionsFlow}
              gammaExposure={symGamma} smc={chart?.smc}
              C={C} MONO={MONO} SANS={SANS}
            />
            {/* "Why this isn't perfect" (2026-08-04, directly answers the
                missing-confirmation question asked earlier this session) —
                same real dots ChecklistCard just rendered, filtered to only
                the real failures, with their real detail reason strings.
                No new computation — a filtered view of computeChecklist's
                own already-real output. */}
            {checklistResult.dots.some(d => d.pass === false) && (
              <div style={{ marginTop: 8, background: `${C.red}0c`, border: `1px solid ${C.red}33`, borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.red, letterSpacing: 0.5, marginBottom: 6 }}>WHY THIS ISN'T PERFECT</div>
                {checklistResult.dots.filter(d => d.pass === false).map((d, i) => (
                  <div key={i} style={{ fontFamily: SANS, fontSize: 12, color: C.text, marginBottom: 3 }}>✗ {d.label}{d.detail ? <span style={{ color: C.textDim }}> — {d.detail}</span> : null}</div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* SECTION 4 — Market Context (2026-08-04 decision-first redesign)
            — the same real MacroStatusStrip component MacroTab.jsx mounts
            (SPY/QQQ/IWM/DIA/VIX/DXY-proxy/10Y/Gold/Oil/BTC, real
            Green/Yellow/Red per instrument), so a trader can see at a
            glance whether the broader market supports this trade without
            leaving the page. One real shared component, two mount sites —
            not a second, divergent copy. */}
        <div style={{ marginBottom: 14 }}>
          <SectionHeader icon="🌍" label="MARKET CONTEXT" />
          <MacroStatusStrip C={C} MONO={MONO} macroData={macroData} distData={distData} fred={macroFred} />
        </div>
        {/* SECTION 4.5 — Fundamentals | Technical, side by side (2026-08-04,
            explicit user request: "add fundamental in one side and
            technical in other side squeeze them together"). Both promoted
            to always-visible, real estate right under the hero verdict —
            Fundamentals used to be reachable only by clicking into the
            "Valuation" sub-nav tab below the chart (easy to miss entirely);
            Technical (ADX/Donchian/Bollinger) used to live inside the
            collapsed Supporting Detail section. Neither's underlying data
            or computation changed — FundamentalsPanel is the same real
            component the Valuation tab already used (own fetch, unchanged);
            the technical pills are the same chart.technicals math already
            computed for the chart, just moved up and out of the collapse.
            auto-fit/minmax (this file's own established responsive
            pattern) stacks to one column on mobile. */}
        {sym && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 14 }}>
            <div>
              <SectionHeader icon="📊" label="FUNDAMENTALS" />
              <FundamentalsPanel symbol={sym} C={C} MONO={MONO} SANS={SANS} />
            </div>
            <div>
              <SectionHeader icon="📐" label="TECHNICAL" />
              {chart && chart.technicals ? (() => {
                const t = chart.technicals;
                const row = (label, val, col, title) => (
                  <div key={label} title={title} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${C.border}`, cursor: title ? "help" : "default" }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{label}</span>
                    <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: col || C.text }}>{val}</span>
                  </div>
                );
                const adx = t.adx, don = t.donchian, bb = t.bollinger;
                const adxCol = !adx ? C.text : adx.strength === "Strong" ? (adx.direction === "Bullish" ? "#22d47e" : "#ef4444") : C.textDim;
                const bbSqueeze = bb && bb.bandwidthPct != null && bb.bandwidthPct < 8;
                return (
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", background: C.bg }}>
                    {row("ADX (14d)", adx ? `${adx.adx} · ${adx.strength}` : "—", adxCol, adx ? `+DI ${adx.plusDI} / -DI ${adx.minusDI} — ${adx.direction} trend, ${adx.strength.toLowerCase()}` : "Insufficient history")}
                    {row("DONCHIAN (20d)", don ? `${don.pctPosition}% of range` : "—", don ? (don.pctPosition >= 90 ? "#22d47e" : don.pctPosition <= 10 ? "#ef4444" : C.text) : C.text, don ? `Upper $${don.upper} · Lower $${don.lower} — price is ${don.pctPosition}% of the way up the 20-day range` : "Insufficient history")}
                    {row("BOLLINGER %B", bb ? `${bb.percentB}%${bbSqueeze ? " · squeeze" : ""}` : "—", bb ? (bb.percentB >= 100 ? "#22d47e" : bb.percentB <= 0 ? "#ef4444" : bbSqueeze ? "#d6a312" : C.text) : C.text, bb ? `Upper $${bb.upper} · Mid $${bb.mid} · Lower $${bb.lower} · Bandwidth ${bb.bandwidthPct}%${bbSqueeze ? " — tight, coiling" : ""}` : "Insufficient history")}
                  </div>
                );
              })() : (
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 14px", background: C.bg, fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center" }}>Loading…</div>
              )}
            </div>
          </div>
        )}
        {/* "SUPPORTING DETAIL" divider — audit fix #4, 2026-08-04. Real
            finding: the hero card above already IS a complete verdict
            (letter grade + stars + Recommendation + Primary Action), but
            the up to 8 cards below it (score grid, AI Trade Engine, Smart
            Money Flow, AI Trade Card, Strategy Selector, Checklist) read as
            visually co-equal peers with no signal that the hero already
            answered the question — a user had to mentally average all of
            them to decide. They can legitimately disagree (different real
            math over different real inputs) by design, so this doesn't
            reconcile them into one number; it just labels what's already
            true: the hero is the answer, everything below is the evidence
            for it. Nothing removed, nothing hidden — nothing to lose the
            deep-dive. */}
        {institutionalGrade && (
          // flexWrap (2026-08-04 mobile audit, real bug found via mobile
          // screenshot): without it, the label + divider + toggle button
          // (all nowrap) overflowed past narrow viewports and pushed the
          // toggle button off-screen, un-clickable on mobile.
          <div style={{ display: "flex", alignItems: "center", gap: 10, rowGap: 6, flexWrap: "wrap", margin: "4px 0 12px" }}>
            <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
              SUPPORTING DETAIL — for the verdict above
            </div>
            <div style={{ flex: 1, minWidth: 20, height: 1, background: C.border }} />
            {/* Collapsed by default (2026-08-04, "chart is too crowded") —
                the 6-tile score grid through the technical-indicator pills
                below are 5-6 separate bordered cards, none of which gate
                any real behavior (verified before this change: real paper-
                trading/Telegram-alert code reads these same scoring
                functions' raw values directly, not through this UI), so
                collapsing the display costs nothing functionally. */}
            <button onClick={() => setShowSupportingDetail(v => !v)}
              style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.accent, background: "transparent", border: `1px solid ${C.accent}55`, borderRadius: 6, padding: "3px 9px", cursor: "pointer", whiteSpace: "nowrap" }}>
              {showSupportingDetail ? "Hide ▴" : "Show (6 more scores) ▾"}
            </button>
          </div>
        )}
        {showSupportingDetail && <>
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
              // INSTITUTIONAL tile removed 2026-08-04 — real duplicate, not just
              // similar: same institutionalGrade object as the hero card above
              // (L644), same score, same letter, same breakdown modal. The hero
              // card already owns this number; showing it twice 15 lines apart
              // cost the user a second read with no new information.
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
                {/* Renamed from "INSTITUTION SCORE" 2026-08-04 — real user
                    confusion risk flagged by audit: that name sat ~80 lines
                    below "INSTITUTIONAL GRADE" (the hero card above), same
                    0-100 scale, no disclosure telling them apart. This is a
                    dark-pool/options-flow/insider/13F/short-interest read on
                    what institutional money is doing right now — a
                    genuinely different question than Institutional Grade's
                    7-input quality synthesis — so it gets its own name. */}
                <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>SMART MONEY FLOW SCORE — hover for real signals</div>
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
        {/* AI Trade Card — Option Contract Recommender's top-pick card,
            options platform redesign Phase 5. Self-contained (fetches its
            own real chain + IV rank); receives this page's already-real
            scores/gamma/short-interest/earnings-DTE as props rather than
            re-deriving them. */}
        {sym && (
          <div ref={tradePlanRef} style={{ marginBottom: 10 }}>
            <AiTradeCard
              symbol={sym} price={chart?.price} aiTradeScore={aiTradeScore} institutionScore={institutionScore}
              gammaExposure={symGamma} shortFloatPct={symShortInterest?.shortFloat} rvol={symTrend?.volRatio}
              earningsDte={symTrend?.earningsDte} onTopContract={setTopContract} C={C} MONO={MONO} SANS={SANS}
            />
          </div>
        )}
        {/* AI Strategy Selector — options platform redesign Phase 9.
            Real Market Bias (computeMarketBias, Phase 1) computed here and
            passed down so the server route never re-derives its own regime
            formula. Self-contained beyond that: fetches its own real IV
            Rank + strategy/legs. */}
        {sym && (
          <div style={{ marginBottom: 10 }}>
            <StrategySelectorCard symbol={sym} marketBias={computeMarketBias({ macroData, distData })} C={C} MONO={MONO} SANS={SANS} />
          </div>
        )}
        {/* Trade Checklist / Trade Readiness now renders above the
            "SUPPORTING DETAIL" divider, right under the Execution Card
            (2026-08-04 decision-first redesign) — same ChecklistCard,
            promoted, not duplicated. */}
        {/* Technical indicators (ADX/Donchian/Bollinger) moved out of this
            collapsed section 2026-08-04 — now in the always-visible
            FUNDAMENTALS | TECHNICAL side-by-side section above, right
            under Market Context. Promoted, not duplicated. */}
        </>}
        {/* ── Per-symbol detail tabs — real price chart + sub-nav live
            here, deliberately NOT part of the collapsed section above,
            since this is the Chart page and the chart itself stays visible.
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
                <SectionHeader icon="🧠" label="AI SUMMARY" tone="gold" />
                <BullBearPanel symbol={sym} bullBear={bullBear} C={C} MONO={MONO} SANS={SANS} />
              </div>
            )}
            {/* Execution Card (Entry/Stop/Targets) now renders above the
                "SUPPORTING DETAIL" divider, right under the hero verdict
                (2026-08-04 decision-first redesign) — same TrendSetupPanel,
                promoted, not duplicated. Position sizing itself was later
                relocated off this page entirely (see "Size this trade →"
                note above the Execution Card). */}
            {/* SECTION 5 — large interactive chart. Right padding reserves
                clearance for the fixed bottom-right FAB cluster (Copilot/
                QuickTrade/RealityCheck, right:18, ~54-70px wide each) — the
                chart's own right price scale/PIVOT-STOP-BASE LOW labels
                would otherwise render directly under those icons and get
                covered (confirmed live).
                height={620} not "fill" — 2026-08-04 "chart is too shrinked"
                report. height="fill" sizes the chart off whatever viewport
                space is left below its OWN top, but "scroll to chart"
                (scrollToChart, chartZoneRef above) lands the viewport at the
                Chart zone's top (ticker/hero/execution/readiness/context/
                fundamentals-technical/AI summary all render before this),
                so the real chart canvas sits 1500-2500px further down,
                already off-screen the moment scrolling settles — confirmed
                live via measured canvas rects, height clamped to the fill
                mode's 320px floor every time. A fixed height sidesteps that
                mismatch entirely instead of chasing scroll-timing further —
                same fixed-height pattern TrendChart's other callers
                (DayTradeTab, TrendTemplateTab) already use, and matches this
                same div's own "Select a mover" placeholder height below. */}
            <div style={{ paddingRight: 90 }}>
              {chart
                ? <TrendChart data={chart} C={C} MONO={MONO} SANS={SANS} height={620} />
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
      {/* Moved here from ZONE 1 "Movers & Watchlist" (2026-08-03, real user
          report: "cot and prediction not in right place") — both are
          market-wide/macro data, not per-stock, so they belong with the
          other market-wide cards in this zone, not sandwiched into the
          per-symbol movers list above the chart. */}
      <COTPanel C={C} MONO={MONO} SANS={SANS} />
      <PredictionMarkets C={C} MONO={MONO} SANS={SANS} />
    </div>
    {explain && <AiScoreExplainer C={C} MONO={MONO} SANS={SANS} symbol={explain.symbol} aplus={explain.aplus} dimensions={explain.dimensions} label={explain.label} onClose={() => setExplain(null)} />}
    </div>
  );
}
