import { useState, useEffect } from "react";
import { fetchSharedQuotes } from "./quote-store.js";
import { clickableProps } from "./ui-helpers.js";
import MonitorSection from "./MonitorSection.jsx";
import FedInterpreter from "./FedInterpreter.jsx";
import FedWatchWidget from "./FedWatchWidget.jsx";
import MacroEventsWidget from "./MacroEventsWidget.jsx";
import FedWatchTab from "./FedWatchTab.jsx";
import SniperAITab from "./SniperAITab.jsx";
import GreenLightTab from "./GreenLightTab.jsx";
import MyTradesTab from "./MyTradesTab.jsx";
import FlowTab from "./FlowTab.jsx";
import NewsTab from "./NewsTab.jsx";
import ActivePositionsCard from "./ActivePositionsCard.jsx";
import PriorityAlertsCard from "./PriorityAlertsCard.jsx";
import RadialGauge from "./RadialGauge.jsx";
import DonutChart from "./DonutChart.jsx";
import Sparkline from "./Sparkline.jsx";
import TrendChart from "./TrendChart.jsx";
import { computeRegime, computeMarketBias, computeAPlusMarketScore, regimeStrategyHint } from "./market-helpers.js";
import { COACH_LESSONS } from "./CoachTab.jsx";
import AiMorningBriefCard from "./AiMorningBriefCard.jsx";
import OpportunityQueueCard from "./OpportunityQueueCard.jsx";
import AskAiBar from "./AskAiBar.jsx";
import MarketIntelCard from "./MarketIntelCard.jsx";
import CeoAiCard from "./CeoAiCard.jsx";
import PortfolioRiskCard from "./PortfolioRiskCard.jsx";
import { AI_ACTIONS, mapToAiAction } from "./ai-actions.js";

// ── Shared card shell — every Dashboard card except CeoAiCard (which stays
// its own deliberately-elevated hero treatment) renders through this, so
// the whole page shares one consistent elevation instead of each card
// hand-rolling (or omitting) its own shadow. `accent` draws a 2px colored
// top border — a cheap, consistent way to color-code card categories.
// Exported (2026-07-19) so the new top-level Capital Allocation/Mission
// Status tabs in axiom-live.jsx can wrap their cards in the same shell
// instead of re-implementing it.
export function Card({ C, title, children, style, accent }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
      boxShadow: C.shadow, padding: 14, display: "flex", flexDirection: "column",
      ...(accent ? { borderTop: `2px solid ${accent}` } : {}),
      ...style,
    }}>
      {title && <div style={{ fontFamily: "inherit", fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 10 }}>{title}</div>}
      {children}
    </div>
  );
}

// Single source of truth for the RISK ON/CHOP/RISK OFF label — used by both
// MarketRegimeCard and MissionStatusCard so they can't silently disagree
// (hoisted out, not duplicated, when the "Executive Command Center" pass
// added a second consumer of this same read).
// Exported for reuse by the new top-level "Mission Status" tab in
// axiom-live.jsx (2026-07-19), which needs the same real regime label off
// the same real spy/qqq/vix inputs already available at that level.
export function computeRegimeLabel(C, { spy, qqq, vix, loaded }) {
  const spyChg = Number(spy?.changesPercentage || 0);
  const qqqChg = Number(qqq?.changesPercentage || 0);
  if (!loaded) return { regLabel: "LOADING…", regColor: C.textDim, playbook: "Waiting for market data…" };
  if (vix > 30 || spyChg < -1.5) return { regLabel: "RISK OFF", regColor: C.red, playbook: "Reduce size, cash or shorts only." };
  if (vix < 16 && spyChg > 0.3 && qqqChg > 0.3) return { regLabel: "RISK ON", regColor: C.green, playbook: "Full size on A+ setups, let winners run." };
  if (Math.abs(spyChg) < 0.3 && vix < 22) return { regLabel: "CHOP", regColor: C.amber, playbook: "Reduce size, take profits faster." };
  if (spyChg > 0.5) return { regLabel: "CAUTIOUS BULL", regColor: C.greenLight, playbook: "Normal size on confirmed setups." };
  return { regLabel: "DEFENSIVE", regColor: C.amber, playbook: "Smaller size, favor defensive sectors." };
}

// Maps computeRegimeLabel's real 5-value vocabulary (RISK ON/RISK OFF/
// CHOP/CAUTIOUS BULL/DEFENSIVE, plus the LOADING… transient) down to
// entry-engine.js's real RISK_ON/RISK_OFF/NEUTRAL vocabulary (Unified
// Trading System phase 2). One calculation, per spec §14 — this exact
// ternary used to be hand-duplicated verbatim in RhProScanner.jsx,
// SmartScanTab.jsx, and MarketTerminalTab.jsx (phase 8, 2026-08-21);
// consolidated here since all 3 already import computeRegimeLabel from
// this same file.
export function regimeLabelToEntryVocabulary(regLabel) {
  if (regLabel === "RISK ON") return "RISK_ON";
  if (regLabel === "RISK OFF") return "RISK_OFF";
  if (regLabel === "LOADING…") return null;
  return "NEUTRAL";
}

// ── Market Regime — merged with the former separate "AI Market Summary"
// card. Both read computeRegime()'s gauge score (a VIX/SPY/QQQ formula)
// and a rule-based factor-scoring bias (SPY/MA50/VIX/breadth/fear-greed/
// news) — two different formulas that CAN legitimately disagree, which is
// exactly what CEO AI exists to reconcile. They used to render as two
// separate bordered boxes answering the same underlying question; now
// they're one card, gauge + top 3 (not 5) factors, so the duplication is
// visual, not informational — nothing here was cut.
function MarketRegimeCard({ C, MONO, SANS, macroData, distData, factors, bias, biasColor, fullScan }) {
  const spy = (macroData || []).find(m => m.symbol === "SPY");
  const qqq = (macroData || []).find(m => m.symbol === "QQQ");
  const vix = distData?.vix || 0;
  const loaded = !!spy;
  const regime = computeRegime(macroData);
  const { regLabel, regColor, playbook } = computeRegimeLabel(C, { spy, qqq, vix, loaded });

  // Options platform redesign, Phase 1 (spec: "Market Bias: Bullish/
  // Bearish/Neutral, Confidence %" + "A+ Market Score"). Both are pure
  // aggregations over data this card (or its siblings) already has —
  // computeMarketBias reconciles the 3 regime formulas already on this
  // page, computeAPlusMarketScore counts fullScan's already-computed
  // per-stock scores. Appended to the existing "Market Health" card rather
  // than adding a 5th card to an already-4-card grid, per "reduce
  // clutter, don't add cards" from the same redesign spec.
  const marketBias = computeMarketBias({ macroData, distData });
  const aPlus = computeAPlusMarketScore(fullScan);
  const strategyHint = marketBias.bias ? regimeStrategyHint({ bias: marketBias.bias, character: marketBias.character, vix }) : null;
  const biasDotColor = marketBias.bias === "Bullish" ? C.green : marketBias.bias === "Bearish" ? C.red : C.textDim;

  return (
    <Card C={C} title="MARKET HEALTH">
      {/* Primary verdict — audit fix 2026-08-04: this card used to show 3
          near-synonymous bias reads with no hierarchy — this marketBias
          box, a one-sentence prose restatement of the SAME marketBias
          object right below it (real duplicate content, not just
          overlapping formulas), and a separate regime-gauge label + a
          third, locally-computed bias further down. marketBias leads now
          (it's the formula this exact question — "Market Bias: Bullish/
          Bearish/Neutral, Confidence %" — was built for); the prose
          sentence that only restated it was removed outright, not
          demoted, since it added no information the box didn't already
          have. Gauge/local-bias stay as real supporting detail below a
          divider — different formulas that CAN legitimately disagree, so
          nothing here is reconciled away, just no longer presented as 3
          equal co-verdicts. Same "SUPPORTING DETAIL" pattern already
          shipped on the Charts page. */}
      {marketBias.bias && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${biasDotColor}55`, borderRadius: 8, padding: "8px 10px", marginBottom: 10, background: `${biasDotColor}0c` }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: biasDotColor }}>{marketBias.bias} · {marketBias.confidence}% confidence</div>
            <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: 1 }}>{marketBias.character} · {marketBias.riskPosture}{strategyHint ? ` · favors ${strategyHint.toLowerCase()}` : ""}</div>
          </div>
        </div>
      )}
      {aPlus.pct != null && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: MONO, fontSize: 11, color: C.textSec, marginBottom: 10, padding: "0 2px" }}>
          <span>A+ MARKET SCORE</span>
          <span style={{ fontWeight: 800, color: aPlus.pct >= 40 ? C.green : aPlus.pct >= 20 ? C.amber : C.textDim, fontVariantNumeric: "tabular-nums" }}>{aPlus.pct}% ({aPlus.aCount}/{aPlus.total} A+/A)</span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0 10px" }}>
        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>SUPPORTING DETAIL</div>
        <div style={{ flex: 1, height: 1, background: C.border }} />
      </div>
      <RadialGauge C={C} MONO={MONO} value={regime.score} label={regLabel} sublabel="regime score" color={regColor} />
      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 8, marginBottom: 10, textAlign: "center" }}>{playbook}</div>
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: biasColor, marginBottom: 4 }}>{bias}</div>
        {/* Factor strings carry a leading emoji as their only pass/fail
            signal (✅/🔴/⚠️/📰 + BULLISH|BEARISH substring) — real
            information, so instead of just stripping it, map it to actual
            color and drop the glyph, same "color carries the signal, not
            emoji" rule applied across the rest of this redesign. */}
        {(factors || []).slice(0, 3).map((f, i) => {
          const col = f.startsWith("✅") ? C.green : f.startsWith("🔴") ? C.red : f.startsWith("⚠️") ? C.amber
            : /BEARISH|bearish/.test(f) ? C.red : /BULLISH|bullish/.test(f) ? C.green : C.textSec;
          const text = f.replace(/^(✅|🔴|⚠️|📰)\s*/, "");
          return <div key={i} style={{ fontFamily: SANS, fontSize: 11, color: col, padding: "2px 0", lineHeight: 1.4 }}>{text}</div>;
        })}
      </div>
    </Card>
  );
}

// ── Market Command Center strip — institutional redesign (2026-07-29,
// explicit user spec: "Top section should always display a Market Command
// Center"). Every cell reuses a real value already computed elsewhere on
// this page or a real prop already fetched for it — zero new API calls.
// Implemented inline here (not a separate file) since every input it needs
// is already in this component's own scope, same pattern as every other
// card in this file. Confirmed with the user: scoped to Dashboard's home
// screen, not a global bar on every page.
function MarketCommandCenterStrip({ C, MONO, SANS, macroData, distData, sectorData, eventCountdowns, regime, regLabel, regColor, breadthPct, setActiveTab }) {
  const spy = (macroData || []).find(m => m.symbol === "SPY");
  const qqq = (macroData || []).find(m => m.symbol === "QQQ");
  const vixy = (macroData || []).find(m => m.symbol === "VIXY");
  const tlt = (macroData || []).find(m => m.symbol === "TLT");
  const uup = (macroData || []).find(m => m.symbol === "UUP");
  const hyg = (macroData || []).find(m => m.symbol === "HYG");
  const chg = q => Number(q?.changesPercentage || 0);

  // Risk ON/OFF — the exact same real formula RiskTrafficLight.jsx uses
  // (SPY/QQQ/VIXY/TLT/UUP/HYG weighted score), condensed to a compact
  // badge here; the full playbook/sound version stays reachable standalone.
  let riskScore = 50 + chg(spy) * 8 + chg(qqq) * 6 - chg(vixy) * 3 + chg(tlt) * 2 - chg(uup) * 3 + chg(hyg) * 4;
  riskScore = Math.max(0, Math.min(100, Math.round(riskScore)));
  const riskState = !spy ? { label: "—", col: C.textDim } : riskScore >= 65 ? { label: "RISK ON", col: C.green } : riskScore < 40 ? { label: "RISK OFF", col: C.red } : { label: "CAUTION", col: C.amber };

  // Best Trading Strategy Today — a real, deterministic mapping off the
  // same regime label the rest of this page already shows (not a separate
  // fabricated signal) — a simpler, lower-risk stand-in for scanning every
  // Sniper Scanner category's live qualifying-row count, which would need
  // exporting that tab's internal filter logic; revisit if more precision
  // is wanted here later.
  const strategy = regLabel === "RISK ON" ? "Momentum Breakouts" : regLabel === "CAUTIOUS BULL" ? "Selective Pullback Buys"
    : regLabel === "CHOP" ? "Reduce Size, Take Profits Faster" : regLabel === "DEFENSIVE" ? "Defensive Sectors Only" : "Cash / Wait for Confirmation";

  const sectorRows = (sectorData || []).filter(s => s.symbol && Number.isFinite(Number(s.changesPercentage)))
    .map(s => ({ name: s._sectorName || s.symbol, chg: Number(s.changesPercentage) })).sort((a, b) => b.chg - a.chg);
  const strongestSector = sectorRows[0];
  const weakestSector = sectorRows[sectorRows.length - 1];

  const nextEvent = (eventCountdowns || [])[0];

  const cell = (label, value, color, onClick) => (
    <div onClick={onClick} {...(onClick ? clickableProps(onClick) : {})} style={{ minWidth: 110, cursor: onClick ? "pointer" : "default" }}>
      <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: color || C.text, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 18px", marginBottom: 14,
      display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center" }}>
      {cell("MARKET PERMISSION", `${regime?.score ?? "—"}/100`, regColor)}
      {cell("RISK", riskState.label, riskState.col)}
      {cell("MARKET TREND", regLabel, regColor)}
      {cell("BEST STRATEGY TODAY", strategy, C.accent)}
      {cell("STRONGEST SECTOR", strongestSector ? `${strongestSector.name} +${strongestSector.chg.toFixed(1)}%` : "—", C.green, () => setActiveTab?.("market"))}
      {cell("WEAKEST SECTOR", weakestSector ? `${weakestSector.name} ${weakestSector.chg.toFixed(1)}%` : "—", C.red, () => setActiveTab?.("market"))}
      {cell("VIX", distData?.vix ? distData.vix.toFixed(1) : "—", distData?.vix > 25 ? C.red : distData?.vix < 16 ? C.green : C.amber)}
      {cell("BREADTH", `${breadthPct}% up`, breadthPct >= 60 ? C.green : breadthPct <= 35 ? C.red : C.amber)}
      {cell("FED STATUS", "View →", C.accent, () => setActiveTab?.("calendar"))}
      {cell("NEXT EVENT", nextEvent ? `${nextEvent.name} (${nextEvent.days === 0 ? "today" : nextEvent.days === 1 ? "tomorrow" : nextEvent.days + "d"})` : "—", C.textSec, () => setActiveTab?.("calendar"))}
    </div>
  );
}

// ── Row 1: Portfolio Snapshot — self-contained, mirrors MyTradesTab's ──
// AlpacaPanel fetch (account + positions), condensed, + an equity sparkline
// from /api/alpaca/history. Exported (2026-07-19) for the new top-level
// "Portfolio" sidebar tab.
export function PortfolioSnapshotCard({ C, MONO, SANS }) {
  const [acct, setAcct] = useState(null);
  const [openCount, setOpenCount] = useState(0);
  const [equityHist, setEquityHist] = useState([]);
  const [state, setState] = useState("loading");
  useEffect(() => {
    const load = () => {
      fetch("/api/alpaca/account").then(r => r.json()).then(d => {
        if (d?.reason === "no-alpaca-key") { setState("nokey"); return; }
        if (!d?.ok) { setState("error"); return; }
        setAcct(d.account); setState("ok");
      }).catch(() => setState("error"));
      fetch("/api/alpaca/positions").then(r => r.json()).then(d => { if (d?.ok) setOpenCount((d.positions || []).length); }).catch(() => {});
      fetch("/api/alpaca/history?period=1M&timeframe=1D").then(r => r.json()).then(d => { if (d?.ok) setEquityHist((d.equity || []).filter(v => v != null)); }).catch(() => {});
    };
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  // Was `return null` — fine when this card sat amid other Overview
  // content, but it's now the sole content of its own dedicated Portfolio
  // tab (2026-07-19), so a no-key account silently rendered a totally
  // blank page with zero explanation. Same "no brokerage connected"
  // message CapitalAllocationCard already shows for the identical state.
  if (state === "nokey") return <Card C={C} title="PORTFOLIO SNAPSHOT"><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center", padding: 20 }}>No brokerage connected.</div></Card>;
  if (state === "loading") return <Card C={C} title="PORTFOLIO SNAPSHOT"><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Connecting…</div></Card>;
  if (state === "error" || !acct) return <Card C={C} title="PORTFOLIO SNAPSHOT"><div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>Couldn't load account.</div></Card>;
  const dayChg = (Number(acct.equity) || 0) - (Number(acct.lastEquity) || Number(acct.equity) || 0);
  const fmt = v => `$${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return (
    <Card C={C} title="PORTFOLIO SNAPSHOT">
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>TODAY'S P&L</div>
      <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: dayChg >= 0 ? C.green : C.red, marginBottom: 6, fontVariantNumeric: "tabular-nums" }}>
        {dayChg >= 0 ? "+" : ""}{fmt(Math.abs(dayChg)).replace("$", dayChg < 0 ? "-$" : "$")}
      </div>
      {equityHist.length >= 2 && <div style={{ marginBottom: 8 }}><Sparkline C={C} data={equityHist} /></div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontFamily: MONO, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
        <div><span style={{ color: C.textDim }}>Equity </span><span style={{ color: C.text, fontWeight: 700 }}>{fmt(acct.equity)}</span></div>
        <div><span style={{ color: C.textDim }}>Buying Power </span><span style={{ color: C.text, fontWeight: 700 }}>{fmt(acct.buyingPower)}</span></div>
        <div><span style={{ color: C.textDim }}>Cash </span><span style={{ color: C.text, fontWeight: 700 }}>{fmt(acct.cash)}</span></div>
        <div><span style={{ color: C.textDim }}>Open Trades </span><span style={{ color: C.text, fontWeight: 700 }}>{openCount}</span></div>
      </div>
    </Card>
  );
}

// ── Row 1: Upcoming Events — pure restyle of eventCountdowns, already fetched ──
function UpcomingEventsCard({ C, MONO, SANS, eventCountdowns }) {
  return (
    <Card C={C} title="UPCOMING EVENTS">
      {(eventCountdowns || []).length ? eventCountdowns.slice(0, 5).map((ev, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", borderBottom: i < eventCountdowns.length - 1 ? `1px solid ${C.border}` : "none" }}>
          <span style={{ fontFamily: SANS, fontSize: 12, color: C.text }}>{ev.name}</span>
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: ev.days <= 1 ? C.red : ev.days <= 3 ? C.amber : C.textDim, flexShrink: 0 }}>
            {ev.days === 0 ? "TODAY" : ev.days === 1 ? "TOMORROW" : `${ev.days}d`}
          </span>
        </div>
      )) : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>No upcoming events tracked.</div>}
    </Card>
  );
}

// ── Row 2: Watchlist — condensed symbol/price/%chg/signal from data already ──
// in props (watchlistData, sigData) — no new fetch.
// Trade-signals engine (/api/market/trade-signals) speaks its own raw
// vocabulary (LONG / SHORT / AVOID / WATCH SHORT / WATCH) — mapped here to
// the app's one shared AI_ACTIONS label set (audit fix, 2026-08-04: a user
// bouncing between Watchlist and Scanner/Green Light saw two different
// words for the same real concept). Not run through mapToAiAction itself
// since that function expects a real institutionalScore, not a raw
// trade-signals action string — a plain lookup is the honest fix here,
// not a fabricated score.
const TRADE_SIGNAL_ACTION = {
  "LONG": AI_ACTIONS.BUY,
  "SHORT / AVOID": AI_ACTIONS.AVOID,
  "WATCH SHORT": AI_ACTIONS.WATCH,
  "WATCH": AI_ACTIONS.WATCH,
};

function WatchlistCard({ C, MONO, SANS, watchlistData, sigData, setTerminalSymbol, setActiveTab }) {
  // Real cap fixed to match its own scroll affordance (audit fix,
  // 2026-08-04) — this used to hard-slice to 8 rows in JS while the
  // container was styled overflowY:auto as if more could be scrolled to;
  // with the array pre-sliced there was never anything left to scroll.
  const rows = watchlistData || [];
  const sigOf = sym => (sigData?.signals || []).find(s => s.sym === sym);
  return (
    <Card C={C} title="WATCHLIST" style={{ width: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, maxHeight: 280, overflowY: "auto" }}>
        {rows.map(q => {
          const chg = Number(q.changesPercentage || 0);
          const sig = sigOf(q.symbol);
          const action = sig ? TRADE_SIGNAL_ACTION[sig.action] : null;
          return (
            <div key={q.symbol} onClick={() => { setTerminalSymbol(q.symbol); setActiveTab("mterminal"); }} {...clickableProps(() => { setTerminalSymbol(q.symbol); setActiveTab("mterminal"); })}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 4px", borderRadius: 6, cursor: "pointer" }}>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, minWidth: 55 }}>{q.symbol}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>${Number(q.price || 0).toFixed(2)}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: chg >= 0 ? C.green : C.red, minWidth: 50, textAlign: "right" }}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</span>
              {action && <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: action.color, marginLeft: 8 }}>{action.label}</span>}
            </div>
          );
        })}
        {!rows.length && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Watchlist is empty.</div>}
      </div>
    </Card>
  );
}

// ── Row 2: big chart panel — reuses TrendChart.jsx (same component shared ──
// by DayTradeTab/MarketTerminalTab/TrendTemplateTab), fed by the same
// /api/market/trend-template endpoint they already use.
// Timeframe buttons (2026-08-31, explicit user request: "IN CHART I NEED
// 5 MIN 15 MIN 1 HOUR 4 HOURS 1 DAY 1 WEEK") — this card had NO interval
// control at all before, always the default daily bars. Same real
// TT_INTERVAL_MAP-backed /api/market/trend-template?interval= param
// TradeDeskTab.jsx/MarketTerminalTab.jsx's own timeframe buttons already
// use, not a new fetch pipeline.
const DASH_CHART_TF_OPTIONS = [["5m", "5m"], ["15m", "15m"], ["1h", "1H"], ["4h", "4H"], ["1d", "1D"], ["1wk", "1W"]];

function DashboardChartCard({ C, MONO, SANS, symbol }) {
  const [data, setData] = useState(null);
  const [tf, setTf] = useState("1d");
  useEffect(() => {
    let alive = true;
    setData(null);
    const qs = tf === "1d" ? "" : `&interval=${encodeURIComponent(tf)}`;
    fetch("/api/market/trend-template?symbol=" + encodeURIComponent(symbol) + qs)
      .then(r => r.json()).then(d => { if (alive && d && !d.error) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, [symbol, tf]);
  return (
    <Card C={C} title={`CHART — ${symbol}`} style={{ flex: "3 1 560px", minWidth: 420 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
        {DASH_CHART_TF_OPTIONS.map(([id, lbl]) => (
          <button key={id} onClick={() => setTf(id)}
            style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "5px 12px", borderRadius: 7, cursor: "pointer",
              border: `1px solid ${tf === id ? C.accent : C.border}`, background: tf === id ? `${C.accent}18` : "transparent",
              color: tf === id ? C.accent : C.textDim }}>
            {lbl}
          </button>
        ))}
      </div>
      {data ? <TrendChart data={data} C={C} MONO={MONO} SANS={SANS} height={340} />
        : <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: 40, textAlign: "center" }}>Loading chart…</div>}
    </Card>
  );
}

// ── Row 2: AI Copilot Insights — watchlist breadth donut (from data already
// in props, no new fetch) + today's rotating coach mantra. TopOpportunityCard
// itself now lives once, prominently, on the Overview tab (it owns the only
// live scan/fetch loop) — this card reads the already-scored `topPick` it
// hands up via onScore, instead of mounting a second copy (which would have
// meant two independent /api/market/trend-screen scans running at once).
function CopilotInsightsCard({ C, MONO, SANS, watchlistData, setActiveTab, setTerminalSymbol, topPick }) {
  const wl = (watchlistData || []).filter(q => q.symbol && Number(q.price) > 0);
  const adv = wl.filter(q => Number(q.changesPercentage || 0) > 0).length;
  const dec = wl.length - adv;
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const mantra = COACH_LESSONS[dayOfYear % COACH_LESSONS.length]?.mantra;
  return (
    <Card C={C} title="AI COPILOT INSIGHTS">
      {topPick && (
        <div onClick={() => { setTerminalSymbol?.(topPick.symbol); try { localStorage.setItem("mterminal_load_sym", topPick.symbol); } catch {} setActiveTab?.("mterminal"); }}
          {...clickableProps(() => { setTerminalSymbol?.(topPick.symbol); try { localStorage.setItem("mterminal_load_sym", topPick.symbol); } catch {} setActiveTab?.("mterminal"); })}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.gold}`, borderRadius: 8, marginBottom: 10, cursor: "pointer" }}>
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: C.gold }}>{topPick.symbol}</span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>top pick · A+ {topPick._aplus?.score ?? "—"}</span>
        </div>
      )}
      {wl.length >= 2 && (
        <div style={{ marginTop: 8 }}>
          <DonutChart C={C} MONO={MONO} centerLabel="WATCHLIST" centerValue={wl.length}
            segments={[{ label: "Advancing", value: adv, color: C.green }, { label: "Declining", value: dec, color: C.red }]} size={140} />
        </div>
      )}
      {mantra && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, fontFamily: SANS, fontSize: 12, color: C.textSec, fontStyle: "italic", direction: "rtl", textAlign: "center" }}>
          "{mantra}"
        </div>
      )}
    </Card>
  );
}

// ── Sector Rotation / Money Flow / Stocks-to-Avoid — the CEO Command
// Center spec's remaining named pieces. Built as real reuses of data
// already computed elsewhere, not new subsystems: rotationRank (already
// computed at App() top level, feeds the full RotationTab), flowBias/
// flowCallNotional/flowPutNotional (already computed for FlowTab and
// already rendered elsewhere by MarketIntelCard), and the weak end of the
// SAME real scan TopOpportunityCard already runs (via its onFullScan
// callback — a second independent fetch loop over the same universe would
// have been a duplicate-fetch regression, same class of bug already
// caught once before on this page).
function fmtFlowNotional(n) {
  const v = Number(n) || 0;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

// Exported (2026-07-19) so it can be mounted as its own sidebar tab, same
// as CEO AI was. Fixed a real mislabeling while restoring it: rotationRank
// is stock-level relative-strength/RVOL data (individual watchlist
// symbols vs SPY/sector), not sector-level rotation -- the card's own
// header called it "Sector Rotation," which would have been genuinely
// misleading now that Overview's real 11-sector-ETF "Top Sectors Today"
// card exists right next to it. Relabeled to describe what this data
// actually is; the real data itself is unchanged.
export function MarketPulseCard({ C, MONO, SANS, rotationRank, flowBias, flowCallNotional, flowPutNotional, fullScan, setActiveTab, setTerminalSymbol }) {
  const rr = rotationRank || [];
  const leaders = rr.filter(q => q.relVsSpy >= 1).slice(0, 3);
  const laggers = [...rr].sort((a, b) => a.relVsSpy - b.relVsSpy).slice(0, 3);
  const flowColor = flowBias === "CALL BIAS" ? C.green : flowBias === "PUT BIAS" ? C.red : C.textDim;

  // Same real-reasons pattern already used for ADVISOR AI's avoid list —
  // weak relative strength, few trend-template passes, extended, or a
  // Stage 3/4 stage — applied here to this dashboard's own scan universe.
  const avoidList = [...(fullScan || [])]
    .filter(r => Number.isFinite(r?._aplus?.score))
    .sort((a, b) => a._aplus.score - b._aplus.score)
    .slice(0, 3)
    .map(r => {
      const reasons = [];
      if ((r.rsRating || 0) < 50) reasons.push(`weak RS ${r.rsRating}`);
      if ((r.passCount || 0) < 4) reasons.push(`${r.passCount}/8 trend template`);
      if (r.extended) reasons.push("extended");
      if (String(r.stage || "").startsWith("Stage 4")) reasons.push("Stage 4 downtrend");
      else if (String(r.stage || "").startsWith("Stage 3")) reasons.push("Stage 3 distribution");
      return { symbol: r.symbol, score: r._aplus.score, reason: reasons[0] || "low composite score" };
    });

  const goToChart = (sym) => { setTerminalSymbol?.(sym); try { localStorage.setItem("mterminal_load_sym", sym); } catch {} setActiveTab?.("mterminal"); };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
      <Card C={C} title="🔄 MOMENTUM LEADERS" accent={C.accent}>
        {rr.length > 0 ? (
          <>
            <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginBottom: 4 }}>LEADERS</div>
            {leaders.length ? leaders.map(q => (
              <div key={q.symbol} onClick={() => goToChart(q.symbol)} {...clickableProps(() => goToChart(q.symbol))} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", cursor: "pointer" }}>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{q.symbol}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.green }}>+{q.relVsSpy.toFixed(2)}%</span>
              </div>
            )) : <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim }}>None ≥1% vs SPY today</div>}
            <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", margin: "8px 0 4px" }}>LAGGARDS</div>
            {laggers.map(q => (
              <div key={q.symbol} onClick={() => goToChart(q.symbol)} {...clickableProps(() => goToChart(q.symbol))} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", cursor: "pointer" }}>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{q.symbol}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>{q.relVsSpy.toFixed(2)}%</span>
              </div>
            ))}
            <button onClick={() => setActiveTab?.("rotation")} style={{ marginTop: 8, fontFamily: MONO, fontSize: 10, color: C.accent, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Full Rotation →</button>
          </>
        ) : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Scanning…</div>}
      </Card>

      <Card C={C} title="💰 MONEY FLOW" accent={C.accent}>
        <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: flowColor, marginBottom: 6 }}>{flowBias || "—"}</div>
        {(flowCallNotional || flowPutNotional) ? (
          <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.textDim }}>
            Calls {fmtFlowNotional(flowCallNotional)} · Puts {fmtFlowNotional(flowPutNotional)}
          </div>
        ) : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>No flow data yet.</div>}
        <button onClick={() => setActiveTab?.("flow")} style={{ marginTop: 8, fontFamily: MONO, fontSize: 10, color: C.accent, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Full Flow →</button>
      </Card>

      <Card C={C} title="🚫 STOCKS TO AVOID" accent={C.red}>
        {avoidList.length > 0 ? avoidList.map(a => (
          <div key={a.symbol} onClick={() => goToChart(a.symbol)} {...clickableProps(() => goToChart(a.symbol))} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0", borderBottom: `1px solid ${C.border}33`, cursor: "pointer" }}>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{a.symbol} <span style={{ color: C.textDim, fontWeight: 400 }}>{a.score}</span></span>
            <span style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, textAlign: "right" }}>{a.reason}</span>
          </div>
        )) : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Scanning…</div>}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// New Overview layout (user-provided reference design) — real data only,
// same discipline as the rest of this app. One real gap remains, resolved
// with the user directly rather than guessed: no real market-wide
// Confidence%/Risk Level exists (only per-stock), so AI Market Bias omits
// those. The other flagged gap — no real US 10Y yield, only IEF (a bond-
// ETF price) — is now closed (2026-07-19) via fred.js/GET /api/market/
// us10y, a free FRED CSV endpoint with no API key or paid tier involved.
// ═══════════════════════════════════════════════════════════════════════

const KPI_SYMBOLS = ["SPY", "QQQ", "IWM", "DIA", "VIXY", "GLD", "BTCUSD"];

// Real US 10Y Treasury yield — separate fetch from the macroData tape
// (which is all ETF/index quotes off this app's regular providers, none
// of which carry a real yield field). FRED updates DGS10 ~once/day, so
// polling every 30 minutes is already more than enough.
function Us10yKpi({ C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | err
  useEffect(() => {
    const load = () => {
      fetch("/api/market/us10y").then(r => r.json()).then(d => {
        if (d?.ok) { setData(d); setState("ok"); } else setState("err");
      }).catch(() => setState("err"));
    };
    load();
    const t = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  const chg = data?.changePct;
  const col = chg == null ? C.textDim : chg >= 0 ? C.green : C.red;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>10Y Treasury</div>
      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: C.text }}>
        {state === "ok" && data ? `${data.value.toFixed(2)}%` : state === "err" ? "—" : "…"}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: col }}>{chg == null ? "—" : `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`}</div>
    </div>
  );
}

function KpiStrip({ C, MONO, SANS, macroData }) {
  const rows = KPI_SYMBOLS.map(sym => (macroData || []).find(m => m.symbol === sym)).filter(Boolean);
  if (!rows.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14 }}>
      {rows.map(m => {
        const chg = Number(m.changesPercentage || 0);
        const col = chg >= 0 ? C.green : C.red;
        return (
          <div key={m.symbol} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m._label || m.symbol}</div>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: C.text }}>{Number(m.price) > 0 ? (m.symbol === "BTCUSD" ? `$${Math.round(m.price).toLocaleString()}` : m.price.toFixed(2)) : "—"}</div>
            <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: col }}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</div>
          </div>
        );
      })}
      <Us10yKpi C={C} MONO={MONO} SANS={SANS} />
    </div>
  );
}

// Watchlist Breadth — real, but scoped to the user's own watchlist, not
// the full market (disclosed in the label itself, per the user's own
// choice, rather than implying a market-wide reading that doesn't exist).
function WatchlistBreadthCard({ C, MONO, SANS, breadthPct, advCount, declCount, unchCount, total }) {
  const label = breadthPct >= 55 ? "Bullish" : breadthPct <= 45 ? "Bearish" : "Neutral";
  const col = breadthPct >= 55 ? C.green : breadthPct <= 45 ? C.red : C.amber;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 4 }}>WATCHLIST BREADTH</div>
      {total > 0 ? (
        <>
          <RadialGauge C={C} MONO={MONO} value={breadthPct} label={label} color={col} size={130} />
          <div style={{ display: "flex", justifyContent: "space-around", marginTop: 8, fontFamily: MONO, fontSize: 11 }}>
            <div style={{ textAlign: "center" }}><div style={{ color: C.green, fontWeight: 800 }}>{advCount}</div><div style={{ color: C.textDim, fontSize: 9.5 }}>Advancing</div></div>
            <div style={{ textAlign: "center" }}><div style={{ color: C.red, fontWeight: 800 }}>{declCount}</div><div style={{ color: C.textDim, fontSize: 9.5 }}>Declining</div></div>
            <div style={{ textAlign: "center" }}><div style={{ color: C.textDim, fontWeight: 800 }}>{unchCount}</div><div style={{ color: C.textDim, fontSize: 9.5 }}>Unchanged</div></div>
          </div>
        </>
      ) : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, padding: "20px 0", textAlign: "center" }}>Add symbols to your watchlist to see breadth.</div>}
    </div>
  );
}

// Top Sectors Today — real 11-sector-ETF data (sectorData), not the
// stock-level rotationRank MarketPulseCard uses. "Relative strength" here
// is a real min-max normalization of today's real sector %changes against
// each other (0-100) -- an honest relative ranking derived from real
// numbers, not an external metric this app doesn't have.
function TopSectorsTodayCard({ C, MONO, SANS, sectorData, setActiveTab, setTerminalSymbol }) {
  const rows = (sectorData || []).filter(s => s.symbol && Number.isFinite(Number(s.changesPercentage)))
    .map(s => ({ symbol: s.symbol, name: s._sectorName || s.symbol, chg: Number(s.changesPercentage) }))
    .sort((a, b) => b.chg - a.chg);
  const chgs = rows.map(r => r.chg);
  const max = Math.max(...chgs, 0), min = Math.min(...chgs, 0);
  const relStrength = (chg) => (max === min ? 50 : Math.round(((chg - min) / (max - min)) * 100));

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 10 }}>TOP SECTORS TODAY</div>
      {rows.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map(r => {
            const rs = relStrength(r.chg);
            return (
              <div key={r.symbol} onClick={() => { setTerminalSymbol?.(r.symbol); try { localStorage.setItem("mterminal_load_sym", r.symbol); } catch {} setActiveTab?.("mterminal"); }} {...clickableProps(() => { setTerminalSymbol?.(r.symbol); try { localStorage.setItem("mterminal_load_sym", r.symbol); } catch {} setActiveTab?.("mterminal"); })}
                style={{ display: "grid", gridTemplateColumns: "1fr auto 60px 70px", gap: 10, alignItems: "center", cursor: "pointer" }}>
                <span style={{ fontFamily: SANS, fontSize: 12.5, color: C.text }}>{r.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, color: r.chg >= 0 ? C.green : C.red }}>{r.chg >= 0 ? "▲" : "▼"}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: r.chg >= 0 ? C.green : C.red, textAlign: "right" }}>{r.chg >= 0 ? "+" : ""}{r.chg.toFixed(2)}%</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1, height: 5, background: C.surface, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${rs}%`, height: "100%", background: r.chg >= 0 ? C.green : C.red }} />
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, minWidth: 18, textAlign: "right" }}>{rs}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Loading sector data…</div>}
    </div>
  );
}

// Market Heatmap — same real sectorData, tiled. Strong/Neutral/Weak uses
// the same ±0.5% real-change threshold already established for sector
// bars elsewhere in this app (AdvisorAiTab.jsx's SectorBar), reused for
// consistency rather than a new arbitrary cutoff.
function MarketHeatmapGrid({ C, MONO, SANS, sectorData }) {
  const rows = (sectorData || []).filter(s => s.symbol && Number.isFinite(Number(s.changesPercentage)))
    .map(s => ({ symbol: s.symbol, name: s._sectorName || s.symbol, chg: Number(s.changesPercentage) }))
    .sort((a, b) => b.chg - a.chg);
  const tag = (chg) => chg >= 0.5 ? { label: "Strong", col: C.green } : chg <= -0.5 ? { label: "Weak", col: C.red } : { label: "Neutral", col: C.amber };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 10 }}>MARKET HEATMAP</div>
      {rows.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
          {rows.map(r => {
            const t = tag(r.chg);
            return (
              <div key={r.symbol} style={{ background: `${t.col}12`, border: `1px solid ${t.col}33`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginBottom: 4 }}>{r.name.toUpperCase()}</div>
                <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: t.col }}>{r.chg >= 0 ? "+" : ""}{r.chg.toFixed(2)}%</div>
                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: t.col }}>{t.label}</div>
              </div>
            );
          })}
        </div>
      ) : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Loading sector data…</div>}
    </div>
  );
}

// AI Top Opportunities table — reuses TopOpportunityCard's real full-scan
// data (already computed for the Top Opportunity hero card + MarketPulseCard's
// avoid list, same fetch, no new one). Ticker only, no company name — that
// would need a separate real per-symbol fetch not currently joined into
// this scan, and every other ranked list in this app already shows ticker-only.
function AiTopOpportunitiesCard({ C, MONO, SANS, fullScan, setActiveTab, setTerminalSymbol }) {
  const rows = [...(fullScan || [])].filter(r => Number.isFinite(r?._aplus?.score)).sort((a, b) => b._aplus.score - a._aplus.score).slice(0, 5);
  // screenTrendTemplate's rows (fullScan) carry no real daily %change field
  // at all (only price/passCount/RS/stage/momentum) — showing a silent
  // "0.0%" fallback would look like real data when it isn't. Instead, a
  // small bounded real quote fetch (top 5 symbols only) gets the real
  // number; a symbol with no real match shows "—", never a fabricated 0.
  const [chgMap, setChgMap] = useState({});
  const symKey = rows.map(r => r.symbol).join(",");
  useEffect(() => {
    if (!symKey) return;
    fetchSharedQuotes(symKey).then(j => {
      const m = {};
      (Array.isArray(j) ? j : []).forEach(q => { if (Number.isFinite(Number(q.changesPercentage))) m[q.symbol] = Number(q.changesPercentage); });
      setChgMap(m);
    }).catch(() => {});
  }, [symKey]);

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 10 }}>AI TOP OPPORTUNITIES</div>
      {rows.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "grid", gridTemplateColumns: "26px 1fr 60px 90px auto 70px 60px", gap: 8, fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.04em", padding: "0 0 6px" }}>
            <span>#</span><span>TICKER</span><span>SCORE</span><span>ACTION</span><span></span><span style={{ textAlign: "right" }}>PRICE</span><span style={{ textAlign: "right" }}>CHG</span>
          </div>
          {rows.map((r, i) => {
            const chg = chgMap[r.symbol];
            const hasChg = Number.isFinite(chg);
            const scoreCol = r._aplus.score >= 85 ? C.gold : r._aplus.score >= 70 ? C.green : r._aplus.score >= 55 ? C.amber : C.textDim;
            // Unified AI Actions vocabulary (institutional redesign,
            // 2026-07-29) — replaces the app's ~7 previously-fragmented
            // Buy/Sell/Watch enums with one shared reducer.
            const action = mapToAiAction({ institutionalScore: r._aplus.score });
            return (
              <div key={r.symbol} onClick={() => { setTerminalSymbol?.(r.symbol); try { localStorage.setItem("mterminal_load_sym", r.symbol); } catch {} setActiveTab?.("mterminal"); }} {...clickableProps(() => { setTerminalSymbol?.(r.symbol); try { localStorage.setItem("mterminal_load_sym", r.symbol); } catch {} setActiveTab?.("mterminal"); })}
                style={{ display: "grid", gridTemplateColumns: "26px 1fr 60px 90px auto 70px 60px", gap: 8, alignItems: "center", padding: "7px 0", borderTop: `1px solid ${C.border}55`, cursor: "pointer", fontVariantNumeric: "tabular-nums" }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>{i + 1}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>{r.symbol}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, padding: "2px 6px", borderRadius: 5, background: `${scoreCol}18`, color: scoreCol, textAlign: "center" }}>{r._aplus.score}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 5, background: `${action.color}18`, color: action.color, textAlign: "center" }}>{action.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, color: hasChg ? (chg >= 0 ? C.green : C.red) : C.textDim }}>{hasChg ? (chg >= 0 ? "↗" : "↘") : "—"}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec, textAlign: "right" }}>${r.price}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: hasChg ? (chg >= 0 ? C.green : C.red) : C.textDim, textAlign: "right" }}>{hasChg ? `${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%` : "—"}</span>
              </div>
            );
          })}
        </div>
      ) : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Scanning for setups…</div>}
    </div>
  );
}

// News Sentiment donut — real bull/bear counts (newsSentiment, already
// computed elsewhere from real classified headlines); Neutral is the real
// remainder (total real headlines minus real bull minus real bear), not a
// separately-fabricated bucket.
function NewsSentimentCard({ C, MONO, SANS, newsSentiment, setActiveTab }) {
  const bull = Number(newsSentiment?.bull || 0), bear = Number(newsSentiment?.bear || 0);
  const total = Number(newsSentiment?.total || (bull + bear)) || (bull + bear);
  const neutral = Math.max(0, total - bull - bear);
  const hasData = (bull + bear + neutral) > 0;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 8 }}>NEWS SENTIMENT</div>
      {hasData ? (
        <DonutChart C={C} MONO={MONO} size={110} segments={[
          { label: "Positive", value: bull, color: C.green },
          { label: "Neutral", value: neutral, color: C.textDim },
          { label: "Negative", value: bear, color: C.red },
        ]} />
      ) : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>No headlines scanned yet.</div>}
      <button onClick={() => setActiveTab?.("news")} style={{ marginTop: 8, fontFamily: MONO, fontSize: 10, color: C.accent, background: "none", border: "none", cursor: "pointer", padding: 0 }}>View news →</button>
    </div>
  );
}

// Volatility Index — same real VIX read the AI Market Bias/regime already
// use, just its own small card matching the mockup's layout. No mini
// chart (would need a new historical fetch — same gap as KPI sparklines).
function VolatilityIndexCard({ C, MONO, SANS, distData, setActiveTab }) {
  const vix = Number(distData?.vix || 0);
  const col = vix >= 25 ? C.red : vix <= 16 ? C.green : C.amber;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 8 }}>VOLATILITY INDEX</div>
      <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 900, color: col }}>{vix > 0 ? vix.toFixed(2) : "—"}</div>
      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 2 }}>{vix >= 25 ? "Elevated fear" : vix <= 16 ? "Calm" : "Normal range"}</div>
      <button onClick={() => setActiveTab?.("mterminal")} style={{ marginTop: 8, fontFamily: MONO, fontSize: 10, color: C.accent, background: "none", border: "none", cursor: "pointer", padding: 0 }}>View chart →</button>
    </div>
  );
}

// AI Copilot launcher — fires the same real window event every other
// "open the copilot" affordance in this app already uses, rather than
// building a second copilot instance.
function AiCopilotLauncherCard({ C, MONO, SANS }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 8 }}>AI COPILOT</div>
      <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, marginBottom: 10 }}>Ask anything about the market…</div>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("open-ai-copilot", { detail: {} }))}
        style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, padding: "9px 14px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", cursor: "pointer", width: "100%" }}>
        ✳ Ask Copilot
      </button>
    </div>
  );
}

// ── Dashboard sub-tabs — the page used to render everything (15 cards +
// 6 collapsible sections) on one continuous scroll. Split into focused
// sub-tabs per user feedback ("too much information") — every existing
// card/section moved as-is into one of these, nothing removed or rebuilt,
// same "hide, don't delete" precedent already used for MORE DETAIL below.
const DASH_TABS = [
  { id: "opportunities", label: "OPPORTUNITIES" },
  { id: "overview",    label: "OVERVIEW" },
  { id: "watchlist",   label: "WATCHLIST & CHART" },
  { id: "sniper",       label: "AI SNIPER" },
  { id: "greenlight",   label: "GREEN LIGHT" },
  { id: "flow",         label: "OPTIONS FLOW" },
  { id: "news",        label: "NEWS & EVENTS" },
  { id: "fedwatch",    label: "FED / FOMC" },
  { id: "portfolio",   label: "PORTFOLIO" },
];

function DashSubNav({ C, MONO, active, setActive }) {
  // Horizontal-scroll single row, not flexWrap — standardized across every
  // tab's internal sub-nav in the 2026-07-22 site reorg after flexWrap was
  // confirmed to wrap into the fixed FAB cluster's screen position on
  // mobile in XIntelTab.jsx (obscured a button entirely). This is the
  // Dashboard, the highest-traffic screen, so it gets the same fix even
  // though live testing found this specific 4-tab row currently wraps
  // clear of the FAB zone — consistency removes the risk permanently.
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", overflowX: "auto", scrollbarWidth: "none", marginBottom: 14 }}>
      {DASH_TABS.map(t => (
        <button key={t.id} onClick={() => setActive(t.id)}
          style={{
            fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: "0.04em",
            padding: "7px 13px", borderRadius: 7, cursor: "pointer",
            whiteSpace: "nowrap", flexShrink: 0, minHeight: 40,
            border: `1px solid ${active === t.id ? C.accent : C.border}`,
            background: active === t.id ? `${C.accent}18` : C.card,
            color: active === t.id ? C.accent : C.textSec,
          }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export default function DashboardTab({
  C, MONO, SANS, watchlistData, macroData, distData, fearGreedData, sigData, sigFilter,
  newsSentiment, socialSentiment, flowBias, flowCallNotional, flowPutNotional, rotationRank, sectorData, eventCountdowns, preMktMovers, combinedAlerts,
  tiltEnabled, tiltLocked, tiltStreak, topPick, fullScan,
  setTerminalSymbol, setScanResults, setActiveTab, setScanExpanded, loadDeepDive, loadDeepSocial,
  setTiltLocked, setSigLoading, setSigData, fetchFearGreed, setDistData, setFuturesData, setPreMktMovers,
  // Green Light / Best Opportunities / Options Flow / News — threaded
  // through so those tools can get real dedicated Dashboard sub-tabs
  // (2026-07-28, "no distraction... easy to use" declutter: fold Sniper,
  // Green Light, Best Opportunities, Options Flow, News into Dashboard so
  // they can come off the main Sidebar without losing functionality).
  openDeepDiveFor, scanResults,
  optionsFlow, flowFilters, setFlowFilters, setLoading, fetchAll, apiKey, flowBySymbol, flowRows,
  watchlistSymbols, setWatchlistSymbols,
  newsSymFilter, setNewsSymFilter, newsSentFilter, setNewsSentFilter,
  refreshNews, newsLoading, newsData, scoreNewsSentiment, newsSentLoading, newsSentiments, setQuickLogModal,
}) {
  // topPick/fullScan are now lifted to axiom-live.jsx (2026-07-19) so the
  // real scan they come from keeps running regardless of which top-level
  // tab is active -- the new "Portfolio"/"Market Pulse" sidebar tabs need
  // the same real data this Overview tab does, and it previously only
  // existed while Overview itself was mounted (its hidden TopOpportunityCard
  // would unmount, and the data would go stale, the moment you left
  // Dashboard entirely).
  const aplusSymbol = topPick?.symbol || null;
  // AI Sniper made the default/first sub-tab (2026-07-28, explicit user
  // request: "default in ai sniper") -- was Opportunities (2026-07-19,
  // "need opportunities right away... not late"), before that Overview.
  const [dashTab, setDashTab] = useState(() => {
    // "more" was removed (2026-07-19, split into existing tabs); "best-
    // opportunities" was retired (2026-07-29, folded into Sniper Scanner
    // as a category) — stale localStorage from before either change must
    // not resolve to a dead/blank sub-tab.
    // Default landing tab changed from "sniper" to "opportunities" (audit
    // fix, 2026-08-04): DASH_TABS (below) has always listed OPPORTUNITIES
    // first, but a fresh session actually landed on AI SNIPER (3rd tab) —
    // a real nav-vs-default mismatch. Opportunities (AI Morning Brief +
    // Opportunity Queue + Copilot Insights) is also the more fitting first
    // screen for "what should I trade right now" than a raw scanner table.
    try {
      const saved = localStorage.getItem("dash_subtab");
      if (saved === "best-opportunities") return "sniper";
      return (saved && saved !== "more") ? saved : "opportunities";
    } catch { return "opportunities"; }
  });
  const setDashTabPersist = (id) => {
    setDashTab(id);
    try { localStorage.setItem("dash_subtab", id); } catch {}
  };

  // Real SPY trend-template data for the next-day-bias "50D MA" factor below
  // — watchlistData/macroData are fed by /api/market/quote, a fast
  // price-only path that never populates priceAvg50 for any Alpaca-covered
  // symbol (confirmed live this session, same root cause already fixed in
  // PredictionsTab, Green Light, Early Entry Scanner, and the Autopilot
  // trend-exit). Because the MA50 factor below was already gated behind
  // `ma50 > 0`, this never produced a false "below 50D MA" reading — it
  // just permanently zeroed out a real ±15-point factor on the dashboard's
  // main regime score. One lightweight single-symbol fetch, not the whole
  // watchlist.
  const [spyTrend, setSpyTrend] = useState(null);
  useEffect(() => {
    fetch("/api/market/trend-screen?symbols=SPY")
      .then(r => r.json())
      .then(j => { const row = (j.results || [])[0]; if (row && !row.error) setSpyTrend(row); })
      .catch(() => {});
  }, []);

  // Same next-day-bias factor scoring used by the (now collapsed, kept for
  // detail) Next Day Outlook card — computed once, shared by the new AI
  // Market Summary card above.
  const spy = (macroData || []).find(m => m.symbol === "SPY") || (watchlistData || []).find(w => w.symbol === "SPY");
  const qqq = (macroData || []).find(m => m.symbol === "QQQ") || (watchlistData || []).find(w => w.symbol === "QQQ");
  const spyChg = Number(spy?.changesPercentage || 0);
  const qqqChg = Number(qqq?.changesPercentage || 0);
  const spyStage = String(spyTrend?.stage || "");
  const vix = Number(distData?.vix || 0);
  const fg = Number(fearGreedData?.score || 0);
  const wlForBreadth = (watchlistData || []).filter(q => q.symbol && Number(q.price) > 0);
  const advForBreadth = wlForBreadth.filter(q => Number(q.changesPercentage || 0) > 0).length;
  const unchForBreadth = wlForBreadth.filter(q => Number(q.changesPercentage || 0) === 0).length;
  const declForBreadth = wlForBreadth.length - advForBreadth - unchForBreadth;
  const breadthPct = wlForBreadth.length ? Math.round(advForBreadth / wlForBreadth.length * 100) : 50;
  let score = 0;
  const factors = [];
  if (spyChg > 0.5) { score += 20; factors.push("✅ SPY closed green"); }
  else if (spyChg < -1) { score -= 25; factors.push("🔴 SPY closed down hard"); }
  else if (spyChg < 0) { score -= 10; factors.push("⚠️ SPY closed red"); }
  if (spyStage.startsWith("Stage 2")) { score += 15; factors.push("✅ SPY above 50D MA (real trend template)"); }
  else if (spyStage.startsWith("Stage 3") || spyStage.startsWith("Stage 4")) { score -= 15; factors.push("🔴 SPY below 50D MA (real trend template)"); }
  if (vix > 25) { score -= 20; factors.push(`🔴 VIX high (${vix.toFixed(0)}) — fear elevated`); }
  else if (vix > 0 && vix < 16) { score += 12; factors.push(`✅ VIX low (${vix.toFixed(0)}) — calm`); }
  if (breadthPct >= 60) { score += 15; factors.push(`✅ Strong breadth (${breadthPct}% up)`); }
  else if (breadthPct <= 35) { score -= 15; factors.push(`🔴 Weak breadth (${breadthPct}% up)`); }
  if (fg <= 25) { score += 10; factors.push("✅ Extreme fear — bounce odds rise"); }
  else if (fg >= 75) { score -= 10; factors.push("⚠️ Extreme greed — pullback risk"); }
  if (qqqChg > 0.5 && spyChg > 0) { score += 8; factors.push("✅ Tech leading"); }
  if (newsSentiment && (newsSentiment.bull + newsSentiment.bear) >= 3) {
    const np = newsSentiment.netPct;
    if (np >= 25) { score += 18; factors.push(`📰 News BULLISH (+${np}% net)`); }
    else if (np >= 8) { score += 10; factors.push(`📰 News lean bullish (+${np}%)`); }
    else if (np <= -25) { score -= 18; factors.push(`📰 News BEARISH (${np}% net)`); }
    else if (np <= -8) { score -= 10; factors.push(`📰 News lean bearish (${np}%)`); }
  }
  const bias = score >= 25 ? "BULLISH" : score >= 5 ? "LEAN BULLISH" : score <= -25 ? "BEARISH" : score <= -5 ? "LEAN BEARISH" : "NEUTRAL";
  const biasCol = score >= 25 ? C.green : score >= 5 ? C.greenLight : score <= -25 ? C.red : score <= -5 ? C.redLight : C.amber;
  const { regLabel: overviewRegLabel, regColor: overviewRegColor } = computeRegimeLabel(C, { spy, qqq, vix, loaded: !!spy });
  const overviewRegime = computeRegime(macroData);
  const conf = Number(topPick?.confidence);
  const confColor = conf >= 70 ? C.green : conf >= 40 ? C.amber : C.red;

  return (
    <>
      <DashSubNav C={C} MONO={MONO} active={dashTab} setActive={setDashTabPersist} />

      {/* ── OVERVIEW — the executive command center. Priority order top to  */}
      {/* bottom: CEO's synthesized call, then the 4 numbers that answer    */}
      {/* "what's the state of play" at a glance, then the single highest-  */}
      {/* conviction idea, then supporting detail. Everything here is real  */}
      {/* data already computed elsewhere in the app — restyled/reordered,  */}
      {/* nothing fabricated to fill a gauge. */}
      {dashTab === "overview" && (
        <>
          {/* Institutional redesign (2026-07-29, explicit user spec): a
              Market Command Center strip always up top, then exactly 4
              primary cards (Market Health / Sector Rotation / AI Best
              Opportunities / Portfolio Risk). Replaces the prior 3-row,
              10-card Overview layout — real data throughout, same sources,
              consolidated rather than fabricated. The strip itself already
              covers what AiMarketBiasCard/WatchlistBreadthCard/
              TopSectorsTodayCard/UpcomingEventsCard/VolatilityIndexCard
              used to show separately (market trend, breadth, strongest/
              weakest sector, next event, VIX) — those cards stay real,
              defined, and reusable, just not duplicated here anymore
              ("remove duplicates, merge overlapping metrics" per the
              redesign spec). NewsSentimentCard and AiCopilotLauncherCard
              don't overlap with the strip, so they stay as supporting
              detail below the 4-card grid. */}
          <KpiStrip C={C} MONO={MONO} SANS={SANS} macroData={macroData} />
          <MarketCommandCenterStrip C={C} MONO={MONO} SANS={SANS}
            macroData={macroData} distData={distData} sectorData={sectorData} eventCountdowns={eventCountdowns}
            regime={overviewRegime} regLabel={overviewRegLabel} regColor={overviewRegColor} breadthPct={breadthPct}
            setActiveTab={setActiveTab} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: 14, alignItems: "stretch" }}>
            <MarketRegimeCard C={C} MONO={MONO} SANS={SANS} macroData={macroData} distData={distData} factors={factors} bias={bias} biasColor={biasCol} fullScan={fullScan} />
            <MarketHeatmapGrid C={C} MONO={MONO} SANS={SANS} sectorData={sectorData} />
            <AiTopOpportunitiesCard C={C} MONO={MONO} SANS={SANS} fullScan={fullScan} setActiveTab={setActiveTab} setTerminalSymbol={setTerminalSymbol} />
            {/* distData added 2026-08-04 (audit finding) — was silently
                missing here (present on every other real mount of this
                card). PortfolioRiskCard's Composite Score uses
                distData?.riskScore as one of 5 real dimensions
                (risk-composite.js), so without it this copy was quietly
                capping its own "X/5 dimensions" count even when real
                market risk data existed. */}
            <PortfolioRiskCard C={C} MONO={MONO} SANS={SANS} distData={distData} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 14 }}>
            <NewsSentimentCard C={C} MONO={MONO} SANS={SANS} newsSentiment={newsSentiment} setActiveTab={setActiveTab} />
            <AiCopilotLauncherCard C={C} MONO={MONO} SANS={SANS} />
          </div>
          {/* Moved from HOME (formerly the OPPORTUNITIES tab's default
              content) when Home was rebuilt into a fixed 6-block command
              center — real components, unchanged, just relocated so Home
              stays to one question instead of accumulating a 7th block. */}
          <div style={{ marginBottom: 10 }}>
            <AiMorningBriefCard C={C} MONO={MONO} SANS={SANS} />
          </div>
          <div style={{ marginBottom: 10, maxWidth: 500 }}>
            <OpportunityQueueCard C={C} MONO={MONO} SANS={SANS} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab} />
          </div>
          <CopilotInsightsCard C={C} MONO={MONO} SANS={SANS} watchlistData={watchlistData} setActiveTab={setActiveTab} setTerminalSymbol={setTerminalSymbol} topPick={topPick} />
        </>
      )}

      {/* ── WATCHLIST & CHART ── */}
      {/* Chart extended to the left (wider, more room), Watchlist moved
          under Macro & Flow in a stacked right column — per explicit
          request. */}
      {dashTab === "watchlist" && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          <DashboardChartCard C={C} MONO={MONO} SANS={SANS} symbol={aplusSymbol || "SPY"} />
          <div style={{ flex: "1 1 320px", minWidth: 280, maxWidth: 380, display: "flex", flexDirection: "column", gap: 10 }}>
            <MarketIntelCard C={C} MONO={MONO} SANS={SANS} flowBias={flowBias} flowCallNotional={flowCallNotional} flowPutNotional={flowPutNotional} setActiveTab={setActiveTab} />
            <WatchlistCard C={C} MONO={MONO} SANS={SANS} watchlistData={watchlistData} sigData={sigData} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab} />
          </div>
        </div>
      )}

      {/* ── HOME — the AI Command Center. One question: "what deserves my  */}
      {/* attention today?" Six real, already-wired blocks in priority     */}
      {/* order, nothing else: Market Status, Today's Opportunities,       */}
      {/* Portfolio / Alerts / Upcoming Events, Open Positions. The three  */}
      {/* cards that used to live here (AI Morning Brief, Opportunity      */}
      {/* Queue, Copilot Insights) weren't deleted — they moved one click  */}
      {/* over into OVERVIEW as supporting detail, same "hide, don't       */}
      {/* delete" precedent this file already uses everywhere else; a      */}
      {/* seventh block here would mean Home stopped answering one         */}
      {/* question and this list needs re-trimming, not growing. */}
      {dashTab === "opportunities" && (
        <>
          <div style={{ marginBottom: 12 }}>
            <MarketCommandCenterStrip C={C} MONO={MONO} SANS={SANS}
              macroData={macroData} distData={distData} sectorData={sectorData} eventCountdowns={eventCountdowns}
              regime={overviewRegime} regLabel={overviewRegLabel} regColor={overviewRegColor} breadthPct={breadthPct}
              setActiveTab={setActiveTab} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <AiTopOpportunitiesCard C={C} MONO={MONO} SANS={SANS} fullScan={fullScan} setActiveTab={setActiveTab} setTerminalSymbol={setTerminalSymbol} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 12, alignItems: "start" }}>
            <PortfolioSnapshotCard C={C} MONO={MONO} SANS={SANS} />
            <PriorityAlertsCard C={C} MONO={MONO} SANS={SANS} alerts={combinedAlerts} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab} />
            <UpcomingEventsCard C={C} MONO={MONO} SANS={SANS} eventCountdowns={eventCountdowns} />
          </div>
          <ActivePositionsCard C={C} MONO={MONO} SANS={SANS} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab} watchlistData={watchlistData} macroData={macroData} />
        </>
      )}

      {/* ── AI SNIPER ── originally the real Sniper Scanner (RhProScanner),
          moved off the main Sidebar into its own Dashboard sub-tab
          (2026-07-28). That component is now what the Sidebar's real
          "Discover" tab shows (2026-08-20 merge into ScanTerminalHub) —
          a different, broader 9-tier vocabulary, not Sniper's real
          hard-gated verdict. Repointed (2026-08-24, "organize Discover/
          Sniper AI" follow-up) at the real, separate Sniper AI tab
          shipped this session, so this sub-tab's own "AI SNIPER" label
          finally matches what it shows again. */}
      {dashTab === "sniper" && (
        <SniperAITab C={C} MONO={MONO} SANS={SANS} setActiveTab={setActiveTab} />
      )}

      {/* ── GREEN LIGHT ── real GreenLightTab, same component/props the
          Sidebar used, moved into Dashboard (2026-07-28). MyTradesTab added
          2026-08-04 (audit fix) — the Sidebar's real "greenlight"/"mytrades"
          route always renders GreenLightTab + MyTradesTab together as one
          logical unit (account/positions/autopilot controls); this copy was
          silently missing that second half. */}
      {dashTab === "greenlight" && (
        <>
          <GreenLightTab C={C} MONO={MONO} SANS={SANS} watchlistData={watchlistData} macroData={macroData} openDeepDiveFor={openDeepDiveFor} scanResults={scanResults} sectorData={sectorData} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab} />
          <MyTradesTab C={C} MONO={MONO} SANS={SANS} watchlistData={watchlistData} />
        </>
      )}

      {/* Best Opportunities as its own sub-tab retired (2026-07-29,
          product/UX redesign audit item #5) — folded into Sniper Scanner's
          "🎯 Best Opportunities" category, same real component/scan. */}

      {/* ── OPTIONS FLOW ── real FlowTab, moved into Dashboard (2026-07-28). */}
      {dashTab === "flow" && (
        <FlowTab
          C={C} MONO={MONO} optionsFlow={optionsFlow} flowBias={flowBias}
          flowCallNotional={flowCallNotional} flowPutNotional={flowPutNotional}
          flowFilters={flowFilters} setFlowFilters={setFlowFilters} setLoading={setLoading}
          fetchAll={fetchAll} apiKey={apiKey}
          flowBySymbol={flowBySymbol} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab}
          setWatchlistSymbols={setWatchlistSymbols} watchlistSymbols={watchlistSymbols} flowRows={flowRows}
        />
      )}

      {/* ── PORTFOLIO ── real PortfolioSnapshotCard + ActivePositionsCard +
          PortfolioRiskCard, moved into Dashboard (2026-07-28, "move
          portfolio to dashboard"). Real bug fixed 2026-08-04 (audit
          finding): this copy was silently missing two props the Sidebar's
          separate mount of the same cards (axiom-live.jsx) always passed —
          ActivePositionsCard had no watchlistData/macroData (killed its
          real "WEAKEST position" badge, whose scoredOpen array can't
          populate without watchlistData) — and PortfolioRiskCard wasn't
          mounted here at all. Both fixed to match the correct mount
          exactly, so this is now a real duplicate, not a broken one. */}
      {dashTab === "portfolio" && (
        <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <PortfolioSnapshotCard C={C} MONO={MONO} SANS={SANS} />
          <ActivePositionsCard C={C} MONO={MONO} SANS={SANS} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab} watchlistData={watchlistData} macroData={macroData} />
          <PortfolioRiskCard C={C} MONO={MONO} SANS={SANS} distData={distData} />
        </div>
      )}

      {/* ── NEWS & EVENTS ── real NewsTab (same News Desk the Sidebar used —
          not RegimeNewsPanel's lighter summary anymore), plus the real
          catalysts/pre-market-movers panels that were already here. */}
      {dashTab === "news" && (
        <>
          <div style={{ marginBottom: 14 }}>
            <NewsTab
              C={C} MONO={MONO} newsSymFilter={newsSymFilter} setNewsSymFilter={setNewsSymFilter}
              newsSentFilter={newsSentFilter} setNewsSentFilter={setNewsSentFilter}
              refreshNews={refreshNews} newsLoading={newsLoading} newsData={newsData}
              scoreNewsSentiment={scoreNewsSentiment} newsSentLoading={newsSentLoading}
              watchlistSymbols={watchlistSymbols} newsSentiments={newsSentiments}
              setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab}
              setQuickLogModal={setQuickLogModal} setWatchlistSymbols={setWatchlistSymbols}
            />
          </div>
          <MonitorSection C={C} MONO={MONO} label="CATALYSTS & EVENTS" storeKey="mon_catalysts" defaultOpen={true}>
            <FedInterpreter C={C} MONO={MONO} SANS={SANS} />
            <FedWatchWidget C={C} MONO={MONO} SANS={SANS} />
            <MacroEventsWidget C={C} MONO={MONO} SANS={SANS} />
          </MonitorSection>
          {preMktMovers.length > 0 && (
            <MonitorSection C={C} MONO={MONO} label="PRE-MARKET MOVERS" storeKey="mon_premkt" defaultOpen={true}>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                {preMktMovers.slice(0, 8).map(m => (
                  <div key={m.sym} style={{ textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.accent }}>{m.sym}</div>
                    <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: m.chg >= 0 ? C.green : C.red }}>{m.chg >= 0 ? "+" : ""}{m.chg.toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            </MonitorSection>
          )}
        </>
      )}

      {/* ── FED / FOMC WATCH ── dedicated always-available Fed tab
          (2026-07-29, "create tab under dashboard" -> "Fed / FOMC watch").
          Real implied rate/lean, real 10Y/2Y yields + spread, the real
          published 2026 meeting calendar, and the statement interpreter —
          the same pieces already real and wired elsewhere in this app
          (FedWatchWidget/FedInterpreter, previously buried inside the News
          & Events sub-tab's collapsed Catalysts section), just given their
          own destination instead of requiring a meeting-day search. */}
      {dashTab === "fedwatch" && (
        <FedWatchTab C={C} MONO={MONO} SANS={SANS} />
      )}

    </>
  );
}
