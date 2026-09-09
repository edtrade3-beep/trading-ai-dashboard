import { useEffect, useMemo, useRef, useState } from "react";
import { computeRegime, computeMarketBias } from "./market-helpers.js";
import { fetchSharedQuotes } from "./quote-store.js";
import { getCachedDecision, fetchDecision } from "./decision-store.js";
import TrendChart from "./TrendChart.jsx";
import CommandSearchPanel, { TickerHeader, KeyLevelsCard, pickTopOpportunities } from "./CommandSearchPanel.jsx";
import CortexMiniPanel from "./CortexMiniPanel.jsx";
import { PortfolioSnapshotCard } from "./DashboardTab.jsx";
import ActivePositionsCard from "./ActivePositionsCard.jsx";
import RhProWatchlists from "./RhProWatchlists.jsx";
import WhatChangedPanel from "./WhatChangedPanel.jsx";
import AlertsTab from "./AlertsTab.jsx";
import OptionsChainTab from "./OptionsChainTab.jsx";
import NewsTab from "./NewsTab.jsx";
import ScannerTab from "./ScannerTab.jsx";
import VcpStatusPanel from "./VcpStatusPanel.jsx";
import AutopilotPanel from "./AutopilotPanel.jsx";
import UnifiedAutopilotPanel from "./UnifiedAutopilotPanel.jsx";
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
import ExtendedHoursMovers from "./ExtendedHoursMovers.jsx";
import MarketCommandCenter from "./MarketCommandCenter.jsx";
import TradeDeskEvidence from "./TradeDeskEvidence.jsx";
import TradeGpsCard from "./TradeGpsCard.jsx";
import BeforeItPopsPanel from "./BeforeItPopsPanel.jsx";
import HiddenGemPanel from "./HiddenGemPanel.jsx";
import OptionsBuyAssistantPanel from "./OptionsBuyAssistantPanel.jsx";
import SmartMoneyIntelPanel from "./SmartMoneyIntelPanel.jsx";
import TradeGpsWhyPanel from "./TradeGpsWhyPanel.jsx";
import TradeDeskTabs from "./TradeDeskTabs.jsx";

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
// Grouped 2026-09-05 (explicit user request: "trade desk needs to be
// more easier more effecient" — narrowed via follow-up to include "hard
// to find the right dock module"). Same 12 destinations, nothing cut or
// merged — each just carries a `group` now so the dock row below can
// cluster them instead of showing one flat, equally-weighted list.
// "SCANNER" relabeled "SMART SCAN" (its own real PDF-export title, see
// ScannerTab.jsx) — sitting directly next to "FULL SCAN" in the same
// TRADE group made the old generic name read as a duplicate.
const DOCK_MODULES = [
  { key: "discover", label: "DISCOVER", color: "#6366f1", group: "TRADE" },
  { key: "scanlist", label: "FULL SCAN", color: "#2563eb", group: "TRADE" },
  { key: "scanner", label: "SMART SCAN", color: "#4f46e5", group: "TRADE" },
  { key: "lightbox", label: "LIGHT BOX", color: "#f59e0b", group: "TRADE" },
  { key: "portfolio", label: "PORTFOLIO", color: "#0891b2", group: "ACCOUNT" },
  { key: "watchlist", label: "WATCHLIST", color: "#7c3aed", group: "ACCOUNT" },
  { key: "alerts", label: "ALERTS", color: "#db2777", group: "ACCOUNT" },
  { key: "options", label: "OPTIONS", color: "#ea580c", group: "ANALYSIS" },
  { key: "news", label: "NEWS", color: "#0d9488", group: "ANALYSIS" },
  { key: "vcp", label: "VCP", color: "#9333ea", group: "ANALYSIS" },
  // Relabeled from "AUTOPILOT" (2026-08-31 audit fix, finding #2) — this
  // dock module is Light Box's own real order-assist panel
  // (AutopilotPanel.jsx: preview/confirm real Alpaca paper orders off
  // Light Box's own detections), a genuinely different, deliberate third
  // system from src/server-autopilot.js/AutoPilotEngine.jsx (swing) and
  // the dedicated Autopilot 2.0 sidebar tab — NOT an old version of
  // either. The generic "AUTOPILOT" label, sitting right next to the
  // "LIGHT BOX" tab, read as if it were the same category of thing as
  // the real Autopilot 2.0 tab. Key unchanged (dockModule === "autopilot"
  // still works everywhere) — only the user-visible label changed.
  { key: "autopilot", label: "LB ASSIST", color: "#0284c7", group: "EXECUTION" },
  // Unified Autopilot merge, Stage 10 (2026-09-05, see .claude/plans/
  // proud-yawning-unicorn.md) — the real "AUTOPILOT" label is available
  // again now that Light Box's own panel above is unambiguously
  // "LB ASSIST". This dock module is the shared execution plumbing
  // server-autopilot.js and lightbox-autopilot-execute.js now both run
  // through (UnifiedAutopilotPanel.jsx) — the first visible surface for
  // Stages 2-8's risk gate/state machine/order log/reconciliation work,
  // none of which had a UI anywhere before this.
  { key: "unified", label: "AUTOPILOT", color: "#059669", group: "EXECUTION" },
  // INTEL group added 2026-09-09 (explicit user request: "TOO MUCH DATA
  // IN TRADE DESK I WANT ONE PAGE ONLY THE REST JUST CONNECTION AS TABS
  // IN SIDE BUT EACH TAB CONNECTED TO TRADE DESK") — these six used to
  // render unconditionally on the page (the Key Levels/Targets/Key
  // Metrics/Market Sentiment/Trade Setup/Detailed Analysis card grid,
  // BeforeItPopsPanel, HiddenGemPanel, SmartMoneyIntelPanel,
  // TradeGpsWhyPanel, ExtendedHoursMovers, and the old 7-card Workspace
  // Grid), which was the real source of the "too much data" complaint —
  // real, valuable content, just all forced onto the one page at once
  // regardless of whether a user wanted it right now. Every one of them
  // is still exactly as real and still scoped to the SAME active symbol
  // (the user's own "each tab connected to Trade Desk" requirement) —
  // only WHEN they render changed, from "always" to "when this tab is
  // selected."
  { key: "metrics",     label: "METRICS",     color: "#0ea5e9", group: "INTEL" },
  { key: "beforeitpops",label: "BEFORE IT POPS", color: "#e11d48", group: "INTEL" },
  { key: "hiddengem",   label: "HIDDEN GEM",  color: "#14b8a6", group: "INTEL" },
  { key: "buyassistant",label: "BUY ASSISTANT", color: "#f43f5e", group: "INTEL" },
  { key: "smartmoney",  label: "SMART MONEY", color: "#a855f7", group: "INTEL" },
  { key: "moreintel",   label: "MORE INTEL",  color: "#84cc16", group: "INTEL" },
  { key: "movers",      label: "MOVERS",      color: "#f59e0b", group: "INTEL" },
];
// Grouped for the dock row's rendering — Map preserves first-seen order
// (TRADE, ACCOUNT, ANALYSIS, EXECUTION), matching the array order above.
const DOCK_GROUPS = (() => {
  const map = new Map();
  for (const m of DOCK_MODULES) {
    if (!map.has(m.group)) map.set(m.group, []);
    map.get(m.group).push(m);
  }
  return [...map.entries()].map(([name, modules]) => ({ name, modules }));
})();

export default function TradeDeskTab({
  C, MONO, SANS, macroData, sectorData, alpacaPositions, terminalSymbol, setTerminalSymbol,
  setActiveTab, isMobile, isTablet, watchlistSymbols, setWatchlistSymbols,
  alertsProps, newsProps, scannerProps, discoverProps,
  lightboxSettings, setLightboxSettings, openDaytradeConsole, openInTradeDesk,
}) {
  // TD used to be a fixed dark palette, standalone from the app's real
  // light/dark toggle ("Trade Desk only" stays dark, an earlier explicit
  // decision). Reversed 2026-09-02, explicit user request after seeing it
  // live: "i want white page align with whole a platform" — Trade Desk
  // now follows the same theme as every other tab. `C` (theme.js's
  // THEME_LIGHT/THEME_DARK, already kept in sync with themeMode by
  // axiom-live.jsx) has the identical key shape TD always used, so every
  // child component below needs no changes.
  const TD = C;
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
    // Real fix (2026-09-02): this used to only call setSymbol (Trade
    // Desk's own local state), never setTerminalSymbol — the one real
    // user-driven selectSymbol() above does both. That gap meant the
    // GLOBAL terminalSymbol stayed on its own hardcoded initial default
    // (WATCHLIST_SYMBOLS[0]) forever on a fresh load, even though Trade
    // Desk itself correctly showed the real best-trade-of-day pick —
    // every OTHER top-level effect that reads terminalSymbol (Market
    // Terminal's candles/fundamentals fetches in axiom-live.jsx) kept
    // fetching data for that stale default symbol nobody was viewing,
    // instead of the real pick.
    fetch("/api/market/opportunities").then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const top = j?.ok !== false && j?.tiers ? pickTopOpportunities(j.tiers, 1)[0] : null;
        const resolved = top?.symbol || terminalSymbol || "NVDA";
        setSymbol((s) => s || resolved);
        if (!hadExplicitSymbolRef.current) setTerminalSymbol && setTerminalSymbol(resolved);
      })
      .catch(() => {
        if (cancelled) return;
        const resolved = terminalSymbol || "NVDA";
        setSymbol((s) => s || resolved);
        setTerminalSymbol && setTerminalSymbol(resolved);
      });
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

  // 2026-09-09 redesign — the old rootRef/rootHeight/gridRef fixed-pixel-
  // budget measurement (previously required here because the old layout
  // forced Chart+SEARCH+CORTEX into one hard-height flex row, fighting
  // over a shared budget) is gone along with that row. The new layout
  // below is plain, independently-sized cards in normal document flow —
  // each one takes exactly the height its own real content needs, so the
  // entire "never let a fixed-height sibling clip/overlap the next one"
  // bug class this block used to guard against no longer has anywhere to
  // occur.
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
  const [chartError, setChartError] = useState(null);
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
    setChartError(null);
    fetch(`/api/market/trend-template?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(chartTf)}`)
      .then((r) => r.json())
      .then((d) => { if (cancelled) return; if (d.error) { setChart(null); setChartError(d.error); } else setChart(d); })
      .catch((e) => { if (!cancelled) { setChart(null); setChartError(e?.message || "chart data unavailable"); } })
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

  // One authoritative decision for the desk. This is presentation-only:
  // the server returns the canonical AssetDecision and the client never
  // recomputes or relabels its verdict. Routed through decision-store.js
  // (a shared cache/dedup layer) rather than a raw fetch here, since
  // CortexMiniPanel below mounts for this exact same symbol at the same
  // time and used to fire its own independent request for the identical
  // canonical decision.
  const [canonicalDecision, setCanonicalDecision] = useState(null);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [decisionError, setDecisionError] = useState(null);
  // Trade GPS (2026-09-03) — additive fields from the SAME shared
  // decision-store.js fetch above (never a second request); TradeGpsCard
  // below reads these, CanonicalVerdictStrip/TradeDeskEvidence are
  // unaffected.
  const [tradeGpsData, setTradeGpsData] = useState(null);
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    const cached = getCachedDecision(symbol);
    setCanonicalDecision(cached.assetDecision);
    setDecisionLoading(cached.loading);
    setDecisionError(cached.error);
    setTradeGpsData({ tradeGps: cached.tradeGps, tradeStructure: cached.tradeStructure, trapShield: cached.trapShield, marketAgreement: cached.marketAgreement, tradeGpsVerdict: cached.tradeGpsVerdict, dangerEvent: cached.dangerEvent, whyNow: cached.whyNow });
    fetchDecision(symbol).then((entry) => {
      if (cancelled) return;
      setCanonicalDecision(entry.assetDecision);
      setDecisionLoading(false);
      setDecisionError(entry.error);
      setTradeGpsData({ tradeGps: entry.tradeGps, tradeStructure: entry.tradeStructure, trapShield: entry.trapShield, marketAgreement: entry.marketAgreement, tradeGpsVerdict: entry.tradeGpsVerdict, dangerEvent: entry.dangerEvent, whyNow: entry.whyNow });
    });
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
    const load = () => fetch("/api/autopilot2/status").then((r) => r.json())
      .then((d) => { if (!cancelled && d?.ok) setAutopilotStatus(d); }).catch(() => {});
    load();
    const iv = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);
  const autopilot2Running = autopilotStatus?.state?.state === "RUNNING";

  const regime = useMemo(() => {
    const augmented = vixQuote ? [...(macroData || []), { ...vixQuote, symbol: "VIX" }] : (macroData || []);
    return computeRegime(augmented);
  }, [macroData, vixQuote]);
  const displayRegime = canonicalDecision?.marketRegime || regime;
  // Real market bias/character (same computeMarketBias input
  // MarketTerminalTab.jsx's own StrategySelectorCard already uses) — feeds
  // the new Options Strategy Ranking panel's real directional-alignment
  // score. distData comes through the same discoverProps bag Trade Desk's
  // dock already threads to MarketTerminalTab, no new prop.
  const marketBias = useMemo(() => computeMarketBias({ macroData, distData: discoverProps?.distData }), [macroData, discoverProps?.distData]);

  const find = (sym) => (macroData || []).find((m) => (m.symbol || "").toUpperCase() === sym);
  const spy = find("SPY"), qqq = find("QQQ"), iwm = find("IWM");
  const chg = (q) => Number(q?.changesPercentage ?? 0);
  const chgColor = (v) => (v > 0 ? "#22d47e" : v < 0 ? "#ef4444" : C.textDim);
  const freshness = chart ? (chart.asOf || chart.updatedAt || chart.timestamp || "LIVE DATA") : "CONNECTING…";

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
  // Real bug fixed 2026-09-03 (user report: "these tabs not working");
  // simplified 2026-09-09 (explicit user request: "TOO MUCH DATA IN
  // TRADE DESK I WANT ONE PAGE ONLY THE REST JUST CONNECTION AS TABS IN
  // SIDE" — the Simple/Full view-mode distinction this used to toggle is
  // gone; the side tab rail below is always there, so opening a module
  // from here needs no extra mode switch, just openDockModule itself.
  const openTickerTab = (key) => {
    if (key === "overview") { setDockModule(null); return; }
    if (symbol) {
      try { localStorage.setItem("mterminal_load_sym", symbol); } catch {}
    }
    if (key === "journal") { setActiveTab("journal"); return; }
    if (key === "cortex") { setActiveTab("cortex"); return; }
    openDockModule(key);
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
  // Simple/Full view mode (2026-08-31) retired 2026-09-09 (explicit user
  // request: "TOO MUCH DATA IN TRADE DESK I WANT ONE PAGE ONLY THE REST
  // JUST CONNECTION AS TABS IN SIDE BUT EACH TAB CONNECTED TO TRADE
  // DESK") — that toggle's own "Simple" state already WAS this exact
  // idea (core zone only, everything else one click away), just gated
  // behind a toggle a user had to know to press. The side tab rail below
  // makes it the permanent, only layout instead of an opt-in mode, so
  // there's no longer a second mode to toggle between.
  // Market Context promoted to a real top-level section above the core
  // zone (Phase 1, 2026-08-27) — replaces the old collapsed right-column
  // sub-panel (2026-08-26) now that it's the primary "top-level brain"
  // section the user explicitly asked for, not a secondary chip strip
  // competing for a narrow column's height.

  const pill = { fontFamily: MONO, fontSize: 11, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" };

  // Real Add-to-Watchlist toggle (2026-09-09 redesign — reference spec's
  // header "☆ Add to Watchlist" button). Reuses the SAME real
  // watchlistSymbols/setWatchlistSymbols state every other watchlist
  // control in this app already shares — never a second, competing list.
  const inWatchlist = symbol ? (watchlistSymbols || []).map((s) => s.toUpperCase()).includes(symbol.toUpperCase()) : false;
  const toggleWatchlist = () => {
    if (!symbol || !setWatchlistSymbols) return;
    setWatchlistSymbols((prev) => {
      const upper = symbol.toUpperCase();
      const has = (prev || []).map((s) => s.toUpperCase()).includes(upper);
      return has ? prev.filter((s) => s.toUpperCase() !== upper) : [...(prev || []), upper];
    });
  };

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
      {dockModule === "unified" && <UnifiedAutopilotPanel C={C} MONO={MONO} SANS={SANS} />}
      {/* INTEL group (2026-09-09, "too much data" fix) — real content,
          same components as before, just moved from an always-on page
          section into this one-click-away tab, still scoped to `symbol`. */}
      {dockModule === "metrics" && (
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
            <CardWrap C={C} MONO={MONO}><KeyLevelsCard chart={chart} C={C} MONO={MONO} SANS={SANS} /></CardWrap>
            <CardWrap title="🎯 TARGETS" titleColor={C.green} C={C} MONO={MONO}><TargetsCard decision={canonicalDecision} C={C} MONO={MONO} /></CardWrap>
            <CardWrap title="📊 KEY METRICS" titleColor={C.accent} C={C} MONO={MONO}><KeyMetricsCard fundamentals={fundamentals} chart={chart} C={C} MONO={MONO} /></CardWrap>
            <CardWrap title="🌡 MARKET SENTIMENT" titleColor={C.amber} C={C} MONO={MONO}><MarketSentimentCard regime={displayRegime} decision={canonicalDecision} C={C} MONO={MONO} /></CardWrap>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(230px, 1fr))", gap: 12, alignItems: "start" }}>
            <CardWrap title="🏆 TRADE SETUP" titleColor={C.gold} C={C} MONO={MONO}><TradeSetupCard tradeGps={tradeGpsData?.tradeGps} tradeGpsVerdict={tradeGpsData?.tradeGpsVerdict} C={C} MONO={MONO} SANS={SANS} /></CardWrap>
            <CardWrap C={C} MONO={MONO}><TradeDeskEvidence decision={canonicalDecision} chart={chart} C={C} MONO={MONO} SANS={SANS} /></CardWrap>
          </div>
          <TradeGpsWhyPanel tradeGps={tradeGpsData?.tradeGps} tradeStructure={tradeGpsData?.tradeStructure} trapShield={tradeGpsData?.trapShield} C={C} MONO={MONO} SANS={SANS} />
        </div>
      )}
      {dockModule === "beforeitpops" && <BeforeItPopsPanel C={C} MONO={MONO} SANS={SANS} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab} />}
      {dockModule === "hiddengem" && <HiddenGemPanel symbol={symbol} C={C} MONO={MONO} SANS={SANS} />}
      {dockModule === "buyassistant" && <OptionsBuyAssistantPanel C={C} MONO={MONO} SANS={SANS} setTerminalSymbol={setTerminalSymbol} account={account} setActiveTab={setActiveTab} />}
      {dockModule === "smartmoney" && <SmartMoneyIntelPanel symbol={symbol} C={C} MONO={MONO} SANS={SANS} setTerminalSymbol={setTerminalSymbol} />}
      {dockModule === "movers" && <ExtendedHoursMovers C={C} MONO={MONO} SANS={SANS} onSelectSymbol={selectSymbol} />}
      {dockModule === "moreintel" && (
        <div style={{ padding: 12, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
          <MovementIntelligenceCard symbol={symbol} chart={chart} macroData={macroData} sectorData={sectorData} C={C} MONO={MONO} SANS={SANS} />
          <MultiTimeframePanel symbol={symbol} chart={chart} C={C} MONO={MONO} SANS={SANS} />
          <InstitutionalFlowCard symbol={symbol} C={C} MONO={MONO} SANS={SANS} />
          <CatalystCard symbol={symbol} C={C} MONO={MONO} SANS={SANS} />
          <OptionsIntelligencePanel symbol={symbol} C={C} MONO={MONO} SANS={SANS} />
          <OptionsStrategyRankPanel symbol={symbol} marketBias={marketBias} C={C} MONO={MONO} SANS={SANS} />
          <MarketContextCard C={C} MONO={MONO} SANS={SANS} />
        </div>
      )}
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", background: TD.bg }}>
      <MarketCommandCenter onOpenNews={() => openTickerTab("news")} C={TD} MONO={MONO} SANS={SANS} />

      {/* ── Trade Summary Header (2026-09-09 redesign) ── real header
          action buttons (Add to Watchlist / Set Alert) above the SAME
          TradeGpsCard the app already renders (unchanged internals — its
          verdict/entry/stop/target/confidence/thesis logic is untouched),
          then a real OHLC-style stats strip below it off the SAME chart/
          fundamentals/symbolQuote state already fetched above. */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 14px 0", background: TD.surface }}>
        <button
          onClick={toggleWatchlist} disabled={!symbol}
          style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, padding: "7px 14px", borderRadius: 7, border: `1px solid ${TD.border}`, background: "transparent", color: inWatchlist ? TD.gold : TD.textSec, cursor: symbol ? "pointer" : "default" }}
        >
          {inWatchlist ? "★ In Watchlist" : "☆ Add to Watchlist"}
        </button>
        <button
          onClick={() => openDockModule("alerts")} disabled={!symbol}
          style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, padding: "7px 14px", borderRadius: 7, border: "none", background: TD.accent, color: "#fff", cursor: symbol ? "pointer" : "default" }}
        >
          🔔 Set Alert
        </button>
      </div>
      <TradeGpsCard
        symbol={symbol} decision={canonicalDecision} loading={decisionLoading} error={decisionError}
        tradeGps={tradeGpsData?.tradeGps} tradeStructure={tradeGpsData?.tradeStructure}
        trapShield={tradeGpsData?.trapShield} marketAgreement={tradeGpsData?.marketAgreement}
        tradeGpsVerdict={tradeGpsData?.tradeGpsVerdict} dangerEvent={tradeGpsData?.dangerEvent} whyNow={tradeGpsData?.whyNow}
        account={autopilotStatus?.account} dailyLossLocked={autopilotStatus?.dailyLossLocked}
        C={TD} MONO={MONO} SANS={SANS}
      />
      <OhlcStatsRow chart={chart} fundamentals={fundamentals} symbolQuote={symbolQuote} C={TD} MONO={MONO} />

      {/* ── Search | Chart | AI Analysis | Risk/Avoid — the reference
          layout's main analysis row. Mobile keeps its own separate
          stacked body, unchanged.
          Real bug fix (2026-09-09, live user report: "lots of empty
          areas"): each column used to size to its own natural content —
          fine in isolation, but Cortex's real content (ask box, SETUP
          QUALITY, TRADE PLAN, FINAL DECISION, WHY breakdown) runs
          1000-1500px+ tall, while the fixed-height chart card (620px) and
          the short Risk/Avoid card ended far earlier — confirmed live via
          screenshot: a multi-hundred-pixel BLANK VOID below whichever
          column happened to be shortest, on both sides depending on
          scroll position. All four columns now share ONE real bounded
          height, with the two variable-content columns (Search's
          Opportunity Inbox, AI Analysis) scrolling internally instead of
          stretching the row — same real "give it a stable, self-contained
          budget" principle ChartPane's own height:620 card already used,
          just applied consistently across the whole row instead of one
          column at a time. */}
      {isMobile ? (
        <MobileTradeDeskBody symbol={symbol} selectSymbol={selectSymbol} chart={chart} chartError={chartError} symbolQuote={symbolQuote} fundamentals={fundamentals} applyLightboxHandoff={applyLightboxHandoff} dayTradeHandoff={dayTradeHandoff} loadingChart={loadingChart} vcpOn={vcpOn} setVcpOn={setVcpOn} setActiveTab={setActiveTab} macroData={macroData} C={TD} MONO={MONO} SANS={SANS} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "260px minmax(0,1fr) 320px 300px", gap: 12, padding: "12px 14px", alignItems: "start" }}>
          {/* Search / Opportunity Inbox — real ticker search + the same
              tiered ACTIONABLE/DEVELOPING/WAIT/EXTENDED/INVALIDATED scan +
              Day-Trade signals CommandSearchPanel.jsx always had.
              Restored to the primary flow (2026-09-09, explicit user
              request: "move search to keep the flow in right way") — it
              used to be a step buried inside the collapsed "More Analysis"
              section below, which put search AFTER the chart/analysis for
              a symbol instead of before it. hideKeyLevels: Key Levels is
              already its own card in the bottom grid; showing it twice on
              the same page would be a real duplicate, not new information. */}
          <div style={{ border: `1px solid ${TD.border}`, borderRadius: 10, background: TD.surface, height: 680, overflow: "hidden" }}>
            <CommandSearchPanel symbol={symbol} onSelectSymbol={selectSymbol} onOpenDaytrade={applyLightboxHandoff} chart={chart} symbolQuote={symbolQuote} fundamentals={fundamentals} C={TD} MONO={MONO} SANS={SANS} hideKeyLevels/>
          </div>
          {/* Chart card — real TrendChart via ChartPane, unchanged, now
              inside a real bordered card with the ticker sub-nav
              (TradeDeskTabs — Overview/Technicals/Options/News/
              Fundamentals/Cortex/Journal, unchanged) as its own header
              row, matching the reference's "Chart | Options | Financials |
              News | Analysis" tab strip. Clicking a tab still opens the
              exact same real dock module further down the page (unchanged
              openTickerTab behavior) — this only changes where the tab
              row itself is drawn. */}
          <div style={{ border: `1px solid ${TD.border}`, borderRadius: 10, background: TD.surface, overflow: "hidden", display: "flex", flexDirection: "column", height: 680 }}>
            <TradeDeskTabs symbol={symbol} activeKey={dockModule} onOpen={openTickerTab} C={TD} MONO={MONO} />
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <ChartPane symbol={symbol} chart={chart} chartError={chartError} loadingChart={loadingChart} vcpOn={vcpOn} setVcpOn={setVcpOn} C={TD} MONO={MONO} SANS={SANS} chartTf={chartTf} setChartTf={setChartTf} />
            </div>
          </div>
          {/* AI Analysis — CortexMiniPanel, entirely unchanged internals
              (ask-anything, SETUP QUALITY, FINAL DECISION, WHY breakdown —
              every real fetch/effect stays exactly as it was), just given
              its own real card frame, more real width than the old
              280-360px squeezed column ever had, and a bounded height with
              its own internal scroll (its real content is genuinely the
              longest of the four columns). */}
          <div style={{ height: 680, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <CardWrap title="🤖 AI ANALYSIS" titleColor="#818cf8" C={TD} MONO={MONO} className="h-full" bodyStyle={{ overflowY: "auto" }}>
              <CortexMiniPanel symbol={symbol} onSelectSymbol={selectSymbol} setActiveTab={setActiveTab} dayTradeHandoff={dayTradeHandoff} macroData={macroData} fundamentals={fundamentals} C={TD} MONO={MONO} SANS={SANS} />
            </CardWrap>
          </div>
          {/* Risk / Avoid — new, but zero new data: built entirely from
              canonicalDecision + tradeGpsData, the SAME shared decision-
              store.js result TradeGpsCard above already reads. Its own
              real content is short, so this card won't fill the full
              680px — a real, bounded, modest gap at the bottom of one
              card (normal in any dashboard with uneven column content) is
              a completely different, non-broken thing from the page-length
              blank void this height-matching fixes. */}
          <div style={{ height: 680, overflow: "hidden" }}>
            <RiskAvoidCard symbol={symbol} decision={canonicalDecision} tradeGpsData={tradeGpsData} C={TD} MONO={MONO} SANS={SANS} />
          </div>
        </div>
      )}

      {/* ── Side tab rail — everything that isn't the core "look at it and
          decide" screen above (2026-09-09, explicit user request: "TOO
          MUCH DATA IN TRADE DESK I WANT ONE PAGE ONLY THE REST JUST
          CONNECTION AS TABS IN SIDE BUT EACH TAB CONNECTED TO TRADE
          DESK"). Real content, real data, zero of it deleted — the old
          bottom row cards (Key Levels/Targets/Key Metrics/Market
          Sentiment/Trade Setup/Detailed Analysis), the always-on panels
          (Before It Pops, Hidden Gem, Options Buy Assistant, Smart Money
          Intel, Trade GPS Why, Extended Hours Movers), and the old
          7-card Workspace Grid all moved into the INTEL group of the
          SAME dockModule mechanism (DOCK_MODULES/dockBody above) the
          existing 12 modules already used — one real vertical tab list
          instead of a wall of always-rendered cards, and every tab still
          reads the same `symbol` this page is already on ("each tab
          connected to Trade Desk"). Replaces the old horizontal
          "12-module dock row" + "More Analysis" toggle entirely — the
          rail is just always here now, so there's no longer a second
          mode to discover or switch into. */}
      <div style={{ display: "flex", borderTop: `1px solid ${TD.border}`, minHeight: 0 }}>
        <nav aria-label="Trade Desk tabs" style={{ width: 168, flexShrink: 0, borderRight: `1px solid ${TD.border}`, background: TD.surface, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 12 }}>
          {DOCK_GROUPS.map((group) => (
            <div key={group.name}>
              <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: TD.textDim, letterSpacing: "0.08em", padding: "0 4px 4px" }}>{group.name}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {group.modules.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => openDockModule(m.key)}
                    aria-current={dockModule === m.key ? "true" : undefined}
                    style={{
                      textAlign: "left", padding: "6px 8px", border: "none", borderRadius: 6,
                      background: dockModule === m.key ? `${m.color}1f` : "transparent",
                      color: dockModule === m.key ? m.color : TD.textSec,
                      fontFamily: MONO, fontSize: 10.5, fontWeight: 800, cursor: "pointer", letterSpacing: 0.2,
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div style={{ flex: 1, minWidth: 0 }}>
          {dockModule ? (
            <div style={{ maxHeight: isMobile ? "70vh" : "60vh", overflowY: "auto" }}>{dockBody}</div>
          ) : (
            <div style={{ padding: "28px 20px", fontFamily: SANS, fontSize: 12.5, color: TD.textDim, lineHeight: 1.6 }}>
              Pick a tab on the left for more on {symbol || "this symbol"} — key levels, targets, options, news,
              alerts, smart money, and everything else Trade Desk tracks lives here, one click away.
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom status bar — reference's final required section. ── */}
      <BottomStatusBar account={account} riskRead={riskRead} autopilot2Running={autopilot2Running} C={TD} MONO={MONO} />
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
const CHART_TF_OPTIONS = [["5m", "5m"], ["15m", "15m"], ["1h", "1H"], ["4h", "4H"], ["1d", "1D"], ["1wk", "1W"]];

function ChartPane({ symbol, chart, chartError, loadingChart, vcpOn, setVcpOn, C, MONO, SANS, chartTf, setChartTf }) {
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

  // Real bug found in the 2026-09-09 redesign's live verification: this
  // root div used to be a DIRECT CSS Grid item in the old 3-pane
  // leftColW/rightColW layout, where Grid's own default align-items:stretch
  // gives an unsized item a REAL used height automatically. Now that it's
  // nested one level deeper (inside a plain flex-item wrapper div in
  // TradeDeskTab.jsx's own new Chart|AI Analysis|Risk/Avoid row), a block-
  // level child with no explicit height doesn't inherit that stretch
  // behavior — it sizes to its own CONTENT instead, and since that content
  // is `wrapRef` below (also flex:1 with no explicit height), the two
  // combine into an unbounded content-driven height that fed back into
  // ChartPane's own ResizeObserver as an ever-growing measurement
  // (confirmed live: chartHeight ballooning past 1700px, way beyond the
  // real available space, rendering a mostly-blank/off-screen chart).
  // height:"100%" makes this div genuinely fill whatever real height its
  // parent already established, so its own flex children (the timeframe
  // row + wrapRef below) distribute within a real, stable budget again.
  return (
    <div style={{ height: "100%", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
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
            {loadingChart ? "Loading chart…" : chartError ? `Chart unavailable: ${chartError}` : "Select a symbol"}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 2026-09-09 redesign — small presentational cards for the "METRICS"
// side-tab (see DOCK_MODULES/dockBody above). Each is a thin, real-data
// view over state TradeDeskTab.jsx already fetches above
// (canonicalDecision, tradeGpsData, chart, fundamentals, symbolQuote) —
// no new decision/score logic, no fabricated numbers; honest "—"/empty
// states throughout, matching this file's own established convention.

// titleColor (2026-09-09, explicit user request: "MAKE THEM TITLES WITH
// COLORS") — same "each section gets its own fixed, distinct identity
// color" precedent DOCK_MODULES already established above ("Deliberately
// NOT drawn from the app's real green/red/amber status system... these
// are navigation identity colors, not a signal read") — a title's color
// here is which SECTION this is, never a bullish/bearish read. Defaults
// to C.text (plain bold white) so a caller that doesn't care still gets
// the real, fully-bolded 2026-09-09 title fix, not a regression.
function CardWrap({ title, titleColor, C, MONO, children, style, bodyStyle }){
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%", ...style }}>
      {title && (
        <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 900, color: titleColor || C.text, letterSpacing: 0.6, padding: "10px 12px 0", flexShrink: 0 }}>{title}</div>
      )}
      <div style={{ padding: title ? "8px 12px 12px" : 0, flex: 1, minHeight: 0, ...bodyStyle }}>{children}</div>
    </div>
  );
}

// OHLC-style stats strip under the Trade Summary Header — real fields off
// chart.bars/fundamentals/symbolQuote, zero new network calls. AVG VOLUME
// is a real, directly-computed 50-bar mean off chart.bars (disclosed, not
// a fabricated round number) — the server's own chart.volRatio field is a
// RATIO, not a share count, so it can't answer "average volume" alone.
function OhlcStatsRow({ chart, fundamentals, symbolQuote, C, MONO }) {
  if (!chart || !Array.isArray(chart.bars) || !chart.bars.length) return null;
  const bars = chart.bars;
  const last = bars[bars.length - 1];
  const avgVol = (() => {
    const w = bars.slice(-50).map((b) => Number(b.volume)).filter(Number.isFinite);
    if (!w.length) return null;
    return w.reduce((s, v) => s + v, 0) / w.length;
  })();
  const fmtVol = (v) => {
    if (!Number.isFinite(v)) return "—";
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return String(Math.round(v));
  };
  const fmtPrice = (v) => (Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : "—");
  const stat = (label, value) => (
    <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 74 }}>
      <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim, letterSpacing: 0.5 }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{value}</span>
    </div>
  );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 18, padding: "10px 20px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
      {stat("OPEN", fmtPrice(last.open))}
      {stat("HIGH", fmtPrice(last.high))}
      {stat("LOW", fmtPrice(last.low))}
      {stat("PREV CLOSE", fmtPrice(symbolQuote?.previousClose))}
      {stat("VOLUME", fmtVol(last.volume))}
      {stat("AVG VOLUME", fmtVol(avgVol))}
      {stat("52W HIGH", fmtPrice(chart.hi52))}
      {stat("52W LOW", fmtPrice(chart.lo52))}
      {stat("SECTOR", fundamentals?.sector || "—")}
      {stat("INDUSTRY", fundamentals?.industry || "—")}
    </div>
  );
}

// Risk / Avoid — built entirely from canonicalDecision + tradeGpsData, the
// SAME shared decision-store.js result TradeGpsCard above already reads —
// never a second fetch, never a new score.
function RiskAvoidCard({ symbol, decision, tradeGpsData, C, MONO, SANS }) {
  const verdict = tradeGpsData?.tradeGpsVerdict?.verdict || null;
  const warningLevel = tradeGpsData?.trapShield?.warningLevel;
  const color = warningLevel === "HIGH" ? C.red : warningLevel === "CAUTION" ? C.amber : (verdict && verdict.startsWith("BUY_")) ? C.green : C.textDim;
  const headline = warningLevel === "HIGH" ? "HIGH RISK" : warningLevel === "CAUTION" ? "CAUTION" : (verdict && verdict.startsWith("BUY_")) ? "FAVORABLE" : "NO EDGE YET";
  const agreement = Number.isFinite(tradeGpsData?.marketAgreement?.count) && Number.isFinite(tradeGpsData?.marketAgreement?.total)
    ? `${tradeGpsData.marketAgreement.count} of ${tradeGpsData.marketAgreement.total} factors aligned` : null;
  const blocker = decision?.blockers?.[0] || null;
  return (
    <div style={{ border: `1px solid ${color}55`, background: `${color}12`, borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 15 }}>{warningLevel === "HIGH" ? "⚠" : warningLevel === "CAUTION" ? "◐" : "✓"}</span>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color, letterSpacing: 0.5 }}>RISK / {headline}</span>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec, lineHeight: 1.5 }}>
        {decision?.confidence != null
          ? `${decision.confidence}% confidence read.${agreement ? ` ${agreement}.` : ""}${blocker ? ` ${blocker}` : ""}`
          : (symbol ? "No real decision available for this symbol yet." : "Search a symbol to see a real risk read.")}
      </div>
      {decision?.winProbability != null && (
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10.5, paddingTop: 8, borderTop: `1px solid ${color}33` }}>
          <span style={{ color: C.textDim }}>WIN PROB</span><b style={{ color: C.text }}>{decision.winProbability}%</b>
        </div>
      )}
      {Number.isFinite(decision?.expectedValuePct) && (
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10.5 }}>
          <span style={{ color: C.textDim }}>EXP. VALUE</span><b style={{ color: decision.expectedValuePct >= 0 ? C.green : C.red }}>{decision.expectedValuePct >= 0 ? "+" : ""}{decision.expectedValuePct}%</b>
        </div>
      )}
    </div>
  );
}

function TargetsCard({ decision, C, MONO }) {
  const targets = (decision?.targets || []).filter(Number.isFinite);
  if (!targets.length) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>No real targets available.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {targets.map((t, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 12 }}>
          <span style={{ color: C.textDim }}>TARGET {i + 1}</span>
          <b style={{ color: C.green }}>${t.toFixed(2)}</b>
        </div>
      ))}
    </div>
  );
}

function KeyMetricsCard({ fundamentals, chart, C, MONO }) {
  const lastVol = Array.isArray(chart?.bars) && chart.bars.length ? chart.bars[chart.bars.length - 1].volume : null;
  const fmtVol = (v) => (Number.isFinite(v) ? (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(v)) : "—");
  const fmtCap = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return "—";
    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    return `$${n.toLocaleString()}`;
  };
  const row = (label, value) => (
    <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.text }}>{value}</span>
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {row("P/E", Number.isFinite(fundamentals?.pe) ? fundamentals.pe.toFixed(1) : "—")}
      {row("EPS", Number.isFinite(fundamentals?.eps) ? `$${fundamentals.eps.toFixed(2)}` : "—")}
      {row("MARKET CAP", fmtCap(fundamentals?.marketCap))}
      {row("VOLUME", fmtVol(lastVol))}
    </div>
  );
}

function MarketSentimentCard({ regime, decision, C, MONO }) {
  const label = regime?.label || String(regime?.regime || "—").replace(/_/g, " ");
  const color = regime?.color || C.textDim;
  const confidence = Number.isFinite(decision?.confidence) ? decision.confidence : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color }}>{label}</div>
      {confidence != null ? (
        <div>
          <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden" }}>
            <div style={{ width: `${confidence}%`, height: "100%", background: color }} />
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim, marginTop: 4 }}>{confidence}% confidence</div>
        </div>
      ) : (
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim }}>No real confidence read yet.</div>
      )}
    </div>
  );
}

function TradeSetupCard({ tradeGps, tradeGpsVerdict, C, MONO, SANS }) {
  const score = Number.isFinite(tradeGps?.score) ? tradeGps.score : null;
  const label = tradeGpsVerdict?.verdict ? tradeGpsVerdict.verdict.replace(/_/g, " ") : "NO SETUP YET";
  const color = score != null ? (score >= 70 ? C.green : score >= 40 ? C.amber : C.red) : C.textDim;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 900, color }}>{score != null ? `${score}/100` : "—"}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textSec }}>{label}</span>
      </div>
      {tradeGps?.band && <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>{tradeGps.band}</div>}
    </div>
  );
}

// Bottom status bar — real, already-computed fields only (account/
// riskRead/autopilot2Running all already fetched above).
function BottomStatusBar({ account, riskRead, autopilot2Running, C, MONO }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, padding: "8px 16px", borderTop: `1px solid ${C.border}`, background: C.surface, fontFamily: MONO, fontSize: 11 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.green }} />
        <span style={{ color: C.textDim }}>Connected</span>
      </span>
      <span style={{ color: C.textDim }}>Paper Trading <b style={{ color: C.text }}>{account?.cash != null ? `$${Math.round(Number(account.cash)).toLocaleString()}` : "—"}</b></span>
      <span style={{ color: C.textDim }}>Open Risk <b style={{ color: riskRead.pl >= 0 ? C.green : C.red }}>{riskRead.count} pos · {riskRead.pl >= 0 ? "+" : ""}${Math.round(riskRead.pl).toLocaleString()}</b></span>
      <span style={{ marginLeft: "auto", color: C.textDim }}>{autopilot2Running ? "🟢 Autopilot running" : "🔴 Autopilot stopped"}</span>
      <span style={{ color: C.textDim }}>{new Date().toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
    </div>
  );
}

function MobileTradeDeskBody({ symbol, selectSymbol, chart, chartError, symbolQuote, fundamentals, applyLightboxHandoff, dayTradeHandoff, loadingChart, vcpOn, setVcpOn, setActiveTab, macroData, C, MONO, SANS }) {
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
              <div style={{ fontFamily: SANS, fontSize: 12, color: chartError ? C.amber : C.textDim, textAlign: "center", padding: "40px 0" }}>{loadingChart ? "Loading chart…" : chartError ? `Chart unavailable: ${chartError}` : "Select a symbol"}</div>
            )}
          </div>
        )}
        {view === "cortex" && <CortexMiniPanel symbol={symbol} onSelectSymbol={selectSymbol} setActiveTab={setActiveTab} dayTradeHandoff={dayTradeHandoff} macroData={macroData} fundamentals={fundamentals} C={C} MONO={MONO} SANS={SANS} />}
      </div>
    </div>
  );
}
