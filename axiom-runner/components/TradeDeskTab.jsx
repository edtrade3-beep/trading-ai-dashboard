import { useEffect, useMemo, useRef, useState } from "react";
import { computeRegime, computeMarketBias, SCAN_UNIVERSE } from "./market-helpers.js";
import { fetchSharedQuotes } from "./quote-store.js";
import TrendChart from "./TrendChart.jsx";
import CommandSearchPanel, { TickerHeader, pickTopOpportunities } from "./CommandSearchPanel.jsx";
import CortexMiniPanel from "./CortexMiniPanel.jsx";
import { PortfolioSnapshotCard } from "./DashboardTab.jsx";
import ActivePositionsCard from "./ActivePositionsCard.jsx";
import RhProWatchlists from "./RhProWatchlists.jsx";
import AlertsTab from "./AlertsTab.jsx";
import OptionsChainTab from "./OptionsChainTab.jsx";
import NewsTab from "./NewsTab.jsx";
import ScannerTab from "./ScannerTab.jsx";
import VcpStatusPanel from "./VcpStatusPanel.jsx";
import AutopilotPanel from "./AutopilotPanel.jsx";
import RhProScanner from "./RhProScanner.jsx";
import MarketTerminalTab from "./MarketTerminalTab.jsx";
import LightBoxTab from "./LightBoxTab.jsx";
import OptionsIntelligencePanel from "./OptionsIntelligencePanel.jsx";
import InstitutionalFlowCard from "./InstitutionalFlowCard.jsx";
import MovementIntelligenceCard from "./MovementIntelligenceCard.jsx";
import MultiTimeframePanel from "./MultiTimeframePanel.jsx";
import CatalystCard from "./CatalystCard.jsx";
import OptionsStrategyRankPanel from "./OptionsStrategyRankPanel.jsx";
import MarketContextCard from "./MarketContextCard.jsx";

// TradeDeskTab — one unified trading screen (2026-08-25, explicit user
// request/mockup: top status strip, Discover-search | Chart | Cortex
// 3-pane middle, a bottom dock of smaller modules). New, additive tab —
// see the Command Center plan (/Users/adol/.claude/plans/vivid-growing-
// crystal.md) for the full design and the precedent risk note
// (TerminalWorkspace.jsx's dead 3-column layout, ScanTerminalHub.jsx's own
// history of moving away from a side-by-side split) that shaped the
// mobile fallback below.
//
// Named "Trade Desk", not "Command Center" — this app already has a real,
// separate, already-shipped "AI Market Command Center"
// (CommandCenterTab.jsx / src/command-center-ai.js, activeTab
// "command-center": Sector Rotation/Portfolio Risk/event feed/track
// record). Picking a distinct name avoids re-colliding with that real
// feature (an earlier pass of this same work briefly overwrote that file
// by reusing its exact name — restored via git before any commit; this
// file's name/id are deliberately unrelated so it can't happen again).
//
// Reuse strategy for the bottom dock: PortfolioSnapshotCard/
// RhProWatchlists/OptionsChainTab/VcpStatusPanel/AutopilotPanel/
// LightBoxTab are genuinely self-contained (their own real fetches,
// few/no lifted-state props — LightBoxTab only needs the same
// lightboxSettings/setLightboxSettings/openDaytradeConsole its standalone
// activeTab "lightbox" already threads through, 2026-08-25: "link light
// box to trade desk as a branch") and are mounted directly. AlertsTab/
// NewsTab/ScannerTab/RhProScanner (Discover's full ranked table) are NOT —
// each needs a large set of state/handlers already lifted in
// axiom-live.jsx (the same real state its own existing alerts/news/
// scanner/rhpro-scan tabs already use) — those arrive here as pre-built
// prop bags (`alertsProps`/`newsProps`/`scannerProps`/`discoverProps`)
// spread onto the real components unchanged, rather than re-declaring
// dozens of props on this file's own signature.
//
// DISCOVER vs FULL SCAN split (2026-08-25, explicit user correction: "when
// i click on discover gives me this page with lots of tickers i want this
// page with tickers in different tab, i want discover opens specifically
// for the ticker i search"). The original DISCOVER dock module mounted
// ScanTerminalHub.jsx whole — its own ranked table PLUS a collapsible
// detail panel underneath, so opening it always showed the giant 100-
// stock table first, the searched ticker's analysis only after scrolling
// past it. Split into two real, separate destinations instead of one
// combined page:
// - DISCOVER now mounts MarketTerminalTab.jsx directly — the exact same
//   real component ScanTerminalHub's own detail panel already embeds
//   (confirmed via its own JSX: `<MarketTerminalTab key={selectedSymbol}
//   .../>`), just for the CURRENT searched symbol, with none of
//   RhProScanner's ranked-table chrome around it. key={symbol} forces a
//   clean remount (same real pattern ScanTerminalHub itself already uses)
//   whenever the searched symbol changes.
// - FULL SCAN mounts RhProScanner.jsx directly — the real 100-stock
//   ranked table/category-filter view, genuinely separate now, still the
//   same real component/data as the standalone Discover page.
// Each module gets its own fixed, distinct color (explicit user request,
// 2026-08-25: "I WANT THESE COLORED" — the row previously rendered every
// label in the same muted C.textSec regardless of state, so with no dock
// module open the whole row read as flat/identical, per the user's own
// screenshot). Deliberately NOT drawn from the app's real green/red/amber
// status system (theme.js's documented 4-color BULLISH/BEARISH/CAUTION/
// NEUTRAL palette) — these are navigation identity colors, not a signal
// read, and reusing a real status color here risks a user misreading
// "ALERTS is red" as a bearish signal. Fixed hex (not theme-swapped) since
// mid-saturation hues at this lightness hold up against both the light
// and dark surface colors.
// TD — Trade Desk's own fixed "trading terminal" palette, STANDALONE from
// the shared `C` prop (theme.js's THEME_LIGHT/THEME_DARK) — Trade Desk
// keeps its own look regardless of the app's own light/dark toggle, per
// the user's own answer "Trade Desk only" when this was first asked.
// Switched dark -> light (2026-08-30, explicit user request from a live
// screenshot: "change it from black to light"). Same key names as
// theme.js's real THEME_* objects (bg/surface/card/border/text/etc) so
// every child component that reads `C.foo` works unmodified when handed
// `TD` instead of the real `C` — only the values change, never the shape.
// Semantic green/red/amber/gold reuse theme.js's own THEME_LIGHT hexes
// (already tuned for legibility on a light ground, not re-invented here);
// accent/purple darkened from the dark palette's own cyan/violet so they
// still hold contrast against a white/light-grey ground. `theme.js` itself
// is untouched: every other tab keeps using the real `C` exactly as
// before.
const TD = {
  bg: "#f6f8fb", surface: "#ffffff", card: "#ffffff", cardHover: "#eef3f9",
  border: "#d7dee8", borderLit: "#c3ccd9",
  text: "#1a2332", textSec: "#445064", textDim: "#69758a",
  accent: "#0284c7", accentGlow: "rgba(2,132,199,0.15)",
  green: "#0d9465", greenBg: "rgba(13,148,101,0.10)", greenLight: "#4fa87e",
  red: "#c8282a", redBg: "rgba(200,40,42,0.10)", redLight: "#d9636a",
  amber: "#c96f00", amberBg: "rgba(201,111,0,0.10)",
  gold: "#9c7a1f", goldBg: "rgba(156,122,31,0.10)",
  // Purple "AI intelligence" accent (§1 of the spec: "Purple for AI
  // intelligence") — a new token, distinct from `accent` (routine
  // info/navigation) and from the real green/red/amber status system.
  // Used only for Cortex/AI-verdict chrome, never a bull/bear read.
  purple: "#7c3aed", purpleBg: "rgba(124,58,237,0.10)",
  shadow: "0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.06)",
};

const DOCK_MODULES = [
  { key: "discover", label: "DISCOVER", color: "#6366f1" },
  { key: "scanlist", label: "FULL SCAN", color: "#2563eb" },
  { key: "lightbox", label: "LIGHT BOX", color: "#f59e0b" },
  { key: "portfolio", label: "PORTFOLIO", color: "#0891b2" },
  { key: "watchlist", label: "WATCHLIST", color: "#7c3aed" },
  { key: "alerts", label: "ALERTS", color: "#db2777" },
  { key: "options", label: "OPTIONS", color: "#ea580c" },
  { key: "news", label: "NEWS", color: "#0d9488" },
  { key: "scanner", label: "SCANNER", color: "#4f46e5" },
  { key: "vcp", label: "VCP", color: "#9333ea" },
  { key: "autopilot", label: "AUTOPILOT", color: "#0284c7" },
];

export default function TradeDeskTab({
  C, MONO, SANS, macroData, sectorData, alpacaPositions, terminalSymbol, setTerminalSymbol,
  setActiveTab, isMobile, isTablet, watchlistSymbols, setWatchlistSymbols,
  alertsProps, newsProps, scannerProps, discoverProps,
  lightboxSettings, setLightboxSettings, openDaytradeConsole, openInTradeDesk,
}) {
  const [symbol, setSymbol] = useState(() => {
    try {
      const pending = localStorage.getItem("mterminal_load_sym");
      if (pending) { localStorage.removeItem("mterminal_load_sym"); return pending; }
    } catch {}
    return null;
  });
  // Default to the real best trade of the day, not a hardcoded symbol
  // (2026-08-25, explicit user request: "default open on desk trade on
  // best trade for the day"; upgraded 2026-08-30, explicit follow-up
  // request "make trade desk open automatically in best trade" — the
  // symbol this loaded used to come from the older /api/market/sniper-scan
  // top pick, which could genuinely disagree with what the left
  // Opportunity Inbox visibly labels "BEST" on the very same screen (a
  // real, confusing inconsistency: two different real rankings, only one
  // shown as authoritative). Now uses /api/market/opportunities — the
  // SAME real tiered scan (ACTIONABLE > DEVELOPING > WAIT > EXTENDED, then
  // score, then Edge Velocity) via the exact same pickTopOpportunities
  // helper CommandSearchPanel.jsx's own "BEST" headline uses — one real
  // ranking, not two, so the auto-loaded symbol always matches what the
  // panel calls "BEST" underneath it.
  //
  // Only fires on a genuine fresh load — a real cross-tab handoff
  // (mterminal_load_sym) always wins and is never overridden. Deliberately
  // does NOT treat the terminalSymbol PROP as "already explicit":
  // axiom-live.jsx initializes that top-level state to WATCHLIST_SYMBOLS[0]
  // unconditionally on every load (not a real user choice — confirmed
  // live, this originally made the fetch below always skip since
  // terminalSymbol is truthy from the very first render). Honest fallback
  // to terminalSymbol (or NVDA) only if the real Opportunity Engine scan
  // genuinely fails or finds nothing.
  const hadExplicitSymbolRef = useRef(!!symbol);
  useEffect(() => {
    if (hadExplicitSymbolRef.current) return;
    let cancelled = false;
    fetch("/api/market/opportunities").then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const top = j?.ok !== false && j?.tiers ? pickTopOpportunities(j.tiers, 1)[0] : null;
        setSymbol((s) => s || top?.symbol || terminalSymbol || "NVDA");
      })
      .catch(() => { if (!cancelled) setSymbol((s) => s || terminalSymbol || "NVDA"); });
    return () => { cancelled = true; };
  }, []);

  // Live re-sync to the real global symbol (One Engine consolidation,
  // Phase 2.1 — confirmed live bug via audit: this file's own local
  // `symbol` state previously only ever read `terminalSymbol` once, at
  // mount. If Trade Desk was already open and the user then jumped
  // symbols through an always-mounted widget outside this tab's own
  // remount cycle — e.g. the floating chart-search FAB, which calls
  // `setTerminalSymbol` directly without touching this file's own
  // `selectSymbol` — `terminalSymbol` (and `mterminal_load_sym`) would
  // update but this component's chart/fundamentals/quote panels stayed
  // frozen on the old symbol. Same real re-sync pattern
  // QuickTradePanel.jsx's own `symbolInput` effect already uses
  // correctly. Guarded on `terminalSymbol !== symbol` so this never
  // fights `selectSymbol` (which already sets both in the same tick,
  // making them equal by the time this effect re-runs) or fires before
  // a real explicit terminalSymbol exists.
  useEffect(() => {
    if (terminalSymbol && terminalSymbol !== symbol) setSymbol(terminalSymbol);
  }, [terminalSymbol]);

  // Real root-level height fix (2026-08-25, "fix chart in trade desk make
  // it fit designated section"; revised same day, 2nd pass, after a live
  // screenshot showed the chart's own price-line labels — AI TARGET/
  // PIVOT/RESISTANCE/PRE-MKT/BASE LOW — visually overlapping into an
  // illegible cluster whenever a dock module was open). This app has no
  // fixed-viewport app shell ANYWHERE — every other tab is a normal
  // scrolling page.
  //
  // rootRef/rootHeight measure and size ONLY the core zone (top strip +
  // 3-pane) — a real, HARD height, giving the chart a stable, generous,
  // never-squeezed budget. The dock (tab row + optional open panel) is
  // rendered as a plain SIBLING outside this core zone entirely (see the
  // JSX below), not a flex child competing for the same budget — a first
  // attempt tried making the whole thing minHeight-based so the dock
  // could share space with the core zone and let the page grow, but with
  // no bounded ancestor left anywhere, ChartPane's own ref-measurement
  // effect fed back into a runaway growth loop (a several-thousand-pixel
  // chart, confirmed live). Splitting the two into independent budgets is
  // simpler and avoids that whole class of feedback bug: the core zone
  // always gets the same real viewport-derived height regardless of dock
  // state, and the dock, being outside it, just adds its own real height
  // to the page/scroll length when opened — the fixed bottom StatusBar
  // stays correctly pinned to the true viewport bottom regardless.
  const rootRef = useRef(null);
  const [rootHeight, setRootHeight] = useState(null);
  useEffect(() => {
    const measure = () => {
      const el = rootRef.current;
      if (!el) return;
      const top = Math.max(0, el.getBoundingClientRect().top);
      const h = Math.max(560, Math.floor(window.innerHeight - top - 48));
      setRootHeight((prev) => (prev == null || Math.abs(prev - h) > 4 ? h : prev));
    };
    measure();
    let t;
    const onResize = () => { clearTimeout(t); t = setTimeout(measure, 200); };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); clearTimeout(t); };
  }, []);
  const selectSymbol = (s) => {
    const sym = String(s || "").trim().toUpperCase();
    if (!sym) return;
    // If the DISCOVER dock module is already open, keep it pointed at
    // whatever's currently searched — written synchronously here (not in
    // an effect) so it's in localStorage before MarketTerminalTab's own
    // key={symbol} remount (in dockBody below) reads it on mount. Same
    // real mterminal_load_sym handoff every other cross-tab symbol jump
    // in this app already uses.
    if (dockModule === "discover") {
      try { localStorage.setItem("mterminal_load_sym", sym); } catch {}
    }
    setSymbol(sym);
    setTerminalSymbol && setTerminalSymbol(sym);
  };

  // Full-Opportunity-Object handoff from Light Box (Market Opportunity
  // Intelligence Engine upgrade, 2026-08-26) — consumed two ways: (1) on a
  // genuinely FRESH mount (navigating in from the standalone Light Box
  // tab), read once from the same real localStorage key openInTradeDesk
  // (axiom-live.jsx) just wrote, matching the mterminal_load_sym
  // convention above; honestly discarded if stale (>60s old — a leftover
  // from a much earlier click should never silently reappear). (2) a live
  // click on the LightBoxTab DOCKED inside this same Trade Desk instance
  // (applyLightboxHandoff below) — no remount happens in that case, so
  // this sets the state directly instead of relying on the mount-time read.
  const [dayTradeHandoff, setDayTradeHandoff] = useState(() => {
    try {
      const raw = localStorage.getItem("lightbox_handoff_opportunity");
      if (!raw) return null;
      localStorage.removeItem("lightbox_handoff_opportunity");
      const obj = JSON.parse(raw);
      if (!obj?.symbol || Date.now() - (obj.ts || 0) > 60_000) return null;
      return obj;
    } catch { return null; }
  });
  const applyLightboxHandoff = (rowOrSymbol) => {
    const isRow = rowOrSymbol && typeof rowOrSymbol === "object";
    const sym = isRow ? rowOrSymbol.symbol : rowOrSymbol;
    if (!sym) return;
    if (isRow) {
      setDayTradeHandoff({
        symbol: sym, direction: rowOrSymbol.direction || null, lifecycle: rowOrSymbol.lifecycle || null,
        entry: rowOrSymbol.bestEntry ?? null, stop: rowOrSymbol.stop ?? null, target: rowOrSymbol.target ?? null,
        ev: rowOrSymbol.ev ?? null, opportunityGap: rowOrSymbol.opportunityGap ?? null,
        quality: rowOrSymbol.quality ?? null, grade: rowOrSymbol.grade ?? null, attentionScore: rowOrSymbol.attentionScore ?? null,
        chase: rowOrSymbol.chase ?? null, redFlags: rowOrSymbol.redFlags ?? null,
        thesis: rowOrSymbol.signalReason || rowOrSymbol.reason || null, ts: Date.now(),
      });
    }
    selectSymbol(sym);
    setDockModule(null); // close the dock so the loaded Sniper Mode/chart is immediately visible
  };

  const [chart, setChart] = useState(null);
  const [loadingChart, setLoadingChart] = useState(false);
  // Candle timeframe (Trade Desk redesign Phase 1, §6) — same real
  // &interval= param + supported-granularity set (5m/15m/30m/1h/1d/1wk) as
  // MarketTerminalTab.jsx's own chartTf/setTf; Trade Desk's ChartPane
  // previously had no picker at all (always daily). "1d" default matches
  // the existing behavior for anyone who never touches the new picker.
  const [chartTf, setChartTf] = useState("1d");
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoadingChart(true);
    fetch(`/api/market/trend-template?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(chartTf)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && !d.error) setChart(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingChart(false); });
    return () => { cancelled = true; };
  }, [symbol, chartTf]);

  // Real VIX index quote (not the VIXY ETF proxy the app-wide macroData
  // poll carries — see market-helpers.js's computeRegime, which already
  // looks for a real "VIX"/"^VIX" entry before falling back to a VIXY/SPY
  // proxy). One small dedicated fetch, independent of the global poll.
  const [vixQuote, setVixQuote] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetchSharedQuotes("^VIX")
      .then((arr) => { if (!cancelled) setVixQuote((Array.isArray(arr) && arr[0]) || null); })
      .catch(() => {});
    load();
    const iv = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  // Real company/ticker name for the active symbol (2026-08-26, explicit
  // user request: "add ticker name ... right under search"). Same real
  // /api/market/quote route + array-response shape as vixQuote above,
  // just keyed to the active symbol instead of ^VIX — day/week/month %
  // change come from the `chart` fetch above instead (buildTrendTemplate's
  // own real dayChangePct/weekChangePct/monthChangePct off the same bars
  // already loaded for the chart), so this fetch only needs to supply the
  // one real field that route doesn't have another source for: name.
  const [symbolQuote, setSymbolQuote] = useState(null);
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    fetchSharedQuotes(symbol)
      .then((arr) => { if (!cancelled) setSymbolQuote((Array.isArray(arr) && arr[0]) || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [symbol]);

  // Real beta + market cap for the ticker header (Trade Desk redesign
  // Phase 2, §3 — "only included if genuinely present on an already-
  // fetched fundamentals payload; otherwise disclosed as unavailable,
  // never fabricated"). Same real /api/market/fundamentals route
  // CortexMiniPanel.jsx already calls for its own WHY panel — a second
  // small fetch here (not threaded down from Cortex) since the header
  // renders in the left column, independent of Cortex's own load timing.
  const [fundamentals, setFundamentals] = useState(null);
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setFundamentals(null);
    fetch(`/api/market/fundamentals?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json())
      .then((d) => { if (!cancelled && d && !d.error) setFundamentals(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [symbol]);

  const [account, setAccount] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/alpaca/account").then((r) => r.json())
      .then((d) => { if (!cancelled && d?.ok) setAccount(d.account); }).catch(() => {});
    load();
    const iv = setInterval(load, 5 * 60000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const [autopilotStatus, setAutopilotStatus] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/autopilot/status").then((r) => r.json())
      .then((d) => { if (!cancelled && d?.ok) setAutopilotStatus(d); }).catch(() => {});
    load();
    const iv = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const regime = useMemo(() => {
    const augmented = vixQuote ? [...(macroData || []), { ...vixQuote, symbol: "VIX" }] : (macroData || []);
    return computeRegime(augmented);
  }, [macroData, vixQuote]);
  // Real market bias/character (same computeMarketBias input
  // MarketTerminalTab.jsx's own StrategySelectorCard already uses) — feeds
  // the new Options Strategy Ranking panel's real directional-alignment
  // score. distData comes through the same discoverProps bag Trade Desk's
  // dock already threads to MarketTerminalTab, no new prop.
  const marketBias = useMemo(() => computeMarketBias({ macroData, distData: discoverProps?.distData }), [macroData, discoverProps?.distData]);

  const find = (sym) => (macroData || []).find((m) => (m.symbol || "").toUpperCase() === sym);
  const spy = find("SPY"), qqq = find("QQQ");
  const chg = (q) => Number(q?.changesPercentage ?? 0);
  const chgColor = (v) => (v > 0 ? "#22d47e" : v < 0 ? "#ef4444" : C.textDim);

  const riskRead = useMemo(() => {
    const positions = alpacaPositions || [];
    const pl = positions.reduce((s, p) => s + (Number(p.unrealizedPL ?? p.unrealized_pl) || 0), 0);
    return { count: positions.length, pl };
  }, [alpacaPositions]);

  const [dockModule, setDockModule] = useState(null);
  // Search -> Discover handoff (2026-08-25, revised same day per explicit
  // user correction: "i want discover opens specifically for the ticker i
  // search"). DISCOVER now mounts MarketTerminalTab.jsx directly (see
  // dockBody below), which reads mterminal_load_sym once on mount — the
  // same real one-shot handoff every other cross-tab symbol jump in this
  // app already uses. Writing it right before opening the dock module
  // reuses that real mechanism rather than inventing a second one.
  const openDockModule = (key) => {
    if (key === "discover" && symbol) {
      try { localStorage.setItem("mterminal_load_sym", symbol); } catch {}
    }
    setDockModule((prev) => (prev === key ? null : key));
  };
  // VCP overlay toggle (2026-08-25, explicit user request: "vcp make it on
  // and off"; default flipped to off same day per explicit follow-up
  // request: "vcp in chart set it as off default" — matches
  // MarketTerminalTab.jsx's own established default). Trade Desk's center
  // panel always uses the self-rendered TrendChart (unlike
  // MarketTerminalTab.jsx, which SWAPS between a TradingView iframe and
  // TrendChart on this same toggle), so here it's simply flipping the
  // real vcpOverlayOn prop.
  const [vcpOn, setVcpOn] = useState(false);
  // Market Context promoted to a real top-level section above the core
  // zone (Phase 1, 2026-08-27) — replaces the old collapsed right-column
  // sub-panel (2026-08-26) now that it's the primary "top-level brain"
  // section the user explicitly asked for, not a secondary chip strip
  // competing for a narrow column's height.

  const pill = { fontFamily: MONO, fontSize: 11, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" };

  // Ticker search lifted into the top header bar (Trade Desk redesign
  // Phase 1, §2) — same real selectSymbol() this file already uses for
  // every other symbol-jump path (Opportunity Inbox rows, Light Box
  // handoff, mobile search view); CommandSearchPanel's own internal search
  // box is hidden (hideSearch below) rather than duplicated, so there is
  // still exactly one real search code path, just one new entry point.
  const [topQuery, setTopQuery] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const submitTopSearch = (raw) => {
    const s = (raw ?? topQuery).trim().toUpperCase().replace(/[^A-Z.]/g, "");
    if (s) { selectSymbol(s); setTopQuery(""); setSuggestOpen(false); }
  };
  // Ticker search autocomplete (Trade Desk redesign Phase 2, §2) — local,
  // zero-fetch prefix match over the user's own real watchlist +
  // market-helpers.js's real SCAN_UNIVERSE (the same ~100-symbol real
  // universe the rest of this app already scans/ranks) — no external
  // symbol-lookup API/dataset exists in this codebase, so this is honestly
  // scoped to "symbols this app already knows about," not the full market.
  // Watchlist matches are real, user-curated, and surface first.
  const topSuggestions = useMemo(() => {
    const q = topQuery.trim().toUpperCase();
    if (!q) return [];
    const inWatchlist = (watchlistSymbols || []).filter((s) => s.toUpperCase().startsWith(q));
    const inUniverse = SCAN_UNIVERSE.filter((s) => s.startsWith(q) && !inWatchlist.some((w) => w.toUpperCase() === s));
    return [
      ...inWatchlist.map((s) => ({ symbol: s.toUpperCase(), source: "watchlist" })),
      ...inUniverse.map((s) => ({ symbol: s, source: "universe" })),
    ].slice(0, 8);
  }, [topQuery, watchlistSymbols]);

  const dockBody = (
    <>
      {dockModule === "discover" && (
        <MarketTerminalTab
          key={symbol} C={C} MONO={MONO} SANS={SANS} sectorData={sectorData} macroData={macroData}
          distData={discoverProps?.distData} onDeepDive={discoverProps?.openDeepDiveFor} setActiveTab={setActiveTab}
          preMktMovers={discoverProps?.preMktMovers} marketSession={discoverProps?.marketSession} isMobile={isMobile}
          hideChart
        />
      )}
      {dockModule === "scanlist" && (
        <RhProScanner
          {...(discoverProps || {})} C={C} MONO={MONO} SANS={SANS} macroData={macroData} sectorData={sectorData}
          setActiveTab={setActiveTab} setTerminalSymbol={selectSymbol} watchlistSymbols={watchlistSymbols}
          setWatchlistSymbols={setWatchlistSymbols} onSelectSymbol={selectSymbol}
        />
      )}
      {dockModule === "lightbox" && <LightBoxTab C={C} MONO={MONO} SANS={SANS} lightboxSettings={lightboxSettings} setLightboxSettings={setLightboxSettings} onOpenSymbol={applyLightboxHandoff} />}
      {dockModule === "portfolio" && (
        // Active Trades (Phase 2, 2026-08-26) — was PortfolioSnapshotCard
        // alone (equity/day-change/open-position-COUNT, no per-position
        // detail). Added the real ActivePositionsCard below it, same real
        // stacking pattern DashboardTab.jsx's own "portfolio" section
        // already uses — real per-position HOLD/WARNING/TRAIL/TAKE_PARTIAL/
        // EXIT/HARD_EXIT state (position-decision-engine.js, already
        // server-attached to /api/alpaca/positions' dayTradeState), not
        // just a summary count. watchlistData omitted (optional real
        // enrichment only — Trade Desk doesn't hold that state; the card
        // degrades to macroData-only for its SPY comparison, same honest
        // fallback the component already has).
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <PortfolioSnapshotCard C={C} MONO={MONO} SANS={SANS} />
          <ActivePositionsCard C={C} MONO={MONO} SANS={SANS} setTerminalSymbol={selectSymbol} setActiveTab={setActiveTab} macroData={macroData} />
        </div>
      )}
      {dockModule === "watchlist" && (
        <RhProWatchlists C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} macroData={macroData} sectorData={sectorData} watchlistSymbols={watchlistSymbols} setTerminalSymbol={selectSymbol} />
      )}
      {dockModule === "alerts" && <AlertsTab {...(alertsProps || {})} C={C} MONO={MONO} setActiveTab={setActiveTab} />}
      {dockModule === "options" && (
        // Options Intelligence promoted out of this dock module (Trade Desk
        // redesign Phase 1, §13 — "always visible", not one click deep) —
        // now mounted in the main Workspace Grid below the core zone. This
        // dock module is the raw options chain only now, unchanged.
        <OptionsChainTab C={C} MONO={MONO} SANS={SANS} defaultSymbol={symbol} onOpenTerminal={selectSymbol} />
      )}
      {dockModule === "news" && <NewsTab {...(newsProps || {})} C={C} MONO={MONO} setActiveTab={setActiveTab} />}
      {dockModule === "scanner" && <ScannerTab {...(scannerProps || {})} C={C} MONO={MONO} setActiveTab={setActiveTab} />}
      {dockModule === "vcp" && (chart
        ? <VcpStatusPanel data={chart} C={C} MONO={MONO} SANS={SANS} />
        : <div style={{ padding: 20, fontFamily: SANS, fontSize: 12, color: C.textDim }}>Select a symbol to see its VCP status.</div>)}
      {dockModule === "autopilot" && <AutopilotPanel C={C} MONO={MONO} SANS={SANS} />}
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Fixed-budget core zone (top strip + 3-pane) — a HARD height, not a
          minHeight. 2026-08-25 (2nd pass, live screenshot): the dock used
          to be a flex sibling INSIDE this same budget, so opening it made
          flexbox shrink the 3-pane row to make room — with an unconstrained
          parent instead, that produced a much worse runaway-growth
          feedback loop (ChartPane's own ref-measurement reading back a
          size its own last render had already inflated). Real fix: the
          core zone gets its own fixed, self-contained height budget
          (exactly like the first pass), and the dock (below) is a plain
          sibling OUTSIDE it — never competing for the same space, free to
          add its own height and let the page scroll further when open. */}
      <div ref={rootRef} style={{ display: "flex", flexDirection: "column", height: rootHeight ? `${rootHeight}px` : "80vh", background: TD.bg }}>
        {/* Top header (Trade Desk redesign Phase 1, §2) — wordmark+tagline
            left, real ticker search center, real SPY/QQQ/VIX + regime +
            autopilot pills right. Fixed dark TD palette regardless of the
            app's own light/dark toggle (see TD's own comment above). */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", borderBottom: `1px solid ${TD.border}`, flexWrap: "wrap", background: TD.card }}>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: TD.text, letterSpacing: 0.4 }}>AM TRADING</span>
            <span style={{ fontFamily: SANS, fontSize: 8.5, fontWeight: 700, color: TD.textDim, letterSpacing: 1 }}>AI POWERED · DATA DRIVEN</span>
          </div>
          <div style={{ position: "relative", display: "flex", gap: 6, flex: "1 1 260px", maxWidth: 340 }}>
            <input
              value={topQuery}
              onChange={(e) => { setTopQuery(e.target.value.toUpperCase()); setSuggestOpen(true); }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 120)}
              onKeyDown={(e) => { if (e.key === "Enter") submitTopSearch(); if (e.key === "Escape") setSuggestOpen(false); }}
              placeholder="🔍 Search ticker… TSLA, AMD, NVDA"
              style={{ flex: 1, minWidth: 0, border: `1px solid ${TD.border}`, background: TD.surface, color: TD.text, borderRadius: 6, padding: "6px 10px", fontFamily: MONO, fontSize: 12, outline: "none" }}
            />
            <button onClick={() => submitTopSearch()} style={{ border: "none", background: TD.accent, color: "#ffffff", borderRadius: 6, padding: "0 12px", fontFamily: MONO, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>GO</button>
            {suggestOpen && topSuggestions.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: TD.card, border: `1px solid ${TD.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.35)", zIndex: 20, overflow: "hidden" }}>
                {topSuggestions.map((s) => (
                  <button
                    key={s.symbol}
                    onMouseDown={(e) => { e.preventDefault(); submitTopSearch(s.symbol); }}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", border: "none", background: "transparent", color: TD.text, cursor: "pointer", fontFamily: MONO, fontSize: 12 }}
                  >
                    <b>{s.symbol}</b>
                    {s.source === "watchlist" && <span style={{ fontSize: 9, fontWeight: 800, color: TD.accent, letterSpacing: 0.5 }}>WATCHLIST</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {discoverProps?.marketSession && (
            <span style={{ ...pill, marginLeft: "auto" }}>
              <b style={{ color: TD.accent }}>{String(discoverProps.marketSession).replace(/_/g, " ")}</b>
            </span>
          )}
          <span style={discoverProps?.marketSession ? pill : { ...pill, marginLeft: "auto" }}><span style={{ color: TD.textDim }}>REGIME</span> <b style={{ color: regime.color }}>{regime.label}</b></span>
          <span style={pill}><span style={{ color: TD.textDim }}>SPY</span> <b style={{ color: chgColor(chg(spy)) }}>{spy ? `${chg(spy) > 0 ? "+" : ""}${chg(spy).toFixed(2)}%` : "—"}</b></span>
          <span style={pill}><span style={{ color: TD.textDim }}>QQQ</span> <b style={{ color: chgColor(chg(qqq)) }}>{qqq ? `${chg(qqq) > 0 ? "+" : ""}${chg(qqq).toFixed(2)}%` : "—"}</b></span>
          <span style={pill}><span style={{ color: TD.textDim }}>VIX</span> <b style={{ color: TD.text }}>{vixQuote?.price != null ? Number(vixQuote.price).toFixed(1) : "—"}</b></span>
          <span style={pill}><span style={{ color: TD.textDim }}>CASH</span> <b style={{ color: TD.text }}>{account?.cash != null ? `$${Math.round(Number(account.cash)).toLocaleString()}` : "—"}</b></span>
          <span style={pill}><span style={{ color: TD.textDim }}>RISK</span> <b style={{ color: chgColor(riskRead.pl) }}>{riskRead.count} pos · {riskRead.pl >= 0 ? "+" : ""}${Math.round(riskRead.pl).toLocaleString()}</b></span>
          <span style={pill}>
            <span>{autopilotStatus?.mode === "on" ? "🟢" : "🔴"}</span>
            <span style={{ color: TD.textDim }}>Autopilot</span>
          </span>
        </div>

        {/* Middle: 3-pane on desktop, stacked segmented view on mobile — never
            force the fixed-column grid on a narrow screen (ScanTerminalHub's
            own history is the reason this is a deliberate, up-front choice). */}
        {isMobile ? (
          <MobileTradeDeskBody symbol={symbol} selectSymbol={selectSymbol} chart={chart} symbolQuote={symbolQuote} fundamentals={fundamentals} applyLightboxHandoff={applyLightboxHandoff} dayTradeHandoff={dayTradeHandoff} loadingChart={loadingChart} vcpOn={vcpOn} setVcpOn={setVcpOn} setActiveTab={setActiveTab} macroData={macroData} C={TD} MONO={MONO} SANS={SANS} />
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "220px 1fr 280px" }}>
            <div style={{ borderRight: `1px solid ${TD.border}`, minHeight: 0, overflow: "hidden", background: TD.bg }}>
              <CommandSearchPanel symbol={symbol} onSelectSymbol={selectSymbol} onOpenDaytrade={applyLightboxHandoff} chart={chart} symbolQuote={symbolQuote} fundamentals={fundamentals} C={TD} MONO={MONO} SANS={SANS} hideSearch />
            </div>
            <ChartPane symbol={symbol} chart={chart} loadingChart={loadingChart} vcpOn={vcpOn} setVcpOn={setVcpOn} C={TD} MONO={MONO} SANS={SANS} chartTf={chartTf} setChartTf={setChartTf} />
            {/* Right column (2026-08-27) — Market Context moved to its own
                real top-level section above the core zone, so this column
                is Sniper (CortexMiniPanel) alone now, taking the full
                real height instead of sharing it with a collapsed strip. */}
            <div style={{ borderLeft: `1px solid ${TD.border}`, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", background: TD.bg }}>
              <CortexMiniPanel symbol={symbol} onSelectSymbol={selectSymbol} setActiveTab={setActiveTab} dayTradeHandoff={dayTradeHandoff} macroData={macroData} C={TD} MONO={MONO} SANS={SANS} />
            </div>
          </div>
        )}
      </div>

      {/* Workspace Grid (Trade Desk redesign Phase 1) — a plain sibling
          BELOW the fixed-height core zone and ABOVE the bottom dock, never
          a flex child of the fixed-height core zone (ChartPane's own
          ref-measurement effect can runaway-grow if a variable-height
          sibling is folded into that same fixed budget). Each card here is
          self-sized and real-data-only; none of them invent a number the
          rest of the app doesn't already compute. Market Context moved
          here (2026-08-30, explicit user request — "move market context
          to that area") from its own full-width top-level strip; that
          MarketContextPanel.jsx mount is retired, MarketContextCard.jsx
          below is now the only real Market Context surface in Trade Desk. */}
      <div style={{ padding: "10px 12px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(280px, 1fr))", gap: 10, background: TD.bg, borderTop: `1px solid ${TD.border}` }}>
        <MovementIntelligenceCard symbol={symbol} chart={chart} macroData={macroData} sectorData={sectorData} C={TD} MONO={MONO} SANS={SANS} />
        <MultiTimeframePanel symbol={symbol} chart={chart} C={TD} MONO={MONO} SANS={SANS} />
        <InstitutionalFlowCard symbol={symbol} C={TD} MONO={MONO} SANS={SANS} />
        <CatalystCard symbol={symbol} C={TD} MONO={MONO} SANS={SANS} />
        <OptionsIntelligencePanel symbol={symbol} C={TD} MONO={MONO} SANS={SANS} />
        <OptionsStrategyRankPanel symbol={symbol} marketBias={marketBias} C={TD} MONO={MONO} SANS={SANS} />
        <MarketContextCard C={TD} MONO={MONO} SANS={SANS} />
      </div>

      {/* Bottom dock — 10 modules, one shared panel, only the selected one
          mounts. A plain sibling of the core zone above, not inside it —
          opening a module adds real page height/scroll instead of
          squeezing the chart. */}
      <div style={{ borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", overflowX: "auto" }}>
          {DOCK_MODULES.map((m) => (
            <button
              key={m.key}
              onClick={() => openDockModule(m.key)}
              style={{
                flex: isMobile ? "0 0 auto" : 1, padding: "8px 10px", border: "none",
                borderBottom: dockModule === m.key ? `2px solid ${m.color}` : "2px solid transparent",
                background: dockModule === m.key ? `${m.color}1a` : "transparent",
                color: m.color, opacity: dockModule === m.key ? 1 : 0.8,
                fontFamily: MONO, fontSize: 10.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        {dockModule && (
          <div style={{ maxHeight: isMobile ? "60vh" : "42vh", overflowY: "auto", borderTop: `1px solid ${C.border}` }}>
            {dockBody}
          </div>
        )}
      </div>
    </div>
  );
}

// ChartPane — desktop center panel (2026-08-25, explicit user request: "fix
// chart in trade desk make it fit designated section"). The old version
// passed TrendChart a hardcoded height={520}, which didn't match this
// panel's real available space (varies with the bottom dock open/closed,
// window height, sidebar state) — sometimes leaving dead space below the
// chart, sometimes overflowing. Fixed by measuring this panel's own real
// rendered height (via ref) instead of TrendChart's own height="fill" mode
// (that mode measures to the VIEWPORT bottom, which doesn't know about
// Trade Desk's bottom dock sitting below it — would overflow under the
// dock). Re-measures on mount, on dockModule open/close (a real, discrete
// layout change), and on a DEBOUNCED window resize — never on every resize
// tick, which is the exact "chart torn down/recreated on every pixel of a
// drag-resize" bug TrendChart.jsx's own header comment already documents
// avoiding for its own "fill" mode.
const CHART_TF_OPTIONS = [["5m", "5m"], ["15m", "15m"], ["30m", "30m"], ["1h", "1H"], ["1d", "1D"], ["1wk", "1W"]];

function ChartPane({ symbol, chart, loadingChart, vcpOn, setVcpOn, C, MONO, SANS, chartTf, setChartTf }) {
  const wrapRef = useRef(null);
  const [chartHeight, setChartHeight] = useState(480);
  // ResizeObserver (Trade Desk redesign, real live bug fix — user
  // screenshot: chart needed scrolling to see the whole thing) — a plain
  // window-resize listener only re-measures on an actual browser resize,
  // never when a SIBLING (the top header bar) changes its own real height
  // for a reason that isn't a window resize — e.g. the header's real
  // account/autopilot-status/market-session pills arriving async after
  // mount and pushing it onto a second flex-wrapped line, which shrinks
  // this pane's real available space AFTER the one-shot initial
  // measurement already ran. That stale, too-tall chartHeight is exactly
  // what forced the wrap's own overflow:auto to kick in and require
  // scrolling to see the rest of the chart. Observing wrapRef's OWN real
  // size directly (not the window) fixes the root cause instead of
  // papering over it with a scrollbar.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      // Floor lowered 420 -> 280 (was chosen for price-line label spacing
      // before the real timeframe-picker row above existed; keeping 420
      // as a floor could itself force the chart taller than this pane's
      // real remaining space on a shorter viewport, recreating the exact
      // scroll bug this fix removes. 280 still gives 5 labels reasonable
      // room; real measured height wins whenever it's larger.)
      const h = Math.max(280, Math.floor(el.clientHeight) - 16);
      setChartHeight((prev) => (Math.abs(prev - h) > 4 ? h : prev));
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div style={{ minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "8px 10px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        {/* Candle timeframe (Trade Desk redesign Phase 1, §6) — the real
            supported set only (5m/15m/30m/1H/1D/1W, same as
            MarketTerminalTab.jsx's own picker); never labeled 1m/4H since
            those granularities don't exist server-side. */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {CHART_TF_OPTIONS.map(([id, lbl]) => (
            <button key={id} onClick={() => setChartTf(id)} disabled={loadingChart}
              style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, padding: "4px 9px", borderRadius: 6, cursor: loadingChart ? "default" : "pointer",
                border: `1px solid ${chartTf === id ? C.accent : C.border}`, background: chartTf === id ? `${C.accent}18` : "transparent",
                color: chartTf === id ? C.accent : C.textDim, opacity: loadingChart ? 0.6 : 1 }}>
              {lbl}
            </button>
          ))}
        </div>
        <button
          onClick={() => setVcpOn((v) => !v)}
          title="Toggle the real VCP contraction/pivot/volume-dry-up overlay"
          style={{
            fontFamily: MONO, fontSize: 10.5, fontWeight: 800, padding: "4px 9px", borderRadius: 6, cursor: "pointer",
            border: `1px solid ${vcpOn ? "#9c5cff" : C.border}`, background: vcpOn ? "#9c5cff18" : "transparent",
            color: vcpOn ? "#9c5cff" : C.textDim,
          }}
        >
          {vcpOn ? "🟪 VCP: On" : "🟪 VCP: Off"}
        </button>
      </div>
      <div ref={wrapRef} style={{ flex: 1, minHeight: 0, padding: "6px 10px 10px", overflow: "hidden" }}>
        {chart && symbol ? (
          <TrendChart data={chart} C={C} MONO={MONO} SANS={SANS} height={chartHeight} vcpOverlayOn={vcpOn} />
        ) : (
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, textAlign: "center", padding: "60px 0" }}>
            {loadingChart ? "Loading chart…" : "Select a symbol"}
          </div>
        )}
      </div>
    </div>
  );
}

function MobileTradeDeskBody({ symbol, selectSymbol, chart, symbolQuote, fundamentals, applyLightboxHandoff, dayTradeHandoff, loadingChart, vcpOn, setVcpOn, setActiveTab, macroData, C, MONO, SANS }) {
  const [view, setView] = useState("chart");
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
        {[["search", "🔎 Search"], ["chart", "📈 Chart"], ["cortex", "🧠 Cortex"]].map(([k, label]) => (
          <button
            key={k} onClick={() => setView(k)}
            style={{ flex: 1, padding: "8px 6px", border: "none", borderBottom: view === k ? `2px solid ${C.accent}` : "2px solid transparent", background: "transparent", color: view === k ? C.accent : C.textSec, fontFamily: MONO, fontSize: 11, fontWeight: 800, cursor: "pointer" }}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {view === "search" && <CommandSearchPanel symbol={symbol} onSelectSymbol={(s) => { selectSymbol(s); setView("chart"); }} onOpenDaytrade={(r) => { applyLightboxHandoff(r); setView("chart"); }} chart={chart} symbolQuote={symbolQuote} C={C} MONO={MONO} SANS={SANS} />}
        {view === "chart" && (
          <div style={{ padding: "8px 10px 10px" }}>
            <TickerHeader symbol={symbol} chart={chart} symbolQuote={symbolQuote} fundamentals={fundamentals} C={C} MONO={MONO} SANS={SANS} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
              <button
                onClick={() => setVcpOn((v) => !v)}
                style={{
                  fontFamily: MONO, fontSize: 10.5, fontWeight: 800, padding: "4px 9px", borderRadius: 6, cursor: "pointer",
                  border: `1px solid ${vcpOn ? "#9c5cff" : C.border}`, background: vcpOn ? "#9c5cff18" : "transparent",
                  color: vcpOn ? "#9c5cff" : C.textDim,
                }}
              >
                {vcpOn ? "🟪 VCP: On" : "🟪 VCP: Off"}
              </button>
            </div>
            {chart && symbol ? (
              <TrendChart data={chart} C={C} MONO={MONO} SANS={SANS} height={380} vcpOverlayOn={vcpOn} />
            ) : (
              <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, textAlign: "center", padding: "40px 0" }}>{loadingChart ? "Loading chart…" : "Select a symbol"}</div>
            )}
          </div>
        )}
        {view === "cortex" && <CortexMiniPanel symbol={symbol} onSelectSymbol={selectSymbol} setActiveTab={setActiveTab} dayTradeHandoff={dayTradeHandoff} macroData={macroData} C={C} MONO={MONO} SANS={SANS} />}
      </div>
    </div>
  );
}
