import { useEffect, useMemo, useRef, useState } from "react";
import { computeRegime } from "./market-helpers.js";
import TrendChart from "./TrendChart.jsx";
import CommandSearchPanel from "./CommandSearchPanel.jsx";
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
import MacroStatusStrip, { useRealMacroOverrides } from "./MacroStatusStrip.jsx";
import OptionsIntelligencePanel from "./OptionsIntelligencePanel.jsx";

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
  lightboxSettings, setLightboxSettings, openDaytradeConsole,
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
  // best trade for the day"). Only fires on a genuine fresh load — a real
  // cross-tab handoff (mterminal_load_sym) always wins and is never
  // overridden. Deliberately does NOT treat the terminalSymbol PROP as
  // "already explicit": axiom-live.jsx initializes that top-level state to
  // WATCHLIST_SYMBOLS[0] unconditionally on every load (not a real user
  // choice — confirmed live, this originally made the fetch below always
  // skip since terminalSymbol is truthy from the very first render). "Best"
  // = the #1 row of the same real hard-gated Sniper AI ranking
  // (/api/market/sniper-scan, ENTER_LONG > WAIT > NO_CHASE > AVOID, then
  // Minervini passCount/confidence) the left search panel already shows —
  // no second ranking invented for this. Honest fallback to terminalSymbol
  // (or NVDA) only if that real fetch genuinely fails or returns nothing.
  const hadExplicitSymbolRef = useRef(!!symbol);
  useEffect(() => {
    if (hadExplicitSymbolRef.current) return;
    let cancelled = false;
    fetch("/api/market/sniper-scan").then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const top = j?.ok && Array.isArray(j.results) ? j.results.find((r) => r.symbol) : null;
        setSymbol((s) => s || top?.symbol || terminalSymbol || "NVDA");
      })
      .catch(() => { if (!cancelled) setSymbol((s) => s || terminalSymbol || "NVDA"); });
    return () => { cancelled = true; };
  }, []);

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

  const [chart, setChart] = useState(null);
  const [loadingChart, setLoadingChart] = useState(false);
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoadingChart(true);
    fetch(`/api/market/trend-template?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && !d.error) setChart(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingChart(false); });
    return () => { cancelled = true; };
  }, [symbol]);

  // Real VIX index quote (not the VIXY ETF proxy the app-wide macroData
  // poll carries — see market-helpers.js's computeRegime, which already
  // looks for a real "VIX"/"^VIX" entry before falling back to a VIXY/SPY
  // proxy). One small dedicated fetch, independent of the global poll.
  const [vixQuote, setVixQuote] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/market/quote?symbols=%5EVIX").then((r) => r.json())
      .then((arr) => { if (!cancelled) setVixQuote((Array.isArray(arr) && arr[0]) || null); })
      .catch(() => {});
    load();
    const iv = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  // Market Context panel (Phase 2, 2026-08-26) — the real, already-built
  // MacroStatusStrip.jsx (SPY/QQQ/IWM/DIA/VIX/DXY-proxy/10Y/Gold/Oil/BTC +
  // real regime/treasury/credit/liquidity/employment/breadth/sector-
  // rotation scores), same component MacroTab.jsx already mounts — reused
  // as-is, not rebuilt. `fred` (real 10Y/Brent) comes from its own hook,
  // same real pattern MacroTab.jsx uses. distData reuses the real
  // vixQuote already fetched above for the top strip's own VIX pill —
  // zero new fetch, no new prop threaded from axiom-live.jsx.
  const { fred } = useRealMacroOverrides();
  const macroDistData = useMemo(() => ({ vix: vixQuote?.price ?? null }), [vixQuote]);

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
  // Market Context collapsed by default (2026-08-26, explicit user
  // request: right column was "messy" — 5 stacked sections with no
  // hierarchy, macro chips eating 40% of a narrow column's height above
  // the actual decision content). Macro data is real and unchanged either
  // way, just one click away instead of permanently open — it's the same
  // regardless of which symbol is selected, so it's the least
  // symbol-specific thing in this column and the safest to default-collapse.
  const [marketContextOpen, setMarketContextOpen] = useState(false);

  const pill = { fontFamily: MONO, fontSize: 11, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" };

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
      {dockModule === "lightbox" && <LightBoxTab C={C} MONO={MONO} SANS={SANS} lightboxSettings={lightboxSettings} setLightboxSettings={setLightboxSettings} onOpenSymbol={openDaytradeConsole} />}
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
        <div>
          {/* Options Intelligence (Phase 2, 2026-08-26) — real IV Rank/
              HV/skew/gamma/flow consolidated from previously-scattered
              real routes, keyed to Trade Desk's own selected symbol.
              OptionsChainTab below is unchanged — this is additive, not
              a replacement for the raw chain. */}
          <OptionsIntelligencePanel symbol={symbol} C={C} MONO={MONO} SANS={SANS} />
          <OptionsChainTab C={C} MONO={MONO} SANS={SANS} defaultSymbol={symbol} onOpenTerminal={selectSymbol} />
        </div>
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
      <div ref={rootRef} style={{ display: "flex", flexDirection: "column", height: rootHeight ? `${rootHeight}px` : "80vh" }}>
        {/* Top status strip — real regime/SPY/QQQ/VIX/cash/risk/autopilot */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap", background: C.card }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.text }}>AM TRADING</span>
          <span style={pill}><span style={{ color: C.textDim }}>REGIME</span> <b style={{ color: regime.color }}>{regime.label}</b></span>
          <span style={pill}><span style={{ color: C.textDim }}>SPY</span> <b style={{ color: chgColor(chg(spy)) }}>{spy ? `${chg(spy) > 0 ? "+" : ""}${chg(spy).toFixed(2)}%` : "—"}</b></span>
          <span style={pill}><span style={{ color: C.textDim }}>QQQ</span> <b style={{ color: chgColor(chg(qqq)) }}>{qqq ? `${chg(qqq) > 0 ? "+" : ""}${chg(qqq).toFixed(2)}%` : "—"}</b></span>
          <span style={pill}><span style={{ color: C.textDim }}>VIX</span> <b style={{ color: C.text }}>{vixQuote?.price != null ? Number(vixQuote.price).toFixed(1) : "—"}</b></span>
          <span style={pill}><span style={{ color: C.textDim }}>CASH</span> <b style={{ color: C.text }}>{account?.cash != null ? `$${Math.round(Number(account.cash)).toLocaleString()}` : "—"}</b></span>
          <span style={pill}><span style={{ color: C.textDim }}>RISK</span> <b style={{ color: chgColor(riskRead.pl) }}>{riskRead.count} pos · {riskRead.pl >= 0 ? "+" : ""}${Math.round(riskRead.pl).toLocaleString()}</b></span>
          <span style={{ ...pill, marginLeft: "auto" }}>
            <span>{autopilotStatus?.mode === "on" ? "🟢" : "🔴"}</span>
            <span style={{ color: C.textDim }}>Autopilot</span>
          </span>
        </div>

        {/* Middle: 3-pane on desktop, stacked segmented view on mobile — never
            force the fixed-column grid on a narrow screen (ScanTerminalHub's
            own history is the reason this is a deliberate, up-front choice). */}
        {isMobile ? (
          <MobileTradeDeskBody symbol={symbol} selectSymbol={selectSymbol} chart={chart} loadingChart={loadingChart} vcpOn={vcpOn} setVcpOn={setVcpOn} setActiveTab={setActiveTab} C={C} MONO={MONO} SANS={SANS} />
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "220px 1fr 280px" }}>
            <div style={{ borderRight: `1px solid ${C.border}`, minHeight: 0, overflow: "hidden" }}>
              <CommandSearchPanel symbol={symbol} onSelectSymbol={selectSymbol} C={C} MONO={MONO} SANS={SANS} />
            </div>
            <ChartPane symbol={symbol} chart={chart} loadingChart={loadingChart} vcpOn={vcpOn} setVcpOn={setVcpOn} C={C} MONO={MONO} SANS={SANS} />
            {/* Right column split (Phase 2, 2026-08-26, user-confirmed
                layout): Market Context on top (its own capped/scrollable
                box — MacroStatusStrip's real chip count varies with how
                much of the real regime breakdown is available and can run
                to 15+ chips, which must never grow the core zone's own
                fixed, ref-measured height — see this file's own history
                of a real runaway-growth bug from exactly that class of
                mistake), Sniper (CortexMiniPanel) below taking the rest
                via flex:1/minHeight:0, unchanged from before. */}
            <div style={{ borderLeft: `1px solid ${C.border}`, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ borderBottom: `1px solid ${C.border}`, flex: "0 0 auto" }}>
                <button
                  onClick={() => setMarketContextOpen((v) => !v)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", background: "transparent", border: "none", padding: "10px 10px", textAlign: "left" }}
                >
                  <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.6 }}>🌍 MARKET CONTEXT</span>
                  <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, color: C.textDim }}>{marketContextOpen ? "▾ hide" : "▸ show"}</span>
                </button>
                {marketContextOpen && (
                  <div style={{ maxHeight: "40vh", overflowY: "auto", padding: "0 10px 10px" }}>
                    <MacroStatusStrip C={C} MONO={MONO} macroData={macroData} distData={macroDistData} fred={fred} />
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <CortexMiniPanel symbol={symbol} onSelectSymbol={selectSymbol} setActiveTab={setActiveTab} C={C} MONO={MONO} SANS={SANS} />
              </div>
            </div>
          </div>
        )}
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
function ChartPane({ symbol, chart, loadingChart, vcpOn, setVcpOn, C, MONO, SANS }) {
  const wrapRef = useRef(null);
  const [chartHeight, setChartHeight] = useState(480);
  useEffect(() => {
    const measure = () => {
      const el = wrapRef.current;
      if (!el) return;
      // Floor raised 320 -> 420 (2026-08-25, live screenshot showed
      // TrendChart's own price-line labels — AI TARGET/PIVOT/RESISTANCE/
      // PRE-MKT/BASE LOW — visually overlapping into an illegible cluster
      // when this pane got small) — real headroom for 5 labels to space
      // out. No longer keyed on dockModule: the dock now lives outside
      // this pane's fixed-budget ancestor entirely (see the parent's own
      // comment), so opening it can't shrink this measurement anymore —
      // only a genuine window resize does.
      const h = Math.max(420, Math.floor(el.clientHeight) - 16);
      setChartHeight((prev) => (Math.abs(prev - h) > 4 ? h : prev));
    };
    measure();
    let t;
    const onResize = () => { clearTimeout(t); t = setTimeout(measure, 200); };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); clearTimeout(t); };
  }, []);

  return (
    <div style={{ minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "8px 10px 0", display: "flex", justifyContent: "flex-end" }}>
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
      <div ref={wrapRef} style={{ flex: 1, minHeight: 0, padding: "6px 10px 10px", overflowY: "auto" }}>
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

function MobileTradeDeskBody({ symbol, selectSymbol, chart, loadingChart, vcpOn, setVcpOn, setActiveTab, C, MONO, SANS }) {
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
        {view === "search" && <CommandSearchPanel symbol={symbol} onSelectSymbol={(s) => { selectSymbol(s); setView("chart"); }} C={C} MONO={MONO} SANS={SANS} />}
        {view === "chart" && (
          <div style={{ padding: "8px 10px 10px" }}>
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
        {view === "cortex" && <CortexMiniPanel symbol={symbol} onSelectSymbol={selectSymbol} setActiveTab={setActiveTab} C={C} MONO={MONO} SANS={SANS} />}
      </div>
    </div>
  );
}
