import { useEffect, useMemo, useRef, useState } from "react";
import { computeRegime } from "./market-helpers.js";
import TrendChart from "./TrendChart.jsx";
import CommandSearchPanel from "./CommandSearchPanel.jsx";
import CortexMiniPanel from "./CortexMiniPanel.jsx";
import { PortfolioSnapshotCard } from "./DashboardTab.jsx";
import RhProWatchlists from "./RhProWatchlists.jsx";
import AlertsTab from "./AlertsTab.jsx";
import OptionsChainTab from "./OptionsChainTab.jsx";
import NewsTab from "./NewsTab.jsx";
import ScannerTab from "./ScannerTab.jsx";
import VcpStatusPanel from "./VcpStatusPanel.jsx";
import AutopilotPanel from "./AutopilotPanel.jsx";
import ScanTerminalHub from "./ScanTerminalHub.jsx";
import LightBoxTab from "./LightBoxTab.jsx";

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
// NewsTab/ScannerTab/
// ScanTerminalHub (the real, full Discover) are NOT — each needs a large
// set of state/handlers already lifted in axiom-live.jsx (the same real
// state its own existing alerts/news/scanner/rhpro-scan tabs already use)
// — those four arrive here as pre-built prop bags (`alertsProps`/
// `newsProps`/`scannerProps`/`discoverProps`) spread onto the real
// components unchanged, rather than re-declaring dozens of props on this
// file's own signature. Discover is mounted WITHOUT its own page's
// PageSubNav wrapper (SCAN/WATCHLISTS/OPTIONS FLOW/FUTURE-VALUE) — that
// subnav's own tab buttons call the app-wide setActiveTab and would
// navigate away from Trade Desk entirely, defeating the point.
const DOCK_MODULES = [
  { key: "discover", label: "DISCOVER" },
  { key: "lightbox", label: "LIGHT BOX" },
  { key: "portfolio", label: "PORTFOLIO" },
  { key: "watchlist", label: "WATCHLIST" },
  { key: "alerts", label: "ALERTS" },
  { key: "options", label: "OPTIONS" },
  { key: "news", label: "NEWS" },
  { key: "scanner", label: "SCANNER" },
  { key: "vcp", label: "VCP" },
  { key: "autopilot", label: "AUTOPILOT" },
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
    return terminalSymbol || "NVDA";
  });

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
  // Search -> Discover handoff (2026-08-25, explicit user request: "when
  // you search for stock it is link to discover for that specific stock
  // not for main page"). ScanTerminalHub.jsx (mounted below for
  // dockModule === "discover") already reads scanhub_last_symbol/
  // scanhub_force_open once on mount — the exact real one-shot handoff
  // SniperAITab.jsx's own "Open in Discover" button already uses. Since
  // this dock's ScanTerminalHub only mounts (fresh, re-running that
  // mount-time read) when the DISCOVER button is actually clicked, writing
  // those same two keys right before opening it reuses that real
  // mechanism instead of inventing a second one — Discover opens straight
  // to the currently-searched symbol's deep-dive panel, not its generic
  // ranked-list landing page. Known, consistent-with-the-rest-of-the-app
  // limitation: this fires on OPEN only (same one-shot-on-arrival contract
  // every other real handoff in this app already has) — searching a
  // different symbol while Discover is already open doesn't re-target an
  // already-mounted instance; close and reopen the dock module for that.
  const openDockModule = (key) => {
    if (key === "discover" && symbol) {
      try {
        localStorage.setItem("scanhub_last_symbol", symbol);
        localStorage.setItem("scanhub_force_open", "1");
      } catch {}
    }
    setDockModule((prev) => (prev === key ? null : key));
  };
  // VCP overlay toggle (2026-08-25, explicit user request: "vcp make it on
  // and off") — Trade Desk's center panel always uses the self-rendered
  // TrendChart (unlike MarketTerminalTab.jsx, which SWAPS between a
  // TradingView iframe and TrendChart on this same toggle), so here it's
  // simply flipping the real vcpOverlayOn prop, on by default so the
  // desk's contraction/pivot/volume-dry-up evidence is visible with zero
  // taps.
  const [vcpOn, setVcpOn] = useState(true);

  const pill = { fontFamily: MONO, fontSize: 11, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" };

  const dockBody = (
    <>
      {dockModule === "discover" && <ScanTerminalHub {...(discoverProps || {})} C={C} MONO={MONO} SANS={SANS} isTablet={isTablet} isMobile={isMobile} macroData={macroData} sectorData={sectorData} setActiveTab={setActiveTab} setTerminalSymbol={selectSymbol} watchlistSymbols={watchlistSymbols} setWatchlistSymbols={setWatchlistSymbols} />}
      {dockModule === "lightbox" && <LightBoxTab C={C} MONO={MONO} SANS={SANS} lightboxSettings={lightboxSettings} setLightboxSettings={setLightboxSettings} onOpenSymbol={openDaytradeConsole} />}
      {dockModule === "portfolio" && <PortfolioSnapshotCard C={C} MONO={MONO} SANS={SANS} />}
      {dockModule === "watchlist" && (
        <RhProWatchlists C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} macroData={macroData} sectorData={sectorData} watchlistSymbols={watchlistSymbols} setTerminalSymbol={selectSymbol} />
      )}
      {dockModule === "alerts" && <AlertsTab {...(alertsProps || {})} C={C} MONO={MONO} setActiveTab={setActiveTab} />}
      {dockModule === "options" && <OptionsChainTab C={C} MONO={MONO} SANS={SANS} defaultSymbol={symbol} onOpenTerminal={selectSymbol} />}
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
            <div style={{ borderLeft: `1px solid ${C.border}`, minHeight: 0, overflow: "hidden" }}>
              <CortexMiniPanel symbol={symbol} onSelectSymbol={selectSymbol} setActiveTab={setActiveTab} C={C} MONO={MONO} SANS={SANS} />
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
                borderBottom: dockModule === m.key ? `2px solid ${C.accent}` : "2px solid transparent",
                background: dockModule === m.key ? C.card : "transparent",
                color: dockModule === m.key ? C.accent : C.textSec,
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
