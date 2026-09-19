import { useEffect, useState, useMemo } from "react";
import {
  Row, Badge, TradePlanContent, rankArrow, VELOCITY_COLOR, DetailDrawer,
} from "./Tournament500Panel.jsx";
import WhatChangedStrip from "./WhatChangedStrip.jsx";

// PrimeTab.jsx (2026-09-17, "AI Trade Desk — PRIME" master prompt) — a
// real AGGREGATOR, never a second engine. Per the prompt's own explicit
// audit-first requirement (section 20), every piece below reuses an
// already-real, already-shipped source:
//   - Market regime / SPY / QQQ / IWM / VIX / breadth / 10Y: the same
//     real quote/regime/breadth endpoints FedWatchTab.jsx and
//     BreadthTab.jsx already use.
//   - Top 5 Elite / Early Discovery / Tournament Top 25: the SAME real
//     board object from GET /api/market/tournament (tournament-engine.js)
//     — one fetch, three derived views, never three separate scans.
//   - Selected Trade Plan: the SAME real GET /api/market/tournament/detail
//     + TradePlanContent (Tournament500Panel.jsx) already renders in its
//     own modal drawer — reused here inline, not duplicated.
//   - Position sizing: the SAME real GET /api/quick-trade/precheck
//     (quick-trade-service.js's real account-based sizeByRisk) already
//     used by Quick Trade.
//   - What Changed: the SAME real WhatChangedStrip component, unchanged.
//   - Risk Guardrails: the SAME real preTradeCheck gate (daily/weekly/
//     drawdown breakers that actually BLOCK new orders, not just display
//     a warning) plus GET /api/alpaca/positions for real exposure/largest
//     position — both already-shipped, real endpoints.
// No new scoring, risk, or lifecycle logic is declared anywhere in this
// file — it only arranges and displays what already exists.

const BOARD_POLL_MS = 45_000;
const REGIME_POLL_MS = 5 * 60_000;
const RISK_POLL_MS = 60_000;
const DEFAULT_RISK_PCT = 1; // same real platform-wide default Quick Trade's own risk slider defaults to

function money(v) { return Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : "—"; }
function pct1(v) { return Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}%` : "—"; }

const REGIME_LABEL = { RISK_ON: "RISK-ON", SELECTIVE_RISK_ON: "SELECTIVE RISK-ON", NEUTRAL: "NEUTRAL", RISK_OFF: "RISK-OFF", CRISIS: "CRISIS" };
const REGIME_COLOR = { RISK_ON: "green", SELECTIVE_RISK_ON: "green", NEUTRAL: "textDim", RISK_OFF: "red", CRISIS: "red" };

// A. MARKET REGIME BAR — real SPY/QQQ/IWM/VIX quotes (monitor-extras.js's
// live-quote route), real 10Y yield (fed-watch's own /api/market/us10y),
// real breadth % (the same /api/market/breadth BreadthTab.jsx uses), and
// the real canonical regime label carried on the tournament board itself
// (marketRegime — computed by market-regime-engine.js, the one canonical
// classifier this whole platform already shares).
function RegimeBar({ regimeLabel, C, MONO, SANS }) {
  const [quotes, setQuotes] = useState(null);
  const [y10, setY10] = useState(null);
  const [breadth, setBreadth] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/market/live-quote?symbols=SPY,QQQ,IWM,%5EVIX").then((r) => r.json()).then((d) => { if (alive && d?.ok) setQuotes(d.quotes); }).catch(() => {});
      fetch("/api/market/us10y").then((r) => r.json()).then((d) => { if (alive && d?.ok) setY10(d); }).catch(() => {});
      fetch("/api/market/breadth").then((r) => r.json()).then((d) => { if (alive && d?.summary) setBreadth(d.summary); }).catch(() => {});
    };
    load();
    const iv = setInterval(load, REGIME_POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  // Real field shape from GET /api/market/live-quote (monitor-extras.js's
  // fetchChartQuote): {sym, price, chg} — NOT {symbol, changesPercentage}.
  const qFor = (sym) => quotes?.find((q) => q.sym === sym) || null;
  const spy = qFor("SPY"), qqq = qFor("QQQ"), iwm = qFor("IWM"), vix = qFor("^VIX");

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 16px", marginBottom: 12 }}>
      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, color: C.textDim, letterSpacing: "0.04em" }}>REGIME</span>
      <Badge text={REGIME_LABEL[regimeLabel] || regimeLabel || "UNAVAILABLE"} color={REGIME_COLOR[regimeLabel] || "textDim"} C={C} MONO={MONO} />
      {[["SPY", spy], ["QQQ", qqq], ["IWM", iwm]].map(([label, q]) => (
        <span key={label} style={{ fontFamily: MONO, fontSize: 11.5, color: C.text }}>
          {label} <span style={{ color: (q?.chg || 0) >= 0 ? C.green : C.red, fontWeight: 700 }}>{q ? pct1(q.chg) : "—"}</span>
        </span>
      ))}
      <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.text }}>VIX <span style={{ fontWeight: 700 }}>{vix ? vix.price?.toFixed(1) : "—"}</span></span>
      <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.text }}>10Y <span style={{ fontWeight: 700 }}>{Number.isFinite(y10?.value) ? `${y10.value.toFixed(2)}%` : "—"}</span></span>
      <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.text }}>
        Breadth <span style={{ fontWeight: 700 }}>{Number.isFinite(breadth?.above50Pct) ? `${Math.round(breadth.above50Pct)}%` : "—"}</span>
      </span>
    </div>
  );
}

// B. TOP 5 ELITE — the real top 5 rows of the SAME tournament board
// (canonical opportunityScore/riskScore/rankChange/velocityLabel/
// signalState), never a second ranking.
function TopEliteCard({ row, onSelect, C, MONO, SANS }) {
  const reasons = (row.positiveContributors || []).slice(0, 2);
  return (
    <div onClick={() => onSelect(row.symbol)} className="tourn-chip" style={{ cursor: "pointer", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, color: C.text }}>#{row.rank} {row.symbol}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: VELOCITY_COLOR[row.velocityLabel] ? C[VELOCITY_COLOR[row.velocityLabel]] : C.textDim }}>
          {rankArrow(row.rankChange)} {row.velocityLabel}
        </span>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 4, fontFamily: MONO, fontSize: 11.5 }}>
        <span style={{ color: C.textDim }}>Opp <b style={{ color: C.text }}>{Math.round(row.opportunityScore)}</b></span>
        {/* Real valuation (2026-09-17 follow-up, "Top Opportunities" +
            valuation integration) — the SAME canonical valuation-engine.js
            profile tournament-engine.js's Top-25 enrichment computes,
            shown as a real, separate input next to Opportunity/Risk — per
            the master prompt's own rule, never merged into one number.
            Honestly omitted (not zeroed) until this symbol's been enriched. */}
        {Number.isFinite(row.valuation?.valuationScore) && (
          <span style={{ color: C.textDim }}>Val <b style={{ color: C.text }}>{Math.round(row.valuation.valuationScore)}</b></span>
        )}
        <span style={{ color: C.textDim }}>Risk <b style={{ color: C.text }}>{Math.round(row.riskScore)}</b></span>
        <Badge text={row.signalState === "ENTER_NOW" ? "ENTER NOW" : row.signalState || "—"} color={row.signalState === "ENTER_NOW" ? "green" : "textDim"} C={C} MONO={MONO} />
      </div>
      {row.valuation?.valuationLevel && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 3, letterSpacing: "0.02em" }}>
          {row.valuation.valuationLevel}
          {row.valuation.revenueTrend ? ` · REVENUE ${row.valuation.revenueTrend}` : ""}
          {Number.isFinite(row.valuation.epsRevision30D) ? ` · EPS REV ${row.valuation.epsRevision30D >= 0 ? "↑" : "↓"}` : ""}
        </div>
      )}
      {reasons.length > 0 && (
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, marginTop: 4 }}>{reasons.join(" + ")}</div>
      )}
    </div>
  );
}

// C. EARLY DISCOVERY — the real isEarlyDiscovery picks tournament-engine.js
// already reserves 5 real Top-25 slots for (pickEarlyDiscoveryChallengers,
// reusing opportunity-timeline-store.js's real edge velocity) — filtered
// out of the SAME board fetch, not a second selection pass. Interesting
// early setup, explicitly NOT an entry signal (section 4's own rule).
function EarlyDiscoveryRow({ row, onSelect, C, MONO, SANS }) {
  return (
    <div onClick={() => onSelect(row.symbol)} className="tourn-chip" style={{ cursor: "pointer", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>🌱 {row.symbol}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.green }}>#{row.rank} {rankArrow(row.rankChange)}</span>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: 2 }}>
        Score {Number.isFinite(row.previousOpportunityScore) ? Math.round(row.previousOpportunityScore) : "—"} → {Math.round(row.opportunityScore)} · {row.velocityLabel}
      </div>
      {(row.positiveContributors || [])[0] && <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim, marginTop: 2 }}>{row.positiveContributors[0]}</div>}
    </div>
  );
}

// E. SELECTED TRADE PLAN — reuses the SAME real TradePlanContent
// (Tournament500Panel.jsx) rendered inline instead of in a modal, plus a
// real position-size read (GET /api/quick-trade/precheck — the SAME
// account-based sizeByRisk Quick Trade's own order panel uses; never
// sized off a confidence score, per section 14's explicit rule).
function SelectedTradePlan({ symbol, C, MONO, SANS }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [sizing, setSizing] = useState(null);

  useEffect(() => {
    if (!symbol) return;
    let alive = true;
    setData(null); setError(null); setSizing(null);
    fetch(`/api/market/tournament/detail?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json()).then((d) => {
      if (!alive) return;
      if (d?.ok === false) { setError(d.error || "unavailable"); return; }
      setData(d);
      if (Number.isFinite(d.entryZone) && Number.isFinite(d.stop)) {
        const params = new URLSearchParams({ symbol, riskPct: String(DEFAULT_RISK_PCT), entry: String(d.entryZone), stop: String(d.stop), side: "long" });
        fetch(`/api/quick-trade/precheck?${params}`).then((r) => r.json()).then((sd) => { if (alive && sd?.ok) setSizing(sd); }).catch(() => {});
      }
    }).catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [symbol]);

  if (!symbol) return (
    <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, padding: 14 }}>Select a stock from Top 5, Early Discovery, or the Tournament table to see its real trade plan.</div>
  );

  const sizingBlock = sizing?.sizing ? (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: C.textDim, letterSpacing: "0.06em", marginBottom: 8 }}>POSITION SIZE (real, {DEFAULT_RISK_PCT}% account risk)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[["Suggested Shares", sizing.sizing.qty], ["Dollar Risk", money(sizing.sizing.dollarRisk)], ["Position Value", money(sizing.sizing.positionValue)], ["Open Risk (acct)", Number.isFinite(sizing.openRiskPct) ? `${sizing.openRiskPct.toFixed(1)}%` : "—"]].map(([label, v]) => (
          <div key={label} style={{ background: `${C.border}25`, borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginBottom: 2 }}>{label}</div>
            <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.text }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  ) : sizing && !sizing.ok ? (
    <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.amber, marginTop: 14 }}>Position sizing unavailable: {sizing.reason || "real account/risk-gate data not ready."}</div>
  ) : null;

  return <TradePlanContent data={data} error={error} extra={sizingBlock} C={C} MONO={MONO} SANS={SANS} />;
}

// G. RISK GUARDRAILS — the SAME real preTradeCheck gate (daily/weekly/
// drawdown breakers that actually block new orders server-side, not a
// display-only warning — quick-trade-service.js) plus GET
// /api/alpaca/positions for real exposure/largest-position. Sector
// concentration/correlated exposure are honestly omitted — real
// positions carry no sector field in this codebase's Alpaca adapter, and
// this file doesn't invent one.
function RiskGuardrailsPanel({ C, MONO, SANS }) {
  const [gate, setGate] = useState(null);
  const [positions, setPositions] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/quick-trade/precheck").then((r) => r.json()).then((d) => { if (alive) setGate(d); }).catch(() => {});
      fetch("/api/alpaca/positions").then((r) => r.json()).then((d) => { if (alive && d?.ok) setPositions(d.positions || d.rows || []); }).catch(() => {});
    };
    load();
    const iv = setInterval(load, RISK_POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  if (!gate) return <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim, padding: 14 }}>Loading real risk guardrails…</div>;
  if (!gate.ok) return (
    <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.red, padding: 14, background: `${C.red}12`, border: `1px solid ${C.red}44`, borderRadius: 10 }}>
      🔒 NEW TRADE ENTRY DISABLED — {gate.reason}
    </div>
  );

  const dailyPl = Number.isFinite(gate.account?.equity) && Number.isFinite(gate.account?.lastEquity) ? gate.account.equity - gate.account.lastEquity : null;
  const list = Array.isArray(positions) ? positions : [];
  const exposure = list.reduce((sum, p) => sum + Math.abs(Number(p.marketValue) || 0), 0);
  const exposurePct = Number.isFinite(gate.account?.equity) && gate.account.equity > 0 ? (exposure / gate.account.equity) * 100 : null;
  const largest = list.slice().sort((a, b) => Math.abs(b.marketValue || 0) - Math.abs(a.marketValue || 0))[0] || null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Badge text="TRADING OPEN" color="green" C={C} MONO={MONO} />
        <span style={{ fontFamily: SANS, fontSize: 10.5, color: C.textDim }}>{gate.positionCount} open position{gate.positionCount === 1 ? "" : "s"}</span>
      </div>
      {[
        ["Daily P&L", Number.isFinite(dailyPl) ? money(dailyPl) : "—", Number.isFinite(dailyPl) ? (dailyPl >= 0 ? "green" : "red") : "text"],
        ["Open Risk", Number.isFinite(gate.openRiskPct) ? `${gate.openRiskPct.toFixed(1)}%` : "—", "text"],
        ["Portfolio Exposure", Number.isFinite(exposurePct) ? `${exposurePct.toFixed(0)}%` : "—", "text"],
        ["Largest Position", largest ? `${largest.symbol} (${money(Math.abs(largest.marketValue))})` : "none", "text"],
      ].map(([label, v, color]) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 12 }}>
          <span style={{ color: C.textDim }}>{label}</span>
          <span style={{ fontFamily: MONO, fontWeight: 800, color: C[color] || C.text }}>{v}</span>
        </div>
      ))}
      <div style={{ fontFamily: SANS, fontSize: 10, color: C.textDim, marginTop: 4 }}>Sector concentration/correlated exposure: not available from the real positions feed yet.</div>
    </div>
  );
}

export default function PrimeTab({ setActiveTab, C, MONO, SANS }) {
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showChallengers, setShowChallengers] = useState(false);
  // Real deep-dive popup (2026-09-19, "click each stock and get a
  // summary/deep dive — we did have this option in 500 tournaments") —
  // reuses the SAME DetailDrawer modal the standalone Tournament500Panel
  // page already opens on row click, rather than only updating the
  // below-the-fold inline "Selected Trade" panel (which has no click
  // affordance on this screen and is easy to miss).
  const [drawerSymbol, setDrawerSymbol] = useState(null);
  const openDetail = (symbol) => { setSelected(symbol); setDrawerSymbol(symbol); };

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/market/tournament").then((r) => r.json()).then((d) => {
        if (!alive) return;
        if (d?.ok === false) { setError(d.error || "unavailable"); return; }
        setBoard(d);
        setError(null);
      }).catch((err) => { if (alive) setError(err.message); });
    };
    load();
    const iv = setInterval(load, BOARD_POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const top5 = useMemo(() => (board?.top25 || []).filter((r) => !r.isEarlyDiscovery).slice(0, 5), [board]);
  const earlyDiscovery = useMemo(() => (board?.top25 || []).filter((r) => r.isEarlyDiscovery).slice(0, 5), [board]);
  const top25 = board?.top25 || [];

  useEffect(() => { if (!selected && top5.length) setSelected(top5[0].symbol); }, [top5, selected]);

  if (error) return <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.red, padding: 20 }}>⚠️ {error}</div>;
  if (!board) return <div style={{ fontFamily: SANS, fontSize: 13, color: C.textDim, padding: 24, textAlign: "center" }}>Loading AI Trade Desk — PRIME…</div>;

  return (
    <div style={{ padding: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: C.text, marginBottom: 10, letterSpacing: "0.01em" }}>🎯 AI TRADE DESK — PRIME</div>

      {/* A. MARKET REGIME BAR */}
      <RegimeBar regimeLabel={board.marketRegime} C={C} MONO={MONO} SANS={SANS} />

      {/* B + C. TOP 5 ELITE | EARLY DISCOVERY */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginBottom: 8 }}>🔥 TOP 5 ELITE</div>
          {top5.length ? top5.map((r) => <TopEliteCard key={r.symbol} row={r} onSelect={openDetail} C={C} MONO={MONO} SANS={SANS} />)
            : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>No real qualifying candidates yet.</div>}
        </div>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginBottom: 8 }}>🌱 EARLY DISCOVERY</div>
          {earlyDiscovery.length ? earlyDiscovery.map((r) => <EarlyDiscoveryRow key={r.symbol} row={r} onSelect={openDetail} C={C} MONO={MONO} SANS={SANS} />)
            : <div style={{ fontFamily: SANS, fontSize: 12, color: C.textDim }}>No real accelerating candidates right now — not enough rank/score history yet or none qualify.</div>}
        </div>
      </div>

      {/* D. 500-STOCK TOURNAMENT — Top 25 (same real board, real Row).
          "VIEW ALL 500" used to navigate to the now-removed standalone
          tournament tab (2026-09-17, "delete 500 tournament because will
          be duplicate") — replaced with an inline expand of the SAME
          real board.challengers (#26-35) already computed server-side,
          never a second screen. */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em" }}>500-STOCK TOURNAMENT — TOP 25 ({board.scanning} scanning)</span>
          {board.challengers?.length > 0 && (
            <button onClick={() => setShowChallengers((v) => !v)} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: C.accent, fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "4px 10px", cursor: "pointer" }}>
              {showChallengers ? "HIDE CHALLENGERS ▲" : `NEXT CHALLENGERS #${board.top25Count + 1}–#${board.top25Count + board.challengers.length} ▼`}
            </button>
          )}
        </div>
        <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: C.card }}>
                {["RANK", "TICKER", "PRICE", "CHG%", "OPP", "RISK", "VAL", "TIER", "STATE", "MOVE", "VELOCITY"].map((h) => (
                  <th key={h} style={{ padding: "8px 10px", fontFamily: MONO, fontSize: 10, color: C.textDim, textAlign: h === "TICKER" ? "left" : "right", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top25.map((row) => <Row key={row.symbol} row={row} onSelect={openDetail} C={C} MONO={MONO} SANS={SANS} />)}
            </tbody>
          </table>
        </div>
        {showChallengers && board.challengers?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {board.challengers.map((c) => (
              <div key={c.symbol} onClick={() => openDetail(c.symbol)} className="tourn-chip" style={{ cursor: "pointer", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", fontFamily: MONO, fontSize: 11 }}>
                <b style={{ color: C.text }}>#{c.rank} {c.symbol}</b>{" "}
                <span style={{ color: VELOCITY_COLOR[c.velocityLabel] ? C[VELOCITY_COLOR[c.velocityLabel]] : C.textDim }}>{rankArrow(c.rankChange)}</span>{" "}
                <span style={{ color: C.textDim }}>Score {Math.round(c.opportunityScore)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* E + G. SELECTED TRADE PLAN | RISK GUARDRAILS */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, maxHeight: 560, overflowY: "auto" }}>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginBottom: 10 }}>SELECTED TRADE{selected ? ` — ${selected}` : ""}</div>
          <SelectedTradePlan symbol={selected} C={C} MONO={MONO} SANS={SANS} />
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.textDim, letterSpacing: "0.05em", marginBottom: 10 }}>TRADING RISK</div>
          <RiskGuardrailsPanel C={C} MONO={MONO} SANS={SANS} />
        </div>
      </div>

      {/* F. WHAT CHANGED — the real, existing strip, unchanged */}
      <WhatChangedStrip C={C} MONO={MONO} SANS={SANS} />

      {/* Real deep-dive popup — same DetailDrawer modal the standalone
          Tournament500Panel page already opens, reused here (never a
          second implementation) so a click anywhere above shows the full
          summary/score-breakdown/trade-structure immediately instead of
          only updating the below-the-fold SELECTED TRADE panel. */}
      {drawerSymbol && <DetailDrawer symbol={drawerSymbol} onClose={() => setDrawerSymbol(null)} C={C} MONO={MONO} SANS={SANS} />}
    </div>
  );
}
