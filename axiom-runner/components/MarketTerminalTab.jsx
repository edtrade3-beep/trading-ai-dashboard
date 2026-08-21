import { useState, useEffect, useCallback, useRef } from "react";
import SmartMoneyDecisionPanel from "./SmartMoneyDecisionPanel.jsx";

// Trend & Base Rating overlay — collapsed to a small pill by default
// (2026-08-05, real user report with a screenshot: the full card was
// opaque and large enough to hide real candles/price behind it,
// especially on mobile). Tap to expand the full rating + PIVOT/STOP/T1/
// T2/T3 detail; collapses back to the pill on a second tap. Same real
// formula as before (chart.score/chart.setup fields), just gated behind
// a toggle instead of always-open.
function TrendRatingOverlay({ chart, C, MONO, SANS, isMobile }) {
  const [open, setOpen] = useState(false);
  const passC = Number(chart.score) || 0;
  const vcpS = Number(chart?.setup?.report?.score) || 0;
  const baseDepth = Number(chart?.setup?.vcp?.baseDepth);
  const depthPenalty = Number.isFinite(baseDepth) && baseDepth > 25 ? Math.min(30, Math.round((baseDepth - 25) * 1.2)) : 0;
  const rating = Math.max(0, Math.min(100, Math.round((passC / 8) * 50 + (vcpS / 100) * 50) - depthPenalty));
  const rColor = rating >= 80 ? "#22d47e" : rating >= 60 ? "#d6a312" : rating >= 40 ? "#f59e0b" : "#ef4444";
  const rWord = rating >= 80 ? "STRONG" : rating >= 60 ? "GOOD" : rating >= 40 ? "FAIR" : "WEAK";
  const su = chart?.setup;
  const aiTarget = su ? (su.contractionLow && su.entry > su.contractionLow
    ? Math.round((su.entry + (su.entry - su.contractionLow)) * 100) / 100
    : su.target2) : null;
  const price = Number(chart.livePrice) || Number(chart.price) || null;
  const upside = aiTarget && price ? Math.round(((aiTarget - price) / price) * 100) : null;
  const t1 = su && su.actionable ? Math.round((su.entry + (su.entry - su.stop)) * 100) / 100 : null;
  const levels = su && su.actionable ? [
    ["T3", su.target3, "#0d9465"], ["T2", su.target2, "#16a34a"], ["T1", t1, "#5ab552"],
    ["PIVOT", su.entry, C.accent], ["STOP", su.stop, "#ef4444"],
  ].filter(([, v]) => Number.isFinite(Number(v))) : [];

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} title="Show Trend & Base Rating + trade levels"
        style={{ position: "absolute", top: 52, left: 12, zIndex: 5, cursor: "pointer",
          background: C.card || "#fff", border: `1px solid ${rColor}`, borderRadius: 999, padding: "4px 10px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 900, color: rColor, lineHeight: 1 }}>{rating}</span>
        <span style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 800, color: rColor }}>{rWord}</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>▾</span>
      </button>
    );
  }
  return (
    <div style={{ position: "absolute", top: 52, left: 12, zIndex: 5,
      background: C.card || "#fff", border: `1px solid ${rColor}`, borderRadius: 12, padding: "8px 14px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.18)", minWidth: 132, maxWidth: isMobile ? 200 : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: 1, flex: 1 }}>TREND & BASE RATING</span>
        <button onClick={() => setOpen(false)} title="Collapse"
          style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, background: "transparent", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: SANS, fontSize: 30, fontWeight: 900, color: rColor, lineHeight: 1 }}>{rating}</span>
        <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 800, color: rColor, letterSpacing: 0.5 }}>{rWord}</span>
      </div>
      {/* GO/WAIT/AVOID badge removed here (2026-08-09, decision-clarity
          audit) — it read su.verdict, the exact same value the EXECUTION
          section below the chart already shows; a true duplicate, not a
          second opinion. The rating number and PIVOT/STOP/T1-T3 levels
          above/below are this pill's real unique content, kept as-is. */}
      {upside != null && <div style={{ fontFamily: MONO, fontSize: 10, color: "#f59e0b", marginTop: 5 }}>🎯 {upside > 0 ? "+" : ""}{upside}% to target</div>}
      {levels.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
          {levels.map(([label, val, col]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 14, fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: "#fff", background: col, borderRadius: 4, padding: "2px 7px", marginBottom: 3 }}>
              <span>{label}</span><span>${Number(val).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Journal Notes — moved out to its own component (2026-08-09, decision-
// clarity/length audit) from an inline block that used to render on every
// wsTab view of the Chart page; now mounted once, on the "📰 Symbol News"
// dTab sub-tab, alongside the news it's read next to. Reads the same
// rhpro_journal store the sidebar "Journal" tab (RhProJournal) owns,
// filtered to this symbol. Read-only here on purpose — RhProJournal
// already owns the one write path (equity P&L math, mistakes/emotion
// fields) and duplicating that form here risked a second, drifting copy
// of it instead of just linking to it.
function JournalNotesPanel({ sym, C, MONO, SANS, setActiveTab }) {
  if (!sym) return null;
  const entries = rhLoadJournal()
    .filter(t => String(t.symbol || "").toUpperCase() === sym.toUpperCase())
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 5);
  return (
    <div style={{ marginTop: 14 }}>
      <SectionHeaderStandalone icon="📓" label={`${sym} JOURNAL NOTES`} C={C} SANS={SANS} />
      {!entries.length ? (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", background: C.card, fontFamily: SANS, fontSize: 12, color: C.textDim }}>
          No journal notes yet for {sym}.{" "}
          <span onClick={() => setActiveTab("rhpro-journal")} style={{ color: C.accent, cursor: "pointer", fontWeight: 700 }}>Log one →</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map(t => (
            <div key={t.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", background: C.card }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{t.date}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: t.side === "short" ? C.red : C.green }}>{String(t.side || "").toUpperCase()}</span>
                {Number.isFinite(Number(t.entry)) && Number.isFinite(Number(t.exit)) && (
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.textSec }}>${t.entry} → ${t.exit}</span>
                )}
                {t.pnl !== undefined && (
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: Number(t.pnl) >= 0 ? C.green : C.red }}>${Number(t.pnl).toLocaleString()}</span>
                )}
                {t.emotion && <span style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>· {t.emotion}</span>}
              </div>
              {t.notes && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, marginTop: 4 }}>"{t.notes}"</div>}
              {t.mistakes && <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.red, marginTop: 2 }}>Mistake: {t.mistakes}</div>}
            </div>
          ))}
          <span onClick={() => setActiveTab("rhpro-journal")} style={{ fontFamily: MONO, fontSize: 11, color: C.accent, cursor: "pointer", fontWeight: 700, alignSelf: "flex-start" }}>Full journal →</span>
        </div>
      )}
    </div>
  );
}
// Real "as of Xm ago" formatter for the Decision Workspace's Confirmed
// State panel (Phase 3, 2026-08-20) — same real pattern LightBoxCard.jsx
// already established for the identical "confirmed can lag live" honesty
// requirement, just module-scope here since MarketTerminalTab is one big
// component rather than a small card.
function ageLabelMtf(updatedAt) {
  if (!updatedAt) return null;
  const ms = Date.now() - new Date(updatedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}
// Standalone twin of the SectionHeader defined inside the main component
// below (that one closes over local `C`/tone vars via component scope;
// this module-level component takes C/SANS as props instead, since
// JournalNotesPanel is declared outside the main function and can't reach
// those closures).
function SectionHeaderStandalone({ icon, label, C, SANS }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 7, marginBottom: 6, borderBottom: `2px solid ${C.accent}` }}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22,
        borderRadius: 6, background: `${C.accent}1c`, fontSize: 12, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 900, letterSpacing: 0.3, color: C.text, textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

// Section header — same treatment for every section on this page. Module-
// level (2026-08-19 real bug fix — was previously defined INSIDE
// MarketTerminalTab's render body, which meant React saw a brand-new
// component function on every single render and unmounted+remounted every
// <SectionHeader> instance each time, same real bug AccordionSection below
// had, just harmless here since this one has no children/effects of its
// own). `tone` defaults to the brand accent; "gold" is reserved for AI
// SUMMARY only (theme.js's documented gold contract).
function SectionHeader({ icon, label, tone, C, SANS }) {
  const tc = tone === "gold" ? C.gold : C.accent;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 7, marginBottom: 6, borderBottom: `2px solid ${tc}` }}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22,
        borderRadius: 6, background: `${tc}1c`, fontSize: 12, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 900, letterSpacing: 0.3, color: C.text, textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

// One-section-open-at-a-time accordion wrapper (2026-08-19 reorg). Module-
// level — REAL BUG FIX, 2026-08-19: this was originally defined INSIDE
// MarketTerminalTab's render body (closing over `openSection`/
// `setOpenSection` directly). That made it a brand-new component function
// on every single render of the page, so React tore down and rebuilt the
// ENTIRE open section's subtree (DecisionCard, MarketPulseBar, the chart,
// everything) on every re-render — including refiring every child's mount-
// time fetch (MarketPulseBar's SPY/QQQ/DIA + VIX/BTC calls, etc.) dozens of
// times a second. That's the real cause of a live user report: "the whole
// workspace is static[ally] flashing." Fixed by hoisting to module scope
// with explicit props (same fix already applied to SectionHeader above,
// same reason `SectionHeaderStandalone` already lived at module scope) —
// a stable function reference now, so React correctly treats it as the
// same component across renders and only re-renders (not remounts) it.
function AccordionSection({ id, icon, label, summary, tone, children, C, MONO, SANS, openSection, setOpenSection }) {
  const isOpen = openSection === id;
  const tc = tone === "gold" ? C.gold : C.accent;
  return (
    <div style={{ marginBottom: 14 }}>
      <div onClick={() => setOpenSection(isOpen ? null : id)}
        style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 7, marginBottom: isOpen ? 10 : 0, borderBottom: `2px solid ${tc}`, cursor: "pointer" }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22,
          borderRadius: 6, background: `${tc}1c`, fontSize: 12, flexShrink: 0 }}>{icon}</span>
        <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 900, letterSpacing: 0.3, color: C.text, textTransform: "uppercase", flexShrink: 0 }}>{label}</span>
        {!isOpen && summary && <span style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{summary}</span>}
        <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.accent, flexShrink: 0 }}>{isOpen ? "▴ Close" : "▾ Open"}</span>
      </div>
      {isOpen && <PanelErrorBoundary label={label}>{children}</PanelErrorBoundary>}
    </div>
  );
}
import CompanyOverviewCard from "./CompanyOverviewCard.jsx";
import { rhLoadJournal } from "./rhpro-journal.jsx";
import TrendSetupPanel from "./TrendSetupPanel.jsx";
import SmartScanPanel from "./SmartScanPanel.jsx";
import {
  EarningsSnapshot, EarningsBars, AiWhyPanel, BullBearPanel, NewsPanel, SectorHeatStrip,
  MarketPulseBar, SentimentRow, MarketNewsWire, AnalystPeerPanel,
  FundamentalsPanel, CompanyProfile, AiPredictPanel, COTPanel,
  SocialFeed, InvestorsPanel,
  OptionsFlowPanel,
} from "./terminal-panels.jsx";
import { PanelErrorBoundary } from "./ui-atoms.jsx";
import DecisionCard from "./DecisionCard.jsx";
import FoundationCard from "./FoundationCard.jsx";
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
  deriveTopLevelScores, computeAiTradeScore, computeInstitutionScore, computeMarketBias, computeReversalDetector,
  computeTechnicalRead, classifyEntryType, computeSetupScore, computeDecisionStrength, computeDataQuality,
} from "./market-helpers.js";
import { computeSniperDecision } from "./sniper-decision.js";
import { computeHeatRisk, computeCortexVerdict } from "./cortex-engine.js";
import { computeMtfAlignment } from "./mtf-combiner.js";
// Staged Swing-Entry System (2026-08-20) — fixes the root bug where
// entryPrice was unconditionally assigned the pivot price. See
// entry-engine.js's own header for the full design; see below for where
// entryPlanDW replaces sniperD.entry as the source of "what IS the real,
// executable entry right now."
import { computeEntryPlan } from "./entry-engine.js";
import { computeSimpleDecision } from "./simple-decision.js";
import AiScoreExplainer, {
  AplusBadge, TRADE_SETUP_DIMENSIONS, STOCK_QUALITY_DIMENSIONS, INSTITUTIONAL_GRADE_DIMENSIONS,
  TECHNICAL_DIMENSIONS, TIMING_DIMENSIONS, AI_TRADE_ENGINE_DIMENSIONS, FOUNDATION_DIMENSIONS, FOUNDATION_LABEL,
} from "./AiScoreExplainer.jsx";
import { stockQualityBreakdown } from "./rhpro-shared.jsx";
import { mapToAiAction, simpleDecisionToAiAction } from "./ai-actions.js";
import AiTradeCard from "./AiTradeCard.jsx";
import StrategySelectorCard from "./StrategySelectorCard.jsx";
import ChecklistCard from "./ChecklistCard.jsx";
import { computeChecklist } from "./checklist-engine.js";
// Market Context strip (2026-08-04 decision-first redesign, Phase 6) — the
// exact same real component MacroTab.jsx mounts (extracted out of that file
// so both pages share one real implementation instead of a second,
// potentially-diverging copy).
import MacroStatusStrip, { useRealMacroOverrides } from "./MacroStatusStrip.jsx";
// Real regime read (MTF spec §20, 2026-08-20) — the SAME single source of
// truth MarketRegimeCard/MissionStatusCard already use (SPY/QQQ/VIX-based),
// not a second regime formula. Collapsed from its 5 display labels to the
// spec's 3-bucket RISK_ON/NEUTRAL/RISK_OFF vocabulary where it's consumed.
import { computeRegimeLabel } from "./DashboardTab.jsx";
// Headline-number display font — same token terminal-panels.jsx/
// TrendSetupPanel.jsx already use for their stat-box values (P/E, targets,
// Fear&Greed score, etc). This file's own price/stat pills previously used
// MONO for those numbers, which read fine but didn't match the rest of the
// app's established "MONO = precise data label, NUM = headline stat" split.
import { NUM } from "./theme.js";

// Combined Market-Terminal page: movers leaderboard on the left, pro chart with
// AI overlays on the right. Click a mover → it loads in the chart.
export default function MarketTerminalTab({ C, MONO, SANS, sectorData, macroData, distData, onDeepDive, setActiveTab, preMktMovers, marketSession, isMobile }) {
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
  // Deep-link sub-tab (2026-08-19 reorg) — Smart Scan/Options Flow/
  // Valuation/Analysts/Investors/Earnings/Company/Social/News, each a real
  // self-contained panel reached from the 6-section hierarchy's "→" links
  // below rather than shown inline. The chart itself used to be one of
  // these ("chart") — it's now permanently part of the TECHNICAL section
  // instead, so it's no longer a dTab option.
  const [dTab, setDTab] = useState("smart");
  // Collapsed by default (2026-08-10, Workspace-length audit) — Zone 1
  // (Movers/Watchlist table + Market Wire headlines) measured at ~2100px,
  // 30% of the page, and it's generic market-discovery content, not
  // specific to whichever symbol is actually loaded below it. Same
  // collapse-by-default pattern as the accordion sections below — real
  // content, just not the first thing between a viewer and "should I buy
  // this."
  const [showMoversZone, setShowMoversZone] = useState(false);
  // Six-section hierarchy (2026-08-19, "AM TRADING — FINAL STOCK WORKSPACE
  // ORGANIZATION" spec) — replaces the old wsTab (decision/deepdive) +
  // showFullAnalysis + showSupportingDetail three-flag system with one:
  // DECISION → SETUP → TECHNICAL → MARKET & CONTEXT → BUSINESS →
  // INTELLIGENCE, one section open at a time (opening a new one collapses
  // whichever was open — see AccordionSection below), DECISION open by
  // default. Every real panel keeps its exact original computation — this
  // only changes which section it renders under and when. `null` means
  // every section is collapsed (user closed Decision without opening
  // anything else).
  const [openSection, setOpenSection] = useState("decision");
  // True once the user has opened ANY section other than Decision — same
  // role the old showFullAnalysis flag played for fetch-gating (stop
  // *fetching* secondary data on every symbol load, not just stop
  // rendering it — the real fix for memory/502 pressure, not just visual
  // clutter).
  const deepOpen = openSection != null && openSection !== "decision";
  // Tracks which symbol the secondary (options-flow/dark-pool/gamma/short-
  // interest/news+sentiment/fundamentals) fetches have already run for, so
  // opening/closing/reopening any non-Decision section for the SAME symbol
  // doesn't re-fire them, but switching symbols while one is open still
  // gets fresh data.
  const fullAnalysisFetchedForRef = useRef(null);
  // Data-identity guard (MTF Decision System, data-integrity audit,
  // 2026-08-20) — the symbol most recently REQUESTED via loadSym. Every
  // fetch that can write `chart` checks this before calling setChart, so a
  // slow response for a symbol the user has already navigated away from
  // (real network latency has no ordering guarantee — a fetch fired for
  // symbol A can resolve AFTER a later fetch fired for symbol B) can never
  // overwrite the currently-displayed symbol's price/company data with a
  // different symbol's. This is the concrete root cause of a real reported
  // bug (CLSK's header showing "NVIDIA Corporation") — the same race
  // existed, unguarded, in every per-symbol fetch effect below; each now
  // carries its own local `cancelled` guard (same fix, effect-scoped).
  const chartRequestRef = useRef(null);
  const [chartTf, setChartTf] = useState("1d"); // chart candle granularity, 5m → 1wk
  // Trend & Base Rating overlay visibility (2026-08-06, explicit user
  // request "make trend base rating hidable") — persisted so a user who
  // doesn't want it stays hidden across symbols/sessions, not just a
  // per-view collapse. Default on (matches existing behavior).
  const [showTrendRating, setShowTrendRating] = useState(() => { try { return localStorage.getItem("chart_trend_rating_visible") !== "off"; } catch { return true; } });
  // Full detailed Entry/Decision analysis — collapsed by default
  // (2026-08-20, "5-Second Rule" simplification). The simple decision
  // card above answers the trade in 5 seconds; the full staged plan,
  // score boxes, and MTF panel are still fully computed and available,
  // just not the FIRST thing shown, per the explicit "the user should
  // see the conclusion, not 20 different scores" directive.
  const [showFullEntryAnalysis, setShowFullEntryAnalysis] = useState(false);
  const toggleTrendRating = () => {
    setShowTrendRating(v => { const nv = !v; try { localStorage.setItem("chart_trend_rating_visible", nv ? "on" : "off"); } catch {} return nv; });
  };
  // Live TradingView embed (2026-08-05, "still dont like the chart... make
  // it live and stretched") — same real widget/theme-detection pattern
  // already proven in DayTradeTab/MultiTfTab/TrendTemplateTab/
  // TerminalWorkspace, real intraday ticks instead of the 45s-polled daily
  // bar TrendChart canvas.
  const tvTheme = (C.bg && /^#0|^#1/i.test(C.bg)) ? "dark" : "light";
  const TV_INTERVAL = { "5m": "5", "15m": "15", "30m": "30", "1h": "60", "1d": "D", "1wk": "W" };
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
    // Real symbol change (not just a timeframe change on the same symbol) —
    // clear the Full Analysis fetch-guard so the secondary fetches run
    // again for the new symbol next time that section is open.
    if (symbol !== sym) fullAnalysisFetchedForRef.current = null;
    const useTf = tf || chartTf;
    setSym(symbol); setLoadingChart(true);
    chartRequestRef.current = symbol; // this is now the one symbol allowed to write `chart`
    fetch(`/api/market/trend-template?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(useTf)}`)
      .then(r => r.json())
      .then(d => { if (!d.error && chartRequestRef.current === symbol) setChart(d); })
      .catch(() => {})
      .finally(() => setLoadingChart(false));
  }, [chartTf, sym]);
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
    const symbol = sym;
    const t = setInterval(() => {
      fetch(`/api/market/trend-template?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(chartTf)}`)
        .then(r => r.json()).then(d => { if (d && !d.error && chartRequestRef.current === symbol) setChart(d); }).catch(() => {});
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
  // Gated on deepOpen (2026-08-19, Decision Card redesign; renamed from
  // showFullAnalysis in the 6-section reorg, same behavior) — the Market
  // Cap/P/E pills (now in BUSINESS) and Valuation dTab this fed live inside
  // sections closed by default (Valuation's own FundamentalsPanel
  // self-fetches independently, unaffected). One honest side effect: the
  // header's "{fund.name}" subtitle next to the ticker also goes quiet until
  // any non-Decision section is opened — an accepted minor tradeoff, not a
  // bug, in exchange for not fetching this on every symbol load.
  const [fund, setFund] = useState(null);
  useEffect(() => {
    if (!sym || !deepOpen) return;
    let cancelled = false;
    setFund(null);
    fetch("/api/market/fundamentals?symbol=" + encodeURIComponent(sym))
      .then(r => r.json()).then(j => { if (!cancelled) setFund(j && !j.error ? j : null); }).catch(() => {});
    return () => { cancelled = true; };
  }, [sym, deepOpen]);

  // Own trend-screen row for the loaded symbol — the Movers/Watchlist
  // termTrendMap below only covers rows currently on screen in that list,
  // but the chart symbol can be anything typed/searched, so it needs its
  // own real fetch to drive the Stock Quality + Trade Setup score chips
  // (2026-07-28, Phase 1 institutional research consolidation).
  const [symTrend, setSymTrend] = useState(null);
  useEffect(() => {
    if (!sym) return;
    let cancelled = false;
    setSymTrend(null);
    fetch(`/api/market/trend-screen?symbols=${encodeURIComponent(sym)}`)
      .then(r => r.json())
      .then(j => { if (cancelled) return; const row = (j.results || []).find(r => !r.error); setSymTrend(row || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sym]);

  // Real 4H SWING_SETUP + 1H EARLY_DEVELOPMENT reads (MTF Decision System
  // Phase 2, 2026-08-20) for the Decision Workspace's MTF panel — own
  // fetch since these are new, dedicated timeframes not covered by the
  // trend-screen (Daily) or Day Trade Mode (15m) fetches elsewhere.
  const [symMtf, setSymMtf] = useState(null);
  useEffect(() => {
    if (!sym) return;
    let cancelled = false;
    setSymMtf(null);
    // abovePivotPct passed through once symTrend has loaded (Phase 4) so
    // the server can compute a real Anti-Chase read — re-fires when it
    // arrives rather than requiring symTrend to already be loaded first,
    // since the two fetches otherwise race.
    const apctParam = Number.isFinite(symTrend?.abovePivotPct) ? `&abovePivotPct=${symTrend.abovePivotPct}` : "";
    // Real Daily bias (same one-liner as dwDailyBias below), passed
    // through so the server's 15M entry-trigger read (entry15m) can pick
    // the correct bullish/bearish branch — same real classification, not
    // recomputed differently.
    const direction = symTrend ? ((String(symTrend.stage || "").includes("2") && Number(symTrend.passCount || 0) >= 6) ? "BULLISH" : String(symTrend.stage || "").includes("4") ? "BEARISH" : "NEUTRAL") : null;
    const dirParam = direction ? `&direction=${direction}` : "";
    fetch(`/api/market/mtf?symbol=${encodeURIComponent(sym)}${apctParam}${dirParam}`)
      .then(r => r.json())
      .then(j => { if (!cancelled) setSymMtf(j && j.ok ? j : null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sym, symTrend?.abovePivotPct, symTrend?.stage, symTrend?.passCount]);

  // Real persisted, server-confirmed 8-state read (MTF Decision System
  // Phase 3, 2026-08-20) — the debounced WATCH/EARLY/START/ADD/HOLD/
  // EXIT_WARNING/REDUCE/EXIT state, computed once server-side on a 15-min
  // background tick (src/mtf-state-store.js), same "one authoritative
  // background job, every client just reads it" discipline Light Box
  // already uses. Only covers watchlist symbols the tick has rotated
  // through — an honest null (not fabricated) for anything else, same as
  // "4H data unavailable" elsewhere in this panel.
  const [symMtfState, setSymMtfState] = useState(null);
  useEffect(() => {
    if (!sym) return;
    let cancelled = false;
    setSymMtfState(null);
    fetch(`/api/market/mtf-state?symbol=${encodeURIComponent(sym)}`)
      .then(r => r.json())
      .then(j => { if (!cancelled) setSymMtfState(j && j.ok ? j.entry : null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sym]);

  // Decision History (Phase 5, 2026-08-20) — the real persisted state-
  // transition log the background tick already writes (mtf-state-store.js),
  // filtered to this symbol client-side. No new store — same log Light
  // Box's own transition history already uses this pattern for.
  const [mtfTransitions, setMtfTransitions] = useState([]);
  useEffect(() => {
    fetch(`/api/market/mtf-state`)
      .then(r => r.json())
      .then(j => setMtfTransitions(j && j.ok ? (j.transitions || []) : []))
      .catch(() => {});
  }, [sym]);
  const symTransitions = sym ? mtfTransitions.filter(t => t.symbol === sym).slice(0, 8) : [];

  // Position Management (Phase 5) — real open Alpaca position for this
  // symbol, if any, including its already-computed real day-trade
  // HOLD/TRAIL/TAKE_PARTIAL/EXIT overlay (src/position-decision-engine.js,
  // joined server-side in routes/alpaca.js's /api/alpaca/positions) — not
  // re-derived here, just read. Same endpoint ActivePositionsCard.jsx
  // already uses elsewhere in this app.
  const [symPosition, setSymPosition] = useState(null);
  useEffect(() => {
    if (!sym) return;
    let cancelled = false;
    setSymPosition(null);
    fetch("/api/alpaca/positions")
      .then(r => r.json())
      .then(j => { if (cancelled) return; const pos = (j?.positions || []).find(p => p.symbol === sym); setSymPosition(pos || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sym]);

  // AI Explanation Layer (Phase 6) — explicit opt-in button, same real
  // "🤖 Ask Claude" second-opinion pattern GreenLightTab.jsx's
  // AISetupReview already uses. Cleared on symbol change so a stale
  // explanation for the previous symbol never lingers.
  const [dwExplain, setDwExplain] = useState(null); // null | "loading" | string | {error}
  useEffect(() => { setDwExplain(null); }, [sym]);

  // Technical Foundation & V-Recovery Engine (2026-08-19, explicit user
  // spec) — gated specifically on the TECHNICAL section being open (not
  // the broader `deepOpen`), since this is TECHNICAL-only content and the
  // real 2y-bars + SPY/sector fetch behind it is heavier than the rest of
  // this page's secondary data. Per-symbol dedup guard so reopening
  // TECHNICAL for the same symbol doesn't refire the fetch.
  const [symFoundation, setSymFoundation] = useState(null);
  const foundationFetchedForRef = useRef(null);
  useEffect(() => {
    if (!sym || openSection !== "technical") return;
    if (foundationFetchedForRef.current === sym) return;
    foundationFetchedForRef.current = sym;
    let cancelled = false;
    setSymFoundation(null);
    fetch(`/api/market/foundation?symbol=${encodeURIComponent(sym)}`)
      .then(r => r.json())
      .then(j => { if (!cancelled) setSymFoundation(j && j.ok ? j : null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sym, openSection]);

  // Real call/put notional summary for the loaded symbol — the one input
  // the new Institutional Grade / AI Score Card (below) needs that isn't
  // already fetched elsewhere on this page. Lightweight (limit=1, only the
  // summary block is used, not the contract list already shown in full on
  // the Options Flow tab). Explicit user request 2026-07-29 ("institutional
  // AI grade") — additive, doesn't touch Stock Quality/Trade Setup scores.
  // Gated on deepOpen — only feeds the Institutional Grade badge, checklist,
  // and Smart Money, all inside sections closed by default (2026-08-19,
  // Decision Card redesign; renamed from showFullAnalysis in the 6-section
  // reorg, same behavior).
  const [symOptionsFlow, setSymOptionsFlow] = useState(null);
  useEffect(() => {
    if (!sym || !deepOpen) return;
    let cancelled = false;
    setSymOptionsFlow(null);
    fetch(`/api/market/options-flow?symbols=${encodeURIComponent(sym)}&limit=1`)
      .then(r => r.json())
      .then(j => { if (!cancelled) setSymOptionsFlow(j && !j.error ? j.summary || null : null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sym, deepOpen]);

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
  // Gated on deepOpen + a per-symbol dedup guard (2026-08-19, Decision Card
  // redesign; renamed from showFullAnalysis in the 6-section reorg, same
  // behavior) — dark pool/gamma/short interest/news sentiment only ever
  // feed the checklist, Institution Score, and AI Summary, all inside
  // sections closed by default. This is the biggest chunk of the ~10
  // unconditional per-symbol-load fetches this page used to make (4 real
  // requests, one of them chained into a 5th) — deferring it is the actual
  // fix for the memory/502 concern, not just a render-visibility change.
  useEffect(() => {
    if (!sym || !deepOpen) return;
    if (fullAnalysisFetchedForRef.current === sym) return;
    fullAnalysisFetchedForRef.current = sym;
    let cancelled = false;
    setSymDarkPool(null); setSymNewsSentiment(null); setSymGamma(null); setSymShortInterest(null);
    fetch(`/api/market/darkpool?symbol=${encodeURIComponent(sym)}`).then(r => r.json()).then(j => { if (!cancelled) setSymDarkPool(j?.ok ? j : null); }).catch(() => {});
    fetch(`/api/market/gamma?symbol=${encodeURIComponent(sym)}`).then(r => r.json()).then(j => { if (!cancelled) setSymGamma(j?.ok ? j : null); }).catch(() => {});
    fetch(`/api/market/short-interest?tickers=${encodeURIComponent(sym)}`).then(r => r.json()).then(j => { if (!cancelled) setSymShortInterest(j?.ok ? (j.results || [])[0] || null : null); }).catch(() => {});
    fetch(`/api/market/news?tickers=${encodeURIComponent(sym)}&limit=20`).then(r => r.json())
      .then(j => {
        if (cancelled) return;
        // /api/market/news returns a bare array of {title, publisher, ...} — see fetchMarketNews, routes/market.js.
        const headlines = (Array.isArray(j) ? j : []).map(a => a.title || "").filter(Boolean);
        if (!headlines.length) return;
        return fetch("/api/agent/sentiment-by-symbol", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ headlines }) })
          .then(r => r.json()).then(d => { if (!cancelled && d?.ok) setSymNewsSentiment(d); });
      }).catch(() => {});
    return () => { cancelled = true; };
  }, [sym, deepOpen]);

  // Real forward-return win-probability log — market-wide, fetched once
  // (not per-symbol), same real source RhProScanner already uses.
  const [aplusTrack, setAplusTrack] = useState(null);
  useEffect(() => {
    fetch("/api/market/aplus-track").then(r => r.json()).then(d => { if (d?.ok) setAplusTrack(d); }).catch(() => {});
  }, []);

  // Position Sizing (MTF spec §26, 2026-08-20) — "never recommend position
  // size without calculating risk." Real account equity, fetched once
  // (not per-symbol, same pattern as aplusTrack above) from the existing
  // /api/alpaca/account endpoint already used by the Portfolio page — no
  // new backend route. riskPct is a real, user-adjustable input (default
  // 1%, a common real risk-management convention), not hardcoded.
  const [acctEquity, setAcctEquity] = useState(null);
  const [riskPct, setRiskPct] = useState(1);
  useEffect(() => {
    fetch("/api/alpaca/account").then(r => r.json()).then(d => { if (d?.ok && Number.isFinite(d.account?.equity)) setAcctEquity(d.account.equity); }).catch(() => {});
  }, []);

  // Section 7 (Catalysts, institutional redesign 2026-07-29) — real
  // per-symbol insider transactions + analyst ratings, same existing
  // endpoints InsiderTab/AnalystPeerPanel already use market-wide, scoped
  // here to just the loaded symbol. No new backend routes.
  // Gated on deepOpen (2026-08-19, Decision Card redesign; renamed from
  // showSupportingDetail in the 6-section reorg — Catalysts now lives
  // directly inside MARKET & CONTEXT rather than behind a nested
  // sub-toggle, so it fetches whenever any non-Decision section opens,
  // same as the rest of the secondary data).
  const [symInsider, setSymInsider] = useState(null);
  const [symAnalyst, setSymAnalyst] = useState(null);
  useEffect(() => {
    if (!sym || !deepOpen) return;
    let cancelled = false;
    setSymInsider(null); setSymAnalyst(null);
    fetch(`/api/market/insider?ticker=${encodeURIComponent(sym)}`).then(r => r.json()).then(j => { if (!cancelled) setSymInsider(j?.ok ? j : null); }).catch(() => {});
    fetch(`/api/market/analyst?tickers=${encodeURIComponent(sym)}`).then(r => r.json()).then(j => { if (!cancelled) setSymAnalyst(Array.isArray(j?.results) ? j.results[0] : (Array.isArray(j) ? j[0] : null)); }).catch(() => {});
    return () => { cancelled = true; };
  }, [sym, deepOpen]);

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

  // ── Decision Workspace (2026-08-20, Phase 1 of the MTF Decision System
  // spec) — reuses the exact same Cortex/Sniper engines SmartScanTab.jsx's
  // rows already use (Cortex Verdict is this app's one authoritative
  // verdict function, fixed to be the single source of truth for Smart
  // Scan's AI panel just yesterday) for the CURRENTLY LOADED symbol, not a
  // list row. Zero new scoring math — this is the "re-surface what already
  // exists" phase. Daily-timeframe only; 4H/1H/15M/5M are honestly marked
  // unavailable rather than fabricated (spec's own "missing data" rule) —
  // they're real future phases (MTF combiner + state machine), not
  // something to fake here.
  const sniperD = symTrend ? computeSniperDecision(symTrend) : null;
  const heatD = (symTrend && sniperD) ? computeHeatRisk(symTrend, sniperD) : null;
  const cortexV = (symTrend && sniperD && heatD && aPlusScore) ? computeCortexVerdict({ sniper: sniperD, heat: heatD, aplusScore: aPlusScore.score }) : null;
  const entryTypeDW = (symTrend && aPlusScore) ? classifyEntryType(symTrend, aPlusScore.score) : null;
  const setupScoreDW = symTrend ? computeSetupScore(symTrend) : null;
  // Cortex's 5-verdict vocabulary, bridged into the new WATCH/EARLY/START/
  // ADD/HOLD/WARNING/REDUCE/EXIT ladder for THIS phase only — a real 8-
  // state machine with debounce/persistence/position-awareness is Phase 3,
  // not invented here. This mapping is deliberately visible to the user
  // (both labels shown together), not hidden, so it reads as "today's real
  // verdict, framed in the new vocabulary" rather than a fabricated new
  // state.
  const DW_STATE_MAP = {
    "BUY ZONE":     { label: "START",  icon: "🟢", color: "#0d9465" },
    "WATCH":        { label: "EARLY",  icon: "🟡", color: "#5ab552" },
    "WAIT":         { label: "WATCH",  icon: "⚪", color: "#8b93a7" },
    "OVEREXTENDED": { label: "DO NOT CHASE", icon: "🟠", color: "#e08a1e" },
    "AVOID":        { label: "AVOID",  icon: "🔴", color: "#c8282a" },
  };
  const dwState = cortexV ? (DW_STATE_MAP[cortexV.verdict] || { label: cortexV.verdict, icon: "⚪", color: C.textDim }) : null;
  // Real 8-state machine's own vocabulary (Phase 3) — distinct from
  // DW_STATE_MAP above, which is a live, any-symbol, instant bridge from
  // Cortex Verdict's 5 states. This is the actual, persisted, debounced,
  // position-aware state (watchlist symbols only, confirmed server-side).
  const MTF_STATE_META = {
    WATCH: { icon: "⚪", color: "#8b93a7" },
    EARLY: { icon: "🟡", color: "#5ab552" },
    START: { icon: "🟢", color: "#0d9465" },
    ADD: { icon: "🔵", color: "#2563eb" },
    HOLD: { icon: "🔵", color: "#2563eb" },
    EXIT_WARNING: { icon: "🟡", color: "#d6a312" },
    REDUCE: { icon: "🟠", color: "#e08a1e" },
    EXIT: { icon: "🔴", color: "#c8282a" },
  };
  const dwDailyBias = symTrend ? (
    (String(symTrend.stage || "").includes("2") && Number(symTrend.passCount || 0) >= 6) ? "BULLISH"
    : String(symTrend.stage || "").includes("4") ? "BEARISH" : "NEUTRAL"
  ) : null;
  // MTF_ALIGNMENT (Phase 2, + 15M Phase 8, 2026-08-20) — 1D/4H/1H/15M real,
  // 5M not wired in yet (real future phase, honestly null rather than
  // fabricated). 15M reuses classifyEntryTrigger (day-trade-calc.js,
  // already shipped for Day Trade Mode) off real 15-min ORB/VWAP/RVOL/
  // price-action data (symMtf.entry15m, server-computed via
  // fetchDayTradeScanRows) — the exact CONFIRMED/APPROACHING/NOT_READY/
  // INVALIDATED vocabulary mtf-combiner.js already expected for this slot.
  // computeMtfAlignment renormalizes over only the known timeframes and
  // surfaces genuine higher-vs-lower conflicts rather than blind-
  // averaging, per the spec's own explicit rule.
  const dwMtf = dwDailyBias ? computeMtfAlignment({
    "1D": dwDailyBias,
    "4H": symMtf?.swing4h?.state ?? null,
    "1H": symMtf?.early1h?.score ?? null,
    "15M": symMtf?.entry15m?.status ?? null,
    "5M": null,
  }) : null;
  // MTF panel reads — the SAME array (real 1D/4H/1H, honestly-unavailable
  // 15M/5M) the MTF panel below renders, hoisted here so Data Quality's
  // coverage count and the panel's own display never drift out of sync.
  const mtfPanelReadsDW = dwMtf ? dwMtf.reads : [
    { tf: "1D", label: dwDailyBias || "loading…", known: !!dwDailyBias },
    { tf: "4H", label: "loading…", known: false },
    { tf: "1H", label: "loading…", known: false },
    { tf: "15M", label: "not available yet", known: false },
    { tf: "5M", label: "not available yet", known: false },
  ];
  const gatePassRatioDW = symMtfState?.gate?.checks?.length
    ? (symMtfState.gate.checks.length - symMtfState.gate.failed.length) / symMtfState.gate.checks.length
    : null;
  const decisionStrengthDW = computeDecisionStrength({
    qualityScore: aPlusScore?.score, setupScore: setupScoreDW, mtfScore: dwMtf?.score, gatePassRatio: gatePassRatioDW,
  });
  const dataQualityDW = computeDataQuality(mtfPanelReadsDW, { hasQuality: !!aPlusScore, hasSetup: setupScoreDW != null, hasEntry: !!sniperD });
  // Market Regime (MTF spec §20, 2026-08-20) — real SPY/QQQ/VIX read,
  // collapsed to RISK_ON/NEUTRAL/RISK_OFF. Deliberately NOT wired into the
  // A+ Quality Gate or the state machine's EXIT logic this pass — the
  // spec's own explicit rule ("do not automatically exit a healthy
  // position just because regime changes") means that needs careful,
  // separate handling of the server-side confirmed state too (the
  // background tick that produces symMtfState doesn't fetch regime data
  // today), a larger change than this pass scopes. This IS wired into
  // Position Sizing below (real, low-risk, spec-aligned: "risk-off →
  // smaller position") since sizing is advisory and user-adjustable, not
  // part of the gated decision itself.
  const spyQ = (macroData || []).find((m) => (m.symbol || "").toUpperCase() === "SPY");
  const qqqQ = (macroData || []).find((m) => (m.symbol || "").toUpperCase() === "QQQ");
  const { regLabel: regLabelDW, regColor: regColorDW } = computeRegimeLabel(C, { spy: spyQ, qqq: qqqQ, vix: distData?.vix || 0, loaded: !!spyQ });
  const marketRegimeDW = regLabelDW === "RISK ON" ? "RISK_ON" : regLabelDW === "RISK OFF" ? "RISK_OFF" : regLabelDW === "LOADING…" ? null : "NEUTRAL";

  // Staged Swing-Entry Plan (2026-08-20) — the single source of truth for
  // "is there a real, executable entry price right now, and what is it,"
  // replacing the old unconditional entryPrice = pivot. Every input here
  // is already computed elsewhere on this page (trend-screen/symTrend,
  // symMtf's 4H/1H/ATR/Anti-Chase reads, chart.technicals.adx, sniperD's
  // own stop/target1/target2, marketRegimeDW) — zero new fetches. Two
  // spec-requested conditions (RS slope, sector strength) are honestly
  // left out — no real data source for either exists in this codebase —
  // see entry-engine.js's own header for the full disclosure.
  const entryPlanDW = (symTrend && sniperD) ? computeEntryPlan({
    price: Number(chart?.livePrice ?? chart?.price), pivot: sniperD.pivot, atr: symMtf?.atrLevels?.atr,
    contractionLow: symTrend.contractionLow, dailyBias: dwDailyBias, swing4hState: symMtf?.swing4h?.state,
    rsiTrend1h: symMtf?.early1h?.rsiTrend, adx: chart?.technicals?.adx, rsRating: symTrend.rsRating,
    volTrend1h: symMtf?.early1h?.volTrend, higherLows: symTrend.higherLows, tightening: symTrend.tightening,
    vcpVerdict: symTrend.vcpVerdict, marketRegime: marketRegimeDW, vwap20: symTrend?.technicals?.vwap20,
    rr: sniperD.rr, breakoutConfirmed: symTrend.breakoutConfirmed, extended: symTrend.extended,
    priceAction: symMtf?.swing4h?.priceAction, antiChase: symMtf?.antiChase,
    stop: sniperD.stop, target1: sniperD.target1, target2: sniperD.target2, trailingStop: symMtf?.atrLevels?.trailingStop,
  }) : null;

  // "5-Second Rule" simplified decision (2026-08-20, explicit user
  // directive — "the trader should open the Workspace and understand the
  // trade in 5 seconds," "do NOT display dozens of competing signals").
  // Zero new scoring: entryPlanDW above already has the hard 4H-broken
  // gate and real zones; this just reduces everything already computed
  // on this page to one decision/one reason/one action. See
  // simple-decision.js for the full design.
  const simpleDecisionDW = entryPlanDW ? computeSimpleDecision({
    dailyBias: dwDailyBias, swing4hState: symMtf?.swing4h?.state, early1h: symMtf?.early1h,
    entry15mStatus: symMtf?.entry15m?.status, rr: sniperD?.rr, entryPlan: entryPlanDW,
    hasPosition: !!symPosition, dayTradeState: symPosition?.dayTradeState, dayTradeReason: symPosition?.dayTradeReason,
  }) : null;

  // Exit Panel dimensions (Phase 5, 2026-08-20) — 6 real, already-computed
  // reads bucketed into good/bad/unknown, matching the spec's "Momentum/
  // RS/structure/Support/Trailing stop, each a colored dot" mockup. No new
  // math — every value here already exists elsewhere on this page.
  const dwExitDims = sniperD ? [
    { label: "Momentum (1H)", ok: symMtf?.early1h?.rsiTrend?.direction ? symMtf.early1h.rsiTrend.direction !== "down" : null },
    { label: "RS Rating", ok: sniperD.gates?.momentumConfirmed ?? null },
    { label: "4H Structure", ok: symMtf?.swing4h?.state ? symMtf.swing4h.state !== "BROKEN" : null },
    { label: "Daily Trend", ok: dwDailyBias ? dwDailyBias !== "BEARISH" : null },
    { label: "Support", ok: symMtf?.swing4h?.priceAction?.breakdown != null ? !symMtf.swing4h.priceAction.breakdown : null },
    { label: "Trailing Stop", ok: (symMtf?.atrLevels?.trailingStop != null && chart?.livePrice != null) ? (chart.livePrice ?? chart.price) > symMtf.atrLevels.trailingStop : null },
  ] : [];
  const dwExitKnown = dwExitDims.filter((d) => d.ok !== null);
  const dwExitRisk = dwExitKnown.length ? Math.round((1 - dwExitKnown.filter((d) => d.ok).length / dwExitKnown.length) * 100) : null;

  // Six-score consolidation (institutional redesign, 2026-07-29) — the
  // first real consumer of Phase 0/3's deriveTopLevelScores. Presentation
  // layer only, same real inputs computed just above; none of the four
  // underlying scoring functions are touched.
  const topScores = (symTrend && institutionalGrade && stockQuality && aPlusScore) ? deriveTopLevelScores({
    regime, sectorInfo: symSectorInfo, technicals: chart?.technicals, institutionalGrade, stockQuality, aPlusScore,
  }) : null;
  // Derived from simpleDecisionDW (the real headline DecisionCard verdict
  // above, entry-engine/position-decision-engine/MTF-backed) via
  // simpleDecisionToAiAction, not institutionalGrade.score independently
  // (2026-08-20, Discover/Smart Scan/Workspace unification — this was a
  // real, previously-undetected bug: this badge and SmartMoneyDecisionPanel's
  // heroAction could disagree with the DecisionCard banner on the same
  // page despite a comment claiming they "agree"). Falls back to the score
  // band only when there's no real simpleDecisionDW yet (symbol not
  // trend-screened, e.g. still loading).
  const primaryAction = simpleDecisionDW
    ? (simpleDecisionToAiAction(simpleDecisionDW.decision) || (institutionalGrade ? mapToAiAction({ institutionalScore: institutionalGrade.score }) : null))
    : (institutionalGrade ? mapToAiAction({ institutionalScore: institutionalGrade.score }) : null);

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
      // tradePlanRef's real element (AiTradeCard) now lives inside the
      // SETUP section (2026-08-19 reorg), closed by default — open it so
      // there's actually something to scroll to.
      setOpenSection("setup");
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

  // SectionHeader/AccordionSection are now module-level components (real
  // remount-loop bug fix, 2026-08-19 — see their definitions near
  // SectionHeaderStandalone above for why). Only the static section-order
  // array stays here.
  const SECTIONS = [
    { id: "decision", label: "DECISION" },
    { id: "setup", label: "SETUP" },
    { id: "technical", label: "TECHNICAL" },
    { id: "market", label: "MARKET" },
    { id: "business", label: "BUSINESS" },
    { id: "intelligence", label: "INTELLIGENCE" },
  ];

  // Decision Card inputs, hoisted out of JSX (2026-08-19 reorg) so both the
  // top summary strip and the DECISION section body read the same real
  // values without recomputing — verbatim math from the original inline
  // computation (verdict off chart.setup.verdict, stage off chart.stage,
  // volume off symTrend.volRatio, risk off chart.setup.riskPct).
  const decisionInputs = (chart && chart.setup) ? (() => {
    const su = chart.setup;
    const verdict = su.verdict; // "GO" | "WAIT" | "AVOID"
    const vColor = verdict === "GO" ? "#0d9465" : verdict === "WAIT" ? "#d6a312" : "#c8282a";
    const vIcon = verdict === "GO" ? "🟢" : verdict === "WAIT" ? "🟡" : "🔴";
    const vLabel = verdict === "GO" ? "BUY" : verdict === "WAIT" ? "WAIT" : "AVOID";
    const target1R = Math.round((su.entry + (su.entry - su.stop)) * 100) / 100;
    const stage = String(chart.stage || "");
    const trendColor = stage.includes("Stage 2") ? "#0d9465" : stage.includes("Transition") ? "#d6a312" : stage.includes("Stage 4") ? "#c8282a" : C.textDim;
    const vol = Number(symTrend?.volRatio);
    const volColor = !Number.isFinite(vol) ? C.textDim : vol >= 1.5 ? "#0d9465" : vol >= 0.8 ? "#d6a312" : "#c8282a";
    const risk = Number(su.riskPct);
    const riskColor = !Number.isFinite(risk) ? C.textDim : risk <= 5 ? "#0d9465" : risk <= 7 ? "#d6a312" : "#c8282a";
    return { su, verdict, vColor, vIcon, vLabel, target1R, trendColor, volColor, riskColor };
  })() : null;

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
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ flex: 1 }}><SectionHeader icon="🔥" label="Movers & Watchlist" C={C} SANS={SANS} /></div>
          <button onClick={() => setShowMoversZone(v => !v)}
            style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.accent, background: "transparent", border: `1px solid ${C.accent}55`, borderRadius: 6, padding: "3px 9px", cursor: "pointer", whiteSpace: "nowrap", marginTop: -6 }}>
            {showMoversZone ? "Hide ▴" : "Show ▾"}
          </button>
        </div>
        {/* Search stays visible even collapsed (2026-08-10) — quick way to
            jump to a different symbol shouldn't require expanding the
            whole generic movers/news zone first. */}
        <form onSubmit={(e) => { e.preventDefault(); loadSym(query); setQuery(""); scrollToChart(); }} style={{ display: "flex", gap: 6, marginBottom: showMoversZone ? 8 : 0 }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="🔍 Load any symbol…"
            style={{ flex: 1, fontFamily: MONO, fontSize: 13, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text }} />
        </form>
        {showMoversZone && <>
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
        </>}
      </div>

      {/* ── Stock detail — ticker header, one-line decision summary,
          breadcrumb, then the 6-tier DECISION → SETUP → TECHNICAL →
          MARKET & CONTEXT → BUSINESS → INTELLIGENCE hierarchy (2026-08-19,
          "AM TRADING — FINAL STOCK WORKSPACE ORGANIZATION" spec). Replaces
          the old wsTab(decision/deepdive) + showFullAnalysis +
          showSupportingDetail flag stack — same real content and
          computations throughout, reorganized into exactly one home per
          metric instead of a flat decision/deep-dive split. Light Box
          itself is untouched by this reorg — separate tab, separate file. ── */}
      <div ref={chartZoneRef} style={{ width: "100%" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: SANS, fontSize: 24, fontWeight: 900, color: C.accent }}>{sym}</span>
          {/* Real company/fund name from the same fundamentals fetch already
              used for Market Cap/P/E above — no new API call. Honest-null:
              some tickers (esp. thin ETFs) never resolve a name from any of
              the 3 fallback providers, so this just doesn't render rather
              than showing the bare symbol twice or a fabricated title. */}
          {fund && fund.name && fund.name !== sym && <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: C.textDim }}>{fund.name}</span>}
          {/* Real pre-market/after-hours live price (explicit user request,
              "after hours i want to see live prices") — chart.price is the
              daily bar's regular-session close and never moves outside
              9:30-4:00 ET; chart.livePrice (Yahoo real-time quote, honestly
              null if unavailable) reflects the actual current session,
              falling back to chart.price when the market's simply closed
              with nothing newer to show. */}
          {chart && (chart.livePrice ?? chart.price) != null && <span style={{ fontFamily: NUM, fontSize: 32, fontWeight: 900, color: C.green }}>${(chart.livePrice ?? chart.price).toFixed(2)}</span>}
          {symDayPct != null && <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: col(symDayPct) }}>{pct(symDayPct)}</span>}
          {chart && (chart.marketState === "PRE" || (chart.marketState && chart.marketState.startsWith("POST"))) && (
            <span title={chart.marketState === "PRE" ? "Real Yahoo pre-market quote" : "Real Yahoo after-hours quote"}
              style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 5, padding: "2px 6px" }}>
              {chart.marketState === "PRE" ? "PRE-MARKET" : "AFTER HOURS"}
            </span>
          )}
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
        {/* Top-level summary strip (spec: Ticker/Company/Price/Change/
            Primary Signal/Score/Confidence/Entry/Stop/Target/one-line why,
            above the 6 sections) — composed entirely from values already
            computed for the DECISION section below, zero new data. */}
        {decisionInputs && (
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.textSec, marginBottom: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline" }}>
            <span style={{ fontWeight: 900, color: decisionInputs.vColor }}>{decisionInputs.vIcon} {decisionInputs.vLabel}</span>
            {aPlusScore && <span>· A+ <b style={{ color: C.text }}>{aPlusScore.score}</b></span>}
            {prediction && <span>· <b style={{ color: C.text }}>{prediction.conf}%</b> confidence</span>}
            {/* Entry Engine fix (2026-08-20): this used to always say
                "Entry $<pivot>" here too — the same root bug, in the most
                prominent spot on the page. Now honest: "Entry" only when
                entryPlanDW has independently determined a real executable
                price exists right now; otherwise "Pivot" (still the same
                real number, correctly labeled as a reference). */}
            <span>· {entryPlanDW?.entryPrice != null ? "Entry" : "Pivot"} <b style={{ color: C.text }}>${entryPlanDW?.entryPrice ?? decisionInputs.su.entry}</b> / Stop <b style={{ color: C.text }}>${decisionInputs.su.stop}</b> / Target <b style={{ color: C.text }}>${decisionInputs.target1R}</b></span>
            {oneLiner && <span style={{ color: C.textDim }}>· {oneLiner}</span>}
          </div>
        )}
        {/* The "5-Second Rule" card (2026-08-20) — the real, single answer:
            one decision, one reason, one next action, plus the 4 simple
            timeframe reads. This is the FIRST thing shown, per the
            explicit directive that a trader should understand the trade
            without interpreting "20 different scores." Everything below
            it (the full staged Entry Plan, 4 score boxes, MTF panel) is
            still fully computed and available — just collapsed by
            default now, not deleted. */}
        {simpleDecisionDW && (
          <div style={{ border: `2px solid ${simpleDecisionDW.color}`, background: `${simpleDecisionDW.color}0d`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.6, marginBottom: 6 }}>DECISION</div>
            <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: simpleDecisionDW.color, marginBottom: 8 }}>{simpleDecisionDW.icon} {simpleDecisionDW.label}</div>
            <div style={{ fontFamily: SANS, fontSize: 13, color: C.text, marginBottom: 10 }}><b>Why:</b> {simpleDecisionDW.why}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8, marginBottom: 10 }}>
              {[
                ["TREND", simpleDecisionDW.trend],
                ["STRUCTURE", simpleDecisionDW.structure],
                ["SETUP", simpleDecisionDW.setup],
                ["TIMING", simpleDecisionDW.timing],
              ].map(([label, val]) => {
                const good = val === "BULLISH" || val === "HEALTHY" || val === "READY";
                const bad = val === "BEARISH" || val === "BROKEN" || val === "WEAK" || val === "NOT_READY";
                const col = val == null ? C.textDim : good ? "#22d47e" : bad ? "#ef4444" : "#d6a312";
                return (
                  <div key={label} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 9px", background: C.card }}>
                    <div style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 700, color: C.textDim }}>{label}</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: col }}>{val ? val.replace("_", " ") : "—"}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8, fontFamily: MONO, fontSize: 12, marginBottom: 10 }}>
              <div><span style={{ color: C.textDim }}>Entry </span><b style={{ color: simpleDecisionDW.entryZone === "BLOCKED" ? "#ef4444" : C.text }}>{simpleDecisionDW.entryZone || "—"}</b></div>
              <div><span style={{ color: C.textDim }}>Pivot </span><b style={{ color: C.text }}>{simpleDecisionDW.pivot != null ? `$${simpleDecisionDW.pivot.toFixed(2)}` : "—"}</b></div>
              <div><span style={{ color: C.textDim }}>Stop </span><b style={{ color: C.text }}>{simpleDecisionDW.stop != null ? `$${simpleDecisionDW.stop.toFixed(2)}` : "—"}</b></div>
              <div><span style={{ color: C.textDim }}>Target </span><b style={{ color: C.text }}>{simpleDecisionDW.target != null ? `$${simpleDecisionDW.target.toFixed(2)}` : "—"}</b></div>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.textSec }}><b>Next:</b> {simpleDecisionDW.next}</div>
            <button onClick={() => setShowFullEntryAnalysis((v) => !v)}
              style={{ marginTop: 10, fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
              {showFullEntryAnalysis ? "Hide full analysis ▴" : "Show full analysis ▾"}
            </button>
          </div>
        )}
        {/* Decision Workspace (2026-08-20, Phase 1 — "I have 30 seconds,
            tell me what to do"). Full detailed analysis, collapsed by
            default beneath the simple decision card above — every real
            engine (Quality/Setup/Entry/Exit Risk scores, staged Entry
            Plan, MTF panel) is still fully computed, just secondary now.
            Pure composition of symTrend/aPlusScore/sniperD/heatD/cortexV
            computed above; no new fetch, no new scoring math. */}
        {showFullEntryAnalysis && symTrend && cortexV && dwState && (
          <div style={{ border: `1px solid ${dwState.color}55`, background: `${dwState.color}0d`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
              {/* Entry vs Position Management (MTF spec §42, 2026-08-20) —
                  "do not confuse ENTRY RISK with POSITION EXIT RISK": the
                  same 8-state ladder is shown either way (WATCH..EXIT is
                  one continuous system, not two), but the heading itself
                  now names which question is actually live for this
                  symbol — real, based on whether an open Alpaca position
                  exists (symPosition), not a guess. */}
              <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 0.6 }}>🎯 {symPosition ? "POSITION STATUS" : "ENTRY STATUS"}</span>
              <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: dwState.color }}>{dwState.icon} {dwState.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>(Cortex: {cortexV.verdict})</span>
              {/* Market Regime (MTF spec §20) — real SPY/QQQ/VIX read,
                  informational here (not gating entries this pass — see
                  the marketRegimeDW comment above for why). */}
              {marketRegimeDW && (
                <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: regColorDW, border: `1px solid ${regColorDW}55`, borderRadius: 20, padding: "2px 8px" }}>{marketRegimeDW.replace("_", " ")}</span>
              )}
              {/* Decision Strength + Data Quality (MTF spec §37/50/22,
                  2026-08-20) — Decision Strength is a composite of already-
                  computed scores, deliberately NOT labeled a probability;
                  Data Quality/MTF Coverage is honest about how much real
                  data backs this read (15M/5M count as unavailable, never
                  fabricated). Both real, both new this pass. */}
              {decisionStrengthDW != null && (
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginLeft: "auto" }}>Decision Strength: <b style={{ color: C.text }}>{decisionStrengthDW}/100</b></span>
              )}
              {dataQualityDW && (
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }} title={`MTF coverage: ${dataQualityDW.coverage} timeframes available`}>Data Quality: <b style={{ color: dataQualityDW.score >= 70 ? "#22d47e" : dataQualityDW.score >= 45 ? "#d6a312" : "#ef4444" }}>{dataQualityDW.score}/100</b> ({dataQualityDW.coverage} MTF)</span>
              )}
            </div>
            {/* Real, honest disclosure — found live while shipping this:
                the BUY/WAIT/AVOID line above (decisionInputs, driven by
                chart.setup.verdict / computeNextAction) can disagree with
                Cortex Verdict here, because they're two independently-built
                engines that both pre-date this panel — not something
                introduced by this change, just made newly visible by
                putting them on the same screen. Not unified in Phase 1
                (chart.setup.verdict also drives the DECISION section below
                and other flows — a real, separate reconciliation task, not
                a quick fix). Disclosed rather than hidden, same "label it"
                discipline as Trade Planner's Options Recommendation. */}
            {decisionInputs && ((decisionInputs.vLabel === "BUY") !== (dwState.label === "START")) && (
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginBottom: 8 }}>
                ⚠ The {decisionInputs.vLabel} shown above uses a different engine (chart setup verdict) than this panel's Cortex-based read — they can disagree. Reconciling these is a planned future pass, not done yet.
              </div>
            )}

            {/* Separated scores — never blended into one number, per the spec.
                SETUP is a real 0-100 (computeSetupScore, MTF spec §9,
                2026-08-20) — "is a tradeable structure forming?", distinct
                from QUALITY ("is this a strong stock?"); entryTypeDW's real
                classification (Ideal/Breakout/Early/Pullback Entry) still
                shown as a subtitle underneath, not replaced. */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginBottom: 14 }}>
              {[
                ["QUALITY", aPlusScore ? `${aPlusScore.score}/100` : "—", aPlusScore ? (aPlusScore.score >= 70 ? "#22d47e" : aPlusScore.score >= 45 ? "#d6a312" : "#ef4444") : C.textDim, null],
                ["SETUP", setupScoreDW != null ? `${setupScoreDW}/100` : "—", setupScoreDW != null ? (setupScoreDW >= 70 ? "#22d47e" : setupScoreDW >= 45 ? "#d6a312" : "#ef4444") : C.textDim, entryTypeDW ? entryTypeDW.type : "No qualifying setup"],
                ["ENTRY", sniperD ? sniperD.meta.label : "—", sniperD ? sniperD.meta.color : C.textDim, null],
                ["EXIT RISK", heatD ? heatD.label : "—", heatD ? heatD.color : C.textDim, null],
              ].map(([label, val, col, sub]) => (
                <div key={label} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px", background: C.card }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: 0.5 }}>{label}</div>
                  <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: col }}>{val}</div>
                  {sub && <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.textDim, marginTop: 1 }}>{sub}</div>}
                </div>
              ))}
            </div>

            {/* MTF panel — 1D + 4H + 1H are real (Phase 2, 2026-08-20);
                15M/5M honestly unavailable rather than fabricated (spec's
                own "missing data" rule) — real future phases. */}
            <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
              {mtfPanelReadsDW.map((r) => {
                const col = !r.known ? C.textDim : r.value > 0.15 ? "#22d47e" : r.value < -0.15 ? "#ef4444" : "#d6a312";
                return (
                  <div key={r.tf} title={r.tf === "4H" && symMtf?.swing4h?.reasons?.length ? symMtf.swing4h.reasons.join(" ") : r.tf === "1H" && symMtf?.early1h?.reasons?.length ? symMtf.early1h.reasons.join(" ") : undefined}
                    style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${C.border}`, borderRadius: 20, padding: "3px 10px", background: C.card, cursor: "help" }}>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: C.textDim }}>{r.tf}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: col }}>{r.label}</span>
                  </div>
                );
              })}
              {dwMtf && dwMtf.score != null && (
                <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim, marginLeft: 4 }}>MTF Alignment: <b style={{ color: C.text }}>{dwMtf.score}/100</b></span>
              )}
            </div>
            {dwMtf?.conflictNote && (
              <div style={{ fontFamily: SANS, fontSize: 11, color: "#e08a1e", background: "#e08a1e12", border: "1px solid #e08a1e33", borderRadius: 6, padding: "6px 10px", marginBottom: 12 }}>
                ⚠️ MTF CONFLICT — {dwMtf.conflictNote}
              </div>
            )}

            {/* Confirmed State + A+ Quality Gate checklist (Phase 3,
                2026-08-20) — the real persisted, debounced, server-
                confirmed 8-state read. Distinct from dwState above (a
                live, instant, any-symbol bridge from Cortex Verdict):
                this only exists for watchlist symbols the background tick
                has actually rotated through, updates on its own 15-min
                cadence, and requires sustained multi-tick agreement
                before flipping — same "confirmed can lag live" honesty
                Light Box's "as of Xm ago" label already established. */}
            {symMtfState ? (
              <div style={{ border: `1px solid ${(MTF_STATE_META[symMtfState.confirmed] || {}).color || C.border}44`, borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: symMtfState.gate ? 8 : 0, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>CONFIRMED STATE</span>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: (MTF_STATE_META[symMtfState.confirmed] || {}).color || C.text }}>
                    {(MTF_STATE_META[symMtfState.confirmed] || {}).icon || "⚪"} {symMtfState.confirmed}
                  </span>
                  {symMtfState.updatedAt && (
                    <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.textDim }}>as of {ageLabelMtf(symMtfState.updatedAt)}</span>
                  )}
                </div>
                {symMtfState.gate && (
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 5 }}>
                      A+ QUALITY GATE — {symMtfState.gate.checks.length - symMtfState.gate.failed.length}/{symMtfState.gate.checks.length} CONDITIONS MET{symMtfState.gate.pass ? "" : " · NOT READY"}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {symMtfState.gate.checks.map((c, i) => (
                        <span key={i} style={{ fontFamily: MONO, fontSize: 10.5, color: c.pass ? "#22d47e" : "#ef4444" }}>{c.pass ? "☑" : "☐"} {c.label} ({c.detail})</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textFaint || C.textDim, marginBottom: 14 }}>
                Confirmed state not available — {sym} isn't in the watchlist rotation yet (only watchlist symbols get the debounced, server-confirmed state).
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 260px) 1fr", gap: 18 }}>
              {/* Staged Entry Plan (2026-08-20) — replaces the old flat
                  Entry Map. CRITICAL FIX: entryPrice is no longer
                  unconditionally the pivot — entryPlanDW.entryPrice is
                  null unless the Entry Engine has independently determined
                  a real, executable price exists right now (a genuine
                  EARLY/CONFIRMATION/BREAKOUT/RETEST read). The pivot is
                  always shown too, but labeled as what it is: a breakout
                  reference, not automatically an entry. See
                  entry-engine.js for the full design. */}
              {entryPlanDW && (
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 6 }}>ENTRY PLAN — {entryPlanDW.stage.replace("_", " ")}</div>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, lineHeight: 1.4, marginBottom: 8 }}>{entryPlanDW.recommendedAction}</div>
                  {entryPlanDW.currentPrice != null && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11.5, padding: "3px 0" }}>
                      <span style={{ color: C.textDim }}>Current Price</span>
                      <span style={{ fontWeight: 700, color: C.text }}>${entryPlanDW.currentPrice.toFixed(2)}</span>
                    </div>
                  )}
                  {[
                    ["FOUNDATION", "Foundation", null, entryPlanDW.stage === "FOUNDATION" || entryPlanDW.stage === "NONE" ? "Base forming — not enough evidence yet" : null],
                    ["EARLY", "Early Entry", entryPlanDW.earlyEntryZone, "Start small if confirmed"],
                    ["CONFIRMATION", "Confirmation", entryPlanDW.confirmationEntryZone, "Add if confirmed"],
                    ["BREAKOUT", "Breakout Pivot", entryPlanDW.breakoutTrigger != null ? [entryPlanDW.breakoutTrigger, entryPlanDW.breakoutTrigger] : null, "Add if breakout confirms"],
                    ["RETEST", "Retest", entryPlanDW.retestZone, "Add if retest holds"],
                  ].map(([stageKey, label, zone, defaultAction]) => {
                    const active = entryPlanDW.stage === stageKey;
                    const zoneText = Array.isArray(zone) ? (zone[0] === zone[1] ? `$${zone[0].toFixed(2)}` : `$${zone[0].toFixed(2)}–$${zone[1].toFixed(2)}`) : "—";
                    return (
                      <div key={stageKey} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontFamily: MONO, fontSize: 11.5, padding: "3px 0", opacity: active ? 1 : 0.55 }}>
                        <span style={{ color: active ? C.text : C.textDim, fontWeight: active ? 800 : 400 }}>{active ? "▶ " : ""}{label}</span>
                        <span style={{ fontWeight: active ? 800 : 600, color: active ? dwState.color : C.text }}>{zoneText}</span>
                      </div>
                    );
                  })}
                  {entryPlanDW.doNotChaseZone?.band && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11.5, padding: "3px 0" }}>
                      <span style={{ color: C.textDim }}>Do Not Chase</span>
                      <span style={{ fontWeight: 700, color: entryPlanDW.doNotChaseZone.band === "DO_NOT_CHASE" ? "#c8282a" : entryPlanDW.doNotChaseZone.band === "NORMAL" ? "#22d47e" : "#e08a1e" }}>{entryPlanDW.doNotChaseZone.band.replace(/_/g, " ")}</span>
                    </div>
                  )}
                  {entryPlanDW.invalidation != null && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11.5, padding: "3px 0" }}>
                      <span style={{ color: C.textDim }}>Invalidation</span>
                      <span style={{ fontWeight: 700, color: "#c8282a" }}>${entryPlanDW.invalidation.toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginTop: 8, marginBottom: 4 }}>{entryPlanDW.qualifying.total > 0 ? `${entryPlanDW.qualifying.count}/${entryPlanDW.qualifying.total} QUALIFYING CONDITIONS` : "QUALIFYING CONDITIONS — no real data yet"}</div>
                  {[
                    ["Stop", entryPlanDW.stop],
                    ["Target 1", entryPlanDW.target1],
                    ["Target 2", entryPlanDW.target2],
                  ].filter(([, v]) => v != null).map(([l, v]) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11.5, padding: "3px 0" }}>
                      <span style={{ color: C.textDim }}>{l}</span>
                      <span style={{ fontWeight: 700, color: C.text }}>${v.toFixed(2)}</span>
                    </div>
                  ))}
                  {sniperD.rr != null && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11.5, padding: "3px 0" }}>
                      <span style={{ color: C.textDim }}>R:R</span>
                      <span style={{ fontWeight: 700, color: sniperD.rr >= 2 ? "#22d47e" : C.text }}>{sniperD.rr.toFixed(2)}:1</span>
                    </div>
                  )}
                  {/* ATR-based levels (Phase 4, 2026-08-20) — a distinct,
                      additional lens off real 4H ATR, shown alongside
                      (never replacing) Sniper's structural stop above.
                      Both are real; they answer slightly different
                      questions (structural low vs. volatility-scaled). */}
                  {symMtf?.atrLevels && !symMtf.atrLevels.dataInsufficient && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                      <div style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 4 }}>ATR LEVELS (4H, 1.5x/2R/3R)</div>
                      {[
                        ["Stop", symMtf.atrLevels.stop],
                        ["Target 1", symMtf.atrLevels.target1],
                        ["Target 2", symMtf.atrLevels.target2],
                        ["Trailing", symMtf.atrLevels.trailingStop],
                      ].filter(([, v]) => v != null).map(([l, v]) => (
                        <div key={l} style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, padding: "2px 0" }}>
                          <span style={{ color: C.textDim }}>{l}</span>
                          <span style={{ fontWeight: 700, color: C.textSec }}>${v.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Anti-Chase's real band is now shown as the "Do Not
                      Chase" row inside the staged plan above (same real
                      computeAntiChase output, entryPlanDW.doNotChaseZone) —
                      this used to be a second, separate block repeating
                      the same read; the "waitingFor" text is still worth
                      surfacing when it's the actual reason nothing's
                      executable right now. */}
                  {symMtf?.antiChase?.band === "DO_NOT_CHASE" && symMtf.antiChase.waitingFor && (
                    <div style={{ marginTop: 4, fontFamily: SANS, fontSize: 10.5, color: "#c8282a", opacity: 0.9 }}>{symMtf.antiChase.waitingFor}</div>
                  )}
                  {/* Breakout Retest (Phase 4) — real, already-computed by
                      detectPriceAction (daytrade-console-engine.js, reused
                      via mtf-swing-engine.js's 4H read) — retest/
                      failedBreakout aren't new math, just surfaced here
                      explicitly instead of only living in the 4H chip's
                      hover tooltip. */}
                  {symMtf?.swing4h?.priceAction?.retest === true && (
                    <div style={{ marginTop: 8, fontFamily: SANS, fontSize: 10.5, padding: "5px 8px", borderRadius: 6, color: "#0d9465", background: "#0d946512" }}>
                      ✓ Retest confirmed on the 4H chart — support held after breaking out.
                    </div>
                  )}
                  {symMtf?.swing4h?.priceAction?.failedBreakout === true && (
                    <div style={{ marginTop: 8, fontFamily: SANS, fontSize: 10.5, padding: "5px 8px", borderRadius: 6, color: "#c8282a", background: "#c8282a12" }}>
                      ✗ Failed breakout on the 4H chart — price broke out, then closed back below resistance.
                    </div>
                  )}
                  {/* Position Sizing (MTF spec §26, 2026-08-20) — "never
                      recommend position size without calculating risk."
                      FIXED (2026-08-20, Entry Engine build): this used to
                      size off sniperD.entry — the pivot — regardless of
                      whether that price was actually executable. Now
                      sizes off entryPlanDW.entryPrice, the Entry Engine's
                      real, stage-aware price, and simply doesn't render
                      at all when there isn't one (FOUNDATION/NONE/failed-
                      breakout/extended-breakout stages have no real entry
                      to size). The stop used matches the stage: the
                      tighter structural stop once a breakout/retest is
                      real, the wider thesis-invalidation level for an
                      earlier, less-confirmed stage — an early starter
                      position shouldn't use a breakout-only technical stop
                      it was never based on. */}
                  {entryPlanDW.entryPrice != null && (() => {
                    const usesStructuralStop = entryPlanDW.stage === "BREAKOUT" || entryPlanDW.stage === "RETEST";
                    const stopForSizing = usesStructuralStop ? entryPlanDW.stop : entryPlanDW.invalidation;
                    const hasRealStop = Number.isFinite(stopForSizing) && stopForSizing < entryPlanDW.entryPrice;
                    if (!hasRealStop) return null;
                    return (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>POSITION SIZING — {entryPlanDW.stage.replace("_", " ")}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <input type="number" min={0.1} max={10} step={0.1} value={riskPct}
                              onChange={(e) => setRiskPct(Math.max(0.1, Math.min(10, Number(e.target.value) || 1)))}
                              style={{ width: 40, fontFamily: MONO, fontSize: 10, background: C.surface || C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 4px", color: C.text }} />
                            <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>% risk</span>
                          </span>
                        </div>
                        {acctEquity != null ? (() => {
                          const riskPerShare = entryPlanDW.entryPrice - stopForSizing;
                          const accountRisk = acctEquity * (riskPct / 100) * (entryPlanDW.sizingPct / 100 || 1);
                          const shares = Math.floor(accountRisk / riskPerShare);
                          return (
                            <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6 }}>
                              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textDim }}>Entry (this stage)</span><span style={{ fontWeight: 700, color: C.text }}>${entryPlanDW.entryPrice.toFixed(2)}</span></div>
                              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textDim }}>Stage Allocation</span><span style={{ fontWeight: 700, color: C.text }}>{entryPlanDW.sizingPct}%</span></div>
                              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textDim }}>Account Risk</span><span style={{ fontWeight: 700, color: C.text }}>${accountRisk.toFixed(2)}</span></div>
                              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textDim }}>Risk/Share</span><span style={{ fontWeight: 700, color: C.text }}>${riskPerShare.toFixed(2)}</span></div>
                              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textDim }}>Suggested Size</span><span style={{ fontWeight: 800, color: shares > 0 ? "#22d47e" : "#ef4444" }}>{shares > 0 ? `${shares} sh` : "0 sh — risk too tight"}</span></div>
                              {marketRegimeDW === "RISK_OFF" && (
                                <div style={{ marginTop: 4, color: "#e08a1e", fontWeight: 700 }}>⚠ Risk-off regime — consider sizing down from your usual risk %.</div>
                              )}
                            </div>
                          );
                        })() : (
                          <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, fontStyle: "italic" }}>Account equity unavailable — sizing needs a real connected account.</div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              <div>
                {/* Why panel — Sniper Decision's own real gate checklist */}
                {sniperD && sniperD.reasons && sniperD.reasons.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 6 }}>WHY</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {sniperD.reasons.map((r, i) => (
                        <span key={i} style={{ fontFamily: MONO, fontSize: 11, color: r.ok ? "#22d47e" : "#ef4444" }}>{r.ok ? "✓" : "✗"} {r.text}</span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Next Action — never a bare "WAIT", always what it's waiting for */}
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 4 }}>NEXT ACTION</div>
                  <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>
                    {sniperD?.waitingFor || heatD?.reason || cortexV.reason || sniperD?.reason || "No further confirmation needed right now."}
                  </div>
                </div>
                {/* "What Would Change My Mind" (data-integrity audit,
                    2026-08-20, explicit spec requirement) — dynamically
                    generated from the SAME real failed conditions already
                    driving the decision above, never generic text. Prefers
                    the server-confirmed A+ Quality Gate's real `failed`
                    array (symMtfState.gate) when this symbol is in the
                    watchlist rotation; falls back to Sniper Decision's own
                    real per-reason ok/fail list otherwise — same data
                    already shown in the A+ GATE checklist / WHY panel
                    above, just reframed as "what needs to flip." Renders
                    nothing once there's nothing left failing. */}
                {(() => {
                  const failedConditions = symMtfState?.gate?.failed?.length
                    ? symMtfState.gate.failed.map((c) => c.label)
                    : (sniperD?.reasons || []).filter((r) => !r.ok).map((r) => r.text);
                  if (!failedConditions.length) return null;
                  return (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 4 }}>WHAT WOULD CHANGE MY MIND?</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {failedConditions.map((cond, i) => (
                          <span key={i} style={{ fontFamily: MONO, fontSize: 11, color: C.textSec }}>✓ {cond}</span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {/* AI Explanation Layer (Phase 6) — explicit opt-in,
                    explains the deterministic read above in plain
                    English; never originates its own verdict. */}
                <div style={{ marginTop: 12 }}>
                  {dwExplain == null && (
                    <button onClick={() => {
                        setDwExplain("loading");
                        fetch("/api/market/mtf-explain", {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            symbol: sym, state: symMtfState?.confirmed || dwState?.label,
                            quality: aPlusScore?.score, swingState: symMtf?.swing4h?.state,
                            earlyScore: symMtf?.early1h?.score, entryAction: sniperD?.action,
                            exitRiskState: heatD?.state, mtfScore: dwMtf?.score, mtfConflict: dwMtf?.conflictNote,
                            gate: symMtfState?.gate, sniperReason: sniperD?.reason, waitingFor: sniperD?.waitingFor,
                            heatReason: heatD?.reason,
                          }),
                        }).then(r => r.json()).then(d => setDwExplain(d && d.ok ? d.explanation : { error: (d && d.error) || "no response" }))
                          .catch(e => setDwExplain({ error: e.message }));
                      }}
                      style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 7, cursor: "pointer", border: `1px solid ${C.accent}`, background: `${C.accent}14`, color: C.accent }}>
                      🤖 Explain this
                    </button>
                  )}
                  {dwExplain === "loading" && <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textDim }}>🤖 Thinking…</div>}
                  {dwExplain && dwExplain.error && <div style={{ fontFamily: SANS, fontSize: 11, color: "#e08a1e" }}>AI explanation unavailable — {dwExplain.error}</div>}
                  {typeof dwExplain === "string" && (
                    <div style={{ fontFamily: SANS, fontSize: 12, color: C.text, lineHeight: 1.55, whiteSpace: "pre-line", background: `${C.accent}08`, border: `1px solid ${C.accent}33`, borderRadius: 8, padding: "9px 12px" }}>
                      {dwExplain}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Position Management (Phase 5, 2026-08-20) — only renders
                for a real open Alpaca position in this symbol. Every
                field here is already computed server-side (routes/
                alpaca.js's /api/alpaca/positions, including its real
                position-decision-engine.js HOLD/TRAIL/TAKE_PARTIAL/EXIT
                overlay) — nothing re-derived. */}
            {symPosition && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 8 }}>POSITION MANAGEMENT — {Number(symPosition.qty)} SHARES</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8, marginBottom: symPosition.dayTradeState ? 8 : 0 }}>
                  {[
                    ["Entry", symPosition.plannedEntry ?? symPosition.avgEntry, C.text],
                    ["Current", symPosition.current, C.text],
                    ["P/L", symPosition.unrealizedPLpc, symPosition.unrealizedPLpc >= 0 ? "#22d47e" : "#ef4444"],
                    ["Target", symPosition.plannedTarget, C.text],
                    ["Trailing (ATR)", symMtf?.atrLevels?.trailingStop, C.text],
                  ].filter(([, v]) => v != null).map(([l, v, col]) => (
                    <div key={l} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 9px", background: C.card }}>
                      <div style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 700, color: C.textDim }}>{l}</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: col }}>{l === "P/L" ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : `$${Number(v).toFixed(2)}`}</div>
                    </div>
                  ))}
                </div>
                {symPosition.dayTradeState && (
                  <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec }}>
                    <span style={{ fontFamily: MONO, fontWeight: 800, color: symPosition.dayTradeState === "EXIT" ? "#c8282a" : symPosition.dayTradeState === "TAKE_PARTIAL" ? "#e08a1e" : symPosition.dayTradeState === "TRAIL" ? "#2563eb" : "#0d9465" }}>
                      {symPosition.dayTradeState}
                    </span> — {symPosition.dayTradeReason}
                  </div>
                )}
                {/* Profit Management at ~2R (MTF spec §31, 2026-08-20) —
                    "consider taking 25-50%, do not automatically close the
                    entire position." Real R-multiple off the SAME real
                    plannedEntry/plannedStop the numbers above already show
                    (identical formula routes/alpaca.js's own day-trade
                    overlay uses for rNow — recomputed here, not
                    reinvented, since that value isn't itself returned to
                    the client). This specifically targets "selling too
                    early" — a suggestion to trim, never an auto-exit. */}
                {Number.isFinite(symPosition.plannedEntry) && Number.isFinite(symPosition.plannedStop) && symPosition.plannedEntry > symPosition.plannedStop && Number.isFinite(symPosition.current) && (() => {
                  const risk = symPosition.plannedEntry - symPosition.plannedStop;
                  const rNow = (symPosition.current - symPosition.plannedEntry) / risk;
                  if (rNow < 2) return null;
                  return (
                    <div style={{ marginTop: 8, fontFamily: SANS, fontSize: 10.5, padding: "6px 9px", borderRadius: 6, color: "#0d9465", background: "#0d946512" }}>
                      🎯 At {rNow.toFixed(1)}R — consider taking 25-50% off the table. If the trend stays healthy, let the rest run rather than closing the full position.
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Exit Panel (Phase 5) — 6 real, already-computed dimensions
                bucketed into good/bad, matching the spec's colored-dot
                mockup. Distinct from Heat Risk's single state above (a
                decomposition of it, not a re-derivation). */}
            {dwExitDims.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>EXIT PANEL</span>
                  {dwExitRisk != null && (
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: dwExitRisk >= 50 ? "#c8282a" : dwExitRisk >= 25 ? "#e08a1e" : "#0d9465" }}>
                      {dwExitRisk === 0 ? "🟢 NO EXIT SIGNAL" : `Exit Risk: ${dwExitRisk}/100`}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {dwExitDims.map((d) => (
                    <span key={d.label} style={{ fontFamily: MONO, fontSize: 10.5, color: d.ok === null ? C.textDim : d.ok ? "#22d47e" : "#ef4444" }}>
                      {d.ok === null ? "⚪" : d.ok ? "🟢" : "🔴"} {d.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Decision History (Phase 5) — real transitions this symbol
                has actually gone through, off the same persisted log
                mtf-state-store.js's background tick writes. */}
            {symTransitions.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 6 }}>DECISION HISTORY</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {symTransitions.map((t, i) => (
                    <div key={i} style={{ fontFamily: MONO, fontSize: 10.5, color: C.textSec, display: "flex", gap: 8 }}>
                      <span style={{ color: C.textDim, minWidth: 60 }}>{new Date(t.ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
                      <span>{t.from} → <b style={{ color: (MTF_STATE_META[t.to] || {}).color || C.text }}>{t.to}</b></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Breadcrumb / depth indicator — click any name to jump straight
            to that section (same effect as clicking its own header). */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginBottom: 14, fontFamily: MONO, fontSize: 10.5 }}>
          <span style={{ color: C.textDim, fontWeight: 700 }}>{sym}</span>
          {SECTIONS.map((s) => (
            <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: C.textDim }}>→</span>
              <span onClick={() => setOpenSection(openSection === s.id ? null : s.id)}
                style={{ cursor: "pointer", fontWeight: openSection === s.id ? 900 : 600, color: openSection === s.id ? C.accent : C.textDim }}>
                {s.label}
              </span>
            </span>
          ))}
        </div>

        {/* ══════════════════════ DECISION (open by default) ══════════════════════ */}
        <AccordionSection id="decision" icon="🎯" label="Decision"
          summary={decisionInputs ? `${decisionInputs.vLabel} · A+ ${aPlusScore ? aPlusScore.score : "—"} · ${entryPlanDW?.entryPrice != null ? `Entry $${entryPlanDW.entryPrice}` : "Entry blocked"} / Stop $${decisionInputs.su.stop} / Target $${decisionInputs.target1R}` : "Loading…"}
          C={C} MONO={MONO} SANS={SANS} openSection={openSection} setOpenSection={setOpenSection}>
        {/* ── Decision Card — minimal default view (2026-08-19, explicit
            user wireframe): verdict / A+ score / entry-stop-target /
            trend-volume-risk / market, built entirely from data already
            fetched for the primary view (chart.setup from trend-template,
            symTrend/aPlusScore from trend-screen, regime from macroData) —
            zero new fetches. */}
        {/* Entry Engine fix (2026-08-20): DecisionCard below was the
            second real occurrence of "conflicting messages" the user
            reported — it kept showing "ENTRY $227.92" (the pivot) right
            below the new simple Decision card even when that card
            correctly said WAIT/BLOCKED. Now passed the real
            entryPlanDW.entryPrice (honest "—" when there isn't one)
            instead of always falling back to the pivot.
            Verdict reconciliation (2026-08-20, follow-up): this card's own
            "BUY" badge (decisionInputs.vLabel, driven by chart.setup.verdict
            — a real, but older and less complete daily-only read) could
            still disagree with the simple decision card sitting right
            above it (simpleDecisionDW, the stricter, MTF-aware, anti-chase-
            gated read). Rather than run two independent verdicts on the
            same page, this card now shows the SAME verdict simpleDecisionDW
            already computed — one page, one real answer, never two. */}
        {decisionInputs && (
          <DecisionCard C={C} MONO={MONO} SANS={SANS} NUM={NUM}
            symbol={sym}
            verdictIcon={simpleDecisionDW?.icon ?? decisionInputs.vIcon}
            verdictLabel={simpleDecisionDW?.label ?? decisionInputs.vLabel}
            verdictColor={simpleDecisionDW?.color ?? decisionInputs.vColor}
            aPlusScore={aPlusScore ? aPlusScore.score : null}
            entry={entryPlanDW?.entryPrice} stop={decisionInputs.su.stop} target={decisionInputs.target1R}
            trendColor={decisionInputs.trendColor} volumeColor={decisionInputs.volColor} riskColor={decisionInputs.riskColor}
            hideToggle />
        )}
        {/* SECTION 1 — Ticker / Overall Grade / AI Conviction (institutional
            redesign, 2026-07-29, explicit user spec). Overall Grade is the
            real, additive Institutional Grade (computeInstitutionalGrade) —
            Stock Quality/Trade Setup below are untouched. Recommendation/
            stars are a deterministic label on that same real score. The
            Primary Action badge that used to sit here was dropped
            (2026-08-20, Discover/Smart Scan/Workspace unification) — it's
            now guaranteed to say the same thing as the DecisionCard banner
            above (primaryAction derives from simpleDecisionDW), so showing
            it twice on one page was pure redundancy; it's still computed,
            just to feed SmartMoneyDecisionPanel's heroAction below.
            Confidence/Expected Move reuse the real computePrediction engine
            (Quick Read card below).
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
              {/* "What would change the decision" (spec section 4) — reuses
                  the same real checklist failure reasons the SETUP section's
                  Trade Readiness card shows below, not a new judgment. */}
              {checklistResult && checklistResult.dots.some(d => d.pass === false) && (
                <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginTop: 8 }}>
                  What would change this: {checklistResult.dots.filter(d => d.pass === false).slice(0, 2).map(d => d.label).join(", ")}.
                </div>
              )}
            </div>
          );
        })()}
        </AccordionSection>

        {/* ══════════════════════ SETUP ══════════════════════ */}
        <AccordionSection id="setup" icon="📐" label="Setup"
          summary={decisionInputs ? `Pivot $${decisionInputs.su.entry} · Stop $${decisionInputs.su.stop} · Target $${decisionInputs.target1R}` : "—"}
          C={C} MONO={MONO} SANS={SANS} openSection={openSection} setOpenSection={setOpenSection}>
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
            <SectionHeader icon="🎯" label="EXECUTION" C={C} SANS={SANS} />
            {/* Caption added here, not inside TrendSetupPanel itself
                (2026-08-09, decision-clarity audit) — that component is
                shared with DayTradeTab, where there's no Hero card above it
                to be subordinate to. Its GO/WAIT/AVOID answers a narrower
                question — entry timing on the breakout pivot — than the
                page's own overall verdict; this line says so without
                coupling the shared component to this one page's layout. */}
            <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginBottom: 6 }}>Entry timing, not the overall call — see the verdict above.</div>
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
              <SectionHeader icon="✅" label="TRADE READINESS" C={C} SANS={SANS} />
              <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: checklistResult.passCount / checklistResult.total >= 0.75 ? C.green : checklistResult.passCount / checklistResult.total >= 0.45 ? C.amber : C.red }}>
                {Math.round((checklistResult.passCount / checklistResult.total) * 100)}%
              </span>
              {checklistResult.passCount / checklistResult.total >= 0.75 && (
                // Relabeled from "READY TO EXECUTE" (2026-08-09, decision-
                // clarity audit) — that phrasing read as its own trade call,
                // competing with the page's actual verdict above. This dot-
                // count is a mechanical rule-pass-rate, not an AI opinion —
                // "checklist clear" says that honestly instead of implying
                // this alone means go trade.
                <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 900, color: C.green, border: `1px solid ${C.green}`, borderRadius: 4, padding: "2px 8px" }} title="Rule pass-rate only — see the verdict above for the actual call">CHECKLIST CLEAR</span>
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
        {sym && (
          <div ref={tradePlanRef} style={{ marginBottom: 10 }}>
            <AiTradeCard
              symbol={sym} price={chart?.price} aiTradeScore={aiTradeScore} institutionScore={institutionScore}
              gammaExposure={symGamma} shortFloatPct={symShortInterest?.shortFloat} rvol={symTrend?.volRatio}
              earningsDte={symTrend?.earningsDte} onTopContract={setTopContract} C={C} MONO={MONO} SANS={SANS}
            />
          </div>
        )}
        {sym && (
          <div style={{ marginBottom: 10 }}>
            <StrategySelectorCard symbol={sym} marketBias={computeMarketBias({ macroData, distData })} C={C} MONO={MONO} SANS={SANS} />
          </div>
        )}
        </AccordionSection>

        {/* ══════════════════════ TECHNICAL ══════════════════════ */}
        <AccordionSection id="technical" icon="📈" label="Technical"
          summary={chart && chart.stage ? `${chart.stage}${symTrend?.volRatio != null ? " · Vol " + symTrend.volRatio.toFixed(1) + "×" : ""}` : "Loading…"}
          C={C} MONO={MONO} SANS={SANS} openSection={openSection} setOpenSection={setOpenSection}>
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
              return [
                pill("RS RATING", num(s.rsRating) != null ? String(s.rsRating) : "—", s.rsRating >= 80 ? "#22d47e" : s.rsRating >= 70 ? "#d6a312" : "#ef4444"),
                pill("VOL vs AVG", num(s.volRatio) != null ? s.volRatio.toFixed(2) + "×" : "—", s.volRatio >= 1.5 ? "#f59e0b" : C.text),
                pill("MOMENTUM", num(s.momentum) != null ? (s.momentum > 0 ? "+" : "") + s.momentum.toFixed(1) + "%" : "—", s.momentum > 0 ? "#22d47e" : "#ef4444"),
              ];
            })()}
          </div>
        )}
        {/* Technical Read (2026-08-20, explicit user request: "tell me
            based on technical is it good or bad trade or neutral,
            specially v recovery") — one plain verdict synthesizing
            everything below (RS/Volume/Momentum/ADX/Donchian/Bollinger +
            Foundation/V-Recovery) instead of leaving the user to eyeball
            6+ raw numbers. See computeTechnicalRead in market-helpers.js
            for why this is deliberately separate from DECISION's verdict
            above, not merged into it. */}
        {chart && chart.technicals && (() => {
          const read = computeTechnicalRead({
            rsRating: chart.rsRating, volRatio: chart.volRatio, momentum: chart.momentum,
            adx: chart.technicals.adx, donchian: chart.technicals.donchian, bollinger: chart.technicals.bollinger,
            foundation: symFoundation,
          });
          return (
            <div style={{ border: `1px solid ${read.color}55`, background: `${read.color}12`, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5 }}>TECHNICAL READ</span>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: read.color }}>{read.verdict}</span>
                {read.knownCount > 0 && (
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>({read.bullCount} bullish · {read.bearCount} bearish · {read.knownCount - read.bullCount - read.bearCount} neutral of {read.knownCount})</span>
                )}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec, marginBottom: read.flags.length ? 6 : 0 }}>{read.vRecovery.note}</div>
              {read.flags.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {read.flags.map((f, i) => (
                    <div key={i} style={{ fontFamily: MONO, fontSize: 10.5, color: f.bull === true ? "#22d47e" : f.bull === false ? "#ef4444" : C.textDim }}>
                      {f.bull === true ? "✓" : f.bull === false ? "✗" : "•"} {f.label} — {f.detail}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
        {/* Technical Foundation & V-Recovery Engine (2026-08-19, explicit
            user spec) — a separate dimension from A+ Score/momentum above:
            "has this stock actually repaired its structure," not "is it
            strong." Fetched only while TECHNICAL is open (see the
            symFoundation effect above) via /api/market/foundation, which
            reuses this same chart's real VCP/pivot/RS — zero duplicate
            VCP computation. */}
        {symFoundation && (
          <FoundationCard C={C} MONO={MONO} SANS={SANS} NUM={NUM} symbol={sym} data={symFoundation}
            onExplain={() => setExplain({ symbol: sym, aplus: { score: symFoundation.foundationScore, breakdown: symFoundation.breakdown, reasons: symFoundation.reasons }, dimensions: FOUNDATION_DIMENSIONS, label: FOUNDATION_LABEL })} />
        )}
        {sym && (
          <div style={{ marginBottom: 14 }}>
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
        )}
        {/* EARLY IN / EARLY OUT — Reversal Detector (2026-08-04, explicit
            user request: "show me early get in and early get out and when
            stock undervalue and when overvalue like climax"). Ported
            verbatim (same real weights/thresholds, see the function's own
            comment) from SmartScanTab.jsx's existing "BOTTOM / TOP
            DETECTOR" — this already-shipped feature just never appeared on
            the Chart page. All real inputs already on this page's own
            chart payload: 52w hi/lo, RSI(14)/day-%/week-% (added to
            buildTrendTemplate for this), RVOL, 50-day MA. */}
        {sym && chart && (
          <div style={{ marginBottom: 14 }}>
            <SectionHeader icon="🔄" label="EARLY IN / EARLY OUT" C={C} SANS={SANS} />
            {(() => {
              const rd = computeReversalDetector({
                price: chart.livePrice ?? chart.price,
                hi52: chart.hi52, lo52: chart.lo52,
                rsi: chart.technicals && chart.technicals.rsi,
                rvol: chart.volRatio,
                dayChangePct: chart.dayChangePct, weekChangePct: chart.weekChangePct,
                ma50: chart.ma && chart.ma.ma50,
              });
              if (!rd) return <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 14px", background: C.bg, fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center" }}>Loading…</div>;
              const vColor = rd.isNeutral ? C.textDim : rd.isBottom ? C.green : C.red;
              const vBg = rd.isNeutral ? C.bg : `${vColor}0c`;
              return (
                <div style={{ border: `1px solid ${vColor}55`, borderRadius: 12, padding: "12px 14px", background: vBg }}>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: vColor, marginBottom: rd.sigs.length ? 8 : 0 }}>
                    {rd.isBottom ? "🟢" : rd.isTop ? "🔴" : "〰️"} {rd.verdict}
                  </div>
                  {rd.hi52 > rd.lo52 && rd.distFromLo != null && rd.distFromHi != null && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 3 }}>
                        <span>52w Lo ${rd.lo52.toFixed(0)}</span>
                        <span style={{ color: vColor, fontWeight: 800 }}>{rd.distFromLo.toFixed(0)}% from Lo · {rd.distFromHi.toFixed(0)}% from Hi</span>
                        <span>52w Hi ${rd.hi52.toFixed(0)}</span>
                      </div>
                      <div style={{ height: 5, background: C.border, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, rd.distFromLo / (rd.distFromLo + rd.distFromHi) * 100)}%`, height: "100%", background: vColor, borderRadius: 3 }} />
                      </div>
                    </div>
                  )}
                  {rd.sigs.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 6 }}>
                      {rd.sigs.map((s, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 5, fontFamily: SANS, fontSize: 12, color: vColor }}>
                          <span style={{ flexShrink: 0, opacity: 0.7 }}>{"●".repeat(Math.min(s.weight, 3))}</span>
                          <span>{s.txt}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Price in the middle of its range — no clear reversal signal yet.</div>
                  )}
                  {!rd.isNeutral && (
                    <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, lineHeight: 1.5, marginTop: 4 }}>
                      {rd.isBottom ? "Wait for a green candle + volume spike to confirm before entering." : "Watch for a red candle close below support to confirm before exiting."}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
        {/* SECTION 2 — Technical/Timing scores (institutional redesign,
            2026-07-29, explicit user spec: "Market, Sector, Stock Quality,
            Institutional, Technical, Timing" — split across sections in the
            2026-08-19 reorg per the "one home per metric" rule: Market/
            Sector → MARKET & CONTEXT, Stock Quality → BUSINESS, Technical/
            Timing stay here). deriveTopLevelScores (market-helpers.js) is
            presentation-layer only — nothing underlying recomputed. */}
        {topScores && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 10 }}>
            {[
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
              {/* "Options: " prefix (2026-08-10, real user-caught collision)
                  — this badge's label comes from OPTIONS_ACTIONS
                  (options-actions.js), a deliberately separate vocabulary
                  from the Hero's AI_ACTIONS answering a different question
                  ("calls or puts, right now" vs. "own this stock at all")
                  — but AVOID/WATCH are spelled identically in both, so an
                  options-context "Avoid" read as a second, contradictory
                  buy/sell call on the stock itself sitting right under a
                  Hero that said Buy. Same real score/label, just named
                  clearly instead of relying on nearby context. */}
              <span title="This is a calls-vs-puts read, not a second buy/sell call on the stock — see the verdict above for that."
                style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "5px 10px", borderRadius: 6, background: `${aiTradeScore.recommendation.color}18`, color: aiTradeScore.recommendation.color }}>
                Options: {aiTradeScore.recommendation.label}
              </span>
            </div>
          </button>
        )}
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
          <button onClick={toggleTrendRating} title={showTrendRating ? "Hide the Trend & Base Rating overlay on the chart" : "Show the Trend & Base Rating overlay on the chart"}
            style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "5px 12px", borderRadius: 7, cursor: "pointer",
              border: `1px solid ${showTrendRating ? C.accent : C.border}`, background: showTrendRating ? `${C.accent}18` : "transparent",
              color: showTrendRating ? C.accent : C.textDim }}>
            {showTrendRating ? "📊 Rating: On" : "📊 Rating: Off"}
          </button>
        </div>
        {/* SECTION 5 — large interactive chart. Right padding reserves
            clearance for the fixed bottom-right FAB cluster (Copilot/
            QuickTrade/RealityCheck, right:18, ~54-70px wide each) — the
            chart's own right price scale would otherwise render directly
            under those icons and get covered (confirmed live). Real, live
            TradingView advanced-chart embed (same widget DayTradeTab/
            MultiTfTab/TrendTemplateTab/TerminalWorkspace use) — real
            intraday ticks, not a polled snapshot. chartTf drives the real
            TradingView interval via TV_INTERVAL so the 5m/15m/30m/1H/1D/1W
            buttons above control it. Untouched by the 2026-08-19 reorg —
            same pixels, just now living inside TECHNICAL instead of its
            own dTab. */}
        <div style={{ paddingRight: 90, position: "relative" }}>
          {chart && sym
            ? <>
                <iframe key={`chart-${sym}-${chartTf}-${tvTheme}`} title={`${sym} live chart`}
                  src={`/client/tv-widget.html?w=advanced-chart&s=${encodeURIComponent(sym)}&t=${tvTheme}&h=720&iv=${TV_INTERVAL[chartTf] || "D"}&st=ema50,wma150,ma200,bb,volume`}
                  style={{ width: "100%", height: 720, border: `1px solid ${C.border}`, borderRadius: 12, display: "block" }} />
                {/* Trend & Base Rating + trade levels overlay — real
                    rating + PIVOT/STOP/T1/T2/T3 numbers TradingView has no
                    way to know, using the exact same formula TrendChart.jsx
                    used. Collapsed to a small pill by default — tap to
                    expand. Untouched by the 2026-08-19 reorg. */}
                {showTrendRating && <TrendRatingOverlay chart={chart} C={C} MONO={MONO} SANS={SANS} isMobile={isMobile} />}
              </>
            : <div style={{ height: 720, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 13, color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 12 }}>Select a mover to load the chart…</div>}
        </div>
        </AccordionSection>

        {/* ══════════════════════ MARKET & CONTEXT ══════════════════════ */}
        <AccordionSection id="market" icon="🌍" label="Market & Context"
          summary={`${regime.label}${symSectorInfo ? " · " + symSectorInfo.name + " #" + symSectorInfo.rank : ""}${institutionScore ? " · " + institutionScore.label : ""}`}
          C={C} MONO={MONO} SANS={SANS} openSection={openSection} setOpenSection={setOpenSection}>
        {/* Market/Sector — single real numbers with no sub-dimension
            breakdown, so they get a plain tooltip instead of the full
            AiScoreExplainer modal (unlike Technical/Timing in TECHNICAL). */}
        {topScores && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 10 }}>
            {[
              { key: "market", label: "MARKET", tile: topScores.market, onClick: null,
                title: `Real market regime score (SPY/QQQ/VIX-derived) — ${regime.label}` },
              { key: "sector", label: "SECTOR", tile: topScores.sector, onClick: null,
                title: symSectorInfo ? `${symSectorInfo.name} ranked #${symSectorInfo.rank} of ${symSectorInfo.of} S&P sectors today` : "Sector rank unavailable" },
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
            <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, maxWidth: 260 }}>
              {institutionScore.disclosure}
              {/* 2026-08-10, real user-caught confusion: a low score/
                  Distribution label here next to a Buy verdict above read
                  as a contradiction. It's real, live order-flow direction
                  (dark pool/options/insider/short interest) — a genuinely
                  different, faster-moving read than the Hero's business/
                  setup-quality grade, and the two are allowed to disagree
                  by design, not a data error. */}
              <div style={{ marginTop: 4 }}>Live order-flow direction — can differ from the grade above; that's expected, not a contradiction.</div>
            </div>
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
          <SectionHeader icon="🌍" label="MARKET CONTEXT" C={C} SANS={SANS} />
          <MacroStatusStrip C={C} MONO={MONO} macroData={macroData} distData={distData} fred={macroFred} />
        </div>
        {/* SECTION 6 — Smart Money (moved back inline 2026-08-05 per
            explicit user request, "move smart money tab under ai summary
            under the chart in chart tab" — it briefly lived as its own
            standalone page/sidebar tab earlier the same day; this is the
            same real decision-engine content (SmartMoneyDecisionPanel).
            Not a raw SMC data dump — real AI Verdict -> Institutional
            Summary -> Trade Plan -> 3 Traffic Lights reading order, with
            the full raw Order Blocks/FVGs/Liquidity/VWAP/Volume Profile/
            Dark Pool evidence (SmartMoneyPanel.jsx) collapsed underneath. */}
        {chart && sym && (
          <div style={{ marginTop: 14, marginBottom: 14 }}>
            <SectionHeader icon="🧱" label="SMART MONEY" C={C} SANS={SANS} />
            {/* heroAction (2026-08-09, decision-clarity audit) — this
                panel used to compute its own separate headline verdict
                server-side (computeNextAction + a ported copy of the
                grade formula), which could genuinely disagree with the
                page's own Hero verdict above for the same symbol at the
                same instant (different decision-tree logic, not just
                different data). Passing the same primaryAction down
                guarantees this panel's headline always agrees with the
                Hero card by construction — its own institutional
                evidence (trade plan, traffic lights, key reasons) stays
                exactly as real and unfiltered as before, it's the
                competing verdict language that's gone, not the data. */}
            <SmartMoneyDecisionPanel symbol={sym} C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} isMobile={isMobile} heroAction={primaryAction} />
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
            via the "News & Journal" dTab below and Calendar page rather
            than duplicating that real data a second time here. */}
        {chart && sym && (
          <div style={{ marginBottom: 14 }}>
            <SectionHeader icon="📅" label="CATALYSTS" C={C} SANS={SANS} />
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
        {/* Former standalone "Zone 3" Market Snapshot — folded in here
            (2026-08-19 reorg) instead of a separate block at the bottom of
            the page, so market-wide context has exactly one home. */}
        <div style={{ marginTop: 14 }}>
          <SectionHeader icon="📡" label="MARKET SNAPSHOT" C={C} SANS={SANS} />
          <MarketPulseBar C={C} MONO={MONO} SANS={SANS} />
          <SentimentRow C={C} MONO={MONO} SANS={SANS} />
          <SectorHeatStrip sectorData={sectorData} C={C} MONO={MONO} SANS={SANS} />
          <COTPanel C={C} MONO={MONO} SANS={SANS} />
        </div>
        <div style={{ marginTop: 10 }}>
          <span onClick={() => setDTab("flow")} style={{ fontFamily: MONO, fontSize: 11, color: C.accent, cursor: "pointer", fontWeight: 700 }}>Full Options Flow detail →</span>
        </div>
        </AccordionSection>

        {/* ══════════════════════ BUSINESS ══════════════════════ */}
        <AccordionSection id="business" icon="🏢" label="Business"
          summary={`${fund && fund.name ? fund.name + " · " : ""}${topScores?.stockQuality ? "Quality " + (topScores.stockQuality.score ?? "—") : ""}`}
          C={C} MONO={MONO} SANS={SANS} openSection={openSection} setOpenSection={setOpenSection}>
        {/* Company Overview + Last Earnings (2026-08-05, explicit user
            request: "everything i need to know about company and last
            earning right underneath ticker and price and deep dive about
            company"). Real fundamentals + real last-reported-quarter
            earnings result. */}
        {sym && <CompanyOverviewCard symbol={sym} C={C} MONO={MONO} SANS={SANS} />}
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
              ];
            })()}
          </div>
        )}
        {topScores && (
          <div style={{ maxWidth: 220, marginBottom: 10 }}>
            <button onClick={() => setExplain({ symbol: sym, aplus: stockQuality, dimensions: STOCK_QUALITY_DIMENSIONS, label: "STOCK QUALITY SCORE" })}
              style={{ font: "inherit", textAlign: "left", width: "100%", border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", background: C.card, cursor: "pointer" }}>
              <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 3 }}>STOCK QUALITY</div>
              <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: topScores.stockQuality.color }}>
                {topScores.stockQuality.score ?? "—"}{topScores.stockQuality.score != null && <span style={{ fontSize: 11, color: C.textDim }}> /100</span>}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 10, color: topScores.stockQuality.color, fontWeight: 700 }}>{topScores.stockQuality.label}</div>
            </button>
          </div>
        )}
        {sym && (
          <div>
            <SectionHeader icon="📊" label="FUNDAMENTALS" C={C} SANS={SANS} />
            <FundamentalsPanel symbol={sym} C={C} MONO={MONO} SANS={SANS} />
            <span onClick={() => setDTab("valuation")} style={{ fontFamily: MONO, fontSize: 11, color: C.accent, cursor: "pointer", fontWeight: 700, display: "inline-block", marginTop: 8 }}>Full Fundamentals & Valuation →</span>
          </div>
        )}
        </AccordionSection>

        {/* ══════════════════════ INTELLIGENCE ══════════════════════ */}
        <AccordionSection id="intelligence" icon="🧠" label="Intelligence" tone="gold"
          summary={oneLiner || "AI analysis, history & research"}
          C={C} MONO={MONO} SANS={SANS} openSection={openSection} setOpenSection={setOpenSection}>
        {/* SECTION 3 — AI Summary (institutional redesign, 2026-07-29).
            Same real, free, deterministic BullBearPanel — splits the real
            Institutional Grade dimensions by which side of the case they
            support, zero new fetch/API cost. Compressed to its own real
            bull/bear reason list by design — never a long generated essay. */}
        {chart && (
          <div style={{ marginBottom: 14 }}>
            <SectionHeader icon="🧠" label="AI SUMMARY" tone="gold" C={C} SANS={SANS} />
            <BullBearPanel symbol={sym} bullBear={bullBear} C={C} MONO={MONO} SANS={SANS} />
          </div>
        )}
        {chart && (() => {
          // Real, free, deterministic ~1-week read — the same engine
          // formerly the standalone Predictions tab. Distinct from
          // AiPredictPanel below, which is a manual, paid (Fable) AI-
          // generated target — this one is always-on and costs nothing.
          // Reuses the `prediction` computed once above (also feeds the
          // AI Score Card) instead of recomputing the same real read twice.
          const p = prediction;
          if (!p) return null;
          const dirCol = p.dir.includes("BULL") || p.dir === "LEAN UP" ? C.green : p.dir.includes("BEAR") || p.dir === "LEAN DOWN" ? C.red : C.textDim;
          const dirIcon = p.dir.includes("BULL") || p.dir === "LEAN UP" ? "📈" : p.dir.includes("BEAR") || p.dir === "LEAN DOWN" ? "📉" : "➡️";
          return (
            <div style={{ marginBottom: 14, border: `1px solid ${dirCol}55`, borderRadius: 12, padding: "12px 14px", background: `${dirCol}0d` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: C.text }}>{dirIcon} Quick Read — next ~1 week</div>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: dirCol }}>{p.dir}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>target ${p.target} ({p.movePct >= 0 ? "+" : ""}{p.movePct}%) · {p.conf}% confidence</span>
              </div>
              <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textSec, marginTop: 6 }}>
                {p.why.length ? p.why.join(" · ") : "No strong real signal either way — real trend template + volume are roughly neutral right now."}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 6 }}>Free, deterministic, real trend-template based — not an AI call.</div>
            </div>
          );
        })()}
        <AiWhyPanel symbol={sym} price={chart && chart.price} changePct={symDayPct} C={C} MONO={MONO} SANS={SANS} />
        <AiPredictPanel symbol={sym} chart={chart} C={C} MONO={MONO} SANS={SANS} />
        {/* History & Deep Research (spec sections 8-9) — no dedicated
            backtest/similar-setup engine or SEC-filing research engine
            exists in this app today; rather than fabricate either, this
            honestly links to the closest real equivalents instead. */}
        <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: 0.5, marginBottom: 6 }}>HISTORY & DEEP RESEARCH</div>
          <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.textDim, marginBottom: 6 }}>
            No dedicated backtest/similar-setup history engine exists yet for individual symbols — the closest real record is this symbol's own journal notes.
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span onClick={() => setActiveTab && setActiveTab("rhpro-journal")} style={{ fontFamily: MONO, fontSize: 11, color: C.accent, cursor: "pointer", fontWeight: 700 }}>Journal history →</span>
            <span onClick={() => setDTab("company")} style={{ fontFamily: MONO, fontSize: 11, color: C.accent, cursor: "pointer", fontWeight: 700 }}>Company profile →</span>
            <span onClick={() => setDTab("investors")} style={{ fontFamily: MONO, fontSize: 11, color: C.accent, cursor: "pointer", fontWeight: 700 }}>Institutional ownership →</span>
            <span onClick={() => setDTab("social")} style={{ fontFamily: MONO, fontSize: 11, color: C.accent, cursor: "pointer", fontWeight: 700 }}>Social/analyst chatter →</span>
            <span onClick={() => setDTab("news")} style={{ fontFamily: MONO, fontSize: 11, color: C.accent, cursor: "pointer", fontWeight: 700 }}>News & journal →</span>
          </div>
        </div>
        </AccordionSection>

        {/* ── Deep-link sub-tabs — Smart Scan/Options Flow/Valuation/
            Analysts/Investors/Earnings/Company/Social/News, each a real,
            already-self-contained panel; the 6 sections above link into
            these via "→" jump links rather than duplicating their content.
            The chart itself is no longer one of these — it now lives
            permanently inside the TECHNICAL section above.
            Horizontal-scroll single row, not flexWrap — standardized
            across every tab's internal sub-nav in the 2026-07-22 site
            reorg. */}
        <div style={{ display: "flex", gap: 4, margin: "4px 0 12px", flexWrap: "nowrap", overflowX: "auto", scrollbarWidth: "none", borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
          {[["smart", "🔬 Smart Scan"], ["flow", "💵 Options Flow"], ["valuation", "📊 Valuation"], ["analysts", "🎯 Analysts"], ["investors", "🏦 Investors"], ["earnings", "💰 Earnings"], ["company", "🏢 Company"], ["social", "💬 Social"], ["news", "📰 News & Journal"]].map(([id, lbl]) => (
            <button key={id} onClick={() => setDTab(id)}
              style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: 7, cursor: "pointer",
                whiteSpace: "nowrap", flexShrink: 0, minHeight: 40,
                border: `1px solid ${dTab === id ? C.accent : "transparent"}`, background: dTab === id ? `${C.accent}16` : "transparent", color: dTab === id ? C.accent : C.textDim }}>
              {lbl}
            </button>
          ))}
        </div>
        {/* Each dTab sub-tab wrapped in its own PanelErrorBoundary
            (2026-08-19, app-wide audit, spec section 17: "one broken module
            must never crash the entire Workspace") — confirmed before this
            change that the only error boundary in the app was the root one
            in axiom-live.jsx, so a crash in e.g. News or Investors took down
            the whole page. Now a crash in one sub-tab shows a small "X
            temporarily unavailable" message and the rest of the page
            (chart, decision card, other sub-tabs) keeps working. */}
        {dTab === "smart" && <PanelErrorBoundary label="Smart Scan"><SmartScanPanel symbol={sym} chart={chart} C={C} MONO={MONO} SANS={SANS} /></PanelErrorBoundary>}
        {dTab === "flow" && <PanelErrorBoundary label="Options Flow"><OptionsFlowPanel symbol={sym} C={C} MONO={MONO} SANS={SANS} /></PanelErrorBoundary>}
        {dTab === "valuation" && <PanelErrorBoundary label="Valuation"><FundamentalsPanel symbol={sym} C={C} MONO={MONO} SANS={SANS} /></PanelErrorBoundary>}
        {dTab === "analysts" && <PanelErrorBoundary label="Analysts"><AnalystPeerPanel symbol={sym} price={chart && chart.price} lb={lb} C={C} MONO={MONO} SANS={SANS} /></PanelErrorBoundary>}
        {dTab === "investors" && <PanelErrorBoundary label="Investors"><InvestorsPanel symbol={sym} C={C} MONO={MONO} SANS={SANS} /></PanelErrorBoundary>}
        {dTab === "earnings" && <PanelErrorBoundary label="Earnings"><EarningsSnapshot symbol={sym} C={C} MONO={MONO} SANS={SANS} /><EarningsBars symbol={sym} C={C} MONO={MONO} SANS={SANS} /></PanelErrorBoundary>}
        {dTab === "company" && <PanelErrorBoundary label="Company"><CompanyProfile symbol={sym} C={C} MONO={MONO} SANS={SANS} /></PanelErrorBoundary>}
        {dTab === "social" && <PanelErrorBoundary label="Social"><SocialFeed symbol={sym} C={C} MONO={MONO} SANS={SANS} /></PanelErrorBoundary>}
        {dTab === "news" && <PanelErrorBoundary label="News"><NewsPanel symbol={sym} C={C} MONO={MONO} SANS={SANS} /><JournalNotesPanel sym={sym} C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} /></PanelErrorBoundary>}
      </div>
    </div>
    {/* Zone 3 "Market Snapshot" (MarketPulseBar/SentimentRow/SectorHeatStrip/
        COTPanel/PredictionMarkets) used to be a separate standalone block
        here — folded into the MARKET & CONTEXT section above (2026-08-19
        reorg) instead, so market-wide context has exactly one home instead
        of two. */}
    {explain && <AiScoreExplainer C={C} MONO={MONO} SANS={SANS} symbol={explain.symbol} aplus={explain.aplus} dimensions={explain.dimensions} label={explain.label} onClose={() => setExplain(null)} />}
    </div>
  );
}
