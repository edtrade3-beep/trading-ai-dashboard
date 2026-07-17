import { useState, useEffect } from "react";
import MonitorSection from "./MonitorSection.jsx";
import MonitorAthan from "./MonitorAthan.jsx";
import RiskTrafficLight from "./RiskTrafficLight.jsx";
import SpyVolumeWidget from "./SpyVolumeWidget.jsx";
import FedInterpreter from "./FedInterpreter.jsx";
import FedWatchWidget from "./FedWatchWidget.jsx";
import MacroEventsWidget from "./MacroEventsWidget.jsx";
import RegimeNewsPanel from "./RegimeNewsPanel.jsx";
import TopOpportunityCard from "./TopOpportunityCard.jsx";
import PriorityAlertsCard from "./PriorityAlertsCard.jsx";
import RadialGauge from "./RadialGauge.jsx";
import DonutChart from "./DonutChart.jsx";
import Sparkline from "./Sparkline.jsx";
import TrendChart from "./TrendChart.jsx";
import { BestOpportunities } from "./terminal-panels.jsx";
import { computeRegime } from "./market-helpers.js";
import { COACH_LESSONS } from "./CoachTab.jsx";
import AiMorningBriefCard from "./AiMorningBriefCard.jsx";
import PortfolioRiskCard from "./PortfolioRiskCard.jsx";
import OpportunityQueueCard from "./OpportunityQueueCard.jsx";
import AskAiBar from "./AskAiBar.jsx";
import MarketIntelCard from "./MarketIntelCard.jsx";
import TradingLessonCard from "./TradingLessonCard.jsx";
import CeoAiCard from "./CeoAiCard.jsx";
import ActivePositionsCard from "./ActivePositionsCard.jsx";
import CapitalAllocationCard from "./CapitalAllocationCard.jsx";
import MissionStatusCard from "./MissionStatusCard.jsx";

// ── Shared card shell — every Dashboard card except CeoAiCard (which stays
// its own deliberately-elevated hero treatment) renders through this, so
// the whole page shares one consistent elevation instead of each card
// hand-rolling (or omitting) its own shadow. `accent` draws a 2px colored
// top border — a cheap, consistent way to color-code card categories.
function Card({ C, title, children, style, accent }) {
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
function computeRegimeLabel(C, { spy, qqq, vix, loaded }) {
  const spyChg = Number(spy?.changesPercentage || 0);
  const qqqChg = Number(qqq?.changesPercentage || 0);
  if (!loaded) return { regLabel: "LOADING…", regColor: C.textDim, playbook: "Waiting for market data…" };
  if (vix > 30 || spyChg < -1.5) return { regLabel: "RISK OFF", regColor: C.red, playbook: "Reduce size, cash or shorts only." };
  if (vix < 16 && spyChg > 0.3 && qqqChg > 0.3) return { regLabel: "RISK ON", regColor: C.green, playbook: "Full size on A+ setups, let winners run." };
  if (Math.abs(spyChg) < 0.3 && vix < 22) return { regLabel: "CHOP", regColor: C.amber, playbook: "Reduce size, take profits faster." };
  if (spyChg > 0.5) return { regLabel: "CAUTIOUS BULL", regColor: C.greenLight, playbook: "Normal size on confirmed setups." };
  return { regLabel: "DEFENSIVE", regColor: C.amber, playbook: "Smaller size, favor defensive sectors." };
}

// ── Market Regime — merged with the former separate "AI Market Summary"
// card. Both read computeRegime()'s gauge score (a VIX/SPY/QQQ formula)
// and a rule-based factor-scoring bias (SPY/MA50/VIX/breadth/fear-greed/
// news) — two different formulas that CAN legitimately disagree, which is
// exactly what CEO AI exists to reconcile. They used to render as two
// separate bordered boxes answering the same underlying question; now
// they're one card, gauge + top 3 (not 5) factors, so the duplication is
// visual, not informational — nothing here was cut.
function MarketRegimeCard({ C, MONO, SANS, macroData, distData, factors, bias, biasColor }) {
  const spy = (macroData || []).find(m => m.symbol === "SPY");
  const qqq = (macroData || []).find(m => m.symbol === "QQQ");
  const vix = distData?.vix || 0;
  const loaded = !!spy;
  const regime = computeRegime(macroData);
  const { regLabel, regColor, playbook } = computeRegimeLabel(C, { spy, qqq, vix, loaded });
  return (
    <Card C={C} title="MARKET HEALTH">
      <RadialGauge C={C} MONO={MONO} value={regime.score} label={regLabel} sublabel="regime score" color={regColor} />
      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 8, marginBottom: 10, textAlign: "center" }}>{playbook}</div>
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: biasColor, marginBottom: 4 }}>{bias}</div>
        {(factors || []).slice(0, 3).map((f, i) => (
          <div key={i} style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, padding: "2px 0", lineHeight: 1.4 }}>{f}</div>
        ))}
      </div>
    </Card>
  );
}

// ── Row 1: Portfolio Snapshot — self-contained, mirrors MyTradesTab's ──
// AlpacaPanel fetch (account + positions), condensed, + an equity sparkline
// from /api/alpaca/history.
function PortfolioSnapshotCard({ C, MONO, SANS }) {
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
  if (state === "nokey") return null;
  if (state === "loading") return <Card C={C} title="PORTFOLIO SNAPSHOT"><div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>Connecting…</div></Card>;
  if (state === "error" || !acct) return <Card C={C} title="PORTFOLIO SNAPSHOT"><div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>Couldn't load account.</div></Card>;
  const dayChg = (Number(acct.equity) || 0) - (Number(acct.lastEquity) || Number(acct.equity) || 0);
  const fmt = v => `$${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return (
    <Card C={C} title="PORTFOLIO SNAPSHOT">
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>TODAY'S P&L</div>
      <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 900, color: dayChg >= 0 ? C.green : C.red, marginBottom: 6 }}>
        {dayChg >= 0 ? "+" : ""}{fmt(Math.abs(dayChg)).replace("$", dayChg < 0 ? "-$" : "$")}
      </div>
      {equityHist.length >= 2 && <div style={{ marginBottom: 8 }}><Sparkline C={C} data={equityHist} /></div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontFamily: MONO, fontSize: 11 }}>
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
function WatchlistCard({ C, MONO, SANS, watchlistData, sigData, setTerminalSymbol, setActiveTab }) {
  const rows = (watchlistData || []).slice(0, 8);
  const sigOf = sym => (sigData?.signals || []).find(s => s.sym === sym);
  return (
    <Card C={C} title="WATCHLIST" style={{ flex: "1 1 260px", maxWidth: 300 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, overflowY: "auto" }}>
        {rows.map(q => {
          const chg = Number(q.changesPercentage || 0);
          const sig = sigOf(q.symbol);
          return (
            <div key={q.symbol} onClick={() => { setTerminalSymbol(q.symbol); setActiveTab("mterminal"); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 4px", borderRadius: 6, cursor: "pointer" }}>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, minWidth: 55 }}>{q.symbol}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>${Number(q.price || 0).toFixed(2)}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: chg >= 0 ? C.green : C.red, minWidth: 50, textAlign: "right" }}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</span>
              {sig && <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: sig.action === "LONG" ? C.green : sig.action === "SHORT / AVOID" ? C.red : C.amber, marginLeft: 8 }}>{sig.action}</span>}
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
function DashboardChartCard({ C, MONO, SANS, symbol }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/market/trend-template?symbol=" + encodeURIComponent(symbol))
      .then(r => r.json()).then(d => { if (alive && d && !d.error) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, [symbol]);
  return (
    <Card C={C} title={`CHART — ${symbol}`} style={{ flex: 3, minWidth: 340 }}>
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
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: C.goldBg, border: `1px solid ${C.gold}55`, borderRadius: 8, marginBottom: 10, cursor: "pointer" }}>
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

// ── Dashboard sub-tabs — the page used to render everything (15 cards +
// 6 collapsible sections) on one continuous scroll. Split into focused
// sub-tabs per user feedback ("too much information") — every existing
// card/section moved as-is into one of these, nothing removed or rebuilt,
// same "hide, don't delete" precedent already used for MORE DETAIL below.
const DASH_TABS = [
  { id: "overview",    label: "OVERVIEW" },
  { id: "watchlist",   label: "WATCHLIST & CHART" },
  { id: "opportunities", label: "OPPORTUNITIES" },
  { id: "news",        label: "NEWS & EVENTS" },
  { id: "more",        label: "MORE" },
];

function DashSubNav({ C, MONO, active, setActive }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
      {DASH_TABS.map(t => (
        <button key={t.id} onClick={() => setActive(t.id)}
          style={{
            fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: "0.04em",
            padding: "7px 13px", borderRadius: 7, cursor: "pointer",
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
  newsSentiment, socialSentiment, flowBias, flowCallNotional, flowPutNotional, eventCountdowns, preMktMovers, combinedAlerts,
  tiltEnabled, tiltLocked, tiltStreak,
  setTerminalSymbol, setScanResults, setActiveTab, setScanExpanded, loadDeepDive, loadDeepSocial,
  setTiltLocked, setSigLoading, setSigData, fetchFearGreed, setDistData, setFuturesData, setPreMktMovers,
}) {
  const [topPick, setTopPick] = useState(null); // full trend-screen row incl. confidence/riskState — not just the symbol
  const onScore = (row) => { setTopPick(row || null); };
  const aplusSymbol = topPick?.symbol || null;
  const [dashTab, setDashTab] = useState(() => {
    try { return localStorage.getItem("dash_subtab") || "overview"; } catch { return "overview"; }
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
  const { regLabel: overviewRegLabel } = computeRegimeLabel(C, { spy, qqq, vix, loaded: !!spy });
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
          <div style={{ marginBottom: 14 }}>
            <CeoAiCard C={C} MONO={MONO} SANS={SANS} />
          </div>

          {/* Executive status row — Market Health owns the one regime gauge */}
          {/* (moved here from "supporting analysis", not duplicated) alongside */}
          {/* Capital Allocation / AI Confidence / Mission Status. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 14, alignItems: "stretch" }}>
            <MarketRegimeCard C={C} MONO={MONO} SANS={SANS} macroData={macroData} distData={distData} factors={factors} bias={bias} biasColor={biasCol} />
            <Card C={C} title="CAPITAL ALLOCATION">
              <CapitalAllocationCard C={C} MONO={MONO} SANS={SANS} />
            </Card>
            <Card C={C} title="AI CONFIDENCE" accent={C.purple}>
              {topPick && Number.isFinite(conf) ? (
                <RadialGauge C={C} MONO={MONO} value={conf} label={topPick.symbol} sublabel="top pick confidence" color={confColor} />
              ) : (
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, textAlign: "center", padding: 20 }}>Scanning for a top pick…</div>
              )}
            </Card>
            <Card C={C} title="MISSION STATUS">
              <MissionStatusCard C={C} MONO={MONO} SANS={SANS} regimeLabel={overviewRegLabel} tiltEnabled={tiltEnabled} tiltLocked={tiltLocked} tiltStreak={tiltStreak} />
            </Card>
          </div>

          {/* Highest-conviction opportunity — the single idea, not a list */}
          <div style={{ marginBottom: 14 }}>
            <TopOpportunityCard C={C} MONO={MONO} SANS={SANS} macroData={macroData} setActiveTab={setActiveTab} setTerminalSymbol={setTerminalSymbol} onScore={onScore} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <AskAiBar C={C} MONO={MONO} SANS={SANS} />
          </div>

          {/* Supporting analysis */}
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 320px", minWidth: 300, display: "flex", flexDirection: "column", gap: 10 }}>
              <PortfolioSnapshotCard C={C} MONO={MONO} SANS={SANS} />
              <ActivePositionsCard C={C} MONO={MONO} SANS={SANS} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab} />
            </div>
            <div style={{ flex: "1 1 280px", minWidth: 260, maxWidth: 380 }}>
              <UpcomingEventsCard C={C} MONO={MONO} SANS={SANS} eventCountdowns={eventCountdowns} />
            </div>
          </div>
        </>
      )}

      {/* ── WATCHLIST & CHART ── */}
      {dashTab === "watchlist" && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          <WatchlistCard C={C} MONO={MONO} SANS={SANS} watchlistData={watchlistData} sigData={sigData} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab} />
          <DashboardChartCard C={C} MONO={MONO} SANS={SANS} symbol={aplusSymbol || "SPY"} />
          <div style={{ flex: "1 1 300px", minWidth: 280, maxWidth: 380 }}>
            <MarketIntelCard C={C} MONO={MONO} SANS={SANS} flowBias={flowBias} flowCallNotional={flowCallNotional} flowPutNotional={flowPutNotional} setActiveTab={setActiveTab} />
          </div>
        </div>
      )}

      {/* ── OPPORTUNITIES — the AI's morning brief plus the two ranked- ── */}
      {/* signal engines, kept side by side rather than merged (different  */}
      {/* universes/scoring). */}
      {dashTab === "opportunities" && (
        <>
          <div style={{ marginBottom: 10 }}>
            <AiMorningBriefCard C={C} MONO={MONO} SANS={SANS} />
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap", alignItems: "stretch" }}>
            <div style={{ flex: 1, minWidth: 300 }}>
              <OpportunityQueueCard C={C} MONO={MONO} SANS={SANS} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab} />
            </div>
            <div style={{ flex: 2, minWidth: 320 }}>
              <BestOpportunities C={C} MONO={MONO} SANS={SANS} macroData={macroData} setActiveTab={setActiveTab} />
            </div>
          </div>
          <CopilotInsightsCard C={C} MONO={MONO} SANS={SANS} watchlistData={watchlistData} setActiveTab={setActiveTab} setTerminalSymbol={setTerminalSymbol} topPick={topPick} />
        </>
      )}

      {/* ── NEWS & EVENTS ── */}
      {dashTab === "news" && (
        <>
          <div style={{ marginBottom: 14 }}>
            <Card C={C} title="MARKET NEWS">
              <RegimeNewsPanel C={C} MONO={MONO} SANS={SANS} />
            </Card>
          </div>
          <MonitorSection C={C} MONO={MONO} label="🏛 CATALYSTS & EVENTS" storeKey="mon_catalysts" defaultOpen={true}>
            <FedInterpreter C={C} MONO={MONO} SANS={SANS} />
            <FedWatchWidget C={C} MONO={MONO} SANS={SANS} />
            <MacroEventsWidget C={C} MONO={MONO} SANS={SANS} />
          </MonitorSection>
          {preMktMovers.length > 0 && (
            <MonitorSection C={C} MONO={MONO} label="⚡ PRE-MARKET MOVERS" storeKey="mon_premkt" defaultOpen={true}>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                {preMktMovers.slice(0, 8).map(m => (
                  <div key={m.sym} style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.accent }}>{m.sym}</div>
                    <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: m.chg >= 0 ? C.green : C.red }}>{m.chg >= 0 ? "+" : ""}{m.chg.toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            </MonitorSection>
          )}
        </>
      )}

      {/* ── MORE — supplementary widgets, same "hide, don't delete"       */}
      {/* precedent already used throughout this app's nav history (see   */}
      {/* SubNavBar.jsx) — collapsed accordions, nothing removed.         */}
      {dashTab === "more" && (
        <>
          <div style={{ marginBottom: 10 }}>
            <PortfolioRiskCard C={C} MONO={MONO} SANS={SANS} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <TradingLessonCard C={C} MONO={MONO} SANS={SANS} />
          </div>

          <MonitorSection C={C} MONO={MONO} label="🕌 PRAYER TIMES" storeKey="mon_prayer" defaultOpen={false}>
            <MonitorAthan C={C} MONO={MONO} SANS={SANS} />
          </MonitorSection>

          <MonitorSection C={C} MONO={MONO} label="🚦 MARKET MODE & FLOW" storeKey="mon_mode" defaultOpen={false}>
            <RiskTrafficLight C={C} MONO={MONO} SANS={SANS} macroData={macroData} />
            <SpyVolumeWidget C={C} MONO={MONO} SANS={SANS} macroData={macroData} />
          </MonitorSection>

          <MonitorSection C={C} MONO={MONO} label="🔔 PRIORITY ALERTS" storeKey="mon_alerts" defaultOpen={false}>
            <PriorityAlertsCard C={C} MONO={MONO} SANS={SANS} alerts={combinedAlerts} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab} />
          </MonitorSection>

          {tiltEnabled && (
            <MonitorSection C={C} MONO={MONO} label="😤 TILT" storeKey="mon_tilt" defaultOpen={false}>
              <div onClick={() => tiltLocked && setTiltLocked(false)} style={{ cursor: "pointer", fontFamily: MONO, fontSize: 13, fontWeight: 800, color: tiltLocked ? C.red : tiltStreak >= 2 ? C.amber : C.green }}>
                {tiltLocked ? "🔒 LOCKED — click to override" : tiltStreak === 0 ? "✅ 0 consecutive losses today" : `⚠ ${tiltStreak}/3 consecutive losses`}
              </div>
            </MonitorSection>
          )}
        </>
      )}
    </>
  );
}
