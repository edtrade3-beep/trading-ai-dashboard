import { useState, useEffect, useMemo } from "react";
import { RH_UNIVERSE, rhScore, stockQualityBreakdown, rhScreenProgressive } from "./rhpro-shared.jsx";
import {
  computeRegime, computeAPlusScore, computeNextAction, classifyEntryType, computePrediction, winProbFor, MIN_WIN_SAMPLE,
  computeInstitutionalGrade, institutionalLetterGrade, institutionalRecommendation, SECTOR_ETFS, STOCK_TO_SECTOR,
  computeReversalDetector,
} from "./market-helpers.js";
import AiScoreExplainer, { TRADE_SETUP_DIMENSIONS, STOCK_QUALITY_DIMENSIONS, INSTITUTIONAL_GRADE_DIMENSIONS } from "./AiScoreExplainer.jsx";
import { mapToAiAction, coreVerdictToAiAction, AI_ACTIONS } from "./ai-actions.js";
// Real staged entry plan + entry-timing verdict (2026-08-20, Discover/Smart
// Scan/Workspace unification) — same client-twin functions Smart Scan's
// own deep-dive already uses, so Discover's AI ACTION column is now backed
// by the same real entry-engine read instead of an independent guess (see
// actionFor() below).
import { computeEntryPlan } from "./entry-engine.js";
import { computeRedFlags } from "./red-flag-engine.js";
import { computeCoreScore, classifyCoreVerdict } from "./am-core-engine.js";
import { computeRegimeLabel, regimeLabelToEntryVocabulary } from "./DashboardTab.jsx";
import { computeAntiChase } from "./anti-chase.js";
import { computeGreenLight } from "./trading-utils.js";
import { findWeakestPosition, evaluateRotation } from "./portfolio-rotation-engine.js";
import GapScanner from "./GapScanner.jsx";
import DayTradeTab from "./DayTradeTab.jsx";
import { BestOpportunities } from "./terminal-panels.jsx";
import { BearishSetups } from "./BearishSetups.jsx";
import EarlyEntryScanner from "./EarlyEntryScanner.jsx";
// Phase 15 (Scanner category additions, options platform redesign) — 6 of
// the plan's 12 new categories fold in already-real, already-built
// standalone tabs as-is (same embed pattern as Gap/Day Trade/Best
// Opportunities/Early Entry above), 2 more (Short Squeeze, Insider Buying)
// are self-fetching so need zero extra props; the other 4 (Options Sweep/
// Dark Pool/Earnings/Sector Rotation) need their real already-computed
// parent state threaded through from axiom-live.jsx (see this component's
// new props below).
import SqueezeTab from "./SqueezeTab.jsx";
import InsiderTab from "./InsiderTab.jsx";
import FlowTab from "./FlowTab.jsx";
import DarkPoolTab from "./DarkPoolTab.jsx";
import EarningsTab from "./EarningsTab.jsx";
import RotationTab from "./RotationTab.jsx";
// Cortex slide-over (2026-08-14, same linked-panel treatment SmartScanTab.jsx
// got — "wire them together... professional way like bloomberg", extended
// to every "Open in Cortex" entry point).
import AMCortexTab from "./AMCortexTab.jsx";
// winProbFor/bucketOf/MIN_WIN_SAMPLE moved to market-helpers.js (2026-07-29)
// so MarketTerminalTab's new AI Score Card can reuse the exact same real
// win-probability lookup instead of re-deriving it independently.

// ── Categorized ranking — Phase 1 of the Institutional Scanner work
// (2026-07-27). Every category here is derived from fields the scan ALREADY
// computes (screenTrendTemplate/buildTrendTemplate, src/routes/market.js) —
// no new scoring logic, no new fetches for the in-memory categories. Gap
// Ups/Downs and Day Trade Candidates reuse the app's existing standalone
// GapScanner.jsx/DayTradeTab.jsx components directly rather than
// reimplementing their real (Alpaca-bar-based) data. "Reversal Watch" is
// deliberately labeled as a simplified heuristic — it's real (pctFromHigh
// and volRatio both come straight off the scan), but it is NOT the same as
// Green Light's full bottomScore, which needs live quote data this scan
// doesn't fetch — never claim more sophistication than what's actually run.
const CATEGORIES = [
  { id: "all", label: "All / Ranked" },
  // Best Opportunities — folded in as a category (2026-07-29, product/UX
  // redesign audit: 5 separate "find me an opportunity" screens with no
  // stated hierarchy). Same real BestOpportunities component/scan, embedded
  // as-is (matching the existing Gap/Day Trade pattern below), not
  // rewritten — its real notification/auto-watchlist/live-price/"why is it
  // moving" logic is untouched. BEST_OPP_UNIVERSE already equals this
  // scanner's own RH_UNIVERSE (terminal-panels.jsx's own comment confirms
  // this was already verified), so this is genuinely the same scan, just a
  // curated top-5 view instead of the full ranked table.
  { id: "bestopp", label: "Best Opportunities (Long + Short)" },
  { id: "breakout", label: "Breakout" },
  { id: "pullback", label: "Pullback" },
  { id: "rvol", label: "High RVOL" },
  { id: "momentum", label: "Momentum Leaders" },
  { id: "reversal", label: "Reversal Watch" },
  // Early Warning — "before it pops / before it drops" (2026-07-29,
  // explicit user request, extending the same idea already shipped in
  // Smart Scan). RhProScanner's rows come from a different real pipeline
  // (screenTrendTemplate's VCP/pivot analysis, no RSI/52-week data), so
  // this uses that pipeline's own real precursor fields instead of copying
  // Smart Scan's RSI-based thresholds: real VCP base contraction
  // (`tightening`, same field the VCP report itself surfaces) and real
  // distance from the pivot buy point (`abovePivotPct`/`extended`, the
  // exact same >10%-above-pivot "chasing risk" definition already used
  // everywhere else in this app for the extended flag).
  { id: "prepop", label: "Pre-Pop" },
  // Early Entry Scanner — folded in as a category (2026-07-29, product/UX
  // redesign audit item #5, second scanner consolidated after Best
  // Opportunities). Genuinely distinct from Pre-Pop above: its own real
  // computeEarlyScore precursor logic (EarlyEntryScanner.jsx), and scoped
  // to the real Watchlist, not this scanner's 100-symbol RH_UNIVERSE — the
  // label says so explicitly rather than silently changing what "Early
  // Entry" means. Embedded as-is (same pattern as Gap/Day Trade/Best
  // Opportunities above), real logic untouched.
  { id: "earlyentry", label: "Early Entry (Watchlist)" },
  { id: "extended", label: "Extended" },
  { id: "avoid", label: "Avoid List" },
  { id: "gap", label: "Gap Up/Down" },
  { id: "daytrade", label: "Day Trade" },
  // Building Higher Lows — real swing-low sequence detector
  // (buildTrendTemplate's higherLows, same swing-detection window as the
  // existing pivot/swing-high logic, applied to lows instead). Genuinely
  // missing category identified in the Green Light AI spec gap-audit.
  { id: "higherlows", label: "Building Higher Lows" },
  // Phase 15 (Scanner category additions) — genuinely missing categories
  // per the plan's gap-audit. Relative Strength is a real, already-computed
  // field (rsRating) just never its own sortable category before now.
  // Low IV/High IV are real IV Rank buckets off iv-history-store.js's
  // already-accumulated daily log (Phase 5/8), read via a new batch
  // endpoint (GET /api/market/iv-rank-batch) that costs zero live fetches —
  // pure local reads of the same real history the daily snapshot job
  // already collects for this exact universe. The remaining 6 fold in
  // already-real, already-built standalone tabs (Short Squeeze/Options
  // Sweep/Dark Pool/Earnings/Insider Buying/Sector Rotation) rather than
  // reimplementing any of their real data.
  { id: "relstrength", label: "Relative Strength" },
  { id: "lowiv", label: "Low IV" },
  { id: "highiv", label: "High IV" },
  { id: "shortsqueeze", label: "Short Squeeze" },
  { id: "optionssweep", label: "Options Sweep" },
  { id: "darkpool", label: "Dark Pool" },
  { id: "earnings", label: "Earnings" },
  { id: "insider", label: "Insider Buying" },
  { id: "sectorrotation", label: "Sector Rotation" },
  // The 3 categories Phase 15 deliberately deferred — a live per-symbol
  // Polygon/UW fetch on every category click across this scanner's full
  // ~100-symbol RH_UNIVERSE was too rate-limit-risky (Polygon's free tier
  // is 5 req/min). Real fix (2026-08-03, explicit user decision): scope to
  // the real Watchlist instead — reuses watchlist-institutional-alerts.js's
  // ALREADY-scheduled 15-min real sweep (zero new fetches, zero new rate-
  // limit risk), just persisting a fuller snapshot from those same real
  // calls. Labeled "(Watchlist)" like Early Entry above, honestly narrower
  // scope than every other category here.
  { id: "gammasqueeze", label: "Gamma Squeeze (Watchlist)" },
  { id: "whaleactivity", label: "Whale Activity (Watchlist)" },
  { id: "highoi", label: "High Open Interest (Watchlist)" },
];

// Category groups (2026-08-20, explicit user request: "organize discover"
// — the 26 categories above had grown into one flat, ungrouped wall of
// buttons with no stated hierarchy). Purely a display grouping over the
// same real CATEGORIES list — no id/label/filter logic changes, just
// which row a button renders in and an optional group heading. Every id
// in CATEGORIES appears in exactly one group (verified by hand against
// the list above); a category added later without a group falls into the
// catch-all "OTHER" bucket at render time rather than silently vanishing.
const CATEGORY_GROUPS = [
  { label: null, ids: ["all", "bestopp"] },
  { label: "MOMENTUM & TECHNICAL", ids: ["breakout", "pullback", "rvol", "momentum", "reversal", "prepop", "extended", "higherlows", "relstrength", "gap", "avoid"] },
  { label: "OPTIONS, IV & INSTITUTIONAL", ids: ["shortsqueeze", "optionssweep", "darkpool", "lowiv", "highiv", "insider"] },
  { label: "EVENTS & ROTATION", ids: ["earnings", "sectorrotation", "daytrade"] },
  { label: "WATCHLIST ONLY", ids: ["earlyentry", "gammasqueeze", "whaleactivity", "highoi"] },
];

// Categories that render an embedded standalone component instead of this
// scanner's own ranked table — kept as one list so both the render-branch
// and the "hide the table" exclusion below stay in sync automatically.
const EMBEDDED_CATEGORIES = ["gap", "daytrade", "bestopp", "earlyentry", "shortsqueeze", "optionssweep", "darkpool", "earnings", "insider", "sectorrotation"];

export default function RhProScanner({
  C, MONO, SANS, macroData, sectorData, watchlistData, setActiveTab,
  // Phase 15 — real already-computed parent state for the 4 folded tabs
  // that aren't self-fetching (Options Sweep/Dark Pool/Earnings/Sector
  // Rotation), threaded through unchanged from axiom-live.jsx's existing
  // top-level state, same values those tabs' own standalone mounts use.
  setTerminalSymbol, watchlistSymbols, setWatchlistSymbols,
  optionsFlow, flowBias, flowCallNotional, flowPutNotional, flowFilters, setFlowFilters,
  setLoading: setFlowLoading, fetchAll, apiKey, flowBySymbol, flowRows,
  dpSym, setDpSym, dpLoad, setDpLoad, dpData, setDpData, dpErr, setDpErr,
  earningsUpdatedAt, setEarningsRefreshTick, earningsLoading, earningsRows, setQuickLogModal,
  rotationRank,
  // Discover -> Smart Scan handoff (2026-08-20, Discover/Smart Scan/
  // Workspace unification, phase 3) — same real openDeepDiveFor axiom-
  // live.jsx already hands to MoversTab/GreenLightTab/DipBuyTab/DayTradeTab
  // for their own "open this symbol's deep-dive" actions; Discover just
  // never had a button wired to it. Adds the row if not already scanned,
  // expands it, and switches tabs — no separate handoff mechanism needed.
  openInSmartScan,
  // Split-screen hub handoff (2026-08-20, Discover/Smart Scan/Workspace
  // merge) — same optional prop SmartScanTab.jsx accepts; when RhProScanner
  // is rendered inside ScanTerminalHub.jsx, a row click also updates the
  // hub's shared detail pane, alongside this table's own existing
  // row-expand/Decision View behavior.
  onSelectSymbol,
}) {
  const regime = computeRegime(macroData);
  // Real market-regime gate for computeEntryPlan (2026-08-21, Unified
  // Trading System phase 2) — fixes a genuine cross-screen contradiction:
  // entry-engine.js's marketRegime qualifying condition was only ever
  // populated on Workspace (MarketTerminalTab.jsx's marketRegimeDW), never
  // here, so the exact same real stock could compute a different entry
  // stage depending only on which screen loaded it — a direct violation
  // of "never allow Smart Scan/Workspace to independently produce
  // conflicting decisions." Same real computeRegimeLabel function, same
  // real SPY/QQQ/VIX quotes (already in macroData), same RISK_ON/RISK_OFF/
  // NEUTRAL mapping Workspace already uses — not a second regime read.
  const spyQ_reg = (macroData || []).find(m => (m.symbol || "").toUpperCase() === "SPY");
  const qqqQ_reg = (macroData || []).find(m => (m.symbol || "").toUpperCase() === "QQQ");
  const vixQ_reg = (macroData || []).find(m => ["VIX", "^VIX", "VIXY"].includes((m.symbol || "").toUpperCase()));
  const { regLabel: regLabel_reg } = computeRegimeLabel(C, {
    spy: spyQ_reg, qqq: qqqQ_reg, vix: Number(vixQ_reg?.price || vixQ_reg?.regularMarketPrice || 0), loaded: !!spyQ_reg,
  });
  const marketRegimeForEntry = regimeLabelToEntryVocabulary(regLabel_reg);
  // "chart" and "plan" used to be two separate buttons/destinations —
  // "chart" opened Market Terminal, "plan" opened a standalone Trade
  // Planner that silently recomputed its OWN ATR-based entry/stop/targets,
  // which could disagree with the real VCP pivot entry/stop this same row
  // already shows in ENTRY → STOP. A 2026-07-28 pass already fixed the
  // NUMBERS disagreeing (handing off the real computed plan so Trade
  // Planner's ATR fallback got overridden), but left two separate buttons
  // and two separate pages for what's really one real trade. Merged into
  // one button (2026-08-02, explicit user request: "we have chart and
  // plan do you think combine them will be good") — Market Terminal
  // already independently computes the same real entry/stop/target for
  // whatever symbol is loaded (via its own real _buildTrendTemplate fetch,
  // same underlying real calculation as this row's own ENTRY → STOP), so
  // no plan-data handoff is needed anymore, just the symbol plus a real
  // scroll-to-plan signal so the merged action lands the user directly on
  // the real Trade Plan section instead of the top of the page. Trade
  // Planner itself isn't deleted — still reachable via the existing
  // TRADEPLANNER command-palette alias, same "hide, don't delete"
  // convention as every other folded destination in this app.
  const openChartWithPlan = (sym) => {
    try {
      localStorage.setItem("mterminal_load_sym", sym);
      localStorage.setItem("mterminal_back_to", "rhpro-scan");
      localStorage.setItem("mterminal_scroll_to", "plan");
    } catch {}
    setActiveTab && setActiveTab("mterminal");
  };
  // rawRows holds only the real trend-screen data from the network — score
  // computation is derived separately below (useMemo) so it always reflects
  // the LATEST regime/sector data instead of freezing at scan time. Fixes a
  // real gap: previously Sector Strength (and the whole Trade Setup Score,
  // which depends on regime) could go stale between scans if sectorData/
  // macroData hadn't loaded yet on mount, or if the regime shifted mid-
  // session — now every score recomputes live off current inputs without
  // needing a manual RESCAN.
  const [rawRows, setRawRows] = useState([]); const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(""); const [filter, setFilter] = useState(60); const [ranAt, setRanAt] = useState(null);
  // Real IV Rank per symbol (Phase 15's Low IV/High IV categories) — lazy-
  // fetched only when one of those 2 categories is actually opened (never
  // on every scan, since most sessions never touch this view), via the
  // batch endpoint that reads iv-history-store.js's already-accumulated
  // daily log with zero live fetches.
  const [ivRanks, setIvRanks] = useState({});
  const [ivRanksState, setIvRanksState] = useState("idle"); // idle | loading | ok | error
  // Real dark-pool/options-flow/gamma snapshot for the 3 deferred Scanner
  // categories (Gamma Squeeze/Whale Activity/High Open Interest) — same
  // lazy-fetch-on-category-open pattern as ivRanks above, reading the real
  // already-accumulated store watchlist-institutional-alerts.js's existing
  // 15-min job writes (zero new fetches).
  const [instSnapshot, setInstSnapshot] = useState({});
  const [instSnapshotState, setInstSnapshotState] = useState("idle"); // idle | loading | ok | error
  // Real open positions (Green Light AI spec — ROTATE as a per-row Scanner
  // Recommendation, not just the AutoPilot tick's own close/open pair).
  // Fetched unconditionally (cheap, applies across every category) so any
  // real buy-tier row can be checked against the real weakest current
  // holding — same findWeakestPosition/evaluateRotation the live rotation
  // tick and ActivePositionsCard's WEAKEST badge already use.
  const [positions, setPositions] = useState([]);
  useEffect(() => {
    const load = () => fetch("/api/alpaca/positions").then(r => r.json()).then(d => {
      if (d?.ok) setPositions(d.positions || []);
    }).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  const rotationState = useMemo(() => {
    const heldSymbols = new Set(positions.map(p => p.symbol));
    if (positions.length < 2) return { scoredOpen: [], heldSymbols };
    const spyQ = (macroData || []).find(m => m.symbol === "SPY") || (watchlistData || []).find(w => w.symbol === "SPY");
    const spyChg = Number(spyQ?.changesPercentage || 0);
    const regimeScore = (macroData || []).length ? computeRegime(macroData)?.score ?? null : null;
    const scoredOpen = positions
      .map(p => {
        const wq = (watchlistData || []).find(w => w.symbol === p.symbol);
        if (!wq) return null;
        return { symbol: p.symbol, quality: computeGreenLight(wq, spyChg, null, regimeScore).aScore };
      })
      .filter(Boolean);
    return { scoredOpen, heldSymbols };
  }, [positions, watchlistData, macroData]);
  // Real one-time handoff from the BESTOPP/BESTOPPORTUNITIES palette
  // redirect (axiom-live.jsx) — same localStorage-handoff convention
  // mterminal_load_sym already uses to pass a symbol across a tab switch.
  // Consumed once, not re-read on every render, so navigating away and
  // choosing a different category isn't overridden on the next mount.
  const [category, setCategory] = useState(() => {
    try {
      const hint = localStorage.getItem("rhpro_scan_category");
      if (hint) { localStorage.removeItem("rhpro_scan_category"); return hint; }
    } catch {}
    return "all";
  });
  const [track, setTrack] = useState(null); // real win-probability forward-return log
  const [explain, setExplain] = useState(null); // { symbol, aplus, dimensions, label } | null
  // AI Sniper Decision button — retired its own modal (2026-08-12
  // consolidation, "make Cortex the one decision layer, fold the rest
  // into its Deep Scan as evidence"). Now jumps straight into Cortex's
  // full analysis for the row's symbol via the same real localStorage
  // handoff convention (cortex_open_symbol) the Telegram deep-link uses.
  const [cortexPanelSymbol, setCortexPanelSymbol] = useState(null);
  const openInCortex = (symbol) => {
    try { localStorage.setItem("cortex_open_symbol", symbol.toUpperCase()); } catch {}
    setCortexPanelSymbol(symbol.toUpperCase());
  };
  // Row expand-in-place — institutional redesign (2026-07-29), same real
  // pattern SmartScanTab.jsx already uses for its own per-row deep-dive,
  // reused here rather than inventing a new interaction model. Secondary
  // metrics (Stock Quality/Trade Setup/Win%/Pred/Risk/RS/SMC) move here so
  // the main table stays to the spec's 7 primary columns.
  const [expandedSymbol, setExpandedSymbol] = useState(null);
  const [showTableHelp, setShowTableHelp] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState(null); // null = default score-ranked order
  const [sortDir, setSortDir] = useState("desc");

  // Real sector-ETF % change map for Stock Quality's Sector Strength
  // dimension — reuses sectorData/macroData, both already fetched app-wide
  // (RhProHeatMap's exact pattern), zero new network cost.
  const chg = x => Number(x?.changesPercentage ?? 0);
  const sectorPerf = {};
  (sectorData || []).forEach(s => { if (s?.symbol) sectorPerf[s.symbol] = chg(s); });
  const spyQuote = (macroData || []).find(m => (m.symbol || "").toUpperCase() === "SPY");
  if (spyQuote) sectorPerf.SPY = chg(spyQuote);
  const sectorPerfKey = JSON.stringify(sectorPerf);

  // Real sector-ETF rank (1-11) per symbol, same pattern MarketTerminalTab
  // uses for its own single-symbol Institutional Grade — reused here so
  // every scanner row's Overall Grade can weigh real Sector Strength too,
  // not just the market-wide regime. Cheap: sectorPerf is already fetched.
  const rankedSectors = useMemo(() => (
    [...SECTOR_ETFS].map(se => ({ ...se, chg: sectorPerf[se.symbol] ?? 0 })).sort((a, b) => b.chg - a.chg)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [sectorPerfKey]);
  const sectorInfoFor = (symbol) => {
    const etf = STOCK_TO_SECTOR[symbol];
    if (!etf) return null;
    const rank = rankedSectors.findIndex(se => se.symbol === etf) + 1;
    return rank > 0 ? { rank, of: rankedSectors.length } : null;
  };

  const scan = () => {
    setLoading(true); setErr(""); setRawRows([]);
    let all = [];
    rhScreenProgressive(RH_UNIVERSE,
      (part) => { all = [...all, ...part]; setRawRows(all); setRanAt(new Date()); },
      () => { setLoading(false); if (!all.length) setErr("No data returned — try RESCAN in a moment."); }
    );
  };
  useEffect(() => { scan(); }, []);
  // Auto-refresh every 10 min during the session, same real "keep it fresh
  // without a click" pattern Best Opportunities already uses (5 min there;
  // 10 here since this is a heavier 60-symbol deep scan with SMC/predict).
  // scan() only ever touches rawRows/loading/err/ranAt via stable setters —
  // no stale-closure risk from the empty dep array.
  useEffect(() => {
    const t = setInterval(scan, 10 * 60 * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    fetch("/api/market/aplus-track").then(r => r.json()).then(d => { if (d?.ok) setTrack(d); }).catch(() => {});
  }, []);

  const rows = useMemo(() => {
    return rawRows.map(x => {
      const quality = stockQualityBreakdown(x, sectorPerf);
      const aplus = computeAPlusScore(x, regime);
      // Institutional Grade — same real 7-dimension function MarketTerminalTab's
      // AI Score Card uses (Overall Grade/AI Conviction below), computed here
      // for every scanned row instead of just one symbol. Technicals/options-flow
      // aren't part of this bulk scan's payload, so those two dimensions honestly
      // fall back to computeInstitutionalGrade's own neutral midpoint (same
      // "honest null, never fabricated" discipline as everywhere else) — the
      // other five (trend/smart-money/fundamentals/macro/sector) stay fully real.
      const institutionalGrade = computeInstitutionalGrade(x, null, regime, sectorInfoFor(x.symbol), null);
      // Real prediction reused from PredictionsTab's engine, run on this
      // same row (x doubles as both the quote and the trend input — no
      // separate live-quote fetch here, so today's %-change/day-range
      // component honestly defaults to neutral; the dominant Stage/RS/
      // volume-driven scoring still runs in full).
      //
      // Real staged entry plan + entry-timing verdict (2026-08-20, Discover/
      // Smart Scan/Workspace unification) — same computeEntryPlan/
      // classifyDeepScanDecision call SmartScanTab.jsx's own deep-dive
      // makes, off this same real trend-screen row, so a symbol's AI ACTION
      // here is backed by the exact same real read Smart Scan's headline
      // verdict would show for it, not an independent guess.
      const dailyBias = (String(x.stage || "").includes("2") && Number(x.passCount || 0) >= 6) ? "BULLISH" : String(x.stage || "").includes("4") ? "BEARISH" : "NEUTRAL";
      const target1 = x.entry > x.stop ? Math.round((x.entry + (x.entry - x.stop)) * 100) / 100 : null;
      const rr = Number.isFinite(target1) && x.entry > x.stop ? Math.round(((target1 - x.entry) / (x.entry - x.stop)) * 100) / 100 : null;
      // Real Anti-Chase band (2026-08-21, Unified Trading System phase 3)
      // — same real computeAntiChase primitive Workspace already passes
      // into computeEntryPlan, off the same real abovePivotPct already on
      // this trend-screen row. Without this, entry-engine.js's real
      // breakout gate silently fell back to a cruder flat 10% cutoff for
      // every Discover row.
      const antiChase = computeAntiChase(x.abovePivotPct);
      const entryEv = {
        price: x.price, pivot: x.pivot, atr: null, contractionLow: x.contractionLow,
        dailyBias, rsRating: x.rsRating, higherLows: x.higherLows, tightening: x.tightening,
        vcpVerdict: x.vcpVerdict, vwap20: x.technicals?.vwap20, rr,
        breakoutConfirmed: x.breakoutConfirmed, extended: x.extended, priceAction: {}, antiChase,
        stop: x.stop, target1, target2: x.target2, marketRegime: marketRegimeForEntry,
      };
      const entryPlan = computeEntryPlan(entryEv);
      // Red Flag Engine (Final Trade Validation Engine, 2026-08-23) — this
      // scan previously had zero red-flag awareness at all; reuses the
      // exact same entryEv already assembled for computeEntryPlan above
      // (riskPct/dollarVolume added since red-flag-engine.js's own checks
      // read them — both honestly degrade to "unknown" when absent, same
      // discipline as everywhere else this engine is used), zero new
      // fetches.
      const redFlags = computeRedFlags({ ...entryEv, riskPct: x.riskPct, dollarVolume: x.dollarVolume });
      // AM Core Engine (One Engine Migration Phase 2, 2026-08-23) —
      // replaces classifyDeepScanDecision + the retired final-trade-gate.js
      // overlay. adx/optionsFlow are honestly null here, same real gap
      // institutionalGrade's own call above already has on this page
      // (no ADX/options-flow data at this scan tier) — never fabricated.
      const coreScore = computeCoreScore({
        passCount: x.passCount, rsRating: x.rsRating, momentum: x.momentum, stage: x.stage,
        volRatio: x.volRatio, regime, sectorInfo: sectorInfoFor(x.symbol), adx: null,
        smc: x.smc, epsGrowth: x.epsGrowth, vcpScore: x.vcpScore, riskPct: x.riskPct,
        pctFromHigh: x.pctFromHigh, antiChase, optionsFlow: null, dollarVolume: x.dollarVolume,
      });
      const coreVerdict = classifyCoreVerdict({
        score: coreScore.score, entryPlan, redFlagResult: redFlags, stage: x.stage,
        dailyBias, entryScore: aplus?.score,
      });
      return { ...x, score: quality.score, quality, aplus, institutionalGrade, next: computeNextAction(x), prediction: computePrediction(x, x), entryPlan, redFlags, coreScore, coreVerdict };
    }).sort((a, b) => (b.score - a.score) || ((b.rsRating || 0) - (a.rsRating || 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, sectorPerfKey, regime?.score, marketRegimeForEntry]);

  useEffect(() => {
    if ((category !== "lowiv" && category !== "highiv") || ivRanksState !== "idle") return;
    setIvRanksState("loading");
    fetch(`/api/market/iv-rank-batch?symbols=${RH_UNIVERSE.join(",")}`)
      .then(r => r.json())
      .then(d => { if (d?.ok) { setIvRanks(d.ranks || {}); setIvRanksState("ok"); } else setIvRanksState("error"); })
      .catch(() => setIvRanksState("error"));
  }, [category, ivRanksState]);

  const INST_SNAPSHOT_CATEGORIES = ["gammasqueeze", "whaleactivity", "highoi"];
  useEffect(() => {
    if (!INST_SNAPSHOT_CATEGORIES.includes(category) || instSnapshotState !== "idle") return;
    setInstSnapshotState("loading");
    fetch("/api/market/watchlist-institutional-snapshot")
      .then(r => r.json())
      .then(d => { if (d?.ok) { setInstSnapshot(d.snapshot || {}); setInstSnapshotState("ok"); } else setInstSnapshotState("error"); })
      .catch(() => setInstSnapshotState("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, instSnapshotState]);

  // Category derivation — all real, all off fields the scan already returns.
  let categorized = rows;
  let categoryNote = null;
  if (category === "breakout") {
    categorized = rows.filter(r => r.atBuyPoint && r.volConfirmed);
    categoryNote = "Real buy point (8/8-eligible template + actionable, not extended) with volume ≥1.4x the 50-day average.";
  } else if (category === "pullback") {
    categorized = rows.filter(r => r.actionable && !r.atBuyPoint && !r.extended);
    categoryNote = "Actionable setup, not yet at a confirmed buy point, not extended — the real trend-screen \"WATCH\" bucket.";
  } else if (category === "rvol") {
    categorized = [...rows].filter(r => Number.isFinite(r.volRatio)).sort((a, b) => (b.volRatio || 0) - (a.volRatio || 0));
    categoryNote = "Sorted by real volume vs the 50-day average, highest first.";
  } else if (category === "momentum") {
    categorized = rows.filter(r => (r.rsRating || 0) >= 80 && (r.stage || "").includes("2"));
    categoryNote = "RS ≥ 80 in a confirmed Stage 2 uptrend — the same real definition Pro Watchlists' Momentum Leaders uses.";
  } else if (category === "reversal") {
    categorized = rows.filter(r => (r.pctFromHigh || 0) <= -20 && (r.volRatio || 0) >= 1.4);
    categoryNote = "Simplified heuristic: ≥20% off the 52-week high with volume picking up — real data, but not the same as Green Light's full bottom-score model (that needs live quote data this scan doesn't fetch).";
  } else if (category === "prepop") {
    // Requires BOTH real signals together (was OR — too broad, ~half the
    // universe has a contracting base at any given time on its own).
    // Actionable + tightening + right at the pivot edge is a genuinely
    // higher-conviction "about to break" read than either alone.
    categorized = rows.filter(r => r.actionable && !r.atBuyPoint && !r.extended && r.tightening && r.abovePivotPct != null && r.abovePivotPct < 0 && r.abovePivotPct > -5);
    categoryNote = "Real VCP base contracting AND within 5% below the real pivot buy point, not triggered yet — the base is coiled right at the edge. Before it pops.";
  } else if (category === "extended") {
    categorized = [...rows].filter(r => r.extended).sort((a, b) => (b.abovePivotPct || 0) - (a.abovePivotPct || 0));
    categoryNote = "More than 10% above the real pivot buy point (the same real \"chasing risk\" definition used everywhere else in this app) — often due for a pullback before the next leg. Before it drops.";
  } else if (category === "avoid") {
    categorized = [...rows].filter(r => r.aplus).sort((a, b) => (a.aplus.score || 0) - (b.aplus.score || 0)).slice(0, 10);
    categoryNote = "The real bottom of this scan by A+ Score — same pattern as Dashboard's Stocks to Avoid card.";
  } else if (category === "higherlows") {
    categorized = rows.filter(r => r.higherLows);
    categoryNote = "Real swing-low sequence: each of the last 3 real swing lows is strictly above the one before it — the base is being built on rising support, not just consolidating.";
  } else if (category === "relstrength") {
    categorized = [...rows].filter(r => Number.isFinite(r.rsRating)).sort((a, b) => (b.rsRating || 0) - (a.rsRating || 0));
    categoryNote = "Sorted by real RS Rating (vs SPY, same field every other real card in this app already uses), highest first.";
  } else if (category === "lowiv" || category === "highiv") {
    categorized = [...rows]
      .filter(r => ivRanks[r.symbol]?.available)
      .sort((a, b) => category === "lowiv"
        ? (ivRanks[a.symbol].rank - ivRanks[b.symbol].rank)
        : (ivRanks[b.symbol].rank - ivRanks[a.symbol].rank));
    categoryNote = ivRanksState === "loading"
      ? "Loading real IV Rank history…"
      : `Real IV Rank (0-100, off iv-history-store.js's accumulated daily log) — ${category === "lowiv" ? "lowest" : "highest"} first. Symbols without ≥10 real trading days of history yet are excluded (honestly still "building").`;
  } else if (category === "gammasqueeze") {
    const wl = new Set(watchlistSymbols || []);
    categorized = [...rows]
      .filter(r => wl.has(r.symbol) && Number.isFinite(instSnapshot[r.symbol]?.gammaSqueezeProbability))
      .sort((a, b) => (instSnapshot[b.symbol].gammaSqueezeProbability) - (instSnapshot[a.symbol].gammaSqueezeProbability));
    categoryNote = instSnapshotState === "loading"
      ? "Loading real gamma data…"
      : "Real Gamma Squeeze Probability (dealer short-gamma zones + real short interest, options-math.js) off watchlist-institutional-alerts.js's already-scheduled 15-min real sweep — scoped to your real Watchlist, not the full scanner universe (too rate-limit-risky on Polygon's free tier). Requires POLYGON_API_KEY.";
  } else if (category === "whaleactivity") {
    const wl = new Set(watchlistSymbols || []);
    categorized = [...rows]
      .filter(r => wl.has(r.symbol) && (Number.isFinite(instSnapshot[r.symbol]?.darkPoolValue) || Number.isFinite(instSnapshot[r.symbol]?.optionsFlowNotional)))
      .sort((a, b) => {
        const av = Math.max(instSnapshot[a.symbol]?.darkPoolValue || 0, instSnapshot[a.symbol]?.optionsFlowNotional || 0);
        const bv = Math.max(instSnapshot[b.symbol]?.darkPoolValue || 0, instSnapshot[b.symbol]?.optionsFlowNotional || 0);
        return bv - av;
      });
    categoryNote = instSnapshotState === "loading"
      ? "Loading real whale activity…"
      : "Real $250K+ dark-pool block prints and/or unusual options flow notional (Unusual Whales), off the same already-scheduled real Watchlist sweep — scoped to your real Watchlist. Requires UNUSUAL_WHALES_API_KEY.";
  } else if (category === "highoi") {
    const wl = new Set(watchlistSymbols || []);
    categorized = [...rows]
      .filter(r => wl.has(r.symbol) && Number.isFinite(instSnapshot[r.symbol]?.totalOpenInterest))
      .sort((a, b) => (instSnapshot[b.symbol].totalOpenInterest) - (instSnapshot[a.symbol].totalOpenInterest));
    categoryNote = instSnapshotState === "loading"
      ? "Loading real open interest…"
      : "Real total open interest summed across the full sampled options chain, off the same already-scheduled real Watchlist sweep. Requires POLYGON_API_KEY.";
  }
  let shown = category === "all" ? categorized.filter(r => filter === "buy" ? r.atBuyPoint : r.score >= filter) : categorized;
  if (search.trim()) {
    const q = search.trim().toUpperCase();
    shown = shown.filter(r => r.symbol.includes(q));
  }

  // Sortable columns — click a header to sort by that real field, click
  // again to flip direction. Extracted here so both "all" and every real
  // category (breakout/pullback/rvol/momentum/reversal/avoid) share the
  // same sort behavior rather than only the default view.
  const SORTABLE = {
    quality: r => r.score,
    setup: r => r.aplus?.score ?? -1,
    grade: r => r.institutionalGrade?.score ?? -1,
    win: r => (track ? winProbFor(track, r.aplus?.score ?? r.score)?.winRate : null) ?? -1,
    confidence: r => r.confidence ?? -1,
    price: r => Number(r.price) || 0,
    rs: r => r.rsRating ?? -1,
    trend: r => r.passCount ?? -1,
  };
  if (sortBy && SORTABLE[sortBy]) {
    const acc = SORTABLE[sortBy];
    shown = [...shown].sort((a, b) => (acc(a) - acc(b)) * (sortDir === "asc" ? 1 : -1));
  }
  const toggleSort = (key) => {
    if (sortBy === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(key); setSortDir("desc"); }
  };

  // Real AI Action + ROTATE override — same logic every row used to compute
  // inline inside the table's .map() (moved out unchanged, 2026-08-04 decision-
  // first redesign) so it can also run over the full `rows` universe for the
  // header summary strip, not just the currently-filtered/categorized `shown`.
  const actionFor = (r) => {
    // AM Core Engine (One Engine Migration Phase 2, 2026-08-23) — every
    // row already has a real Core verdict (computed above, hard-gated on
    // Stage 4/Entry Score/critical red flags the same way the whole app
    // now does), so this is now the primary source instead of
    // mapToAiAction's institutional-score/nextAction fallback ladder
    // (that ladder still exists for OTHER callers without a real Core
    // verdict — kept as a fallback here too, for a row that somehow
    // failed to compute one, never silently dropped to AVOID by default).
    let action = r.coreVerdict
      ? (coreVerdictToAiAction(r.coreVerdict.verdict) || mapToAiAction({ institutionalScore: r.institutionalGrade?.score, nextAction: r.next?.action }))
      : mapToAiAction({ institutionalScore: r.institutionalGrade?.score, nextAction: r.next?.action });
    // A hard gate (Stage 4, Entry Score < 75, or a critical red flag)
    // always wins — the literal "don't display BUY beside a score unless
    // the final trade gate has approved it" rule. Skips the ROTATE
    // consideration below too, on purpose: a symbol that's hard-blocked
    // shouldn't be suggested as a rotation target.
    if (r.coreVerdict?.verdict === "AVOID_LONG") return { action: AI_ACTIONS.AVOID, rotationInfo: null };
    let rotationInfo = null;
    if (action.tier >= AI_ACTIONS.ACCUMULATE.tier && !rotationState.heldSymbols.has(r.symbol) && rotationState.scoredOpen.length) {
      const candidateQuality = r.aplus?.score ?? r.institutionalGrade?.score ?? -1;
      rotationInfo = evaluateRotation(rotationState.scoredOpen, { symbol: r.symbol, quality: candidateQuality });
      if (rotationInfo) action = AI_ACTIONS.ROTATE;
    }
    return { action, rotationInfo };
  };

  // Header summary strip — real tallies over the FULL scanned universe
  // (rows), independent of whatever category/filter is currently active,
  // so "Total Opportunities"/counts always describe the whole scan.
  const headerStats = useMemo(() => {
    const real = rows.filter(r => !r.error);
    let strongBuy = 0, buy = 0, watch = 0, avoid = 0, scoreSum = 0, scoreN = 0;
    for (const r of real) {
      const { action } = actionFor(r);
      if (action.tier === AI_ACTIONS.STRONG_BUY.tier) strongBuy++;
      else if (action.tier >= AI_ACTIONS.BUY.tier) buy++;
      else if (action.tier === AI_ACTIONS.AVOID.tier) avoid++;
      else if (action.tier <= AI_ACTIONS.WAIT.tier) watch++;
      if (r.institutionalGrade?.score != null) { scoreSum += r.institutionalGrade.score; scoreN++; }
    }
    const spy = (macroData || []).find(m => (m.symbol || "").toUpperCase() === "SPY");
    const qqq = (macroData || []).find(m => (m.symbol || "").toUpperCase() === "QQQ");
    const trendOf = (q) => q == null ? null : Number(q.changesPercentage || 0);
    return {
      total: real.length, strongBuy, buy, watch, avoid,
      avgScore: scoreN ? Math.round(scoreSum / scoreN) : null,
      spyChg: trendOf(spy), qqqChg: trendOf(qqq),
      topSector: rankedSectors[0] || null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, macroData, rankedSectors, rotationState]);

  // Per-row derived fields for the new 10-column table (2026-08-04 decision-
  // first redesign) — real action/win/grade/entry-type, all reused from
  // functions already computed above/elsewhere in this file, nothing new.
  // Default sort (no explicit column-sort active, main "all" view only):
  // real AI Action tier → real AI Score → real breakout Confidence → real
  // Win % — the exact order requested, all real fields.
  const displayRows = shown.map(r => {
    const { action, rotationInfo } = actionFor(r);
    const win = track ? winProbFor(track, r.aplus?.score ?? r.score) : null;
    const grade = r.institutionalGrade ? institutionalLetterGrade(r.institutionalGrade.score) : "—";
    const rec = r.institutionalGrade ? institutionalRecommendation(r.institutionalGrade.score) : null;
    const entryType = classifyEntryType(r, r.aplus?.score);
    const moveToTarget = (r.entry && r.target2) ? Math.round((r.target2 / r.entry - 1) * 1000) / 10 : null;
    // R:R (2026-08-09, column-explanation audit) — same real formula
    // TradeSetupPanel/SmartMoneyDecisionPanel already use for their own
    // R:R reads ((target2-entry)/(entry-stop)), not a new calculation —
    // this scan already has entry/stop/target2 for MOVE TO T2, just never
    // expressed as a ratio.
    const rr = (r.entry && r.stop && r.target2 && r.entry > r.stop) ? Math.round(((r.target2 - r.entry) / (r.entry - r.stop)) * 10) / 10 : null;
    return { ...r, action, rotationInfo, win, grade, rec, entryType, moveToTarget, rr };
  });
  if (!sortBy && category === "all") {
    displayRows.sort((a, b) => {
      const t = (b.action?.tier ?? 0) - (a.action?.tier ?? 0);
      if (t) return t;
      const s = (b.institutionalGrade?.score ?? -1) - (a.institutionalGrade?.score ?? -1);
      if (s) return s;
      const c = (b.confidence ?? -1) - (a.confidence ?? -1);
      if (c) return c;
      return (b.win?.winRate ?? -1) - (a.win?.winRate ?? -1);
    });
  }

  const scoreCol = s => s >= 80 ? C.green : s >= 65 ? "#5ab552" : s >= 50 ? C.amber : C.textDim;
  const num = { fontVariantNumeric: "tabular-nums" };
  const cell = { fontFamily: MONO, fontSize: 12.5, padding: "8px 10px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
  const th = { fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", padding: "6px 10px", textAlign: "left", position: "sticky", top: 0, background: C.card };

  return (
    <>
    <div style={{ padding: "8px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        {/* Renamed from "AI SNIPER SCANNER PRO" (2026-08-23, Sniper AI —
            a real, separate tab from Discover) — this component is what
            the sidebar labels "Discover" and shows a different, broader
            9-tier quality vocabulary (ai-actions.js), not Sniper's real
            hard-gated entry-timing verdict. Keeping the old "Sniper"
            header here would now be actively misleading next to the new,
            real Sniper AI tab. */}
        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: C.text }}>DISCOVER — FULL MARKET SCANNER</div>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>{RH_UNIVERSE.length} stocks · ranked 0–100 · full chart on every row · auto-refreshes every 10 min · {ranAt ? `scanned ${ranAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find symbol…"
          style={{ fontFamily: MONO, fontSize: 12, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, width: 140, marginLeft: "auto" }} />
        <button onClick={scan} disabled={loading} style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "8px 16px", borderRadius: 8, border: "none", color: "#fff", background: loading ? C.textDim : C.accent, cursor: loading ? "default" : "pointer" }}>{loading ? "scanning…" : "↻ RESCAN"}</button>
      </div>

      {/* Header summary strip (2026-08-04 decision-first redesign) — real
          tallies over the full scan + real regime/sector reads, so the
          market context is visible before scrolling into any single row. */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", padding: "8px 12px", marginBottom: 10, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: MONO, fontSize: 11 }}>
        <span title={regime.factors.map(f => `${f.pass ? "✓" : "✗"} ${f.label}`).join(" · ")} style={{ fontWeight: 900, color: regime.color, border: `1px solid ${regime.color}`, borderRadius: 4, padding: "2px 7px" }}>MARKET {regime.label}</span>
        <span style={{ color: C.textSec }}>{headerStats.total} <span style={{ color: C.textDim }}>opportunities</span></span>
        <span style={{ color: AI_ACTIONS.STRONG_BUY.color }}>{headerStats.strongBuy} <span style={{ color: C.textDim }}>strong buy</span></span>
        <span style={{ color: AI_ACTIONS.BUY.color }}>{headerStats.buy} <span style={{ color: C.textDim }}>buy</span></span>
        <span style={{ color: AI_ACTIONS.WATCH.color }}>{headerStats.watch} <span style={{ color: C.textDim }}>watch</span></span>
        <span style={{ color: AI_ACTIONS.AVOID.color }}>{headerStats.avoid} <span style={{ color: C.textDim }}>avoid</span></span>
        <span style={{ color: C.textSec }}>avg score <b style={{ color: C.text }}>{headerStats.avgScore ?? "—"}</b></span>
        <span style={{ color: C.textSec }}>SPY <b style={{ color: headerStats.spyChg == null ? C.textDim : headerStats.spyChg >= 0 ? C.green : C.red }}>{headerStats.spyChg == null ? "—" : `${headerStats.spyChg >= 0 ? "+" : ""}${headerStats.spyChg.toFixed(2)}%`}</b></span>
        <span style={{ color: C.textSec }}>QQQ <b style={{ color: headerStats.qqqChg == null ? C.textDim : headerStats.qqqChg >= 0 ? C.green : C.red }}>{headerStats.qqqChg == null ? "—" : `${headerStats.qqqChg >= 0 ? "+" : ""}${headerStats.qqqChg.toFixed(2)}%`}</b></span>
        {headerStats.topSector && <span title="Real strongest sector ETF today" style={{ color: C.textSec }}>top sector <b style={{ color: C.text }}>{headerStats.topSector.symbol}</b></span>}
      </div>

      {/* Category tabs — the "AI Ranking" categorized view, grouped
          (2026-08-20, "organize discover") instead of one flat 26-button
          wall. Each CATEGORY_GROUPS row renders its own line, with a
          small uppercase heading for every group after the first
          (Overview stays unlabeled — it's the default, not a category
          "type"). Any category id CATEGORY_GROUPS doesn't account for
          falls into a catch-all "OTHER" row rather than silently
          disappearing if a future category is added without updating
          the grouping. */}
      {(() => {
        const catById = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
        const grouped = new Set(CATEGORY_GROUPS.flatMap(g => g.ids));
        const ungrouped = CATEGORIES.filter(c => !grouped.has(c.id));
        const groups = ungrouped.length ? [...CATEGORY_GROUPS, { label: "OTHER", ids: ungrouped.map(c => c.id) }] : CATEGORY_GROUPS;
        const catBtn = (cat) => (
          <button key={cat.id} onClick={() => setCategory(cat.id)}
            style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 7, cursor: "pointer",
              border: `1px solid ${category === cat.id ? C.accent : C.border}`,
              background: category === cat.id ? C.accent : C.surface, color: category === cat.id ? "#fff" : C.textSec }}>
            {cat.label}
          </button>
        );
        return groups.map((g, gi) => (
          <div key={g.label || "overview"} style={{ marginBottom: 8 }}>
            {g.label && (
              <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em", marginBottom: 4 }}>{g.label}</div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {g.ids.map(id => catById[id]).filter(Boolean).map(catBtn)}
              {gi === groups.length - 1 && (
                <button onClick={() => setActiveTab && setActiveTab("rhpro-heat")}
                  style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 7, cursor: "pointer",
                    border: `1px solid ${C.border}`, background: C.surface, color: C.textSec }}>
                  Sectors →
                </button>
              )}
            </div>
          </div>
        ));
      })()}
      {categoryNote && <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginBottom: 10, lineHeight: 1.5 }}>{categoryNote}</div>}

      {category === "gap" && <GapScanner C={C} MONO={MONO} SANS={SANS} />}
      {category === "daytrade" && <DayTradeTab C={C} MONO={MONO} SANS={SANS} />}
      {category === "bestopp" && (
        <BestOpportunities C={C} MONO={MONO} SANS={SANS} macroData={macroData} setActiveTab={setActiveTab}
          onPick={(sym) => openChartWithPlan(sym)} />
      )}
      {category === "bestopp" && (
        // Real bearish counterpart (2026-08-03, explicit user request: "when
        // market is down what stocks to short") — puts, not equity shorts,
        // confirmed via AskUserQuestion; long-only guardrail stays intact.
        <BearishSetups C={C} MONO={MONO} SANS={SANS} macroData={macroData} setActiveTab={setActiveTab}
          onPick={(sym) => openChartWithPlan(sym)} />
      )}
      {category === "earlyentry" && (
        <EarlyEntryScanner watchlistData={watchlistData} macroData={macroData} sectorData={sectorData}
          onSelectSymbol={(sym) => openChartWithPlan(sym)} />
      )}
      {/* Phase 15 fold-ins — same real embed pattern as the 4 above, just
          6 more already-real, already-built standalone tabs given a home
          as Scanner categories instead of reimplementing any of their
          real data/fetches. */}
      {category === "shortsqueeze" && <SqueezeTab C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} />}
      {category === "insider" && <InsiderTab C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} />}
      {category === "optionssweep" && (
        <FlowTab C={C} MONO={MONO} optionsFlow={optionsFlow} flowBias={flowBias}
          flowCallNotional={flowCallNotional} flowPutNotional={flowPutNotional}
          flowFilters={flowFilters} setFlowFilters={setFlowFilters} setLoading={setFlowLoading}
          fetchAll={fetchAll} apiKey={apiKey}
          flowBySymbol={flowBySymbol} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab}
          setWatchlistSymbols={setWatchlistSymbols} watchlistSymbols={watchlistSymbols} flowRows={flowRows} />
      )}
      {category === "darkpool" && (
        <DarkPoolTab C={C} MONO={MONO} SANS={SANS} dpSym={dpSym} setDpSym={setDpSym} dpLoad={dpLoad} setDpLoad={setDpLoad}
          dpData={dpData} setDpData={setDpData} dpErr={dpErr} setDpErr={setDpErr}
          setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab} />
      )}
      {category === "earnings" && (
        <EarningsTab C={C} MONO={MONO} SANS={SANS} earningsUpdatedAt={earningsUpdatedAt} setEarningsRefreshTick={setEarningsRefreshTick}
          earningsLoading={earningsLoading} earningsRows={earningsRows}
          watchlistSymbols={watchlistSymbols} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab}
          setQuickLogModal={setQuickLogModal} setWatchlistSymbols={setWatchlistSymbols} />
      )}
      {category === "sectorrotation" && (
        <RotationTab C={C} MONO={MONO} rotationRank={rotationRank} watchlistSymbols={watchlistSymbols}
          setWatchlistSymbols={setWatchlistSymbols} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab} />
      )}

      {!EMBEDDED_CATEGORIES.includes(category) && (
      <>
      {category === "all" && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {[["buy", "At buy point"], [75, "≥ 75 elite"], [65, "≥ 65 strong"], [50, "≥ 50 all setups"]].map(([v, l]) => (
            <button key={String(v)} onClick={() => setFilter(v)} style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 7, cursor: "pointer", border: `1px solid ${filter === v ? C.accent : C.border}`, background: filter === v ? C.accent : C.surface, color: filter === v ? "#fff" : C.textSec }}>{l}</button>
          ))}
        </div>
      )}
      {err && <div style={{ fontFamily: SANS, fontSize: 12, color: C.red, marginBottom: 10 }}>⚠ {err}</div>}
      {/* Mobile audit finding (2026-08-04, "what else looks crowded on
          mobile") — this table is 10 columns wide and genuinely doesn't fit
          a phone screen; the wrapper div below already has real
          overflow:auto (confirmed: horizontal scroll works), but on mobile
          there's no visible scrollbar or other hint that swiping reveals
          more columns, so it just reads as "cut off." Two real fixes, not a
          redesign: an always-shown hint line (honest on desktop too — the
          table IS wider than most viewports even there), and a sticky
          TICKER column (same position:sticky pattern already used on the
          header row below) so whichever symbol you're looking at never
          scrolls out of view while you swipe right for the rest of its row. */}
      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginBottom: 6 }}>↔ Swipe the table to see all 10 columns</div>
      {/* Persistent, not just a click-to-expand tooltip (2026-08-09,
          decision-clarity audit) — a real user could open a symbol from
          here and find its Workspace page showing a different score,
          because SCORE/AI ACTION here use an honest neutral placeholder for
          Technical Confirmation and Options Flow (this bulk scan can't
          afford a real per-row options-flow fetch across the whole
          universe). That's not a bug or disagreement, it's a fast screen
          refining into a full read — but only if it's said up front,
          not discovered by clicking into the grade explainer. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>⚡ Quick screen — Score/AI Action use a placeholder for Technical Confirmation &amp; Options Flow. Open a symbol's Workspace for the full read.</div>
        <button onClick={() => setShowTableHelp(v => !v)}
          style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.accent, background: "transparent", border: `1px solid ${C.accent}55`, borderRadius: 6, padding: "3px 9px", cursor: "pointer", whiteSpace: "nowrap" }}>
          {showTableHelp ? "Hide ▴" : "❓ How to read this table ▾"}
        </button>
      </div>
      {/* "How to read this table" panel (2026-08-09, column-explanation
          audit) — every real column already has a hover title on its
          header/cells; this is the same information gathered into one
          place for someone who'd rather read it once than hover nine
          headers. Deliberately does NOT introduce a new decision
          vocabulary (no "AI Decision"/WAIT PULLBACK states, no invented
          confidence threshold) — every line below names the exact real
          field it's describing, same one the header tooltips use. */}
      {showTableHelp && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px", background: C.card, marginBottom: 10, fontFamily: SANS, fontSize: 12.5, color: C.textSec, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 800, color: C.text, marginBottom: 6 }}>Quality and timing are two different questions — this table answers both, separately, on purpose.</div>
          <div><b style={{ color: C.text }}>SCORE</b> — is this a good business/setup? Real 7-dimension Institutional Grade, 0–100.</div>
          <div><b style={{ color: C.text }}>AI ACTION</b> — should I act on it right now? Reduces that same score plus real entry timing to one label.</div>
          <div><b style={{ color: C.text }}>CONF</b> — how clean is the chart pattern itself (0–100), independent of the score above.</div>
          <div><b style={{ color: C.text }}>HIST WIN%</b> — how often past setups that scored this well actually reached target — a track record for the score band, not a prediction for this specific trade.</div>
          <div><b style={{ color: C.text }}>MOVE TO T2 / R:R</b> — the same entry/stop/target math shown two ways: % distance to the target, and reward per $1 risked to the stop.</div>
          <div><b style={{ color: C.text }}>RISK</b> — LOW/MEDIUM/HIGH from the real stop-distance/volatility report — how much downside exposure the trade carries, not a prediction that it fails.</div>
          <div><b style={{ color: C.text }}>STRATEGY</b> — the entry-timing pattern detected (Breakout, Pullback, Trend…).</div>
          <div style={{ marginTop: 8, color: C.textDim }}>A stock can score high and still say WAIT — that means the business/setup is strong but right now isn't the entry. Not a contradiction.</div>
        </div>
      )}
      {/* ai-scan-table-wrap (2026-08-11) — mobile-only max-height/padding
          override, see the matching @media rule in axiom-live.jsx's global
          <style> block. Fixes the ⚡ Sniper button being unreachable on
          mobile (blocked by the fixed bottom FAB cluster). No effect on
          desktop — the class only matches inside that media query. */}
      <div className="ai-scan-table-wrap" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "auto", maxHeight: "70vh" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          {/* 11 decision-first columns (2026-08-04 redesign, explicit user
              spec; R:R added 2026-08-09) — Ticker+Company/AI Action/Score/
              Confidence/Hist Win%/Move to Target/R:R/Risk/Strategy/Open
              Trade Plan. Stock Quality/Trade Setup/Pred/RS/SMC detail
              stays in the tap-to-expand row below. No S+ grade exists in
              this app — real scale tops at A+. Every header below carries
              a real-definition tooltip (same text as the "How to read
              this table" panel), not just "Click to sort". */}
          <thead><tr>
            {[
              ["#", null, "Rank within the current filter, highest score first."],
              ["TICKER", null, "Symbol and company name."],
              ["AI ACTION", null, "Unified AI Action — this row's real Institutional Grade plus real entry timing, reduced to one label. A business/setup quality call plus a timing call, combined."],
              ["SCORE", "grade", "Institutional Grade — real 7-dimension business/setup quality score, 0–100. Not a timing call by itself — see AI ACTION for that."],
              ["CONF", "confidence", "Real VCP breakout-confidence score, 0–100 — how clean this row's chart pattern is, independent of SCORE."],
              ["HIST WIN%", "win", "Historical win rate of past real setups that scored in this same band — a track record for the score band, not a prediction for this specific trade."],
              ["MOVE TO T2", null, "Real % distance from entry to the 2R price target."],
              ["R:R", null, "Risk/reward — potential reward to the 2R target per $1 risked to the stop. Same entry/stop/target as MOVE TO T2, expressed as a ratio."],
              ["RISK", null, "Risk level from the real stop-distance/volatility report — LOW/MEDIUM/HIGH downside exposure, not a prediction the trade fails."],
              ["STRATEGY", null, "The entry-timing setup type detected — Breakout, Pullback, Trend, etc."],
              ["", null, null],
            ].map(([h, key, desc]) => (
              <th key={h} style={{ ...th, cursor: key ? "pointer" : "default", ...(h === "TICKER" ? { position: "sticky", left: 0, zIndex: 2 } : {}) }} onClick={key ? () => toggleSort(key) : undefined} title={desc ? (key ? `${desc} · Click to sort` : desc) : undefined}>
                {h}{sortBy === key && key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {displayRows.map((r, i) => {
              const { win, grade, rec, action, rotationInfo, entryType, moveToTarget, rr } = r;
              // institutionalRecommendation's own real quality words
              // ("Excellent"/"Strong"/"Neutral"/"Weak"/"Poor") can't be
              // misread as a second, conflicting trade command sitting next
              // to this row's own real ACTION verdict (real user report,
              // 2026-08-03: "action one says buy other one watch") — the two
              // measure different things (business quality vs. real entry
              // timing) and can legitimately disagree, same as TrendChart's
              // documented GO/WAIT-vs-AI-Score-Card divergence. Was a local
              // QUALITY_WORD relabeling map here; promoted into
              // institutionalRecommendation's own source this phase (One
              // Engine Migration Phase 3, 2026-08-23) so every consumer gets
              // the safe wording automatically — real score/stars unchanged.
              const expanded = expandedSymbol === r.symbol;
              return (
              <React.Fragment key={r.symbol}>
              <tr style={{ background: i % 2 ? "transparent" : `${C.surface}55`, cursor: "pointer" }}
                onClick={() => { setExpandedSymbol(expanded ? null : r.symbol); if (!expanded) onSelectSymbol && onSelectSymbol(r.symbol); }}>
                <td style={{ ...cell, color: C.textDim }}>{i + 1}</td>
                {/* maxWidth + truncated longName (2026-08-11) — real mobile
                    bug found in a platform audit: this cell is
                    position:sticky (stays pinned over the table's other
                    columns while scrolling), and with no width cap, an
                    unwrapped long company name ("Palo Alto Networks, Inc.",
                    "ExxonMobil Holdings Corporation"...) stretched it to
                    ~285px — 73% of a 390px mobile viewport — permanently
                    covering the ⚡ Sniper button whenever the table was
                    scrolled right to reveal it. Desktop has room to spare
                    so this was invisible there. Symbol stays full-size/bold;
                    only the company name truncates. */}
                <td style={{ ...cell, fontWeight: 900, color: C.text, position: "sticky", left: 0, zIndex: 1, background: i % 2 ? C.card : C.surface, maxWidth: 140 }}>
                  <span style={{ marginRight: 4, fontSize: 10, color: C.textDim }}>{expanded ? "▾" : "▸"}</span>
                  {r.symbol}
                  {r.longName && <div style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 400, color: C.textDim, marginLeft: 14, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.longName}</div>}
                </td>
                {/* AI ACTION — real mapToAiAction (+ real ROTATE override),
                    paired with the real entry-type qualifier chip instead of
                    a fabricated compound action like "BUY PULLBACK". */}
                <td style={cell}>
                  {action && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span title={rotationInfo ? `Real quality ${Math.round(rotationInfo.open.quality)} beats your weakest holding ${rotationInfo.close.symbol} (real quality ${Math.round(rotationInfo.close.quality)}) by +${Math.round(rotationInfo.improvement)} — the same real check the live rotation tick uses` : "Unified AI Action — reduces this row's real institutional score + verdict to one shared label"} style={{ fontSize: 11, fontWeight: 900, color: action.color, border: `1px solid ${action.color}`, borderRadius: 4, padding: "1px 6px", width: "fit-content" }}>{action.label}</span>
                      {entryType && <span title={entryType.reason} style={{ fontSize: 9.5, fontWeight: 700, color: entryType.color }}>· {entryType.type}</span>}
                    </div>
                  )}
                </td>
                {/* SCORE — real Institutional Grade letter (A+/A/B+/B/C/D/F,
                    no S+ tier exists) + real stars, click for the breakdown. */}
                <td style={cell} onClick={e => e.stopPropagation()}>
                  {r.institutionalGrade && (
                    <button onClick={() => setExplain({ symbol: r.symbol, aplus: r.institutionalGrade, dimensions: INSTITUTIONAL_GRADE_DIMENSIONS, label: "INSTITUTIONAL GRADE", note: "Technical Confirmation and Options Flow use an honest neutral midpoint in this bulk scan view (not part of this scan's payload) — open the full Charts page for this symbol for the real read on those two." })}
                      title={`Click to see why this grade, and what would raise it. ${rec ? `${rec.label} — Institutional Grade ${r.institutionalGrade.score}/100, business/setup quality, not a timing call. See AI ACTION for real entry timing.` : ""}`}
                      style={{ font: "inherit", fontWeight: 900, color: "#fff", background: grade.startsWith("A") ? "#0d9465" : grade.startsWith("B") ? "#22a06b" : grade === "C" ? "#d6a312" : grade === "D" ? "#e07b1a" : "#c8282a", border: "none", borderRadius: 4, padding: "1px 8px", cursor: "pointer" }}>
                      {grade}{rec && <span style={{ marginLeft: 5, fontSize: 9, opacity: 0.9 }}>{"★".repeat(rec.stars)}{"☆".repeat(5 - rec.stars)}</span>}
                    </button>
                  )}
                </td>
                {/* CONF — real VCP breakout-confidence score (0-100), computed
                    for every row all along but never exposed until now.
                    2026-08-14 VCP engine extension Phase 1: added the real
                    breakout state as a compact badge alongside it (state
                    machine + vcpScore were already computed for every row,
                    just never surfaced here) — no new detection logic. */}
                <td style={{ ...cell, ...num }}>
                  {Number.isFinite(r.confidence)
                    ? <span style={{ fontWeight: 700, fontSize: 12, color: r.confidence >= 70 ? C.green : r.confidence >= 40 ? C.amber : C.textDim }}>{Math.round(r.confidence)}%</span>
                    : <span style={{ color: C.textDim, fontSize: 12 }}>—</span>}
                  {r.vcpVerdict && r.vcpVerdict !== "INVALID VCP" && r.state && (
                    <div title={`VCP Setup Score ${r.vcpScore}/100 — ${r.vcpVerdict}`}
                      style={{ marginTop: 2, fontSize: 9, fontWeight: 900, color: "#fff", display: "inline-block",
                        background: r.state === "CONFIRMED" ? "#0d9465" : r.state === "BREAKOUT_ACTIVE" ? "#5ab552" : r.state === "SETUP_READY" ? "#d6a312" : r.state === "FAILED" ? "#c8282a" : "#8a94a6",
                        borderRadius: 3, padding: "1px 4px" }}>{r.state.replace(/_/g, " ")}</div>
                  )}
                </td>
                <td style={{ ...cell, ...num }}>
                  {win == null ? <span style={{ color: C.textDim, fontSize: 12 }}>—</span>
                    : win.winRate != null ? <span title={`${win.count} real observations, ${win.horizon}-day forward, same score band`} style={{ fontWeight: 800, fontSize: 13, color: win.winRate >= 60 ? C.green : win.winRate >= 45 ? C.amber : C.red }}>{win.winRate}%</span>
                    : <span title="Real forward-return log, but not enough observations yet in this score band" style={{ fontSize: 11, color: C.textDim }}>{win.count}/{MIN_WIN_SAMPLE} obs</span>}
                </td>
                {/* MOVE TO T2 — real % distance to the real 2R target
                    (entry/target2 already computed by the real VCP pivot
                    engine). Deliberately NOT labeled "Expected Move" — that
                    term means options-IV-derived move elsewhere in this app
                    and this scan doesn't fetch a per-row options chain. */}
                <td style={{ ...cell, ...num }} title="Real % distance from entry to the 2R target (not an options-IV expected move — this scan doesn't fetch a per-row chain).">
                  {moveToTarget != null ? <span style={{ color: C.green, fontWeight: 700 }}>+{moveToTarget}%</span> : <span style={{ color: C.textDim }}>—</span>}
                </td>
                {/* R:R (2026-08-09) — same real entry/stop/target2 as
                    MOVE TO T2 above, expressed as reward-per-$1-risked
                    instead of % distance. Same formula TradeSetupPanel/
                    SmartMoneyDecisionPanel already use, not a new one. */}
                <td style={{ ...cell, ...num }} title="Potential reward to the 2R target per $1 risked to the stop — same entry/stop/target as MOVE TO T2, shown as a ratio.">
                  {rr != null ? <span style={{ fontWeight: 700, color: rr >= 2 ? C.green : rr >= 1 ? C.amber : C.red }}>1:{rr}</span> : <span style={{ color: C.textDim }}>—</span>}
                </td>
                <td style={cell}>
                  {r.riskState && <span style={{ fontSize: 11, fontWeight: 900, color: r.riskState === "LOW" ? C.green : r.riskState === "MEDIUM" ? C.amber : C.red, border: `1px solid ${r.riskState === "LOW" ? C.green : r.riskState === "MEDIUM" ? C.amber : C.red}`, borderRadius: 4, padding: "1px 6px" }}>{r.riskState}</span>}
                </td>
                <td style={cell}>
                  {entryType ? <span title={entryType.reason} style={{ fontSize: 11, fontWeight: 700, color: entryType.color }}>{entryType.type.replace(" Entry", "")}</span> : <span style={{ color: C.textDim, fontSize: 12 }}>—</span>}
                </td>
                <td style={cell} onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: 5 }}>
                    <button onClick={() => openInCortex(r.symbol)} title="Open the full AI Cortex analysis for this symbol — WHY / SETUP / LEVELS / RISK / VERDICT"
                      style={{ fontSize: 10, fontWeight: 800, border: "1px solid #d6a312", background: "#d6a31214", color: "#d6a312", borderRadius: 4, padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap" }}>🧠 Cortex</button>
                    <button onClick={() => openChartWithPlan(r.symbol)} title={`Open ${r.symbol}'s full chart + real trade plan — trend, fundamentals, earnings, analysts, news, SMC, entry/stop/targets`}
                      style={{ fontSize: 10, fontWeight: 800, border: `1px solid ${C.accent}`, background: `${C.accent}14`, color: C.accent, borderRadius: 4, padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap" }}>Open Plan →</button>
                  </div>
                </td>
              </tr>
              {expanded && (
                <tr>
                  <td colSpan="11" style={{ padding: "12px 16px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                    {/* WHY summary (2026-08-09, column-explanation audit)
                        — a plain-language sentence built entirely from
                        real fields already computed for this row (action,
                        grade, riskState, entryType.reason, prediction.why)
                        — no new scoring, just restated in one place instead
                        of requiring a reader to reassemble it from 5 cells. */}
                    {action && (
                      <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.border}`, fontFamily: SANS, fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>
                        <b>{action.label}</b> — Institutional Grade {grade}{rec ? ` (${rec.label})` : ""}, risk {r.riskState || "—"}.
                        {entryType && <> {String(entryType.reason || "").replace(/\.+$/, "")}.</>}
                        {r.prediction?.why?.length ? <> {r.prediction.why.join(" · ")}.</> : ""}
                        {rr != null && <> Reward $1 : {rr} to the 2R target.</>}
                      </div>
                    )}
                    {/* Decision View (phase 2, DecisionCard inline here) was
                        removed 2026-08-20 — now genuinely redundant with
                        ScanTerminalHub.jsx's persistent right-pane Workspace
                        view, which clicking this row already opens with the
                        same real data, plus more. "Open in Smart Scan" stays
                        — that's navigation, not duplicated content. */}
                    {openInSmartScan && (
                      <button onClick={() => openInSmartScan(r.symbol, { price: r.price, changePercent: r.dayChangePct || 0 })}
                        title={`Open ${r.symbol} in Smart Scan's own deep-dive — same real entry-engine verdict, plus Options Recommendation/Technicals/SMC/News/Valuation/Foundation`}
                        style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.accent, background: "transparent",
                          border: `1px solid ${C.accent}`, borderRadius: 6, padding: "5px 12px", cursor: "pointer", marginBottom: 12 }}>
                        🔍 Open in Smart Scan
                      </button>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 3 }}>STOCK QUALITY</div>
                        {r.quality && (
                          <button onClick={() => setExplain({ symbol: r.symbol, aplus: r.quality, dimensions: STOCK_QUALITY_DIMENSIONS, label: "STOCK QUALITY SCORE" })}
                            style={{ font: "inherit", fontWeight: 900, fontSize: 14, color: scoreCol(r.score), background: "transparent", border: "none", cursor: "pointer", padding: 0, ...num }}>
                            {r.score} <span style={{ fontSize: 9, opacity: 0.7 }}>▸ why?</span>
                          </button>
                        )}
                      </div>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 3 }}>TRADE SETUP</div>
                        {r.aplus && (
                          <button onClick={() => setExplain({ symbol: r.symbol, aplus: r.aplus, dimensions: TRADE_SETUP_DIMENSIONS, label: "TRADE SETUP SCORE" })}
                            style={{ font: "inherit", fontWeight: 900, fontSize: 14, color: r.aplus.score >= 80 ? "#0d9465" : r.aplus.score >= 60 ? "#d6a312" : "#c8282a", background: "transparent", border: "none", cursor: "pointer", padding: 0, ...num }}>
                            {r.aplus.score} <span style={{ fontSize: 9, opacity: 0.7 }}>▸ why?</span>
                          </button>
                        )}
                      </div>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 3 }}>PRED (1WK)</div>
                        {r.prediction && (() => {
                          const p = r.prediction;
                          const dirCol = p.dir.includes("BULL") || p.dir === "LEAN UP" ? C.green : p.dir.includes("BEAR") || p.dir === "LEAN DOWN" ? C.red : C.textDim;
                          return <span title={p.why.join(" · ") || "No strong real signal either way"} style={{ fontSize: 12, fontWeight: 800, color: dirCol }}>{p.dir} → ${p.target} ({p.conf}%)</span>;
                        })()}
                      </div>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 3 }}>TREND</div>
                        <span style={{ fontSize: 12, fontWeight: 800, color: (r.stage || "").includes("2") ? C.green : (r.stage || "").includes("4") ? C.red : C.textDim, ...num }}>{r.passCount ?? "?"}/8 · {(r.stage || "").replace(/ —.*/, "").slice(0, 14) || "—"}</span>
                      </div>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 3 }}>RS</div>
                        <span style={{ fontSize: 14, fontWeight: 800, color: (r.rsRating || 0) >= 70 ? C.green : C.textSec, ...num }}>{r.rsRating ?? "—"}</span>
                      </div>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 3 }}>ENTRY → STOP</div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.textSec, ...num }}>{r.entry ? `$${Number(r.entry).toFixed(2)} → $${Number(r.stop).toFixed(2)}` : "—"}</span>
                      </div>
                      {instSnapshot[r.symbol] && (
                        <div>
                          <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 3 }}>WATCHLIST SNAPSHOT</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, ...num }}>
                            {Number.isFinite(instSnapshot[r.symbol].gammaSqueezeProbability) && (
                              <span title="Real Gamma Squeeze Probability — dealer short-gamma zones + real short interest">Squeeze {Math.round(instSnapshot[r.symbol].gammaSqueezeProbability)}%</span>
                            )}
                            {Number.isFinite(instSnapshot[r.symbol].totalOpenInterest) && (
                              <span title="Real total open interest, summed across the full sampled options chain">OI {instSnapshot[r.symbol].totalOpenInterest.toLocaleString()}</span>
                            )}
                            {Number.isFinite(instSnapshot[r.symbol].darkPoolValue) && (
                              <span title={`Real dark-pool block print, ${instSnapshot[r.symbol].darkPoolTime || ""}`}>DP ${(instSnapshot[r.symbol].darkPoolValue / 1e6).toFixed(1)}M</span>
                            )}
                            {Number.isFinite(instSnapshot[r.symbol].optionsFlowNotional) && (
                              <span title="Real unusual options flow notional">Flow ${(instSnapshot[r.symbol].optionsFlowNotional / 1e6).toFixed(1)}M {instSnapshot[r.symbol].optionsFlowSide || ""}</span>
                            )}
                          </div>
                        </div>
                      )}
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 3 }}>SMART MONEY</div>
                        {r.smc ? (() => {
                          const bull = r.smc.bos?.type === "BULL_BOS";
                          const bear = r.smc.bos?.type === "BEAR_BOS";
                          const parts = [
                            r.smc.bos?.label, r.smc.choch?.label,
                            r.smc.nearestOB ? `Nearest ${r.smc.nearestOB.type === "BULL_OB" ? "bullish" : "bearish"} order block ~$${r.smc.nearestOB.mid}` : null,
                            r.smc.openFVGCount ? `${r.smc.openFVGCount} open fair value gap${r.smc.openFVGCount === 1 ? "" : "s"}` : null,
                            r.smc.nearestLiquidity ? `Nearest liquidity: ${r.smc.nearestLiquidity.label} @ $${r.smc.nearestLiquidity.price}` : null,
                          ].filter(Boolean);
                          return <span style={{ fontSize: 12, fontWeight: 700, color: bull ? C.green : bear ? C.red : C.textSec }}>{parts.length ? parts.join(" · ") : "No real SMC signal right now"}</span>;
                        })() : <span style={{ fontSize: 12, color: C.textDim }}>No real SMC signal right now</span>}
                      </div>
                      {/* Reversal Detector (2026-08-04, "early get in and
                          early get out ... like climax") — same real
                          function the Chart page's EARLY IN / EARLY OUT
                          card uses, now fed from this scan's own real
                          hi52/lo52/rsi/volRatio/day%/week%/ma50 (threaded
                          through screenTrendTemplate above at zero extra
                          fetch cost). Only rendered when it actually has
                          something to say — MID RANGE with no evidence
                          isn't worth a row in an already-dense expand panel. */}
                      {(() => {
                        const rd = computeReversalDetector({
                          price: r.price, hi52: r.hi52, lo52: r.lo52, rsi: r.rsi,
                          rvol: r.volRatio, dayChangePct: r.dayChangePct, weekChangePct: r.weekChangePct, ma50: r.ma50,
                        });
                        if (!rd || rd.isNeutral) return null;
                        const vColor = rd.isBottom ? C.green : C.red;
                        return (
                          <div style={{ gridColumn: "1 / -1" }}>
                            <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 3 }}>REVERSAL — early {rd.isBottom ? "get-in" : "get-out"} read</div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: vColor, marginBottom: 2 }}>{rd.isBottom ? "🟢" : "🔴"} {rd.verdict}</div>
                            <span style={{ fontSize: 11, color: C.textSec }}>{rd.sigs.map(s => s.txt).join(" · ")}</span>
                          </div>
                        );
                      })()}
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
              );
            })}
            {!shown.length && !loading && <tr><td colSpan="11" style={{ ...cell, textAlign: "center", color: C.textDim }}>{search.trim() ? `No symbol matching "${search.trim().toUpperCase()}" in this scan.` : "No setups meet this filter right now — lower the threshold or rescan."}</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 10, color: C.textDim }}>
        Stock Quality = Trend 20 · RS 15 · Momentum 10 · Stage 10 · Volume Trend 15 · Sector Strength 15 · Fundamental 10 · Liquidity 5.
        Trade Setup = Market Regime 20 · Entry Timing 20 · Breakout Confirmation 15 · Volume Confirmation 10 · Risk Discipline 20 · Support 10 · Volatility 5.
        Win% = real forward-return log, same score band, min {MIN_WIN_SAMPLE} observations. Pred = real deterministic ~1-week direction/target off this same scan (Stage/RS/volume), not a paid AI call — hover for why. Analysis only — execute manually.
      </div>
      {explain && <AiScoreExplainer C={C} MONO={MONO} SANS={SANS} symbol={explain.symbol} aplus={explain.aplus} dimensions={explain.dimensions} label={explain.label} note={explain.note} onClose={() => setExplain(null)} />}
      </>
      )}
    </div>

    {/* ── Cortex slide-over — same linked-panel pattern as SmartScanTab.jsx ── */}
    {cortexPanelSymbol && (
      <div onClick={() => setCortexPanelSymbol(null)}
        style={{ position: "fixed", inset: 0, background: "rgba(8,18,34,0.45)", zIndex: 1300, display: "flex", justifyContent: "flex-end" }}>
        <div onClick={e => e.stopPropagation()}
          style={{ width: "min(900px, 100%)", height: "100%", background: C.bg, boxShadow: "-8px 0 40px rgba(0,0,0,0.25)",
            display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px",
            borderBottom: `1px solid ${C.border}`, background: C.card, flexShrink: 0 }}>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>🧠 CORTEX — {cortexPanelSymbol}</div>
            <button onClick={() => setCortexPanelSymbol(null)}
              style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.textDim, background: "transparent",
                border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>✕ Close</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
            <AMCortexTab key={cortexPanelSymbol} C={C} MONO={MONO} SANS={SANS} macroData={macroData} sectorData={sectorData}
              watchlistSymbols={watchlistSymbols} setActiveTab={setActiveTab} setTerminalSymbol={setTerminalSymbol} />
          </div>
        </div>
      </div>
    )}
    </>
  );
}
