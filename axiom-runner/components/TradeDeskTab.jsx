import { useEffect, useMemo, useState } from "react";
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
// RhProWatchlists/OptionsChainTab/VcpStatusPanel/AutopilotPanel are
// genuinely self-contained (their own real fetches, few/no lifted-state
// props) and are mounted directly. AlertsTab/NewsTab/ScannerTab are NOT —
// each needs ~15-25 pieces of state/handlers already lifted in
// axiom-live.jsx (the same real state its own existing alerts/news/
// scanner tabs already use) — those three arrive here as pre-built prop
// bags (`alertsProps`/`newsProps`/`scannerProps`) spread onto the real
// components unchanged, rather than re-declaring two dozen props on this
// file's own signature.
const DOCK_MODULES = [
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
  setActiveTab, isMobile, watchlistSymbols, alertsProps, newsProps, scannerProps,
}) {
  const [symbol, setSymbol] = useState(() => {
    try {
      const pending = localStorage.getItem("mterminal_load_sym");
      if (pending) { localStorage.removeItem("mterminal_load_sym"); return pending; }
    } catch {}
    return terminalSymbol || "NVDA";
  });
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

  const pill = { fontFamily: MONO, fontSize: 11, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" };

  const dockBody = (
    <>
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
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
        <MobileTradeDeskBody symbol={symbol} selectSymbol={selectSymbol} chart={chart} loadingChart={loadingChart} setActiveTab={setActiveTab} C={C} MONO={MONO} SANS={SANS} />
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "220px 1fr 280px" }}>
          <div style={{ borderRight: `1px solid ${C.border}`, minHeight: 0, overflow: "hidden" }}>
            <CommandSearchPanel symbol={symbol} onSelectSymbol={selectSymbol} C={C} MONO={MONO} SANS={SANS} />
          </div>
          <div style={{ minHeight: 0, overflowY: "auto", padding: 10 }}>
            {chart && symbol ? (
              <TrendChart data={chart} C={C} MONO={MONO} SANS={SANS} height={520} vcpOverlayOn={true} />
            ) : (
              <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, textAlign: "center", padding: "60px 0" }}>
                {loadingChart ? "Loading chart…" : "Select a symbol"}
              </div>
            )}
          </div>
          <div style={{ borderLeft: `1px solid ${C.border}`, minHeight: 0, overflow: "hidden" }}>
            <CortexMiniPanel symbol={symbol} onSelectSymbol={selectSymbol} setActiveTab={setActiveTab} C={C} MONO={MONO} SANS={SANS} />
          </div>
        </div>
      )}

      {/* Bottom dock — 8 modules, one shared panel, only the selected one mounts */}
      <div style={{ borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", overflowX: "auto" }}>
          {DOCK_MODULES.map((m) => (
            <button
              key={m.key}
              onClick={() => setDockModule(dockModule === m.key ? null : m.key)}
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

function MobileTradeDeskBody({ symbol, selectSymbol, chart, loadingChart, setActiveTab, C, MONO, SANS }) {
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
          <div style={{ padding: 10 }}>
            {chart && symbol ? (
              <TrendChart data={chart} C={C} MONO={MONO} SANS={SANS} height={380} vcpOverlayOn={true} />
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
