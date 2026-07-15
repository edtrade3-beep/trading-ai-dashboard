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

// ── Shared card shell for the new 3-row grid ──────────────────────────────
function Card({ C, title, children, style }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", ...style }}>
      {title && <div style={{ fontFamily: "inherit", fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 10 }}>{title}</div>}
      {children}
    </div>
  );
}

// ── Row 1: Market Regime gauge (computeRegime + the existing 6-state playbook) ──
function MarketRegimeCard({ C, MONO, SANS, macroData, distData }) {
  const spy = (macroData || []).find(m => m.symbol === "SPY");
  const qqq = (macroData || []).find(m => m.symbol === "QQQ");
  const vix = distData?.vix || 0;
  const spyChg = Number(spy?.changesPercentage || 0);
  const qqqChg = Number(qqq?.changesPercentage || 0);
  const loaded = !!spy;
  const regime = computeRegime(macroData);
  let regLabel, regColor, playbook;
  if (!loaded) { regLabel = "LOADING…"; regColor = C.textDim; playbook = "Waiting for market data…"; }
  else if (vix > 30 || spyChg < -1.5) { regLabel = "RISK OFF"; regColor = C.red; playbook = "Reduce size, cash or shorts only."; }
  else if (vix < 16 && spyChg > 0.3 && qqqChg > 0.3) { regLabel = "RISK ON"; regColor = C.green; playbook = "Full size on A+ setups, let winners run."; }
  else if (Math.abs(spyChg) < 0.3 && vix < 22) { regLabel = "CHOP"; regColor = C.amber; playbook = "Reduce size, take profits faster."; }
  else if (spyChg > 0.5) { regLabel = "CAUTIOUS BULL"; regColor = C.greenLight; playbook = "Normal size on confirmed setups."; }
  else { regLabel = "DEFENSIVE"; regColor = C.amber; playbook = "Smaller size, favor defensive sectors."; }
  return (
    <Card C={C} title="MARKET REGIME">
      <RadialGauge C={C} MONO={MONO} value={regime.score} label={regLabel} sublabel="regime score" color={regColor} />
      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 8, textAlign: "center" }}>{playbook}</div>
    </Card>
  );
}

// ── Row 1: AI Market Summary — reuses the same rule-based factor scoring ──
// already used for the (kept, collapsed-by-default) Next Day Outlook card.
// Deliberately NOT a live LLM call: that would add cost/latency/a Telegram
// dependency to something that should be instant and free on every load.
function AiMarketSummaryCard({ C, MONO, SANS, factors, bias, biasColor }) {
  return (
    <Card C={C} title="AI MARKET SUMMARY">
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 900, color: biasColor, marginBottom: 8 }}>{bias}</div>
      <div style={{ flex: 1 }}>
        {factors.slice(0, 5).map((f, i) => (
          <div key={i} style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, padding: "3px 0", lineHeight: 1.4 }}>{f}</div>
        ))}
        {!factors.length && <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>Waiting for market data…</div>}
      </div>
    </Card>
  );
}

// ── Row 1: Today's Score — same A+ score as the Top Opportunity card /  ──
// AI Copilot Insights panel (single fetch, shared via the onScore callback
// below — not a second independent scan).
function TodaysScoreCard({ C, MONO, aplusScore, aplusSymbol }) {
  return (
    <Card C={C} title="TODAY'S SCORE">
      <RadialGauge C={C} MONO={MONO} value={aplusScore ?? 0} label={aplusSymbol ? `${aplusSymbol} SETUP` : "SCANNING…"} sublabel="opportunity score" color={C.accent} />
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
    <Card C={C} title="WATCHLIST" style={{ flex: 1 }}>
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
    <Card C={C} title={`CHART — ${symbol}`} style={{ flex: 2, minWidth: 0 }}>
      {data ? <TrendChart data={data} C={C} MONO={MONO} SANS={SANS} height={340} />
        : <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, padding: 40, textAlign: "center" }}>Loading chart…</div>}
    </Card>
  );
}

// ── Row 2: AI Copilot Insights — best setup (TopOpportunityCard, shared ──
// fetch with Today's Score via onScore) + watchlist breadth donut (from data
// already in props, no new fetch) + today's rotating coach mantra.
function CopilotInsightsCard({ C, MONO, SANS, macroData, watchlistData, setActiveTab, setTerminalSymbol, onScore }) {
  const wl = (watchlistData || []).filter(q => q.symbol && Number(q.price) > 0);
  const adv = wl.filter(q => Number(q.changesPercentage || 0) > 0).length;
  const dec = wl.length - adv;
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const mantra = COACH_LESSONS[dayOfYear % COACH_LESSONS.length]?.mantra;
  return (
    <Card C={C} title="AI COPILOT INSIGHTS" style={{ flex: 1 }}>
      <TopOpportunityCard C={C} MONO={MONO} SANS={SANS} macroData={macroData} setActiveTab={setActiveTab} setTerminalSymbol={setTerminalSymbol} onScore={onScore} />
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

export default function DashboardTab({
  C, MONO, SANS, watchlistData, macroData, distData, fearGreedData, sigData, sigFilter,
  newsSentiment, socialSentiment, flowBias, eventCountdowns, preMktMovers, combinedAlerts,
  tiltEnabled, tiltLocked, tiltStreak,
  setTerminalSymbol, setScanResults, setActiveTab, setScanExpanded, loadDeepDive, loadDeepSocial,
  setTiltLocked, setSigLoading, setSigData, fetchFearGreed, setDistData, setFuturesData, setPreMktMovers,
}) {
  const [aplusScore, setAplusScore] = useState(null);
  const [aplusSymbol, setAplusSymbol] = useState(null);
  const onScore = (row) => { setAplusScore(row ? row._aplus.score : null); setAplusSymbol(row ? row.symbol : null); };

  // Same next-day-bias factor scoring used by the (now collapsed, kept for
  // detail) Next Day Outlook card — computed once, shared by the new AI
  // Market Summary card above.
  const spy = (macroData || []).find(m => m.symbol === "SPY") || (watchlistData || []).find(w => w.symbol === "SPY");
  const qqq = (macroData || []).find(m => m.symbol === "QQQ") || (watchlistData || []).find(w => w.symbol === "QQQ");
  const spyChg = Number(spy?.changesPercentage || 0);
  const qqqChg = Number(qqq?.changesPercentage || 0);
  const spyPx = Number(spy?.price || 0);
  const ma50 = Number(spy?.priceAvg50 || 0);
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
  if (ma50 > 0 && spyPx > ma50) { score += 15; factors.push("✅ SPY above 50D MA"); }
  else if (ma50 > 0) { score -= 15; factors.push("🔴 SPY below 50D MA"); }
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

  return (
    <>
      {/* ── MISSION CONTROL — the AI already runs on a schedule and already ── */}
      {/* has real risk/opportunity data; this is the first on-screen home    */}
      {/* for it instead of Telegram-only or a hidden chat bubble.            */}
      <div style={{ marginBottom: 10 }}>
        <AskAiBar C={C} MONO={MONO} SANS={SANS} />
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap", alignItems: "stretch" }}>
        <div style={{ flex: 2, minWidth: 340 }}>
          <AiMorningBriefCard C={C} MONO={MONO} SANS={SANS} />
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <PortfolioRiskCard C={C} MONO={MONO} SANS={SANS} />
        </div>
      </div>

      {/* ── ROW 1 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginBottom: 10 }}>
        <MarketRegimeCard C={C} MONO={MONO} SANS={SANS} macroData={macroData} distData={distData} />
        <AiMarketSummaryCard C={C} MONO={MONO} SANS={SANS} factors={factors} bias={bias} biasColor={biasCol} />
        <TodaysScoreCard C={C} MONO={MONO} aplusScore={aplusScore} aplusSymbol={aplusSymbol} />
        <PortfolioSnapshotCard C={C} MONO={MONO} SANS={SANS} />
        <UpcomingEventsCard C={C} MONO={MONO} SANS={SANS} eventCountdowns={eventCountdowns} />
      </div>

      {/* ── ROW 2 ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap", alignItems: "stretch" }}>
        <WatchlistCard C={C} MONO={MONO} SANS={SANS} watchlistData={watchlistData} sigData={sigData} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab} />
        <DashboardChartCard C={C} MONO={MONO} SANS={SANS} symbol={aplusSymbol || "SPY"} />
        <CopilotInsightsCard C={C} MONO={MONO} SANS={SANS} macroData={macroData} watchlistData={watchlistData} setActiveTab={setActiveTab} setTerminalSymbol={setTerminalSymbol} onScore={onScore} />
      </div>

      {/* ── ROW 3 ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "stretch" }}>
        <div style={{ flex: 1, minWidth: 300 }}>
          <OpportunityQueueCard C={C} MONO={MONO} SANS={SANS} setTerminalSymbol={setTerminalSymbol} setActiveTab={setActiveTab} />
        </div>
        <div style={{ flex: 2, minWidth: 320 }}>
          <BestOpportunities C={C} MONO={MONO} SANS={SANS} macroData={macroData} setActiveTab={setActiveTab} />
        </div>
        <div style={{ flex: 1, minWidth: 280 }}>
          <Card C={C} title="MARKET NEWS" style={{ height: "100%" }}>
            <RegimeNewsPanel C={C} MONO={MONO} SANS={SANS} />
          </Card>
        </div>
      </div>

      {/* ── MORE — everything from the previous layout that doesn't have a ── */}
      {/* Row 1-3 home yet. Collapsed by default, not deleted — same         */}
      {/* "hide, don't delete" precedent already used throughout this app's  */}
      {/* nav history (see SubNavBar.jsx). */}
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: "0.1em", margin: "4px 0 8px" }}>MORE DETAIL</div>

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

      <MonitorSection C={C} MONO={MONO} label="🏛 CATALYSTS & EVENTS" storeKey="mon_catalysts" defaultOpen={false}>
        <FedInterpreter C={C} MONO={MONO} SANS={SANS} />
        <FedWatchWidget C={C} MONO={MONO} SANS={SANS} />
        <MacroEventsWidget C={C} MONO={MONO} SANS={SANS} />
      </MonitorSection>

      {preMktMovers.length > 0 && (
        <MonitorSection C={C} MONO={MONO} label="⚡ PRE-MARKET MOVERS" storeKey="mon_premkt" defaultOpen={false}>
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

      {tiltEnabled && (
        <MonitorSection C={C} MONO={MONO} label="😤 TILT" storeKey="mon_tilt" defaultOpen={false}>
          <div onClick={() => tiltLocked && setTiltLocked(false)} style={{ cursor: "pointer", fontFamily: MONO, fontSize: 13, fontWeight: 800, color: tiltLocked ? C.red : tiltStreak >= 2 ? C.amber : C.green }}>
            {tiltLocked ? "🔒 LOCKED — click to override" : tiltStreak === 0 ? "✅ 0 consecutive losses today" : `⚠ ${tiltStreak}/3 consecutive losses`}
          </div>
        </MonitorSection>
      )}
    </>
  );
}
